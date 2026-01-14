/**
 * Tori Wallet - TokenService Tests
 * 토큰 서비스 테스트
 */

import { tokenService, Token } from '../../src/services/tokenService';

// fetch mock
global.fetch = jest.fn();

// viem 모킹
jest.mock('viem', () => ({
  createPublicClient: jest.fn(() => ({
    getBalance: jest.fn().mockResolvedValue(BigInt('1000000000000000000')),
    readContract: jest.fn().mockResolvedValue(BigInt('1000000000')),
  })),
  http: jest.fn(() => 'http-transport'),
  formatUnits: jest.fn((value: bigint, decimals: number) =>
    (Number(value) / Math.pow(10, decimals)).toString(),
  ),
}));

jest.mock('viem/chains', () => ({
  mainnet: { id: 1, name: 'Ethereum' },
  polygon: { id: 137, name: 'Polygon' },
  arbitrum: { id: 42161, name: 'Arbitrum One' },
}));

describe('TokenService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tokenService.clearCache();
    (global.fetch as jest.Mock).mockReset();
  });

  describe('getTotalValue', () => {
    it('should calculate total value of tokens', () => {
      const tokens: Token[] = [
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
        },
        {
          symbol: 'USDC',
          name: 'USD Coin',
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          decimals: 6,
          balance: '500',
          balanceRaw: '500',
          price: 1,
          priceChange24h: 0,
          value: 500,
        },
      ];

      expect(tokenService.getTotalValue(tokens)).toBe(3500);
    });

    it('should return 0 for empty array', () => {
      expect(tokenService.getTotalValue([])).toBe(0);
    });

    it('should handle tokens with zero value', () => {
      const tokens: Token[] = [
        {
          symbol: 'ETH',
          name: 'Ethereum',
          address: 'native',
          decimals: 18,
          balance: '0',
          balanceRaw: '0',
          price: 2000,
          priceChange24h: 5,
          value: 0,
        },
      ];

      expect(tokenService.getTotalValue(tokens)).toBe(0);
    });

    it('should sum multiple tokens correctly', () => {
      const tokens: Token[] = [
        {
          symbol: 'ETH',
          name: 'Ethereum',
          address: 'native',
          decimals: 18,
          balance: '1',
          balanceRaw: '1',
          price: 2000,
          priceChange24h: 0,
          value: 2000,
        },
        {
          symbol: 'USDC',
          name: 'USD Coin',
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          decimals: 6,
          balance: '1000',
          balanceRaw: '1000',
          price: 1,
          priceChange24h: 0,
          value: 1000,
        },
        {
          symbol: 'LINK',
          name: 'Chainlink',
          address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
          decimals: 18,
          balance: '50',
          balanceRaw: '50',
          price: 15,
          priceChange24h: 2,
          value: 750,
        },
      ];

      expect(tokenService.getTotalValue(tokens)).toBe(3750);
    });
  });

  describe('clearCache', () => {
    it('should clear price cache', () => {
      expect(() => tokenService.clearCache()).not.toThrow();
    });
  });

  describe('getTokens', () => {
    it('should handle unsupported chain gracefully', async () => {
      const tokens = await tokenService.getTokens(
        '0x1234567890123456789012345678901234567890',
        999999,
      );
      expect(tokens).toEqual([]);
    });

    it('should fetch tokens for Ethereum mainnet', async () => {
      // CoinGecko API 응답 모킹
      (global.fetch as jest.Mock).mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          ethereum: { usd: 2000, usd_24h_change: 5 },
        }),
      });

      const tokens = await tokenService.getTokens(
        '0x1234567890123456789012345678901234567890',
        1,
      );

      // 기본 토큰 목록이 있어야 함
      expect(Array.isArray(tokens)).toBe(true);
    });

    it('should handle API error gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('API Error'));

      const tokens = await tokenService.getTokens(
        '0x1234567890123456789012345678901234567890',
        1,
      );

      // 에러가 발생해도 빈 배열 또는 기본값 반환
      expect(Array.isArray(tokens)).toBe(true);
    });
  });
});
