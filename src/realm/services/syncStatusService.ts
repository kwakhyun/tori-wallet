/**
 * Tori Wallet - Sync Status Service (Realm)
 * 동기화 상태 관리 및 오프라인 UX 지원
 */

import { realmDB } from '../database';
import type { SyncStatusEntry, BalanceSnapshotEntry } from '../schemas';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SyncStatus');

export type SyncType = 'balance' | 'tokens' | 'transactions' | 'nfts';
export type SyncState = 'synced' | 'syncing' | 'error';

export interface BalanceSnapshot {
  address: string;
  chainId: number;
  nativeBalance: string;
  nativeBalanceWei: string;
  nativePrice?: number;
  totalValueUsd?: number;
}

class SyncStatusService {
  private static instance: SyncStatusService;

  private constructor() {}

  static getInstance(): SyncStatusService {
    if (!SyncStatusService.instance) {
      SyncStatusService.instance = new SyncStatusService();
    }
    return SyncStatusService.instance;
  }

  /**
   * 동기화 상태 키 생성
   */
  private generateKey(
    type: SyncType,
    address: string,
    chainId: number,
  ): string {
    return `${type}-${address.toLowerCase()}-${chainId}`;
  }

  // ============================================================================
  // Sync Status
  // ============================================================================

  /**
   * 동기화 시작
   */
  async startSync(
    type: SyncType,
    address: string,
    chainId: number,
  ): Promise<void> {
    const realm = await realmDB.getRealm();
    const key = this.generateKey(type, address, chainId);
    const now = new Date();

    const existing = realm.objectForPrimaryKey<SyncStatusEntry>(
      'SyncStatus',
      key,
    );

    realm.write(() => {
      if (existing) {
        existing.status = 'syncing';
        existing.lastSyncAt = now;
        existing.errorMessage = undefined;
      } else {
        realm.create<SyncStatusEntry>('SyncStatus', {
          key,
          type,
          address: address.toLowerCase(),
          chainId,
          lastSyncAt: now,
          status: 'syncing',
        });
      }
    });

    logger.debug(`Sync started: ${type} for ${address} on chain ${chainId}`);
  }

  /**
   * 동기화 완료
   */
  async completeSync(
    type: SyncType,
    address: string,
    chainId: number,
    data?: unknown,
  ): Promise<void> {
    const realm = await realmDB.getRealm();
    const key = this.generateKey(type, address, chainId);
    const now = new Date();

    const existing = realm.objectForPrimaryKey<SyncStatusEntry>(
      'SyncStatus',
      key,
    );

    realm.write(() => {
      if (existing) {
        existing.status = 'synced';
        existing.lastSyncAt = now;
        existing.errorMessage = undefined;
        if (data !== undefined) {
          existing.data = JSON.stringify(data);
        }
      } else {
        realm.create<SyncStatusEntry>('SyncStatus', {
          key,
          type,
          address: address.toLowerCase(),
          chainId,
          lastSyncAt: now,
          status: 'synced',
          data: data ? JSON.stringify(data) : undefined,
        });
      }
    });

    logger.debug(`Sync completed: ${type} for ${address} on chain ${chainId}`);
  }

  /**
   * 동기화 에러
   */
  async syncError(
    type: SyncType,
    address: string,
    chainId: number,
    errorMessage: string,
  ): Promise<void> {
    const realm = await realmDB.getRealm();
    const key = this.generateKey(type, address, chainId);
    const now = new Date();

    const existing = realm.objectForPrimaryKey<SyncStatusEntry>(
      'SyncStatus',
      key,
    );

    realm.write(() => {
      if (existing) {
        existing.status = 'error';
        existing.lastSyncAt = now;
        existing.errorMessage = errorMessage;
      } else {
        realm.create<SyncStatusEntry>('SyncStatus', {
          key,
          type,
          address: address.toLowerCase(),
          chainId,
          lastSyncAt: now,
          status: 'error',
          errorMessage,
        });
      }
    });

    logger.warn(`Sync error: ${type} - ${errorMessage}`);
  }

  /**
   * 동기화 상태 조회
   */
  async getSyncStatus(
    type: SyncType,
    address: string,
    chainId: number,
  ): Promise<SyncStatusEntry | null> {
    const realm = await realmDB.getRealm();
    const key = this.generateKey(type, address, chainId);
    return (
      realm.objectForPrimaryKey<SyncStatusEntry>('SyncStatus', key) ?? null
    );
  }

  /**
   * 마지막 동기화 시간 조회
   */
  async getLastSyncTime(
    type: SyncType,
    address: string,
    chainId: number,
  ): Promise<Date | null> {
    const status = await this.getSyncStatus(type, address, chainId);
    return status?.lastSyncAt ?? null;
  }

  /**
   * 동기화 필요 여부 확인 (기본 1분)
   */
  async needsSync(
    type: SyncType,
    address: string,
    chainId: number,
    maxAgeMs: number = 60000,
  ): Promise<boolean> {
    const status = await this.getSyncStatus(type, address, chainId);

    if (!status) {
      return true;
    }

    const age = Date.now() - status.lastSyncAt.getTime();
    return age > maxAgeMs || status.status === 'error';
  }

  /**
   * 캐시된 데이터 조회
   */
  async getCachedData<T>(
    type: SyncType,
    address: string,
    chainId: number,
  ): Promise<T | null> {
    const status = await this.getSyncStatus(type, address, chainId);

    if (!status?.data) {
      return null;
    }

    try {
      return JSON.parse(status.data) as T;
    } catch {
      return null;
    }
  }

  /**
   * 주소별 모든 동기화 상태
   */
  async getAllSyncStatuses(address: string): Promise<SyncStatusEntry[]> {
    const realm = await realmDB.getRealm();
    const results = realm
      .objects<SyncStatusEntry>('SyncStatus')
      .filtered('address ==[c] $0', address.toLowerCase());

    return Array.from(results);
  }

  // ============================================================================
  // Balance Snapshots
  // ============================================================================

  /**
   * 잔액 스냅샷 ID 생성
   */
  private generateSnapshotId(address: string, chainId: number): string {
    return `${address.toLowerCase()}-${chainId}`;
  }

  /**
   * 잔액 스냅샷 저장
   */
  async saveBalanceSnapshot(snapshot: BalanceSnapshot): Promise<void> {
    const realm = await realmDB.getRealm();
    const id = this.generateSnapshotId(snapshot.address, snapshot.chainId);
    const now = new Date();

    const existing = realm.objectForPrimaryKey<BalanceSnapshotEntry>(
      'BalanceSnapshot',
      id,
    );

    realm.write(() => {
      if (existing) {
        existing.nativeBalance = snapshot.nativeBalance;
        existing.nativeBalanceWei = snapshot.nativeBalanceWei;
        existing.nativePrice = snapshot.nativePrice;
        existing.totalValueUsd = snapshot.totalValueUsd;
        existing.lastSyncAt = now;
      } else {
        realm.create<BalanceSnapshotEntry>('BalanceSnapshot', {
          id,
          address: snapshot.address.toLowerCase(),
          chainId: snapshot.chainId,
          nativeBalance: snapshot.nativeBalance,
          nativeBalanceWei: snapshot.nativeBalanceWei,
          nativePrice: snapshot.nativePrice,
          totalValueUsd: snapshot.totalValueUsd,
          lastSyncAt: now,
        });
      }
    });

    logger.debug(
      `Balance snapshot saved for ${snapshot.address} on chain ${snapshot.chainId}`,
    );
  }

  /**
   * 잔액 스냅샷 조회
   */
  async getBalanceSnapshot(
    address: string,
    chainId: number,
  ): Promise<BalanceSnapshotEntry | null> {
    const realm = await realmDB.getRealm();
    const id = this.generateSnapshotId(address, chainId);
    return (
      realm.objectForPrimaryKey<BalanceSnapshotEntry>('BalanceSnapshot', id) ??
      null
    );
  }

  /**
   * 주소별 모든 잔액 스냅샷
   */
  async getAllBalanceSnapshots(
    address: string,
  ): Promise<BalanceSnapshotEntry[]> {
    const realm = await realmDB.getRealm();
    const results = realm
      .objects<BalanceSnapshotEntry>('BalanceSnapshot')
      .filtered('address ==[c] $0', address.toLowerCase());

    return Array.from(results);
  }

  /**
   * 총 포트폴리오 가치 (캐시된)
   */
  async getTotalPortfolioValue(address: string): Promise<number> {
    const snapshots = await this.getAllBalanceSnapshots(address);
    return snapshots.reduce((total, s) => total + (s.totalValueUsd ?? 0), 0);
  }

  /**
   * 마지막 잔액 업데이트 시간
   */
  async getLastBalanceUpdate(
    address: string,
    chainId: number,
  ): Promise<Date | null> {
    const snapshot = await this.getBalanceSnapshot(address, chainId);
    return snapshot?.lastSyncAt ?? null;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * 주소별 동기화 상태 삭제
   */
  async clearSyncStatus(address: string): Promise<void> {
    const realm = await realmDB.getRealm();
    const statuses = realm
      .objects<SyncStatusEntry>('SyncStatus')
      .filtered('address ==[c] $0', address.toLowerCase());

    realm.write(() => {
      realm.delete(statuses);
    });

    logger.info(`Cleared sync status for ${address}`);
  }

  /**
   * 주소별 잔액 스냅샷 삭제
   */
  async clearBalanceSnapshots(address: string): Promise<void> {
    const realm = await realmDB.getRealm();
    const snapshots = realm
      .objects<BalanceSnapshotEntry>('BalanceSnapshot')
      .filtered('address ==[c] $0', address.toLowerCase());

    realm.write(() => {
      realm.delete(snapshots);
    });

    logger.info(`Cleared balance snapshots for ${address}`);
  }

  /**
   * 모든 동기화 상태 삭제
   */
  async deleteAllSyncStatus(): Promise<void> {
    await realmDB.deleteAllOf('SyncStatus');
    logger.info('All sync status deleted');
  }

  /**
   * 모든 잔액 스냅샷 삭제
   */
  async deleteAllBalanceSnapshots(): Promise<void> {
    await realmDB.deleteAllOf('BalanceSnapshot');
    logger.info('All balance snapshots deleted');
  }
}

export const syncStatusService = SyncStatusService.getInstance();
