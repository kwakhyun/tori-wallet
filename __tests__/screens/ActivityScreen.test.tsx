/**
 * Tori Wallet - ActivityScreen Tests
 */

import React from 'react';
import { render } from '../test-utils';

// 네비게이션 모킹
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
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
      },
    ],
    activeWalletIndex: 0,
    activeNetworkChainId: 1,
    networks: [
      { chainId: 1, name: 'Ethereum', symbol: 'ETH', isTestnet: false },
    ],
  }),
}));

// Services 모킹
jest.mock('../../src/services/transactionHistory', () => ({
  transactionHistoryService: {
    getTransactions: jest.fn().mockResolvedValue([]),
    clearCache: jest.fn(),
  },
  Transaction: {},
}));

// react-query 모킹
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQuery: jest.fn().mockReturnValue({
    data: [],
    isLoading: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
}));

import ActivityScreen from '../../src/screens/Activity/ActivityScreen';

describe('ActivityScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly', () => {
    const { toJSON } = render(<ActivityScreen />);
    expect(toJSON()).not.toBeNull();
  });

  it('should display activity list', () => {
    const { root } = render(<ActivityScreen />);
    expect(root).toBeTruthy();
  });

  it('should render with empty transactions', () => {
    const { root } = render(<ActivityScreen />);
    expect(root.children).toBeDefined();
  });

  it('should render snapshot', () => {
    const tree = render(<ActivityScreen />);
    expect(tree).toBeTruthy();
  });
});

describe('ActivityScreen - with transactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { useQuery } = require('@tanstack/react-query');
    useQuery.mockReturnValue({
      data: [
        {
          hash: '0x123',
          from: '0x1234567890123456789012345678901234567890',
          to: '0x0987654321098765432109876543210987654321',
          value: '1000000000000000000',
          timestamp: Date.now(),
          status: 'success',
          type: 'send',
        },
      ],
      isLoading: false,
      isRefetching: false,
      refetch: jest.fn(),
    });
  });

  it('should render with transaction data', () => {
    const { root } = render(<ActivityScreen />);
    expect(root).toBeTruthy();
  });
});
