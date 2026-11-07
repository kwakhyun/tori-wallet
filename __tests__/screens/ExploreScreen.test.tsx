/**
 * ExploreScreen 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '../test-utils';
import { usePreferencesStore } from '../../src/store/preferencesStore';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: jest.fn(),
    }),
  };
});

// 디바운스 없이 바로 검색
jest.mock('../../src/hooks/useDebounce', () => ({
  useDebounce: (value: unknown) => value,
}));

const mockGetTopCoins = jest.fn();
const mockSearchCoins = jest.fn();

jest.mock('../../src/services/coinService', () => {
  class MockRateLimitError extends Error {}
  return {
    RateLimitError: MockRateLimitError,
    coinService: {
      getTopCoins: (...args: unknown[]) => mockGetTopCoins(...args),
      searchCoins: (...args: unknown[]) => mockSearchCoins(...args),
      setRateLimitCallback: jest.fn(),
      formatPercentage: (value: number | null | undefined) =>
        value === null || value === undefined
          ? '—'
          : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`,
    },
  };
});

import ExploreScreen from '../../src/screens/Explore/ExploreScreen';
import { RateLimitError } from '../../src/services/coinService';

const COINS = [
  {
    id: 'bitcoin',
    symbol: 'btc',
    name: 'Bitcoin',
    current_price: 50000,
    price_change_percentage_24h: 2.5,
    market_cap: 1000000000000,
    market_cap_rank: 1,
    image: 'https://example.com/btc.png',
  },
  {
    id: 'ethereum',
    symbol: 'eth',
    name: 'Ethereum',
    current_price: 3000,
    price_change_percentage_24h: -1.5,
    market_cap: 500000000000,
    market_cap_rank: 2,
    image: 'https://example.com/eth.png',
  },
];

describe('ExploreScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTopCoins.mockResolvedValue(COINS);
    mockSearchCoins.mockResolvedValue({ coins: [] });
    usePreferencesStore.setState({ currency: 'USD', hideBalances: false });
  });

  it('renders the top coin list with display-currency prices', async () => {
    render(<ExploreScreen />);
    await waitFor(() => screen.getByTestId('explore-coin-bitcoin'));
    expect(screen.getByText('$50,000.00')).toBeTruthy();
    expect(screen.getByText('-1.50%')).toBeTruthy();
  });

  it('opens CoinDetail when a coin is tapped', async () => {
    render(<ExploreScreen />);
    await waitFor(() => screen.getByTestId('explore-coin-ethereum'));
    fireEvent.press(screen.getByTestId('explore-coin-ethereum'));
    expect(mockNavigate).toHaveBeenCalledWith('CoinDetail', {
      coinId: 'ethereum',
      coinName: 'Ethereum',
      coinSymbol: 'eth',
      coinImage: 'https://example.com/eth.png',
    });
  });

  it('shows an error with retry instead of a blank list when loading fails', async () => {
    mockGetTopCoins.mockRejectedValueOnce(new Error('offline'));
    render(<ExploreScreen />);
    await waitFor(() => screen.getByTestId('explore-error'));

    fireEvent.press(screen.getByTestId('explore-error-retry'));
    await waitFor(() => screen.getByTestId('explore-coin-bitcoin'));
    expect(mockGetTopCoins).toHaveBeenCalledTimes(2);
  });

  it('asks for at least 2 characters instead of saying "no results"', async () => {
    render(<ExploreScreen />);
    await waitFor(() => screen.getByTestId('explore-coin-bitcoin'));
    fireEvent.changeText(screen.getByTestId('explore-search-input'), 'b');
    expect(screen.getByTestId('explore-search-hint')).toHaveTextContent(
      '2글자 이상 입력하면 검색합니다',
    );
    expect(screen.queryByText('검색 결과가 없습니다')).toBeNull();
    expect(mockSearchCoins).not.toHaveBeenCalled();
  });

  it('distinguishes "no results" from a search error', async () => {
    render(<ExploreScreen />);
    await waitFor(() => screen.getByTestId('explore-coin-bitcoin'));

    fireEvent.changeText(screen.getByTestId('explore-search-input'), 'zzzz');
    await waitFor(() => screen.getByTestId('explore-search-empty'));
    expect(screen.queryByTestId('explore-search-error')).toBeNull();

    mockSearchCoins.mockRejectedValueOnce(new Error('network'));
    fireEvent.changeText(screen.getByTestId('explore-search-input'), 'pepe');
    await waitFor(() => screen.getByTestId('explore-search-error'));
    expect(screen.getByText('검색하지 못했습니다')).toBeTruthy();
    expect(screen.queryByTestId('explore-search-empty')).toBeNull();
  });

  it('explains rate limits and lets the user retry', async () => {
    render(<ExploreScreen />);
    await waitFor(() => screen.getByTestId('explore-coin-bitcoin'));

    mockSearchCoins.mockRejectedValueOnce(new RateLimitError());
    fireEvent.changeText(screen.getByTestId('explore-search-input'), 'sol');
    await waitFor(() => screen.getByText('검색 요청이 너무 많습니다'));

    mockSearchCoins.mockResolvedValueOnce({
      coins: [
        {
          id: 'solana',
          name: 'Solana',
          symbol: 'sol',
          thumb: 'https://example.com/sol.png',
          market_cap_rank: 5,
        },
      ],
    });
    fireEvent.press(screen.getByTestId('explore-search-error-retry'));
    await waitFor(() => screen.getByTestId('explore-search-solana'));
  });

  it('clears the search with an accessible button', async () => {
    render(<ExploreScreen />);
    await waitFor(() => screen.getByTestId('explore-coin-bitcoin'));
    fireEvent.changeText(screen.getByTestId('explore-search-input'), 'b');
    fireEvent.press(screen.getByLabelText('검색어 지우기'));
    await waitFor(() => screen.getByTestId('explore-coin-bitcoin'));
  });
});
