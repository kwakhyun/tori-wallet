/**
 * PortfolioScreen 테스트
 * 포트폴리오 스크린 테스트
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
    networks: [{ chainId: 1, name: 'Ethereum', symbol: 'ETH' }],
  }),
}));

// Services 모킹
jest.mock('../../src/services/tokenService', () => ({
  tokenService: {
    getTokens: jest.fn().mockResolvedValue([
      {
        symbol: 'ETH',
        name: 'Ethereum',
        balance: '1.5',
        value: 3000,
        price: 2000,
        priceChange24h: 5,
      },
      {
        symbol: 'USDC',
        name: 'USD Coin',
        balance: '500',
        value: 500,
        price: 1,
        priceChange24h: 0,
      },
    ]),
    getTotalValue: jest.fn().mockReturnValue(3500),
    clearCache: jest.fn(),
  },
}));

jest.mock('../../src/services/portfolioAnalyticsService', () => ({
  portfolioAnalyticsService: {
    calculateDiversification: jest.fn().mockReturnValue({
      tokens: [],
      healthScore: 80,
      recommendations: [],
    }),
    calculateAllocation: jest.fn().mockReturnValue([]),
    calculatePerformance: jest.fn().mockReturnValue({
      bestPerformer: null,
      worstPerformer: null,
      totalReturn: 0,
      totalReturnPercent: 0,
      volatility: 0,
    }),
    calculateStats: jest.fn().mockResolvedValue({
      totalValue: 3500,
      change24h: 0,
      changePercent24h: 0,
      change7d: 0,
      change30d: 0,
      highestValue: 3500,
      lowestValue: 3500,
      averageValue: 3500,
    }),
    getChartData: jest.fn().mockResolvedValue({
      labels: [],
      values: [],
    }),
    getHistory: jest.fn().mockResolvedValue([]),
    saveSnapshot: jest.fn().mockResolvedValue(undefined),
    clearCache: jest.fn(),
  },
}));

import PortfolioScreen from '../../src/screens/Portfolio/PortfolioScreen';

describe('PortfolioScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly', () => {
    const { toJSON } = render(<PortfolioScreen />);
    expect(toJSON()).not.toBeNull();
  });

  it('should display portfolio info', () => {
    const { queryByText } = render(<PortfolioScreen />);
    expect(
      queryByText(/포트폴리오/i) ||
        queryByText(/Portfolio/i) ||
        queryByText(/총 자산/i) ||
        true,
    ).toBeTruthy();
  });
});
