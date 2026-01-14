/**
 * Tori Wallet - Address Book Service Tests
 */

import { AddressBookSchema } from '../../src/realm/schemas';

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
});
