import React from 'react';
import { AppState, AppStateStatus, StyleSheet } from 'react-native';
import {
  render,
  renderHook,
  act,
  fireEvent,
} from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { darkTheme } from '../../src/styles/theme';
import PinConfirmModal from '../../src/components/common/PinConfirmModal';
import { signerVault } from '../../src/services/signerVault';
import { useWalletStore } from '../../src/store/walletStore';
import { useAuthentication } from '../../src/hooks/useAuthentication';
import { walletService } from '../../src/services/walletService';
import {
  PinLockedError,
  pinAttemptService,
} from '../../src/services/pinAttemptService';

jest.mock('../../src/services/walletService', () => ({
  walletService: {
    retrieveMnemonicWithPin: jest.fn(),
    retrieveMnemonic: jest.fn(),
    validateMnemonic: jest.fn(() => true),
    isBiometricEnabled: jest.fn(async () => false),
    isBiometricSupported: jest.fn(async () => true),
  },
}));
const mnemonic =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const retrieve = walletService.retrieveMnemonicWithPin as jest.Mock;
const retrieveBiometric = walletService.retrieveMnemonic as jest.Mock;
const biometricEnabled = walletService.isBiometricEnabled as jest.Mock;
const props = { visible: true, onConfirm: jest.fn(), onCancel: jest.fn() };
const element = (visible = true, extra: { allowBiometric?: boolean } = {}) => (
  <ThemeProvider theme={darkTheme}>
    <PinConfirmModal {...props} {...extra} visible={visible} />
  </ThemeProvider>
);
beforeEach(() => {
  jest.clearAllMocks();
  biometricEnabled.mockResolvedValue(false);
  signerVault.lock();
  // 거래 승인 PIN은 잠금 해제된 지갑에서만 동작한다.
  useWalletStore.setState({ hasWallet: true, isLocked: false });
  jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());

it.each(['cancel', 'unmount', 'hidden', 'background'])(
  'discards pending authentication after %s',
  async action => {
    let resolve!: (value: string) => void;
    retrieve.mockReturnValue(
      new Promise(r => {
        resolve = r;
      }),
    );
    let onState: (state: AppStateStatus) => void = () => {};
    const listener = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, cb) => {
        onState = cb;
        return { remove: jest.fn() };
      });
    const view = render(element());
    for (const digit of '123456')
      fireEvent.press(view.getByTestId(`pin-key-${digit}`));
    expect(retrieve).toHaveBeenCalledTimes(1);
    if (action === 'cancel')
      fireEvent.press(view.getByTestId('pin-confirm-cancel'));
    if (action === 'unmount') view.unmount();
    if (action === 'hidden') view.rerender(element(false));
    if (action === 'background') act(() => onState('background'));
    await act(async () => {
      resolve(mnemonic);
    });
    expect(signerVault.isUnlocked()).toBe(false);
    expect(props.onConfirm).not.toHaveBeenCalled();
    view.unmount();
    listener.mockRestore();
  },
);

it('draws its keys in a different color from the surface card behind them', async () => {
  const view = render(element());
  await act(async () => {});
  const card = StyleSheet.flatten(
    view.getByTestId('pin-confirm-container').props.style,
  );
  const key = StyleSheet.flatten(view.getByTestId('pin-key-5').props.style);
  expect(card.backgroundColor).toBe(darkTheme.colors.surface);
  expect(key.backgroundColor).not.toBe(card.backgroundColor);
  expect(key.borderWidth).toBe(1);
});

it('unlocks and confirms once for successful PIN verification', async () => {
  retrieve.mockResolvedValue(mnemonic);
  const view = render(element());
  for (const digit of '123456')
    fireEvent.press(view.getByTestId(`pin-key-${digit}`));
  await act(async () => {});
  expect(retrieve).toHaveBeenCalledWith('123456');
  expect(signerVault.isUnlocked()).toBe(true);
  expect(props.onConfirm).toHaveBeenCalledTimes(1);
});

it('shows the shared persistent lock error without confirming', async () => {
  retrieve.mockRejectedValue(new PinLockedError(Date.now() + 30_000));
  const view = render(element());
  for (const digit of '123456')
    fireEvent.press(view.getByTestId(`pin-key-${digit}`));
  await act(async () => {});
  expect(view.getByTestId('pin-confirm-error').props.children).toContain(
    'PIN 입력이 제한',
  );
  expect(view.getByTestId('pin-confirm-error').props.children).toMatch(
    /\d{2}:\d{2} 후 다시 시도/,
  );
  expect(view.getByTestId('pin-key-1').props.accessibilityState.disabled).toBe(
    true,
  );
  expect(props.onConfirm).not.toHaveBeenCalled();
  expect(signerVault.isUnlocked()).toBe(false);
});

it('shows the wrong PIN message with the remaining attempts', async () => {
  retrieve.mockResolvedValue(null);
  jest
    .spyOn(pinAttemptService, 'getStatus')
    .mockResolvedValue({ failures: 4, blockedUntil: 0 });
  const view = render(element());
  for (const digit of '123456')
    fireEvent.press(view.getByTestId(`pin-key-${digit}`));
  await act(async () => {});
  expect(view.getByTestId('pin-confirm-error').props.children).toBe(
    'PIN이 올바르지 않습니다.',
  );
  expect(view.getByTestId('pin-confirm-attempts-warning').props.children).toBe(
    '1번 더 틀리면 PIN 입력이 30초 동안 제한됩니다.',
  );
  expect(props.onConfirm).not.toHaveBeenCalled();
});

describe('biometric approval', () => {
  beforeEach(() => {
    biometricEnabled.mockResolvedValue(true);
  });

  it('prompts once on open and confirms with the same signer session as a PIN', async () => {
    retrieveBiometric.mockResolvedValue(mnemonic);
    const view = render(element());
    await act(async () => {});
    expect(retrieveBiometric).toHaveBeenCalledTimes(1);
    expect(retrieve).not.toHaveBeenCalled();
    expect(signerVault.isUnlocked()).toBe(true);
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('pin-confirm-biometric')).toBeTruthy();
  });

  it('falls back to the PIN pad after a cancelled prompt and can retry', async () => {
    retrieveBiometric.mockResolvedValue(null);
    const view = render(element());
    await act(async () => {});
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(view.getByTestId('pin-confirm-notice')).toBeTruthy();
    expect(signerVault.isUnlocked()).toBe(false);

    retrieveBiometric.mockResolvedValue(mnemonic);
    fireEvent.press(view.getByTestId('pin-confirm-biometric'));
    await act(async () => {});
    expect(retrieveBiometric).toHaveBeenCalledTimes(2);
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('discards a biometric result that arrives after the modal is hidden', async () => {
    let resolve!: (value: string) => void;
    retrieveBiometric.mockReturnValue(
      new Promise(r => {
        resolve = r;
      }),
    );
    const view = render(element());
    await act(async () => {});
    expect(retrieveBiometric).toHaveBeenCalledTimes(1);
    view.rerender(element(false));
    await act(async () => {
      resolve(mnemonic);
    });
    expect(signerVault.isUnlocked()).toBe(false);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('can retry biometrics during a PIN lockout after the first prompt failed', async () => {
    jest
      .spyOn(pinAttemptService, 'getStatus')
      .mockResolvedValue({ failures: 7, blockedUntil: Date.now() + 8 * 60_000 });
    retrieveBiometric.mockResolvedValueOnce(null);
    const view = render(element());
    await act(async () => {});

    // 자동 프롬프트가 실패했고 PIN 키패드(🔐 키 포함)는 제한으로 막혀 있다.
    expect(retrieveBiometric).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('pin-confirm-error').props.children).toContain(
      'PIN 입력이 제한',
    );
    expect(view.getByTestId('pin-key-1').props.accessibilityState.disabled).toBe(
      true,
    );

    const retry = view.getByTestId('pin-confirm-biometric-during-lockout');
    expect(retry.props.accessibilityState.disabled).toBe(false);

    retrieveBiometric.mockResolvedValueOnce(mnemonic);
    fireEvent.press(retry);
    await act(async () => {});

    expect(retrieveBiometric).toHaveBeenCalledTimes(2);
    expect(retrieve).not.toHaveBeenCalled();
    expect(signerVault.isUnlocked()).toBe(true);
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not offer the lockout retry button without a lockout', async () => {
    retrieveBiometric.mockResolvedValueOnce(null);
    const view = render(element());
    await act(async () => {});
    expect(
      view.queryByTestId('pin-confirm-biometric-during-lockout'),
    ).toBeNull();
  });

  it('can be turned off by the caller', async () => {
    const view = render(element(true, { allowBiometric: false }));
    await act(async () => {});
    expect(retrieveBiometric).not.toHaveBeenCalled();
    expect(view.queryByTestId('pin-confirm-biometric')).toBeNull();
  });

  it('is not offered when biometrics are disabled', async () => {
    biometricEnabled.mockResolvedValue(false);
    const view = render(element());
    await act(async () => {});
    expect(retrieveBiometric).not.toHaveBeenCalled();
    expect(view.queryByTestId('pin-confirm-biometric')).toBeNull();
  });
});

describe('auto-lock', () => {
  it('cancels and disappears when the wallet locks while it is open', () => {
    const view = render(element());
    expect(view.getByTestId('pin-confirm-container')).toBeTruthy();

    act(() => {
      useWalletStore.getState().lock();
    });
    expect(view.queryByTestId('pin-confirm-container')).toBeNull();
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('discards a PIN result that races the lock without opening a session', async () => {
    let resolve!: (value: string) => void;
    retrieve.mockReturnValue(
      new Promise(r => {
        resolve = r;
      }),
    );
    const view = render(element());
    for (const digit of '123456')
      fireEvent.press(view.getByTestId(`pin-key-${digit}`));
    expect(retrieve).toHaveBeenCalledTimes(1);

    // 서명 볼트 세대가 바뀌지 않는 경로로 잠겨도 세션이 열리지 않아야 한다.
    act(() => {
      useWalletStore.setState({ isLocked: true });
    });
    await act(async () => {
      resolve(mnemonic);
    });
    expect(signerVault.isUnlocked()).toBe(false);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('refuses to start a signer session while the wallet is locked', async () => {
    act(() => {
      useWalletStore.setState({ isLocked: true });
    });
    retrieve.mockResolvedValue(mnemonic);
    const { result } = renderHook(() =>
      useAuthentication({ requireUnlockedWallet: true }),
    );
    let outcome: boolean | null = true;
    await act(async () => {
      outcome = await result.current.authenticate('123456');
    });
    expect(outcome).toBeNull();
    expect(retrieve).not.toHaveBeenCalled();
    expect(signerVault.isUnlocked()).toBe(false);
  });

  it('does not prompt for biometrics when it is requested while locked', async () => {
    biometricEnabled.mockResolvedValue(true);
    retrieveBiometric.mockResolvedValue(mnemonic);
    act(() => {
      useWalletStore.setState({ isLocked: true });
    });
    const view = render(element());
    await act(async () => {});
    expect(view.queryByTestId('pin-confirm-container')).toBeNull();
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(retrieveBiometric).not.toHaveBeenCalled();
    expect(signerVault.isUnlocked()).toBe(false);
  });

  it('still lets the lock screen authenticate (no wallet-lock requirement)', async () => {
    act(() => {
      useWalletStore.setState({ isLocked: true });
    });
    retrieve.mockResolvedValue(mnemonic);
    const { result } = renderHook(() => useAuthentication());
    let outcome: boolean | null = null;
    await act(async () => {
      outcome = await result.current.authenticate('123456');
    });
    expect(outcome).toBe(true);
    expect(signerVault.isUnlocked()).toBe(true);
  });
});
