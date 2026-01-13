/**
 * Tori Wallet - Realm Hooks for Sync Status
 */

import { useState, useEffect, useCallback } from 'react';
import {
  syncStatusService,
  type SyncType,
  type BalanceSnapshot,
} from '../services';
import type { BalanceSnapshotEntry, SyncStatusEntry } from '../schemas';

/**
 * 동기화 상태 훅
 */
export function useSyncStatus(
  type: SyncType,
  address: string | undefined,
  chainId: number,
) {
  const [status, setStatus] = useState<SyncStatusEntry | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [needsSync, setNeedsSync] = useState(true);

  useEffect(() => {
    if (!address) {
      setStatus(null);
      return;
    }

    const checkStatus = async () => {
      const syncStatus = await syncStatusService.getSyncStatus(
        type,
        address,
        chainId,
      );
      setStatus(syncStatus);
      setIsSyncing(syncStatus?.status === 'syncing');

      const needs = await syncStatusService.needsSync(type, address, chainId);
      setNeedsSync(needs);
    };

    checkStatus();
  }, [type, address, chainId]);

  const startSync = useCallback(async () => {
    if (!address) return;
    await syncStatusService.startSync(type, address, chainId);
    setIsSyncing(true);
    setNeedsSync(false);
  }, [type, address, chainId]);

  const completeSync = useCallback(
    async (data?: unknown) => {
      if (!address) return;
      await syncStatusService.completeSync(type, address, chainId, data);
      setIsSyncing(false);

      const newStatus = await syncStatusService.getSyncStatus(
        type,
        address,
        chainId,
      );
      setStatus(newStatus);
    },
    [type, address, chainId],
  );

  const syncError = useCallback(
    async (errorMessage: string) => {
      if (!address) return;
      await syncStatusService.syncError(type, address, chainId, errorMessage);
      setIsSyncing(false);

      const newStatus = await syncStatusService.getSyncStatus(
        type,
        address,
        chainId,
      );
      setStatus(newStatus);
    },
    [type, address, chainId],
  );

  return {
    status,
    isSyncing,
    needsSync,
    lastSyncAt: status?.lastSyncAt ?? null,
    hasError: status?.status === 'error',
    errorMessage: status?.errorMessage ?? null,
    startSync,
    completeSync,
    syncError,
  };
}

/**
 * 잔액 스냅샷 훅
 */
export function useBalanceSnapshot(
  address: string | undefined,
  chainId: number,
) {
  const [snapshot, setSnapshot] = useState<BalanceSnapshotEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSnapshot = useCallback(async () => {
    if (!address) {
      setSnapshot(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const result = await syncStatusService.getBalanceSnapshot(
        address,
        chainId,
      );
      setSnapshot(result);
    } catch {
      setSnapshot(null);
    } finally {
      setIsLoading(false);
    }
  }, [address, chainId]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const saveSnapshot = useCallback(
    async (data: Omit<BalanceSnapshot, 'address' | 'chainId'>) => {
      if (!address) return;

      await syncStatusService.saveBalanceSnapshot({
        address,
        chainId,
        ...data,
      });

      await loadSnapshot();
    },
    [address, chainId, loadSnapshot],
  );

  return {
    snapshot,
    isLoading,
    refetch: loadSnapshot,
    saveSnapshot,
    lastBalance: snapshot?.nativeBalance ?? null,
    lastPrice: snapshot?.nativePrice ?? null,
    totalValueUsd: snapshot?.totalValueUsd ?? null,
    lastSyncAt: snapshot?.lastSyncAt ?? null,
  };
}

/**
 * 전체 포트폴리오 잔액 스냅샷 훅
 */
export function usePortfolioSnapshots(address: string | undefined) {
  const [snapshots, setSnapshots] = useState<BalanceSnapshotEntry[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!address) {
      setSnapshots([]);
      setTotalValue(0);
      setIsLoading(false);
      return;
    }

    const loadSnapshots = async () => {
      try {
        setIsLoading(true);
        const result = await syncStatusService.getAllBalanceSnapshots(address);
        setSnapshots(result);

        const total = await syncStatusService.getTotalPortfolioValue(address);
        setTotalValue(total);
      } catch {
        setSnapshots([]);
        setTotalValue(0);
      } finally {
        setIsLoading(false);
      }
    };

    loadSnapshots();
  }, [address]);

  return {
    snapshots,
    totalValue,
    isLoading,
  };
}

/**
 * 마지막 동기화 시간 훅
 */
export function useLastSyncTime(
  type: SyncType,
  address: string | undefined,
  chainId: number,
) {
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    if (!address) {
      setLastSync(null);
      return;
    }

    const fetchLastSync = async () => {
      const time = await syncStatusService.getLastSyncTime(
        type,
        address,
        chainId,
      );
      setLastSync(time);
    };

    fetchLastSync();
  }, [type, address, chainId]);

  // 사람이 읽기 쉬운 형식
  const timeAgo = lastSync ? getTimeAgo(lastSync) : null;

  return { lastSync, timeAgo };
}

/**
 * 시간 경과 표시 유틸
 */
function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) {
    return '방금 전';
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}분 전`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}시간 전`;
  }

  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

/**
 * 오프라인 감지 훅
 */
export function useOfflineData<T>(
  type: SyncType,
  address: string | undefined,
  chainId: number,
  fetchFn: () => Promise<T>,
): {
  data: T | null;
  isLoading: boolean;
  isStale: boolean;
  lastSyncAt: Date | null;
  refetch: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    if (!address) {
      setData(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      // 먼저 캐시된 데이터 확인
      const cached = await syncStatusService.getCachedData<T>(
        type,
        address,
        chainId,
      );
      if (cached) {
        setData(cached);
        const status = await syncStatusService.getSyncStatus(
          type,
          address,
          chainId,
        );
        setLastSyncAt(status?.lastSyncAt ?? null);
      }

      // 새 데이터 fetch 시도
      await syncStatusService.startSync(type, address, chainId);
      const freshData = await fetchFn();
      setData(freshData);
      await syncStatusService.completeSync(type, address, chainId, freshData);
      setIsStale(false);

      const status = await syncStatusService.getSyncStatus(
        type,
        address,
        chainId,
      );
      setLastSyncAt(status?.lastSyncAt ?? null);
    } catch {
      // 네트워크 오류시 캐시된 데이터 사용
      const cached = await syncStatusService.getCachedData<T>(
        type,
        address,
        chainId,
      );
      if (cached) {
        setData(cached);
        setIsStale(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [type, address, chainId, fetchFn]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    data,
    isLoading,
    isStale,
    lastSyncAt,
    refetch: loadData,
  };
}
