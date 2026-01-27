/**
 * 0x API 기반 토큰 스왑 서비스
 */

import { formatUnits, parseUnits } from 'viem';
import Config from 'react-native-config';

// 체인별 0x API 엔드포인트 (Sepolia는 미지원)
const ZEROX_API_URLS: Record<number, string> = {
  1: 'https://api.0x.org',
  137: 'https://polygon.api.0x.org',
  42161: 'https://arbitrum.api.0x.org',
  10: 'https://optimism.api.0x.org',
  8453: 'https://base.api.0x.org',
};

// 네이티브 토큰 주소 (0x API 표준)
const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

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
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    },
    {
      symbol: 'USDT',
      name: 'Tether',
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      decimals: 18,
      logoUrl: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
    },
    {
      symbol: 'DAI',
      name: 'Dai',
      address: '0x6B175474E89094C44Da98b954EescdeCB5C27Eb',
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/9956/small/dai-multi-collateral-mcd.png',
    },
    {
      symbol: 'WBTC',
      name: 'Wrapped Bitcoin',
      address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      decimals: 8,
      logoUrl:
        'https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png',
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
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    },
    {
      symbol: 'USDT',
      name: 'Tether',
      address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      decimals: 18,
      logoUrl: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
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
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    },
    {
      symbol: 'USDT',
      name: 'Tether',
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
    },
    {
      symbol: 'ARB',
      name: 'Arbitrum',
      address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg',
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
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    },
    {
      symbol: 'OP',
      name: 'Optimism',
      address: '0x4200000000000000000000000000000000000042',
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/25244/small/Optimism.png',
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
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
      logoUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
    },
  ],
  // Sepolia 테스트넷
  11155111: [
    {
      symbol: 'ETH',
      name: 'Sepolia ETH',
      address: NATIVE_TOKEN_ADDRESS,
      decimals: 18,
      logoUrl:
        'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
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
}

export interface SwapQuote {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  price: string;
  guaranteedPrice: string;
  estimatedPriceImpact: string;
  gas: string;
  gasPrice: string;
  protocolFee: string;
  minimumProtocolFee: string;
  sources: { name: string; proportion: string }[];
  allowanceTarget: string;
  to: string;
  data: string;
  value: string;
}

export interface SwapParams {
  sellToken: SwapToken;
  buyToken: SwapToken;
  sellAmount: string;
  slippagePercentage?: number;
  takerAddress: string;
}

class SwapService {
  private apiKey: string = Config.ZEROX_API_KEY || '';

  /**
   * 스왑 견적 가져오기
   */
  async getQuote(
    params: SwapParams,
    chainId: number,
  ): Promise<SwapQuote | null> {
    const apiUrl = ZEROX_API_URLS[chainId];

    if (!apiUrl) {
      // 테스트넷은 지원하지 않음
      console.warn(`Swap not supported on chain ${chainId}`);
      return null;
    }

    try {
      const sellAmountWei = parseUnits(
        params.sellAmount,
        params.sellToken.decimals,
      ).toString();

      const queryParams = new URLSearchParams({
        sellToken: params.sellToken.address,
        buyToken: params.buyToken.address,
        sellAmount: sellAmountWei,
        takerAddress: params.takerAddress,
        slippagePercentage: (params.slippagePercentage || 0.5).toString(),
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['0x-api-key'] = this.apiKey;
      }

      const response = await fetch(
        `${apiUrl}/swap/v1/quote?${queryParams.toString()}`,
        { headers },
      );

      if (!response.ok) {
        const errorData = (await response.json()) as { reason?: string };
        throw new Error(errorData.reason || 'Failed to get quote');
      }

      const quote = await response.json();
      return quote as SwapQuote;
    } catch (error: unknown) {
      console.error('Failed to get swap quote:', error);
      throw error;
    }
  }

  /**
   * 스왑 가격 조회 (가스 계산 제외, 빠른 조회용)
   */
  async getPrice(
    params: SwapParams,
    chainId: number,
  ): Promise<{ price: string; buyAmount: string } | null> {
    const apiUrl = ZEROX_API_URLS[chainId];

    if (!apiUrl) {
      return null;
    }

    try {
      const sellAmountWei = parseUnits(
        params.sellAmount,
        params.sellToken.decimals,
      ).toString();

      const queryParams = new URLSearchParams({
        sellToken: params.sellToken.address,
        buyToken: params.buyToken.address,
        sellAmount: sellAmountWei,
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['0x-api-key'] = this.apiKey;
      }

      const response = await fetch(
        `${apiUrl}/swap/v1/price?${queryParams.toString()}`,
        { headers },
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        price: string;
        buyAmount: string;
      };

      return {
        price: data.price,
        buyAmount: formatUnits(
          BigInt(data.buyAmount),
          params.buyToken.decimals,
        ),
      };
    } catch (error: unknown) {
      console.error('Failed to get price:', error);
      return null;
    }
  }

  /**
   * 체인별 지원 토큰 목록 조회
   */
  getTokens(chainId: number): SwapToken[] {
    return SWAP_TOKENS[chainId] || [];
  }

  /**
   * 스왑 지원 여부 확인
   */
  isSwapSupported(chainId: number): boolean {
    return !!ZEROX_API_URLS[chainId];
  }

  /**
   * 토큰 승인 필요 여부 (네이티브 토큰은 승인 불필요)
   */
  needsApproval(sellToken: SwapToken): boolean {
    return sellToken.address !== NATIVE_TOKEN_ADDRESS;
  }

  /**
   * 예상 수령량 포맷팅
   */
  formatBuyAmount(amount: string, _token: SwapToken): string {
    const num = parseFloat(amount);
    if (num === 0) return '0';
    if (num < 0.0001) return '< 0.0001';
    if (num < 1) return num.toFixed(4);
    if (num < 1000) return num.toFixed(2);
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  /**
   * 가격 영향 계산
   */
  calculatePriceImpact(quote: SwapQuote): string {
    const impact = parseFloat(quote.estimatedPriceImpact || '0') * 100;
    return impact.toFixed(2);
  }
}

export const swapService = new SwapService();
