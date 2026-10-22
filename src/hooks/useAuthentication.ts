import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { signerVault } from '@/services/signerVault';

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
