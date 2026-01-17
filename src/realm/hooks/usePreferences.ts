/**
 * 사용자 설정 관리 훅
 */

import { useState, useEffect, useCallback } from 'react';
import {
  userPreferencesService,
  PREFERENCE_KEYS,
  type PreferenceKey,
} from '../services';

/**
 * 단일 설정값 훅
 */
export function usePreference<T>(key: PreferenceKey, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadPreference = async () => {
      try {
        setIsLoading(true);
        const result = await userPreferencesService.getOrDefault<T>(
          key,
          defaultValue,
        );
        setValue(result);
      } catch {
        setValue(defaultValue);
      } finally {
        setIsLoading(false);
      }
    };

    loadPreference();
  }, [key, defaultValue]);

  const updateValue = useCallback(
    async (newValue: T) => {
      await userPreferencesService.set(key, newValue);
      setValue(newValue);
    },
    [key],
  );

  return { value, isLoading, updateValue };
}

/**
 * 화폐 단위 훅
 */
export function useCurrency() {
  const { value, isLoading, updateValue } = usePreference(
    PREFERENCE_KEYS.CURRENCY,
    'USD',
  );
  return { currency: value, isLoading, setCurrency: updateValue };
}

/**
 * 테마 훅
 */
export function useThemePreference() {
  const { value, isLoading, updateValue } = usePreference<
    'dark' | 'light' | 'system'
  >(PREFERENCE_KEYS.THEME, 'dark');
  return { theme: value, isLoading, setTheme: updateValue };
}

/**
 * 생체인증 설정 훅
 */
export function useBiometricPreference() {
  const { value, isLoading, updateValue } = usePreference(
    PREFERENCE_KEYS.BIOMETRIC_ENABLED,
    false,
  );
  return { isEnabled: value, isLoading, setEnabled: updateValue };
}

/**
 * 잔액 숨김 설정 훅
 */
export function useHideBalance() {
  const { value, isLoading, updateValue } = usePreference(
    PREFERENCE_KEYS.HIDE_BALANCE,
    false,
  );

  const toggle = useCallback(async () => {
    await updateValue(!value);
  }, [value, updateValue]);

  return { isHidden: value, isLoading, setHidden: updateValue, toggle };
}

/**
 * 기본 체인 설정 훅
 */
export function useDefaultChain() {
  const { value, isLoading, updateValue } = usePreference(
    PREFERENCE_KEYS.DEFAULT_CHAIN_ID,
    1,
  );
  return { chainId: value, isLoading, setChainId: updateValue };
}

/**
 * 테스트넷 표시 설정 훅
 */
export function useTestnetPreference() {
  const { value, isLoading, updateValue } = usePreference(
    PREFERENCE_KEYS.DEV_SHOW_TESTNET,
    false,
  );
  return { showTestnet: value, isLoading, setShowTestnet: updateValue };
}

/**
 * 가스 설정 훅
 */
export function useGasPreference() {
  const { value, isLoading, updateValue } = usePreference<
    'low' | 'medium' | 'high'
  >(PREFERENCE_KEYS.GAS_PREFERENCE, 'medium');
  return { gasPreference: value, isLoading, setGasPreference: updateValue };
}

/**
 * 알림 설정 훅
 */
export function useNotificationPreferences() {
  const [settings, setSettings] = useState({
    enabled: true,
    transactions: true,
    priceAlerts: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        const [enabled, transactions, priceAlerts] = await Promise.all([
          userPreferencesService.getOrDefault(
            PREFERENCE_KEYS.NOTIFICATIONS_ENABLED,
            true,
          ),
          userPreferencesService.getOrDefault(
            PREFERENCE_KEYS.NOTIFICATION_TRANSACTIONS,
            true,
          ),
          userPreferencesService.getOrDefault(
            PREFERENCE_KEYS.NOTIFICATION_PRICE_ALERTS,
            false,
          ),
        ]);
        setSettings({ enabled, transactions, priceAlerts });
      } catch {
        // 기본값 유지
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const updateSetting = useCallback(
    async (key: 'enabled' | 'transactions' | 'priceAlerts', value: boolean) => {
      const prefKey =
        key === 'enabled'
          ? PREFERENCE_KEYS.NOTIFICATIONS_ENABLED
          : key === 'transactions'
          ? PREFERENCE_KEYS.NOTIFICATION_TRANSACTIONS
          : PREFERENCE_KEYS.NOTIFICATION_PRICE_ALERTS;

      await userPreferencesService.set(prefKey, value);
      setSettings(prev => ({ ...prev, [key]: value }));
    },
    [],
  );

  return { settings, isLoading, updateSetting };
}

/**
 * 자동 잠금 시간 설정 훅
 */
export function useAutoLockTimeout() {
  const { value, isLoading, updateValue } = usePreference(
    PREFERENCE_KEYS.AUTO_LOCK_TIMEOUT,
    300000, // 5분
  );

  // 프리셋 옵션
  const options = [
    { label: '1분', value: 60000 },
    { label: '5분', value: 300000 },
    { label: '15분', value: 900000 },
    { label: '30분', value: 1800000 },
    { label: '1시간', value: 3600000 },
    { label: '사용 안 함', value: 0 },
  ];

  return { timeout: value, isLoading, setTimeout: updateValue, options };
}

/**
 * 모든 설정 초기화 훅
 */
export function useResetPreferences() {
  const [isResetting, setIsResetting] = useState(false);

  const reset = useCallback(async () => {
    setIsResetting(true);
    try {
      await userPreferencesService.resetToDefaults();
    } finally {
      setIsResetting(false);
    }
  }, []);

  return { reset, isResetting };
}

// 설정 키 내보내기
export { PREFERENCE_KEYS };
