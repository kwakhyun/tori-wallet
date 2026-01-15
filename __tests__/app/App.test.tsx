/**
 * Tori Wallet - App Tests
 * 앱 진입점 테스트
 */

import React from 'react';

// Navigation mocks
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    NavigationContainer: ({ children }: { children: React.ReactNode }) =>
      children,
  };
});

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

// Store mock
jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    hasWallet: false,
    isLocked: false,
    wallets: [],
    activeWalletIndex: 0,
    activeNetworkChainId: 1,
    networks: [],
  }),
}));

// Screen mocks
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

// Realm mock
jest.mock('../../src/realm', () => ({
  initializeRealm: jest.fn().mockResolvedValue(undefined),
  userPreferencesService: {
    loadAll: jest.fn().mockResolvedValue(undefined),
  },
  realmDB: {
    getInstance: jest.fn(),
  },
}));

// Theme store mock
jest.mock('../../src/store/themeStore', () => ({
  useThemeStore: () => ({
    activeTheme: {
      colors: {
        primary: '#7B61FF',
        background: '#0D0D0D',
        surface: '#1A1A1A',
        textPrimary: '#FFFFFF',
        border: '#333333',
        success: '#22C55E',
        error: '#EF4444',
      },
    },
    isDarkMode: true,
    updateSystemTheme: jest.fn(),
  }),
}));

import App from '../../App';

describe('App', () => {
  it('should be defined', () => {
    expect(App).toBeDefined();
  });

  it('should be a valid React component', () => {
    // App 컴포넌트가 정상적으로 정의되어 있는지 확인
    expect(App).toBeDefined();
    // default export는 .name이 없을 수 있음
    expect(typeof App === 'function' || typeof App === 'object').toBe(true);
  });
});
