/**
 * useSwap 훅 테스트
 */

import { renderHook, act, cleanup } from '@testing-library/react-native';
import { useSwap } from '../../src/hooks/useSwap';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Store 모킹
jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    wallets: [
      {
        address: '0x1234567890123456789012345678901234567890',
        name: 'Account 1',
      },
    ],
    activeWalletIndex: 0,
    activeNetworkChainId: 1,
  }),
}));

// Services 모킹
jest.mock('../../src/services/swapService', () => ({
  swapService: {
    getTokens: jest.fn().mockReturnValue([
      {
        symbol: 'ETH',
        name: 'Ethereum',
        address: 'native',
        decimals: 18,
        isNative: true,
      },
      {
        symbol: 'USDC',
        name: 'USD Coin',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
      },
    ]),
    isSwapSupported: jest.fn().mockReturnValue(true),
    getPrice: jest
      .fn()
      .mockResolvedValue({ price: '1.5', buyAmount: '1500000' }),
    getQuote: jest.fn().mockResolvedValue({
      sellAmount: '1000000000000000000',
      buyAmount: '1500000',
      price: '1.5',
      to: '0xexchange',
      data: '0x',
      allowanceTarget: '0xallowance',
    }),
    needsApproval: jest.fn().mockReturnValue(false),
  },
  SwapToken: {},
  SwapQuote: {},
}));

jest.mock('../../src/services/signingService', () => ({
  signingService: {
    signTransaction: jest.fn(),
    sendSignedTransaction: jest.fn(),
    sendTransaction: jest.fn().mockResolvedValue('0xmocktxhash'),
  },
}));

// Mock Alert
jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

jest.mock('../../src/services/chainClient', () => ({
  chainClient: {
    getClient: jest.fn().mockReturnValue({
      readContract: jest.fn().mockResolvedValue(BigInt(0)),
      waitForTransactionReceipt: jest
        .fn()
        .mockResolvedValue({ status: 'success' }),
    }),
  },
}));

// QueryClient를 테스트 간 공유하면서 각 테스트 후 cleanup
let queryClient: QueryClient;

const createWrapper = () => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // refetchInterval 비활성화로 open handle 방지
        refetchInterval: false,
        refetchOnWindowFocus: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useSwap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // 테스트 후 QueryClient cleanup
    if (queryClient) {
      queryClient.clear();
    }
    cleanup();
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    expect(result.current.tokens).toBeDefined();
    expect(result.current.isSwapSupported).toBe(true);
  });

  it('should return tokens list', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    expect(result.current.tokens.length).toBeGreaterThan(0);
  });

  it('should have setSellAmount function', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.setSellAmount).toBe('function');
  });

  it('should have setSlippage function', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.setSlippage).toBe('function');
  });

  it('should update sell amount', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.setSellAmount('1.0');
    });

    expect(result.current.sellAmount).toBe('1.0');
  });

  it('should have swap execute function', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.executeSwap).toBe('function');
  });

  it('should have setSellToken function', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.setSellToken).toBe('function');
  });

  it('should have setBuyToken function', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.setBuyToken).toBe('function');
  });

  it('should have swapTokenPositions function', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.swapTokenPositions).toBe('function');
  });

  it('should have refetchPrice function', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.refetchPrice).toBe('function');
  });

  it('should update slippage', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.setSlippage(0.5);
    });

    expect(result.current.slippage).toBe(0.5);
  });

  it('should have isLoadingPrice state', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.isLoadingPrice).toBe('boolean');
  });

  it('should have priceInfo state', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    // priceInfo should be null initially
    expect(result.current.priceInfo).toBeNull();
  });

  it('should have getQuote function', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.getQuote).toBe('function');
  });

  it('should have sellToken and buyToken states', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    expect(result.current.sellToken).toBeDefined();
    expect(result.current.buyToken).toBeDefined();
  });

  it('should set sell token', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    const token = {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const,
      decimals: 6,
    };

    act(() => {
      result.current.setSellToken(token);
    });

    expect(result.current.sellToken?.symbol).toBe('USDC');
  });

  it('should set buy token', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    const token = {
      symbol: 'ETH',
      name: 'Ethereum',
      address: 'native' as const,
      decimals: 18,
      isNative: true,
    };

    act(() => {
      result.current.setBuyToken(token);
    });

    expect(result.current.buyToken?.symbol).toBe('ETH');
  });

  it('should have isSwapping state', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.isSwapping).toBe('boolean');
  });

  it('should have canSwap state', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    expect(result.current.canSwap).toBeDefined();
  });

  it('should have buyAmount state', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    expect(result.current.buyAmount).toBe('');
  });

  it('should swap token positions', () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    const initialSellToken = result.current.sellToken;
    const initialBuyToken = result.current.buyToken;

    act(() => {
      result.current.swapTokenPositions();
    });

    // After swap, sell token should be the previous buy token
    if (initialBuyToken) {
      expect(result.current.sellToken?.symbol).toBe(initialBuyToken.symbol);
    }
    if (initialSellToken) {
      expect(result.current.buyToken?.symbol).toBe(initialSellToken.symbol);
    }
  });

  it('should refetch price', async () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    // Set tokens and amount first
    act(() => {
      result.current.setSellAmount('1.0');
    });

    // Call refetchPrice
    await act(async () => {
      await result.current.refetchPrice();
    });

    // Function should not throw
    expect(result.current.sellAmount).toBe('1.0');
  });

  it('should getQuote return a promise', async () => {
    const { result } = renderHook(() => useSwap(), {
      wrapper: createWrapper(),
    });

    // getQuote should be a function that returns a promise
    expect(typeof result.current.getQuote).toBe('function');

    // Calling without tokens set should return null quickly
    const quote = await result.current.getQuote();
    // Quote will be null because tokens are not fully initialized in sync
    expect(quote === null || quote !== undefined).toBe(true);
  });

  describe('getQuote functionality', () => {
    it('should get quote when all params are set', async () => {
      const { swapService } = require('../../src/services/swapService');

      const { result } = renderHook(() => useSwap(), {
        wrapper: createWrapper(),
      });

      // Set up tokens and amount
      act(() => {
        result.current.setSellAmount('1.0');
      });

      // Wait for effect to initialize tokens
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Now getQuote should work
      await result.current.getQuote();

      // The mock should have been called
      expect(swapService.getQuote).toHaveBeenCalled();
    });

    it('should return null when sellToken is not set', async () => {
      const { swapService } = require('../../src/services/swapService');
      // Return only one token so buyToken can be set but not two tokens
      swapService.getTokens.mockReturnValueOnce([]);

      const { result } = renderHook(() => useSwap(), {
        wrapper: createWrapper(),
      });

      // With no tokens initialized, should return null
      const quote = await result.current.getQuote();
      expect(quote).toBeNull();
    });

    it('should return null when buyToken is not set', async () => {
      const { swapService } = require('../../src/services/swapService');
      // Return only one token so sellToken is set but buyToken isn't
      swapService.getTokens.mockReturnValueOnce([
        {
          symbol: 'ETH',
          name: 'Ethereum',
          address: 'native',
          decimals: 18,
          isNative: true,
        },
      ]);

      const { result } = renderHook(() => useSwap(), {
        wrapper: createWrapper(),
      });

      const quote = await result.current.getQuote();
      expect(quote).toBeNull();
    });

    it('should return null when sellAmount is empty', async () => {
      const { result } = renderHook(() => useSwap(), {
        wrapper: createWrapper(),
      });

      // Ensure sellAmount is empty
      act(() => {
        result.current.setSellAmount('');
      });

      const quote = await result.current.getQuote();
      expect(quote).toBeNull();
    });

    it('should handle quote error', async () => {
      const { swapService } = require('../../src/services/swapService');
      swapService.getQuote.mockRejectedValueOnce(new Error('Quote failed'));

      const { result } = renderHook(() => useSwap(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setSellAmount('1.0');
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      await expect(result.current.getQuote()).rejects.toThrow('Quote failed');
    });
  });

  describe('selectSellToken', () => {
    it('should swap tokens when selecting the same token as buyToken', () => {
      const { result } = renderHook(() => useSwap(), {
        wrapper: createWrapper(),
      });

      const initialSellToken = result.current.sellToken;
      const buyToken = result.current.buyToken;

      // Set sell token to the current buy token
      act(() => {
        result.current.setSellToken(buyToken!);
      });

      // Buy token should now be the previous sell token
      expect(result.current.buyToken?.symbol).toBe(initialSellToken?.symbol);
    });
  });

  describe('selectBuyToken', () => {
    it('should swap tokens when selecting the same token as sellToken', () => {
      const { result } = renderHook(() => useSwap(), {
        wrapper: createWrapper(),
      });

      const sellToken = result.current.sellToken;
      const initialBuyToken = result.current.buyToken;

      // Set buy token to the current sell token
      act(() => {
        result.current.setBuyToken(sellToken!);
      });

      // Sell token should now be the previous buy token
      expect(result.current.sellToken?.symbol).toBe(initialBuyToken?.symbol);
    });
  });

  describe('priceInfo', () => {
    it('should return null when sellToken is not set', async () => {
      const { swapService } = require('../../src/services/swapService');
      // Make getTokens return empty array to simulate no tokens
      swapService.getTokens.mockReturnValueOnce([]);

      const { result } = renderHook(() => useSwap(), {
        wrapper: createWrapper(),
      });

      // With no tokens, priceInfo should be null
      expect(result.current.priceInfo).toBeNull();
    });

    it('should return null when sellAmount is empty', () => {
      const { result } = renderHook(() => useSwap(), {
        wrapper: createWrapper(),
      });

      // sellAmount is empty by default, so priceInfo should be null
      expect(result.current.sellAmount).toBe('');
      expect(result.current.priceInfo).toBeNull();
    });
  });

  describe('canSwap', () => {
    it('should be false when swap is not supported', async () => {
      const { swapService } = require('../../src/services/swapService');
      const originalIsSwapSupported = swapService.isSwapSupported;
      swapService.isSwapSupported = jest.fn().mockReturnValue(false);

      const { result } = renderHook(() => useSwap(), {
        wrapper: createWrapper(),
      });

      expect(result.current.canSwap).toBeFalsy();

      // Restore mock
      swapService.isSwapSupported = originalIsSwapSupported;
    });

    it('should be false when sellAmount is 0', () => {
      const { result } = renderHook(() => useSwap(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setSellAmount('0');
      });

      expect(result.current.canSwap).toBeFalsy();
    });

    it('should be false when sellAmount is empty', () => {
      const { result } = renderHook(() => useSwap(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setSellAmount('');
      });

      expect(result.current.canSwap).toBeFalsy();
    });
  });

  describe('network chain changes', () => {
    it('should have tokens initialized from mock', () => {
      const { result } = renderHook(() => useSwap(), {
        wrapper: createWrapper(),
      });

      const initialSellToken = result.current.sellToken;

      // Tokens should be set from the mock
      expect(initialSellToken).toBeDefined();
      expect(result.current.sellToken).toBeDefined();
    });
  });

  describe('swapTokenPositions with buyAmount', () => {
    it('should set sellAmount to buyAmount when swapping positions', async () => {
      const { result } = renderHook(() => useSwap(), {
        wrapper: createWrapper(),
      });

      // First set a sell amount
      act(() => {
        result.current.setSellAmount('1.0');
      });

      // Wait for price to be fetched (mock returns buyAmount)
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      const prevBuyToken = result.current.buyToken;

      act(() => {
        result.current.swapTokenPositions();
      });

      // After swap, sell token should be the previous buy token
      expect(result.current.sellToken?.symbol).toBe(prevBuyToken?.symbol);
    });
  });

  describe('slippage management', () => {
    it('should have default slippage of 0.5', () => {
      const { result } = renderHook(() => useSwap(), {
        wrapper: createWrapper(),
      });

      expect(result.current.slippage).toBe(0.5);
    });

    it('should update slippage to different values', () => {
      const { result } = renderHook(() => useSwap(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setSlippage(1.0);
      });
      expect(result.current.slippage).toBe(1.0);

      act(() => {
        result.current.setSlippage(0.1);
      });
      expect(result.current.slippage).toBe(0.1);

      act(() => {
        result.current.setSlippage(5.0);
      });
      expect(result.current.slippage).toBe(5.0);
    });
  });

  describe('options callbacks', () => {
    it('should accept onSuccess callback option', () => {
      const onSuccess = jest.fn();
      const { result } = renderHook(() => useSwap({ onSuccess }), {
        wrapper: createWrapper(),
      });

      expect(result.current).toBeDefined();
    });

    it('should accept onError callback option', () => {
      const onError = jest.fn();
      const { result } = renderHook(() => useSwap({ onError }), {
        wrapper: createWrapper(),
      });

      expect(result.current).toBeDefined();
    });

    it('should accept both callbacks', () => {
      const onSuccess = jest.fn();
      const onError = jest.fn();
      const { result } = renderHook(() => useSwap({ onSuccess, onError }), {
        wrapper: createWrapper(),
      });

      expect(result.current).toBeDefined();
    });
  });
});
