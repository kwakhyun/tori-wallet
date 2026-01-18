/**
 * 주소록 훅 테스트
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 서비스 모킹
jest.mock('../../../src/realm/services', () => ({
  addressBookService: {
    getAll: jest.fn().mockResolvedValue([]),
    getFavorites: jest.fn().mockResolvedValue([]),
    search: jest.fn().mockResolvedValue([]),
    getByAddress: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue(true),
    toggleFavorite: jest.fn().mockResolvedValue(true),
  },
}));

import {
  useAddressBook,
  useFavoriteAddresses,
  useAddressSearch,
  useAddressName,
} from '../../../src/realm/hooks/useAddressBook';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useAddressBook hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  describe('useAddressBook', () => {
    it('should return addresses array', async () => {
      const { result } = renderHook(() => useAddressBook(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(Array.isArray(result.current.addresses)).toBe(true);
    });

    it('should have addAddress function', async () => {
      const { result } = renderHook(() => useAddressBook(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.addAddress).toBe('function');
    });

    it('should have updateAddress function', async () => {
      const { result } = renderHook(() => useAddressBook(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.updateAddress).toBe('function');
    });

    it('should have deleteAddress function', async () => {
      const { result } = renderHook(() => useAddressBook(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.deleteAddress).toBe('function');
    });

    it('should have toggleFavorite function', async () => {
      const { result } = renderHook(() => useAddressBook(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.toggleFavorite).toBe('function');
    });

    it('should have refetch function', async () => {
      const { result } = renderHook(() => useAddressBook(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.refetch).toBe('function');
    });
  });

  describe('useFavoriteAddresses', () => {
    it('should return favorites array', async () => {
      const { result } = renderHook(() => useFavoriteAddresses(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(Array.isArray(result.current.favorites)).toBe(true);
    });
  });

  describe('useAddressSearch', () => {
    it('should return results array', async () => {
      const { result } = renderHook(() => useAddressSearch('test'), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isSearching).toBe(false);
      });

      expect(Array.isArray(result.current.results)).toBe(true);
    });

    it('should return empty array for empty query', async () => {
      const { result } = renderHook(() => useAddressSearch(''), { wrapper });

      expect(result.current.results).toEqual([]);
    });
  });

  describe('useAddressName', () => {
    it('should return name property', async () => {
      const { result } = renderHook(
        () => useAddressName('0x1234567890123456789012345678901234567890'),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect('name' in result.current).toBe(true);
    });

    it('should return null for undefined address', async () => {
      const { result } = renderHook(() => useAddressName(undefined), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.name).toBeNull();
    });
  });
});
