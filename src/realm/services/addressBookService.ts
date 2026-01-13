/**
 * Tori Wallet - Address Book Service (Realm)
 * 주소록 CRUD 서비스
 */

import { realmDB } from '../database';
import type { AddressBookEntry } from '../schemas';
import { createLogger } from '@/utils/logger';
import { v4 as uuid } from 'uuid';

const logger = createLogger('AddressBook');

export interface CreateAddressInput {
  address: string;
  name: string;
  chainId?: number;
  isFavorite?: boolean;
  notes?: string;
}

export interface UpdateAddressInput {
  name?: string;
  chainId?: number;
  isFavorite?: boolean;
  notes?: string;
}

class AddressBookService {
  private static instance: AddressBookService;

  private constructor() {}

  static getInstance(): AddressBookService {
    if (!AddressBookService.instance) {
      AddressBookService.instance = new AddressBookService();
    }
    return AddressBookService.instance;
  }

  /**
   * 새 주소 추가
   */
  async create(input: CreateAddressInput): Promise<AddressBookEntry> {
    const realm = await realmDB.getRealm();
    const now = new Date();

    // 중복 체크
    const existing = realm
      .objects<AddressBookEntry>('AddressBook')
      .filtered('address ==[c] $0', input.address);

    if (existing.length > 0) {
      throw new Error('Address already exists in address book');
    }

    const entry: AddressBookEntry = {
      id: uuid(),
      address: input.address.toLowerCase(),
      name: input.name,
      chainId: input.chainId ?? 1,
      isFavorite: input.isFavorite ?? false,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    };

    let created: AddressBookEntry | null = null;

    realm.write(() => {
      created = realm.create<AddressBookEntry>('AddressBook', entry);
    });

    logger.info(`Address added: ${entry.name} (${entry.address})`);
    return created!;
  }

  /**
   * 주소 업데이트
   */
  async update(
    id: string,
    input: UpdateAddressInput,
  ): Promise<AddressBookEntry | null> {
    const realm = await realmDB.getRealm();
    const entry = realm.objectForPrimaryKey<AddressBookEntry>(
      'AddressBook',
      id,
    );

    if (!entry) {
      logger.warn(`Address not found: ${id}`);
      return null;
    }

    realm.write(() => {
      if (input.name !== undefined) entry.name = input.name;
      if (input.chainId !== undefined) entry.chainId = input.chainId;
      if (input.isFavorite !== undefined) entry.isFavorite = input.isFavorite;
      if (input.notes !== undefined) entry.notes = input.notes;
      entry.updatedAt = new Date();
    });

    logger.info(`Address updated: ${entry.name}`);
    return entry;
  }

  /**
   * 주소 삭제
   */
  async delete(id: string): Promise<boolean> {
    const realm = await realmDB.getRealm();
    const entry = realm.objectForPrimaryKey<AddressBookEntry>(
      'AddressBook',
      id,
    );

    if (!entry) {
      logger.warn(`Address not found: ${id}`);
      return false;
    }

    const name = entry.name;
    realm.write(() => {
      realm.delete(entry);
    });

    logger.info(`Address deleted: ${name}`);
    return true;
  }

  /**
   * ID로 주소 조회
   */
  async getById(id: string): Promise<AddressBookEntry | null> {
    const realm = await realmDB.getRealm();
    return (
      realm.objectForPrimaryKey<AddressBookEntry>('AddressBook', id) ?? null
    );
  }

  /**
   * 주소로 조회
   */
  async getByAddress(address: string): Promise<AddressBookEntry | null> {
    const realm = await realmDB.getRealm();
    const results = realm
      .objects<AddressBookEntry>('AddressBook')
      .filtered('address ==[c] $0', address.toLowerCase());

    return results.length > 0 ? results[0] : null;
  }

  /**
   * 모든 주소 조회
   */
  async getAll(): Promise<AddressBookEntry[]> {
    const realm = await realmDB.getRealm();
    const results = realm.objects<AddressBookEntry>('AddressBook').sorted([
      ['isFavorite', true],
      ['name', false],
    ]);

    return Array.from(results);
  }

  /**
   * 체인별 주소 조회
   */
  async getByChainId(chainId: number): Promise<AddressBookEntry[]> {
    const realm = await realmDB.getRealm();
    const results = realm
      .objects<AddressBookEntry>('AddressBook')
      .filtered('chainId == $0', chainId)
      .sorted([
        ['isFavorite', true],
        ['name', false],
      ]);

    return Array.from(results);
  }

  /**
   * 즐겨찾기 주소 조회
   */
  async getFavorites(): Promise<AddressBookEntry[]> {
    const realm = await realmDB.getRealm();
    const results = realm
      .objects<AddressBookEntry>('AddressBook')
      .filtered('isFavorite == true')
      .sorted('name');

    return Array.from(results);
  }

  /**
   * 주소 검색
   */
  async search(query: string): Promise<AddressBookEntry[]> {
    const realm = await realmDB.getRealm();
    const lowerQuery = query.toLowerCase();

    const results = realm
      .objects<AddressBookEntry>('AddressBook')
      .filtered(
        'name CONTAINS[c] $0 OR address CONTAINS[c] $0 OR notes CONTAINS[c] $0',
        lowerQuery,
      )
      .sorted([
        ['isFavorite', true],
        ['name', false],
      ]);

    return Array.from(results);
  }

  /**
   * 즐겨찾기 토글
   */
  async toggleFavorite(id: string): Promise<boolean> {
    const realm = await realmDB.getRealm();
    const entry = realm.objectForPrimaryKey<AddressBookEntry>(
      'AddressBook',
      id,
    );

    if (!entry) {
      return false;
    }

    realm.write(() => {
      entry.isFavorite = !entry.isFavorite;
      entry.updatedAt = new Date();
    });

    return entry.isFavorite;
  }

  /**
   * 주소 개수 반환
   */
  async count(): Promise<number> {
    const realm = await realmDB.getRealm();
    return realm.objects<AddressBookEntry>('AddressBook').length;
  }

  /**
   * 모든 주소 삭제
   */
  async deleteAll(): Promise<void> {
    await realmDB.deleteAllOf('AddressBook');
    logger.info('All addresses deleted');
  }
}

export const addressBookService = AddressBookService.getInstance();
