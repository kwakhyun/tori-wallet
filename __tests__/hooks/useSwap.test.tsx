/**
 * Tori Wallet - useSwap Hook Tests
 */

import { renderHook, act } from '@testing-library/react-native';
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
  },
}));

jest.mock('../../src/services/chainClient', () => ({
  chainClient: {
    getClient: jest.fn().mockReturnValue({
      readContract: jest.fn().mockResolvedValue(BigInt(0)),
    }),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
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

    act(() => {
      result.current.setSellAmount('1.0');
    });

    // getQuote should be callable
    await act(async () => {
      const quote = await result.current.getQuote();
      // Quote may be null if tokens are not set properly
      expect(quote === null || quote !== undefined).toBe(true);
    });
  });
});
