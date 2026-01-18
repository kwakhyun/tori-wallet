/**
 * 토큰 목록 훅 테스트
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 서비스 모킹
jest.mock('../../../src/realm/services', () => ({
  tokenListService: {
    getTokens: jest.fn().mockResolvedValue([]),
    getHiddenTokens: jest.fn().mockResolvedValue([]),
    getCustomTokens: jest.fn().mockResolvedValue([]),
    searchTokens: jest.fn().mockResolvedValue([]),
    getTokensWithLastBalance: jest.fn().mockResolvedValue([]),
    addCustomToken: jest.fn().mockResolvedValue({}),
    hideToken: jest.fn().mockResolvedValue(true),
    showToken: jest.fn().mockResolvedValue(true),
    updateTokenBalance: jest.fn().mockResolvedValue(undefined),
  },
}));

import {
  useTokenList,
  useHiddenTokens,
  useCustomTokens,
  useTokenSearch,
  useLastKnownBalances,
  useTokenUpdate,
} from '../../../src/realm/hooks/useTokenList';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useTokenList hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  describe('useTokenList', () => {
    it('should return tokens array', async () => {
      const { result } = renderHook(() => useTokenList(1), { wrapper });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(Array.isArray(result.current.tokens)).toBe(true);
    });

    it('should have refetch function', async () => {
      const { result } = renderHook(() => useTokenList(1), { wrapper });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(typeof result.current.refetch).toBe('function');
    });
  });

  describe('useHiddenTokens', () => {
    it('should return hidden tokens array', async () => {
      const { result } = renderHook(() => useHiddenTokens(1), { wrapper });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(Array.isArray(result.current.tokens)).toBe(true);
    });

    it('should work without chainId', async () => {
      const { result } = renderHook(() => useHiddenTokens(), { wrapper });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(Array.isArray(result.current.tokens)).toBe(true);
    });
  });

  describe('useCustomTokens', () => {
    it('should return custom tokens array', async () => {
      const { result } = renderHook(() => useCustomTokens(1), { wrapper });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(Array.isArray(result.current.tokens)).toBe(true);
    });

    it('should have addCustomToken function', async () => {
      const { result } = renderHook(() => useCustomTokens(1), { wrapper });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(typeof result.current.addCustomToken).toBe('function');
    });
  });

  describe('useTokenSearch', () => {
    it('should return search results', async () => {
      const { result } = renderHook(() => useTokenSearch('ETH'), { wrapper });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(Array.isArray(result.current.results)).toBe(true);
    });

    it('should return empty array for empty query', async () => {
      const { result } = renderHook(() => useTokenSearch(''), { wrapper });

      expect(result.current.results).toEqual([]);
    });
  });

  describe('useLastKnownBalances', () => {
    it('should return balances map', async () => {
      const { result } = renderHook(() => useLastKnownBalances(1), { wrapper });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(result.current.balances).toBeInstanceOf(Map);
    });
  });

  describe('useTokenUpdate', () => {
    it('should return update functions', () => {
      const { result } = renderHook(() => useTokenUpdate(), { wrapper });

      expect(typeof result.current.updateToken).toBe('function');
      expect(typeof result.current.updateBalanceSnapshot).toBe('function');
      expect(typeof result.current.isUpdating).toBe('boolean');
    });
  });
});
