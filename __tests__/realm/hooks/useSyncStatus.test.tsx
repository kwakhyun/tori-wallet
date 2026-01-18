/**
 * 동기화 상태 훅 테스트
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 서비스 모킹
jest.mock('../../../src/realm/services', () => ({
  syncStatusService: {
    getSyncStatus: jest.fn().mockResolvedValue(null),
    getBalanceSnapshot: jest.fn().mockResolvedValue(null),
    getAllBalanceSnapshots: jest.fn().mockResolvedValue([]),
    getTotalPortfolioValue: jest.fn().mockResolvedValue(0),
    getLastSyncTime: jest.fn().mockResolvedValue(null),
    getCachedData: jest.fn().mockResolvedValue(null),
    needsSync: jest.fn().mockResolvedValue(true),
    startSync: jest.fn().mockResolvedValue(undefined),
    completeSync: jest.fn().mockResolvedValue(undefined),
    syncError: jest.fn().mockResolvedValue(undefined),
    saveBalanceSnapshot: jest.fn().mockResolvedValue(undefined),
    cacheData: jest.fn().mockResolvedValue(undefined),
  },
}));

import {
  useSyncStatus,
  useBalanceSnapshot,
  usePortfolioSnapshots,
  useLastSyncTime,
  useOfflineData,
} from '../../../src/realm/hooks/useSyncStatus';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useSyncStatus hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  describe('useSyncStatus', () => {
    it('should return sync status properties', async () => {
      const { result } = renderHook(
        () => useSyncStatus('balance', '0xabc', 1),
        { wrapper },
      );

      // 이 훅은 isLoading이 없고 isSyncing 사용
      expect('status' in result.current).toBe(true);
      expect('isSyncing' in result.current).toBe(true);
      expect('lastSyncAt' in result.current).toBe(true);
    });

    it('should return null status when no address', async () => {
      const { result } = renderHook(
        () => useSyncStatus('balance', undefined, 1),
        { wrapper },
      );

      expect(result.current.status).toBeNull();
    });
  });

  describe('useBalanceSnapshot', () => {
    it('should return balance snapshot properties', async () => {
      const { result } = renderHook(() => useBalanceSnapshot('0xabc', 1), {
        wrapper,
      });

      // useState 기반 훅이므로 act로 감싸서 비동기 업데이트 대기
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect('snapshot' in result.current).toBe(true);
      expect('lastBalance' in result.current).toBe(true);
      expect(typeof result.current.refetch).toBe('function');
    });

    it('should return null snapshot when no address', async () => {
      const { result } = renderHook(() => useBalanceSnapshot(undefined, 1), {
        wrapper,
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(result.current.snapshot).toBeNull();
    });
  });

  describe('usePortfolioSnapshots', () => {
    it('should return portfolio snapshots array', async () => {
      const { result } = renderHook(() => usePortfolioSnapshots('0xabc'), {
        wrapper,
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(Array.isArray(result.current.snapshots)).toBe(true);
    });

    it('should return empty array when no address', async () => {
      const { result } = renderHook(() => usePortfolioSnapshots(undefined), {
        wrapper,
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(result.current.snapshots).toEqual([]);
    });
  });

  describe('useLastSyncTime', () => {
    it('should return last sync time', () => {
      const { result } = renderHook(
        () => useLastSyncTime('balance', '0xabc', 1),
        { wrapper },
      );

      expect('lastSync' in result.current).toBe(true);
      expect('timeAgo' in result.current).toBe(true);
    });
  });

  describe('useOfflineData', () => {
    it('should return offline data properties', async () => {
      const onlineFetcher = jest.fn().mockResolvedValue({ data: 'online' });

      const { result } = renderHook(
        () => useOfflineData('balance', '0xabc', 1, onlineFetcher),
        { wrapper },
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect('data' in result.current).toBe(true);
      expect('isStale' in result.current).toBe(true);
      expect('lastSyncAt' in result.current).toBe(true);
      expect(typeof result.current.refetch).toBe('function');
    });
  });
});
