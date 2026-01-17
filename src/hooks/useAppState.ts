/**
 * 앱 생명주기 관리 및 자동 잠금 훅
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useWalletStore } from '@/store/walletStore';
import { useSecurityStore, AUTO_LOCK_OPTIONS } from '@/store/securityStore';
import { createLogger } from '@/utils/logger';

const logger = createLogger('AppState');

export function useAppState() {
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const backgroundTime = useRef<number | null>(null);

  const { hasWallet, isLocked, lock } = useWalletStore();
  const { autoLockTimeout, updateLastActiveTime } = useSecurityStore();

  const handleAppStateChange = useCallback(
    (nextAppState: AppStateStatus) => {
      const previousState = appState.current;

      // 백그라운드로 전환
      if (
        previousState === 'active' &&
        (nextAppState === 'background' || nextAppState === 'inactive')
      ) {
        backgroundTime.current = Date.now();
        logger.info('App went to background');

        // 즉시 잠금 설정인 경우
        if (hasWallet && !isLocked && autoLockTimeout === 'immediate') {
          lock();
          logger.info('Auto-locked immediately on background');
        }
      }

      // 포그라운드로 복귀
      if (
        nextAppState === 'active' &&
        (previousState === 'background' || previousState === 'inactive')
      ) {
        logger.info('App came to foreground');

        if (hasWallet && !isLocked && backgroundTime.current) {
          const timeInBackground = Date.now() - backgroundTime.current;
          const timeoutMs = AUTO_LOCK_OPTIONS[autoLockTimeout];

          // never가 아니고, 타임아웃 시간이 지났으면 잠금
          if (
            autoLockTimeout !== 'never' &&
            timeoutMs > 0 &&
            timeInBackground > timeoutMs
          ) {
            lock();
            logger.info(
              `Auto-locked after ${timeInBackground}ms in background`,
            );
          }
        }

        // 마지막 활동 시간 업데이트
        updateLastActiveTime();
        backgroundTime.current = null;
      }

      appState.current = nextAppState;
    },
    [hasWallet, isLocked, lock, autoLockTimeout, updateLastActiveTime],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, [handleAppStateChange]);

  // 사용자 활동 시 호출할 함수
  const trackUserActivity = useCallback(() => {
    updateLastActiveTime();
  }, [updateLastActiveTime]);

  return {
    currentAppState: appState.current,
    trackUserActivity,
  };
}

export default useAppState;
