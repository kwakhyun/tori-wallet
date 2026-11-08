/**
 * ERC-20 토큰 잔액 및 가격 조회 서비스
 *
 * 조회 실패를 0으로 위장하지 않는다.
 *  - 잔액 조회 실패: balanceError = true, balance/balanceRaw = '—', value = NaN,
 *    usdValue = null (숫자로 해석하면 NaN이라 어디서도 0으로 보이지 않는다)
 *  - 가격 조회 실패/테스트넷: priceAvailable = false, usdValue = null
 *  - 시세 출처가 없는 토큰(사용자 토큰, 커스텀 네트워크 기본 자산): hasPriceSource = false
 * 기존 호출부 호환을 위해 price 숫자 필드는 유지하되 가격을 모르면 0이다.
 * 가치를 표시할 때는 반드시 usdValue(또는 priceAvailable)를 확인한다.
 *
 * 기본 체인 6개 외에 사용자가 추가한 커스텀 네트워크도 지원한다
 * (기본 자산 = 네트워크 통화, RPC = 등록된 RPC, 시세 없음).
 */

import { createPublicClient, http, formatUnits, isAddress } from 'viem';
import type { Chain, PublicClient } from 'viem';
import {
  mainnet,
  sepolia,
  polygon,
  arbitrum,
  optimism,
  base,
} from 'viem/chains';
import { tokenListService } from '@/realm/services';
import { createLogger } from '@/utils/logger';
import { formatDisplayAmount } from '@/utils/format';
import { chainClient } from './chainClient';
import { customNetworkRegistry } from './customNetworks';
import {
  isTestnetChainId,
  summarizeTokenTotal,
  tokenUsdValue,
  type TotalSummary,
} from './tokenValuation';

const logger = createLogger('TokenService');

export interface Token {
  symbol: string;
  name: string;
  address: `0x${string}` | 'native';
  decimals: number;
  /** 화면 표시용 수량 (잔액 조회 실패 시 '—') */
  balance: string;
  /**
   * 소수 단위 전체 정밀도 수량 문자열 (예: "1.234567890123456789").
   * 잔액 조회 실패 시 숫자가 아닌 '—' — 계산 전에 balanceError를 확인한다.
   */
  balanceRaw: string;
  /** USD 가격. 모르면 0 — priceAvailable 확인 */
  price: number;
  /** 24시간 변동률(%). 모르면 0 — priceAvailable 확인 */
  priceChange24h: number;
  /**
   * USD 가치 (과거 형식). 가격을 모르면 0, 잔액 조회 실패 시 NaN — usdValue를 사용한다.
   */
  value: number;
  logoUrl?: string;
  // ── 아래 필드는 getTokens가 항상 채운다 (직접 만든 객체 호환을 위해 선택 필드) ──
  /** USD 가치 (가격 또는 잔액을 모르면 null) */
  usdValue?: number | null;
  /** 가격을 알고 있는지 (테스트넷은 항상 false) */
  priceAvailable?: boolean;
  /** 잔액 조회가 실패했는지 */
  balanceError?: boolean;
  coingeckoId?: string;
  /** 사용자가 직접 추가한 토큰 */
  isCustom?: boolean;
  /** 테스트넷 자산 (실제 가치 없음) */
  isTestnet?: boolean;
  /**
   * 시세 출처(coingeckoId)가 있는지. false면 가격을 처음부터 알 수 없어
   * 합계에서 빠진다 (조회 실패와 구분). 테스트넷은 항상 false.
   */
  hasPriceSource?: boolean;
}

export interface TokenConfig {
  symbol: string;
  name: string;
  address: `0x${string}` | 'native';
  decimals: number;
  coingeckoId?: string;
  logoUrl?: string;
  isCustom?: boolean;
}

export interface TokenPrice {
  price: number;
  change24h: number;
}

export interface TokenMetadata {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
}

/** 모든 토큰의 잔액 조회가 실패했을 때 던지는 오류 */
export class TokenBalanceError extends Error {
  constructor(message = '잔액을 불러오지 못했습니다.') {
    super(message);
    this.name = 'TokenBalanceError';
  }
}

const ETH_LOGO =
  'https://assets.coingecko.com/coins/images/279/small/ethereum.png';

// 체인별 기본 토큰 설정
export const DEFAULT_TOKENS: Record<number, TokenConfig[]> = {
  // Ethereum 메인넷
  1: [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      address: 'native',
      decimals: 18,
      coingeckoId: 'ethereum',
      logoUrl: ETH_LOGO,
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      decimals: 6,
      coingeckoId: 'tether',
      logoUrl: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
      coingeckoId: 'usd-coin',
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    },
  ],
  // Sepolia 테스트넷 — 실제 가치가 없으므로 시세 ID를 두지 않는다.
  11155111: [
    {
      symbol: 'ETH',
      name: 'Sepolia ETH',
      address: 'native',
      decimals: 18,
      logoUrl: ETH_LOGO,
    },
  ],
  // Polygon
  137: [
    {
      symbol: 'MATIC',
      name: 'Polygon',
      address: 'native',
      decimals: 18,
      coingeckoId: 'matic-network',
      logoUrl:
        'https://assets.coingecko.com/coins/images/4713/small/polygon.png',
    },
  ],
  // Arbitrum
  42161: [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      address: 'native',
      decimals: 18,
      coingeckoId: 'ethereum',
      logoUrl: ETH_LOGO,
    },
  ],
  // Optimism
  10: [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      address: 'native',
      decimals: 18,
      coingeckoId: 'ethereum',
      logoUrl: ETH_LOGO,
    },
  ],
  // Base
  8453: [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      address: 'native',
      decimals: 18,
      coingeckoId: 'ethereum',
      logoUrl: ETH_LOGO,
    },
  ],
};

/** 실제 가치가 없는 테스트넷 체인 (테스트넷으로 등록한 커스텀 네트워크 포함) */
export function isTestnetChain(chainId: number): boolean {
  return isTestnetChainId(chainId) || CHAINS[chainId]?.testnet === true;
}

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// 체인 설정
const CHAINS: Record<number, Chain> = {
  1: mainnet,
  11155111: sepolia,
  137: polygon,
  42161: arbitrum,
  10: optimism,
  8453: base,
};

// RPC 엔드포인트
const RPC_URLS: Record<number, string> = {
  1: 'https://ethereum-rpc.publicnode.com',
  11155111: 'https://ethereum-sepolia-rpc.publicnode.com',
  137: 'https://polygon-bor-rpc.publicnode.com',
  42161: 'https://arbitrum-one-rpc.publicnode.com',
  10: 'https://optimism-rpc.publicnode.com',
  8453: 'https://base-rpc.publicnode.com',
};

const PRICE_TIMEOUT_MS = 8000;

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    return await fetch(url, controller ? { signal: controller.signal } : {});
  } finally {
    if (timer) clearTimeout(timer);
  }
}

class TokenService {
  private priceCache: Map<
    string,
    { price: number; change24h: number; timestamp: number }
  > = new Map();
  private priceCacheDuration = 60000; // 1분

  /**
   * 체인의 기본 토큰 목록 (토큰 관리 화면용)
   * 커스텀 네트워크는 네트워크 통화 하나(시세 출처 없음)를 기본 자산으로 둔다.
   */
  getDefaultTokens(chainId: number): TokenConfig[] {
    const defaults = DEFAULT_TOKENS[chainId];
    if (defaults) return defaults.map(config => ({ ...config }));
    const custom = customNetworkRegistry.get(chainId);
    if (!custom) return [];
    return [
      {
        symbol: custom.symbol,
        name: custom.name,
        address: 'native',
        decimals: 18,
      },
    ];
  }

  isTestnet(chainId: number): boolean {
    return isTestnetChain(chainId);
  }

  /** 기본 체인은 전용 RPC, 커스텀 네트워크는 chainClient(등록된 RPC)를 쓴다. */
  private getClient(chainId: number): PublicClient | null {
    const chain = CHAINS[chainId];
    const rpcUrl = RPC_URLS[chainId];
    if (chain && rpcUrl) {
      return createPublicClient({ chain, transport: http(rpcUrl) });
    }
    try {
      return chainClient.isSupportedChain(chainId)
        ? chainClient.getClient(chainId)
        : null;
    } catch (error) {
      logger.warn(`No RPC client for chain ${chainId}`, error);
      return null;
    }
  }

  /**
   * 표시할 토큰 설정 목록: 기본 토큰 + 보이는 사용자 토큰 - 숨긴 토큰
   * 로컬 DB를 읽지 못해도 기본 토큰은 보여 준다.
   */
  private async getTokenConfigs(chainId: number): Promise<TokenConfig[]> {
    const defaults = this.getDefaultTokens(chainId);
    let hidden = new Set<string>();
    let custom: TokenConfig[] = [];

    try {
      const [hiddenEntries, customEntries] = await Promise.all([
        tokenListService.getHiddenTokens(chainId),
        tokenListService.getCustomTokens(chainId),
      ]);
      hidden = new Set(
        (hiddenEntries || []).map(entry => entry.address.toLowerCase()),
      );
      custom = (customEntries || [])
        .filter(
          entry => !entry.isHidden && !entry.isSpam && isAddress(entry.address),
        )
        .map(entry => ({
          symbol: entry.symbol,
          name: entry.name,
          address: entry.address as `0x${string}`,
          decimals: entry.decimals,
          coingeckoId: entry.coingeckoId || undefined,
          logoUrl: entry.logoUrl || undefined,
          isCustom: true,
        }));
    } catch (error) {
      logger.warn('Failed to read token list preferences', error);
    }

    const merged: TokenConfig[] = [...defaults];
    for (const token of custom) {
      if (
        !merged.some(existing => sameAddress(existing.address, token.address))
      )
        merged.push(token);
    }

    // 네이티브 토큰은 숨길 수 없다 (가스비 확인용).
    return merged.filter(
      token =>
        token.address === 'native' || !hidden.has(token.address.toLowerCase()),
    );
  }

  /**
   * 토큰 목록 및 잔액 조회
   * 모든 토큰의 잔액 조회가 실패하면 TokenBalanceError를 던진다.
   */
  async getTokens(address: string, chainId: number): Promise<Token[]> {
    const tokenConfigs = await this.getTokenConfigs(chainId);
    if (tokenConfigs.length === 0) return [];

    const testnet = isTestnetChain(chainId);
    const client = this.getClient(chainId);

    const [prices, balances] = await Promise.all([
      testnet
        ? Promise.resolve({} as Record<string, TokenPrice>)
        : this.getPrices(
            tokenConfigs
              .map(t => t.coingeckoId)
              .filter((id): id is string => !!id),
          ),
      Promise.all(
        tokenConfigs.map(config =>
          this.readBalance(client, address as `0x${string}`, config),
        ),
      ),
    ]);

    if (balances.every(balance => balance === null)) {
      throw new TokenBalanceError();
    }

    return tokenConfigs.map((config, index) =>
      this.buildToken(config, balances[index], prices, testnet),
    );
  }

  private buildToken(
    config: TokenConfig,
    balance: string | null,
    prices: Record<string, TokenPrice>,
    testnet: boolean,
  ): Token {
    const hasPriceSource = !testnet && !!config.coingeckoId;
    const priceInfo = hasPriceSource
      ? prices[config.coingeckoId as string]
      : undefined;
    const priceAvailable = !!priceInfo;
    const balanceError = balance === null;
    const balanceNum = balanceError ? 0 : Number(balance);
    const usdValue =
      priceAvailable && !balanceError && Number.isFinite(balanceNum)
        ? balanceNum * priceInfo.price
        : null;

    return {
      symbol: config.symbol,
      name: config.name,
      address: config.address,
      decimals: config.decimals,
      balance: balanceError ? '—' : formatDisplayAmount(balance),
      // 실패를 '0'/0으로 위장하지 않는다 (Number('—') = NaN → 표시 '—').
      balanceRaw: balanceError ? '—' : balance,
      price: priceInfo?.price ?? 0,
      priceChange24h: priceInfo?.change24h ?? 0,
      value: balanceError ? Number.NaN : usdValue ?? 0,
      usdValue,
      priceAvailable,
      balanceError,
      hasPriceSource,
      logoUrl: config.logoUrl,
      coingeckoId: config.coingeckoId,
      isCustom: !!config.isCustom,
      isTestnet: testnet,
    };
  }

  /**
   * 토큰 잔액 조회 (실패 시 null)
   */
  private async readBalance(
    client: ReturnType<TokenService['getClient']>,
    walletAddress: `0x${string}`,
    token: TokenConfig,
  ): Promise<string | null> {
    if (!client) return null;
    try {
      if (token.address === 'native') {
        const balance = await client.getBalance({ address: walletAddress });
        return formatUnits(balance, token.decimals);
      }
      const balance = await client.readContract({
        address: token.address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [walletAddress],
      });
      return formatUnits(balance as bigint, token.decimals);
    } catch (error) {
      logger.warn(`Balance fetch failed for ${token.symbol}`, error);
      return null;
    }
  }

  /**
   * ERC-20 메타데이터를 체인에서 직접 읽는다 (사용자 토큰 추가용).
   * 컨트랙트가 아니거나 ERC-20 함수를 지원하지 않으면 오류를 던진다.
   */
  async getTokenMetadata(
    contractAddress: string,
    chainId: number,
  ): Promise<TokenMetadata> {
    if (!isAddress(contractAddress)) {
      throw new Error('올바른 컨트랙트 주소가 아닙니다.');
    }
    const client = this.getClient(chainId);
    if (!client) {
      throw new Error('지원하지 않는 네트워크입니다.');
    }
    const address = contractAddress as `0x${string}`;
    try {
      const [symbol, name, decimals] = await Promise.all([
        client.readContract({
          address,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }),
        client.readContract({ address, abi: ERC20_ABI, functionName: 'name' }),
        client.readContract({
          address,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }),
      ]);
      const decimalsNum = Number(decimals);
      if (
        typeof symbol !== 'string' ||
        !symbol.trim() ||
        !Number.isInteger(decimalsNum) ||
        decimalsNum < 0 ||
        decimalsNum > 36
      ) {
        throw new Error('invalid metadata');
      }
      return {
        address,
        symbol: symbol.trim().slice(0, 20),
        name: (typeof name === 'string' && name.trim()) || symbol.trim(),
        decimals: decimalsNum,
      };
    } catch (error) {
      logger.warn('Token metadata lookup failed', error);
      throw new Error(
        '이 네트워크에서 ERC-20 토큰 정보를 읽을 수 없습니다. 주소와 네트워크를 확인해주세요.',
      );
    }
  }

  /**
   * 단일 토큰 가격 조회 (테스트넷/실패 시 null)
   */
  async getPrice(
    coingeckoId: string | undefined,
    chainId: number,
  ): Promise<TokenPrice | null> {
    if (!coingeckoId || isTestnetChain(chainId)) return null;
    const prices = await this.getPrices([coingeckoId]);
    return prices[coingeckoId] ?? null;
  }

  /**
   * 토큰 가격 조회 (CoinGecko API)
   * 실패한 ID는 결과에서 빠진다 (0으로 채우지 않으며 캐시하지 않는다).
   */
  private async getPrices(
    coingeckoIds: string[],
  ): Promise<Record<string, TokenPrice>> {
    const result: Record<string, TokenPrice> = {};
    const idsToFetch: string[] = [];

    for (const id of coingeckoIds) {
      const cached = this.priceCache.get(id);
      if (cached && Date.now() - cached.timestamp < this.priceCacheDuration) {
        result[id] = { price: cached.price, change24h: cached.change24h };
      } else {
        idsToFetch.push(id);
      }
    }

    if (idsToFetch.length === 0) {
      return result;
    }

    try {
      const uniqueIds = [...new Set(idsToFetch)];
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${uniqueIds.join(
        ',',
      )}&vs_currencies=usd&include_24hr_change=true`;

      const response = await fetchWithTimeout(url, PRICE_TIMEOUT_MS);
      if (response && response.ok === false) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as Record<
        string,
        { usd?: number; usd_24h_change?: number }
      >;

      for (const id of uniqueIds) {
        const price = data?.[id]?.usd;
        if (typeof price !== 'number' || !Number.isFinite(price)) continue;
        const rawChange = data[id].usd_24h_change;
        const change24h =
          typeof rawChange === 'number' && Number.isFinite(rawChange)
            ? rawChange
            : 0;
        result[id] = { price, change24h };
        this.priceCache.set(id, { price, change24h, timestamp: Date.now() });
      }
    } catch (error) {
      logger.warn('Price fetch failed', error);
    }

    return result;
  }

  /**
   * 가치를 아는 토큰의 합 (모르는 토큰은 건너뛴다)
   * 화면에 총 자산을 표시할 때는 getDisplayTotal을 쓴다 — 아무것도 모르면 0이 아니라 null이다.
   */
  getTotalValue(tokens: Token[]): number {
    return tokens.reduce((sum, token) => sum + (tokenUsdValue(token) ?? 0), 0);
  }

  /**
   * 화면에 표시할 총 자산과 합계에서 빠진 자산 종류 (홈/포트폴리오 공통 규칙)
   * - 목록이 비었거나, 가치를 아는 토큰 없이 가치를 모르는 보유 토큰만 있으면 total = null
   */
  getDisplayTotal(tokens: Token[]): TotalSummary {
    return summarizeTokenTotal(tokens);
  }

  /**
   * 총 자산 가치를 확정할 수 있는지: 조회 실패로 빠진 보유 자산이 없을 때
   * (시세 출처가 없는 자산은 처음부터 합계 대상이 아니므로 확정을 막지 않는다)
   */
  isTotalComplete(tokens: Token[]): boolean {
    const summary = summarizeTokenTotal(tokens);
    return summary.total !== null && !summary.partial;
  }

  /** 토큰의 USD 가치 (모르면 null) */
  getUsdValue(token: Token): number | null {
    return tokenUsdValue(token);
  }

  /**
   * 캐시 클리어
   */
  clearCache() {
    this.priceCache.clear();
  }
}

export const tokenService = new TokenService();
