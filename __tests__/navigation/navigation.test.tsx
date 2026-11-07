/**
 * 네비게이션 테스트
 */

import React from 'react';
import { Keyboard, Modal, Platform } from 'react-native';
import { render } from '@testing-library/react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider } from 'styled-components/native';
import { theme } from '../../src/styles/theme';

// Navigation 컴포넌트 모킹 (실제 네비게이터는 복잡한 의존성이 있으므로)
jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: () => null,
  }),
}));

jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: () => null,
  }),
}));

// Store 모킹
const mockWalletStore = {
  hasWallet: false,
  isLocked: false,
};

jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => mockWalletStore,
}));

// Screen 모킹
jest.mock('../../src/screens/Auth/WelcomeScreen', () => () => null);
jest.mock('../../src/screens/Auth/CreateWalletScreen', () => () => null);
jest.mock('../../src/screens/Auth/ImportWalletScreen', () => () => null);
jest.mock('../../src/screens/Auth/BackupMnemonicScreen', () => () => null);
jest.mock('../../src/screens/Auth/VerifyMnemonicScreen', () => () => null);
jest.mock('../../src/screens/Auth/SetPinScreen', () => () => null);
const mockOverlayBack = jest.fn(() => true);
jest.mock('../../src/screens/Auth/UnlockScreen', () => {
  const { useContext } = require('react');
  const { Text } = require('react-native');
  const {
    UnlockBackHandlerContext,
  } = require('../../src/screens/Auth/unlockBackHandler');
  return () => {
    // 실제 화면은 PIN 분실 안내가 열려 있을 때 처리기를 등록한다.
    const overlayBack = useContext(UnlockBackHandlerContext);
    if (overlayBack) overlayBack.current = mockOverlayBack;
    return <Text testID="unlock-screen-mock">unlock</Text>;
  };
});
jest.mock('../../src/screens/Home/HomeScreen', () => () => null);
jest.mock('../../src/screens/Explore/ExploreScreen', () => () => null);
jest.mock('../../src/screens/Portfolio/PortfolioScreen', () => () => null);
jest.mock('../../src/screens/Activity/ActivityScreen', () => () => null);
jest.mock('../../src/screens/Settings/SettingsScreen', () => () => null);
jest.mock(
  '../../src/screens/Settings/SecuritySettingsScreen',
  () => () => null,
);
jest.mock('../../src/screens/Settings/AddressBookScreen', () => () => null);
jest.mock('../../src/screens/Send/SendTransactionScreen', () => () => null);
jest.mock('../../src/screens/Receive/ReceiveTokenScreen', () => () => null);
jest.mock(
  '../../src/screens/WalletConnect/WalletConnectScreen',
  () => () => null,
);
jest.mock('../../src/screens/Swap/SwapScreen', () => () => null);
jest.mock('../../src/screens/Swap/SwapHistoryScreen', () => () => null);
jest.mock('../../src/screens/TokenDetail/TokenDetailScreen', () => () => null);
jest.mock('../../src/screens/CoinDetail/CoinDetailScreen', () => () => null);

import { AuthNavigator } from '../../src/navigation/AuthNavigator';
import MainTabNavigator from '../../src/navigation/MainTabNavigator';
import RootNavigator from '../../src/navigation/RootNavigator';

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider theme={theme}>
    <NavigationContainer>{children}</NavigationContainer>
  </ThemeProvider>
);

describe('AuthNavigator', () => {
  it('should render correctly', () => {
    const { toJSON } = render(
      <Wrapper>
        <AuthNavigator />
      </Wrapper>,
    );
    expect(toJSON()).toBeDefined();
  });

  it('should be a valid component', () => {
    expect(typeof AuthNavigator).toBe('function');
  });
});

describe('MainTabNavigator', () => {
  it('should render correctly', () => {
    const { toJSON } = render(
      <Wrapper>
        <MainTabNavigator />
      </Wrapper>,
    );
    expect(toJSON()).toBeDefined();
  });

  it('should be a valid component', () => {
    expect(typeof MainTabNavigator).toBe('function');
  });
});

describe('RootNavigator', () => {
  beforeEach(() => {
    mockWalletStore.hasWallet = false;
    mockWalletStore.isLocked = false;
  });

  it('should render correctly', () => {
    const { toJSON } = render(
      <Wrapper>
        <RootNavigator />
      </Wrapper>,
    );
    expect(toJSON()).toBeDefined();
  });

  it('should show Auth navigator when no wallet exists', () => {
    mockWalletStore.hasWallet = false;
    mockWalletStore.isLocked = false;

    const { toJSON } = render(
      <Wrapper>
        <RootNavigator />
      </Wrapper>,
    );
    expect(toJSON()).toBeDefined();
  });

  it('should show Unlock screen when wallet is locked', () => {
    mockWalletStore.hasWallet = true;
    mockWalletStore.isLocked = true;

    const { toJSON } = render(
      <Wrapper>
        <RootNavigator />
      </Wrapper>,
    );
    expect(toJSON()).toBeDefined();
  });

  it('should show Main navigator when wallet is unlocked', () => {
    mockWalletStore.hasWallet = true;
    mockWalletStore.isLocked = false;

    const { toJSON } = render(
      <Wrapper>
        <RootNavigator />
      </Wrapper>,
    );
    expect(toJSON()).toBeDefined();
  });

  it('should be a valid component', () => {
    expect(typeof RootNavigator).toBe('function');
  });

  it('covers the main stack with a lock overlay after an auto-lock instead of unmounting it', () => {
    mockWalletStore.hasWallet = true;
    mockWalletStore.isLocked = false;

    const view = render(
      <Wrapper>
        <RootNavigator />
      </Wrapper>,
    );
    expect(view.queryByTestId('lock-overlay')).toBeNull();

    mockWalletStore.isLocked = true;
    view.rerender(
      <Wrapper>
        <RootNavigator />
      </Wrapper>,
    );
    expect(view.getByTestId('lock-overlay')).toBeTruthy();
    expect(view.getByTestId('unlock-screen-mock')).toBeTruthy();
  });

  describe('auto-lock overlay', () => {
    const originalOS = Platform.OS;
    afterEach(() => {
      Platform.OS = originalOS;
      jest.restoreAllMocks();
    });

    const lockAfterUnlock = () => {
      mockWalletStore.hasWallet = true;
      mockWalletStore.isLocked = false;
      const view = render(
        <Wrapper>
          <RootNavigator />
        </Wrapper>,
      );
      mockWalletStore.isLocked = true;
      view.rerender(
        <Wrapper>
          <RootNavigator />
        </Wrapper>,
      );
      return view;
    };

    it('keeps the main stack mounted but hidden from accessibility and dismisses the keyboard', () => {
      const dismiss = jest.spyOn(Keyboard, 'dismiss');
      const view = lockAfterUnlock();
      const navigator = view.getByTestId('root-navigator', {
        includeHiddenElements: true,
      });
      expect(navigator.props.accessibilityElementsHidden).toBe(true);
      expect(navigator.props.importantForAccessibility).toBe(
        'no-hide-descendants',
      );
      expect(
        view.getByTestId('lock-overlay').props.accessibilityViewIsModal,
      ).toBe(true);
      expect(dismiss).toHaveBeenCalled();

      mockWalletStore.isLocked = false;
      view.rerender(
        <Wrapper>
          <RootNavigator />
        </Wrapper>,
      );
      expect(view.queryByTestId('lock-overlay')).toBeNull();
      expect(
        view.getByTestId('root-navigator', { includeHiddenElements: true })
          .props.accessibilityElementsHidden,
      ).toBe(false);
    });

    it('renders the iOS overlay in a full-window overlay above presented modals', () => {
      Platform.OS = 'ios';
      const view = lockAfterUnlock();
      const overlay = view.UNSAFE_getByType(FullWindowOverlay);
      expect(
        view.getByTestId('lock-overlay', { includeHiddenElements: true }),
      ).toBeTruthy();
      expect(overlay).toBeTruthy();
      // 잠긴 동안 표시되는 RN Modal은 없다 (WalletConnect 호스트 모달도 숨김).
      expect(
        view.UNSAFE_queryAllByType(Modal).filter(modal => modal.props.visible),
      ).toHaveLength(0);
    });

    it('uses a full-screen Modal on Android and routes back presses to the lock screen', () => {
      Platform.OS = 'android';
      mockOverlayBack.mockClear();
      const view = lockAfterUnlock();
      expect(view.UNSAFE_queryAllByType(FullWindowOverlay)).toHaveLength(0);
      const visibleModals = view
        .UNSAFE_queryAllByType(Modal)
        .filter(item => item.props.visible);
      expect(visibleModals).toHaveLength(1);
      const modal = visibleModals[0];
      expect(modal.props.presentationStyle).toBe('fullScreen');
      modal.props.onRequestClose();
      expect(mockOverlayBack).toHaveBeenCalledTimes(1);
    });
  });

  it('shows the plain unlock screen (no overlay) on a cold start', () => {
    mockWalletStore.hasWallet = true;
    mockWalletStore.isLocked = true;

    const view = render(
      <Wrapper>
        <RootNavigator />
      </Wrapper>,
    );
    expect(view.queryByTestId('lock-overlay')).toBeNull();
  });
});
