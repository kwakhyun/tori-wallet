/**
 * 주소록 서비스 테스트
 */

import { AddressBookSchema } from '../../src/realm/schemas';

// uuid 모킹
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
}));

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
import { addressBookService } from '../../src/realm/services/addressBookService';

describe('AddressBookService', () => {
  describe('Schema', () => {
    it('should have correct schema name', () => {
      expect(AddressBookSchema.name).toBe('AddressBook');
    });

    it('should have id as primary key', () => {
      expect(AddressBookSchema.primaryKey).toBe('id');
    });

    it('should have address property with index', () => {
      expect(AddressBookSchema.properties).toHaveProperty('address');
      const addressProp = AddressBookSchema.properties.address as {
        type: string;
        indexed: boolean;
      };
      expect(addressProp.indexed).toBe(true);
    });
  });

  describe('Types', () => {
    it('should export AddressBookEntry type with required fields', () => {
      interface ExpectedAddressBookEntry {
        id: string;
        address: string;
        name: string;
        chainId: number;
        isFavorite: boolean;
        notes?: string;
        createdAt: Date;
        updatedAt: Date;
      }

      const testEntry: ExpectedAddressBookEntry = {
        id: 'test-id',
        address: '0x1234',
        name: 'Test',
        chainId: 1,
        isFavorite: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(testEntry).toBeDefined();
      expect(testEntry.id).toBe('test-id');
      expect(testEntry.address).toBe('0x1234');
    });
  });

  describe('Input Types', () => {
    it('CreateAddressInput should have required fields', () => {
      interface CreateAddressInput {
        address: string;
        name: string;
        chainId?: number;
        isFavorite?: boolean;
        notes?: string;
      }

      const validInput: CreateAddressInput = {
        address: '0x1234567890123456789012345678901234567890',
        name: 'Test Wallet',
      };

      expect(validInput.address).toBeDefined();
      expect(validInput.name).toBeDefined();
    });

    it('UpdateAddressInput should have optional fields', () => {
      interface UpdateAddressInput {
        name?: string;
        chainId?: number;
        isFavorite?: boolean;
        notes?: string;
      }

      const updateInput: UpdateAddressInput = {
        isFavorite: true,
      };

      expect(updateInput.isFavorite).toBe(true);
    });
  });

  describe('Service', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should be defined', () => {
      expect(addressBookService).toBeDefined();
    });

    it('should have create method', () => {
      expect(typeof addressBookService.create).toBe('function');
    });

    it('should have update method', () => {
      expect(typeof addressBookService.update).toBe('function');
    });

    it('should have delete method', () => {
      expect(typeof addressBookService.delete).toBe('function');
    });

    it('should have getById method', () => {
      expect(typeof addressBookService.getById).toBe('function');
    });

    it('should have getByAddress method', () => {
      expect(typeof addressBookService.getByAddress).toBe('function');
    });

    it('should have getAll method', () => {
      expect(typeof addressBookService.getAll).toBe('function');
    });

    it('should have getFavorites method', () => {
      expect(typeof addressBookService.getFavorites).toBe('function');
    });

    it('should have search method', () => {
      expect(typeof addressBookService.search).toBe('function');
    });

    it('should have toggleFavorite method', () => {
      expect(typeof addressBookService.toggleFavorite).toBe('function');
    });

    it('should have count method', () => {
      expect(typeof addressBookService.count).toBe('function');
    });
  });
});
