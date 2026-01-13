/**
 * Tori Wallet - User Preferences Service (Realm)
 * 사용자 설정 관리 (JSON 기반 key-value 저장)
 */

import { realmDB } from '../database';
import type { UserPreferencesEntry } from '../schemas';
import { createLogger } from '@/utils/logger';

const logger = createLogger('Preferences');

// 알려진 설정 키 (타입 안전성을 위해)
export const PREFERENCE_KEYS = {
  // 화면 표시 설정
  CURRENCY: 'display.currency',
  LANGUAGE: 'display.language',
  THEME: 'display.theme',
  HIDE_BALANCE: 'display.hideBalance',

  // 보안 설정
  BIOMETRIC_ENABLED: 'security.biometricEnabled',
  AUTO_LOCK_TIMEOUT: 'security.autoLockTimeout',
  TRANSACTION_SIGNING_CONFIRM: 'security.txSigningConfirm',

  // 네트워크 설정
  DEFAULT_CHAIN_ID: 'network.defaultChainId',
  CUSTOM_RPCS: 'network.customRpcs',
  GAS_PREFERENCE: 'network.gasPreference',

  // 알림 설정
  NOTIFICATIONS_ENABLED: 'notifications.enabled',
  NOTIFICATION_TRANSACTIONS: 'notifications.transactions',
  NOTIFICATION_PRICE_ALERTS: 'notifications.priceAlerts',

  // WalletConnect 설정
  WC_AUTO_APPROVE_DAPPS: 'wc.autoApproveDapps',
  WC_TRUSTED_DAPPS: 'wc.trustedDapps',

  // 개발자 설정
  DEV_MODE: 'dev.enabled',
  DEV_SHOW_TESTNET: 'dev.showTestnet',
} as const;

export type PreferenceKey =
  (typeof PREFERENCE_KEYS)[keyof typeof PREFERENCE_KEYS];

// 기본값 정의
const DEFAULT_VALUES: Partial<Record<PreferenceKey, unknown>> = {
  [PREFERENCE_KEYS.CURRENCY]: 'USD',
  [PREFERENCE_KEYS.LANGUAGE]: 'ko',
  [PREFERENCE_KEYS.THEME]: 'dark',
  [PREFERENCE_KEYS.HIDE_BALANCE]: false,
  [PREFERENCE_KEYS.BIOMETRIC_ENABLED]: false,
  [PREFERENCE_KEYS.AUTO_LOCK_TIMEOUT]: 300000, // 5분
  [PREFERENCE_KEYS.TRANSACTION_SIGNING_CONFIRM]: true,
  [PREFERENCE_KEYS.DEFAULT_CHAIN_ID]: 1,
  [PREFERENCE_KEYS.GAS_PREFERENCE]: 'medium',
  [PREFERENCE_KEYS.NOTIFICATIONS_ENABLED]: true,
  [PREFERENCE_KEYS.NOTIFICATION_TRANSACTIONS]: true,
  [PREFERENCE_KEYS.NOTIFICATION_PRICE_ALERTS]: false,
  [PREFERENCE_KEYS.DEV_MODE]: false,
  [PREFERENCE_KEYS.DEV_SHOW_TESTNET]: false,
};

class UserPreferencesService {
  private static instance: UserPreferencesService;
  private cache: Map<string, unknown> = new Map();

  private constructor() {}

  static getInstance(): UserPreferencesService {
    if (!UserPreferencesService.instance) {
      UserPreferencesService.instance = new UserPreferencesService();
    }
    return UserPreferencesService.instance;
  }

  /**
   * 모든 설정 로드 (앱 시작시)
   */
  async loadAll(): Promise<void> {
    const realm = await realmDB.getRealm();
    const allPrefs = realm.objects<UserPreferencesEntry>('UserPreferences');

    this.cache.clear();

    for (const pref of allPrefs) {
      try {
        this.cache.set(pref.key, JSON.parse(pref.value));
      } catch {
        this.cache.set(pref.key, pref.value);
      }
    }

    logger.info(`Loaded ${allPrefs.length} preferences`);
  }

  /**
   * 설정값 가져오기
   */
  async get<T>(key: PreferenceKey): Promise<T> {
    // 캐시에서 먼저 확인
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }

    const realm = await realmDB.getRealm();
    const entry = realm.objectForPrimaryKey<UserPreferencesEntry>(
      'UserPreferences',
      key,
    );

    if (entry) {
      try {
        const value = JSON.parse(entry.value) as T;
        this.cache.set(key, value);
        return value;
      } catch {
        this.cache.set(key, entry.value);
        return entry.value as T;
      }
    }

    // 기본값 반환
    const defaultValue = DEFAULT_VALUES[key] as T | undefined;
    if (defaultValue !== undefined) {
      return defaultValue;
    }

    throw new Error(`Preference not found: ${key}`);
  }

  /**
   * 설정값 가져오기 (기본값 지정)
   */
  async getOrDefault<T>(key: PreferenceKey, defaultValue: T): Promise<T> {
    try {
      return await this.get<T>(key);
    } catch {
      return defaultValue;
    }
  }

  /**
   * 동기적 설정값 가져오기 (캐시된 값만)
   */
  getSync<T>(key: PreferenceKey, defaultValue?: T): T {
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }

    const fallback = defaultValue ?? (DEFAULT_VALUES[key] as T | undefined);
    if (fallback !== undefined) {
      return fallback;
    }

    throw new Error(`Preference not cached: ${key}`);
  }

  /**
   * 설정값 저장
   */
  async set<T>(key: PreferenceKey, value: T): Promise<void> {
    const realm = await realmDB.getRealm();
    const now = new Date();
    const serialized = JSON.stringify(value);

    const existing = realm.objectForPrimaryKey<UserPreferencesEntry>(
      'UserPreferences',
      key,
    );

    realm.write(() => {
      if (existing) {
        existing.value = serialized;
        existing.updatedAt = now;
      } else {
        realm.create<UserPreferencesEntry>('UserPreferences', {
          key,
          value: serialized,
          updatedAt: now,
        });
      }
    });

    // 캐시 업데이트
    this.cache.set(key, value);
    logger.debug(`Preference set: ${key}`);
  }

  /**
   * 설정값 삭제
   */
  async remove(key: PreferenceKey): Promise<boolean> {
    const realm = await realmDB.getRealm();
    const entry = realm.objectForPrimaryKey<UserPreferencesEntry>(
      'UserPreferences',
      key,
    );

    if (!entry) {
      return false;
    }

    realm.write(() => {
      realm.delete(entry);
    });

    this.cache.delete(key);
    logger.debug(`Preference removed: ${key}`);
    return true;
  }

  /**
   * 여러 설정값 한번에 저장
   */
  async setMultiple(
    preferences: Partial<Record<PreferenceKey, unknown>>,
  ): Promise<void> {
    const realm = await realmDB.getRealm();
    const now = new Date();

    realm.write(() => {
      for (const [key, value] of Object.entries(preferences)) {
        const serialized = JSON.stringify(value);
        const existing = realm.objectForPrimaryKey<UserPreferencesEntry>(
          'UserPreferences',
          key,
        );

        if (existing) {
          existing.value = serialized;
          existing.updatedAt = now;
        } else {
          realm.create<UserPreferencesEntry>('UserPreferences', {
            key,
            value: serialized,
            updatedAt: now,
          });
        }

        this.cache.set(key, value);
      }
    });

    logger.debug(`Set ${Object.keys(preferences).length} preferences`);
  }

  /**
   * 모든 설정값 가져오기
   */
  async getAll(): Promise<Map<string, unknown>> {
    const realm = await realmDB.getRealm();
    const allPrefs = realm.objects<UserPreferencesEntry>('UserPreferences');

    const result = new Map<string, unknown>();

    for (const pref of allPrefs) {
      try {
        result.set(pref.key, JSON.parse(pref.value));
      } catch {
        result.set(pref.key, pref.value);
      }
    }

    return result;
  }

  /**
   * 설정 초기화 (기본값으로)
   */
  async resetToDefaults(): Promise<void> {
    await this.deleteAll();
    await this.setMultiple(DEFAULT_VALUES);
    logger.info('Preferences reset to defaults');
  }

  /**
   * 모든 설정 삭제
   */
  async deleteAll(): Promise<void> {
    await realmDB.deleteAllOf('UserPreferences');
    this.cache.clear();
    logger.info('All preferences deleted');
  }

  /**
   * 캐시 클리어
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ============================================================================
  // 편의 메서드들
  // ============================================================================

  /**
   * 화폐 단위 가져오기
   */
  async getCurrency(): Promise<string> {
    return this.getOrDefault(PREFERENCE_KEYS.CURRENCY, 'USD');
  }

  /**
   * 화폐 단위 설정
   */
  async setCurrency(currency: string): Promise<void> {
    await this.set(PREFERENCE_KEYS.CURRENCY, currency);
  }

  /**
   * 테마 가져오기
   */
  async getTheme(): Promise<'dark' | 'light' | 'system'> {
    return this.getOrDefault(PREFERENCE_KEYS.THEME, 'dark');
  }

  /**
   * 테마 설정
   */
  async setTheme(theme: 'dark' | 'light' | 'system'): Promise<void> {
    await this.set(PREFERENCE_KEYS.THEME, theme);
  }

  /**
   * 생체인증 활성화 여부
   */
  async isBiometricEnabled(): Promise<boolean> {
    return this.getOrDefault(PREFERENCE_KEYS.BIOMETRIC_ENABLED, false);
  }

  /**
   * 생체인증 설정
   */
  async setBiometricEnabled(enabled: boolean): Promise<void> {
    await this.set(PREFERENCE_KEYS.BIOMETRIC_ENABLED, enabled);
  }

  /**
   * 잔액 숨김 여부
   */
  async isBalanceHidden(): Promise<boolean> {
    return this.getOrDefault(PREFERENCE_KEYS.HIDE_BALANCE, false);
  }

  /**
   * 잔액 숨김 설정
   */
  async setBalanceHidden(hidden: boolean): Promise<void> {
    await this.set(PREFERENCE_KEYS.HIDE_BALANCE, hidden);
  }

  /**
   * 기본 체인 ID
   */
  async getDefaultChainId(): Promise<number> {
    return this.getOrDefault(PREFERENCE_KEYS.DEFAULT_CHAIN_ID, 1);
  }

  /**
   * 기본 체인 ID 설정
   */
  async setDefaultChainId(chainId: number): Promise<void> {
    await this.set(PREFERENCE_KEYS.DEFAULT_CHAIN_ID, chainId);
  }

  /**
   * 테스트넷 표시 여부
   */
  async isTestnetVisible(): Promise<boolean> {
    return this.getOrDefault(PREFERENCE_KEYS.DEV_SHOW_TESTNET, false);
  }

  /**
   * 테스트넷 표시 설정
   */
  async setTestnetVisible(visible: boolean): Promise<void> {
    await this.set(PREFERENCE_KEYS.DEV_SHOW_TESTNET, visible);
  }
}

export const userPreferencesService = UserPreferencesService.getInstance();
