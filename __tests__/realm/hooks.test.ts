/**
 * Realm 훅 테스트 (인터페이스 및 타입 검증)
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';

// Jest 모킹 - hoisting 문제를 해결하기 위해 factory 함수 내부에서 mock 정의
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

      // 서비스 함수가 호출될 때까지 대기
      await waitFor(
        () => {
          expect(addressBookService.getAll).toHaveBeenCalled();
        },
        { timeout: 10000 },
      );

      // 기본 타입 검증
      expect(Array.isArray(result.current.addresses)).toBe(true);
    }, 15000);

    it('should expose CRUD methods', async () => {
      const { result } = renderHook(() => useAddressBook());

      // 함수 타입 검증 (로딩 상태와 무관)
      expect(typeof result.current.addAddress).toBe('function');
      expect(typeof result.current.updateAddress).toBe('function');
      expect(typeof result.current.deleteAddress).toBe('function');
      expect(typeof result.current.toggleFavorite).toBe('function');
      expect(typeof result.current.refetch).toBe('function');
    }, 15000);

    it('should call addAddress correctly', async () => {
      const { result } = renderHook(() => useAddressBook());

      // 서비스 로드 대기
      await waitFor(
        () => {
          expect(addressBookService.getAll).toHaveBeenCalled();
        },
        { timeout: 10000 },
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
    }, 15000);
  });

  describe('useTokenList', () => {
    it('should load visible tokens for chain', async () => {
      const { result } = renderHook(() => useTokenList(1));

      // 서비스 함수가 호출될 때까지 대기
      await waitFor(
        () => {
          expect(tokenListService.getVisibleTokens).toHaveBeenCalledWith(1);
        },
        { timeout: 10000 },
      );

      expect(Array.isArray(result.current.tokens)).toBe(true);
    }, 15000);

    it('should expose token management methods', async () => {
      const { result } = renderHook(() => useTokenList(1));

      // 함수 타입 검증 (로딩 상태와 무관)
      expect(typeof result.current.hideToken).toBe('function');
      expect(typeof result.current.showToken).toBe('function');
      expect(typeof result.current.markAsSpam).toBe('function');
    }, 15000);
  });

  describe('useSyncStatus', () => {
    it('should check sync status', async () => {
      const { result } = renderHook(() =>
        useSyncStatus('balance', '0x1234', 1),
      );

      // 비동기 effect가 완료될 때까지 대기 (최대 10초)
      await waitFor(
        () => {
          expect(syncStatusService.getSyncStatus).toHaveBeenCalled();
        },
        { timeout: 10000 },
      );

      // 함수 타입 확인
      expect(typeof result.current.startSync).toBe('function');
      expect(typeof result.current.completeSync).toBe('function');
      expect(typeof result.current.syncError).toBe('function');
    }, 15000);

    it('should call startSync correctly', async () => {
      const { result } = renderHook(() =>
        useSyncStatus('balance', '0x1234', 1),
      );

      // 초기 effect가 완료될 때까지 대기
      await waitFor(
        () => {
          expect(syncStatusService.getSyncStatus).toHaveBeenCalled();
        },
        { timeout: 10000 },
      );

      await act(async () => {
        await result.current.startSync();
      });

      expect(syncStatusService.startSync).toHaveBeenCalledWith(
        'balance',
        '0x1234',
        1,
      );
    }, 15000);
  });

  describe('useWCActiveSessions', () => {
    it('should load active sessions', async () => {
      const { result } = renderHook(() => useWCActiveSessions());

      // 서비스 함수가 호출될 때까지 대기
      await waitFor(
        () => {
          expect(wcLogService.markExpiredSessions).toHaveBeenCalled();
        },
        { timeout: 10000 },
      );

      // 기본 타입 검증
      expect(Array.isArray(result.current.sessions)).toBe(true);
      expect(typeof result.current.count).toBe('number');
    }, 15000);

    it('should expose session management methods', async () => {
      const { result } = renderHook(() => useWCActiveSessions());

      // 함수 타입 검증 (로딩 상태와 무관하게 확인 가능)
      expect(typeof result.current.refetch).toBe('function');
      expect(typeof result.current.logSessionConnected).toBe('function');
      expect(typeof result.current.logSessionDisconnected).toBe('function');
    }, 15000);
  });
});
