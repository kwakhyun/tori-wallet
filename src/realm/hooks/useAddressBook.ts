/**
 * Tori Wallet - Realm Hooks for Address Book
 */

import { useState, useEffect, useCallback } from 'react';
import {
  addressBookService,
  type CreateAddressInput,
  type UpdateAddressInput,
} from '../services';
import type { AddressBookEntry } from '../schemas';

/**
 * 주소록 목록 훅
 */
export function useAddressBook() {
  const [addresses, setAddresses] = useState<AddressBookEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadAddresses = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await addressBookService.getAll();
      setAddresses(result);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error('Failed to load addresses'),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const addAddress = useCallback(
    async (input: CreateAddressInput) => {
      const newAddress = await addressBookService.create(input);
      await loadAddresses();
      return newAddress;
    },
    [loadAddresses],
  );

  const updateAddress = useCallback(
    async (id: string, input: UpdateAddressInput) => {
      const updated = await addressBookService.update(id, input);
      await loadAddresses();
      return updated;
    },
    [loadAddresses],
  );

  const deleteAddress = useCallback(
    async (id: string) => {
      const success = await addressBookService.delete(id);
      if (success) {
        await loadAddresses();
      }
      return success;
    },
    [loadAddresses],
  );

  const toggleFavorite = useCallback(
    async (id: string) => {
      const isFavorite = await addressBookService.toggleFavorite(id);
      await loadAddresses();
      return isFavorite;
    },
    [loadAddresses],
  );

  return {
    addresses,
    isLoading,
    error,
    refetch: loadAddresses,
    addAddress,
    updateAddress,
    deleteAddress,
    toggleFavorite,
  };
}

/**
 * 즐겨찾기 주소 훅
 */
export function useFavoriteAddresses() {
  const [favorites, setFavorites] = useState<AddressBookEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadFavorites = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await addressBookService.getFavorites();
      setFavorites(result);
    } catch {
      setFavorites([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  return {
    favorites,
    isLoading,
    refetch: loadFavorites,
  };
}

/**
 * 주소 검색 훅
 */
export function useAddressSearch(query: string) {
  const [results, setResults] = useState<AddressBookEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const search = async () => {
      setIsSearching(true);
      try {
        const searchResults = await addressBookService.search(query);
        setResults(searchResults);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    // 디바운스
    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return { results, isSearching };
}

/**
 * 주소로 이름 조회 훅
 */
export function useAddressName(address: string | undefined) {
  const [name, setName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setName(null);
      return;
    }

    const fetchName = async () => {
      setIsLoading(true);
      try {
        const entry = await addressBookService.getByAddress(address);
        setName(entry?.name ?? null);
      } catch {
        setName(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchName();
  }, [address]);

  return { name, isLoading };
}
