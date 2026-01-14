/**
 * Tori Wallet - PortfolioAnalyticsService Tests
 * 포트폴리오 분석 서비스 테스트
 */

import { portfolioAnalyticsService } from '../../src/services/portfolioAnalyticsService';
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

      // ETH should be first (highest value)
      expect(allocation[0].symbol).toBe('ETH');
      expect(allocation[0].value).toBe(3000);

      // Total percentage should be ~100%
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

    it('should calculate volatility', () => {
      const performance =
        portfolioAnalyticsService.calculatePerformance(mockTokens);

      expect(typeof performance.volatility).toBe('number');
      expect(performance.volatility).toBeGreaterThanOrEqual(0);
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

    it('should handle single token', () => {
      const singleToken = [mockTokens[0]];
      const performance =
        portfolioAnalyticsService.calculatePerformance(singleToken);

      expect(performance.bestPerformer?.symbol).toBe('ETH');
      expect(performance.worstPerformer?.symbol).toBe('ETH');
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

    it('should save snapshot with empty tokens', async () => {
      await expect(
        portfolioAnalyticsService.saveSnapshot(
          '0x1234567890123456789012345678901234567890',
          1,
          [],
        ),
      ).resolves.not.toThrow();
    });
  });
});
