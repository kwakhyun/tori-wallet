/**
 * 계정 관리 화면 테스트
 */

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '../test-utils';
import AccountsScreen from '../../src/screens/Settings/AccountsScreen';
import { usePreferencesStore } from '../../src/store/preferencesStore';

const mockAddAccount = jest.fn();
const mockRenameAccount = jest.fn();
const mockSwitchAccount = jest.fn();
const mockWallets = [
  {
    address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
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
];

jest.mock('../../src/hooks/useWallet', () => ({
  MAX_ACCOUNT_NAME_LENGTH: 24,
  useWallet: () => ({
    wallets: mockWallets,
    activeWalletIndex: 0,
    addAccount: mockAddAccount,
    renameAccount: mockRenameAccount,
    switchAccount: mockSwitchAccount,
  }),
}));

jest.mock('../../src/hooks/useBalance', () => ({
  useBalance: () => ({
    data: { wei: 10n ** 18n, formatted: '1.5', symbol: 'ETH' },
    isError: false,
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), canGoBack: () => true }),
}));

describe('AccountsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePreferencesStore.setState({ currency: 'USD', hideBalances: false });
  });

  it('lists derived accounts with short addresses, balances and the active one', () => {
    render(<AccountsScreen />);
    expect(screen.getByText('Account 1')).toBeTruthy();
    expect(screen.getByText('저축')).toBeTruthy();
    expect(screen.getByText('0x6Fac4D...4Ab9C0')).toBeTruthy();
    expect(screen.getAllByText('1.5 ETH')).toHaveLength(2);
    expect(
      screen.getByTestId('account-row-0').props.accessibilityState,
    ).toMatchObject({ selected: true });
  });

  it('masks balances when hide balances is on', () => {
    usePreferencesStore.setState({ hideBalances: true });
    render(<AccountsScreen />);
    expect(screen.queryByText('1.5 ETH')).toBeNull();
    expect(screen.getAllByText('••••')).toHaveLength(2);
  });

  it('switches the active account', () => {
    render(<AccountsScreen />);
    fireEvent.press(screen.getByTestId('account-row-1'));
    expect(mockSwitchAccount).toHaveBeenCalledWith(1);
  });

  it('adds an account and explains a locked wallet', async () => {
    mockAddAccount.mockResolvedValueOnce('0xabc');
    render(<AccountsScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('accounts-add'));
    });
    expect(mockAddAccount).toHaveBeenCalledTimes(1);

    const alertSpy = jest.spyOn(Alert, 'alert');
    mockAddAccount.mockRejectedValueOnce(new Error('Wallet is locked'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('accounts-add'));
    });
    expect(alertSpy).toHaveBeenCalledWith(
      '계정을 추가하지 못했습니다',
      expect.stringContaining('잠금을 해제'),
    );
  });

  it('renames an account', async () => {
    mockRenameAccount.mockResolvedValueOnce(undefined);
    render(<AccountsScreen />);
    fireEvent.press(screen.getByTestId('account-rename-1'));
    fireEvent.changeText(screen.getByTestId('account-rename-input'), '여행');
    await act(async () => {
      fireEvent.press(screen.getByTestId('account-rename-save'));
    });
    expect(mockRenameAccount).toHaveBeenCalledWith(
      mockWallets[1].address,
      '여행',
    );
  });
});
