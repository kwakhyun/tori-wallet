/**
 * HomeScreen 테스트 (개선)
 */

import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent, waitFor, screen, act } from '../test-utils';
import HomeScreen from '../../src/screens/Home/HomeScreen';
import { usePreferencesStore } from '../../src/store/preferencesStore';
import type { Token } from '../../src/services/tokenService';

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
      canGoBack: () => true,
    }),
  };
});

// Store 모킹 - 다양한 상태를 테스트할 수 있도록 함수화
const mockSetActiveNetwork = jest.fn();
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
    {
      chainId: 1,
      name: 'Ethereum',
      symbol: 'ETH',
      isTestnet: false,
      blockExplorerUrl: 'https://etherscan.io',
    },
    { chainId: 11155111, name: 'Sepolia', symbol: 'ETH', isTestnet: true },
  ],
  setActiveNetwork: mockSetActiveNetwork,
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

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const nativeToken = (overrides: Partial<Token> = {}): Token => ({
  symbol: 'ETH',
  name: 'Ethereum',
  address: 'native',
  decimals: 18,
  balance: '1.5',
  balanceRaw: '1.5',
  price: 2000,
  priceChange24h: 2,
  value: 3000,
  usdValue: 3000,
  priceAvailable: true,
  balanceError: false,
  coingeckoId: 'ethereum',
  isCustom: false,
  isTestnet: false,
  ...overrides,
});

const usdcToken = (overrides: Partial<Token> = {}): Token => ({
  symbol: 'USDC',
  name: 'USD Coin',
  address: USDC,
  decimals: 6,
  balance: '250',
  balanceRaw: '250',
  price: 1,
  priceChange24h: 0,
  value: 250,
  usdValue: 250,
  priceAvailable: true,
  balanceError: false,
  coingeckoId: 'usd-coin',
  logoUrl: 'https://example.com/usdc.png',
  isCustom: false,
  isTestnet: false,
  ...overrides,
});

const mockGetTokens = jest.fn();
jest.mock('../../src/services/tokenService', () => ({
  tokenService: {
    getTokens: (...args: unknown[]) => mockGetTokens(...args),
  },
}));

// buyService 모킹
jest.mock('../../src/services/buyService', () => ({
  showBuyProviderAlert: jest.fn(),
}));

import { showBuyProviderAlert } from '../../src/services/buyService';
const mockShowBuyProviderAlert = showBuyProviderAlert as jest.Mock;

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWalletStore = createMockWalletStore();
    mockBalance = createMockBalance();
    mockGetTokens.mockResolvedValue([nativeToken(), usdcToken()]);
    usePreferencesStore.setState({ currency: 'USD', hideBalances: false });
  });

  describe('Rendering', () => {
    it('should render correctly with wallet data', async () => {
      const { toJSON } = render(<HomeScreen />);
      await flush();
      expect(toJSON()).not.toBeNull();
    });

    it('should display wallet address (truncated)', async () => {
      render(<HomeScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('home-address-text')).toHaveTextContent(
          '0x1234...7890',
        );
      });
    });

    it('shows the native balance with the shared display format', async () => {
      render(<HomeScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('home-balance-value')).toHaveTextContent(
          '1.5 ETH',
        );
      });
    });

    it('shows the total portfolio value instead of a hardcoded $0.00', async () => {
      render(<HomeScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('home-total-value')).toHaveTextContent(
          '$3,250.00',
        );
      });
      expect(screen.queryByText(/≈ \$0\.00/)).toBeNull();
    });

    it('lists native and ERC-20 tokens with balances', async () => {
      render(<HomeScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('home-token-native')).toBeTruthy();
        expect(screen.getByTestId(`home-token-${USDC}`)).toBeTruthy();
      });
      expect(screen.getByText('250 USDC')).toBeTruthy();
      expect(screen.getByText('$250.00')).toBeTruthy();
    });

    it('hides default tokens with a zero balance', async () => {
      mockGetTokens.mockResolvedValue([
        nativeToken(),
        usdcToken({ balance: '0', balanceRaw: '0', usdValue: 0, value: 0 }),
      ]);
      render(<HomeScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('home-token-native')).toBeTruthy();
      });
      expect(screen.queryByTestId(`home-token-${USDC}`)).toBeNull();
    });

    it('should display network name', async () => {
      render(<HomeScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('home-network-name')).toHaveTextContent(
          'Ethereum',
        );
      });
    });
  });

  describe('Prices', () => {
    it('shows a dash instead of $0.00 when the price is unknown', async () => {
      mockGetTokens.mockResolvedValue([
        nativeToken({ priceAvailable: false, usdValue: null, value: 0 }),
      ]);
      render(<HomeScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('home-total-value')).toHaveTextContent('—');
      });
      expect(screen.queryByText('$0.00')).toBeNull();
    });

    it('shows a dash (not $0.00) for an empty token list', async () => {
      mockGetTokens.mockResolvedValue([]);
      render(<HomeScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('home-total-value')).toHaveTextContent('—');
      });
    });

    it('explains that assets failed to load when some values are unknown', async () => {
      mockGetTokens.mockResolvedValue([
        nativeToken(),
        usdcToken({ priceAvailable: false, usdValue: null, value: 0 }),
      ]);
      render(<HomeScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('home-total-value')).toHaveTextContent(
          '$3,000.00',
        );
      });
      expect(screen.getByTestId('home-total-partial')).toHaveTextContent(
        '일부 자산은 잔액이나 시세를 불러오지 못해 제외했습니다',
      );
    });

    it('excludes a custom token without a price source without calling it a failure', async () => {
      const LINK = '0x514910771AF9Ca656af840dff83E8264EcF986CA';
      mockGetTokens.mockResolvedValue([
        nativeToken({ hasPriceSource: true }),
        usdcToken({
          symbol: 'LINK',
          name: 'Chainlink',
          address: LINK,
          balance: '10',
          balanceRaw: '10',
          price: 0,
          priceAvailable: false,
          usdValue: null,
          value: 0,
          coingeckoId: undefined,
          isCustom: true,
          hasPriceSource: false,
        }),
      ]);
      render(<HomeScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('home-total-value')).toHaveTextContent(
          '$3,000.00',
        );
      });
      expect(screen.getByTestId('home-total-unpriceable')).toHaveTextContent(
        '시세 정보가 없는 자산은 합계에서 제외됩니다',
      );
      expect(screen.queryByTestId('home-total-partial')).toBeNull();
    });

    it('does not block the balance while the token list is loading', async () => {
      mockGetTokens.mockReturnValue(new Promise(() => undefined));
      render(<HomeScreen />);
      await flush();
      expect(screen.getByTestId('home-balance-value')).toHaveTextContent(
        '1.5 ETH',
      );
      expect(screen.getByTestId('home-total-skeleton')).toBeTruthy();
      expect(screen.getByTestId('home-tokens-skeleton')).toBeTruthy();
      expect(screen.getByTestId('home-send-button')).toBeTruthy();
    });
  });

  describe('Testnet', () => {
    beforeEach(() => {
      mockWalletStore = createMockWalletStore({
        activeNetworkChainId: 11155111,
      });
      mockGetTokens.mockResolvedValue([
        nativeToken({
          name: 'Sepolia ETH',
          priceAvailable: false,
          usdValue: null,
          value: 0,
          coingeckoId: undefined,
          isTestnet: true,
        }),
      ]);
    });

    it('shows "no real value" instead of a fiat amount', async () => {
      render(<HomeScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('home-balance-usd')).toHaveTextContent(
          '테스트넷 — 실제 가치 없음',
        );
      });
      expect(screen.queryByTestId('home-total-value')).toBeNull();
    });

    it('opens the faucet link', async () => {
      const openURL = jest
        .spyOn(Linking, 'openURL')
        .mockResolvedValue(undefined as never);
      render(<HomeScreen />);
      await waitFor(() => screen.getByTestId('home-faucet-button'));
      fireEvent.press(screen.getByTestId('home-faucet-button'));
      expect(openURL).toHaveBeenCalledWith(expect.stringContaining('sepolia'));
    });

    it('passes the chain id to the buy flow (which blocks testnets)', async () => {
      render(<HomeScreen />);
      fireEvent.press(screen.getByTestId('home-buy-button'));
      expect(mockShowBuyProviderAlert).toHaveBeenCalledWith(
        'eth',
        '0x1234567890123456789012345678901234567890',
        undefined,
        11155111,
      );
    });
  });

  describe('Custom network', () => {
    beforeEach(() => {
      mockWalletStore = createMockWalletStore({
        activeNetworkChainId: 56,
        networks: [
          ...createMockWalletStore().networks,
          {
            chainId: 56,
            name: 'BNB Chain',
            symbol: 'BNB',
            isTestnet: false,
            isCustom: true,
          },
        ],
      });
      mockBalance = createMockBalance({
        data: {
          formatted: '2.5',
          wei: BigInt('2500000000000000000'),
          symbol: 'BNB',
        },
      });
      // tokenService가 커스텀 네트워크의 기본 통화를 시세 출처 없는 자산으로 돌려준다
      mockGetTokens.mockResolvedValue([
        nativeToken({
          symbol: 'BNB',
          name: 'BNB Chain',
          balance: '2.5',
          balanceRaw: '2.5',
          price: 0,
          priceChange24h: 0,
          value: 0,
          usdValue: null,
          priceAvailable: false,
          coingeckoId: undefined,
          hasPriceSource: false,
        }),
      ]);
    });

    it('shows a dash instead of $0.00 and lists the native row', async () => {
      render(<HomeScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('home-token-native')).toBeTruthy();
      });
      expect(screen.getByTestId('home-total-value')).toHaveTextContent('—');
      expect(screen.queryByText('$0.00')).toBeNull();
      expect(screen.getByTestId('home-balance-value')).toHaveTextContent(
        '2.5 BNB',
      );
      expect(screen.getByTestId('home-total-noPriceSource')).toBeTruthy();
    });
  });

  describe('Loading and error states', () => {
    it('should show the balance skeleton when loading', async () => {
      mockBalance = createMockBalance({ isLoading: true, data: undefined });
      render(<HomeScreen />);
      expect(screen.queryByTestId('home-skeleton')).toBeTruthy();
      // 화면 전체를 막지 않는다
      expect(screen.getByTestId('home-screen')).toBeTruthy();
      expect(screen.getByTestId('home-send-button')).toBeTruthy();
    });

    it('shows an error with retry when balances cannot be loaded', async () => {
      const refetch = jest.fn();
      mockBalance = createMockBalance({
        isError: true,
        data: undefined,
        refetch,
      });
      mockGetTokens.mockRejectedValue(new Error('RPC down'));
      render(<HomeScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('home-balance-error')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('home-balance-error-retry'));
      expect(refetch).toHaveBeenCalled();
    });

    it('marks a token whose balance failed instead of showing 0', async () => {
      mockGetTokens.mockResolvedValue([
        nativeToken(),
        usdcToken({ balance: '—', balanceError: true, usdValue: null }),
      ]);
      render(<HomeScreen />);
      await waitFor(() => {
        expect(screen.getByText('잔액 조회 실패')).toBeTruthy();
      });
      expect(screen.getByText('— USDC')).toBeTruthy();
    });
  });

  describe('Navigation', () => {
    it('should navigate to SendTransaction on send button press', async () => {
      render(<HomeScreen />);
      fireEvent.press(screen.getByTestId('home-send-button'));
      expect(mockNavigate).toHaveBeenCalledWith(
        'SendTransaction',
        expect.any(Object),
      );
    });

    it('should navigate to ReceiveToken on receive button press', async () => {
      render(<HomeScreen />);
      fireEvent.press(screen.getByTestId('home-receive-button'));
      expect(mockNavigate).toHaveBeenCalledWith('ReceiveToken');
    });

    it('should navigate to Swap on swap button press', async () => {
      render(<HomeScreen />);
      fireEvent.press(screen.getByTestId('home-swap-button'));
      expect(mockNavigate).toHaveBeenCalledWith('Swap');
    });

    it('opens TokenDetail with the ERC-20 contract, decimals and value', async () => {
      render(<HomeScreen />);
      await waitFor(() => screen.getByTestId(`home-token-${USDC}`));
      fireEvent.press(screen.getByTestId(`home-token-${USDC}`));
      expect(mockNavigate).toHaveBeenCalledWith('TokenDetail', {
        symbol: 'USDC',
        name: 'USD Coin',
        balance: '250',
        usdValue: 250,
        contractAddress: USDC,
        decimals: 6,
        coingeckoId: 'usd-coin',
        logoUrl: 'https://example.com/usdc.png',
        // 상세 화면은 목록을 읽은 체인에 고정된다
        chainId: 1,
      });
    });

    it('opens TokenDetail for the native token without a contract', async () => {
      render(<HomeScreen />);
      await waitFor(() => screen.getByTestId('home-token-native'));
      fireEvent.press(screen.getByTestId('home-token-native'));
      expect(mockNavigate).toHaveBeenCalledWith(
        'TokenDetail',
        expect.objectContaining({
          symbol: 'ETH',
          contractAddress: undefined,
          usdValue: 3000,
        }),
      );
    });

    it('opens the account list from the account label', () => {
      render(<HomeScreen />);
      fireEvent.press(screen.getByTestId('home-account-button'));
      expect(mockNavigate).toHaveBeenCalledWith('Accounts');
    });

    it('opens token management from the bottom of the token list', () => {
      render(<HomeScreen />);
      fireEvent.press(screen.getByTestId('home-manage-tokens'));
      expect(mockNavigate).toHaveBeenCalledWith('TokenManagement');
    });

    it('opens the network selector from the network badge', async () => {
      render(<HomeScreen />);
      fireEvent.press(screen.getByTestId('home-network-badge'));
      await waitFor(() => {
        expect(screen.getByTestId('network-selector-item-1')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('network-selector-item-11155111'));
      expect(mockSetActiveNetwork).toHaveBeenCalledWith(11155111);
    });
  });

  describe('User Interactions', () => {
    it('copies the address with lightweight toast feedback', async () => {
      const mockClipboard = jest.fn();
      jest
        .spyOn(require('react-native').Clipboard, 'setString')
        .mockImplementation(mockClipboard);
      const { useToastStore } = require('../../src/store/toastStore');
      useToastStore.getState().reset();

      render(<HomeScreen />);
      fireEvent.press(screen.getByTestId('home-address-row'));

      expect(mockClipboard).toHaveBeenCalledWith(
        '0x1234567890123456789012345678901234567890',
      );
      expect(useToastStore.getState().current?.message).toBe(
        '주소를 복사했습니다',
      );
    });

    it('passes symbol, address and chain id to the buy flow', () => {
      render(<HomeScreen />);
      fireEvent.press(screen.getByTestId('home-buy-button'));
      expect(mockShowBuyProviderAlert).toHaveBeenCalledWith(
        'eth',
        '0x1234567890123456789012345678901234567890',
        undefined,
        1,
      );
    });

    it('hides balances with the eye toggle', async () => {
      render(<HomeScreen />);
      await waitFor(() => screen.getByTestId('home-total-value'));
      fireEvent.press(screen.getByTestId('home-hide-balance-toggle'));
      await waitFor(() => {
        expect(screen.getByTestId('home-total-value')).toHaveTextContent(
          '••••',
        );
      });
      expect(screen.getByTestId('home-balance-value')).toHaveTextContent(
        '••••',
      );
      expect(screen.getByLabelText('잔액 보이기')).toBeTruthy();
    });

    it('refreshes balance and tokens on pull to refresh', async () => {
      const refetch = jest.fn().mockResolvedValue(undefined);
      mockBalance = createMockBalance({ refetch });
      render(<HomeScreen />);
      await waitFor(() => screen.getByTestId('home-token-native'));
      const scrollView = screen.getByTestId('home-scroll-view');
      await act(async () => {
        await scrollView.props.refreshControl.props.onRefresh();
      });
      expect(refetch).toHaveBeenCalled();
      expect(mockGetTokens).toHaveBeenCalledTimes(2);
    });
  });

  describe('Empty States', () => {
    it('should show message when no wallet exists', () => {
      mockWalletStore = createMockWalletStore({ wallets: [] });

      render(<HomeScreen />);
      expect(screen.getByText(/지갑이 없습니다/i)).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('labels glyph-only controls', async () => {
      render(<HomeScreen />);
      expect(screen.getByLabelText('잔액 숨기기')).toBeTruthy();
      expect(
        screen.getByTestId('home-send-button').props.accessibilityLabel,
      ).toBe('보내기');
      expect(
        screen.getByTestId('home-network-badge').props.accessibilityRole,
      ).toBe('button');
    });
  });
});

describe('HomeScreen - Snapshot', () => {
  // React 19 요소(예: ScrollView의 refreshControl prop)는 Jest 29 pretty-format이
  // 일반 객체로 출력하려다 실패하므로 태그 이름만 기록한다.
  expect.addSnapshotSerializer({
    test: (val: unknown) =>
      !!val &&
      typeof val === 'object' &&
      (val as { $$typeof?: symbol }).$$typeof ===
        Symbol.for('react.transitional.element'),
    print: (val: unknown) => {
      const type = (val as { type?: { displayName?: string; name?: string } })
        .type;
      return `<${type?.displayName || type?.name || 'Element'} />`;
    },
  });

  beforeEach(() => {
    mockWalletStore = createMockWalletStore();
    mockBalance = createMockBalance();
    mockGetTokens.mockResolvedValue([nativeToken(), usdcToken()]);
    usePreferencesStore.setState({ currency: 'USD', hideBalances: false });
  });

  it('should match snapshot', async () => {
    const { toJSON } = render(<HomeScreen />);
    await waitFor(() => screen.getByTestId(`home-token-${USDC}`));
    expect(toJSON()).toMatchSnapshot();
  });

  it('should match snapshot in loading state', () => {
    mockBalance = createMockBalance({ isLoading: true, data: undefined });
    mockGetTokens.mockReturnValue(new Promise(() => undefined));
    const { toJSON } = render(<HomeScreen />);
    expect(toJSON()).toMatchSnapshot();
  });
});
