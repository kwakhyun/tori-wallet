/**
 * 설정 화면 테스트
 */

import React from 'react';
import { Alert, Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import SettingsScreen from '../../src/screens/Settings/SettingsScreen';
import { darkTheme } from '../../src/styles/theme';
import { useWalletStore } from '../../src/store/walletStore';
import { usePreferencesStore } from '../../src/store/preferencesStore';
import { APP_VERSION } from '../../src/config/appInfo';
import { legalDocumentUrl } from '../../src/screens/Settings/settingsLinks';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('../../src/services/walletService', () => ({
  walletService: {
    retrieveMnemonicWithPin: jest.fn(async () => null),
    validateMnemonic: jest.fn(() => true),
  },
}));

jest.mock('../../src/services/walletResetService', () => ({
  walletResetService: { reset: jest.fn(async () => undefined) },
}));

jest.mock('../../src/services/signerVault', () => ({
  signerVault: { lock: jest.fn(), isUnlocked: jest.fn(() => true) },
}));

const ADDRESS = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

const renderScreen = () =>
  render(
    <ThemeProvider theme={darkTheme}>
      <SettingsScreen />
    </ThemeProvider>,
  );

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWalletStore.setState({
      hasWallet: true,
      isLocked: false,
      wallets: [
        {
          address: ADDRESS,
          name: 'Account 1',
          isHD: true,
          derivationPath: "m/44'/60'/0'/0/0",
        },
        {
          address: '0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0',
          name: '저축',
          isHD: true,
          derivationPath: "m/44'/60'/0'/0/1",
        },
      ],
      activeWalletIndex: 1,
      activeNetworkChainId: 11155111,
    });
    usePreferencesStore.setState({ currency: 'KRW', hideBalances: false });
  });

  it('shows the active account and links to account management', () => {
    renderScreen();
    expect(screen.getByText('저축')).toBeTruthy();
    expect(screen.getByText('계정 2개')).toBeTruthy();
    fireEvent.press(screen.getByTestId('settings-account-card'));
    expect(mockNavigate).toHaveBeenCalledWith('Accounts');
  });

  it('shows the version once from package.json and no dead items', () => {
    renderScreen();
    expect(screen.getAllByText(APP_VERSION)).toHaveLength(1);
    expect(screen.queryByText('개발자 모드')).toBeNull();
    expect(screen.queryByText('로그아웃')).toBeNull();
    expect(screen.queryByText('지갑 전환')).toBeNull();
  });

  it('has a single security entry and top-level asset entries', () => {
    renderScreen();
    fireEvent.press(screen.getByTestId('settings-security'));
    expect(mockNavigate).toHaveBeenLastCalledWith('SecuritySettings');
    fireEvent.press(screen.getByTestId('settings-address-book'));
    expect(mockNavigate).toHaveBeenLastCalledWith('AddressBook');
    fireEvent.press(screen.getByTestId('settings-token-management'));
    expect(mockNavigate).toHaveBeenLastCalledWith('TokenManagement');
    fireEvent.press(screen.getByTestId('settings-token-approvals'));
    expect(mockNavigate).toHaveBeenLastCalledWith('TokenApprovals');
    // 보안 항목은 보안 화면으로 옮겼다.
    expect(screen.queryByText('복구 구문 보기')).toBeNull();
    expect(screen.queryByText('PIN 변경')).toBeNull();
  });

  it('locks immediately with an accurately named action', () => {
    renderScreen();
    expect(screen.getByText('지금 잠그기')).toBeTruthy();
    fireEvent.press(screen.getByTestId('settings-lock-now'));
    expect(useWalletStore.getState().isLocked).toBe(true);
  });

  it('changes the display currency', () => {
    renderScreen();
    expect(screen.getByText('원 (₩)')).toBeTruthy();
    fireEvent.press(screen.getByTestId('settings-currency'));
    fireEvent.press(screen.getByTestId('currency-option-USD'));
    expect(usePreferencesStore.getState().currency).toBe('USD');
    expect(screen.getByText('달러 ($)')).toBeTruthy();
  });

  it('toggles hide balances', () => {
    renderScreen();
    const toggle = screen.getByTestId('settings-hide-balances');
    expect(toggle.props.accessibilityRole).toBe('switch');
    fireEvent(toggle, 'valueChange', true);
    expect(usePreferencesStore.getState().hideBalances).toBe(true);
  });

  it('offers Korean and English legal documents', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const openSpy = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(undefined as never);
    renderScreen();

    fireEvent.press(screen.getByTestId('settings-privacy'));
    const buttons = alertSpy.mock.calls[0][2]!;
    expect(buttons.map(button => button.text)).toEqual([
      '한국어',
      'English',
      '취소',
    ]);
    buttons[1].onPress?.();
    expect(openSpy).toHaveBeenCalledWith(legalDocumentUrl('privacy', 'en'));
    expect(legalDocumentUrl('privacy', 'en')).toMatch(
      /docs\/PRIVACY_POLICY_EN\.md$/,
    );
    expect(legalDocumentUrl('terms', 'ko')).toMatch(
      /docs\/TERMS_OF_SERVICE\.md$/,
    );
  });

  it('protects wallet deletion and replacement with the delete flow', () => {
    renderScreen();
    fireEvent.press(screen.getByTestId('settings-delete-wallet'));
    expect(screen.getByTestId('delete-wallet-modal')).toBeTruthy();
    expect(screen.getByText(/영구적으로 삭제됩니다/)).toBeTruthy();
    fireEvent.press(screen.getAllByTestId('delete-wallet-cancel')[0]);

    fireEvent.press(screen.getByTestId('settings-replace-wallet'));
    expect(
      screen.getByText(/한 번에 하나의 복구 구문만 보관합니다/),
    ).toBeTruthy();
  });

  it('opens the network modal with an add-network action', () => {
    renderScreen();
    fireEvent.press(screen.getByTestId('settings-network'));
    expect(screen.getByTestId('settings-network-modal')).toBeTruthy();
    expect(screen.getByTestId('network-add-button')).toBeTruthy();
  });
});
