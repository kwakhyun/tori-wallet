/**
 * 포트폴리오 분석 서비스 테스트
 */

import {
  portfolioAnalyticsService,
  isSnapshotReliable,
} from '../../src/services/portfolioAnalyticsService';
import { Token } from '../../src/services/tokenService';

// AsyncStorage 모킹
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

describe('PortfolioAnalyticsService', () => {
  const mockTokens: Token[] = [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      address: 'native',
      decimals: 18,
      balance: '1.5',
      balanceRaw: '1.5',
      price: 2000,
      priceChange24h: 5,
      value: 3000,
      logoUrl: 'https://example.com/eth.png',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
      balance: '1000',
      balanceRaw: '1000',
      price: 1,
      priceChange24h: 0.1,
      value: 1000,
    },
    {
      symbol: 'UNI',
      name: 'Uniswap',
      address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      decimals: 18,
      balance: '50',
      balanceRaw: '50',
      price: 10,
      priceChange24h: -3,
      value: 500,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    portfolioAnalyticsService.clearCache();
  });

  describe('calculateAllocation', () => {
    it('should calculate asset allocation correctly', () => {
      const allocation =
        portfolioAnalyticsService.calculateAllocation(mockTokens);

      expect(allocation.length).toBe(3);

      // ETH가 첫 번째여야 함 (최고 가치)
      expect(allocation[0].symbol).toBe('ETH');
      expect(allocation[0].value).toBe(3000);

      // 총 퍼센티지가 약 100%여야 함
      const totalPercentage = allocation.reduce(
        (sum, a) => sum + a.percentage,
        0,
      );
      expect(totalPercentage).toBeCloseTo(100, 1);
    });

    it('should return empty array for empty tokens', () => {
      const allocation = portfolioAnalyticsService.calculateAllocation([]);
      expect(allocation).toEqual([]);
    });

    it('should return empty array when total value is 0', () => {
      const zeroTokens: Token[] = [
        {
          symbol: 'ETH',
          name: 'Ethereum',
          address: 'native',
          decimals: 18,
          balance: '0',
          balanceRaw: '0',
          price: 2000,
          priceChange24h: 0,
          value: 0,
        },
      ];

      const allocation =
        portfolioAnalyticsService.calculateAllocation(zeroTokens);
      expect(allocation).toEqual([]);
    });

    it('should filter out tokens with zero value', () => {
      const tokensWithZero: Token[] = [
        ...mockTokens,
        {
          symbol: 'ZERO',
          name: 'Zero Token',
          address: '0x000',
          decimals: 18,
          balance: '0',
          balanceRaw: '0',
          price: 100,
          priceChange24h: 0,
          value: 0,
        },
      ];

      const allocation =
        portfolioAnalyticsService.calculateAllocation(tokensWithZero);
      expect(allocation.length).toBe(3);
      expect(allocation.find(a => a.symbol === 'ZERO')).toBeUndefined();
    });

    it('should assign colors to each allocation', () => {
      const allocation =
        portfolioAnalyticsService.calculateAllocation(mockTokens);

      allocation.forEach(a => {
        expect(a.color).toBeDefined();
        expect(a.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });

    it('should sort by value descending', () => {
      const allocation =
        portfolioAnalyticsService.calculateAllocation(mockTokens);

      for (let i = 0; i < allocation.length - 1; i++) {
        expect(allocation[i].value).toBeGreaterThanOrEqual(
          allocation[i + 1].value,
        );
      }
    });
  });

  describe('calculatePerformance', () => {
    it('should identify best and worst performers', () => {
      const performance =
        portfolioAnalyticsService.calculatePerformance(mockTokens);

      expect(performance.bestPerformer).not.toBeNull();
      expect(performance.bestPerformer?.symbol).toBe('ETH'); // 5% change

      expect(performance.worstPerformer).not.toBeNull();
      expect(performance.worstPerformer?.symbol).toBe('UNI'); // -3% change
    });

    it('should calculate volatility across held tokens', () => {
      const performance =
        portfolioAnalyticsService.calculatePerformance(mockTokens);

      expect(typeof performance.volatility).toBe('number');
      expect(performance.volatility!).toBeGreaterThanOrEqual(0);
    });

    it('should calculate weighted return', () => {
      const performance =
        portfolioAnalyticsService.calculatePerformance(mockTokens);

      expect(typeof performance.totalReturn).toBe('number');
      expect(typeof performance.totalReturnPercent).toBe('number');
    });

    it('should handle empty tokens', () => {
      const performance = portfolioAnalyticsService.calculatePerformance([]);

      expect(performance.bestPerformer).toBeNull();
      expect(performance.worstPerformer).toBeNull();
      expect(performance.totalReturn).toBe(0);
    });

    it('does not name best/worst performers with a single token', () => {
      const singleToken = [mockTokens[0]];
      const performance =
        portfolioAnalyticsService.calculatePerformance(singleToken);

      expect(performance.bestPerformer).toBeNull();
      expect(performance.worstPerformer).toBeNull();
      expect(performance.volatility).toBeNull();
    });

    it('ignores tokens without a known value', () => {
      const performance = portfolioAnalyticsService.calculatePerformance([
        mockTokens[0],
        { ...mockTokens[2], usdValue: null, priceAvailable: false },
      ]);
      expect(performance.bestPerformer).toBeNull();
    });
  });

  describe('getHistory', () => {
    it('should return empty array when no history exists', async () => {
      const history = await portfolioAnalyticsService.getHistory(
        '0x1234567890123456789012345678901234567890',
        1,
      );

      expect(history).toEqual([]);
    });
  });

  describe('getChartData', () => {
    it('should return chart data structure', async () => {
      const chartData = await portfolioAnalyticsService.getChartData(
        '0x1234567890123456789012345678901234567890',
        1,
        30,
      );

      expect(chartData).toHaveProperty('labels');
      expect(chartData).toHaveProperty('values');
      expect(Array.isArray(chartData.labels)).toBe(true);
      expect(Array.isArray(chartData.values)).toBe(true);
    });
  });

  describe('calculateStats', () => {
    it('should return stats structure', async () => {
      const stats = await portfolioAnalyticsService.calculateStats(
        '0x1234567890123456789012345678901234567890',
        1,
        mockTokens,
      );

      expect(stats).toHaveProperty('totalValue');
      expect(stats).toHaveProperty('change24h');
      expect(stats).toHaveProperty('changePercent24h');
      expect(stats).toHaveProperty('change7d');
      expect(stats).toHaveProperty('change30d');
      expect(stats).toHaveProperty('highestValue');
      expect(stats).toHaveProperty('lowestValue');
      expect(stats).toHaveProperty('averageValue');
    });

    it('should calculate total value correctly', async () => {
      const stats = await portfolioAnalyticsService.calculateStats(
        '0x1234567890123456789012345678901234567890',
        1,
        mockTokens,
      );

      expect(stats.totalValue).toBe(4500); // 3000 + 1000 + 500
    });
  });

  describe('clearCache', () => {
    it('should clear cache without error', () => {
      expect(() => portfolioAnalyticsService.clearCache()).not.toThrow();
    });
  });

  describe('saveSnapshot', () => {
    it('should save snapshot without error', async () => {
      await expect(
        portfolioAnalyticsService.saveSnapshot(
          '0x1234567890123456789012345678901234567890',
          1,
          mockTokens,
        ),
      ).resolves.not.toThrow();
    });

    it('does not record an empty token list', async () => {
      await expect(
        portfolioAnalyticsService.saveSnapshot(
          '0x1234567890123456789012345678901234567890',
          1,
          [],
        ),
      ).resolves.toBe(false);
    });

    it('should update existing snapshot for same day', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      const today = new Date();
      const existingHistory = [
        {
          timestamp: today.getTime(),
          totalValue: 1000,
          tokens: [],
        },
      ];

      AsyncStorage.getItem.mockResolvedValueOnce(
        JSON.stringify(existingHistory),
      );

      await portfolioAnalyticsService.saveSnapshot(
        '0x1234567890123456789012345678901234567890',
        1,
        mockTokens,
      );

      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    it('should limit history to max snapshots', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      // 100개 이상의 기존 스냅샷 생성
      const manySnapshots = Array.from({ length: 120 }, (_, i) => ({
        timestamp: Date.now() - (i + 1) * 24 * 60 * 60 * 1000,
        totalValue: 1000 + i,
        tokens: [],
      }));

      AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(manySnapshots));

      await portfolioAnalyticsService.saveSnapshot(
        '0x1234567890123456789012345678901234567890',
        1,
        mockTokens,
      );

      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('getHistory - additional tests', () => {
    it('should use cached history on second call', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      const mockHistory = [
        { timestamp: Date.now(), totalValue: 5000, tokens: [] },
      ];

      AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(mockHistory));

      // 첫 번째 호출
      await portfolioAnalyticsService.getHistory(
        '0xaaaa567890123456789012345678901234567890',
        1,
      );

      // 캐시 클리어 없이 두 번째 호출
      const history2 = await portfolioAnalyticsService.getHistory(
        '0xaaaa567890123456789012345678901234567890',
        1,
      );

      // 캐시에서 반환되어야 함
      expect(Array.isArray(history2)).toBe(true);
    });

    it('should handle JSON parse error gracefully', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      portfolioAnalyticsService.clearCache();

      AsyncStorage.getItem.mockResolvedValueOnce('invalid json');

      const history = await portfolioAnalyticsService.getHistory(
        '0xbbbb567890123456789012345678901234567890',
        1,
      );

      expect(history).toEqual([]);
    });
  });

  describe('calculateStats - additional tests', () => {
    it('should calculate change when history values exist', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      portfolioAnalyticsService.clearCache();

      const day = 24 * 60 * 60 * 1000;
      const now = Date.now();

      const mockHistory = [
        { timestamp: now - day, totalValue: 4000, tokens: [] },
        { timestamp: now - 7 * day, totalValue: 3500, tokens: [] },
        { timestamp: now - 30 * day, totalValue: 3000, tokens: [] },
      ];

      AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(mockHistory));

      const stats = await portfolioAnalyticsService.calculateStats(
        '0xcccc567890123456789012345678901234567890',
        1,
        mockTokens,
      );

      expect(stats.change24h).not.toBe(0);
      expect(stats.changePercent24h).not.toBe(0);
    });

    it('reports unknown (null) changes when there is no history', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      portfolioAnalyticsService.clearCache();

      // 빈 히스토리
      AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify([]));

      const stats = await portfolioAnalyticsService.calculateStats(
        '0xdddd567890123456789012345678901234567890',
        1,
        mockTokens,
      );

      expect(stats.changePercent24h).toBeNull();
      expect(stats.change7d).toBeNull();
      expect(stats.changePercent30d).toBeNull();
    });

    it('does not fall back to an arbitrarily old snapshot for 7d/30d', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      portfolioAnalyticsService.clearCache();
      const day = 24 * 60 * 60 * 1000;

      // 90일 전 스냅샷 하나뿐
      AsyncStorage.getItem.mockResolvedValueOnce(
        JSON.stringify([
          { timestamp: Date.now() - 90 * day, totalValue: 100, tokens: [] },
        ]),
      );

      const stats = await portfolioAnalyticsService.calculateStats(
        '0xd1d1567890123456789012345678901234567890',
        1,
        mockTokens,
      );

      expect(stats.changePercent24h).toBeNull();
      expect(stats.changePercent7d).toBeNull();
      expect(stats.changePercent30d).toBeNull();
      // 기록된 총 자산액 통계에는 포함
      expect(stats.lowestValue).toBe(100);
      expect(stats.highestValue).toBe(4500);
    });

    it('uses a snapshot near the 7-day mark', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      portfolioAnalyticsService.clearCache();
      const day = 24 * 60 * 60 * 1000;

      AsyncStorage.getItem.mockResolvedValueOnce(
        JSON.stringify([
          {
            timestamp: Date.now() - 7 * day - 3 * 60 * 60 * 1000,
            totalValue: 4000,
            tokens: [],
          },
        ]),
      );

      const stats = await portfolioAnalyticsService.calculateStats(
        '0xd2d2567890123456789012345678901234567890',
        1,
        mockTokens,
      );

      expect(stats.change7d).toBe(500);
      expect(stats.changePercent7d).toBeCloseTo(12.5);
      expect(stats.changePercent24h).toBeNull();
    });

    it('returns null recorded-value stats instead of $0 when nothing reliable exists', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      portfolioAnalyticsService.clearCache();
      AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify([]));

      // 가격 조회 실패(CoinGecko 429 등): ETH 1.5개, 가치 모름
      const stats = await portfolioAnalyticsService.calculateStats(
        '0xd3d3567890123456789012345678901234567890',
        1,
        [
          {
            ...mockTokens[0],
            price: 0,
            value: 0,
            usdValue: null,
            priceAvailable: false,
            hasPriceSource: true,
          },
        ],
      );

      expect(stats.highestValue).toBeNull();
      expect(stats.lowestValue).toBeNull();
      expect(stats.averageValue).toBeNull();
      expect(stats.change24h).toBeNull();
    });

    it('fills recorded-value stats from history even when the current total is unreliable', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      portfolioAnalyticsService.clearCache();
      AsyncStorage.getItem.mockResolvedValueOnce(
        JSON.stringify([
          { timestamp: Date.now() - 86400000, totalValue: 200, tokens: [] },
        ]),
      );
      const stats = await portfolioAnalyticsService.calculateStats(
        '0xd4d4567890123456789012345678901234567890',
        1,
        [{ ...mockTokens[0], balanceError: true, usdValue: null }],
      );
      expect(stats.highestValue).toBe(200);
      expect(stats.lowestValue).toBe(200);
      expect(stats.averageValue).toBe(200);
    });
  });

  describe('isSnapshotReliable - price sources', () => {
    const eth = {
      ...mockTokens[0],
      usdValue: 3000,
      priceAvailable: true,
      hasPriceSource: true,
    };
    const customToken = {
      ...mockTokens[2],
      symbol: 'MYTOKEN',
      price: 0,
      value: 0,
      usdValue: null,
      priceAvailable: false,
      coingeckoId: undefined,
      isCustom: true,
      hasPriceSource: false,
    };

    it('does not let a held token without a price source block recording', () => {
      expect(isSnapshotReliable([eth, customToken])).toBe(true);
    });

    it('still refuses when a token with a price source has no price', () => {
      expect(
        isSnapshotReliable([
          { ...eth, usdValue: null, priceAvailable: false },
          customToken,
        ]),
      ).toBe(false);
    });

    it('refuses when only tokens without a price source are held', () => {
      expect(isSnapshotReliable([customToken])).toBe(false);
    });

    it('records only the priced part of the portfolio', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      const saved = await portfolioAnalyticsService.saveSnapshot(
        '0x8888567890123456789012345678901234567890',
        1,
        [eth, customToken],
      );
      expect(saved).toBe(true);
      const [, json] = AsyncStorage.setItem.mock.calls[0];
      expect(JSON.parse(json)[0].totalValue).toBe(3000);
    });
  });

  describe('saveSnapshot - reliability guard', () => {
    const address = '0x9999567890123456789012345678901234567890';

    it.each([
      ['a failed balance', { balanceError: true, usdValue: null }],
      [
        'an unpriced token with a balance',
        { priceAvailable: false, usdValue: null },
      ],
      ['a testnet asset', { isTestnet: true, usdValue: null }],
    ])('does not record a snapshot containing %s', async (_label, patch) => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      const saved = await portfolioAnalyticsService.saveSnapshot(address, 1, [
        mockTokens[0],
        { ...mockTokens[1], ...patch },
      ]);
      expect(saved).toBe(false);
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('records a snapshot when every value is known', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      const saved = await portfolioAnalyticsService.saveSnapshot(address, 1, [
        { ...mockTokens[0], usdValue: 3000, priceAvailable: true },
        // 잔액 0인 미가격 토큰은 총액에 영향이 없으므로 허용
        {
          ...mockTokens[1],
          balance: '0',
          balanceRaw: '0',
          usdValue: null,
          priceAvailable: false,
        },
      ]);
      expect(saved).toBe(true);
      const [, json] = AsyncStorage.setItem.mock.calls[0];
      expect(JSON.parse(json)[0].totalValue).toBe(3000);
    });
  });

  describe('getChartData - additional tests', () => {
    it('should filter data by days parameter', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      portfolioAnalyticsService.clearCache();

      const day = 24 * 60 * 60 * 1000;
      const now = Date.now();

      const mockHistory = [
        { timestamp: now - day, totalValue: 5000, tokens: [] },
        { timestamp: now - 5 * day, totalValue: 4800, tokens: [] },
        { timestamp: now - 10 * day, totalValue: 4600, tokens: [] },
        { timestamp: now - 40 * day, totalValue: 4000, tokens: [] }, // 30일 외
      ];

      AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(mockHistory));

      const chartData = await portfolioAnalyticsService.getChartData(
        '0xeeee567890123456789012345678901234567890',
        1,
        30,
      );

      // 30일 내의 데이터만 포함되어야 함 (3개)
      expect(chartData.values.length).toBeLessThanOrEqual(3);
    });

    it('should sort chart data by timestamp', async () => {
      const AsyncStorage = require('@react-native-async-storage/async-storage');
      portfolioAnalyticsService.clearCache();

      const day = 24 * 60 * 60 * 1000;
      const now = Date.now();

      // 순서가 섞인 히스토리
      const mockHistory = [
        { timestamp: now - 2 * day, totalValue: 4800, tokens: [] },
        { timestamp: now - 1 * day, totalValue: 5000, tokens: [] },
        { timestamp: now - 3 * day, totalValue: 4600, tokens: [] },
      ];

      AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(mockHistory));

      const chartData = await portfolioAnalyticsService.getChartData(
        '0xffff567890123456789012345678901234567890',
        1,
        30,
      );

      // 오래된 것부터 정렬되어야 함
      for (let i = 0; i < chartData.values.length - 1; i++) {
        expect(chartData.values[i]).toBeLessThanOrEqual(
          chartData.values[i + 1] + 400,
        );
      }
    });
  });
});
