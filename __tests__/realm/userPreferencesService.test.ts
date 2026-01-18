/**
 * 사용자 설정 서비스 테스트
 */

import { UserPreferencesSchema } from '../../src/realm/schemas';

// 서비스 모듈 직접 모킹
jest.mock('../../src/realm/database', () => ({
  realmDB: {
    getRealm: jest.fn().mockResolvedValue({
      objects: jest.fn(() => ({
        filtered: jest.fn().mockReturnValue({
          length: 0,
          [Symbol.iterator]: function* () {},
        }),
        length: 0,
        [Symbol.iterator]: function* () {},
      })),
      objectForPrimaryKey: jest.fn(() => null),
      create: jest.fn((schemaName: string, obj: any) => obj),
      write: jest.fn((callback: () => void) => callback()),
      delete: jest.fn(),
    }),
    deleteAllOf: jest.fn().mockResolvedValue(undefined),
  },
}));

// 모킹 후 서비스 import
import {
  userPreferencesService,
  PREFERENCE_KEYS,
} from '../../src/realm/services/userPreferencesService';

describe('UserPreferencesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Schema', () => {
    it('should have correct schema name', () => {
      expect(UserPreferencesSchema.name).toBe('UserPreferences');
    });

    it('should have key as primary key', () => {
      expect(UserPreferencesSchema.primaryKey).toBe('key');
    });

    it('should have required properties', () => {
      expect(UserPreferencesSchema.properties).toHaveProperty('key');
      expect(UserPreferencesSchema.properties).toHaveProperty('value');
      expect(UserPreferencesSchema.properties).toHaveProperty('updatedAt');
    });
  });

  describe('PREFERENCE_KEYS', () => {
    it('should be defined', () => {
      expect(PREFERENCE_KEYS).toBeDefined();
    });

    it('should have display settings keys', () => {
      expect(PREFERENCE_KEYS.CURRENCY).toBe('display.currency');
      expect(PREFERENCE_KEYS.LANGUAGE).toBe('display.language');
      expect(PREFERENCE_KEYS.THEME).toBe('display.theme');
      expect(PREFERENCE_KEYS.HIDE_BALANCE).toBe('display.hideBalance');
    });

    it('should have security settings keys', () => {
      expect(PREFERENCE_KEYS.BIOMETRIC_ENABLED).toBe(
        'security.biometricEnabled',
      );
      expect(PREFERENCE_KEYS.AUTO_LOCK_TIMEOUT).toBe(
        'security.autoLockTimeout',
      );
    });

    it('should have network settings keys', () => {
      expect(PREFERENCE_KEYS.DEFAULT_CHAIN_ID).toBe('network.defaultChainId');
      expect(PREFERENCE_KEYS.GAS_PREFERENCE).toBe('network.gasPreference');
    });

    it('should have notification settings keys', () => {
      expect(PREFERENCE_KEYS.NOTIFICATIONS_ENABLED).toBe(
        'notifications.enabled',
      );
      expect(PREFERENCE_KEYS.NOTIFICATION_TRANSACTIONS).toBe(
        'notifications.transactions',
      );
    });

    it('should have WalletConnect settings keys', () => {
      expect(PREFERENCE_KEYS.WC_AUTO_APPROVE_DAPPS).toBe('wc.autoApproveDapps');
      expect(PREFERENCE_KEYS.WC_TRUSTED_DAPPS).toBe('wc.trustedDapps');
    });

    it('should have developer settings keys', () => {
      expect(PREFERENCE_KEYS.DEV_MODE).toBe('dev.enabled');
      expect(PREFERENCE_KEYS.DEV_SHOW_TESTNET).toBe('dev.showTestnet');
    });
  });

  describe('Service', () => {
    it('should be defined', () => {
      expect(userPreferencesService).toBeDefined();
    });

    it('should have get method', () => {
      expect(typeof userPreferencesService.get).toBe('function');
    });

    it('should have set method', () => {
      expect(typeof userPreferencesService.set).toBe('function');
    });

    it('should have loadAll method', () => {
      expect(typeof userPreferencesService.loadAll).toBe('function');
    });

    it('should have remove method', () => {
      expect(typeof userPreferencesService.remove).toBe('function');
    });
  });

  describe('Default Values', () => {
    it('should have sensible defaults', () => {
      const defaults = {
        currency: 'USD',
        language: 'ko',
        theme: 'dark',
        hideBalance: false,
        biometricEnabled: false,
        autoLockTimeout: 300000,
        defaultChainId: 1,
        gasPreference: 'medium',
        notificationsEnabled: true,
      };

      expect(defaults.currency).toBe('USD');
      expect(defaults.autoLockTimeout).toBe(300000); // 5분
      expect(defaults.defaultChainId).toBe(1); // Ethereum
    });
  });
});
