/**
 * Tori Wallet - SecuritySettingsScreen Tests
 * 보안 설정 화면 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { SecuritySettingsScreen } from '../../src/screens/Settings/SecuritySettingsScreen';
import { theme } from '../../src/styles/theme';

// Navigation mocks
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
}));

// Store mocks
const mockSetAutoLockTimeout = jest.fn();
const mockSetRequirePinForTransaction = jest.fn();
const mockSetTransactionLimit = jest.fn();
const mockClearRecentAddresses = jest.fn();

jest.mock('../../src/store/securityStore', () => ({
  useSecurityStore: () => ({
    autoLockTimeout: 60000,
    setAutoLockTimeout: mockSetAutoLockTimeout,
    requirePinForTransaction: true,
    setRequirePinForTransaction: mockSetRequirePinForTransaction,
    transactionLimit: null,
    setTransactionLimit: mockSetTransactionLimit,
    addressBook: [],
    clearRecentAddresses: mockClearRecentAddresses,
  }),
  AUTO_LOCK_OPTIONS: [0, 30000, 60000, 300000, 600000],
  AUTO_LOCK_LABELS: {
    0: '사용 안함',
    30000: '30초',
    60000: '1분',
    300000: '5분',
    600000: '10분',
  },
}));

// walletService mock
jest.mock('../../src/services/walletService', () => ({
  walletService: {
    isBiometricSupported: jest.fn().mockResolvedValue(true),
  },
}));

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('SecuritySettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be a function component', () => {
    expect(typeof SecuritySettingsScreen).toBe('function');
  });

  it('should render the screen', () => {
    renderWithTheme(<SecuritySettingsScreen />);
    expect(screen.getByText('보안 설정')).toBeTruthy();
  });

  it('should render auto lock setting', () => {
    renderWithTheme(<SecuritySettingsScreen />);
    expect(screen.getByText('자동 잠금 시간')).toBeTruthy();
    expect(screen.getByText('1분')).toBeTruthy();
  });

  it('should render transaction PIN setting', () => {
    renderWithTheme(<SecuritySettingsScreen />);
    expect(screen.getByText('송금/스왑 시 PIN 확인')).toBeTruthy();
    expect(screen.getByText('트랜잭션 전 PIN 입력 필요')).toBeTruthy();
  });

  it('should render transaction limit setting', () => {
    renderWithTheme(<SecuritySettingsScreen />);
    expect(screen.getByText('트랜잭션 한도')).toBeTruthy();
    expect(screen.getByText('무제한')).toBeTruthy();
  });

  it('should render address book section', () => {
    renderWithTheme(<SecuritySettingsScreen />);
    expect(screen.getByText('주소 관리')).toBeTruthy();
    expect(screen.getByText('주소록')).toBeTruthy();
  });

  it('should render clear recent addresses option', () => {
    renderWithTheme(<SecuritySettingsScreen />);
    expect(screen.getByText('최근 주소 삭제')).toBeTruthy();
    expect(screen.getByText('최근 사용한 주소 기록 삭제')).toBeTruthy();
  });

  it('should render section headers', () => {
    renderWithTheme(<SecuritySettingsScreen />);
    expect(screen.getByText('자동 잠금')).toBeTruthy();
    expect(screen.getByText('트랜잭션 보안')).toBeTruthy();
    expect(screen.getByText('주소 관리')).toBeTruthy();
  });
});
