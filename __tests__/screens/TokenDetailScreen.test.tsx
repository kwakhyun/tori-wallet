/**
 * Tori Wallet - TokenDetailScreen Tests
 * 토큰 상세 화면 테스트
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Linking } from 'react-native';
import { theme } from '../../src/styles/theme';

// Navigation mocks
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
  useRoute: () => ({
    params: {
      symbol: 'ETH',
      name: 'Ethereum',
      balance: '1.5',
      contractAddress: undefined,
    },
  }),
}));

// Store mock
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
      { chainId: 1, name: 'Ethereum Mainnet', isTestnet: false },
      { chainId: 11155111, name: 'Sepolia', isTestnet: true },
    ],
  }),
}));

// Balance hook mock
jest.mock('../../src/hooks/useBalance', () => ({
  useBalance: () => ({
    data: {
      formatted: '1.5',
      wei: BigInt('1500000000000000000'),
      symbol: 'ETH',
    },
    isLoading: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
}));

// Buy service mock
const mockShowBuyProviderAlert = jest.fn();
jest.mock('../../src/services/buyService', () => ({
  showBuyProviderAlert: (...args: unknown[]) =>
    mockShowBuyProviderAlert(...args),
}));

// Linking mock using spyOn
const mockOpenURL = jest
  .spyOn(Linking, 'openURL')
  .mockImplementation(() => Promise.resolve());

import TokenDetailScreen from '../../src/screens/TokenDetail/TokenDetailScreen';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>{component}</ThemeProvider>
    </QueryClientProvider>,
  );
};

describe('TokenDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly', () => {
    renderWithProviders(<TokenDetailScreen />);

    expect(screen.getAllByText('ETH').length).toBeGreaterThan(0);
    expect(screen.getByText('Ethereum')).toBeTruthy();
  });

  it('should display token balance', () => {
    renderWithProviders(<TokenDetailScreen />);

    expect(screen.getByText(/1\.5.*ETH/)).toBeTruthy();
  });

  it('should display token info section', () => {
    renderWithProviders(<TokenDetailScreen />);

    expect(screen.getByText('토큰 정보')).toBeTruthy();
    expect(screen.getByText('네트워크')).toBeTruthy();
    expect(screen.getByText('심볼')).toBeTruthy();
  });

  it('should navigate to SendTransaction on send button press', () => {
    renderWithProviders(<TokenDetailScreen />);

    const sendButton = screen.getByText('보내기');
    fireEvent.press(sendButton);

    expect(mockNavigate).toHaveBeenCalledWith('SendTransaction', {
      tokenAddress: undefined,
    });
  });

  it('should navigate to ReceiveToken on receive button press', () => {
    renderWithProviders(<TokenDetailScreen />);

    const receiveButton = screen.getByText('받기');
    fireEvent.press(receiveButton);

    expect(mockNavigate).toHaveBeenCalledWith('ReceiveToken');
  });

  it('should call showBuyProviderAlert on buy button press', () => {
    renderWithProviders(<TokenDetailScreen />);

    const buyButton = screen.getByText('구매');
    fireEvent.press(buyButton);

    expect(mockShowBuyProviderAlert).toHaveBeenCalledWith(
      'eth',
      '0x1234567890123456789012345678901234567890',
    );
  });

  it('should open explorer when view explorer button is pressed', () => {
    renderWithProviders(<TokenDetailScreen />);

    const explorerButton = screen.getByText(/블록 탐색기에서 보기/);
    fireEvent.press(explorerButton);

    expect(mockOpenURL).toHaveBeenCalledWith(
      expect.stringContaining('etherscan.io'),
    );
  });

  it('should navigate back when back button is pressed', () => {
    renderWithProviders(<TokenDetailScreen />);

    const backButton = screen.getByText('‹');
    fireEvent.press(backButton);

    expect(mockGoBack).toHaveBeenCalled();
  });

  it('should display ETH icon for native token', () => {
    renderWithProviders(<TokenDetailScreen />);

    expect(screen.getByText('Ξ')).toBeTruthy();
  });
});

describe('TokenDetailScreen - Component Definition', () => {
  it('should be a valid function component', () => {
    expect(typeof TokenDetailScreen).toBe('function');
  });
});
