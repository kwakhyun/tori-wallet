/**
 * 토큰 목록 관리 훅
 */

import { useState, useEffect, useCallback } from 'react';
import {
  tokenListService,
  type CreateTokenInput,
  type UpdateTokenInput,
} from '../services';
import type { TokenListEntry } from '../schemas';

/**
 * 표시 가능한 토큰 목록 훅
 */
export function useTokenList(chainId: number) {
  const [tokens, setTokens] = useState<TokenListEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadTokens = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await tokenListService.getVisibleTokens(chainId);
      setTokens(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load tokens'));
    } finally {
      setIsLoading(false);
    }
  }, [chainId]);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const hideToken = useCallback(
    async (address: string) => {
      const success = await tokenListService.hideToken(address, chainId);
      if (success) {
        await loadTokens();
      }
      return success;
    },
    [chainId, loadTokens],
  );

  const showToken = useCallback(
    async (address: string) => {
      const success = await tokenListService.showToken(address, chainId);
      if (success) {
        await loadTokens();
      }
      return success;
    },
    [chainId, loadTokens],
  );

  const markAsSpam = useCallback(
    async (address: string) => {
      const success = await tokenListService.markAsSpam(address, chainId);
      if (success) {
        await loadTokens();
      }
      return success;
    },
    [chainId, loadTokens],
  );

  return {
    tokens,
    isLoading,
    error,
    refetch: loadTokens,
    hideToken,
    showToken,
    markAsSpam,
  };
}

/**
 * 숨긴 토큰 목록 훅
 */
export function useHiddenTokens(chainId?: number) {
  const [tokens, setTokens] = useState<TokenListEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadHiddenTokens = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await tokenListService.getHiddenTokens(chainId);
      setTokens(result);
    } catch {
      setTokens([]);
    } finally {
      setIsLoading(false);
    }
  }, [chainId]);

  useEffect(() => {
    loadHiddenTokens();
  }, [loadHiddenTokens]);

  const unhideToken = useCallback(
    async (address: string, tokenChainId: number) => {
      const success = await tokenListService.showToken(address, tokenChainId);
      if (success) {
        await loadHiddenTokens();
      }
      return success;
    },
    [loadHiddenTokens],
  );

  return {
    tokens,
    isLoading,
    refetch: loadHiddenTokens,
    unhideToken,
  };
}

/**
 * 사용자 정의 토큰 목록 훅
 */
export function useCustomTokens(chainId?: number) {
  const [tokens, setTokens] = useState<TokenListEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadCustomTokens = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await tokenListService.getCustomTokens(chainId);
      setTokens(result);
    } catch {
      setTokens([]);
    } finally {
      setIsLoading(false);
    }
  }, [chainId]);

  useEffect(() => {
    loadCustomTokens();
  }, [loadCustomTokens]);

  const addCustomToken = useCallback(
    async (input: CreateTokenInput) => {
      const token = await tokenListService.addToken({
        ...input,
        isCustom: true,
      });
      await loadCustomTokens();
      return token;
    },
    [loadCustomTokens],
  );

  const removeCustomToken = useCallback(
    async (address: string, tokenChainId: number) => {
      const success = await tokenListService.deleteToken(address, tokenChainId);
      if (success) {
        await loadCustomTokens();
      }
      return success;
    },
    [loadCustomTokens],
  );

  return {
    tokens,
    isLoading,
    refetch: loadCustomTokens,
    addCustomToken,
    removeCustomToken,
  };
}

/**
 * 토큰 검색 훅
 */
export function useTokenSearch(query: string, chainId?: number) {
  const [results, setResults] = useState<TokenListEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const search = async () => {
      setIsSearching(true);
      try {
        const searchResults = await tokenListService.searchTokens(
          query,
          chainId,
        );
        setResults(searchResults);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [query, chainId]);

  return { results, isSearching };
}

/**
 * 잔액 스냅샷 훅 (오프라인 UX)
 */
export function useLastKnownBalances(chainId: number) {
  const [balances, setBalances] = useState<
    Map<string, { balance: string; price?: number }>
  >(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadBalances = async () => {
      try {
        setIsLoading(true);
        const result = await tokenListService.getLastKnownBalances(chainId);
        setBalances(result);
      } catch {
        setBalances(new Map());
      } finally {
        setIsLoading(false);
      }
    };

    loadBalances();
  }, [chainId]);

  return { balances, isLoading };
}

/**
 * 토큰 업데이트 훅
 */
export function useTokenUpdate() {
  const [isUpdating, setIsUpdating] = useState(false);

  const updateToken = useCallback(
    async (address: string, chainId: number, input: UpdateTokenInput) => {
      setIsUpdating(true);
      try {
        const result = await tokenListService.updateToken(
          address,
          chainId,
          input,
        );
        return result;
      } finally {
        setIsUpdating(false);
      }
    },
    [],
  );

  const updateBalanceSnapshot = useCallback(
    async (
      address: string,
      chainId: number,
      balance: string,
      balanceRaw: string,
      price?: number,
      priceChange24h?: number,
    ) => {
      await tokenListService.updateBalanceSnapshot(
        address,
        chainId,
        balance,
        balanceRaw,
        price,
        priceChange24h,
      );
    },
    [],
  );

  return {
    updateToken,
    updateBalanceSnapshot,
    isUpdating,
  };
}
