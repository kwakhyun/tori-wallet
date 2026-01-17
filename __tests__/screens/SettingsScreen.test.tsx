/**
 * 설정 스크린 테스트
 */

// 네비게이션 모킹
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

// Theme Store 모킹
jest.mock('../../src/store/themeStore', () => ({
  useThemeStore: () => ({
    themeMode: 'system',
    setThemeMode: jest.fn(),
    activeTheme: {
      colors: {
        primary: '#7B61FF',
        background: '#0D0D0D',
        surface: '#1A1A1A',
        textPrimary: '#FFFFFF',
        border: '#333333',
      },
    },
  }),
  themeModeOptions: [
    { value: 'light', label: '라이트' },
    { value: 'dark', label: '다크' },
    { value: 'system', label: '시스템' },
  ],
}));

// Store 모킹
jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
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
      { chainId: 137, name: 'Polygon', symbol: 'MATIC', isTestnet: false },
    ],
    setActiveNetwork: jest.fn(),
    lock: jest.fn(),
    reset: jest.fn(),
  }),
}));

// Services 모킹
jest.mock('../../src/services/walletService', () => ({
  walletService: {
    isBiometricSupported: jest.fn().mockResolvedValue(false),
    retrieveMnemonic: jest.fn().mockResolvedValue(null),
    verifyPin: jest.fn().mockResolvedValue(true),
    changePin: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('react-native-encrypted-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

import SettingsScreen from '../../src/screens/Settings/SettingsScreen';

describe('SettingsScreen', () => {
  it('should be a function component', () => {
    expect(typeof SettingsScreen).toBe('function');
  });

  it('should be defined', () => {
    expect(SettingsScreen).toBeDefined();
  });

  it('should have correct component name', () => {
    expect(SettingsScreen.name).toBe('SettingsScreen');
  });
});
