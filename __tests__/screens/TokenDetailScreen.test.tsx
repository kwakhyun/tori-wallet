/**
 * TokenDetailScreen 테스트
 */

import React from 'react';
import { Linking } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '../test-utils';
import { usePreferencesStore } from '../../src/store/preferencesStore';

// Navigation mocks
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    canGoBack: () => true,
  }),
  useRoute: () => ({ params: mockParams }),
}));

// Store mock
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
      {
        chainId: 1,
        name: 'Ethereum Mainnet',
        isTestnet: false,
        blockExplorerUrl: 'https://etherscan.io',
      },
      {
        chainId: 10,
        name: 'Optimism',
        isTestnet: false,
        blockExplorerUrl: 'https://optimistic.etherscan.io',
      },
      {
        chainId: 11155111,
        name: 'Sepolia',
        isTestnet: true,
        blockExplorerUrl: 'https://sepolia.etherscan.io',
      },
    ],
  }),
}));

// Balance hook mocks
const mockNativeRefetch = jest.fn().mockResolvedValue(undefined);
const mockTokenRefetch = jest.fn().mockResolvedValue(undefined);
const mockUseTokenBalance = jest.fn();
jest.mock('../../src/hooks/useBalance', () => ({
  useBalance: () => ({
    data: {
      formatted: '1.5',
      wei: BigInt('1500000000000000000'),
      symbol: 'ETH',
    },
    isLoading: false,
    isError: false,
    refetch: mockNativeRefetch,
  }),
  useTokenBalance: (...args: unknown[]) => mockUseTokenBalance(...args),
}));

const mockGetPrice = jest.fn();
jest.mock('../../src/services/tokenService', () => ({
  tokenService: {
    getPrice: (...args: unknown[]) => mockGetPrice(...args),
    isTestnet: (chainId: number) => chainId === 11155111,
  },
}));

const mockGetPriceHistory = jest.fn();
jest.mock('../../src/services/coinService', () => ({
  coinService: {
    getPriceHistory: (...args: unknown[]) => mockGetPriceHistory(...args),
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
  };
});

// Buy service mock
const mockShowBuyProviderAlert = jest.fn();
jest.mock('../../src/services/buyService', () => ({
  showBuyProviderAlert: (...args: unknown[]) =>
    mockShowBuyProviderAlert(...args),
}));

const mockOpenURL = jest
  .spyOn(Linking, 'openURL')
  .mockImplementation(() => Promise.resolve());

import TokenDetailScreen from '../../src/screens/TokenDetail/TokenDetailScreen';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

describe('TokenDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChainId = 1;
    mockParams = {
      symbol: 'ETH',
      name: 'Ethereum',
      balance: '1.5',
      contractAddress: undefined,
      coingeckoId: 'ethereum',
      usdValue: 3000,
    };
    mockGetPrice.mockResolvedValue({ price: 2000, change24h: 3.5 });
    mockGetPriceHistory.mockResolvedValue({
      prices: [
        [1700000000000, 1900],
        [1700086400000, 2000],
      ],
      market_caps: [],
      total_volumes: [],
    });
    mockUseTokenBalance.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: mockTokenRefetch,
    });
    usePreferencesStore.setState({ currency: 'USD', hideBalances: false });
  });

  it('renders symbol, name and balance', () => {
    render(<TokenDetailScreen />);
    expect(screen.getAllByText('ETH').length).toBeGreaterThan(0);
    expect(screen.getByText('Ethereum')).toBeTruthy();
    expect(screen.getByTestId('token-detail-balance')).toHaveTextContent(
      '1.5 ETH',
    );
  });

  it('shows the real fiat value, price and 24h change', async () => {
    render(<TokenDetailScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('token-detail-fiat')).toHaveTextContent(
        '$3,000.00',
      );
      expect(screen.getByTestId('token-detail-price')).toHaveTextContent(
        '$2,000.00',
      );
    });
    expect(screen.getByTestId('token-detail-change')).toHaveTextContent(
      '+3.50% (24시간)',
    );
    expect(screen.queryByText(/≈ \$0\.00/)).toBeNull();
  });

  it('draws a price chart when the coingecko id is known', async () => {
    render(<TokenDetailScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('token-detail-chart')).toBeTruthy();
    });
    expect(mockGetPriceHistory).toHaveBeenCalledWith('ethereum', '7');
  });

  it('links to the market info (CoinDetail) screen', async () => {
    render(<TokenDetailScreen />);
    fireEvent.press(screen.getByTestId('token-detail-market-info'));
    expect(mockNavigate).toHaveBeenCalledWith('CoinDetail', {
      coinId: 'ethereum',
      coinName: 'Ethereum',
      coinSymbol: 'ETH',
      coinImage: '',
    });
  });

  it('shows no fiat value or market data on testnets', () => {
    mockChainId = 11155111;
    render(<TokenDetailScreen />);
    expect(screen.getByTestId('token-detail-fiat')).toHaveTextContent(
      '테스트넷 — 실제 가치 없음',
    );
    expect(screen.queryByTestId('token-detail-price')).toBeNull();
    expect(mockGetPrice).not.toHaveBeenCalled();
  });

  it('displays the token info section', () => {
    render(<TokenDetailScreen />);
    expect(screen.getByText('토큰 정보')).toBeTruthy();
    expect(screen.getByText('네트워크')).toBeTruthy();
    expect(screen.getByText('심볼')).toBeTruthy();
  });

  it('navigates to SendTransaction for the native token', () => {
    render(<TokenDetailScreen />);
    fireEvent.press(screen.getByText('보내기'));
    expect(mockNavigate).toHaveBeenCalledWith('SendTransaction', {
      tokenAddress: undefined,
    });
  });

  it('navigates to ReceiveToken and Swap', () => {
    render(<TokenDetailScreen />);
    fireEvent.press(screen.getByText('받기'));
    expect(mockNavigate).toHaveBeenCalledWith('ReceiveToken');
    fireEvent.press(screen.getByText('스왑'));
    expect(mockNavigate).toHaveBeenCalledWith('Swap');
  });

  it('passes address and chain id to the buy flow', () => {
    render(<TokenDetailScreen />);
    fireEvent.press(screen.getByText('구매'));
    expect(mockShowBuyProviderAlert).toHaveBeenCalledWith(
      'eth',
      '0x1234567890123456789012345678901234567890',
      undefined,
      1,
    );
  });

  it("uses the active network's block explorer (not hardcoded etherscan)", () => {
    mockChainId = 10;
    render(<TokenDetailScreen />);
    fireEvent.press(screen.getByTestId('token-detail-explorer'));
    expect(mockOpenURL).toHaveBeenCalledWith(
      'https://optimistic.etherscan.io/address/0x1234567890123456789012345678901234567890',
    );
  });

  it('navigates back via the accessible header button', () => {
    render(<TokenDetailScreen />);
    fireEvent.press(screen.getByLabelText('뒤로 가기'));
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('shows the ETH glyph for the native token without a logo', () => {
    render(<TokenDetailScreen />);
    expect(screen.getByText('Ξ')).toBeTruthy();
  });

  describe('ERC-20 tokens', () => {
    beforeEach(() => {
      mockParams = {
        symbol: 'USDC',
        name: 'USD Coin',
        balance: '250',
        contractAddress: USDC,
        decimals: 6,
        coingeckoId: 'usd-coin',
        usdValue: 250,
      };
      mockGetPrice.mockResolvedValue({ price: 1, change24h: 0 });
      mockUseTokenBalance.mockReturnValue({
        data: { formatted: '300', wei: 300000000n, symbol: '' },
        isLoading: false,
        isError: false,
        refetch: mockTokenRefetch,
      });
    });

    it('reads the ERC-20 balance with the contract and decimals', () => {
      render(<TokenDetailScreen />);
      expect(mockUseTokenBalance).toHaveBeenCalledWith(
        '0x1234567890123456789012345678901234567890',
        USDC,
        6,
        1,
      );
      expect(screen.getByTestId('token-detail-balance')).toHaveTextContent(
        '300 USDC',
      );
    });

    it('sends the ERC-20 token and receives with the token address', () => {
      render(<TokenDetailScreen />);
      fireEvent.press(screen.getByText('보내기'));
      expect(mockNavigate).toHaveBeenCalledWith('SendTransaction', {
        tokenAddress: USDC,
      });
      fireEvent.press(screen.getByText('받기'));
      expect(mockNavigate).toHaveBeenCalledWith('ReceiveToken', {
        tokenAddress: USDC,
      });
    });

    it('refetches the shown token on pull to refresh', async () => {
      render(<TokenDetailScreen />);
      const scroll = screen.getByTestId('token-detail-scroll');
      await act(async () => {
        await scroll.props.refreshControl.props.onRefresh();
      });
      expect(mockTokenRefetch).toHaveBeenCalled();
      expect(mockNativeRefetch).not.toHaveBeenCalled();
    });

    it('links to the token page on the explorer', () => {
      render(<TokenDetailScreen />);
      fireEvent.press(screen.getByTestId('token-detail-explorer'));
      expect(mockOpenURL).toHaveBeenCalledWith(
        `https://etherscan.io/token/${USDC}?a=0x1234567890123456789012345678901234567890`,
      );
    });
  });
});
