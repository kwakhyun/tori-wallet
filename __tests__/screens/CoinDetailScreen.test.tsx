/**
 * 코인 상세 스크린 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '../test-utils';
import { usePreferencesStore } from '../../src/store/preferencesStore';

const mockNavigate = jest.fn();
const ETH_PARAMS = {
  coinId: 'ethereum',
  coinName: 'Ethereum',
  coinSymbol: 'eth',
  coinImage: 'https://example.com/eth.png',
};
let mockRouteParams: Record<string, string> = ETH_PARAMS;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
    canGoBack: () => true,
  }),
  useRoute: () => ({ params: mockRouteParams }),
}));

const ADDRESS = '0x1234567890123456789012345678901234567890';
jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    wallets: [{ address: ADDRESS, name: 'Account 1' }],
    activeWalletIndex: 0,
    activeNetworkChainId: 42161,
    networks: [{ chainId: 42161, name: 'Arbitrum One', symbol: 'ETH' }],
  }),
}));

const mockGetCoinDetail = jest.fn();
const mockGetPriceHistory = jest.fn();
jest.mock('../../src/services/coinService', () => ({
  coinService: {
    getCoinDetail: (...args: unknown[]) => mockGetCoinDetail(...args),
    getPriceHistory: (...args: unknown[]) => mockGetPriceHistory(...args),
    setRateLimitCallback: jest.fn(),
  },
}));

const mockGetTokens = jest.fn();
jest.mock('../../src/services/tokenService', () => ({
  tokenService: {
    getTokens: (...args: unknown[]) => mockGetTokens(...args),
  },
}));

const mockShowBuyProviderAlert = jest.fn();
jest.mock('../../src/services/buyService', () => ({
  showBuyProviderAlert: (...args: unknown[]) =>
    mockShowBuyProviderAlert(...args),
}));

jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const make = (name: string) => (props: any) =>
    ReactLib.createElement(name, props, props.children);
  return {
    __esModule: true,
    default: make('Svg'),
    Svg: make('Svg'),
    Path: make('Path'),
    Line: make('Line'),
    Text: make('SvgText'),
    Defs: make('Defs'),
    LinearGradient: make('LinearGradient'),
    Stop: make('Stop'),
    Circle: make('Circle'),
  };
});

import CoinDetailScreen from '../../src/screens/CoinDetail/CoinDetailScreen';

const DETAIL = {
  id: 'ethereum',
  symbol: 'eth',
  name: 'Ethereum',
  market_data: {
    current_price: { usd: 3000 },
    price_change_percentage_24h: 1.25,
    market_cap: { usd: 360000000000 },
    total_volume: { usd: 15000000000 },
    high_24h: { usd: 3100 },
    low_24h: { usd: 2900 },
    ath: { usd: 4800 },
    circulating_supply: 120000000,
    price_change_percentage_7d: -2,
    price_change_percentage_30d: 5,
  },
};

const history = (base: number) => ({
  prices: [
    [1700000000000, base],
    [1700003600000, base + 10],
    [1700007200000, base + 5],
  ],
  market_caps: [],
  total_volumes: [],
});

describe('CoinDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = ETH_PARAMS;
    mockGetCoinDetail.mockResolvedValue(DETAIL);
    mockGetPriceHistory.mockImplementation((_id: string, days: string) =>
      Promise.resolve(history(days === '1' ? 2900 : 3000)),
    );
    mockGetTokens.mockResolvedValue([
      {
        symbol: 'ETH',
        name: 'Ethereum',
        address: 'native',
        decimals: 18,
        balance: '0.75',
        balanceRaw: '0.75',
        price: 3000,
        priceChange24h: 1,
        value: 2250,
        usdValue: 2250,
        priceAvailable: true,
        coingeckoId: 'ethereum',
      },
    ]);
    usePreferencesStore.setState({ currency: 'USD', hideBalances: false });
  });

  it('shows the price and an SVG price chart', async () => {
    render(<CoinDetailScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('coin-detail-price')).toHaveTextContent(
        '$3,000.00',
      );
      expect(screen.getByTestId('coin-detail-chart')).toBeTruthy();
    });
  });

  it('shows a loader while switching the time range', async () => {
    let resolveDay!: (value: unknown) => void;
    mockGetPriceHistory.mockImplementation((_id: string, days: string) =>
      days === '1'
        ? new Promise(resolve => {
            resolveDay = resolve;
          })
        : Promise.resolve(history(3000)),
    );
    render(<CoinDetailScreen />);
    await waitFor(() => screen.getByTestId('coin-detail-chart'));

    fireEvent.press(screen.getByTestId('coin-detail-range-1'));
    await waitFor(() => screen.getByTestId('coin-detail-chart-loading'));

    resolveDay(history(2900));
    await waitFor(() => {
      expect(screen.queryByTestId('coin-detail-chart-loading')).toBeNull();
    });
    expect(mockGetPriceHistory).toHaveBeenCalledWith('ethereum', '1');
  });

  it('shows holdings with Send/Swap when the asset is held on the active chain', async () => {
    render(<CoinDetailScreen />);
    await waitFor(() => screen.getByTestId('coin-detail-holding'));
    expect(screen.getByText('0.75 ETH')).toBeTruthy();
    expect(screen.getByText('$2,250.00')).toBeTruthy();

    fireEvent.press(screen.getByTestId('coin-detail-send'));
    expect(mockNavigate).toHaveBeenCalledWith('SendTransaction', {
      tokenAddress: undefined,
    });
    fireEvent.press(screen.getByTestId('coin-detail-swap'));
    expect(mockNavigate).toHaveBeenCalledWith('Swap');
  });

  it('hides holdings when the asset is not held', async () => {
    mockGetTokens.mockResolvedValue([]);
    render(<CoinDetailScreen />);
    await waitFor(() => screen.getByTestId('coin-detail-price'));
    expect(screen.queryByTestId('coin-detail-holding')).toBeNull();
  });

  it('passes the wallet address and chain id when the coin is on the active network', async () => {
    render(<CoinDetailScreen />);
    await waitFor(() => screen.getByTestId('coin-detail-holding'));
    fireEvent.press(screen.getByTestId('coin-detail-buy'));
    expect(mockShowBuyProviderAlert).toHaveBeenCalledWith(
      'eth',
      ADDRESS,
      undefined,
      42161,
    );
    expect(screen.queryByTestId('coin-detail-buy-hint')).toBeNull();
  });

  it('opens the buy flow for another chain coin without an EVM address or network', async () => {
    mockRouteParams = {
      coinId: 'bitcoin',
      coinName: 'Bitcoin',
      coinSymbol: 'btc',
      coinImage: '',
    };
    mockGetCoinDetail.mockResolvedValue({ ...DETAIL, id: 'bitcoin' });
    render(<CoinDetailScreen />);
    await waitFor(() => screen.getByTestId('coin-detail-buy-hint'));
    expect(screen.getByTestId('coin-detail-buy-hint')).toHaveTextContent(
      'Arbitrum One의 자산이 아니라 받을 주소를 결제 화면에서 직접 입력해야 합니다.',
    );
    fireEvent.press(screen.getByTestId('coin-detail-buy'));
    expect(mockShowBuyProviderAlert).toHaveBeenCalledWith('btc');
  });

  it('does not prefill the address before the token list has loaded', () => {
    mockGetTokens.mockReturnValue(new Promise(() => undefined));
    render(<CoinDetailScreen />);
    fireEvent.press(screen.getByTestId('coin-detail-buy'));
    expect(mockShowBuyProviderAlert).toHaveBeenCalledWith('eth');
  });

  it('shows an error with retry instead of $0.00 when details fail', async () => {
    mockGetCoinDetail.mockRejectedValueOnce(new Error('429'));
    render(<CoinDetailScreen />);
    await waitFor(() => screen.getByTestId('coin-detail-error'));
    expect(screen.queryByText('$0.00')).toBeNull();
    fireEvent.press(screen.getByTestId('coin-detail-error-retry'));
    await waitFor(() => screen.getByTestId('coin-detail-price'));
  });

  it('uses the shared accessible header', () => {
    render(<CoinDetailScreen />);
    expect(screen.getByLabelText('뒤로 가기')).toBeTruthy();
  });
});
