/**
 * 멀티 DEX 스왑 서비스 (가격 비교, 최적 경로 탐색)
 */

import { formatEther, formatUnits } from 'viem';
import { isSwapApiSupported } from './swapApiConfig';
import {
  swapService as baseSwapService,
  classifyPriceImpact,
  computePriceImpact,
  isNativeSwapToken,
  type PriceImpactInfo,
  type SwapPriceResult,
  type SwapQuote as BaseSwapQuote,
} from './swapService';

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const PRICE_FETCH_TIMEOUT_MS = 6000;

/** CoinGecko 자산 플랫폼 ID (ERC-20 계약 주소 시세 조회용) */
const COINGECKO_PLATFORMS: Record<number, string> = {
  1: 'ethereum',
  137: 'polygon-pos',
  42161: 'arbitrum-one',
  10: 'optimistic-ethereum',
  8453: 'base',
};

/** 체인별 네이티브 자산 CoinGecko ID (테스트넷은 시세 없음) */
const NATIVE_COINGECKO_IDS: Record<number, string> = {
  1: 'ethereum',
  137: 'matic-network',
  42161: 'ethereum',
  10: 'ethereum',
  8453: 'ethereum',
};

async function fetchJsonWithTimeout(url: string): Promise<unknown | null> {
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), PRICE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller?.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 체인별 네이티브 토큰 주소
export const NATIVE_TOKEN_ADDRESS =
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// WETH 주소 (체인별)
const WETH_ADDRESSES: Record<number, string> = {
  1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
  42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  10: '0x4200000000000000000000000000000000000006',
  8453: '0x4200000000000000000000000000000000000006',
};

// 체인별 스왑 가능 토큰 목록
export const SWAP_TOKENS: Record<number, SwapToken[]> = {
  1: [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      address: NATIVE_TOKEN_ADDRESS,
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
      isNative: true,
      coingeckoId: 'ethereum',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
      coingeckoId: 'usd-coin',
    },
    {
      symbol: 'USDT',
      name: 'Tether',
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
      coingeckoId: 'tether',
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      decimals: 18,
      logoUrl: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
      coingeckoId: 'weth',
    },
    {
      symbol: 'DAI',
      name: 'Dai',
      address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/9956/small/dai-multi-collateral-mcd.png',
      coingeckoId: 'dai',
    },
    {
      symbol: 'WBTC',
      name: 'Wrapped Bitcoin',
      address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      decimals: 8,
      logoUrl:
        'https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png',
      coingeckoId: 'wrapped-bitcoin',
    },
    {
      symbol: 'UNI',
      name: 'Uniswap',
      address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png',
      coingeckoId: 'uniswap',
    },
    {
      symbol: 'LINK',
      name: 'Chainlink',
      address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png',
      coingeckoId: 'chainlink',
    },
    {
      symbol: 'AAVE',
      name: 'Aave',
      address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
      decimals: 18,
      logoUrl: 'https://assets.coingecko.com/coins/images/12645/small/AAVE.png',
      coingeckoId: 'aave',
    },
    {
      symbol: 'MATIC',
      name: 'Polygon',
      address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/4713/small/polygon.png',
      coingeckoId: 'matic-network',
    },
  ],
  137: [
    {
      symbol: 'MATIC',
      name: 'Polygon',
      address: NATIVE_TOKEN_ADDRESS,
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/4713/small/polygon.png',
      isNative: true,
      coingeckoId: 'matic-network',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
      coingeckoId: 'usd-coin',
    },
    {
      symbol: 'USDT',
      name: 'Tether',
      address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
      coingeckoId: 'tether',
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      decimals: 18,
      logoUrl: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
      coingeckoId: 'weth',
    },
    {
      symbol: 'WMATIC',
      name: 'Wrapped Matic',
      address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/14073/small/matic.png',
      coingeckoId: 'wmatic',
    },
    {
      symbol: 'QUICK',
      name: 'QuickSwap',
      address: '0x831753DD7087CaC61aB5644b308642cc1c33Dc13',
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/13970/small/1_pTgHamA.png',
      coingeckoId: 'quickswap',
    },
  ],
  42161: [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      address: NATIVE_TOKEN_ADDRESS,
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
      isNative: true,
      coingeckoId: 'ethereum',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
      coingeckoId: 'usd-coin',
    },
    {
      symbol: 'USDT',
      name: 'Tether',
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
      coingeckoId: 'tether',
    },
    {
      symbol: 'ARB',
      name: 'Arbitrum',
      address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg',
      coingeckoId: 'arbitrum',
    },
    {
      symbol: 'GMX',
      name: 'GMX',
      address: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a',
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/18323/small/arbit.png',
      coingeckoId: 'gmx',
    },
    {
      symbol: 'MAGIC',
      name: 'Magic',
      address: '0x539bdE0d7Dbd336b79148AA742883198BBF60342',
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/18623/small/magic.png',
      coingeckoId: 'magic',
    },
  ],
  10: [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      address: NATIVE_TOKEN_ADDRESS,
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
      isNative: true,
      coingeckoId: 'ethereum',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
      coingeckoId: 'usd-coin',
    },
    {
      symbol: 'OP',
      name: 'Optimism',
      address: '0x4200000000000000000000000000000000000042',
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/25244/small/Optimism.png',
      coingeckoId: 'optimism',
    },
    {
      symbol: 'VELO',
      name: 'Velodrome',
      address: '0x3c8B650257cFb5f272f799F5e2b4e65093a11a05',
      decimals: 18,
      logoUrl: 'https://assets.coingecko.com/coins/images/25783/small/velo.png',
      coingeckoId: 'velodrome-finance',
    },
  ],
  8453: [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      address: NATIVE_TOKEN_ADDRESS,
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
      isNative: true,
      coingeckoId: 'ethereum',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
      coingeckoId: 'usd-coin',
    },
    {
      symbol: 'cbETH',
      name: 'Coinbase Wrapped Staked ETH',
      address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/27008/small/cbeth.png',
      coingeckoId: 'coinbase-wrapped-staked-eth',
    },
  ],
  // Sepolia 테스트넷 (Mock)
  11155111: [
    {
      symbol: 'ETH',
      name: 'Sepolia ETH',
      address: NATIVE_TOKEN_ADDRESS,
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
      isNative: true,
    },
  ],
};

export interface SwapToken {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoUrl?: string;
  balance?: string;
  balanceUsd?: string;
  isNative?: boolean;
  coingeckoId?: string;
  isCustom?: boolean;
}

export interface SwapQuote extends BaseSwapQuote {
  // 추가 정보
  estimatedGasUsd?: string;
  minimumReceived?: string;
  route?: SwapRoute[];
  /** 판매 토큰 USD 단가 (모르면 null) */
  sellPriceUsd?: number | null;
  /** 판매 수량의 USD 가치 (모르면 null) */
  sellValueUsd?: number | null;
  /** 네이티브 자산 USD 단가 (모르면 null) */
  nativePriceUsd?: number | null;
}

export interface SwapSource {
  name: string;
  proportion: string;
}

export interface SwapRoute {
  name: string;
  proportion: number;
  fromToken: string;
  toToken: string;
  hops: number;
}

export interface SwapParams {
  sellToken: SwapToken;
  buyToken: SwapToken;
  sellAmount: string;
  slippagePercentage?: number;
  takerAddress: string;
  excludedSources?: string[];
  includedSources?: string[];
  gasPrice?: string;
  skipValidation?: boolean;
}

export interface PriceComparison {
  source: string;
  buyAmount: string;
  rate: string;
  gasEstimate: string;
  savingsPercent?: string;
}

export interface TokenPrice {
  usd: number;
  usd24hChange?: number;
}

class EnhancedSwapService {
  private priceCache: Map<string, { price: TokenPrice; timestamp: number }> =
    new Map();
  private readonly PRICE_CACHE_TTL = 60000; // 1분

  /**
   * 스왑 견적 가져오기
   */
  async getQuote(
    params: SwapParams,
    chainId: number,
  ): Promise<SwapQuote | null> {
    if (!isSwapApiSupported(chainId)) {
      console.warn(`Swap not supported on chain ${chainId}`);
      return null;
    }

    try {
      const quote = await baseSwapService.getQuote(params, chainId);
      if (!quote) return null;

      // 추가 정보 계산
      const enhancedQuote = await this.enhanceQuote(quote, params, chainId);
      return enhancedQuote;
    } catch (error: unknown) {
      console.error('Failed to get swap quote:', error);
      throw error;
    }
  }

  /**
   * 견적에 추가 정보 붙이기 (가격 영향, USD 가스비, 경로)
   * 시세 조회 실패는 견적을 막지 않고 '알 수 없음'으로 남긴다.
   */
  private async enhanceQuote(
    quote: SwapQuote,
    params: SwapParams,
    chainId: number,
  ): Promise<SwapQuote> {
    // API v2가 실행 견적에 서명한 최소 수령량을 그대로 사용한다.
    const minimumReceived = BigInt(quote.minBuyAmount);

    const prices = await this.getUsdPrices(chainId, [
      params.sellToken,
      params.buyToken,
    ]);
    const nativePriceUsd = await this.getNativeUsdPrice(chainId);
    const sellPriceUsd = prices[params.sellToken.address.toLowerCase()] ?? null;
    const buyPriceUsd = prices[params.buyToken.address.toLowerCase()] ?? null;

    const buyAmount = formatUnits(
      BigInt(quote.buyAmount),
      params.buyToken.decimals,
    );
    const impact = computePriceImpact({
      sellAmount: params.sellAmount,
      sellPriceUsd,
      buyAmount,
      buyPriceUsd,
    });

    let estimatedGasUsd: string | undefined;
    if (nativePriceUsd !== null) {
      const gasCost = Number(
        formatEther(BigInt(quote.gas) * BigInt(quote.gasPrice)),
      );
      if (Number.isFinite(gasCost)) {
        estimatedGasUsd = (gasCost * nativePriceUsd).toFixed(2);
      }
    }

    const sellValue =
      sellPriceUsd !== null ? Number(params.sellAmount) * sellPriceUsd : null;

    return {
      ...quote,
      estimatedPriceImpact: impact === null ? '' : impact.toString(),
      minimumReceived: formatUnits(minimumReceived, params.buyToken.decimals),
      estimatedGasUsd,
      route: this.parseRoute(quote.sources),
      sellPriceUsd,
      sellValueUsd:
        sellValue !== null && Number.isFinite(sellValue) ? sellValue : null,
      nativePriceUsd,
    };
  }

  /**
   * 네이티브 자산 USD 시세 (테스트넷/조회 실패 시 null)
   */
  async getNativeUsdPrice(chainId: number): Promise<number | null> {
    const id = NATIVE_COINGECKO_IDS[chainId];
    if (!id) return null;
    const price = await this.getTokenPrice(id);
    return price && price.usd > 0 ? price.usd : null;
  }

  /**
   * 토큰들의 USD 시세 (소문자 주소 → 가격, 모르면 null)
   * 네이티브는 /simple/price, ERC-20은 /simple/token_price/{platform}을 쓴다.
   */
  async getUsdPrices(
    chainId: number,
    tokens: Pick<SwapToken, 'address' | 'isNative'>[],
  ): Promise<Record<string, number | null>> {
    const result: Record<string, number | null> = {};
    const contracts: string[] = [];
    let hasNative = false;

    for (const token of tokens) {
      const key = token.address.toLowerCase();
      if (isNativeSwapToken(token)) {
        hasNative = true;
        continue;
      }
      const cached = this.priceCache.get(`${chainId}:${key}`);
      if (cached && Date.now() - cached.timestamp < this.PRICE_CACHE_TTL) {
        result[key] = cached.price.usd > 0 ? cached.price.usd : null;
      } else {
        contracts.push(key);
      }
    }

    if (hasNative) {
      const native = await this.getNativeUsdPrice(chainId);
      for (const token of tokens) {
        if (isNativeSwapToken(token))
          result[token.address.toLowerCase()] = native;
      }
    }

    const platform = COINGECKO_PLATFORMS[chainId];
    if (contracts.length > 0 && platform) {
      const unique = [...new Set(contracts)];
      const data = (await fetchJsonWithTimeout(
        `${COINGECKO_API}/simple/token_price/${platform}?contract_addresses=${unique.join(
          ',',
        )}&vs_currencies=usd`,
      )) as Record<string, { usd?: number }> | null;
      for (const key of unique) {
        const usd = data?.[key]?.usd;
        if (typeof usd === 'number' && usd > 0) {
          result[key] = usd;
          this.priceCache.set(`${chainId}:${key}`, {
            price: { usd },
            timestamp: Date.now(),
          });
        } else {
          result[key] = null;
        }
      }
    }

    for (const token of tokens) {
      const key = token.address.toLowerCase();
      if (!(key in result)) result[key] = null;
    }
    return result;
  }

  /**
   * 스왑 경로 파싱
   */
  private parseRoute(sources: SwapSource[]): SwapRoute[] {
    return sources
      .filter(s => parseFloat(s.proportion) > 0)
      .map(s => ({
        name: s.name,
        proportion: parseFloat(s.proportion) * 100,
        fromToken: '',
        toToken: '',
        hops: 1,
      }))
      .sort((a, b) => b.proportion - a.proportion);
  }

  /**
   * 스왑 가격만 가져오기 (가스 계산 없이 빠름)
   */
  async getPrice(
    params: SwapParams,
    chainId: number,
  ): Promise<SwapPriceResult | null> {
    if (!isSwapApiSupported(chainId)) {
      return null;
    }
    return baseSwapService.getPrice(params, chainId);
  }

  /**
   * 토큰 가격 조회 (CoinGecko)
   */
  async getTokenPrice(coingeckoId: string): Promise<TokenPrice | null> {
    // 캐시 확인
    const cached = this.priceCache.get(coingeckoId);
    if (cached && Date.now() - cached.timestamp < this.PRICE_CACHE_TTL) {
      return cached.price;
    }

    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_24hr_change=true`,
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as Record<
        string,
        { usd: number; usd_24h_change?: number }
      >;
      const tokenData = data[coingeckoId];

      if (!tokenData) {
        return null;
      }

      const price: TokenPrice = {
        usd: tokenData.usd,
        usd24hChange: tokenData.usd_24h_change,
      };

      // 캐시 저장
      this.priceCache.set(coingeckoId, { price, timestamp: Date.now() });

      return price;
    } catch (error) {
      console.error('Failed to get token price:', error);
      return null;
    }
  }

  /**
   * 여러 토큰 가격 조회
   */
  async getTokenPrices(
    coingeckoIds: string[],
  ): Promise<Record<string, TokenPrice>> {
    const validIds = coingeckoIds.filter(id => id);
    if (validIds.length === 0) return {};

    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${validIds.join(
          ',',
        )}&vs_currencies=usd&include_24hr_change=true`,
      );

      if (!response.ok) {
        return {};
      }

      const data = (await response.json()) as Record<
        string,
        { usd: number; usd_24h_change?: number }
      >;

      const result: Record<string, TokenPrice> = {};
      for (const id of validIds) {
        if (data[id]) {
          result[id] = {
            usd: data[id].usd,
            usd24hChange: data[id].usd_24h_change,
          };
        }
      }

      return result;
    } catch (error) {
      console.error('Failed to get token prices:', error);
      return {};
    }
  }

  /**
   * 체인에서 사용 가능한 토큰 목록
   */
  getTokens(chainId: number): SwapToken[] {
    return SWAP_TOKENS[chainId] || [];
  }

  /**
   * 토큰 검색
   */
  searchTokens(chainId: number, query: string): SwapToken[] {
    const tokens = this.getTokens(chainId);
    const lowerQuery = query.toLowerCase();

    return tokens.filter(
      t =>
        t.symbol.toLowerCase().includes(lowerQuery) ||
        t.name.toLowerCase().includes(lowerQuery) ||
        t.address.toLowerCase() === lowerQuery,
    );
  }

  /**
   * 토큰 주소로 찾기
   */
  findTokenByAddress(chainId: number, address: string): SwapToken | undefined {
    const tokens = this.getTokens(chainId);
    return tokens.find(t => t.address.toLowerCase() === address.toLowerCase());
  }

  /**
   * 스왑 지원 여부 확인
   */
  isSwapSupported(chainId: number): boolean {
    return isSwapApiSupported(chainId);
  }

  /**
   * 토큰 승인 필요 여부 확인
   */
  needsApproval(sellToken: SwapToken): boolean {
    return !isNativeSwapToken(sellToken);
  }

  /**
   * 예상 수령량 포맷팅
   */
  formatBuyAmount(amount: string, _decimals: number = 18): string {
    const num = parseFloat(amount);
    if (isNaN(num) || num === 0) return '0';
    if (num < 0.0001) return '< 0.0001';
    if (num < 1) return num.toFixed(4);
    if (num < 1000) return num.toFixed(2);
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  /**
   * 가격 영향 계산 및 경고 레벨
   * 시세를 몰라 계산하지 못한 견적은 'unknown' (0%로 표시하지 않음)
   */
  calculatePriceImpact(
    quote: Pick<SwapQuote, 'estimatedPriceImpact'>,
  ): PriceImpactInfo {
    return classifyPriceImpact(quote.estimatedPriceImpact);
  }

  /**
   * 슬리피지 자동 계산
   */
  calculateAutoSlippage(priceImpact: number, volatility?: number): number {
    // 기본 슬리피지
    let slippage = 0.5;

    // 가격 영향이 크면 슬리피지 증가
    if (priceImpact > 5) {
      slippage = 3.0;
    } else if (priceImpact > 2) {
      slippage = 1.0;
    } else if (priceImpact > 0.5) {
      slippage = 0.5;
    }

    // 변동성이 높으면 추가
    if (volatility && volatility > 5) {
      slippage += 0.5;
    }

    return Math.min(slippage, 5.0); // 최대 5%
  }

  /**
   * WETH 주소 가져오기
   */
  getWethAddress(chainId: number): string | undefined {
    return WETH_ADDRESSES[chainId];
  }

  /**
   * 네이티브 토큰인지 확인
   */
  isNativeToken(tokenAddress: string): boolean {
    return tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
  }
}

export const enhancedSwapService = new EnhancedSwapService();
