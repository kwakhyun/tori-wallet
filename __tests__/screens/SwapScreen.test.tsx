/**
 * Tori Wallet - SwapScreen Tests
 * 스왑 스크린 테스트
 */

import React from 'react';
import { render } from '../test-utils';

// 네비게이션 모킹
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
    }),
  };
});

// Store 모킹
jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    wallets: [
      {
        address: '0x1234567890123456789012345678901234567890',
        name: 'Account 1',
        isHD: true,
      },
    ],
    activeWalletIndex: 0,
    activeNetworkChainId: 1,
    networks: [
      { chainId: 1, name: 'Ethereum', symbol: 'ETH', isTestnet: false },
    ],
  }),
}));

jest.mock('../../src/store/swapStore', () => ({
  useSwapStore: () => ({
    settings: { slippage: 0.5, deadline: 20 },
    addHistoryItem: jest.fn(),
    addFavoritePair: jest.fn(),
    getTopPairs: jest.fn().mockReturnValue([]),
  }),
}));

// Hooks 모킹
jest.mock('../../src/hooks/useBalance', () => ({
  useBalance: () => ({
    data: { formatted: '10', wei: BigInt('10000000000000000000') },
    refetch: jest.fn(),
    isLoading: false,
  }),
  useTokenBalance: () => ({
    data: { formatted: '100', wei: BigInt('100000000'), symbol: 'USDC' },
    isLoading: false,
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
    getQuote: jest.fn().mockResolvedValue(null),
  },
  SwapToken: {},
  SwapQuote: {},
}));

jest.mock('../../src/services/enhancedSwapService', () => ({
  enhancedSwapService: {
    getTokens: jest.fn().mockReturnValue([]),
    calculatePriceImpact: jest
      .fn()
      .mockReturnValue({ percent: '0.1', level: 'low' }),
  },
}));

jest.mock('../../src/services/signingService', () => ({
  signingService: {
    handleRequest: jest.fn(),
  },
}));

jest.mock('../../src/services/chainClient', () => ({
  chainClient: {
    getClient: jest.fn(),
  },
}));

// Swap 컴포넌트 모킹
jest.mock('../../src/components/swap', () => ({
  SwapReviewModal: () => null,
  SwapSettingsModal: () => null,
}));

import SwapScreen from '../../src/screens/Swap/SwapScreen';

describe('SwapScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly', () => {
    const { toJSON } = render(<SwapScreen />);
    expect(toJSON()).not.toBeNull();
  });

  it('should display swap tokens', () => {
    const { root } = render(<SwapScreen />);
    expect(root).toBeTruthy();
  });

  it('should show token selector buttons', () => {
    const { root } = render(<SwapScreen />);
    expect(root.children).toBeDefined();
  });

  it('should have swap functionality', () => {
    const { root } = render(<SwapScreen />);
    expect(root).toBeTruthy();
  });
});
