/**
 * UnlockScreen 테스트
 * 잠금 해제 스크린 테스트
 */

import React from 'react';
import {
  act,
  cleanup,
  render,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import UnlockScreen from '../../src/screens/Auth/UnlockScreen';
import { ThemeProvider } from 'styled-components/native';
import { lightTheme } from '../../src/styles/theme';
import {
  Alert,
  AppState,
  AppStateStatus,
  BackHandler,
  StyleSheet,
} from 'react-native';
import {
  UnlockBackHandlerContext,
  type UnlockBackHandlerRef,
} from '../../src/screens/Auth/unlockBackHandler';
import {
  PinLockedError,
  pinAttemptService,
} from '../../src/services/pinAttemptService';
import { useToastStore } from '../../src/store/toastStore';

// 네비게이션 모킹
const mockNavigate = jest.fn();
const mockReset = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
      reset: mockReset,
    }),
  };
});

// walletStore 모킹
const mockUnlock = jest.fn();
jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    unlock: mockUnlock,
  }),
}));

// walletService 모킹
const mockIsBiometricSupported = jest.fn();
const mockIsBiometricEnabled = jest.fn();

jest.mock('../../src/services/walletService', () => ({
  walletService: {
    isBiometricSupported: () => mockIsBiometricSupported(),
    isBiometricEnabled: () => mockIsBiometricEnabled(),
  },
}));

const mockUnlockWithPin = jest.fn();
const mockUnlockWithBiometric = jest.fn();
jest.mock('../../src/services/signerVault', () => ({
  signerVault: {
    unlockWithPin: (pin: string) => mockUnlockWithPin(pin),
    unlockWithBiometric: () => mockUnlockWithBiometric(),
  },
}));

const mockWalletReset = jest.fn();
jest.mock('../../src/services/walletResetService', () => ({
  walletResetService: { reset: () => mockWalletReset() },
}));

// Alert 모킹
jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={lightTheme}>{component}</ThemeProvider>);
};

const enterPin = (
  view: ReturnType<typeof renderWithTheme>,
  pin: string,
): void => {
  for (const digit of pin)
    fireEvent.press(view.getByTestId(`unlock-key-${digit}`));
};

const originalCurrentState = AppState.currentState;
const listeners: Array<(state: AppStateStatus) => void> = [];
const emitAppState = (state: AppStateStatus) => {
  (AppState as { currentState: unknown }).currentState = state;
  [...listeners].forEach(listener => listener(state));
};

describe('UnlockScreen', () => {
  let getStatus: jest.SpyInstance;

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
    (AppState as { currentState: unknown }).currentState = originalCurrentState;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    listeners.length = 0;
    (AppState.addEventListener as jest.Mock).mockImplementation(
      (_event: string, listener: (state: AppStateStatus) => void) => {
        listeners.push(listener);
        return {
          remove: () => {
            const index = listeners.indexOf(listener);
            if (index >= 0) listeners.splice(index, 1);
          },
        };
      },
    );
    getStatus = jest
      .spyOn(pinAttemptService, 'getStatus')
      .mockResolvedValue({ failures: 0, blockedUntil: 0 });
    useToastStore.getState().reset();
    mockIsBiometricSupported.mockResolvedValue(false);
    mockIsBiometricEnabled.mockResolvedValue(false);
    mockUnlockWithPin.mockResolvedValue(false);
    mockUnlockWithBiometric.mockResolvedValue(false);
    mockWalletReset.mockResolvedValue(undefined);
  });

  describe('렌더링', () => {
    it('should render PIN input screen correctly', () => {
      const { getByText } = renderWithTheme(<UnlockScreen />);

      expect(getByText('Tori Wallet')).toBeTruthy();
      expect(getByText('PIN 입력')).toBeTruthy();
      expect(getByText(/지갑 잠금을 해제/)).toBeTruthy();
    });

    it('should render keypad with numbers 0-9 and E2E key ids', () => {
      const view = renderWithTheme(<UnlockScreen />);

      for (let i = 0; i <= 9; i++) {
        expect(view.getByText(String(i))).toBeTruthy();
        expect(view.getByTestId(`unlock-key-${i}`)).toBeTruthy();
      }
      expect(view.getByText('⌫')).toBeTruthy();
    });

    it('shows the biometric key only when biometrics are enabled and supported', async () => {
      mockIsBiometricEnabled.mockResolvedValue(true);
      mockIsBiometricSupported.mockResolvedValue(true);
      const view = renderWithTheme(<UnlockScreen />);

      expect(await view.findByTestId('unlock-biometric')).toBeTruthy();
      expect(view.getByText('🔐')).toBeTruthy();
    });

    it.each([
      [true, false],
      [false, true],
    ])(
      'hides the biometric key when enabled=%s and supported=%s',
      async (enabled, supported) => {
        mockIsBiometricEnabled.mockResolvedValue(enabled);
        mockIsBiometricSupported.mockResolvedValue(supported);
        const view = renderWithTheme(<UnlockScreen />);
        await act(async () => {});
        expect(view.queryByTestId('unlock-biometric')).toBeNull();
        expect(view.queryByText('🔐')).toBeNull();
      },
    );
  });

  describe('PIN 입력', () => {
    it('should attempt unlock after 6 digits entered', async () => {
      mockUnlockWithPin.mockResolvedValue(true);
      const view = renderWithTheme(<UnlockScreen />);

      enterPin(view, '123456');

      await waitFor(() => {
        expect(mockUnlockWithPin).toHaveBeenCalledWith('123456');
        expect(mockUnlock).toHaveBeenCalled();
      });
    });

    it('shows an inline error for a wrong PIN without a blocking alert', async () => {
      const view = renderWithTheme(<UnlockScreen />);
      getStatus.mockResolvedValue({ failures: 1, blockedUntil: 0 });

      enterPin(view, '111111');

      expect(await view.findByText('PIN이 올바르지 않습니다.')).toBeTruthy();
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(mockUnlock).not.toHaveBeenCalled();
    });

    it('warns how many attempts remain before the lockout starts', async () => {
      const view = renderWithTheme(<UnlockScreen />);
      getStatus.mockResolvedValue({ failures: 3, blockedUntil: 0 });

      enterPin(view, '111111');

      await waitFor(() =>
        expect(view.getByTestId('unlock-attempts-warning').props.children).toBe(
          '2번 더 틀리면 PIN 입력이 30초 동안 제한됩니다.',
        ),
      );
    });

    it('clears the error when the next PIN entry starts', async () => {
      const view = renderWithTheme(<UnlockScreen />);
      enterPin(view, '111111');
      await view.findByText('PIN이 올바르지 않습니다.');

      fireEvent.press(view.getByTestId('unlock-key-1'));

      expect(view.queryByText('PIN이 올바르지 않습니다.')).toBeNull();
    });
  });

  describe('생체인증', () => {
    it('should attempt biometric auth when enabled and supported', async () => {
      mockIsBiometricEnabled.mockResolvedValue(true);
      mockIsBiometricSupported.mockResolvedValue(true);
      mockUnlockWithBiometric.mockResolvedValue(true);

      renderWithTheme(<UnlockScreen />);

      await waitFor(() => {
        expect(mockUnlockWithBiometric).toHaveBeenCalledTimes(1);
        expect(mockUnlock).toHaveBeenCalled();
      });
    });

    it('does not prompt when biometrics are disabled', async () => {
      renderWithTheme(<UnlockScreen />);
      await act(async () => {});
      expect(mockUnlockWithBiometric).not.toHaveBeenCalled();
    });

    it('should fall back to PIN when biometric fails', async () => {
      mockIsBiometricEnabled.mockResolvedValue(true);
      mockIsBiometricSupported.mockResolvedValue(true);
      mockUnlockWithBiometric.mockRejectedValue(new Error('Biometric failed'));

      const { getByText } = renderWithTheme(<UnlockScreen />);

      await waitFor(() => {
        expect(mockUnlockWithBiometric).toHaveBeenCalled();
      });
      expect(getByText('PIN 입력')).toBeTruthy();
      expect(mockUnlock).not.toHaveBeenCalled();
    });

    it('retries from the biometric key after a cancelled prompt', async () => {
      mockIsBiometricEnabled.mockResolvedValue(true);
      mockIsBiometricSupported.mockResolvedValue(true);
      const view = renderWithTheme(<UnlockScreen />);
      await waitFor(() =>
        expect(mockUnlockWithBiometric).toHaveBeenCalledTimes(1),
      );
      mockUnlockWithBiometric.mockResolvedValue(true);

      fireEvent.press(await view.findByTestId('unlock-biometric'));

      await waitFor(() => expect(mockUnlock).toHaveBeenCalled());
      expect(mockUnlockWithBiometric).toHaveBeenCalledTimes(2);
    });

    it('re-prompts when the app returns to active after locking in the background', async () => {
      mockIsBiometricEnabled.mockResolvedValue(true);
      mockIsBiometricSupported.mockResolvedValue(true);
      // '즉시' 자동 잠금: 잠금 화면이 백그라운드에서 마운트된다.
      (AppState as { currentState: unknown }).currentState = 'background';

      renderWithTheme(<UnlockScreen />);
      await act(async () => {});
      expect(mockUnlockWithBiometric).not.toHaveBeenCalled();

      mockUnlockWithBiometric.mockResolvedValue(true);
      await act(async () => emitAppState('active'));

      await waitFor(() => expect(mockUnlock).toHaveBeenCalled());
      expect(mockUnlockWithBiometric).toHaveBeenCalledTimes(1);
    });

    it('does not re-prompt for inactive → active transitions caused by the prompt itself', async () => {
      mockIsBiometricEnabled.mockResolvedValue(true);
      mockIsBiometricSupported.mockResolvedValue(true);
      (AppState as { currentState: unknown }).currentState = 'active';
      renderWithTheme(<UnlockScreen />);
      await waitFor(() =>
        expect(mockUnlockWithBiometric).toHaveBeenCalledTimes(1),
      );

      await act(async () => {
        emitAppState('inactive');
        emitAppState('active');
      });

      expect(mockUnlockWithBiometric).toHaveBeenCalledTimes(1);
    });
  });

  describe('보안 - 시도 횟수 제한', () => {
    it('shows a live mm:ss countdown, disables the keypad and keeps the wallet locked', async () => {
      mockUnlockWithPin.mockRejectedValue(
        new PinLockedError(Date.now() + 1_900),
      );
      const view = renderWithTheme(<UnlockScreen />);
      enterPin(view, '111111');

      const countdown = await view.findByTestId('unlock-lockout-countdown');
      expect(countdown.props.children).toBe('00:02');
      expect(view.queryByText(/초 후/)).toBeNull();
      expect(
        view.getByTestId('unlock-key-1').props.accessibilityState.disabled,
      ).toBe(true);
      expect(Alert.alert).not.toHaveBeenCalled();

      // 1초마다 갱신된다.
      await waitFor(
        () =>
          expect(
            view.getByTestId('unlock-lockout-countdown').props.children,
          ).toBe('00:01'),
        { timeout: 2_000 },
      );

      // 제한 중에는 키를 눌러도 검증하지 않는다.
      mockUnlockWithPin.mockClear();
      enterPin(view, '123456');
      expect(mockUnlockWithPin).not.toHaveBeenCalled();

      // 시간이 지나면 자동으로 풀린다.
      await waitFor(
        () => expect(view.queryByTestId('unlock-lockout')).toBeNull(),
        {
          timeout: 3_000,
        },
      );
      expect(
        view.getByTestId('unlock-key-1').props.accessibilityState.disabled,
      ).toBe(false);
      expect(mockUnlock).not.toHaveBeenCalled();
    });

    it('restores an active lockout from storage when the screen opens', async () => {
      getStatus.mockResolvedValue({
        failures: 9,
        blockedUntil: Date.now() + 60 * 60 * 1000,
      });
      const view = renderWithTheme(<UnlockScreen />);

      expect(
        (await view.findByTestId('unlock-lockout-countdown')).props.children,
      ).toMatch(/^(60:00|59:59)$/);
    });
  });

  describe('PIN 분실', () => {
    it('requires typing the confirmation word before resetting the wallet', async () => {
      const view = renderWithTheme(<UnlockScreen />);

      fireEvent.press(view.getByTestId('unlock-forgot-pin'));
      expect(view.getByText(/복구 구문으로 지갑을 다시 가져오고/)).toBeTruthy();

      fireEvent.press(view.getByTestId('forgot-pin-reset'));
      expect(mockWalletReset).not.toHaveBeenCalled();

      fireEvent.changeText(
        view.getByTestId('forgot-pin-confirm-input'),
        '초기',
      );
      fireEvent.press(view.getByTestId('forgot-pin-reset'));
      expect(mockWalletReset).not.toHaveBeenCalled();

      fireEvent.changeText(
        view.getByTestId('forgot-pin-confirm-input'),
        '초기화',
      );
      await act(async () => {
        fireEvent.press(view.getByTestId('forgot-pin-reset'));
      });

      expect(mockWalletReset).toHaveBeenCalledTimes(1);
      expect(useToastStore.getState().current?.message).toContain(
        '복구 구문으로 지갑을 다시 가져오세요',
      );
    });

    it('is available while the PIN lockout is active', async () => {
      getStatus.mockResolvedValue({
        failures: 6,
        blockedUntil: Date.now() + 60_000,
      });
      const view = renderWithTheme(<UnlockScreen />);
      await view.findByTestId('unlock-lockout');

      fireEvent.press(view.getByTestId('unlock-forgot-pin'));
      fireEvent.changeText(
        view.getByTestId('forgot-pin-confirm-input'),
        '초기화',
      );
      await act(async () => {
        fireEvent.press(view.getByTestId('forgot-pin-reset'));
      });

      expect(mockWalletReset).toHaveBeenCalledTimes(1);
    });

    it('keeps the danger background while resetting so the spinner stays visible (light theme)', async () => {
      let finishReset!: () => void;
      mockWalletReset.mockReturnValue(
        new Promise<void>(resolve => {
          finishReset = resolve;
        }),
      );
      const view = renderWithTheme(<UnlockScreen />);
      fireEvent.press(view.getByTestId('unlock-forgot-pin'));
      fireEvent.changeText(
        view.getByTestId('forgot-pin-confirm-input'),
        '초기화',
      );
      fireEvent.press(view.getByTestId('forgot-pin-reset'));

      const button = view.getByTestId('forgot-pin-reset');
      expect(view.getByTestId('forgot-pin-reset-spinner').props.color).toBe(
        lightTheme.colors.onError,
      );
      // 흰 스피너가 비활성 회색(#E4E4E7) 위에 놓이지 않는다.
      const background = StyleSheet.flatten(button.props.style).backgroundColor;
      expect(background).toBe(lightTheme.colors.error);
      expect(background).not.toBe(lightTheme.colors.disabledBackground);
      expect(button.props.accessibilityState).toEqual({
        disabled: true,
        busy: true,
      });

      await act(async () => {
        finishReset();
      });
    });

    it('shows the reset failure inline and can return to PIN entry', async () => {
      mockWalletReset.mockRejectedValue(new Error('삭제 실패'));
      const view = renderWithTheme(<UnlockScreen />);

      fireEvent.press(view.getByTestId('unlock-forgot-pin'));
      fireEvent.changeText(
        view.getByTestId('forgot-pin-confirm-input'),
        '초기화',
      );
      await act(async () => {
        fireEvent.press(view.getByTestId('forgot-pin-reset'));
      });

      expect(view.getByTestId('forgot-pin-error').props.children).toBe(
        '삭제 실패',
      );
      fireEvent.press(view.getByTestId('forgot-pin-cancel'));
      expect(view.getByTestId('unlock-key-1')).toBeTruthy();
    });
  });

  describe('하드웨어 뒤로 가기 (Android)', () => {
    let backHandlers: Array<() => boolean | null | undefined>;

    beforeEach(() => {
      backHandlers = [];
      jest
        .spyOn(BackHandler, 'addEventListener')
        .mockImplementation((_event, handler) => {
          backHandlers.push(handler);
          return {
            remove: () => {
              backHandlers = backHandlers.filter(item => item !== handler);
            },
          };
        });
    });

    afterEach(() => {
      (BackHandler.addEventListener as jest.Mock).mockRestore();
    });

    const pressBack = () => {
      let handled = false;
      act(() => {
        // BackHandler는 마지막에 등록된 처리기부터 호출한다.
        for (const handler of [...backHandlers].reverse()) {
          if (handler()) {
            handled = true;
            break;
          }
        }
      });
      return handled;
    };

    it('returns from the forgot-PIN panel to PIN entry and consumes the press', () => {
      const view = renderWithTheme(<UnlockScreen />);
      // PIN 입력 화면에서는 가로채지 않는다 (콜드 스타트 기본 동작 유지).
      expect(backHandlers).toHaveLength(0);

      fireEvent.press(view.getByTestId('unlock-forgot-pin'));
      expect(view.getByTestId('forgot-pin-panel')).toBeTruthy();

      expect(pressBack()).toBe(true);
      expect(view.queryByTestId('forgot-pin-panel')).toBeNull();
      expect(view.getByTestId('unlock-key-1')).toBeTruthy();
      expect(backHandlers).toHaveLength(0);
    });

    it('ignores back while the wallet reset is running', async () => {
      let finishReset!: () => void;
      mockWalletReset.mockReturnValue(
        new Promise<void>(resolve => {
          finishReset = resolve;
        }),
      );
      const view = renderWithTheme(<UnlockScreen />);
      fireEvent.press(view.getByTestId('unlock-forgot-pin'));
      fireEvent.changeText(
        view.getByTestId('forgot-pin-confirm-input'),
        '초기화',
      );
      fireEvent.press(view.getByTestId('forgot-pin-reset'));

      expect(pressBack()).toBe(true);
      expect(view.getByTestId('forgot-pin-panel')).toBeTruthy();

      await act(async () => {
        finishReset();
      });
    });

    it('handles the lock overlay Modal back press through the overlay context', () => {
      const overlayBack: UnlockBackHandlerRef = { current: null };
      const view = renderWithTheme(
        <UnlockBackHandlerContext.Provider value={overlayBack}>
          <UnlockScreen />
        </UnlockBackHandlerContext.Provider>,
      );
      expect(overlayBack.current).toBeNull();

      fireEvent.press(view.getByTestId('unlock-forgot-pin'));
      expect(overlayBack.current).toEqual(expect.any(Function));

      let handled: boolean | undefined;
      act(() => {
        handled = overlayBack.current?.();
      });
      expect(handled).toBe(true);
      expect(view.queryByTestId('forgot-pin-panel')).toBeNull();
      expect(overlayBack.current).toBeNull();
    });
  });

  describe('에러 처리', () => {
    it('should handle PIN verification error gracefully', async () => {
      mockUnlockWithPin.mockRejectedValue(new Error('Storage error'));

      const view = renderWithTheme(<UnlockScreen />);
      enterPin(view, '123456');

      expect(
        await view.findByText('PIN 확인에 실패했습니다. 다시 시도해주세요.'),
      ).toBeTruthy();
      expect(mockUnlock).not.toHaveBeenCalled();
    });
  });
});
