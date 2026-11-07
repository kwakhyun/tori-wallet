/**
 * 설정 보안 흐름 테스트 (지갑 삭제, 복구 구문, PIN 변경)
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { ThemeProvider } from 'styled-components/native';
import { darkTheme } from '../../../src/styles/theme';
import { DeleteWalletModal } from '../../../src/screens/Settings/components/DeleteWalletModal';
import { RecoveryPhraseModal } from '../../../src/screens/Settings/components/RecoveryPhraseModal';
import { ChangePinModal } from '../../../src/screens/Settings/components/ChangePinModal';
import { useWalletStore } from '../../../src/store/walletStore';

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const CORRECT_PIN = '135790';

const mockRetrieveMnemonicWithPin = jest.fn(async (pin: string) =>
  pin === CORRECT_PIN ? MNEMONIC : null,
);
const mockStoreMnemonic = jest.fn(
  async (_mnemonic: string, _pin: string) => undefined,
);
jest.mock('../../../src/services/walletService', () => ({
  walletService: {
    retrieveMnemonicWithPin: (pin: string) => mockRetrieveMnemonicWithPin(pin),
    validateMnemonic: (value: string) => value.split(' ').length === 12,
    storeMnemonic: (mnemonic: string, pin: string) =>
      mockStoreMnemonic(mnemonic, pin),
  },
}));

const mockReset = jest.fn(async () => undefined);
jest.mock('../../../src/services/walletResetService', () => ({
  walletResetService: { reset: () => mockReset() },
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), canGoBack: () => true }),
}));

const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={darkTheme}>{ui}</ThemeProvider>);

async function enterPin(
  getByTestId: (id: string) => unknown,
  prefix: string,
  pin: string,
) {
  for (const digit of pin) {
    await act(async () => {
      fireEvent.press(getByTestId(`${prefix}-key-${digit}`) as never);
    });
  }
}

describe('DeleteWalletModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWalletStore.setState({ isLocked: false });
  });

  it('requires typed confirmation and the PIN before deleting', async () => {
    const onClose = jest.fn();
    const { getByTestId, queryByTestId, getByText } = wrap(
      <DeleteWalletModal mode="delete" onClose={onClose} />,
    );

    expect(getByText(/영구적으로 삭제/)).toBeTruthy();
    fireEvent.press(getByTestId('delete-wallet-continue'));

    // 확인 문구가 일치하기 전에는 다음 단계로 갈 수 없다.
    fireEvent.press(getByTestId('delete-wallet-confirm-next'));
    expect(queryByTestId('delete-wallet-pin-prompt')).toBeNull();
    fireEvent.changeText(getByTestId('delete-wallet-confirm-input'), '삭 제');
    fireEvent.press(getByTestId('delete-wallet-confirm-next'));
    expect(queryByTestId('delete-wallet-pin-prompt')).toBeNull();

    fireEvent.changeText(getByTestId('delete-wallet-confirm-input'), '삭제');
    fireEvent.press(getByTestId('delete-wallet-confirm-next'));
    expect(getByTestId('delete-wallet-pin-prompt')).toBeTruthy();

    await enterPin(getByTestId, 'delete-wallet-pin', '000000');
    await waitFor(() =>
      expect(getByTestId('delete-wallet-pin-error')).toBeTruthy(),
    );
    expect(mockReset).not.toHaveBeenCalled();

    await enterPin(getByTestId, 'delete-wallet-pin', CORRECT_PIN);
    await waitFor(() => expect(mockReset).toHaveBeenCalledTimes(1));
  });

  it('offers to review the recovery phrase before deleting', async () => {
    const { getByTestId } = wrap(
      <DeleteWalletModal mode="replace" onClose={jest.fn()} />,
    );

    fireEvent.press(getByTestId('delete-wallet-show-backup'));
    await enterPin(getByTestId, 'delete-wallet-backup-pin', CORRECT_PIN);

    await waitFor(() =>
      expect(getByTestId('delete-wallet-backup-words')).toBeTruthy(),
    );
    fireEvent.press(getByTestId('delete-wallet-backup-done'));
    expect(getByTestId('delete-wallet-continue')).toBeTruthy();
    expect(mockReset).not.toHaveBeenCalled();
  });
});

describe('RecoveryPhraseModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWalletStore.setState({ isLocked: false });
  });

  it('shows a warning header and reveals the words only after the PIN', async () => {
    const { getByTestId, queryByTestId, queryByText } = wrap(
      <RecoveryPhraseModal visible onClose={jest.fn()} />,
    );

    expect(getByTestId('recovery-phrase-warning')).toBeTruthy();
    expect(queryByTestId('recovery-phrase-words')).toBeNull();
    // 복사 버튼은 제공하지 않는다.
    expect(queryByText(/복사/)).toBeNull();

    await enterPin(getByTestId, 'recovery-phrase-pin', CORRECT_PIN);
    await waitFor(() =>
      expect(getByTestId('recovery-phrase-words')).toBeTruthy(),
    );
  });

  it('clears the phrase and closes when the wallet locks', async () => {
    const onClose = jest.fn();
    const { getByTestId, queryByTestId, queryAllByText } = wrap(
      <RecoveryPhraseModal visible onClose={onClose} />,
    );
    await enterPin(getByTestId, 'recovery-phrase-pin', CORRECT_PIN);
    await waitFor(() => expect(queryAllByText('abandon')).toHaveLength(11));

    act(() => {
      useWalletStore.setState({ isLocked: true });
    });

    expect(onClose).toHaveBeenCalled();
    expect(queryByTestId('recovery-phrase-words')).toBeNull();
    expect(queryAllByText('abandon')).toHaveLength(0);
  });

  it('clears the phrase when the app leaves the foreground', async () => {
    const onClose = jest.fn();
    const addListener = AppState.addEventListener as jest.Mock;
    addListener.mockClear();
    const { getByTestId, queryByTestId } = wrap(
      <RecoveryPhraseModal visible onClose={onClose} />,
    );
    await enterPin(getByTestId, 'recovery-phrase-pin', CORRECT_PIN);
    await waitFor(() =>
      expect(getByTestId('recovery-phrase-words')).toBeTruthy(),
    );

    act(() => {
      addListener.mock.calls.forEach(([, handler]) =>
        (handler as (state: string) => void)('background'),
      );
    });

    expect(onClose).toHaveBeenCalled();
    expect(queryByTestId('recovery-phrase-words')).toBeNull();
  });
});

describe('ChangePinModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWalletStore.setState({ isLocked: false });
  });

  it('re-encrypts with the new PIN after verifying the current PIN', async () => {
    const onClose = jest.fn();
    const { getByTestId, queryByTestId } = wrap(
      <ChangePinModal visible onClose={onClose} />,
    );

    await enterPin(getByTestId, 'change-pin-current', CORRECT_PIN);
    await waitFor(() =>
      expect(getByTestId('change-pin-new-dots')).toBeTruthy(),
    );

    // 현재 PIN과 같은 PIN은 거부한다.
    await enterPin(getByTestId, 'change-pin-new', CORRECT_PIN);
    expect(getByTestId('change-pin-error')).toBeTruthy();

    await enterPin(getByTestId, 'change-pin-new', '246802');
    await waitFor(() =>
      expect(getByTestId('change-pin-confirm-dots')).toBeTruthy(),
    );
    await enterPin(getByTestId, 'change-pin-confirm', '246802');

    await waitFor(() =>
      expect(mockStoreMnemonic).toHaveBeenCalledWith(MNEMONIC, '246802'),
    );
    expect(onClose).toHaveBeenCalled();
    expect(queryByTestId('change-pin-error')).toBeNull();
  });

  it('does not change the PIN when the current PIN is wrong', async () => {
    const { getByTestId } = wrap(
      <ChangePinModal visible onClose={jest.fn()} />,
    );

    await enterPin(getByTestId, 'change-pin-current', '111111');
    await waitFor(() =>
      expect(getByTestId('change-pin-current-error')).toBeTruthy(),
    );
    expect(mockStoreMnemonic).not.toHaveBeenCalled();
  });
});
