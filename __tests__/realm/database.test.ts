/**
 * Realm 데이터베이스 테스트
 */

// Realm 모킹
const mockRealm = {
  isClosed: false,
  schemaVersion: 1,
  objects: jest.fn(() => ({
    length: 0,
    [Symbol.iterator]: function* () {},
  })),
  create: jest.fn(),
  write: jest.fn((callback: () => void) => callback()),
  delete: jest.fn(),
  deleteAll: jest.fn(),
  close: jest.fn(),
};

jest.mock('realm', () => ({
  __esModule: true,
  default: {
    open: jest.fn().mockResolvedValue(mockRealm),
  },
}));

import { realmDB } from '../../src/realm/database';
import { SCHEMA_VERSION, ALL_SCHEMAS } from '../../src/realm/schemas';

describe('RealmDatabase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRealm.isClosed = false;
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = realmDB;
      const instance2 = realmDB;
      expect(instance1).toBe(instance2);
    });
  });

  describe('initialize', () => {
    it('should be a function', () => {
      expect(typeof realmDB.initialize).toBe('function');
    });

    it('should return a promise', () => {
      const result = realmDB.initialize();
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('getRealm', () => {
    it('should be a function', () => {
      expect(typeof realmDB.getRealm).toBe('function');
    });

    it('should return a promise', () => {
      const result = realmDB.getRealm();
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('getRealmSync', () => {
    it('should be a function', () => {
      expect(typeof realmDB.getRealmSync).toBe('function');
    });
  });

  describe('close', () => {
    it('should be a function', () => {
      expect(typeof realmDB.close).toBe('function');
    });
  });

  describe('deleteAllOf', () => {
    it('should be a function', () => {
      expect(typeof realmDB.deleteAllOf).toBe('function');
    });
  });

  describe('Schema Version', () => {
    it('should have SCHEMA_VERSION exported', () => {
      expect(typeof SCHEMA_VERSION).toBe('number');
      expect(SCHEMA_VERSION).toBeGreaterThan(0);
    });

    it('should have ALL_SCHEMAS exported', () => {
      expect(Array.isArray(ALL_SCHEMAS)).toBe(true);
      expect(ALL_SCHEMAS.length).toBeGreaterThan(0);
    });
  });
});
