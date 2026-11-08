/**
 * PortfolioScreen 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '../test-utils';
import { usePreferencesStore } from '../../src/store/preferencesStore';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
    }),
  };
});

let mockChainId = 1;
jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    wallets: [
      {
        address: '0x1234567890123456789012345678901234567890',
        name: 'Account 1',
      },
    ],
    activeWalletIndex: 0,
    activeNetworkChainId: mockChainId,
    networks: [
      { chainId: 1, name: 'Ethereum', symbol: 'ETH', isTestnet: false },
      { chainId: 11155111, name: 'Sepolia', symbol: 'ETH', isTestnet: true },
    ],
  }),
}));

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const TOKENS = [
  {
    symbol: 'ETH',
    name: 'Ethereum',
    address: 'native',
    decimals: 18,
    balance: '1.5',
    balanceRaw: '1.5',
    value: 3000,
    usdValue: 3000,
    price: 2000,
    priceChange24h: 5,
    priceAvailable: true,
    coingeckoId: 'ethereum',
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: USDC,
    decimals: 6,
    balance: '500',
    balanceRaw: '500',
    value: 500,
    usdValue: 500,
    price: 1,
    priceChange24h: 0,
    priceAvailable: true,
    coingeckoId: 'usd-coin',
  },
];

const mockGetTokens = jest.fn();
jest.mock('../../src/services/tokenService', () => ({
  tokenService: {
    getTokens: (...args: unknown[]) => mockGetTokens(...args),
    getTotalValue: (tokens: { usdValue?: number | null }[]) =>
      tokens.reduce((sum, t) => sum + (t.usdValue ?? 0), 0),
    isTotalComplete: () => true,
  },
}));

const mockCalculateStats = jest.fn();
const mockCalculatePerformance = jest.fn();
jest.mock('../../src/services/portfolioAnalyticsService', () => ({
  portfolioAnalyticsService: {
    calculateAllocation: jest.fn().mockReturnValue([]),
    calculatePerformance: (...args: unknown[]) =>
      mockCalculatePerformance(...args),
    calculateStats: (...args: unknown[]) => mockCalculateStats(...args),
    getChartData: jest.fn().mockResolvedValue({ labels: [], values: [] }),
    saveSnapshot: jest.fn().mockResolvedValue(true),
  },
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
    G: make('G'),
  };
});

import PortfolioScreen from '../../src/screens/Portfolio/PortfolioScreen';

describe('PortfolioScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChainId = 1;
    mockGetTokens.mockResolvedValue(TOKENS);
    mockCalculateStats.mockResolvedValue({
      totalValue: 3500,
      change24h: 100,
      changePercent24h: 2.94,
      change7d: null,
      changePercent7d: null,
      change30d: null,
      changePercent30d: null,
      highestValue: 3600,
      lowestValue: 3000,
      averageValue: 3300,
    });
    mockCalculatePerformance.mockReturnValue({
      bestPerformer: { symbol: 'ETH', change: 5 },
      worstPerformer: { symbol: 'USDC', change: 0 },
      totalReturn: 4,
      totalReturnPercent: 4,
      volatility: 2.5,
    });
    usePreferencesStore.setState({ currency: 'USD', hideBalances: false });
  });

  it('shows the total value with the display currency', async () => {
    render(<PortfolioScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('portfolio-total-value')).toHaveTextContent(
        '$3,500.00',
      );
    });
  });

  it('labels history stats as portfolio totals, not prices', async () => {
    render(<PortfolioScreen />);
    await waitFor(() => screen.getByText('최고 자산액'));
    expect(screen.getByText('최저 자산액')).toBeTruthy();
    expect(screen.getByText('평균 자산액')).toBeTruthy();
    expect(screen.queryByText('최고가')).toBeNull();
    expect(screen.queryByText('평균가')).toBeNull();
  });

  it('shows a dash for 7d/30d changes without a snapshot in range', async () => {
    render(<PortfolioScreen />);
    await waitFor(() => screen.getByText('7일 변동'));
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('+2.94%')).toBeTruthy();
  });

  it('describes volatility honestly', async () => {
    render(<PortfolioScreen />);
    await waitFor(() => screen.getByText('보유 자산 간 24h 변동 편차'));
    expect(screen.getByText('2.50%p')).toBeTruthy();
  });

  it('hides best/worst performer when fewer than two tokens are held', async () => {
    mockCalculatePerformance.mockReturnValue({
      bestPerformer: null,
      worstPerformer: null,
      totalReturn: 0,
      totalReturnPercent: 0,
      volatility: null,
    });
    render(<PortfolioScreen />);
    await waitFor(() => screen.getByText('성과 지표'));
    expect(screen.queryByText('24시간 최고 성과')).toBeNull();
  });

  it('opens TokenDetail when a token row is tapped', async () => {
    render(<PortfolioScreen />);
    await waitFor(() => screen.getByTestId('portfolio-tab-tokens'));
    fireEvent.press(screen.getByTestId('portfolio-tab-tokens'));
    await waitFor(() => screen.getByTestId(`portfolio-token-${USDC}`));
    fireEvent.press(screen.getByTestId(`portfolio-token-${USDC}`));
    expect(mockNavigate).toHaveBeenCalledWith(
      'TokenDetail',
      expect.objectContaining({
        symbol: 'USDC',
        contractAddress: USDC,
        decimals: 6,
        usdValue: 500,
        chainId: 1,
      }),
    );
  });

  describe('unknown values', () => {
    const NULL_STATS = {
      totalValue: 0,
      change24h: null,
      changePercent24h: null,
      change7d: null,
      changePercent7d: null,
      change30d: null,
      changePercent30d: null,
      highestValue: null,
      lowestValue: null,
      averageValue: null,
    };

    it('shows a dash (not $0.00) and hides the recorded summary when prices fail', async () => {
      mockGetTokens.mockResolvedValue([
        {
          ...TOKENS[0],
          price: 0,
          priceChange24h: 0,
          value: 0,
          usdValue: null,
          priceAvailable: false,
          hasPriceSource: true,
        },
      ]);
      mockCalculateStats.mockResolvedValue(NULL_STATS);
      render(<PortfolioScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('portfolio-total-value')).toHaveTextContent(
          '—',
        );
      });
      expect(screen.getByTestId('portfolio-total-lookupFailed')).toBeTruthy();
      await waitFor(() => screen.getByText('성과 지표'));
      expect(screen.queryByText('기록된 총 자산 요약')).toBeNull();
      expect(screen.queryByText('$0.00')).toBeNull();
      // 차트는 "하루 한 번 기록" 대신 기록하지 못한 이유를 보여 준다
      expect(
        screen.getByText(
          '잔액이나 시세를 불러오지 못해 기록하지 않았습니다. 아래로 당겨 다시 시도하세요.',
        ),
      ).toBeTruthy();
      expect(
        screen.queryByText('포트폴리오 탭을 열 때마다 하루 한 번 기록됩니다.'),
      ).toBeNull();
    });

    it('shows a dash for an empty token list', async () => {
      mockGetTokens.mockResolvedValue([]);
      mockCalculateStats.mockResolvedValue(NULL_STATS);
      render(<PortfolioScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('portfolio-total-value')).toHaveTextContent(
          '—',
        );
      });
    });

    it('separates assets without a price source from failed lookups', async () => {
      mockGetTokens.mockResolvedValue([
        { ...TOKENS[0], hasPriceSource: true },
        {
          ...TOKENS[1],
          symbol: 'MYTOKEN',
          name: 'My Token',
          price: 0,
          value: 0,
          usdValue: null,
          priceAvailable: false,
          coingeckoId: undefined,
          isCustom: true,
          hasPriceSource: false,
        },
      ]);
      render(<PortfolioScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('portfolio-total-value')).toHaveTextContent(
          '$3,000.00',
        );
      });
      expect(
        screen.getByTestId('portfolio-total-unpriceable'),
      ).toHaveTextContent('시세 정보가 없는 자산은 합계에서 제외됩니다');
      expect(screen.queryByTestId('portfolio-total-partial')).toBeNull();
      expect(
        screen.getByText('포트폴리오 탭을 열 때마다 하루 한 번 기록됩니다.'),
      ).toBeTruthy();
    });
  });

  it('supports pull to refresh on the overview tab', async () => {
    render(<PortfolioScreen />);
    await waitFor(() => screen.getByTestId('portfolio-overview'));
    const overview = screen.getByTestId('portfolio-overview');
    expect(overview.props.refreshControl).toBeTruthy();
    await act(async () => {
      await overview.props.refreshControl.props.onRefresh();
    });
    expect(mockGetTokens).toHaveBeenCalledTimes(2);
  });

  it('shows an error with retry when tokens cannot be loaded', async () => {
    mockGetTokens.mockRejectedValueOnce(new Error('RPC down'));
    render(<PortfolioScreen />);
    await waitFor(() => screen.getByTestId('portfolio-error'));
    fireEvent.press(screen.getByTestId('portfolio-error-retry'));
    await waitFor(() => screen.getByTestId('portfolio-total-value'));
  });

  it('shows "no real value" on testnets', async () => {
    mockChainId = 11155111;
    render(<PortfolioScreen />);
    await waitFor(() => screen.getByTestId('portfolio-testnet-note'));
    expect(screen.queryByTestId('portfolio-total-value')).toBeNull();
  });

  it('uses 44pt time-range pills with tab semantics', async () => {
    render(<PortfolioScreen />);
    await waitFor(() => screen.getByTestId('portfolio-range-7d'));
    const pill = screen.getByTestId('portfolio-range-7d');
    expect(pill.props.accessibilityRole).toBe('tab');
  });
});
