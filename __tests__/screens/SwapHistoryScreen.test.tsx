/**
 * SwapHistoryScreen 테스트
 * 스왑 히스토리 화면 테스트
 */

import React from 'react';
import {
  render,
  screen,
  cleanup,
  fireEvent,
} from '@testing-library/react-native';
import { Alert } from 'react-native';
import { ThemeProvider } from 'styled-components/native';
import SwapHistoryScreen from '../../src/screens/Swap/SwapHistoryScreen';
import { theme } from '../../src/styles/theme';

afterEach(() => {
  cleanup();
});

// Navigation mocks
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    canGoBack: () => true,
  }),
}));

const mockClearHistoryForChain = jest.fn();
const mockClearHistory = jest.fn();

// Swap store mock with history
const mockSwapHistory = [
  {
    id: '1',
    chainId: 1,
    sellToken: { symbol: 'ETH', amount: '1.0', address: '0x0' },
    buyToken: {
      symbol: 'USDC',
      amount: '3000.0',
      address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    },
    timestamp: Date.now() - 5 * 60 * 1000, // 5 mins ago
    status: 'success' as const,
    txHash: '0x123',
  },
  {
    id: '2',
    chainId: 1,
    sellToken: {
      symbol: 'USDC',
      amount: '100.0',
      address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    },
    buyToken: {
      symbol: 'DAI',
      amount: '99.5',
      address: '0x6b175474e89094c44da98b954eedeac495271d0f',
    },
    timestamp: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
    status: 'pending' as const,
    txHash: '0x456',
  },
  {
    id: '3',
    chainId: 1,
    sellToken: {
      symbol: 'WBTC',
      amount: '0.1',
      address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    },
    buyToken: { symbol: 'ETH', amount: '1.5', address: '0x0' },
    timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days ago
    status: 'failed' as const,
    txHash: '0x789',
  },
];

jest.mock('../../src/store/swapStore', () => ({
  useSwapStore: () => ({
    history: mockSwapHistory,
    clearHistory: mockClearHistory,
    clearHistoryForChain: mockClearHistoryForChain,
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
      { chainId: 1, name: 'Ethereum' },
      { chainId: 137, name: 'Polygon' },
    ],
  }),
}));

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('SwapHistoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be a function component', () => {
    expect(typeof SwapHistoryScreen).toBe('function');
  });

  it('should render the screen with title', () => {
    renderWithTheme(<SwapHistoryScreen />);
    expect(screen.getByText('스왑 내역')).toBeTruthy();
  });

  it('should display swap history items', () => {
    renderWithTheme(<SwapHistoryScreen />);
    expect(screen.getByText('ETH → USDC')).toBeTruthy();
    expect(screen.getByText('USDC → DAI')).toBeTruthy();
  });

  it('should display WBTC to ETH swap', () => {
    renderWithTheme(<SwapHistoryScreen />);
    expect(screen.getByText('WBTC → ETH')).toBeTruthy();
  });

  it('should display status text for completed swaps', () => {
    renderWithTheme(<SwapHistoryScreen />);
    expect(screen.getByText('완료')).toBeTruthy();
  });

  it('should display status text for pending swaps', () => {
    renderWithTheme(<SwapHistoryScreen />);
    expect(screen.getByText('진행 중')).toBeTruthy();
  });

  it('should display status text for failed swaps', () => {
    renderWithTheme(<SwapHistoryScreen />);
    expect(screen.getByText('실패')).toBeTruthy();
  });

  it('asks for confirmation and clears only the active network', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation();
    renderWithTheme(<SwapHistoryScreen />);

    fireEvent.press(screen.getByTestId('swap-history-clear'));
    expect(mockClearHistoryForChain).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      '스왑 내역 삭제',
      expect.stringContaining('Ethereum'),
      expect.any(Array),
    );

    const buttons = alertSpy.mock.calls[0][2] as {
      text: string;
      onPress?: () => void;
    }[];
    buttons.find(button => button.text === '취소')?.onPress?.();
    expect(mockClearHistoryForChain).not.toHaveBeenCalled();

    buttons.find(button => button.text === '삭제')?.onPress?.();
    expect(mockClearHistoryForChain).toHaveBeenCalledWith(1);
    expect(mockClearHistory).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('opens the transaction detail for a history item', () => {
    renderWithTheme(<SwapHistoryScreen />);
    fireEvent.press(screen.getByTestId('swap-history-item-1'));
    expect(mockNavigate).toHaveBeenCalledWith('TransactionDetail', {
      txHash: '0x123',
      chainId: 1,
    });
  });

  it('has a labelled back button', () => {
    renderWithTheme(<SwapHistoryScreen />);
    fireEvent.press(screen.getByLabelText('뒤로 가기'));
    expect(mockGoBack).toHaveBeenCalled();
  });
});
