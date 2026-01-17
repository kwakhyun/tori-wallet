/**
 * Realm 스키마 테스트
 */

import {
  AddressBookSchema,
  TransactionCacheSchema,
  TokenListSchema,
  WCSessionLogSchema,
  WCRequestLogSchema,
  SyncStatusSchema,
  BalanceSnapshotSchema,
  UserPreferencesSchema,
  ALL_SCHEMAS,
  SCHEMA_VERSION,
} from '../../src/realm/schemas';

describe('Realm Schemas', () => {
  describe('AddressBookSchema', () => {
    it('should have correct name', () => {
      expect(AddressBookSchema.name).toBe('AddressBook');
    });

    it('should have id as primary key', () => {
      expect(AddressBookSchema.primaryKey).toBe('id');
    });

    it('should have required properties', () => {
      expect(AddressBookSchema.properties).toHaveProperty('id');
      expect(AddressBookSchema.properties).toHaveProperty('address');
      expect(AddressBookSchema.properties).toHaveProperty('name');
      expect(AddressBookSchema.properties).toHaveProperty('chainId');
      expect(AddressBookSchema.properties).toHaveProperty('isFavorite');
      expect(AddressBookSchema.properties).toHaveProperty('createdAt');
      expect(AddressBookSchema.properties).toHaveProperty('updatedAt');
    });
  });

  describe('TransactionCacheSchema', () => {
    it('should have correct name', () => {
      expect(TransactionCacheSchema.name).toBe('TransactionCache');
    });

    it('should have required transaction properties', () => {
      expect(TransactionCacheSchema.properties).toHaveProperty('hash');
      expect(TransactionCacheSchema.properties).toHaveProperty('chainId');
      expect(TransactionCacheSchema.properties).toHaveProperty('from');
      expect(TransactionCacheSchema.properties).toHaveProperty('to');
      expect(TransactionCacheSchema.properties).toHaveProperty('value');
      expect(TransactionCacheSchema.properties).toHaveProperty('status');
      expect(TransactionCacheSchema.properties).toHaveProperty('type');
    });
  });

  describe('TokenListSchema', () => {
    it('should have correct name', () => {
      expect(TokenListSchema.name).toBe('TokenList');
    });

    it('should have hidden/spam flags', () => {
      expect(TokenListSchema.properties).toHaveProperty('isHidden');
      expect(TokenListSchema.properties).toHaveProperty('isSpam');
      expect(TokenListSchema.properties).toHaveProperty('isCustom');
    });

    it('should have balance snapshot properties', () => {
      expect(TokenListSchema.properties).toHaveProperty('lastBalance');
      expect(TokenListSchema.properties).toHaveProperty('lastPrice');
      expect(TokenListSchema.properties).toHaveProperty('lastSyncAt');
    });
  });

  describe('WCSessionLogSchema', () => {
    it('should have correct name', () => {
      expect(WCSessionLogSchema.name).toBe('WCSessionLog');
    });

    it('should have session properties', () => {
      expect(WCSessionLogSchema.properties).toHaveProperty('topic');
      expect(WCSessionLogSchema.properties).toHaveProperty('dappName');
      expect(WCSessionLogSchema.properties).toHaveProperty('dappUrl');
      expect(WCSessionLogSchema.properties).toHaveProperty('status');
      expect(WCSessionLogSchema.properties).toHaveProperty('connectedAt');
    });
  });

  describe('WCRequestLogSchema', () => {
    it('should have correct name', () => {
      expect(WCRequestLogSchema.name).toBe('WCRequestLog');
    });

    it('should have request properties', () => {
      expect(WCRequestLogSchema.properties).toHaveProperty('sessionTopic');
      expect(WCRequestLogSchema.properties).toHaveProperty('requestId');
      expect(WCRequestLogSchema.properties).toHaveProperty('method');
      expect(WCRequestLogSchema.properties).toHaveProperty('params');
      expect(WCRequestLogSchema.properties).toHaveProperty('status');
    });
  });

  describe('SyncStatusSchema', () => {
    it('should have correct name', () => {
      expect(SyncStatusSchema.name).toBe('SyncStatus');
    });

    it('should have key as primary key', () => {
      expect(SyncStatusSchema.primaryKey).toBe('key');
    });

    it('should have sync properties', () => {
      expect(SyncStatusSchema.properties).toHaveProperty('type');
      expect(SyncStatusSchema.properties).toHaveProperty('address');
      expect(SyncStatusSchema.properties).toHaveProperty('chainId');
      expect(SyncStatusSchema.properties).toHaveProperty('lastSyncAt');
      expect(SyncStatusSchema.properties).toHaveProperty('status');
    });
  });

  describe('BalanceSnapshotSchema', () => {
    it('should have correct name', () => {
      expect(BalanceSnapshotSchema.name).toBe('BalanceSnapshot');
    });

    it('should have balance properties', () => {
      expect(BalanceSnapshotSchema.properties).toHaveProperty('nativeBalance');
      expect(BalanceSnapshotSchema.properties).toHaveProperty(
        'nativeBalanceWei',
      );
      expect(BalanceSnapshotSchema.properties).toHaveProperty('nativePrice');
      expect(BalanceSnapshotSchema.properties).toHaveProperty('totalValueUsd');
    });
  });

  describe('UserPreferencesSchema', () => {
    it('should have correct name', () => {
      expect(UserPreferencesSchema.name).toBe('UserPreferences');
    });

    it('should have key as primary key', () => {
      expect(UserPreferencesSchema.primaryKey).toBe('key');
    });

    it('should have key-value properties', () => {
      expect(UserPreferencesSchema.properties).toHaveProperty('key');
      expect(UserPreferencesSchema.properties).toHaveProperty('value');
      expect(UserPreferencesSchema.properties).toHaveProperty('updatedAt');
    });
  });

  describe('ALL_SCHEMAS', () => {
    it('should include all schemas', () => {
      expect(ALL_SCHEMAS).toContain(AddressBookSchema);
      expect(ALL_SCHEMAS).toContain(TransactionCacheSchema);
      expect(ALL_SCHEMAS).toContain(TokenListSchema);
      expect(ALL_SCHEMAS).toContain(WCSessionLogSchema);
      expect(ALL_SCHEMAS).toContain(WCRequestLogSchema);
      expect(ALL_SCHEMAS).toContain(SyncStatusSchema);
      expect(ALL_SCHEMAS).toContain(BalanceSnapshotSchema);
      expect(ALL_SCHEMAS).toContain(UserPreferencesSchema);
    });

    it('should have 8 schemas', () => {
      expect(ALL_SCHEMAS.length).toBe(8);
    });
  });

  describe('SCHEMA_VERSION', () => {
    it('should be a positive number', () => {
      expect(SCHEMA_VERSION).toBeGreaterThan(0);
    });
  });
});
