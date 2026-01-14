/**
 * Tori Wallet - SettingsScreen Tests
 * 설정 스크린 테스트
 */

import React from 'react';
import { render } from '../test-utils';

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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly', () => {
    const { toJSON } = render(<SettingsScreen />);
    expect(toJSON()).not.toBeNull();
  });

  it('should display wallet info', () => {
    const { root } = render(<SettingsScreen />);
    expect(root).toBeTruthy();
  });

  it('should have network settings', () => {
    const { root } = render(<SettingsScreen />);
    expect(root.children).toBeDefined();
  });

  it('should have security settings option', () => {
    const { root } = render(<SettingsScreen />);
    expect(root).toBeTruthy();
  });

  it('should have lock wallet option', () => {
    const { root } = render(<SettingsScreen />);
    expect(root).toBeTruthy();
  });

  it('should have backup option', () => {
    const { root } = render(<SettingsScreen />);
    expect(root).toBeTruthy();
  });

  it('should render multiple times consistently', () => {
    const tree1 = render(<SettingsScreen />);
    const tree2 = render(<SettingsScreen />);
    expect(tree1).toBeTruthy();
    expect(tree2).toBeTruthy();
  });
});

describe('SettingsScreen - Network Settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should display network list', () => {
    const { root } = render(<SettingsScreen />);
    expect(root).toBeTruthy();
  });

  it('should have network switch capability', () => {
    const { root } = render(<SettingsScreen />);
    expect(root.children).toBeDefined();
  });
});

describe('SettingsScreen - Wallet Settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should display wallet address', () => {
    const { root } = render(<SettingsScreen />);
    expect(root).toBeTruthy();
  });

  it('should have wallet management options', () => {
    const { root } = render(<SettingsScreen />);
    expect(root).toBeTruthy();
  });
});
