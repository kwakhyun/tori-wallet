/**
 * 트랜잭션 캐시 훅 테스트
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 트랜잭션 서비스 모킹 (데이터 없이 함수만 모킹)
jest.mock('../../../src/realm/services', () => ({
  transactionCacheService: {
    getByAddress: jest.fn(),
    getPendingTransactions: jest.fn(),
    getByHash: jest.fn(),
    updateStatus: jest.fn(),
    createLocalTransaction: jest.fn(),
    getRecent: jest.fn(),
  },
}));

import {
  useTransactions,
  usePendingTransactions,
  useTransaction,
  useCreateLocalTransaction,
  useRecentTransactions,
} from '../../../src/realm/hooks/useTransactionCache';
import { transactionCacheService } from '../../../src/realm/services';

const mockTransaction = {
  id: 'tx-1',
  hash: '0x123',
  chainId: 1,
  from: '0xabc',
  to: '0xdef',
  value: '1000000000000000000',
  status: 'confirmed',
  type: 'send',
  timestamp: Date.now(),
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useTransactionCache hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    // 기본 모킹 값 설정
    (transactionCacheService.getByAddress as jest.Mock).mockResolvedValue([
      mockTransaction,
    ]);
    (
      transactionCacheService.getPendingTransactions as jest.Mock
    ).mockResolvedValue([]);
    (transactionCacheService.getByHash as jest.Mock).mockResolvedValue(
      mockTransaction,
    );
    (
      transactionCacheService.createLocalTransaction as jest.Mock
    ).mockResolvedValue(mockTransaction);
    (transactionCacheService.getRecent as jest.Mock).mockResolvedValue([
      mockTransaction,
    ]);
  });

  describe('useTransactions', () => {
    it('should return empty array when no address', async () => {
      const { result } = renderHook(() => useTransactions(undefined), {
        wrapper,
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(result.current.transactions).toEqual([]);
    });

    it('should load transactions for address', async () => {
      renderHook(() => useTransactions('0xabc'), {
        wrapper,
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(transactionCacheService.getByAddress).toHaveBeenCalled();
    });

    it('should have refetch function', async () => {
      const { result } = renderHook(() => useTransactions('0xabc'), {
        wrapper,
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(typeof result.current.refetch).toBe('function');
    });

    it('should have loadMore function', async () => {
      const { result } = renderHook(() => useTransactions('0xabc'), {
        wrapper,
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(typeof result.current.loadMore).toBe('function');
    });
  });

  describe('usePendingTransactions', () => {
    it('should return empty array when no address', async () => {
      const { result } = renderHook(() => usePendingTransactions(undefined), {
        wrapper,
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(result.current.pending).toEqual([]);
    });

    it('should load pending transactions', async () => {
      renderHook(() => usePendingTransactions('0xabc'), {
        wrapper,
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(transactionCacheService.getPendingTransactions).toHaveBeenCalled();
    });

    it('should have hasPending property', async () => {
      const { result } = renderHook(() => usePendingTransactions('0xabc'), {
        wrapper,
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(typeof result.current.hasPending).toBe('boolean');
    });
  });

  describe('useTransaction', () => {
    it('should return null when no hash', async () => {
      const { result } = renderHook(() => useTransaction(undefined, 1), {
        wrapper,
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(result.current.transaction).toBeNull();
    });

    it('should load transaction by hash', async () => {
      renderHook(() => useTransaction('0x123', 1), {
        wrapper,
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(transactionCacheService.getByHash).toHaveBeenCalledWith(
        '0x123',
        1,
      );
    });
  });

  describe('useCreateLocalTransaction', () => {
    it('should return createTransaction function', () => {
      const { result } = renderHook(() => useCreateLocalTransaction(), {
        wrapper,
      });

      expect(typeof result.current.createTransaction).toBe('function');
      expect(typeof result.current.isCreating).toBe('boolean');
    });

    it('should call createLocalTransaction when createTransaction is called', async () => {
      const { result } = renderHook(() => useCreateLocalTransaction(), {
        wrapper,
      });

      const txInput = {
        hash: '0x456',
        chainId: 1,
        from: '0xabc',
        to: '0xdef',
        value: '1.0',
        valueWei: '1000000000000000000',
        type: 'send' as const,
        gasPrice: '20000000000',
        gasLimit: '21000',
        nonce: 0,
      };

      await act(async () => {
        await result.current.createTransaction(txInput);
      });

      expect(transactionCacheService.createLocalTransaction).toHaveBeenCalled();
    });
  });

  describe('useRecentTransactions', () => {
    it('should return empty array when no address', async () => {
      const { result } = renderHook(() => useRecentTransactions(undefined, 1), {
        wrapper,
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(result.current.recent).toEqual([]);
    });

    it('should load recent transactions', async () => {
      renderHook(() => useRecentTransactions('0xabc', 1, 10), {
        wrapper,
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(transactionCacheService.getRecent).toHaveBeenCalled();
    });
  });
});
