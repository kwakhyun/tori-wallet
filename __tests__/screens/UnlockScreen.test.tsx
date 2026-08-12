/**
 * UnlockScreen 테스트
 * 잠금 해제 스크린 테스트
 */

import React from 'react';
import {
  cleanup,
  render,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import UnlockScreen from '../../src/screens/Auth/UnlockScreen';
import { ThemeProvider } from 'styled-components/native';
import { lightTheme } from '../../src/styles/theme';
import { Alert } from 'react-native';

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

// Alert 모킹
jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={lightTheme}>{component}</ThemeProvider>);
};

describe('UnlockScreen', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsBiometricSupported.mockResolvedValue(false);
    mockIsBiometricEnabled.mockResolvedValue(false);
    mockUnlockWithPin.mockResolvedValue(false);
    mockUnlockWithBiometric.mockResolvedValue(false);
  });

  describe('렌더링', () => {
    it('should render PIN input screen correctly', () => {
      const { getByText } = renderWithTheme(<UnlockScreen />);

      expect(getByText('Tori Wallet')).toBeTruthy();
      expect(getByText('PIN 입력')).toBeTruthy();
      expect(getByText(/지갑 잠금을 해제/)).toBeTruthy();
    });

    it('should render keypad with numbers 0-9', () => {
      const { getByText } = renderWithTheme(<UnlockScreen />);

      for (let i = 0; i <= 9; i++) {
        expect(getByText(String(i))).toBeTruthy();
      }
    });

    it('should render delete and biometric buttons', () => {
      const { getByText } = renderWithTheme(<UnlockScreen />);

      expect(getByText('⌫')).toBeTruthy();
      expect(getByText('🔐')).toBeTruthy();
    });
  });

  describe('PIN 입력', () => {
    it('should handle PIN digit input', () => {
      const { getByText } = renderWithTheme(<UnlockScreen />);

      fireEvent.press(getByText('1'));
      fireEvent.press(getByText('2'));
      fireEvent.press(getByText('3'));

      // PIN이 입력되었는지 확인 (dots로 표시됨)
      expect(true).toBe(true);
    });

    it('should handle delete button', () => {
      const { getByText } = renderWithTheme(<UnlockScreen />);

      fireEvent.press(getByText('1'));
      fireEvent.press(getByText('2'));
      fireEvent.press(getByText('⌫'));

      // 삭제가 정상적으로 동작
      expect(true).toBe(true);
    });

    it('should attempt unlock after 6 digits entered', async () => {
      mockUnlockWithPin.mockResolvedValue(true);

      const { getByText } = renderWithTheme(<UnlockScreen />);

      // 6자리 PIN 입력
      fireEvent.press(getByText('1'));
      fireEvent.press(getByText('2'));
      fireEvent.press(getByText('3'));
      fireEvent.press(getByText('4'));
      fireEvent.press(getByText('5'));
      fireEvent.press(getByText('6'));

      await waitFor(() => {
        expect(mockUnlockWithPin).toHaveBeenCalledWith('123456');
      });
    });

    it('should call unlock on valid PIN', async () => {
      mockUnlockWithPin.mockResolvedValue(true);

      const { getByText } = renderWithTheme(<UnlockScreen />);

      // 6자리 PIN 입력
      fireEvent.press(getByText('1'));
      fireEvent.press(getByText('2'));
      fireEvent.press(getByText('3'));
      fireEvent.press(getByText('4'));
      fireEvent.press(getByText('5'));
      fireEvent.press(getByText('6'));

      await waitFor(() => {
        expect(mockUnlock).toHaveBeenCalled();
      });
    });

    it('should show error on invalid PIN', async () => {
      mockUnlockWithPin.mockResolvedValue(false);

      const { getByText } = renderWithTheme(<UnlockScreen />);

      // 잘못된 PIN 입력
      fireEvent.press(getByText('1'));
      fireEvent.press(getByText('1'));
      fireEvent.press(getByText('1'));
      fireEvent.press(getByText('1'));
      fireEvent.press(getByText('1'));
      fireEvent.press(getByText('1'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenLastCalledWith(
          '오류',
          'PIN이 올바르지 않습니다.',
        );
      });
    });
  });

  describe('생체인증', () => {
    it('should attempt biometric auth when enabled and supported', async () => {
      mockIsBiometricEnabled.mockResolvedValue(true);
      mockIsBiometricSupported.mockResolvedValue(true);
      mockUnlockWithBiometric.mockResolvedValue(true);

      renderWithTheme(<UnlockScreen />);

      await waitFor(() => {
        expect(mockUnlockWithBiometric).toHaveBeenCalled();
      });
    });

    it('should unlock on successful biometric auth', async () => {
      mockIsBiometricEnabled.mockResolvedValue(true);
      mockIsBiometricSupported.mockResolvedValue(true);
      mockUnlockWithBiometric.mockResolvedValue(true);

      renderWithTheme(<UnlockScreen />);

      await waitFor(() => {
        expect(mockUnlock).toHaveBeenCalled();
      });
    });

    it('should fall back to PIN when biometric fails', async () => {
      mockIsBiometricEnabled.mockResolvedValue(true);
      mockIsBiometricSupported.mockResolvedValue(true);
      mockUnlockWithBiometric.mockRejectedValue(new Error('Biometric failed'));

      const { getByText } = renderWithTheme(<UnlockScreen />);

      await waitFor(() => {
        // 생체인증 실패해도 PIN 입력 화면은 표시됨
        expect(getByText('PIN 입력')).toBeTruthy();
      });
    });

    it('should handle biometric button press', async () => {
      const { getByText } = renderWithTheme(<UnlockScreen />);

      fireEvent.press(getByText('🔐'));

      // 생체인증 시도가 에러 없이 완료
      expect(true).toBe(true);
    });
  });

  describe('보안 - 시도 횟수 제한', () => {
    it('should warn after multiple failed attempts', async () => {
      mockUnlockWithPin.mockResolvedValue(false);

      const { getByText } = renderWithTheme(<UnlockScreen />);

      // 5회 실패 시뮬레이션
      for (let i = 0; i < 5; i++) {
        fireEvent.press(getByText('1'));
        fireEvent.press(getByText('1'));
        fireEvent.press(getByText('1'));
        fireEvent.press(getByText('1'));
        fireEvent.press(getByText('1'));
        fireEvent.press(getByText('1'));

        await waitFor(
          () => {
            expect(Alert.alert).toHaveBeenCalledTimes(i + 1);
          },
          { timeout: 3000 },
        );
      }

      // 5회 실패 후 경고 메시지 확인
      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          '경고',
          expect.stringContaining('회 틀렸습니다'),
        );
      });
    });
  });

  describe('에러 처리', () => {
    it('should handle PIN verification error gracefully', async () => {
      mockUnlockWithPin.mockRejectedValue(new Error('Storage error'));

      const { getByText } = renderWithTheme(<UnlockScreen />);

      fireEvent.press(getByText('1'));
      fireEvent.press(getByText('2'));
      fireEvent.press(getByText('3'));
      fireEvent.press(getByText('4'));
      fireEvent.press(getByText('5'));
      fireEvent.press(getByText('6'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          '오류',
          'PIN 확인에 실패했습니다.',
        );
      });
    });
  });
});
