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
import { PinPrompt } from '../../../src/screens/Settings/components/PinPrompt';
import {
  PinLockedError,
  WEAK_PIN_MESSAGE,
  pinAttemptService,
} from '../../../src/services/pinAttemptService';

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const CORRECT_PIN = '135790';

const mockRetrieveMnemonicWithPin = jest.fn(
  async (pin: string): Promise<string | null> =>
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

  it.each(['123456', '111111', '121212'])(
    'rejects the guessable new PIN %s with the onboarding policy',
    async weakPin => {
      const { getByTestId, queryByTestId } = wrap(
        <ChangePinModal visible onClose={jest.fn()} />,
      );

      await enterPin(getByTestId, 'change-pin-current', CORRECT_PIN);
      await waitFor(() =>
        expect(getByTestId('change-pin-new-dots')).toBeTruthy(),
      );

      await enterPin(getByTestId, 'change-pin-new', weakPin);
      expect(getByTestId('change-pin-error').props.children).toBe(
        WEAK_PIN_MESSAGE,
      );
      // 확인 단계로 넘어가지 않고 새 PIN을 다시 입력받는다.
      expect(queryByTestId('change-pin-confirm-dots')).toBeNull();
      expect(getByTestId('change-pin-new-dots')).toBeTruthy();
      expect(mockStoreMnemonic).not.toHaveBeenCalled();

      // 안전한 PIN은 그대로 확인 단계로 진행한다.
      await enterPin(getByTestId, 'change-pin-new', '246802');
      await waitFor(() =>
        expect(getByTestId('change-pin-confirm-dots')).toBeTruthy(),
      );
    },
  );

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

describe('PinPrompt lockout UX', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWalletStore.setState({ isLocked: false });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('warns how many attempts remain after a wrong PIN', async () => {
    jest
      .spyOn(pinAttemptService, 'getStatus')
      .mockResolvedValue({ failures: 4, blockedUntil: 0 });
    const { getByTestId } = wrap(
      <PinPrompt
        description="PIN을 입력하세요."
        onVerified={jest.fn()}
        testIDPrefix="prompt"
      />,
    );

    await enterPin(getByTestId, 'prompt', '000000');

    await waitFor(() =>
      expect(getByTestId('prompt-error').props.children).toBe(
        'PIN이 올바르지 않습니다.',
      ),
    );
    expect(getByTestId('prompt-attempts-warning').props.children).toBe(
      '1번 더 틀리면 PIN 입력이 30초 동안 제한됩니다.',
    );
  });

  it('counts down the lockout, disables the keypad and re-enables it afterwards', async () => {
    jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') });
    const retryAt = Date.now() + 30_000;
    const getStatus = jest
      .spyOn(pinAttemptService, 'getStatus')
      .mockResolvedValue({ failures: 4, blockedUntil: 0 });
    // 다섯 번째 실패로 제한이 시작된다.
    mockRetrieveMnemonicWithPin.mockImplementationOnce(async () => {
      getStatus.mockResolvedValue({ failures: 5, blockedUntil: retryAt });
      throw new PinLockedError(retryAt);
    });
    const onVerified = jest.fn();
    const { getByTestId, queryByTestId } = wrap(
      <PinPrompt
        description="PIN을 입력하세요."
        onVerified={onVerified}
        testIDPrefix="prompt"
      />,
    );

    await enterPin(getByTestId, 'prompt', '000000');

    expect(getByTestId('prompt-error').props.children).toBe(
      'PIN 입력이 제한되었습니다. 00:30 후 다시 시도해주세요.',
    );
    expect(getByTestId('prompt-key-1').props.accessibilityState.disabled).toBe(
      true,
    );

    // 남은 시간이 1초마다 갱신된다.
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(getByTestId('prompt-error').props.children).toBe(
      'PIN 입력이 제한되었습니다. 00:29 후 다시 시도해주세요.',
    );

    // 제한 중에는 입력을 받지 않는다.
    fireEvent.press(getByTestId('prompt-key-1'));
    expect(mockRetrieveMnemonicWithPin).toHaveBeenCalledTimes(1);

    getStatus.mockResolvedValue({ failures: 5, blockedUntil: 0 });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    // 제한이 풀리면 고정된 오류 문구 대신 다음 실패 경고만 남고 키패드가 다시 열린다.
    expect(getByTestId('prompt-key-1').props.accessibilityState.disabled).toBe(
      false,
    );
    expect(getByTestId('prompt-attempts-warning').props.children).toBe(
      '다시 틀리면 PIN 입력이 1분 동안 제한됩니다.',
    );
    expect(queryByTestId('prompt-error')).toBeNull();

    await enterPin(getByTestId, 'prompt', CORRECT_PIN);
    expect(onVerified).toHaveBeenCalledWith(MNEMONIC, CORRECT_PIN);
  });
});
