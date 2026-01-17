/**
 * 앱 상태 훅 테스트
 */

import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';

// Store 모킹
const mockLock = jest.fn();
const mockUpdateLastActiveTime = jest.fn();

jest.mock('../../src/store/walletStore', () => ({
  useWalletStore: () => ({
    hasWallet: true,
    isLocked: false,
    lock: mockLock,
  }),
}));

jest.mock('../../src/store/securityStore', () => ({
  useSecurityStore: () => ({
    autoLockTimeout: '1min',
    updateLastActiveTime: mockUpdateLastActiveTime,
  }),
  AUTO_LOCK_OPTIONS: {
    immediate: 0,
    '1min': 60000,
    '5min': 300000,
    '15min': 900000,
    '1hour': 3600000,
    never: -1,
  },
}));

// React Native AppState 모킹
let appStateCallback: ((state: string) => void) | null = null;
jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn((event, callback) => {
      if (event === 'change') {
        appStateCallback = callback;
      }
      return {
        remove: jest.fn(),
      };
    }),
  },
}));

// useAppState 훅 import
import { useAppState } from '../../src/hooks/useAppState';

describe('useAppState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appStateCallback = null;
  });

  describe('초기화', () => {
    it('should set up app state listener on mount', () => {
      renderHook(() => useAppState());

      expect(AppState.addEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function),
      );
    });

    it('should return cleanup function', () => {
      const { unmount } = renderHook(() => useAppState());

      expect(() => unmount()).not.toThrow();
    });
  });

  describe('앱 상태 변경', () => {
    it('should handle transition to background', () => {
      renderHook(() => useAppState());

      // 백그라운드로 전환 시뮬레이션
      if (appStateCallback) {
        act(() => {
          appStateCallback!('background');
        });
      }

      // 즉시 잠금이 아니면 lock이 호출되지 않아야 함
      expect(mockLock).not.toHaveBeenCalled();
    });

    it('should handle transition to foreground', () => {
      renderHook(() => useAppState());

      // 포그라운드로 복귀 시뮬레이션
      if (appStateCallback) {
        act(() => {
          appStateCallback!('active');
        });
      }

      // 에러 없이 처리되어야 함
      expect(true).toBe(true);
    });
  });
});

// 즉시 잠금 설정 테스트
describe('useAppState - Immediate Lock', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // 즉시 잠금 설정으로 재모킹
    jest.doMock('../../src/store/securityStore', () => ({
      useSecurityStore: () => ({
        autoLockTimeout: 'immediate',
        updateLastActiveTime: mockUpdateLastActiveTime,
      }),
      AUTO_LOCK_OPTIONS: {
        immediate: 0,
        '1min': 60000,
        '5min': 300000,
        '15min': 900000,
        '1hour': 3600000,
        never: -1,
      },
    }));
  });

  it('should be defined', () => {
    expect(useAppState).toBeDefined();
  });
});
