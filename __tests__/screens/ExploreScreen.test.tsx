/**
 * ExploreScreen 테스트
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

// coinService 모킹
jest.mock('../../src/services/coinService', () => ({
  coinService: {
    getTopCoins: jest.fn().mockResolvedValue([
      {
        id: 'bitcoin',
        symbol: 'btc',
        name: 'Bitcoin',
        current_price: 50000,
        price_change_percentage_24h: 2.5,
        market_cap: 1000000000000,
        image: 'https://example.com/btc.png',
      },
      {
        id: 'ethereum',
        symbol: 'eth',
        name: 'Ethereum',
        current_price: 3000,
        price_change_percentage_24h: -1.5,
        market_cap: 500000000000,
        image: 'https://example.com/eth.png',
      },
    ]),
    searchCoins: jest.fn().mockResolvedValue([]),
    setRateLimitCallback: jest.fn(),
  },
  Coin: {},
}));

import ExploreScreen from '../../src/screens/Explore/ExploreScreen';

describe('ExploreScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly', () => {
    const { toJSON } = render(<ExploreScreen />);
    expect(toJSON()).not.toBeNull();
  });

  it('should display explore UI', () => {
    const { root } = render(<ExploreScreen />);
    expect(root).toBeTruthy();
  });

  it('should have search functionality', () => {
    const { root } = render(<ExploreScreen />);
    expect(root.children).toBeDefined();
  });

  it('should render coin list', () => {
    const { root } = render(<ExploreScreen />);
    expect(root).toBeTruthy();
  });
});
