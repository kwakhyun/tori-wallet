/**
 * Tori Wallet - Coin Service
 * CoinGecko API를 사용한 코인 데이터 조회
 * Rate limit 대응: 캐시 + 쓰로틀링 + 백업 API
 */

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const COINCAP_API = 'https://api.coincap.io/v2'; // 백업 API

export interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  price_change_percentage_24h: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  circulating_supply: number;
  total_supply: number;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
}

export interface CoinDetail {
  id: string;
  symbol: string;
  name: string;
  image: {
    large: string;
    small: string;
    thumb: string;
  };
  market_data: {
    current_price: { usd: number; krw: number };
    market_cap: { usd: number; krw: number };
    total_volume: { usd: number; krw: number };
    high_24h: { usd: number; krw: number };
    low_24h: { usd: number; krw: number };
    price_change_percentage_24h: number;
    price_change_percentage_7d: number;
    price_change_percentage_30d: number;
    circulating_supply: number;
    total_supply: number;
    ath: { usd: number; krw: number };
  };
  description: { en: string; ko: string };
}

export interface PriceHistory {
  prices: [number, number][]; // [timestamp, price]
  market_caps: [number, number][];
  total_volumes: [number, number][];
}

export interface SearchResult {
  coins: {
    id: string;
    name: string;
    symbol: string;
    thumb: string;
    market_cap_rank: number;
  }[];
}

export interface TrendingResult {
  coins: {
    item: {
      id: string;
      name: string;
      symbol: string;
      thumb: string;
      market_cap_rank: number;
    };
  }[];
}

// Rate Limit 에러 타입
export class RateLimitError extends Error {
  constructor(
    message: string = '무료 데이터 조회 제한에 도달했습니다.\n잠시 후에 다시 시도해주세요.',
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Rate Limit 콜백 타입
type RateLimitCallback = (message: string) => void;

class CoinService {
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private requestQueue: Promise<unknown> = Promise.resolve();
  private lastRequestTime = 0;
  private rateLimitCallback: RateLimitCallback | null = null;
  private lastRateLimitAlert = 0;
  private RATE_LIMIT_ALERT_COOLDOWN = 30 * 1000; // 30초에 한 번만 알림

  // 캐시 시간 설정 (데이터 종류별로 다르게)
  private CACHE_DURATIONS = {
    coinList: 5 * 60 * 1000, // 코인 목록: 5분
    coinDetail: 3 * 60 * 1000, // 코인 상세: 3분
    priceHistory: 10 * 60 * 1000, // 가격 히스토리: 10분
    search: 2 * 60 * 1000, // 검색: 2분
    trending: 10 * 60 * 1000, // 트렌딩: 10분
  };

  // 요청 간 최소 대기 시간 (Rate limit 방지)
  private MIN_REQUEST_INTERVAL = 1500; // 1.5초

  /**
   * Rate Limit 알림 콜백 설정
   */
  setRateLimitCallback(callback: RateLimitCallback): void {
    this.rateLimitCallback = callback;
  }

  /**
   * Rate Limit 알림 표시 (중복 방지)
   */
  private notifyRateLimit(): void {
    const now = Date.now();
    if (now - this.lastRateLimitAlert > this.RATE_LIMIT_ALERT_COOLDOWN) {
      this.lastRateLimitAlert = now;
      if (this.rateLimitCallback) {
        this.rateLimitCallback(
          '무료 데이터 조회 제한에 도달했습니다.\n잠시 후에 다시 시도해주세요.',
        );
      }
    }
  }

  /**
   * 쓰로틀링이 적용된 fetch
   */
  private async throttledFetch(url: string): Promise<Response> {
    return new Promise((resolve, reject) => {
      this.requestQueue = this.requestQueue.then(async () => {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
          await this.delay(this.MIN_REQUEST_INTERVAL - timeSinceLastRequest);
        }

        this.lastRequestTime = Date.now();

        try {
          const response = await fetch(url);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async fetchWithCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    cacheDuration: number = this.CACHE_DURATIONS.coinList,
  ): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cacheDuration) {
      return cached.data as T;
    }

    const data = await fetcher();
    this.cache.set(key, { data, timestamp: Date.now() });
    return data;
  }

  /**
   * 인기 코인 목록 조회 (시가총액 순)
   * CoinGecko 실패 시 CoinCap API 사용
   */
  async getTopCoins(page: number = 1, perPage: number = 50): Promise<Coin[]> {
    const cacheKey = `top_coins_${page}_${perPage}`;

    return this.fetchWithCache<Coin[]>(
      cacheKey,
      async () => {
        try {
          // CoinGecko 시도
          const response = await this.throttledFetch(
            `${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false`,
          );

          if (response.ok) {
            return response.json() as Promise<Coin[]>;
          }

          // Rate limit (429) 체크
          if (response.status === 429) {
            this.notifyRateLimit();
          }

          // Rate limit 등 에러 시 CoinCap 백업
          console.warn('CoinGecko rate limited, using CoinCap backup');
          return this.getTopCoinsFromCoinCap(page, perPage);
        } catch (error) {
          console.warn('CoinGecko failed, using CoinCap backup:', error);
          return this.getTopCoinsFromCoinCap(page, perPage);
        }
      },
      this.CACHE_DURATIONS.coinList,
    );
  }

  /**
   * CoinCap API를 사용한 코인 목록 조회 (백업)
   */
  private async getTopCoinsFromCoinCap(
    page: number,
    perPage: number,
  ): Promise<Coin[]> {
    const offset = (page - 1) * perPage;
    const response = await fetch(
      `${COINCAP_API}/assets?limit=${perPage}&offset=${offset}`,
    );

    if (!response.ok) {
      throw new Error('코인 목록을 불러오는데 실패했습니다.');
    }

    interface CoinCapAsset {
      id: string;
      symbol: string;
      name: string;
      priceUsd: string;
      marketCapUsd: string;
      rank: string;
      changePercent24Hr: string;
      volumeUsd24Hr: string;
      supply: string;
      maxSupply: string;
    }

    const data = (await response.json()) as { data: CoinCapAsset[] };

    // CoinCap 형식을 CoinGecko 형식으로 변환
    return data.data.map((coin: CoinCapAsset) => ({
      id: coin.id.toLowerCase(),
      symbol: coin.symbol.toLowerCase(),
      name: coin.name,
      image: `https://assets.coincap.io/assets/icons/${coin.symbol.toLowerCase()}@2x.png`,
      current_price: parseFloat(coin.priceUsd) || 0,
      market_cap: parseFloat(coin.marketCapUsd) || 0,
      market_cap_rank: parseInt(coin.rank, 10) || 0,
      price_change_percentage_24h: parseFloat(coin.changePercent24Hr) || 0,
      total_volume: parseFloat(coin.volumeUsd24Hr) || 0,
      high_24h: 0,
      low_24h: 0,
      circulating_supply: parseFloat(coin.supply) || 0,
      total_supply: parseFloat(coin.maxSupply) || 0,
      ath: 0,
      ath_change_percentage: 0,
      ath_date: '',
    }));
  }

  /**
   * 코인 검색 (캐시 + 쓰로틀링 적용)
   */
  async searchCoins(query: string): Promise<SearchResult> {
    if (!query || query.length < 2) {
      return { coins: [] };
    }

    const cacheKey = `search_${query}`;

    return this.fetchWithCache<SearchResult>(
      cacheKey,
      async () => {
        try {
          const response = await this.throttledFetch(
            `${COINGECKO_API}/search?query=${encodeURIComponent(query)}`,
          );

          if (!response.ok) {
            // Rate limit (429) 체크
            if (response.status === 429) {
              this.notifyRateLimit();
            }
            return { coins: [] };
          }

          return response.json() as Promise<SearchResult>;
        } catch (error) {
          console.warn('Search failed:', error);
          return { coins: [] };
        }
      },
      this.CACHE_DURATIONS.search,
    );
  }

  /**
   * 코인 상세 정보 조회 (쓰로틀링 적용)
   */
  async getCoinDetail(coinId: string): Promise<CoinDetail> {
    const cacheKey = `coin_detail_${coinId}`;

    return this.fetchWithCache<CoinDetail>(
      cacheKey,
      async () => {
        const response = await this.throttledFetch(
          `${COINGECKO_API}/coins/${coinId}?localization=true&tickers=false&community_data=false&developer_data=false`,
        );

        if (!response.ok) {
          // Rate limit (429) 체크
          if (response.status === 429) {
            this.notifyRateLimit();
          }
          throw new Error('코인 정보를 불러오는데 실패했습니다.');
        }

        return response.json() as Promise<CoinDetail>;
      },
      this.CACHE_DURATIONS.coinDetail,
    );
  }

  /**
   * 가격 히스토리 조회 (쓰로틀링 + CoinCap 백업)
   * @param days 1, 7, 30, 90, 365, max
   */
  async getPriceHistory(
    coinId: string,
    days: string = '7',
  ): Promise<PriceHistory> {
    const cacheKey = `price_history_${coinId}_${days}`;

    return this.fetchWithCache<PriceHistory>(
      cacheKey,
      async () => {
        try {
          const response = await this.throttledFetch(
            `${COINGECKO_API}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`,
          );

          if (response.ok) {
            return response.json() as Promise<PriceHistory>;
          }

          // Rate limit (429) 체크
          if (response.status === 429) {
            this.notifyRateLimit();
          }

          // CoinGecko 실패 시 CoinCap 백업 시도
          console.warn('CoinGecko chart failed, trying CoinCap');
          return this.getPriceHistoryFromCoinCap(coinId, days);
        } catch (error) {
          console.warn('Price history error, trying CoinCap:', error);
          return this.getPriceHistoryFromCoinCap(coinId, days);
        }
      },
      this.CACHE_DURATIONS.priceHistory,
    );
  }

  /**
   * CoinCap API를 사용한 가격 히스토리 조회 (백업)
   * 지원 기간: 1일, 7일, 30일
   */
  private async getPriceHistoryFromCoinCap(
    coinId: string,
    days: string,
  ): Promise<PriceHistory> {
    try {
      // days를 interval로 변환 (1일, 7일, 30일만 지원)
      const intervalMap: Record<string, string> = {
        '1': 'h1',
        '7': 'h2',
        '30': 'h6',
      };
      const interval = intervalMap[days] || 'h2';

      // 시작 시간 계산
      const now = Date.now();
      const daysNum = parseInt(days, 10) || 7;
      const start = now - daysNum * 24 * 60 * 60 * 1000;

      const response = await fetch(
        `${COINCAP_API}/assets/${coinId}/history?interval=${interval}&start=${start}&end=${now}`,
      );

      if (!response.ok) {
        return { prices: [], market_caps: [], total_volumes: [] };
      }

      interface CoinCapHistoryItem {
        time: number;
        priceUsd: string;
      }

      const data = (await response.json()) as { data: CoinCapHistoryItem[] };

      // CoinCap 형식을 PriceHistory 형식으로 변환
      const prices: [number, number][] = (data.data || []).map(
        (item: CoinCapHistoryItem) => [
          item.time,
          parseFloat(item.priceUsd) || 0,
        ],
      );

      return {
        prices,
        market_caps: [],
        total_volumes: [],
      };
    } catch (error) {
      console.warn('CoinCap price history failed:', error);
      return { prices: [], market_caps: [], total_volumes: [] };
    }
  }

  /**
   * 트렌딩 코인 조회 (쓰로틀링 적용)
   */
  async getTrendingCoins(): Promise<TrendingResult> {
    const cacheKey = 'trending_coins';

    return this.fetchWithCache<TrendingResult>(
      cacheKey,
      async () => {
        try {
          const response = await this.throttledFetch(
            `${COINGECKO_API}/search/trending`,
          );

          if (!response.ok) {
            // Rate limit (429) 체크
            if (response.status === 429) {
              this.notifyRateLimit();
            }
            return { coins: [] };
          }

          return response.json() as Promise<TrendingResult>;
        } catch (error) {
          console.warn('Trending coins failed:', error);
          return { coins: [] };
        }
      },
      this.CACHE_DURATIONS.trending,
    );
  }

  /**
   * 가격 포맷팅
   */
  formatPrice(price: number | null | undefined): string {
    if (price === null || price === undefined || isNaN(price)) {
      return '$0.00';
    }
    if (price >= 1000) {
      return `$${price.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    } else if (price >= 1) {
      return `$${price.toFixed(2)}`;
    } else if (price >= 0.01) {
      return `$${price.toFixed(4)}`;
    } else {
      return `$${price.toFixed(6)}`;
    }
  }

  /**
   * 시가총액 포맷팅
   */
  formatMarketCap(marketCap: number | null | undefined): string {
    if (marketCap === null || marketCap === undefined || isNaN(marketCap)) {
      return '$0';
    }
    if (marketCap >= 1e12) {
      return `$${(marketCap / 1e12).toFixed(2)}T`;
    } else if (marketCap >= 1e9) {
      return `$${(marketCap / 1e9).toFixed(2)}B`;
    } else if (marketCap >= 1e6) {
      return `$${(marketCap / 1e6).toFixed(2)}M`;
    }
    return `$${marketCap.toLocaleString()}`;
  }

  /**
   * 변동률 포맷팅
   */
  formatPercentage(percentage: number | null | undefined): string {
    if (percentage === null || percentage === undefined || isNaN(percentage)) {
      return '0.00%';
    }
    const sign = percentage >= 0 ? '+' : '';
    return `${sign}${percentage.toFixed(2)}%`;
  }

  /**
   * 네이티브 토큰 가격 조회 (체인별)
   * 캐시 시간: 5분
   */
  async getNativeTokenPrice(chainId: number): Promise<number> {
    // 체인별 CoinGecko ID 매핑
    const chainToCoingeckoId: Record<number, string> = {
      1: 'ethereum',
      137: 'matic-network',
      42161: 'ethereum', // Arbitrum uses ETH
      10: 'ethereum', // Optimism uses ETH
      8453: 'ethereum', // Base uses ETH
      11155111: 'ethereum', // Sepolia (testnet, show ETH price)
    };

    const coinId = chainToCoingeckoId[chainId] || 'ethereum';
    const cacheKey = `native_price_${coinId}`;

    return this.fetchWithCache<number>(
      cacheKey,
      async () => {
        try {
          const response = await this.throttledFetch(
            `${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=usd`,
          );

          if (response.ok) {
            const data = (await response.json()) as Record<
              string,
              { usd: number }
            >;
            return data[coinId]?.usd || 0;
          }

          // CoinGecko 실패 시 CoinCap 백업
          const backupResponse = await fetch(`${COINCAP_API}/assets/${coinId}`);
          if (backupResponse.ok) {
            const backupData = (await backupResponse.json()) as {
              data: { priceUsd: string };
            };
            return parseFloat(backupData.data?.priceUsd) || 0;
          }

          return 0;
        } catch (error) {
          console.warn('Failed to fetch native token price:', error);
          return 0;
        }
      },
      5 * 60 * 1000, // 5분 캐시
    );
  }

  /**
   * USD 가치 계산
   */
  calculateUsdValue(amount: number, priceUsd: number): string {
    const value = amount * priceUsd;
    if (value < 0.01) return '< $0.01';
    if (value >= 1000) {
      return `$${value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
    return `$${value.toFixed(2)}`;
  }
}

export const coinService = new CoinService();
