import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { signerVault } from '@/services/signerVault';
import { walletService } from '@/services/walletService';
import {
  formatLockoutRemaining,
  pinAttemptService,
  remainingAttemptsBeforeLockout,
} from '@/services/pinAttemptService';

/** 화면 종료, 취소, 백그라운드 전환 이후 도착한 인증 결과는 폐기한다. */
export function useAuthentication() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const busy = useRef(false);
  const cancel = useCallback(() => {
    generation.current += 1;
    busy.current = false;
    if (mounted.current) setIsAuthenticating(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      // iOS 생체인증 프롬프트의 inactive 전환은 인증 취소가 아니다.
      if (state === 'background') cancel();
    });
    return () => {
      mounted.current = false;
      generation.current += 1;
      busy.current = false;
      subscription.remove();
    };
  }, [cancel]);

  const authenticate = useCallback(
    async (pin?: string): Promise<boolean | null> => {
      if (
        busy.current ||
        !mounted.current ||
        AppState.currentState === 'background'
      )
        return null;
      busy.current = true;
      const attempt = ++generation.current;
      const isActive = () =>
        mounted.current &&
        attempt === generation.current &&
        AppState.currentState !== 'background';
      setIsAuthenticating(true);
      try {
        const result =
          pin === undefined
            ? await signerVault.unlockWithBiometric(isActive)
            : await signerVault.unlockWithPin(pin, isActive);
        return isActive() ? result : null;
      } catch (error) {
        if (!isActive()) return null;
        throw error;
      } finally {
        if (isActive()) {
          busy.current = false;
          setIsAuthenticating(false);
        }
      }
    },
    [],
  );

  return { authenticate, cancel, isAuthenticating };
}

/** 생체인증 잠금 해제가 설정되어 있고 기기에서 사용할 수 있는지. 오류 시 false */
export async function isBiometricUnlockAvailable(): Promise<boolean> {
  try {
    return (
      (await walletService.isBiometricEnabled()) &&
      (await walletService.isBiometricSupported())
    );
  } catch {
    return false;
  }
}

interface LockoutState {
  failures: number;
  lockedUntil: number;
}

/**
 * 영구 PIN 실패 제한 상태를 화면에 표시하기 위한 훅.
 * 제한 중에는 1초마다 남은 시간을 갱신하고, 시간이 지나면 자동으로 풀린다.
 * 실제 제한은 pinAttemptService가 강제하며 이 훅은 표시만 담당한다.
 */
export function usePinLockout(enabled = true) {
  const [state, setState] = useState<LockoutState>({
    failures: 0,
    lockedUntil: 0,
  });
  const [now, setNow] = useState(() => Date.now());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const status = await pinAttemptService.getStatus();
      if (!mounted.current) return;
      setNow(Date.now());
      // PinLockedError로 받은 해제 시각이 저장소 조회보다 늦게 반영될 수 있으므로
      // 더 늦은 시각을 유지한다.
      setState(previous => ({
        failures: status.failures,
        lockedUntil: Math.max(status.blockedUntil, previous.lockedUntil),
      }));
    } catch {
      // 상태를 읽지 못해도 검증 경로가 제한을 강제한다.
    }
  }, []);

  /** PinLockedError를 받았을 때 즉시 카운트다운을 시작한다. */
  const lockUntil = useCallback((retryAt: number) => {
    setNow(Date.now());
    setState(previous => ({ ...previous, lockedUntil: retryAt }));
  }, []);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  const isLocked = state.lockedUntil > now;

  useEffect(() => {
    if (!isLocked) return;
    const tick = () => setNow(Date.now());
    const interval = setInterval(tick, 1000);
    // 백그라운드에서는 타이머가 멈추므로 복귀 시 즉시 갱신한다.
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') tick();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [isLocked]);

  const remainingMs = isLocked ? state.lockedUntil - now : 0;

  return {
    isLocked,
    remainingMs,
    /** mm:ss */
    countdown: formatLockoutRemaining(remainingMs),
    failures: state.failures,
    remainingAttempts: remainingAttemptsBeforeLockout(state.failures),
    refresh,
    lockUntil,
  };
}
