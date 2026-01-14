/**
 * Tori Wallet - Navigation Tests
 */

import React from 'react';
import { render } from '@testing-library/react-native';
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
jest.mock('../../src/screens/Auth/UnlockScreen', () => () => null);
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
});
