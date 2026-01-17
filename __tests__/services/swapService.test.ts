/**
 * 스왑 서비스 테스트
 */

// 테스트 타임아웃 5초 설정 (이 테스트는 빠르게 완료되어야 함)
jest.setTimeout(5000);

import {
  swapService,
  SwapToken,
  SWAP_TOKENS,
} from '../../src/services/swapService';

// fetch 모킹
global.fetch = jest.fn();

describe('SwapService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  describe('getTokens', () => {
    it('should return tokens for Ethereum mainnet', () => {
      const tokens = swapService.getTokens(1);
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0].symbol).toBe('ETH');
    });

    it('should return tokens for Polygon', () => {
      const tokens = swapService.getTokens(137);
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0].symbol).toBe('MATIC');
    });

    it('should return tokens for Arbitrum', () => {
      const tokens = swapService.getTokens(42161);
      expect(tokens.length).toBeGreaterThan(0);
    });

    it('should return tokens for Optimism', () => {
      const tokens = swapService.getTokens(10);
      expect(tokens.length).toBeGreaterThan(0);
    });

    it('should return tokens for Base', () => {
      const tokens = swapService.getTokens(8453);
      expect(tokens.length).toBeGreaterThan(0);
    });

    it('should return empty array for unsupported chain', () => {
      const tokens = swapService.getTokens(999999);
      expect(tokens).toEqual([]);
    });
  });

  describe('isSwapSupported', () => {
    it('should return true for supported chains', () => {
      expect(swapService.isSwapSupported(1)).toBe(true);
      expect(swapService.isSwapSupported(137)).toBe(true);
      expect(swapService.isSwapSupported(42161)).toBe(true);
      expect(swapService.isSwapSupported(10)).toBe(true);
      expect(swapService.isSwapSupported(8453)).toBe(true);
    });

    it('should return false for unsupported chains', () => {
      expect(swapService.isSwapSupported(11155111)).toBe(false); // Sepolia
      expect(swapService.isSwapSupported(999999)).toBe(false);
    });
  });

  describe('needsApproval', () => {
    it('should return false for native tokens', () => {
      const nativeToken: SwapToken = {
        symbol: 'ETH',
        name: 'Ethereum',
        address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        decimals: 18,
      };
      expect(swapService.needsApproval(nativeToken)).toBe(false);
    });

    it('should return true for ERC-20 tokens', () => {
      const erc20Token: SwapToken = {
        symbol: 'USDC',
        name: 'USD Coin',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
      };
      expect(swapService.needsApproval(erc20Token)).toBe(true);
    });
  });

  describe('formatBuyAmount', () => {
    const mockToken: SwapToken = {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
    };

    it('should format zero amount', () => {
      expect(swapService.formatBuyAmount('0', mockToken)).toBe('0');
    });

    it('should format very small amounts', () => {
      expect(swapService.formatBuyAmount('0.00001', mockToken)).toBe(
        '< 0.0001',
      );
    });

    it('should format small amounts with 4 decimals', () => {
      expect(swapService.formatBuyAmount('0.12345', mockToken)).toBe('0.1235');
    });

    it('should format medium amounts with 2 decimals', () => {
      expect(swapService.formatBuyAmount('123.456', mockToken)).toBe('123.46');
    });

    it('should format large amounts with locale string', () => {
      const result = swapService.formatBuyAmount('1234567.89', mockToken);
      expect(result).toContain('1,234,567');
    });
  });

  describe('calculatePriceImpact', () => {
    it('should calculate price impact percentage', () => {
      const quote = {
        estimatedPriceImpact: '0.005',
        sellToken: '',
        buyToken: '',
        sellAmount: '',
        buyAmount: '',
        price: '',
        guaranteedPrice: '',
        gas: '',
        gasPrice: '',
        protocolFee: '',
        minimumProtocolFee: '',
        sources: [],
        allowanceTarget: '',
        to: '',
        data: '',
        value: '',
      };
      expect(swapService.calculatePriceImpact(quote)).toBe('0.50');
    });

    it('should handle zero price impact', () => {
      const quote = {
        estimatedPriceImpact: '0',
        sellToken: '',
        buyToken: '',
        sellAmount: '',
        buyAmount: '',
        price: '',
        guaranteedPrice: '',
        gas: '',
        gasPrice: '',
        protocolFee: '',
        minimumProtocolFee: '',
        sources: [],
        allowanceTarget: '',
        to: '',
        data: '',
        value: '',
      };
      expect(swapService.calculatePriceImpact(quote)).toBe('0.00');
    });

    it('should handle undefined price impact', () => {
      const quote = {
        sellToken: '',
        buyToken: '',
        sellAmount: '',
        buyAmount: '',
        price: '',
        guaranteedPrice: '',
        gas: '',
        gasPrice: '',
        protocolFee: '',
        minimumProtocolFee: '',
        sources: [],
        allowanceTarget: '',
        to: '',
        data: '',
        value: '',
      } as any;
      expect(swapService.calculatePriceImpact(quote)).toBe('0.00');
    });
  });

  describe('getPrice', () => {
    it('should return null for unsupported chain', async () => {
      const result = await swapService.getPrice(
        {
          sellToken: SWAP_TOKENS[1][0],
          buyToken: SWAP_TOKENS[1][1],
          sellAmount: '1',
          takerAddress: '0x1234567890123456789012345678901234567890',
        },
        11155111, // Sepolia - unsupported
      );
      expect(result).toBeNull();
    });

    it('should fetch price for supported chain', async () => {
      const mockResponse = {
        price: '1.5',
        buyAmount: '1500000', // 1.5 USDC in 6 decimals
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await swapService.getPrice(
        {
          sellToken: SWAP_TOKENS[1][0], // ETH
          buyToken: SWAP_TOKENS[1][1], // USDC
          sellAmount: '1',
          takerAddress: '0x1234567890123456789012345678901234567890',
        },
        1,
      );

      expect(result).not.toBeNull();
      expect(result?.price).toBe('1.5');
    });

    it('should return null on fetch error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      const result = await swapService.getPrice(
        {
          sellToken: SWAP_TOKENS[1][0],
          buyToken: SWAP_TOKENS[1][1],
          sellAmount: '1',
          takerAddress: '0x1234567890123456789012345678901234567890',
        },
        1,
      );

      expect(result).toBeNull();
    });

    it('should handle network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const result = await swapService.getPrice(
        {
          sellToken: SWAP_TOKENS[1][0],
          buyToken: SWAP_TOKENS[1][1],
          sellAmount: '1',
          takerAddress: '0x1234567890123456789012345678901234567890',
        },
        1,
      );

      expect(result).toBeNull();
    });
  });

  describe('getQuote', () => {
    it('should return null for unsupported chain', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await swapService.getQuote(
        {
          sellToken: SWAP_TOKENS[1][0],
          buyToken: SWAP_TOKENS[1][1],
          sellAmount: '1',
          takerAddress: '0x1234567890123456789012345678901234567890',
        },
        11155111,
      );

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should throw on API error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: jest
          .fn()
          .mockResolvedValueOnce({ reason: 'Insufficient liquidity' }),
      });

      await expect(
        swapService.getQuote(
          {
            sellToken: SWAP_TOKENS[1][0],
            buyToken: SWAP_TOKENS[1][1],
            sellAmount: '1',
            takerAddress: '0x1234567890123456789012345678901234567890',
          },
          1,
        ),
      ).rejects.toThrow('Insufficient liquidity');
    });
  });

  describe('SWAP_TOKENS', () => {
    it('should have proper token structure', () => {
      Object.values(SWAP_TOKENS).forEach(tokens => {
        tokens.forEach(token => {
          expect(token).toHaveProperty('symbol');
          expect(token).toHaveProperty('name');
          expect(token).toHaveProperty('address');
          expect(token).toHaveProperty('decimals');
          expect(typeof token.symbol).toBe('string');
          expect(typeof token.decimals).toBe('number');
        });
      });
    });

    it('should have native token as first token', () => {
      // 대부분의 체인은 네이티브 토큰이 첫 번째여야 함
      expect(SWAP_TOKENS[1][0].symbol).toBe('ETH');
      expect(SWAP_TOKENS[137][0].symbol).toBe('MATIC');
    });
  });
});
