/**
 * 생체 인증 지원 여부/활성화 상태와 토글 동작
 *
 * 활성화는 PIN 확인으로 얻은 니모닉을 생체인증 보호 Keychain에 저장하는 일이라
 * 호출 측이 PIN 확인을 먼저 거쳐야 한다(enable에 니모닉을 넘긴다).
 * 비활성화는 보안을 약하게 하지 않으므로 PIN 없이 가능하다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { walletService } from '@/services/walletService';
import { createLogger } from '@/utils/logger';

const logger = createLogger('BiometricSetting');

export function useBiometricSetting() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [isSupported, isEnabled] = await Promise.all([
        walletService.isBiometricSupported(),
        walletService.isBiometricEnabled(),
      ]);
      if (!mounted.current) return;
      setSupported(isSupported);
      setEnabled(isEnabled);
    } catch (error) {
      logger.warn('Failed to read biometric state', error);
    } finally {
      if (mounted.current) setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const enable = useCallback(async (mnemonic: string) => {
    setIsUpdating(true);
    try {
      await walletService.enableBiometric(mnemonic);
      if (mounted.current) setEnabled(true);
    } finally {
      if (mounted.current) setIsUpdating(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setIsUpdating(true);
    try {
      await walletService.disableBiometric();
      if (mounted.current) setEnabled(false);
    } finally {
      if (mounted.current) setIsUpdating(false);
    }
  }, []);

  return { supported, enabled, isLoaded, isUpdating, enable, disable, refresh };
}

export default useBiometricSetting;
