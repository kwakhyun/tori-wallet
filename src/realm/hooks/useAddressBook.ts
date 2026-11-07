/**
 * 주소록 관리 훅
 */

import { useState, useEffect, useCallback } from 'react';
import {
  addressBookService,
  type CreateAddressInput,
  type UpdateAddressInput,
} from '../services';
import type { AddressBookEntry } from '../schemas';

/**
 * 주소록 변경 알림
 *
 * 화면마다 별도로 조회하는 훅(주소록/즐겨찾기/검색/이름 조회)이 같은 데이터를 보도록
 * 쓰기 작업 후 모든 구독 훅에 다시 불러오라고 알린다.
 */
type ChangeListener = () => void | Promise<void>;
const changeListeners = new Set<ChangeListener>();

export async function notifyAddressBookChanged(): Promise<void> {
  await Promise.all([...changeListeners].map(listener => listener()));
}

function useAddressBookChanges(listener: ChangeListener): void {
  useEffect(() => {
    changeListeners.add(listener);
    return () => {
      changeListeners.delete(listener);
    };
  }, [listener]);
}

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

  useAddressBookChanges(loadAddresses);

  const addAddress = useCallback(async (input: CreateAddressInput) => {
    const newAddress = await addressBookService.create(input);
    await notifyAddressBookChanged();
    return newAddress;
  }, []);

  const updateAddress = useCallback(
    async (id: string, input: UpdateAddressInput) => {
      const updated = await addressBookService.update(id, input);
      await notifyAddressBookChanged();
      return updated;
    },
    [],
  );

  const deleteAddress = useCallback(async (id: string) => {
    const success = await addressBookService.delete(id);
    if (success) await notifyAddressBookChanged();
    return success;
  }, []);

  const toggleFavorite = useCallback(async (id: string) => {
    const isFavorite = await addressBookService.toggleFavorite(id);
    // 즐겨찾기 탭(useFavoriteAddresses)도 함께 갱신된다.
    await notifyAddressBookChanged();
    return isFavorite;
  }, []);

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

  useAddressBookChanges(loadFavorites);

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
  const [revision, setRevision] = useState(0);
  const bump = useCallback(() => setRevision(value => value + 1), []);
  useAddressBookChanges(bump);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    const search = async () => {
      setIsSearching(true);
      try {
        const searchResults = await addressBookService.search(trimmed);
        if (!cancelled) setResults(searchResults);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    };

    // 디바운스
    const timer = setTimeout(search, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, revision]);

  return { results, isSearching };
}

/**
 * 주소로 이름 조회 훅
 */
export function useAddressName(address: string | undefined) {
  const [name, setName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const bump = useCallback(() => setRevision(value => value + 1), []);
  useAddressBookChanges(bump);

  useEffect(() => {
    if (!address) {
      setName(null);
      return;
    }

    let cancelled = false;
    const fetchName = async () => {
      setIsLoading(true);
      try {
        const entry = await addressBookService.getByAddress(address);
        if (!cancelled) setName(entry?.name ?? null);
      } catch {
        if (!cancelled) setName(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchName();
    return () => {
      cancelled = true;
    };
  }, [address, revision]);

  return { name, isLoading };
}
