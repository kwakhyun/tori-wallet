/**
 * 앱 생명주기 관리 및 자동 잠금 훅
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { useWalletStore } from '@/store/walletStore';
import { useSecurityStore, AUTO_LOCK_OPTIONS } from '@/store/securityStore';
import { createLogger } from '@/utils/logger';
import { onboardingVault } from '@/services/onboardingVault';

const logger = createLogger('AppState');

export function useAppState() {
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const backgroundTime = useRef<number | null>(null);

  const { hasWallet, isLocked, lock } = useWalletStore(
    useShallow(state => ({
      hasWallet: state.hasWallet,
      isLocked: state.isLocked,
      lock: state.lock,
    })),
  );
  const { autoLockTimeout, updateLastActiveTime, shouldAutoLock } =
    useSecurityStore(
      useShallow(state => ({
        autoLockTimeout: state.autoLockTimeout,
        updateLastActiveTime: state.updateLastActiveTime,
        shouldAutoLock: state.shouldAutoLock,
      })),
    );

  const handleAppStateChange = useCallback(
    (nextAppState: AppStateStatus) => {
      const previousState = appState.current;

      // 포그라운드를 벗어남 (inactive 포함): 시간 기반 자동 잠금 계산 시작
      if (previousState === 'active' && nextAppState !== 'active') {
        backgroundTime.current = Date.now();
      }

      // 실제 백그라운드 전환에서만 민감 정보를 폐기하고 즉시 잠근다.
      // 'inactive'는 제어 센터, 알림 센터, 전화 수신, Face ID 프롬프트처럼
      // 앱이 여전히 화면에 보이는 상태다. 여기서 지우면 사용자가 받아 적던
      // 복구 구문이 사라지거나 생체인증 승인 중에 지갑이 잠긴다.
      // 앱 전환기 스냅샷은 iOS SceneDelegate의 privacy view(sceneWillResignActive)와
      // Android FLAG_SECURE가 가린다.
      if (nextAppState === 'background' && previousState !== 'background') {
        if (!backgroundTime.current) backgroundTime.current = Date.now();
        onboardingVault.clear('background');
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

          if (timeoutMs > 0 && timeInBackground > timeoutMs) {
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

  useEffect(() => {
    if (!hasWallet || isLocked || autoLockTimeout === 'immediate') return;

    const interval = setInterval(() => {
      if (AppState.currentState === 'active' && shouldAutoLock()) {
        lock();
        logger.info('Auto-locked after foreground inactivity');
      }
    }, 5_000);

    return () => clearInterval(interval);
  }, [autoLockTimeout, hasWallet, isLocked, lock, shouldAutoLock]);

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
