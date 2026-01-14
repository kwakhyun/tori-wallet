/**
 * Tori Wallet - CoinService Tests
 * 코인 서비스 테스트
 */

import { coinService, RateLimitError } from '../../src/services/coinService';

// fetch mock
global.fetch = jest.fn();

describe('CoinService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('RateLimitError', () => {
    it('should create RateLimitError with default message', () => {
      const error = new RateLimitError();
      expect(error.name).toBe('RateLimitError');
      expect(error.message).toContain('무료 데이터 조회 제한');
    });

    it('should create RateLimitError with custom message', () => {
      const error = new RateLimitError('Custom message');
      expect(error.message).toBe('Custom message');
    });
  });

  describe('setRateLimitCallback', () => {
    it('should set rate limit callback without error', () => {
      const callback = jest.fn();
      expect(() => coinService.setRateLimitCallback(callback)).not.toThrow();
    });
  });

  describe('formatPrice', () => {
    it('should format large prices', () => {
      expect(coinService.formatPrice(12345.67)).toBe('$12,345.67');
    });

    it('should format medium prices', () => {
      expect(coinService.formatPrice(123.45)).toBe('$123.45');
    });

    it('should format small prices with 4 decimals', () => {
      expect(coinService.formatPrice(0.1234)).toBe('$0.1234');
    });

    it('should format very small prices with 6 decimals', () => {
      expect(coinService.formatPrice(0.001234)).toBe('$0.001234');
    });

    it('should handle null', () => {
      expect(coinService.formatPrice(null)).toBe('$0.00');
    });

    it('should handle undefined', () => {
      expect(coinService.formatPrice(undefined)).toBe('$0.00');
    });

    it('should handle NaN', () => {
      expect(coinService.formatPrice(NaN)).toBe('$0.00');
    });
  });

  describe('formatMarketCap', () => {
    it('should format trillions', () => {
      expect(coinService.formatMarketCap(1500000000000)).toBe('$1.50T');
    });

    it('should format billions', () => {
      expect(coinService.formatMarketCap(1500000000)).toBe('$1.50B');
    });

    it('should format millions', () => {
      expect(coinService.formatMarketCap(1500000)).toBe('$1.50M');
    });

    it('should format smaller numbers with locale', () => {
      const result = coinService.formatMarketCap(150000);
      expect(result).toContain('$');
      expect(result).toContain('150');
    });

    it('should handle null', () => {
      expect(coinService.formatMarketCap(null)).toBe('$0');
    });

    it('should handle undefined', () => {
      expect(coinService.formatMarketCap(undefined)).toBe('$0');
    });
  });

  describe('formatPercentage', () => {
    it('should format positive percentages with plus sign', () => {
      expect(coinService.formatPercentage(5.5)).toBe('+5.50%');
    });

    it('should format negative percentages', () => {
      expect(coinService.formatPercentage(-3.2)).toBe('-3.20%');
    });

    it('should format zero', () => {
      expect(coinService.formatPercentage(0)).toBe('+0.00%');
    });

    it('should handle null', () => {
      expect(coinService.formatPercentage(null)).toBe('0.00%');
    });

    it('should handle undefined', () => {
      expect(coinService.formatPercentage(undefined)).toBe('0.00%');
    });
  });

  describe('calculateUsdValue', () => {
    it('should calculate USD value', () => {
      expect(coinService.calculateUsdValue(2, 1000)).toBe('$2,000.00');
    });

    it('should format small values', () => {
      expect(coinService.calculateUsdValue(0.5, 10)).toBe('$5.00');
    });

    it('should handle very small values', () => {
      expect(coinService.calculateUsdValue(0.001, 0.001)).toBe('< $0.01');
    });
  });

  describe('searchCoins', () => {
    it('should return empty result for short query', async () => {
      const result = await coinService.searchCoins('a');
      expect(result.coins).toEqual([]);
    });

    it('should return empty result for empty query', async () => {
      const result = await coinService.searchCoins('');
      expect(result.coins).toEqual([]);
    });

    it('should fetch search results for valid query', async () => {
      const mockSearchResult = {
        coins: [
          {
            id: 'bitcoin',
            name: 'Bitcoin',
            symbol: 'btc',
            thumb: 'url',
            market_cap_rank: 1,
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSearchResult),
      });

      const result = await coinService.searchCoins('bitcoin');
      expect(result.coins.length).toBeGreaterThan(0);
    });

    it('should handle API error gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await coinService.searchCoins('test query');
      expect(result.coins).toEqual([]);
    });
  });

  describe('getTopCoins', () => {
    it('should fetch top coins', async () => {
      const mockCoins = [
        {
          id: 'bitcoin',
          symbol: 'btc',
          name: 'Bitcoin',
          image: 'url',
          current_price: 50000,
          market_cap: 1000000000000,
          market_cap_rank: 1,
          price_change_percentage_24h: 2.5,
          total_volume: 50000000000,
          high_24h: 51000,
          low_24h: 49000,
          circulating_supply: 19000000,
          total_supply: 21000000,
          ath: 69000,
          ath_change_percentage: -27.5,
          ath_date: '2021-11-10',
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCoins),
      });

      const result = await coinService.getTopCoins(1, 10);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].id).toBe('bitcoin');
    });

    it('should use CoinCap backup on CoinGecko failure', async () => {
      // CoinGecko 실패
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      // CoinCap 성공
      const coinCapData = {
        data: [
          {
            id: 'bitcoin',
            symbol: 'BTC',
            name: 'Bitcoin',
            priceUsd: '50000',
            marketCapUsd: '1000000000000',
            rank: '1',
            changePercent24Hr: '2.5',
            volumeUsd24Hr: '50000000000',
            supply: '19000000',
            maxSupply: '21000000',
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(coinCapData),
      });

      const result = await coinService.getTopCoins(1, 10);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getTrendingCoins', () => {
    it('should return trending coins structure', async () => {
      const mockTrending = {
        coins: [
          {
            item: {
              id: 'bitcoin',
              name: 'Bitcoin',
              symbol: 'BTC',
              thumb: 'url',
              market_cap_rank: 1,
            },
          },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTrending),
      });

      const result = await coinService.getTrendingCoins();
      expect(result).toHaveProperty('coins');
      expect(Array.isArray(result.coins)).toBe(true);
    });
  });

  describe('getNativeTokenPrice', () => {
    it('should return a number', async () => {
      // 캐시 동작으로 인해 실제 값 대신 타입만 확인
      const price = await coinService.getNativeTokenPrice(1);
      expect(typeof price).toBe('number');
    });

    it('should handle different chain IDs', async () => {
      // 각 체인에 대해 숫자를 반환하는지 확인
      const ethPrice = await coinService.getNativeTokenPrice(1);
      const polygonPrice = await coinService.getNativeTokenPrice(137);
      const arbitrumPrice = await coinService.getNativeTokenPrice(42161);

      expect(typeof ethPrice).toBe('number');
      expect(typeof polygonPrice).toBe('number');
      expect(typeof arbitrumPrice).toBe('number');
    });
  });

  describe('getCoinDetail', () => {
    it('should fetch coin detail', async () => {
      const mockDetail = {
        id: 'bitcoin',
        symbol: 'btc',
        name: 'Bitcoin',
        description: { en: 'Bitcoin description' },
        market_data: {
          current_price: { usd: 50000 },
          market_cap: { usd: 1000000000000 },
        },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockDetail),
      });

      const result = await coinService.getCoinDetail('bitcoin');
      expect(result.id).toBe('bitcoin');
    });

    it('should handle API error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(coinService.getCoinDetail('nonexistent')).rejects.toThrow();
    });

    it('should handle rate limit', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      await expect(
        coinService.getCoinDetail('bitcoin-rate-limited'),
      ).rejects.toThrow();
    });
  });

  describe('getPriceHistory', () => {
    it('should fetch price history', async () => {
      const mockHistory = {
        prices: [
          [1234567890, 50000],
          [1234567891, 50100],
        ],
        market_caps: [[1234567890, 1000000000]],
        total_volumes: [[1234567890, 50000000]],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockHistory),
      });

      const result = await coinService.getPriceHistory('bitcoin-history', '7');
      expect(result.prices.length).toBeGreaterThan(0);
    });

    it('should use CoinCap backup on failure', async () => {
      // CoinGecko 실패
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      // CoinCap 성공
      const coinCapHistory = {
        data: [
          { time: 1234567890, priceUsd: '50000' },
          { time: 1234567891, priceUsd: '50100' },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(coinCapHistory),
      });

      const result = await coinService.getPriceHistory(
        'bitcoin-cap-history',
        '7',
      );
      expect(result).toHaveProperty('prices');
    });

    it('should handle fetch error gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error'),
      );

      // CoinCap도 실패
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await coinService.getPriceHistory(
        'bitcoin-error-history',
        '1',
      );
      expect(result.prices).toEqual([]);
    });
  });

  describe('getTrendingCoins - additional tests', () => {
    it('should handle rate limit gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      const result = await coinService.getTrendingCoins();
      expect(result.coins).toEqual([]);
    });

    it('should handle network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const result = await coinService.getTrendingCoins();
      expect(result.coins).toEqual([]);
    });
  });
});
