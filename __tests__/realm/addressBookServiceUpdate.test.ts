/**
 * 주소록 서비스: 주소 수정(중복 검사 포함) 테스트
 */

const mockEntry = {
  id: 'bob',
  address: '0x2222222222222222222222222222222222222222',
  name: 'Bob',
  chainId: 1,
  isFavorite: false,
  notes: 'old',
  createdAt: new Date(0),
  updatedAt: new Date(0),
};
const mockDuplicates: { length: number } = { length: 0 };
const mockFiltered = jest.fn(() => mockDuplicates);

jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

jest.mock('../../src/realm/database', () => ({
  realmDB: {
    getRealm: jest.fn(async () => ({
      objectForPrimaryKey: jest.fn((_schema: string, id: string) =>
        id === mockEntry.id ? mockEntry : null,
      ),
      objects: jest.fn(() => ({ filtered: mockFiltered })),
      write: jest.fn((callback: () => void) => callback()),
    })),
  },
}));

import { addressBookService } from '../../src/realm/services/addressBookService';

describe('addressBookService.update', () => {
  beforeEach(() => {
    mockEntry.address = '0x2222222222222222222222222222222222222222';
    mockEntry.notes = 'old';
    mockDuplicates.length = 0;
    mockFiltered.mockClear();
  });

  it('saves a changed address in lowercase', async () => {
    await addressBookService.update('bob', {
      address: '0xABCDEFabcdef0000000000000000000000000001',
      name: 'Bobby',
      notes: '',
    });
    expect(mockEntry.address).toBe(
      '0xabcdefabcdef0000000000000000000000000001',
    );
    expect(mockEntry.name).toBe('Bobby');
    expect(mockEntry.notes).toBe('');
    expect(mockFiltered).toHaveBeenCalledWith(
      'address ==[c] $0 AND id != $1',
      '0xabcdefabcdef0000000000000000000000000001',
      'bob',
    );
  });

  it('rejects an address that belongs to another entry', async () => {
    mockDuplicates.length = 1;
    await expect(
      addressBookService.update('bob', {
        address: '0x1111111111111111111111111111111111111111',
      }),
    ).rejects.toThrow('Address already exists');
    expect(mockEntry.address).toBe(
      '0x2222222222222222222222222222222222222222',
    );
  });

  it('skips the duplicate check when the address is unchanged', async () => {
    await addressBookService.update('bob', {
      address: '0x2222222222222222222222222222222222222222',
    });
    expect(mockFiltered).not.toHaveBeenCalled();
  });
});
