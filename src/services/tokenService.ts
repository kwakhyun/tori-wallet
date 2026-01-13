/**
 * Tori Wallet - Token Service
 * ERC-20 토큰 잔액 조회 및 가격 정보
 */

import { createPublicClient, http, formatUnits } from 'viem';
import {
  mainnet,
  sepolia,
  polygon,
  arbitrum,
  optimism,
  base,
} from 'viem/chains';

export interface Token {
  symbol: string;
  name: string;
  address: `0x${string}` | 'native';
  decimals: number;
  balance: string;
  balanceRaw: string;
  price: number;
  priceChange24h: number;
  value: number;
  logoUrl?: string;
}

interface TokenConfig {
  symbol: string;
  name: string;
  address: `0x${string}` | 'native';
  decimals: number;
  coingeckoId: string;
  logoUrl?: string;
}

// 체인별 기본 토큰 설정
const DEFAULT_TOKENS: Record<number, TokenConfig[]> = {
  // Ethereum Mainnet
  1: [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      address: 'native',
      decimals: 18,
      coingeckoId: 'ethereum',
      logoUrl:
        'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
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
  // Sepolia Testnet
  11155111: [
    {
      symbol: 'ETH',
      name: 'Sepolia ETH',
      address: 'native',
      decimals: 18,
      coingeckoId: 'ethereum',
      logoUrl:
        'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
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
      logoUrl:
        'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
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
      logoUrl:
        'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
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
      logoUrl:
        'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
    },
  ],
};

// ERC-20 ABI (balanceOf만 필요)
const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// 체인 설정
const CHAINS: Record<
  number,
  | typeof mainnet
  | typeof sepolia
  | typeof polygon
  | typeof arbitrum
  | typeof optimism
  | typeof base
> = {
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

class TokenService {
  private priceCache: Map<
    string,
    { price: number; change24h: number; timestamp: number }
  > = new Map();
  private priceCacheDuration = 60000; // 1분

  /**
   * 토큰 목록 및 잔액 조회
   */
  async getTokens(address: string, chainId: number): Promise<Token[]> {
    const tokenConfigs = DEFAULT_TOKENS[chainId] || [];
    const prices = await this.getPrices(tokenConfigs.map(t => t.coingeckoId));

    const tokens: Token[] = [];

    for (const config of tokenConfigs) {
      try {
        const balance = await this.getBalance(
          address as `0x${string}`,
          config,
          chainId,
        );
        const priceInfo = prices[config.coingeckoId] || {
          price: 0,
          change24h: 0,
        };
        const balanceNum = parseFloat(balance);

        tokens.push({
          symbol: config.symbol,
          name: config.name,
          address: config.address,
          decimals: config.decimals,
          balance: this.formatBalance(balanceNum),
          balanceRaw: balance,
          price: priceInfo.price,
          priceChange24h: priceInfo.change24h,
          value: balanceNum * priceInfo.price,
          logoUrl: config.logoUrl,
        });
      } catch (error) {
        console.error(`Failed to get balance for ${config.symbol}:`, error);
      }
    }

    return tokens;
  }

  /**
   * 토큰 잔액 조회
   */
  private async getBalance(
    walletAddress: `0x${string}`,
    token: TokenConfig,
    chainId: number,
  ): Promise<string> {
    const chain = CHAINS[chainId];
    const rpcUrl = RPC_URLS[chainId];

    if (!chain || !rpcUrl) {
      return '0';
    }

    const client = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    try {
      if (token.address === 'native') {
        const balance = await client.getBalance({ address: walletAddress });
        return formatUnits(balance, token.decimals);
      } else {
        const balance = await client.readContract({
          address: token.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [walletAddress],
        });
        return formatUnits(balance, token.decimals);
      }
    } catch (error) {
      console.error('Balance fetch error:', error);
      return '0';
    }
  }

  /**
   * 토큰 가격 조회 (CoinGecko API)
   */
  private async getPrices(
    coingeckoIds: string[],
  ): Promise<Record<string, { price: number; change24h: number }>> {
    const result: Record<string, { price: number; change24h: number }> = {};
    const idsToFetch: string[] = [];

    // 캐시 확인
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

      const response = await fetch(url);
      const data = (await response.json()) as Record<
        string,
        { usd?: number; usd_24h_change?: number }
      >;

      for (const id of uniqueIds) {
        if (data[id]) {
          const price = data[id].usd || 0;
          const change24h = data[id].usd_24h_change || 0;

          result[id] = { price, change24h };
          this.priceCache.set(id, {
            price,
            change24h,
            timestamp: Date.now(),
          });
        }
      }
    } catch (error) {
      console.error('Price fetch error:', error);
      // 에러 시 기본값 반환
      for (const id of idsToFetch) {
        result[id] = { price: 0, change24h: 0 };
      }
    }

    return result;
  }

  /**
   * 잔액 포맷팅
   */
  private formatBalance(balance: number): string {
    if (balance === 0) return '0';
    if (balance < 0.0001) return '< 0.0001';
    if (balance < 1) return balance.toFixed(4);
    if (balance < 1000) return balance.toFixed(2);
    return balance.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  /**
   * 총 자산 가치 계산
   */
  getTotalValue(tokens: Token[]): number {
    return tokens.reduce((sum, token) => sum + token.value, 0);
  }

  /**
   * 캐시 클리어
   */
  clearCache() {
    this.priceCache.clear();
  }
}

export const tokenService = new TokenService();
