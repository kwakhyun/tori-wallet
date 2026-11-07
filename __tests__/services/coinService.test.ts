/**
 * 코인 서비스 테스트
 */

import { coinService, RateLimitError } from '../../src/services/coinService';

// fetch 모킹
global.fetch = jest.fn();

describe('CoinService', () => {
  beforeAll(() => {
    // 요청 간 쓰로틀링 대기를 없애 테스트를 빠르게 한다.
    (
      coinService as unknown as { MIN_REQUEST_INTERVAL: number }
    ).MIN_REQUEST_INTERVAL = 0;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    coinService.clearCache();
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

    it('shows a dash (not $0.00) for null', () => {
      expect(coinService.formatPrice(null)).toBe('—');
    });

    it('shows a dash for undefined', () => {
      expect(coinService.formatPrice(undefined)).toBe('—');
    });

    it('shows a dash for NaN', () => {
      expect(coinService.formatPrice(NaN)).toBe('—');
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

    it('shows a dash for null', () => {
      expect(coinService.formatMarketCap(null)).toBe('—');
    });

    it('shows a dash for undefined', () => {
      expect(coinService.formatMarketCap(undefined)).toBe('—');
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

    it('shows a dash for null', () => {
      expect(coinService.formatPercentage(null)).toBe('—');
    });

    it('shows a dash for undefined', () => {
      expect(coinService.formatPercentage(undefined)).toBe('—');
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

    it('rejects on API error instead of returning "no results"', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(coinService.searchCoins('test query')).rejects.toThrow();
    });

    it('rejects with RateLimitError on 429 and does not cache it', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              coins: [
                {
                  id: 'pepe',
                  name: 'Pepe',
                  symbol: 'pepe',
                  thumb: 'url',
                  market_cap_rank: 30,
                },
              ],
            }),
        });

      await expect(coinService.searchCoins('pepe')).rejects.toBeInstanceOf(
        RateLimitError,
      );
      // 실패가 캐시되지 않았으므로 다시 요청해 결과를 받는다.
      const retry = await coinService.searchCoins('pepe');
      expect(retry.coins).toHaveLength(1);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('returns a genuine empty result without treating it as an error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ coins: [] }),
      });
      await expect(coinService.searchCoins('zzzz')).resolves.toEqual({
        coins: [],
      });
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
    it('returns the price on success', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ethereum: { usd: 2500 } }),
      });
      await expect(coinService.getNativeTokenPrice(1)).resolves.toBe(2500);
    });

    it('returns null for testnets without requesting a mainnet price', async () => {
      await expect(
        coinService.getNativeTokenPrice(11155111),
      ).resolves.toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns null (not 0) on failure and does not cache the failure', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ 'matic-network': { usd: 0.5 } }),
        });

      await expect(coinService.getNativeTokenPrice(137)).resolves.toBeNull();
      await expect(coinService.getNativeTokenPrice(137)).resolves.toBe(0.5);
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

    it('rejects (and does not cache) when every source fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error'),
      );

      // CoinCap도 실패
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(
        coinService.getPriceHistory('bitcoin-error-history', '1'),
      ).rejects.toThrow();

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            prices: [[1, 2]],
            market_caps: [],
            total_volumes: [],
          }),
      });
      const retry = await coinService.getPriceHistory(
        'bitcoin-error-history',
        '1',
      );
      expect(retry.prices).toHaveLength(1);
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

  describe('getTopCoins - additional tests', () => {
    it('should return array for any page', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });
      const result = await coinService.getTopCoins(2, 10);
      expect(Array.isArray(result)).toBe(true);
    });

    it('rejects when CoinGecko and CoinCap both fail', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({ ok: false, status: 503 });
      await expect(coinService.getTopCoins(3, 10)).rejects.toThrow();
    });
  });

  describe('searchCoins - additional tests', () => {
    it('should return object with coins property', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ coins: [] }),
      });
      const result = await coinService.searchCoins('bitcoin');
      expect(result).toHaveProperty('coins');
    });
  });

  describe('getPriceHistory - additional tests', () => {
    it('should return price history data structure', async () => {
      const mockHistory = {
        prices: [[1234567890000, 50000]],
        market_caps: [[1234567890000, 1000000000]],
        total_volumes: [[1234567890000, 50000000]],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockHistory),
      });

      const result = await coinService.getPriceHistory(
        `unique-coin-${Date.now()}`,
        '7',
      );
      expect(result).toHaveProperty('prices');
      expect(result).toHaveProperty('market_caps');
      expect(result).toHaveProperty('total_volumes');
    });
  });

  describe('getNativeTokenPrice - additional tests', () => {
    it('returns the cached price on subsequent calls', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ethereum: { usd: 3000 } }),
      });
      const price1 = await coinService.getNativeTokenPrice(1);
      const price2 = await coinService.getNativeTokenPrice(1);
      expect(price1).toBe(3000);
      expect(price2).toBe(3000);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('calculateUsdValue - additional tests', () => {
    it('should format large values', () => {
      expect(coinService.calculateUsdValue(100, 1000)).toContain('$');
    });

    it('should handle zero amount', () => {
      expect(coinService.calculateUsdValue(0, 1000)).toBe('< $0.01');
    });
  });
});
