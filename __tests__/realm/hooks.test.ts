/**
 * Tori Wallet - Realm Hooks Tests
 *
 * 이 테스트는 Realm hooks의 인터페이스와 타입을 검증합니다.
 * Jest mock hoisting 문제를 해결하기 위해 jest.mock 내부에서 mock을 정의합니다.
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';

// Jest mock - hoisting 문제를 해결하기 위해 factory 함수 내부에서 mock 정의
jest.mock('../../src/realm/services', () => {
  const mockAddressBookServiceInternal = {
    getAll: jest.fn(() =>
      Promise.resolve([
        {
          id: 'test-1',
          address: '0x1234567890123456789012345678901234567890',
          name: 'Test Wallet',
          chainId: 1,
          isFavorite: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    ),
    getFavorites: jest.fn(() => Promise.resolve([])),
    search: jest.fn(() => Promise.resolve([])),
    getByAddress: jest.fn(() => Promise.resolve(null)),
    create: jest.fn(() =>
      Promise.resolve({
        id: 'new-1',
        address: '0x1234567890123456789012345678901234567890',
        name: 'New Wallet',
        chainId: 1,
        isFavorite: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ),
    update: jest.fn(() => Promise.resolve(undefined)),
    delete: jest.fn(() => Promise.resolve(true)),
    toggleFavorite: jest.fn(() => Promise.resolve(true)),
  };

  const mockTokenListServiceInternal = {
    getVisibleTokens: jest.fn(() =>
      Promise.resolve([
        {
          id: 'token-1',
          address: '0xtoken',
          symbol: 'TEST',
          name: 'Test Token',
          decimals: 18,
          chainId: 1,
          isHidden: false,
          isSpam: false,
          isCustom: false,
        },
      ]),
    ),
    getHiddenTokens: jest.fn(() => Promise.resolve([])),
    getCustomTokens: jest.fn(() => Promise.resolve([])),
    searchTokens: jest.fn(() => Promise.resolve([])),
    getLastKnownBalances: jest.fn(() => Promise.resolve(new Map())),
    hideToken: jest.fn(() => Promise.resolve(true)),
    showToken: jest.fn(() => Promise.resolve(true)),
    markAsSpam: jest.fn(() => Promise.resolve(true)),
    addCustomToken: jest.fn(() => Promise.resolve(undefined)),
    updateLastKnownBalance: jest.fn(() => Promise.resolve(undefined)),
  };

  const mockSyncStatusServiceInternal = {
    getSyncStatus: jest.fn(() => Promise.resolve(null)),
    getLastSyncTime: jest.fn(() => Promise.resolve(null)),
    needsSync: jest.fn(() => Promise.resolve(true)),
    getBalanceSnapshot: jest.fn(() => Promise.resolve(null)),
    getAllBalanceSnapshots: jest.fn(() => Promise.resolve([])),
    getTotalPortfolioValue: jest.fn(() => Promise.resolve(0)),
    startSync: jest.fn(() => Promise.resolve(undefined)),
    completeSync: jest.fn(() => Promise.resolve(undefined)),
    syncError: jest.fn(() => Promise.resolve(undefined)),
    saveBalanceSnapshot: jest.fn(() => Promise.resolve(undefined)),
  };

  const mockWcLogServiceInternal = {
    getActiveSessions: jest.fn(() => Promise.resolve([])),
    getSessionHistory: jest.fn(() => Promise.resolve([])),
    getRecentRequests: jest.fn(() => Promise.resolve([])),
    getPendingRequests: jest.fn(() => Promise.resolve([])),
    getRequestStats: jest.fn(() => Promise.resolve(new Map())),
    markExpiredSessions: jest.fn(() => Promise.resolve(0)),
    logSessionConnected: jest.fn(() => Promise.resolve(undefined)),
    logSessionDisconnected: jest.fn(() => Promise.resolve(true)),
    logRequest: jest.fn(() => Promise.resolve(undefined)),
  };

  const mockUserPreferencesServiceInternal = {
    getOrDefault: jest.fn(() => Promise.resolve('USD')),
    get: jest.fn(() => Promise.resolve('USD')),
    set: jest.fn(() => Promise.resolve(undefined)),
  };

  const mockTransactionCacheServiceInternal = {
    getByAddress: jest.fn(() => Promise.resolve([])),
    getPendingTransactions: jest.fn(() => Promise.resolve([])),
    getByHash: jest.fn(() => Promise.resolve(null)),
    getRecent: jest.fn(() => Promise.resolve([])),
    createLocalTransaction: jest.fn(),
  };

  return {
    addressBookService: mockAddressBookServiceInternal,
    tokenListService: mockTokenListServiceInternal,
    syncStatusService: mockSyncStatusServiceInternal,
    wcLogService: mockWcLogServiceInternal,
    userPreferencesService: mockUserPreferencesServiceInternal,
    transactionCacheService: mockTransactionCacheServiceInternal,
    PREFERENCE_KEYS: {
      CURRENCY: 'display.currency',
      THEME: 'display.theme',
      HIDE_BALANCE: 'display.hideBalance',
    },
  };
});

// hooks를 mock 후에 import
import { useAddressBook } from '../../src/realm/hooks/useAddressBook';
import { useTokenList } from '../../src/realm/hooks/useTokenList';
import { useSyncStatus } from '../../src/realm/hooks/useSyncStatus';
import { useWCActiveSessions } from '../../src/realm/hooks/useWCLog';
import {
  addressBookService,
  tokenListService,
  syncStatusService,
  wcLogService,
} from '../../src/realm/services';

describe('Realm Hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useAddressBook', () => {
    it('should load addresses on mount', async () => {
      const { result } = renderHook(() => useAddressBook());

      // 로딩이 완료될 때까지 대기
      await waitFor(
        () => {
          expect(result.current.isLoading).toBe(false);
        },
        { timeout: 3000 },
      );

      expect(result.current.addresses).toHaveLength(1);
      expect(result.current.addresses[0].name).toBe('Test Wallet');
      expect(addressBookService.getAll).toHaveBeenCalled();
    });

    it('should expose CRUD methods', async () => {
      const { result } = renderHook(() => useAddressBook());

      await waitFor(
        () => {
          expect(result.current.isLoading).toBe(false);
        },
        { timeout: 5000 },
      );

      expect(typeof result.current.addAddress).toBe('function');
      expect(typeof result.current.updateAddress).toBe('function');
      expect(typeof result.current.deleteAddress).toBe('function');
      expect(typeof result.current.toggleFavorite).toBe('function');
      expect(typeof result.current.refetch).toBe('function');
    });

    it('should call addAddress correctly', async () => {
      const { result } = renderHook(() => useAddressBook());

      await waitFor(
        () => {
          expect(result.current.isLoading).toBe(false);
        },
        { timeout: 5000 },
      );

      await act(async () => {
        await result.current.addAddress({
          address: '0xnewaddress' as `0x${string}`,
          name: 'New Address',
          chainId: 1,
        });
      });

      expect(addressBookService.create).toHaveBeenCalledWith({
        address: '0xnewaddress',
        name: 'New Address',
        chainId: 1,
      });
    });
  });

  describe('useTokenList', () => {
    it('should load visible tokens for chain', async () => {
      const { result } = renderHook(() => useTokenList(1));

      // 비동기 로딩이 완료될 때까지 대기
      await waitFor(
        () => {
          expect(result.current.isLoading).toBe(false);
        },
        { timeout: 5000 },
      );

      expect(Array.isArray(result.current.tokens)).toBe(true);
      expect(tokenListService.getVisibleTokens).toHaveBeenCalledWith(1);
    });

    it('should expose token management methods', async () => {
      const { result } = renderHook(() => useTokenList(1));

      await waitFor(
        () => {
          expect(result.current.isLoading).toBe(false);
        },
        { timeout: 5000 },
      );

      expect(typeof result.current.hideToken).toBe('function');
      expect(typeof result.current.showToken).toBe('function');
      expect(typeof result.current.markAsSpam).toBe('function');
    });
  });

  describe('useSyncStatus', () => {
    it('should check sync status', async () => {
      const { result } = renderHook(() =>
        useSyncStatus('balance', '0x1234', 1),
      );

      // 비동기 effect가 완료될 때까지 대기
      await waitFor(
        () => {
          expect(syncStatusService.getSyncStatus).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );

      // 함수 타입 확인
      expect(typeof result.current.startSync).toBe('function');
      expect(typeof result.current.completeSync).toBe('function');
      expect(typeof result.current.syncError).toBe('function');
    });

    it('should call startSync correctly', async () => {
      const { result } = renderHook(() =>
        useSyncStatus('balance', '0x1234', 1),
      );

      // 초기 effect가 완료될 때까지 대기
      await waitFor(
        () => {
          expect(syncStatusService.getSyncStatus).toHaveBeenCalled();
        },
        { timeout: 5000 },
      );

      await act(async () => {
        await result.current.startSync();
      });

      expect(syncStatusService.startSync).toHaveBeenCalledWith(
        'balance',
        '0x1234',
        1,
      );
    });
  });

  describe('useWCActiveSessions', () => {
    it('should load active sessions', async () => {
      const { result } = renderHook(() => useWCActiveSessions());

      // 비동기 로딩이 완료될 때까지 대기
      await waitFor(
        () => {
          expect(result.current.isLoading).toBe(false);
        },
        { timeout: 5000 },
      );

      expect(Array.isArray(result.current.sessions)).toBe(true);
      expect(typeof result.current.count).toBe('number');
      expect(wcLogService.markExpiredSessions).toHaveBeenCalled();
      expect(wcLogService.getActiveSessions).toHaveBeenCalled();
    });

    it('should expose session management methods', async () => {
      const { result } = renderHook(() => useWCActiveSessions());

      await waitFor(
        () => {
          expect(result.current.isLoading).toBe(false);
        },
        { timeout: 5000 },
      );

      expect(typeof result.current.refetch).toBe('function');
      expect(typeof result.current.logSessionConnected).toBe('function');
      expect(typeof result.current.logSessionDisconnected).toBe('function');
    });
  });
});
