/**
 * 멀티 DEX 스왑 서비스 (가격 비교, 최적 경로 탐색)
 */

import { formatUnits, parseUnits } from 'viem';

// 체인별 0x API 엔드포인트
const ZEROX_API_URLS: Record<number, string> = {
  1: 'https://api.0x.org',
  137: 'https://polygon.api.0x.org',
  42161: 'https://arbitrum.api.0x.org',
  10: 'https://optimism.api.0x.org',
  8453: 'https://base.api.0x.org',
};

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
      address: '0x6B175474E89094C44Da98b954EescdeCB5C27Eb',
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
  sources: SwapSource[];
  allowanceTarget: string;
  to: string;
  data: string;
  value: string;
  // 추가 정보
  estimatedGasUsd?: string;
  minimumReceived?: string;
  route?: SwapRoute[];
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
  private apiKey: string = '';
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
    const apiUrl = ZEROX_API_URLS[chainId];

    if (!apiUrl) {
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

      if (params.excludedSources?.length) {
        queryParams.append('excludedSources', params.excludedSources.join(','));
      }

      if (params.gasPrice) {
        queryParams.append('gasPrice', params.gasPrice);
      }

      if (params.skipValidation) {
        queryParams.append('skipValidation', 'true');
      }

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

      const quote = (await response.json()) as SwapQuote;

      // 추가 정보 계산
      const enhancedQuote = await this.enhanceQuote(quote, params, chainId);
      return enhancedQuote;
    } catch (error: unknown) {
      console.error('Failed to get swap quote:', error);
      throw error;
    }
  }

  /**
   * 견적에 추가 정보 붙이기
   */
  private async enhanceQuote(
    quote: SwapQuote,
    params: SwapParams,
    _chainId: number,
  ): Promise<SwapQuote> {
    // 최소 수령량 계산
    const slippage = params.slippagePercentage || 0.5;
    const buyAmountBigInt = BigInt(quote.buyAmount);
    const minimumReceived =
      buyAmountBigInt -
      (buyAmountBigInt * BigInt(Math.floor(slippage * 100))) / 10000n;

    // USD 가스비 추정 (ETH 가격 가져오기)
    let estimatedGasUsd: string | undefined;
    try {
      const ethPrice = await this.getTokenPrice('ethereum');
      if (ethPrice) {
        const gasCostEth = parseFloat(
          formatUnits(BigInt(quote.gas) * BigInt(quote.gasPrice), 18),
        );
        estimatedGasUsd = (gasCostEth * ethPrice.usd).toFixed(2);
      }
    } catch {
      // 무시
    }

    // 경로 파싱
    const route = this.parseRoute(quote.sources);

    return {
      ...quote,
      minimumReceived: formatUnits(minimumReceived, params.buyToken.decimals),
      estimatedGasUsd,
      route,
    };
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
    return !!ZEROX_API_URLS[chainId];
  }

  /**
   * 토큰 승인 필요 여부 확인
   */
  needsApproval(sellToken: SwapToken): boolean {
    return sellToken.address !== NATIVE_TOKEN_ADDRESS;
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
   */
  calculatePriceImpact(quote: SwapQuote): {
    percent: string;
    level: 'low' | 'medium' | 'high' | 'critical';
  } {
    const impact = parseFloat(quote.estimatedPriceImpact || '0') * 100;
    let level: 'low' | 'medium' | 'high' | 'critical' = 'low';

    if (impact >= 10) {
      level = 'critical';
    } else if (impact >= 5) {
      level = 'high';
    } else if (impact >= 1) {
      level = 'medium';
    }

    return {
      percent: impact.toFixed(2),
      level,
    };
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
