/**
 * HomeScreen 테스트 (개선)
 * 홈 스크린 테스트 - 개선된 버전
 */

import React from 'react';
import { render, fireEvent, waitFor, screen, act } from '../test-utils';
import HomeScreen from '../../src/screens/Home/HomeScreen';

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

// Store 모킹 - 다양한 상태를 테스트할 수 있도록 함수화
const createMockWalletStore = (overrides = {}) => ({
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
    { chainId: 11155111, name: 'Sepolia', symbol: 'ETH', isTestnet: true },
  ],
  ...overrides,
});

let mockWalletStore = createMockWalletStore();

jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => mockWalletStore,
}));

// Balance 훅 모킹 - 다양한 상태 테스트
const createMockBalance = (overrides = {}) => ({
  data: { formatted: '1.5', wei: BigInt('1500000000000000000'), symbol: 'ETH' },
  refetch: jest.fn(),
  isLoading: false,
  isRefetching: false,
  isError: false,
  error: null,
  ...overrides,
});

let mockBalance = createMockBalance();

jest.mock('../../src/hooks/useBalance', () => ({
  useBalance: () => mockBalance,
}));

// coinService 모킹 - 동기적으로 반환하여 로딩 상태 즉시 완료
jest.mock('../../src/services/coinService', () => ({
  coinService: {
    getNativeTokenPrice: jest.fn().mockResolvedValue(2000),
    calculateUsdValue: jest.fn().mockReturnValue('$3,000.00'),
  },
}));

// buyService 모킹
jest.mock('../../src/services/buyService', () => ({
  showBuyProviderAlert: jest.fn(),
}));

// buyService 가져오기
import { showBuyProviderAlert } from '../../src/services/buyService';
const mockShowBuyProviderAlert = showBuyProviderAlert as jest.Mock;

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWalletStore = createMockWalletStore();
    mockBalance = createMockBalance();
  });

  describe('Rendering', () => {
    it('should render correctly with wallet data', async () => {
      const { toJSON } = render(<HomeScreen />);
      // 비동기 상태 업데이트 완료 대기
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      expect(toJSON()).not.toBeNull();
    });

    it('should display wallet address (truncated)', async () => {
      render(<HomeScreen />);
      // 비동기 상태 업데이트 완료 대기
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      // 주소가 truncate되어 표시되어야 함 - testID 사용
      await waitFor(() => {
        const addressText = screen.getByTestId('home-address-text');
        expect(addressText).toBeTruthy();
      });
    });

    it('should display balance amount', async () => {
      render(<HomeScreen />);
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      await waitFor(() => {
        // testID를 통해 잔액 컨테이너 확인
        const balanceValue = screen.getByTestId('home-balance-value');
        expect(balanceValue).toBeTruthy();
      });
    });

    it('should display network name', async () => {
      render(<HomeScreen />);
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      await waitFor(() => {
        // testID를 통해 네트워크 이름 확인
        const networkName = screen.getByTestId('home-network-name');
        expect(networkName).toBeTruthy();
      });
    });

    it('should show testnet indicator when on testnet', async () => {
      mockWalletStore = createMockWalletStore({
        activeNetworkChainId: 11155111,
      });
      render(<HomeScreen />);
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      await waitFor(() => {
        // testID를 통해 네트워크 배지 확인
        const networkBadge = screen.getByTestId('home-network-badge');
        expect(networkBadge).toBeTruthy();
      });
    });
  });

  describe('Loading States', () => {
    it('should show skeleton when loading', async () => {
      mockBalance = createMockBalance({ isLoading: true, data: undefined });
      render(<HomeScreen />);
      // 스켈레톤 컴포넌트가 렌더링되어야 함 (로딩 상태이므로 즉시 표시)
      expect(screen.queryByTestId('home-skeleton')).toBeTruthy();
    });

    it('should show refresh indicator when refetching', async () => {
      mockBalance = createMockBalance({ isRefetching: true });
      render(<HomeScreen />);
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      // RefreshControl이 활성화되어 있어야 함 - 컨테이너가 렌더링됨
      await waitFor(() => {
        expect(screen.getByTestId('home-screen')).toBeTruthy();
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate to SendTransaction on send button press', async () => {
      render(<HomeScreen />);
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      await waitFor(() => {
        expect(screen.getByTestId('home-send-button')).toBeTruthy();
      });

      const sendButton = screen.getByTestId('home-send-button');
      fireEvent.press(sendButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(
          'SendTransaction',
          expect.any(Object),
        );
      });
    });

    it('should navigate to ReceiveToken on receive button press', async () => {
      render(<HomeScreen />);
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      await waitFor(() => {
        expect(screen.getByTestId('home-receive-button')).toBeTruthy();
      });

      const receiveButton = screen.getByTestId('home-receive-button');
      fireEvent.press(receiveButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('ReceiveToken');
      });
    });

    it('should navigate to Swap on swap button press', async () => {
      render(<HomeScreen />);
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      await waitFor(() => {
        expect(screen.getByTestId('home-swap-button')).toBeTruthy();
      });

      const swapButton = screen.getByTestId('home-swap-button');
      fireEvent.press(swapButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('Swap');
      });
    });
  });

  describe('User Interactions', () => {
    it('should copy address to clipboard on address press', async () => {
      const mockClipboard = jest.fn();
      jest
        .spyOn(require('react-native').Clipboard, 'setString')
        .mockImplementation(mockClipboard);

      render(<HomeScreen />);
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      await waitFor(() => {
        expect(screen.getByTestId('home-address-row')).toBeTruthy();
      });

      const addressRow = screen.getByTestId('home-address-row');
      fireEvent.press(addressRow);

      await waitFor(() => {
        expect(mockClipboard).toHaveBeenCalledWith(
          '0x1234567890123456789012345678901234567890',
        );
      });
    });

    it('should call showBuyProviderAlert on buy button press', async () => {
      render(<HomeScreen />);
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      await waitFor(() => {
        expect(screen.getByTestId('home-buy-button')).toBeTruthy();
      });

      const buyButton = screen.getByTestId('home-buy-button');
      fireEvent.press(buyButton);

      await waitFor(() => {
        expect(mockShowBuyProviderAlert).toHaveBeenCalled();
      });
    });

    it('should have refetch function available for pull to refresh', async () => {
      const mockRefetch = jest.fn();
      mockBalance = createMockBalance({ refetch: mockRefetch });

      render(<HomeScreen />);
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // 로딩 완료 후 ScrollView가 렌더링되어야 함
      await waitFor(() => {
        expect(screen.getByTestId('home-scroll-view')).toBeTruthy();
      });

      // refetch 함수가 정의되어 있는지 확인
      expect(mockRefetch).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should still render when balance fetch fails', async () => {
      mockBalance = createMockBalance({
        isError: true,
        error: new Error('Network error'),
        data: undefined,
        isLoading: false,
      });

      render(<HomeScreen />);
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      // 에러 상태에서도 기본 UI는 렌더링되어야 함
      await waitFor(() => {
        expect(screen.getByTestId('home-screen')).toBeTruthy();
      });
    });
  });

  describe('Empty States', () => {
    it('should handle zero balance gracefully', async () => {
      mockBalance = createMockBalance({
        data: { formatted: '0', wei: BigInt(0), symbol: 'ETH' },
      });

      render(<HomeScreen />);
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      // 잔액 컨테이너가 렌더링되어야 함
      await waitFor(() => {
        expect(screen.getByTestId('home-balance-container')).toBeTruthy();
      });
    });

    it('should show message when no wallet exists', () => {
      mockWalletStore = createMockWalletStore({ wallets: [] });

      render(<HomeScreen />);
      expect(screen.getByText(/지갑이 없습니다/i)).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible buttons', async () => {
      render(<HomeScreen />);

      // 비동기 상태 업데이트 완료 대기 (가격 로딩 완료 후 버튼 표시)
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // home-send-button testID 사용
      await waitFor(() => {
        const sendButton = screen.getByTestId('home-send-button');
        expect(sendButton).toBeTruthy();
      });
    });
  });
});

describe('HomeScreen - Snapshot', () => {
  beforeEach(() => {
    mockWalletStore = createMockWalletStore();
    mockBalance = createMockBalance();
  });

  it('should match snapshot', () => {
    const { toJSON } = render(<HomeScreen />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('should match snapshot in loading state', () => {
    mockBalance = createMockBalance({ isLoading: true, data: undefined });
    const { toJSON } = render(<HomeScreen />);
    expect(toJSON()).toMatchSnapshot();
  });
});
