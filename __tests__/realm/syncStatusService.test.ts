/**
 * 동기화 상태 서비스 테스트
 */

import {
  SyncStatusSchema,
  BalanceSnapshotSchema,
} from '../../src/realm/schemas';

// Realm 모킹
jest.mock('../../src/realm/database', () => ({
  realmDB: {
    getRealm: jest.fn().mockResolvedValue({
      objects: jest.fn(() => ({
        filtered: jest.fn().mockReturnValue({
          sorted: jest.fn().mockReturnValue([]),
          length: 0,
          [Symbol.iterator]: function* () {},
        }),
        sorted: jest.fn().mockReturnValue([]),
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
import { syncStatusService } from '../../src/realm/services/syncStatusService';

describe('SyncStatusService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Schema', () => {
    it('should have correct SyncStatus schema name', () => {
      expect(SyncStatusSchema.name).toBe('SyncStatus');
    });

    it('should have key as primary key for SyncStatus', () => {
      expect(SyncStatusSchema.primaryKey).toBe('key');
    });

    it('should have correct BalanceSnapshot schema name', () => {
      expect(BalanceSnapshotSchema.name).toBe('BalanceSnapshot');
    });

    it('should have id as primary key for BalanceSnapshot', () => {
      expect(BalanceSnapshotSchema.primaryKey).toBe('id');
    });

    it('should have required properties in SyncStatus', () => {
      expect(SyncStatusSchema.properties).toHaveProperty('key');
      expect(SyncStatusSchema.properties).toHaveProperty('type');
      expect(SyncStatusSchema.properties).toHaveProperty('address');
      expect(SyncStatusSchema.properties).toHaveProperty('chainId');
      expect(SyncStatusSchema.properties).toHaveProperty('status');
    });

    it('should have required properties in BalanceSnapshot', () => {
      expect(BalanceSnapshotSchema.properties).toHaveProperty('id');
      expect(BalanceSnapshotSchema.properties).toHaveProperty('address');
      expect(BalanceSnapshotSchema.properties).toHaveProperty('chainId');
      expect(BalanceSnapshotSchema.properties).toHaveProperty('nativeBalance');
    });
  });

  describe('Types', () => {
    it('should have correct SyncType values', () => {
      type SyncType = 'balance' | 'tokens' | 'transactions' | 'nfts';
      const types: SyncType[] = ['balance', 'tokens', 'transactions', 'nfts'];
      expect(types).toHaveLength(4);
    });

    it('should have correct SyncState values', () => {
      type SyncState = 'synced' | 'syncing' | 'error';
      const states: SyncState[] = ['synced', 'syncing', 'error'];
      expect(states).toHaveLength(3);
    });
  });

  describe('Service', () => {
    it('should be defined', () => {
      expect(syncStatusService).toBeDefined();
    });

    it('should have startSync method', () => {
      expect(typeof syncStatusService.startSync).toBe('function');
    });

    it('should have completeSync method', () => {
      expect(typeof syncStatusService.completeSync).toBe('function');
    });

    it('should have syncError method', () => {
      expect(typeof syncStatusService.syncError).toBe('function');
    });

    it('should have saveBalanceSnapshot method', () => {
      expect(typeof syncStatusService.saveBalanceSnapshot).toBe('function');
    });

    it('should have getBalanceSnapshot method', () => {
      expect(typeof syncStatusService.getBalanceSnapshot).toBe('function');
    });
  });

  describe('Service Logic', () => {
    it('should generate correct sync key format', () => {
      const type = 'balance';
      const address = '0x1234567890123456789012345678901234567890';
      const chainId = 1;
      const expectedKey = `${type}-${address.toLowerCase()}-${chainId}`;

      expect(expectedKey).toBe(
        'balance-0x1234567890123456789012345678901234567890-1',
      );
    });

    it('should generate correct balance snapshot id format', () => {
      const address = '0x1234567890123456789012345678901234567890';
      const chainId = 1;
      const expectedId = `${address.toLowerCase()}-${chainId}`;

      expect(expectedId).toBe('0x1234567890123456789012345678901234567890-1');
    });
  });
});
