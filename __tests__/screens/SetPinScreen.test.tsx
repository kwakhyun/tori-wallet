/**
 * SetPinScreen 테스트
 * PIN 설정 화면 테스트 - 보안 핵심 테스트
 */

import React from 'react';
import {
  act,
  cleanup,
  render,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { lightTheme } from '../../src/styles/theme';
import { Alert, AlertButton } from 'react-native';

// 네비게이션 모킹
const mockDispatch = jest.fn();
const mockGoBack = jest.fn();
type BeforeRemoveListener = (event: { preventDefault: () => void }) => void;
const mockBeforeRemove: BeforeRemoveListener[] = [];
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: mockGoBack,
      dispatch: mockDispatch,
      addListener: (event: string, listener: BeforeRemoveListener) => {
        if (event === 'beforeRemove') mockBeforeRemove.push(listener);
        return () => {
          const index = mockBeforeRemove.indexOf(listener);
          if (index >= 0) mockBeforeRemove.splice(index, 1);
        };
      },
    }),
    CommonActions: {
      reset: jest
        .fn()
        .mockImplementation(config => ({ type: 'RESET', ...config })),
    },
  };
});

// Store 모킹
const mockAddWallet = jest.fn();
const mockSetHasWallet = jest.fn();
const mockUnlock = jest.fn();
jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    addWallet: mockAddWallet,
    setHasWallet: mockSetHasWallet,
    unlock: mockUnlock,
  }),
}));

// Services 모킹
const mockStoreMnemonic = jest.fn();
const mockStoreAccounts = jest.fn();
const mockClearAll = jest.fn();
const mockIsBiometricSupported = jest.fn();
const mockEnableBiometric = jest.fn();
jest.mock('../../src/services/walletService', () => ({
  walletService: {
    storeMnemonic: (...args: unknown[]) => mockStoreMnemonic(...args),
    storeAccounts: (...args: unknown[]) => mockStoreAccounts(...args),
    clearAll: (...args: unknown[]) => mockClearAll(...args),
    isBiometricSupported: () => mockIsBiometricSupported(),
    enableBiometric: (mnemonic: string) => mockEnableBiometric(mnemonic),
  },
}));

const mockMnemonic =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const mockSnapshot = jest.fn();
const mockIsActive = jest.fn();
const mockClear = jest.fn();
const mockDiscard = jest.fn();
jest.mock('../../src/services/onboardingVault', () => ({
  onboardingVault: {
    getSnapshot: () => mockSnapshot(),
    isActive: (id: number) => mockIsActive(id),
    clear: (reason?: string) => mockClear(reason),
    discard: () => mockDiscard(),
  },
}));

const mockStartSession = jest.fn();
const mockIsUnlocked = jest.fn();
jest.mock('../../src/services/signerVault', () => ({
  signerVault: {
    startSession: (mnemonic: string) => mockStartSession(mnemonic),
    isUnlocked: () => mockIsUnlocked(),
  },
}));

// Alert 모킹
jest.spyOn(Alert, 'alert').mockImplementation(() => {});

import SetPinScreen, {
  PIN_MISMATCH_MESSAGE,
  WEAK_PIN_MESSAGE,
} from '../../src/screens/Auth/SetPinScreen';

const STRONG_PIN = '135790';

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={lightTheme}>{component}</ThemeProvider>);
};

const enterPin = (
  view: ReturnType<typeof renderWithTheme>,
  pin: string,
): void => {
  for (const digit of pin) {
    fireEvent.press(view.getByTestId(`set-pin-key-${digit}`));
  }
};

describe('SetPinScreen', () => {
  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockBeforeRemove.length = 0;
    mockSnapshot.mockReturnValue({
      sessionId: 1,
      mnemonic: mockMnemonic,
      walletAddress: '0x1234567890123456789012345678901234567890',
      source: 'create',
    });
    mockIsActive.mockReturnValue(true);
    mockStoreMnemonic.mockResolvedValue(undefined);
    mockStoreAccounts.mockResolvedValue(undefined);
    mockClearAll.mockResolvedValue(undefined);
    mockStartSession.mockReturnValue(undefined);
    mockIsBiometricSupported.mockResolvedValue(false);
    mockEnableBiometric.mockResolvedValue(undefined);
    mockIsUnlocked.mockReturnValue(true);
  });

  describe('렌더링', () => {
    it('should render PIN 설정 title initially', () => {
      const { getByText } = renderWithTheme(<SetPinScreen />);
      expect(getByText('PIN 설정')).toBeTruthy();
    });

    it('should display description for PIN creation', () => {
      const { getByText } = renderWithTheme(<SetPinScreen />);
      expect(getByText(/6자리 PIN을 입력/)).toBeTruthy();
    });

    it('should render numeric keypad with E2E key ids', () => {
      const view = renderWithTheme(<SetPinScreen />);

      for (let i = 0; i <= 9; i++) {
        expect(view.getByText(String(i))).toBeTruthy();
        expect(view.getByTestId(`set-pin-key-${i}`)).toBeTruthy();
      }
    });

    it('should have an accessible back button', () => {
      const { getByText, getByLabelText } = renderWithTheme(<SetPinScreen />);
      expect(getByText('←')).toBeTruthy();
      expect(getByLabelText('뒤로 가기')).toBeTruthy();
    });
  });

  describe('PIN 입력 - 1단계 (생성)', () => {
    it('should transition to confirm step after 6 digits', async () => {
      const view = renderWithTheme(<SetPinScreen />);
      enterPin(view, STRONG_PIN);
      expect(view.getByText('PIN 확인')).toBeTruthy();
    });

    it.each(['111111', '000000', '123456', '654321', '567890', '121212'])(
      'rejects the weak PIN %s and stays on the create step',
      pin => {
        const view = renderWithTheme(<SetPinScreen />);
        enterPin(view, pin);

        expect(view.getByTestId('set-pin-error').props.children).toBe(
          WEAK_PIN_MESSAGE,
        );
        expect(view.getByText('PIN 설정')).toBeTruthy();
        expect(view.queryByText('PIN 확인')).toBeNull();
        expect(mockStoreMnemonic).not.toHaveBeenCalled();
      },
    );
  });

  describe('PIN 입력 - 2단계 (확인)', () => {
    it('should complete wallet creation on matching PIN', async () => {
      const view = renderWithTheme(<SetPinScreen />);

      enterPin(view, STRONG_PIN);
      expect(view.getByText('PIN 확인')).toBeTruthy();
      enterPin(view, STRONG_PIN);

      await waitFor(() => {
        expect(mockStoreMnemonic).toHaveBeenCalledWith(
          expect.stringContaining('abandon'),
          STRONG_PIN,
        );
      });

      await waitFor(() => {
        expect(mockAddWallet).toHaveBeenCalled();
        expect(mockUnlock).toHaveBeenCalled();
        expect(mockSetHasWallet).toHaveBeenCalledWith(true);
        expect(mockClear).toHaveBeenCalledWith('completed');
        expect(mockDispatch).toHaveBeenCalled();
      });
    });

    it('shows a mismatch error and returns to the create step', async () => {
      const view = renderWithTheme(<SetPinScreen />);

      enterPin(view, STRONG_PIN);
      enterPin(view, '246802');

      expect(view.getByTestId('set-pin-error').props.children).toBe(
        PIN_MISMATCH_MESSAGE,
      );
      expect(view.getByText('PIN 설정')).toBeTruthy();
      expect(mockStoreMnemonic).not.toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('back on the confirm step returns to the create step without leaving', () => {
      const view = renderWithTheme(<SetPinScreen />);
      enterPin(view, STRONG_PIN);
      expect(view.getByText('PIN 확인')).toBeTruthy();

      fireEvent.press(view.getByLabelText('뒤로 가기'));

      expect(view.getByText('PIN 설정')).toBeTruthy();
      expect(mockGoBack).not.toHaveBeenCalled();
    });

    it('hardware back on the confirm step is intercepted and returns to the create step', () => {
      const view = renderWithTheme(<SetPinScreen />);
      enterPin(view, STRONG_PIN);

      const preventDefault = jest.fn();
      act(() => {
        mockBeforeRemove.forEach(listener => listener({ preventDefault }));
      });

      expect(preventDefault).toHaveBeenCalled();
      expect(view.getByText('PIN 설정')).toBeTruthy();
    });

    it('allows leaving from the create step', () => {
      renderWithTheme(<SetPinScreen />);
      const preventDefault = jest.fn();
      mockBeforeRemove.forEach(listener => listener({ preventDefault }));
      expect(preventDefault).not.toHaveBeenCalled();
      // 생성 흐름의 이전 화면(구문 확인)은 복구 구문을 다시 사용한다.
      expect(mockDiscard).not.toHaveBeenCalled();
      expect(mockClear).not.toHaveBeenCalled();
    });

    it('quietly discards the imported phrase when leaving the import flow from the create step', () => {
      mockSnapshot.mockReturnValue({
        sessionId: 1,
        mnemonic: mockMnemonic,
        walletAddress: '0x1234567890123456789012345678901234567890',
        source: 'import',
      });
      const view = renderWithTheme(<SetPinScreen />);

      fireEvent.press(view.getByTestId('set-pin-back'));
      expect(mockGoBack).toHaveBeenCalledTimes(1);

      // goBack이 일으키는 beforeRemove (Android 하드웨어 뒤로 가기도 같은 경로)
      const preventDefault = jest.fn();
      mockBeforeRemove.forEach(listener => listener({ preventDefault }));

      expect(preventDefault).not.toHaveBeenCalled();
      expect(mockDiscard).toHaveBeenCalledTimes(1);
      // clear()는 AuthNavigator를 시작 화면으로 다시 그리므로 쓰지 않는다.
      expect(mockClear).not.toHaveBeenCalled();
    });

    it('keeps the imported phrase when back on the confirm step only returns to the create step', () => {
      mockSnapshot.mockReturnValue({
        sessionId: 1,
        mnemonic: mockMnemonic,
        walletAddress: '0x1234567890123456789012345678901234567890',
        source: 'import',
      });
      const view = renderWithTheme(<SetPinScreen />);
      enterPin(view, STRONG_PIN);

      const preventDefault = jest.fn();
      act(() => {
        mockBeforeRemove.forEach(listener => listener({ preventDefault }));
      });

      expect(preventDefault).toHaveBeenCalled();
      expect(mockDiscard).not.toHaveBeenCalled();
    });

    it('uses import copy while importing a wallet', async () => {
      mockSnapshot.mockReturnValue({
        sessionId: 1,
        mnemonic: mockMnemonic,
        walletAddress: '0x1234567890123456789012345678901234567890',
        source: 'import',
      });
      let finishStore!: () => void;
      mockStoreMnemonic.mockReturnValue(
        new Promise<void>(resolve => {
          finishStore = resolve;
        }),
      );
      const view = renderWithTheme(<SetPinScreen />);
      enterPin(view, STRONG_PIN);
      enterPin(view, STRONG_PIN);

      expect(view.getByText('지갑 가져오는 중…')).toBeTruthy();
      expect(view.queryByText('지갑 생성 중…')).toBeNull();
      await act(async () => finishStore());
    });

    it('uses create copy while creating a wallet', async () => {
      let finishStore!: () => void;
      mockStoreMnemonic.mockReturnValue(
        new Promise<void>(resolve => {
          finishStore = resolve;
        }),
      );
      const view = renderWithTheme(<SetPinScreen />);
      enterPin(view, STRONG_PIN);
      enterPin(view, STRONG_PIN);

      expect(view.getByText('지갑 생성 중…')).toBeTruthy();
      await act(async () => finishStore());
    });
  });

  describe('생체인증 등록 제안', () => {
    const lastAlertButtons = (): AlertButton[] =>
      ((Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] ??
        []) as AlertButton[];

    it('offers optional biometric enrollment after the wallet is saved', async () => {
      mockIsBiometricSupported.mockResolvedValue(true);
      const view = renderWithTheme(<SetPinScreen />);
      enterPin(view, STRONG_PIN);
      enterPin(view, STRONG_PIN);

      await waitFor(() =>
        expect(Alert.alert).toHaveBeenCalledWith(
          '생체인증 사용',
          expect.any(String),
          expect.any(Array),
          expect.anything(),
        ),
      );
      expect(mockSetHasWallet).toHaveBeenCalledWith(true);

      const enable = lastAlertButtons().find(b => b.text === '사용하기');
      await act(async () => {
        await enable?.onPress?.();
      });
      expect(mockEnableBiometric).toHaveBeenCalledWith(mockMnemonic);
    });

    it('can be skipped', async () => {
      mockIsBiometricSupported.mockResolvedValue(true);
      const view = renderWithTheme(<SetPinScreen />);
      enterPin(view, STRONG_PIN);
      enterPin(view, STRONG_PIN);

      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      const skip = lastAlertButtons().find(b => b.text === '나중에');
      expect(skip?.style).toBe('cancel');
      expect(mockEnableBiometric).not.toHaveBeenCalled();
    });

    it('is not offered when biometrics are unsupported', async () => {
      const view = renderWithTheme(<SetPinScreen />);
      enterPin(view, STRONG_PIN);
      enterPin(view, STRONG_PIN);

      await waitFor(() => expect(mockSetHasWallet).toHaveBeenCalled());
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('does not enroll if the wallet was locked before the user accepted', async () => {
      mockIsBiometricSupported.mockResolvedValue(true);
      const view = renderWithTheme(<SetPinScreen />);
      enterPin(view, STRONG_PIN);
      enterPin(view, STRONG_PIN);
      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

      mockIsUnlocked.mockReturnValue(false);
      const enable = lastAlertButtons().find(b => b.text === '사용하기');
      await act(async () => {
        await enable?.onPress?.();
      });
      expect(mockEnableBiometric).not.toHaveBeenCalled();
    });
  });

  describe('뒤로 가기', () => {
    it('should call goBack when back button pressed on the create step', () => {
      const { getByText } = renderWithTheme(<SetPinScreen />);

      fireEvent.press(getByText('←'));

      expect(mockGoBack).toHaveBeenCalled();
    });
  });

  describe('에러 처리', () => {
    it('should show error alert on wallet creation failure', async () => {
      mockStoreMnemonic.mockRejectedValue(new Error('Storage failed'));
      const view = renderWithTheme(<SetPinScreen />);
      enterPin(view, STRONG_PIN);
      enterPin(view, STRONG_PIN);

      await waitFor(() =>
        expect(Alert.alert).toHaveBeenCalledWith(
          '오류',
          '지갑 생성에 실패했습니다. 다시 시도해주세요.',
        ),
      );
      expect(mockSetHasWallet).not.toHaveBeenCalled();
      expect(view.getByText('PIN 설정')).toBeTruthy();
    });

    it('clears stored data and stays quiet when the session ended in the background', async () => {
      mockIsActive.mockReturnValue(false);
      const view = renderWithTheme(<SetPinScreen />);
      enterPin(view, STRONG_PIN);
      enterPin(view, STRONG_PIN);

      await waitFor(() => expect(mockClearAll).toHaveBeenCalled());
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(mockSetHasWallet).not.toHaveBeenCalled();
    });
  });

  describe('보안 검증', () => {
    it('should not allow more than 6 digits in create step', () => {
      const view = renderWithTheme(<SetPinScreen />);

      enterPin(view, '13579');
      expect(view.getByTestId('set-pin-dots').props.accessibilityLabel).toBe(
        '새 PIN 6자리 중 5자리 입력됨',
      );
      fireEvent.press(view.getByTestId('set-pin-key-delete'));
      expect(view.getByTestId('set-pin-dots').props.accessibilityLabel).toBe(
        '새 PIN 6자리 중 4자리 입력됨',
      );
    });
  });
});
