/**
 * Tori Wallet - Transaction Cache Service Tests
 */

import { transactionCacheService } from '../../src/realm/services/transactionCacheService';
import { realmDB } from '../../src/realm/database';

// Realm mock
jest.mock('../../src/realm/database', () => {
  const mockTransactions: any[] = [];

  return {
    realmDB: {
      getRealm: jest.fn().mockResolvedValue({
        objects: jest.fn(() => ({
          filtered: jest.fn().mockReturnValue({
            sorted: jest.fn().mockReturnValue(mockTransactions),
            length: mockTransactions.length,
            [Symbol.iterator]: function* () {
              yield* mockTransactions;
            },
          }),
          sorted: jest.fn().mockReturnValue(mockTransactions),
          length: mockTransactions.length,
        })),
        objectForPrimaryKey: jest.fn((schemaName: string, id: string) => {
          return mockTransactions.find(tx => tx.id === id) || null;
        }),
        create: jest.fn((schemaName: string, obj: any) => {
          mockTransactions.push(obj);
          return obj;
        }),
        write: jest.fn((callback: () => void) => callback()),
        delete: jest.fn(),
      }),
      deleteAllOf: jest.fn().mockResolvedValue(undefined),
    },
  };
});

describe('TransactionCacheService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createLocalTransaction', () => {
    it('should create a new local transaction', async () => {
      const input = {
        hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        chainId: 1,
        from: '0x1234567890123456789012345678901234567890',
        to: '0xabcdef0123456789012345678901234567890123',
        value: '1.5',
        valueWei: '1500000000000000000',
        gasPrice: '20000000000',
        type: 'send' as const,
      };

      const result = await transactionCacheService.createLocalTransaction(
        input,
      );

      expect(result).toBeDefined();
      expect(result.hash).toBe(input.hash.toLowerCase());
      expect(result.chainId).toBe(1);
      expect(result.status).toBe('pending');
      expect(result.isLocal).toBe(true);
      expect(result.type).toBe('send');
    });

    it('should normalize addresses to lowercase', async () => {
      const input = {
        hash: '0xABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890',
        chainId: 1,
        from: '0xABCDEF0123456789012345678901234567890ABC',
        to: '0x1234567890ABCDEF1234567890ABCDEF12345678',
        value: '0.1',
        valueWei: '100000000000000000',
        gasPrice: '30000000000',
        type: 'send' as const,
      };

      const result = await transactionCacheService.createLocalTransaction(
        input,
      );

      expect(result.hash).toBe(input.hash.toLowerCase());
      expect(result.from).toBe(input.from.toLowerCase());
      expect(result.to).toBe(input.to.toLowerCase());
    });
  });

  describe('getByHash', () => {
    it('should return null for non-existent transaction', async () => {
      const result = await transactionCacheService.getByHash(
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        1,
      );
      expect(result).toBeNull();
    });
  });

  describe('getPendingTransactions', () => {
    it('should return empty array when no pending transactions', async () => {
      const result = await transactionCacheService.getPendingTransactions(
        '0x1234567890123456789012345678901234567890',
        1,
      );
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('countByAddress', () => {
    it('should return count of transactions', async () => {
      const count = await transactionCacheService.countByAddress(
        '0x1234567890123456789012345678901234567890',
        1,
      );
      expect(typeof count).toBe('number');
    });
  });

  describe('deleteAll', () => {
    it('should call deleteAllOf with TransactionCache', async () => {
      await transactionCacheService.deleteAll();
      expect(realmDB.deleteAllOf).toHaveBeenCalledWith('TransactionCache');
    });
  });
});
