/**
 * 주소록 훅 테스트
 */

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
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
import { addressBookService } from '../../../src/realm/services';

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

  describe('cross-hook refresh', () => {
    const mockedService = addressBookService as jest.Mocked<
      typeof addressBookService
    >;

    it('refreshes the favorites list after toggling a favorite', async () => {
      const entry = {
        id: 'a',
        address: '0x1111111111111111111111111111111111111111',
        name: 'Alice',
        chainId: 1,
        isFavorite: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockedService.getAll.mockResolvedValue([entry]);
      mockedService.getFavorites.mockResolvedValueOnce([]);
      const { result } = renderHook(
        () => ({ book: useAddressBook(), favorites: useFavoriteAddresses() }),
        { wrapper },
      );
      await waitFor(() =>
        expect(result.current.favorites.isLoading).toBe(false),
      );
      expect(result.current.favorites.favorites).toEqual([]);

      mockedService.getFavorites.mockResolvedValueOnce([
        { ...entry, isFavorite: true },
      ]);
      await act(async () => {
        await result.current.book.toggleFavorite('a');
      });

      expect(mockedService.getFavorites).toHaveBeenCalledTimes(2);
      expect(result.current.favorites.favorites).toHaveLength(1);
    });

    it('refreshes saved names after an address is edited', async () => {
      mockedService.getByAddress.mockResolvedValueOnce(null);
      const { result } = renderHook(
        () => ({
          book: useAddressBook(),
          name: useAddressName('0x3333333333333333333333333333333333333333'),
        }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.name.isLoading).toBe(false));
      expect(result.current.name.name).toBeNull();

      mockedService.getByAddress.mockResolvedValue({ name: 'Carol' } as never);
      await act(async () => {
        await result.current.book.updateAddress('c', {
          address: '0x3333333333333333333333333333333333333333',
        });
      });
      await waitFor(() => expect(result.current.name.name).toBe('Carol'));
      expect(mockedService.update).toHaveBeenCalledWith('c', {
        address: '0x3333333333333333333333333333333333333333',
      });
    });
  });
});
