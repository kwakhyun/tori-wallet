/**
 * SecuritySettingsScreen 테스트
 */

import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import {
  SecuritySettingsScreen,
  describeTransactionPinPolicy,
  isAutoLockWeakening,
} from '../../src/screens/Settings/SecuritySettingsScreen';
import { darkTheme } from '../../src/styles/theme';
import {
  formatTransactionLimitUsd,
  isTransactionLimitWeakening,
  parseTransactionLimitInput,
  useSecurityStore,
} from '../../src/store/securityStore';
import { useWalletStore } from '../../src/store/walletStore';
import { usePreferencesStore } from '../../src/store/preferencesStore';

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const CORRECT_PIN = '135790';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    canGoBack: () => true,
  }),
}));

const mockEnableBiometric = jest.fn(async (_mnemonic: string) => undefined);
jest.mock('../../src/services/walletService', () => ({
  walletService: {
    isBiometricSupported: jest.fn(async () => true),
    isBiometricEnabled: jest.fn(async () => false),
    enableBiometric: (mnemonic: string) => mockEnableBiometric(mnemonic),
    disableBiometric: jest.fn(async () => undefined),
    retrieveMnemonicWithPin: jest.fn(async (pin: string) =>
      pin === CORRECT_PIN ? MNEMONIC : null,
    ),
    validateMnemonic: (value: string) => value.split(' ').length === 12,
    storeMnemonic: jest.fn(async () => undefined),
  },
}));

const renderScreen = () =>
  render(
    <ThemeProvider theme={darkTheme}>
      <SecuritySettingsScreen />
    </ThemeProvider>,
  );

async function enterPin(prefix: string, pin: string) {
  for (const digit of pin) {
    await act(async () => {
      fireEvent.press(screen.getByTestId(`${prefix}-key-${digit}`));
    });
  }
}

describe('SecuritySettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSecurityStore.getState().resetSecurityState();
    useWalletStore.setState({ isLocked: false });
    // KRW는 환율 조회(네트워크)를 시작하므로 테스트에서는 USD로 고정한다.
    usePreferencesStore.setState({ currency: 'USD' });
  });

  it('has a header with an accessible back button', async () => {
    renderScreen();
    expect(screen.getByText('보안')).toBeTruthy();
    fireEvent.press(screen.getByTestId('security-settings-header-back'));
    expect(mockGoBack).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('PIN 변경')).toBeTruthy());
  });

  it('consolidates the security items in one screen', async () => {
    renderScreen();
    expect(screen.getByText('복구 구문 보기')).toBeTruthy();
    expect(screen.getByText('PIN 변경')).toBeTruthy();
    // 스위치 행은 라벨을 스위치 자체에 붙여 한 번만 읽히게 한다.
    expect(screen.getByLabelText('생체 인증으로 잠금 해제')).toBeTruthy();
    expect(screen.getByText('자동 잠금 시간')).toBeTruthy();
    expect(screen.getByText('1분')).toBeTruthy();
    expect(screen.getByLabelText('PIN 항상 요구')).toBeTruthy();
    expect(screen.getByText('PIN 없이 허용할 한도')).toBeTruthy();
    fireEvent.press(screen.getByTestId('security-token-approvals'));
    expect(mockNavigate).toHaveBeenCalledWith('TokenApprovals');
    await waitFor(() =>
      expect(screen.getByTestId('security-biometric-switch')).toBeTruthy(),
    );
  });

  it('shows a $0 limit as $0 instead of unlimited', async () => {
    useSecurityStore.setState({ transactionLimit: 0 });
    renderScreen();
    expect(screen.getByText('$0')).toBeTruthy();
    expect(screen.queryByText('무제한')).toBeNull();
    expect(screen.queryByText('한도 없음')).toBeNull();
    await waitFor(() => expect(screen.getByText('PIN 변경')).toBeTruthy());
  });

  it('shows "한도 없음" when no limit is set', async () => {
    renderScreen();
    expect(screen.getByText('한도 없음')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('PIN 변경')).toBeTruthy());
  });

  it('requires the PIN before disabling the transaction PIN', async () => {
    renderScreen();
    fireEvent(
      screen.getByTestId('security-tx-pin-switch'),
      'valueChange',
      false,
    );

    expect(screen.getByTestId('disable-tx-pin-modal')).toBeTruthy();
    expect(useSecurityStore.getState().requirePinForTransaction).toBe(true);

    await enterPin('disable-tx-pin-modal-pin', '000000');
    await waitFor(() =>
      expect(screen.getByTestId('disable-tx-pin-modal-pin-error')).toBeTruthy(),
    );
    expect(useSecurityStore.getState().requirePinForTransaction).toBe(true);

    await enterPin('disable-tx-pin-modal-pin', CORRECT_PIN);
    await waitFor(() =>
      expect(useSecurityStore.getState().requirePinForTransaction).toBe(false),
    );
  });

  it('turns the transaction PIN back on without a PIN', async () => {
    useSecurityStore.setState({ requirePinForTransaction: false });
    renderScreen();
    fireEvent(
      screen.getByTestId('security-tx-pin-switch'),
      'valueChange',
      true,
    );
    expect(useSecurityStore.getState().requirePinForTransaction).toBe(true);
    await waitFor(() => expect(screen.getByText('PIN 변경')).toBeTruthy());
  });

  it('requires the PIN before raising the limit', async () => {
    useSecurityStore.setState({ transactionLimit: 100 });
    renderScreen();
    fireEvent.press(screen.getByTestId('security-tx-limit'));
    fireEvent.changeText(screen.getByTestId('transaction-limit-input'), '500');
    fireEvent.press(screen.getByTestId('transaction-limit-save'));

    expect(screen.getByTestId('transaction-limit-pin-prompt')).toBeTruthy();
    expect(useSecurityStore.getState().transactionLimit).toBe(100);

    await enterPin('transaction-limit-pin', CORRECT_PIN);
    await waitFor(() =>
      expect(useSecurityStore.getState().transactionLimit).toBe(500),
    );
  });

  it('requires the PIN before removing the limit', async () => {
    useSecurityStore.setState({ transactionLimit: 100 });
    renderScreen();
    fireEvent.press(screen.getByTestId('security-tx-limit'));
    fireEvent.changeText(screen.getByTestId('transaction-limit-input'), '');
    fireEvent.press(screen.getByTestId('transaction-limit-save'));

    expect(screen.getByTestId('transaction-limit-pin-prompt')).toBeTruthy();
    await enterPin('transaction-limit-pin', CORRECT_PIN);
    await waitFor(() =>
      expect(useSecurityStore.getState().transactionLimit).toBeNull(),
    );
  });

  it('lowers the limit without a PIN and validates input', async () => {
    useSecurityStore.setState({ transactionLimit: 100 });
    renderScreen();
    fireEvent.press(screen.getByTestId('security-tx-limit'));

    fireEvent.changeText(screen.getByTestId('transaction-limit-input'), '-5');
    fireEvent.press(screen.getByTestId('transaction-limit-save'));
    expect(
      screen.getByText('0 이상의 숫자를 소수점 둘째 자리까지 입력해주세요.'),
    ).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('transaction-limit-input'), '0');
    fireEvent.press(screen.getByTestId('transaction-limit-save'));
    expect(useSecurityStore.getState().transactionLimit).toBe(0);
    await waitFor(() => expect(screen.getByText('PIN 변경')).toBeTruthy());
  });

  it('requires the PIN before lengthening the auto-lock timeout', async () => {
    useSecurityStore.setState({ autoLockTimeout: '1m' });
    renderScreen();
    fireEvent.press(screen.getByTestId('security-auto-lock'));
    fireEvent.press(screen.getByTestId('auto-lock-option-15m'));

    // 선택 시트가 닫히고 PIN 시트가 열린다. 확인 전에는 값이 바뀌지 않는다.
    expect(screen.queryByTestId('auto-lock-modal')).toBeNull();
    expect(screen.getByTestId('lengthen-auto-lock-modal')).toBeTruthy();
    expect(useSecurityStore.getState().autoLockTimeout).toBe('1m');

    await enterPin('lengthen-auto-lock-modal-pin', '000000');
    await waitFor(() =>
      expect(
        screen.getByTestId('lengthen-auto-lock-modal-pin-error'),
      ).toBeTruthy(),
    );
    expect(useSecurityStore.getState().autoLockTimeout).toBe('1m');

    await enterPin('lengthen-auto-lock-modal-pin', CORRECT_PIN);
    await waitFor(() =>
      expect(useSecurityStore.getState().autoLockTimeout).toBe('15m'),
    );
    expect(screen.queryByTestId('lengthen-auto-lock-modal')).toBeNull();
  });

  it('keeps the auto-lock timeout when the PIN prompt is cancelled', async () => {
    useSecurityStore.setState({ autoLockTimeout: '1m' });
    renderScreen();
    fireEvent.press(screen.getByTestId('security-auto-lock'));
    fireEvent.press(screen.getByTestId('auto-lock-option-5m'));
    fireEvent.press(screen.getByTestId('lengthen-auto-lock-modal-close'));

    expect(screen.queryByTestId('lengthen-auto-lock-modal')).toBeNull();
    expect(useSecurityStore.getState().autoLockTimeout).toBe('1m');
    await waitFor(() => expect(screen.getByText('PIN 변경')).toBeTruthy());
  });

  it('shortens the auto-lock timeout without a PIN', async () => {
    useSecurityStore.setState({ autoLockTimeout: '5m' });
    renderScreen();
    fireEvent.press(screen.getByTestId('security-auto-lock'));
    fireEvent.press(screen.getByTestId('auto-lock-option-30s'));

    expect(useSecurityStore.getState().autoLockTimeout).toBe('30s');
    expect(screen.queryByTestId('lengthen-auto-lock-modal')).toBeNull();
    await waitFor(() => expect(screen.getByText('PIN 변경')).toBeTruthy());
  });

  it('requires the PIN before enabling biometrics', async () => {
    renderScreen();
    await waitFor(() =>
      expect(
        screen.getByTestId('security-biometric-switch').props.disabled,
      ).toBeFalsy(),
    );
    fireEvent(
      screen.getByTestId('security-biometric-switch'),
      'valueChange',
      true,
    );
    expect(screen.getByTestId('biometric-pin-modal')).toBeTruthy();
    expect(mockEnableBiometric).not.toHaveBeenCalled();

    await enterPin('biometric-pin-modal-pin', CORRECT_PIN);
    await waitFor(() =>
      expect(mockEnableBiometric).toHaveBeenCalledWith(MNEMONIC),
    );
  });
});

describe('transaction PIN policy helpers', () => {
  it('describes each policy clearly', () => {
    expect(describeTransactionPinPolicy(true, 100)).toContain(
      '모든 송금·스왑·dApp 서명 전에 PIN',
    );
    const limited = describeTransactionPinPolicy(false, 100, '≈ ₩130,000');
    expect(limited).toContain('$100(≈ ₩130,000) 이하');
    expect(limited).toContain('금액(USD)을 확인할 수 없는 거래는 PIN이 필요');
    expect(describeTransactionPinPolicy(false, null)).toContain(
      '모든 거래가 PIN 없이',
    );
  });

  it('formats, parses and classifies limit changes', () => {
    expect(formatTransactionLimitUsd(null)).toBe('한도 없음');
    expect(formatTransactionLimitUsd(0)).toBe('$0');
    expect(formatTransactionLimitUsd(1234.5)).toBe('$1,234.5');

    expect(parseTransactionLimitInput('')).toEqual({ ok: true, value: null });
    expect(parseTransactionLimitInput('1,000.25')).toEqual({
      ok: true,
      value: 1000.25,
    });
    expect(parseTransactionLimitInput('1.234').ok).toBe(false);
    expect(parseTransactionLimitInput('abc').ok).toBe(false);
    expect(parseTransactionLimitInput('9999999999').ok).toBe(false);

    expect(isTransactionLimitWeakening(null, 100)).toBe(false);
    expect(isTransactionLimitWeakening(100, 50)).toBe(false);
    expect(isTransactionLimitWeakening(100, 100)).toBe(false);
    expect(isTransactionLimitWeakening(100, 101)).toBe(true);
    expect(isTransactionLimitWeakening(100, null)).toBe(true);
    expect(isTransactionLimitWeakening(0, null)).toBe(true);
  });

  it('flags only longer auto-lock timeouts as weakening', () => {
    expect(isAutoLockWeakening('1m', '15m')).toBe(true);
    expect(isAutoLockWeakening('immediate', '30s')).toBe(true);
    expect(isAutoLockWeakening('5m', '30s')).toBe(false);
    expect(isAutoLockWeakening('1m', '1m')).toBe(false);
    expect(isAutoLockWeakening('15m', 'immediate')).toBe(false);
  });

  it('rejects invalid stored limits', () => {
    expect(() => useSecurityStore.getState().setTransactionLimit(-1)).toThrow();
    expect(() =>
      useSecurityStore.getState().setTransactionLimit(Number.NaN),
    ).toThrow();
  });
});
