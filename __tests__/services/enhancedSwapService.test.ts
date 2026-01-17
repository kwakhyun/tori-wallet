/**
 * 멀티 DEX 스왑 서비스 테스트
 */

import {
  enhancedSwapService,
  SWAP_TOKENS,
  NATIVE_TOKEN_ADDRESS,
  SwapToken,
  SwapQuote,
} from '../../src/services/enhancedSwapService';

// fetch 모킹
global.fetch = jest.fn();

describe('EnhancedSwapService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTokens', () => {
    it('should return tokens for Ethereum mainnet', () => {
      const tokens = enhancedSwapService.getTokens(1);
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0].symbol).toBe('ETH');
      expect(tokens[0].isNative).toBe(true);
    });

    it('should return tokens for Polygon', () => {
      const tokens = enhancedSwapService.getTokens(137);
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0].symbol).toBe('MATIC');
    });

    it('should return tokens for Arbitrum', () => {
      const tokens = enhancedSwapService.getTokens(42161);
      expect(tokens.length).toBeGreaterThan(0);
    });

    it('should return empty array for unsupported chain', () => {
      const tokens = enhancedSwapService.getTokens(999999);
      expect(tokens).toEqual([]);
    });
  });

  describe('isSwapSupported', () => {
    it('should return true for supported chains', () => {
      expect(enhancedSwapService.isSwapSupported(1)).toBe(true);
      expect(enhancedSwapService.isSwapSupported(137)).toBe(true);
      expect(enhancedSwapService.isSwapSupported(42161)).toBe(true);
      expect(enhancedSwapService.isSwapSupported(10)).toBe(true);
      expect(enhancedSwapService.isSwapSupported(8453)).toBe(true);
    });

    it('should return false for unsupported chains', () => {
      expect(enhancedSwapService.isSwapSupported(11155111)).toBe(false);
      expect(enhancedSwapService.isSwapSupported(999999)).toBe(false);
    });
  });

  describe('needsApproval', () => {
    it('should return false for native tokens', () => {
      const nativeToken: SwapToken = {
        symbol: 'ETH',
        name: 'Ethereum',
        address: NATIVE_TOKEN_ADDRESS,
        decimals: 18,
        isNative: true,
      };
      expect(enhancedSwapService.needsApproval(nativeToken)).toBe(false);
    });

    it('should return true for ERC-20 tokens', () => {
      const erc20Token: SwapToken = {
        symbol: 'USDC',
        name: 'USD Coin',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
      };
      expect(enhancedSwapService.needsApproval(erc20Token)).toBe(true);
    });
  });

  describe('isNativeToken', () => {
    it('should return true for native token address', () => {
      expect(enhancedSwapService.isNativeToken(NATIVE_TOKEN_ADDRESS)).toBe(
        true,
      );
    });

    it('should return true for native token address (lowercase)', () => {
      expect(
        enhancedSwapService.isNativeToken(NATIVE_TOKEN_ADDRESS.toLowerCase()),
      ).toBe(true);
    });

    it('should return false for ERC-20 address', () => {
      expect(
        enhancedSwapService.isNativeToken(
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        ),
      ).toBe(false);
    });
  });

  describe('formatBuyAmount', () => {
    it('should format zero amount', () => {
      expect(enhancedSwapService.formatBuyAmount('0')).toBe('0');
    });

    it('should format very small amounts', () => {
      expect(enhancedSwapService.formatBuyAmount('0.00001')).toBe('< 0.0001');
    });

    it('should format small amounts with 4 decimals', () => {
      expect(enhancedSwapService.formatBuyAmount('0.12345')).toBe('0.1235');
    });

    it('should format medium amounts with 2 decimals', () => {
      expect(enhancedSwapService.formatBuyAmount('123.456')).toBe('123.46');
    });

    it('should format large amounts with locale string', () => {
      const result = enhancedSwapService.formatBuyAmount('1234567.89');
      expect(result).toContain('1,234,567');
    });

    it('should handle NaN', () => {
      expect(enhancedSwapService.formatBuyAmount('invalid')).toBe('0');
    });
  });

  describe('calculatePriceImpact', () => {
    it('should return low level for small impact', () => {
      const quote = { estimatedPriceImpact: '0.005' } as SwapQuote;
      const result = enhancedSwapService.calculatePriceImpact(quote);
      expect(result.level).toBe('low');
      expect(result.percent).toBe('0.50');
    });

    it('should return medium level for moderate impact', () => {
      const quote = { estimatedPriceImpact: '0.02' } as SwapQuote;
      const result = enhancedSwapService.calculatePriceImpact(quote);
      expect(result.level).toBe('medium');
    });

    it('should return high level for high impact', () => {
      const quote = { estimatedPriceImpact: '0.07' } as SwapQuote;
      const result = enhancedSwapService.calculatePriceImpact(quote);
      expect(result.level).toBe('high');
    });

    it('should return critical level for very high impact', () => {
      const quote = { estimatedPriceImpact: '0.15' } as SwapQuote;
      const result = enhancedSwapService.calculatePriceImpact(quote);
      expect(result.level).toBe('critical');
    });

    it('should handle undefined price impact', () => {
      const quote = {} as SwapQuote;
      const result = enhancedSwapService.calculatePriceImpact(quote);
      expect(result.percent).toBe('0.00');
      expect(result.level).toBe('low');
    });
  });

  describe('calculateAutoSlippage', () => {
    it('should return 0.5 for low price impact', () => {
      expect(enhancedSwapService.calculateAutoSlippage(0.1)).toBe(0.5);
    });

    it('should return 0.5 for moderate price impact', () => {
      expect(enhancedSwapService.calculateAutoSlippage(1)).toBe(0.5);
    });

    it('should return 1.0 for higher price impact', () => {
      expect(enhancedSwapService.calculateAutoSlippage(3)).toBe(1.0);
    });

    it('should return 3.0 for very high price impact', () => {
      expect(enhancedSwapService.calculateAutoSlippage(6)).toBe(3.0);
    });

    it('should add slippage for high volatility', () => {
      expect(enhancedSwapService.calculateAutoSlippage(0.1, 10)).toBe(1.0);
    });

    it('should not exceed 5%', () => {
      // priceImpact > 5 gives 3.0, volatility > 5 adds 0.5 = 3.5, max is 5.0
      expect(enhancedSwapService.calculateAutoSlippage(10, 20)).toBe(3.5);
      // 최대 캡 동작 확인
      expect(
        enhancedSwapService.calculateAutoSlippage(10, 20),
      ).toBeLessThanOrEqual(5.0);
    });
  });

  describe('getWethAddress', () => {
    it('should return WETH address for Ethereum', () => {
      const address = enhancedSwapService.getWethAddress(1);
      expect(address).toBe('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
    });

    it('should return WMATIC address for Polygon', () => {
      const address = enhancedSwapService.getWethAddress(137);
      expect(address).toBe('0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270');
    });

    it('should return undefined for unsupported chain', () => {
      const address = enhancedSwapService.getWethAddress(999999);
      expect(address).toBeUndefined();
    });
  });

  describe('getPrice', () => {
    it('should return null for unsupported chain', async () => {
      const result = await enhancedSwapService.getPrice(
        {
          sellToken: SWAP_TOKENS[1][0],
          buyToken: SWAP_TOKENS[1][1],
          sellAmount: '1',
          takerAddress: '0x1234567890123456789012345678901234567890',
        },
        11155111,
      );
      expect(result).toBeNull();
    });

    it('should fetch price for supported chain', async () => {
      const mockResponse = {
        price: '1.5',
        buyAmount: '1500000',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await enhancedSwapService.getPrice(
        {
          sellToken: SWAP_TOKENS[1][0],
          buyToken: SWAP_TOKENS[1][1],
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

      const result = await enhancedSwapService.getPrice(
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
      const result = await enhancedSwapService.getQuote(
        {
          sellToken: SWAP_TOKENS[1][0],
          buyToken: SWAP_TOKENS[1][1],
          sellAmount: '1',
          takerAddress: '0x1234567890123456789012345678901234567890',
        },
        11155111,
      );
      expect(result).toBeNull();
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
      expect(SWAP_TOKENS[1][0].symbol).toBe('ETH');
      expect(SWAP_TOKENS[1][0].isNative).toBe(true);
      expect(SWAP_TOKENS[137][0].symbol).toBe('MATIC');
      expect(SWAP_TOKENS[137][0].isNative).toBe(true);
    });

    it('should include popular tokens on Ethereum', () => {
      const ethTokens = SWAP_TOKENS[1];
      const symbols = ethTokens.map(t => t.symbol);

      expect(symbols).toContain('ETH');
      expect(symbols).toContain('USDC');
      expect(symbols).toContain('USDT');
      expect(symbols).toContain('WETH');
    });
  });

  describe('getQuote additional tests', () => {
    it('should handle fetch error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error'),
      );

      await expect(
        enhancedSwapService.getQuote(
          {
            sellToken: SWAP_TOKENS[1][0],
            buyToken: SWAP_TOKENS[1][1],
            sellAmount: '1',
            takerAddress: '0x1234567890123456789012345678901234567890',
          },
          1,
        ),
      ).rejects.toThrow();
    });

    it('should handle API error response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ reason: 'Invalid token' }),
      });

      await expect(
        enhancedSwapService.getQuote(
          {
            sellToken: SWAP_TOKENS[1][0],
            buyToken: SWAP_TOKENS[1][1],
            sellAmount: '1',
            takerAddress: '0x1234567890123456789012345678901234567890',
          },
          1,
        ),
      ).rejects.toThrow('Invalid token');
    });
  });

  describe('getPrice additional tests', () => {
    it('should handle network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const result = await enhancedSwapService.getPrice(
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

  describe('getWethAddress additional tests', () => {
    it('should return WETH address for Arbitrum', () => {
      const address = enhancedSwapService.getWethAddress(42161);
      expect(address).toBeDefined();
    });

    it('should return WETH address for Optimism', () => {
      const address = enhancedSwapService.getWethAddress(10);
      expect(address).toBeDefined();
    });

    it('should return WETH address for Base', () => {
      const address = enhancedSwapService.getWethAddress(8453);
      expect(address).toBeDefined();
    });
  });

  describe('NATIVE_TOKEN_ADDRESS', () => {
    it('should be a valid address', () => {
      expect(NATIVE_TOKEN_ADDRESS).toMatch(/^0x[eE]{40}$/);
    });
  });

  describe('searchTokens', () => {
    it('should search tokens by symbol', () => {
      const result = enhancedSwapService.searchTokens(1, 'ETH');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].symbol).toContain('ETH');
    });

    it('should search tokens by name', () => {
      const result = enhancedSwapService.searchTokens(1, 'Ethereum');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should search tokens by address', () => {
      const result = enhancedSwapService.searchTokens(1, NATIVE_TOKEN_ADDRESS);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty for no match', () => {
      const result = enhancedSwapService.searchTokens(1, 'NONEXISTENT12345');
      expect(result).toEqual([]);
    });

    it('should be case insensitive', () => {
      const result1 = enhancedSwapService.searchTokens(1, 'usdc');
      const result2 = enhancedSwapService.searchTokens(1, 'USDC');
      expect(result1).toEqual(result2);
    });
  });

  describe('findTokenByAddress', () => {
    it('should find token by address', () => {
      const token = enhancedSwapService.findTokenByAddress(
        1,
        NATIVE_TOKEN_ADDRESS,
      );
      expect(token).toBeDefined();
      expect(token?.symbol).toBe('ETH');
    });

    it('should return undefined for unknown address', () => {
      const token = enhancedSwapService.findTokenByAddress(
        1,
        '0x0000000000000000000000000000000000000001',
      );
      expect(token).toBeUndefined();
    });

    it('should be case insensitive', () => {
      const token = enhancedSwapService.findTokenByAddress(
        1,
        NATIVE_TOKEN_ADDRESS.toLowerCase(),
      );
      expect(token).toBeDefined();
    });
  });

  describe('getTokenPrice', () => {
    it('should fetch token price', async () => {
      const mockPrice = {
        ethereum: { usd: 2500, usd_24h_change: 1.5 },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPrice),
      });

      const result = await enhancedSwapService.getTokenPrice('ethereum');
      expect(result).toEqual({ usd: 2500, usd24hChange: 1.5 });
    });

    it('should return null on API error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      const result = await enhancedSwapService.getTokenPrice(
        'nonexistent-token',
      );
      expect(result).toBeNull();
    });

    it('should return null when token not in response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await enhancedSwapService.getTokenPrice('unknown-token');
      expect(result).toBeNull();
    });

    it('should handle fetch error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const result = await enhancedSwapService.getTokenPrice('ethereum-error');
      expect(result).toBeNull();
    });
  });

  describe('getTokenPrices', () => {
    it('should fetch multiple token prices', async () => {
      const mockPrices = {
        ethereum: { usd: 2500, usd_24h_change: 1.5 },
        bitcoin: { usd: 45000, usd_24h_change: 2.0 },
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPrices),
      });

      const result = await enhancedSwapService.getTokenPrices([
        'ethereum',
        'bitcoin',
      ]);
      expect(result.ethereum).toBeDefined();
      expect(result.bitcoin).toBeDefined();
    });

    it('should return empty object for empty input', async () => {
      const result = await enhancedSwapService.getTokenPrices([]);
      expect(result).toEqual({});
    });

    it('should return empty object on API error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
      });

      const result = await enhancedSwapService.getTokenPrices(['ethereum']);
      expect(result).toEqual({});
    });

    it('should handle fetch error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const result = await enhancedSwapService.getTokenPrices(['ethereum']);
      expect(result).toEqual({});
    });

    it('should filter out empty ids', async () => {
      const result = await enhancedSwapService.getTokenPrices(['', '', '']);
      expect(result).toEqual({});
    });
  });

  describe('getQuote - full flow tests', () => {
    it('should return enhanced quote with all fields', async () => {
      const mockQuote = {
        price: '1.5',
        buyAmount: '1500000000',
        sellAmount: '1000000000000000000',
        gas: '200000',
        gasPrice: '50000000000',
        sources: [
          { name: 'Uniswap', proportion: '0.7' },
          { name: 'SushiSwap', proportion: '0.3' },
        ],
        to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
        data: '0x1234',
        estimatedPriceImpact: '0.01',
      };

      // getQuote 호출
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockQuote),
      });

      // getTokenPrice 호출 (enhanceQuote 내에서)
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ethereum: { usd: 2500 } }),
      });

      const result = await enhancedSwapService.getQuote(
        {
          sellToken: SWAP_TOKENS[1][0],
          buyToken: SWAP_TOKENS[1][1],
          sellAmount: '1',
          takerAddress: '0x1234567890123456789012345678901234567890',
          slippagePercentage: 0.5,
        },
        1,
      );

      expect(result).not.toBeNull();
      expect(result?.price).toBe('1.5');
      expect(result?.route).toBeDefined();
    });
  });

  describe('getQuote - error handling', () => {
    it('should throw on network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network'));

      await expect(
        enhancedSwapService.getQuote(
          {
            sellToken: SWAP_TOKENS[1][0],
            buyToken: SWAP_TOKENS[1][1],
            sellAmount: '1',
            takerAddress: '0x1234567890123456789012345678901234567890',
          },
          1,
        ),
      ).rejects.toThrow();
    });
  });

  describe('calculateAutoSlippage - edge cases', () => {
    it('should handle boundary conditions', () => {
      expect(enhancedSwapService.calculateAutoSlippage(0)).toBe(0.5);
      expect(enhancedSwapService.calculateAutoSlippage(0.5)).toBe(0.5);
      expect(enhancedSwapService.calculateAutoSlippage(2)).toBe(0.5);
      expect(enhancedSwapService.calculateAutoSlippage(2.1)).toBe(1.0);
    });

    it('should cap at maximum 5%', () => {
      expect(
        enhancedSwapService.calculateAutoSlippage(100, 100),
      ).toBeLessThanOrEqual(5.0);
    });
  });
});
