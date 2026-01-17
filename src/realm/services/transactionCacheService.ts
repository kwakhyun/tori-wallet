/**
 * 트랜잭션 내역 로컬 캐싱 서비스
 */

import { realmDB } from '../database';
import type { TransactionCacheEntry } from '../schemas';
import { createLogger } from '@/utils/logger';

const logger = createLogger('TxCache');

export type TransactionStatus =
  | 'pending'
  | 'confirmed'
  | 'failed'
  | 'cancelled';
export type TransactionType =
  | 'send'
  | 'receive'
  | 'swap'
  | 'approve'
  | 'contract';

export interface CreateTransactionInput {
  hash: string;
  chainId: number;
  from: string;
  to: string;
  value: string;
  valueWei: string;
  gasPrice: string;
  gasLimit?: string;
  nonce?: number;
  type: TransactionType;
  tokenSymbol?: string;
  tokenAmount?: string;
  tokenAddress?: string;
  method?: string;
}

export interface UpdateTransactionInput {
  status?: TransactionStatus;
  gasUsed?: string;
  fee?: string;
  blockNumber?: string;
  errorMessage?: string;
  confirmedAt?: Date;
}

class TransactionCacheService {
  private static instance: TransactionCacheService;

  private constructor() {}

  static getInstance(): TransactionCacheService {
    if (!TransactionCacheService.instance) {
      TransactionCacheService.instance = new TransactionCacheService();
    }
    return TransactionCacheService.instance;
  }

  /**
   * 트랜잭션 ID 생성
   */
  private generateId(hash: string, chainId: number): string {
    return `${hash.toLowerCase()}-${chainId}`;
  }

  /**
   * 새 트랜잭션 저장 (로컬에서 생성한 트랜잭션)
   */
  async createLocalTransaction(
    input: CreateTransactionInput,
  ): Promise<TransactionCacheEntry> {
    const realm = await realmDB.getRealm();
    const now = new Date();
    const id = this.generateId(input.hash, input.chainId);

    // 이미 존재하는지 확인
    const existing = realm.objectForPrimaryKey<TransactionCacheEntry>(
      'TransactionCache',
      id,
    );
    if (existing) {
      logger.info(`Transaction already exists: ${id}`);
      return existing;
    }

    const entry: TransactionCacheEntry = {
      id,
      hash: input.hash.toLowerCase(),
      chainId: input.chainId,
      from: input.from.toLowerCase(),
      to: input.to.toLowerCase(),
      value: input.value,
      valueWei: input.valueWei,
      gasPrice: input.gasPrice,
      gasLimit: input.gasLimit,
      nonce: input.nonce,
      timestamp: Math.floor(now.getTime() / 1000),
      status: 'pending',
      type: input.type,
      method: input.method,
      tokenSymbol: input.tokenSymbol,
      tokenAmount: input.tokenAmount,
      tokenAddress: input.tokenAddress,
      isLocal: true,
      createdAt: now,
      updatedAt: now,
    };

    let created: TransactionCacheEntry | null = null;

    realm.write(() => {
      created = realm.create<TransactionCacheEntry>('TransactionCache', entry);
    });

    logger.info(`Local transaction created: ${input.hash}`);
    return created!;
  }

  /**
   * API에서 가져온 트랜잭션 일괄 저장/업데이트
   */
  async syncTransactions(
    transactions: Omit<
      TransactionCacheEntry,
      'id' | 'createdAt' | 'updatedAt'
    >[],
  ): Promise<number> {
    const realm = await realmDB.getRealm();
    const now = new Date();
    let syncedCount = 0;

    realm.write(() => {
      for (const tx of transactions) {
        const id = this.generateId(tx.hash, tx.chainId);
        const existing = realm.objectForPrimaryKey<TransactionCacheEntry>(
          'TransactionCache',
          id,
        );

        if (existing) {
          // 기존 트랜잭션 업데이트 (상태가 변경된 경우)
          if (existing.status !== tx.status) {
            existing.status = tx.status;
            existing.gasUsed = tx.gasUsed;
            existing.fee = tx.fee;
            existing.blockNumber = tx.blockNumber;
            existing.confirmedAt = tx.confirmedAt;
            existing.updatedAt = now;
            syncedCount++;
          }
        } else {
          // 새 트랜잭션 생성
          realm.create<TransactionCacheEntry>('TransactionCache', {
            ...tx,
            id,
            isLocal: false,
            createdAt: now,
            updatedAt: now,
          });
          syncedCount++;
        }
      }
    });

    logger.info(`Synced ${syncedCount} transactions`);
    return syncedCount;
  }

  /**
   * 트랜잭션 상태 업데이트
   */
  async updateStatus(
    hash: string,
    chainId: number,
    input: UpdateTransactionInput,
  ): Promise<TransactionCacheEntry | null> {
    const realm = await realmDB.getRealm();
    const id = this.generateId(hash, chainId);
    const entry = realm.objectForPrimaryKey<TransactionCacheEntry>(
      'TransactionCache',
      id,
    );

    if (!entry) {
      logger.warn(`Transaction not found: ${id}`);
      return null;
    }

    realm.write(() => {
      if (input.status !== undefined) entry.status = input.status;
      if (input.gasUsed !== undefined) entry.gasUsed = input.gasUsed;
      if (input.fee !== undefined) entry.fee = input.fee;
      if (input.blockNumber !== undefined)
        entry.blockNumber = input.blockNumber;
      if (input.errorMessage !== undefined)
        entry.errorMessage = input.errorMessage;
      if (input.confirmedAt !== undefined)
        entry.confirmedAt = input.confirmedAt;
      entry.updatedAt = new Date();
    });

    logger.info(`Transaction updated: ${hash} -> ${input.status}`);
    return entry;
  }

  /**
   * 해시로 트랜잭션 조회
   */
  async getByHash(
    hash: string,
    chainId: number,
  ): Promise<TransactionCacheEntry | null> {
    const realm = await realmDB.getRealm();
    const id = this.generateId(hash, chainId);
    return (
      realm.objectForPrimaryKey<TransactionCacheEntry>(
        'TransactionCache',
        id,
      ) ?? null
    );
  }

  /**
   * 주소별 트랜잭션 조회
   */
  async getByAddress(
    address: string,
    chainId?: number,
    options?: {
      limit?: number;
      offset?: number;
      status?: TransactionStatus;
      type?: TransactionType;
    },
  ): Promise<TransactionCacheEntry[]> {
    const realm = await realmDB.getRealm();
    const lowerAddress = address.toLowerCase();
    let query = `from ==[c] $0 OR to ==[c] $0`;
    const queryParams: (string | number)[] = [lowerAddress];

    if (chainId !== undefined) {
      query += ` AND chainId == $${queryParams.length}`;
      queryParams.push(chainId);
    }

    if (options?.status) {
      query += ` AND status == $${queryParams.length}`;
      queryParams.push(options.status);
    }

    if (options?.type) {
      query += ` AND type == $${queryParams.length}`;
      queryParams.push(options.type);
    }

    let results = realm
      .objects<TransactionCacheEntry>('TransactionCache')
      .filtered(query, ...queryParams)
      .sorted('timestamp', true);

    // 페이지네이션
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    const sliced = Array.from(results).slice(offset, offset + limit);

    return sliced;
  }

  /**
   * 펜딩 트랜잭션 조회
   */
  async getPendingTransactions(
    address?: string,
    chainId?: number,
  ): Promise<TransactionCacheEntry[]> {
    const realm = await realmDB.getRealm();
    let query = 'status == "pending"';
    const params: (string | number)[] = [];

    if (address) {
      query += ` AND (from ==[c] $${params.length} OR to ==[c] $${params.length})`;
      params.push(address.toLowerCase());
    }

    if (chainId !== undefined) {
      query += ` AND chainId == $${params.length}`;
      params.push(chainId);
    }

    const results = realm
      .objects<TransactionCacheEntry>('TransactionCache')
      .filtered(query, ...params)
      .sorted('timestamp', true);

    return Array.from(results);
  }

  /**
   * 최근 트랜잭션 조회
   */
  async getRecent(
    address: string,
    chainId: number,
    limit: number = 10,
  ): Promise<TransactionCacheEntry[]> {
    return this.getByAddress(address, chainId, { limit });
  }

  /**
   * 트랜잭션 삭제
   */
  async delete(hash: string, chainId: number): Promise<boolean> {
    const realm = await realmDB.getRealm();
    const id = this.generateId(hash, chainId);
    const entry = realm.objectForPrimaryKey<TransactionCacheEntry>(
      'TransactionCache',
      id,
    );

    if (!entry) {
      return false;
    }

    realm.write(() => {
      realm.delete(entry);
    });

    logger.info(`Transaction deleted: ${hash}`);
    return true;
  }

  /**
   * 오래된 트랜잭션 정리 (기본 30일)
   */
  async cleanOld(daysOld: number = 30): Promise<number> {
    const realm = await realmDB.getRealm();
    const cutoffTimestamp =
      Math.floor(Date.now() / 1000) - daysOld * 24 * 60 * 60;

    const oldTransactions = realm
      .objects<TransactionCacheEntry>('TransactionCache')
      .filtered('timestamp < $0 AND status != "pending"', cutoffTimestamp);

    const count = oldTransactions.length;

    if (count > 0) {
      realm.write(() => {
        realm.delete(oldTransactions);
      });
      logger.info(`Cleaned ${count} old transactions`);
    }

    return count;
  }

  /**
   * 주소별 트랜잭션 수
   */
  async countByAddress(address: string, chainId?: number): Promise<number> {
    const realm = await realmDB.getRealm();
    const lowerAddress = address.toLowerCase();
    let query = 'from ==[c] $0 OR to ==[c] $0';
    const params: (string | number)[] = [lowerAddress];

    if (chainId !== undefined) {
      query += ` AND chainId == $1`;
      params.push(chainId);
    }

    return realm
      .objects<TransactionCacheEntry>('TransactionCache')
      .filtered(query, ...params).length;
  }

  /**
   * 모든 트랜잭션 캐시 삭제
   */
  async deleteAll(): Promise<void> {
    await realmDB.deleteAllOf('TransactionCache');
    logger.info('All transaction cache deleted');
  }
}

export const transactionCacheService = TransactionCacheService.getInstance();
