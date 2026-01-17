/**
 * 트랜잭션 캐시 관리 훅
 */

import { useState, useEffect, useCallback } from 'react';
import {
  transactionCacheService,
  type TransactionStatus,
  type TransactionType,
  type CreateTransactionInput,
} from '../services';
import type { TransactionCacheEntry } from '../schemas';

interface UseTransactionsOptions {
  chainId?: number;
  status?: TransactionStatus;
  type?: TransactionType;
  limit?: number;
}

/**
 * 트랜잭션 목록 훅
 */
export function useTransactions(
  address: string | undefined,
  options: UseTransactionsOptions = {},
) {
  const [transactions, setTransactions] = useState<TransactionCacheEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const loadTransactions = useCallback(
    async (offset = 0) => {
      if (!address) {
        setTransactions([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const result = await transactionCacheService.getByAddress(
          address,
          options.chainId,
          {
            limit: options.limit ?? 20,
            offset,
            status: options.status,
            type: options.type,
          },
        );

        if (offset === 0) {
          setTransactions(result);
        } else {
          setTransactions(prev => [...prev, ...result]);
        }

        setHasMore(result.length === (options.limit ?? 20));
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error('Failed to load transactions'),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [address, options.chainId, options.status, options.type, options.limit],
  );

  useEffect(() => {
    loadTransactions(0);
  }, [loadTransactions]);

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      loadTransactions(transactions.length);
    }
  }, [isLoading, hasMore, transactions.length, loadTransactions]);

  const refetch = useCallback(() => {
    loadTransactions(0);
  }, [loadTransactions]);

  return {
    transactions,
    isLoading,
    error,
    hasMore,
    loadMore,
    refetch,
  };
}

/**
 * 펜딩 트랜잭션 훅
 */
export function usePendingTransactions(
  address: string | undefined,
  chainId?: number,
) {
  const [pending, setPending] = useState<TransactionCacheEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPending = useCallback(async () => {
    if (!address) {
      setPending([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const result = await transactionCacheService.getPendingTransactions(
        address,
        chainId,
      );
      setPending(result);
    } catch {
      setPending([]);
    } finally {
      setIsLoading(false);
    }
  }, [address, chainId]);

  useEffect(() => {
    loadPending();

    // 5초마다 펜딩 상태 확인
    const interval = setInterval(loadPending, 5000);
    return () => clearInterval(interval);
  }, [loadPending]);

  const hasPending = pending.length > 0;

  return {
    pending,
    isLoading,
    hasPending,
    refetch: loadPending,
  };
}

/**
 * 단일 트랜잭션 조회 훅
 */
export function useTransaction(hash: string | undefined, chainId: number) {
  const [transaction, setTransaction] = useState<TransactionCacheEntry | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!hash) {
      setTransaction(null);
      setIsLoading(false);
      return;
    }

    const fetchTransaction = async () => {
      setIsLoading(true);
      try {
        const result = await transactionCacheService.getByHash(hash, chainId);
        setTransaction(result);
      } catch {
        setTransaction(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransaction();
  }, [hash, chainId]);

  return { transaction, isLoading };
}

/**
 * 트랜잭션 상태 추적 훅
 */
export function useTransactionStatus(
  hash: string | undefined,
  chainId: number,
) {
  const [status, setStatus] = useState<TransactionStatus>('pending');
  const [isConfirmed, setIsConfirmed] = useState(false);

  useEffect(() => {
    if (!hash) return;

    const checkStatus = async () => {
      const tx = await transactionCacheService.getByHash(hash, chainId);
      if (tx) {
        setStatus(tx.status);
        setIsConfirmed(tx.status === 'confirmed');
      }
    };

    checkStatus();

    // 펜딩 상태일 때만 폴링
    if (!isConfirmed) {
      const interval = setInterval(checkStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [hash, chainId, isConfirmed]);

  return { status, isConfirmed };
}

/**
 * 로컬 트랜잭션 생성 훅
 */
export function useCreateLocalTransaction() {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createTransaction = useCallback(
    async (input: CreateTransactionInput) => {
      setIsCreating(true);
      setError(null);

      try {
        const tx = await transactionCacheService.createLocalTransaction(input);
        return tx;
      } catch (err) {
        const txError =
          err instanceof Error
            ? err
            : new Error('Failed to create transaction');
        setError(txError);
        throw txError;
      } finally {
        setIsCreating(false);
      }
    },
    [],
  );

  return { createTransaction, isCreating, error };
}

/**
 * 최근 트랜잭션 훅 (간단한 버전)
 */
export function useRecentTransactions(
  address: string | undefined,
  chainId: number,
  limit = 5,
) {
  const [recent, setRecent] = useState<TransactionCacheEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!address) {
      setRecent([]);
      setIsLoading(false);
      return;
    }

    const fetchRecent = async () => {
      setIsLoading(true);
      try {
        const result = await transactionCacheService.getRecent(
          address,
          chainId,
          limit,
        );
        setRecent(result);
      } catch {
        setRecent([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecent();
  }, [address, chainId, limit]);

  return { recent, isLoading };
}
