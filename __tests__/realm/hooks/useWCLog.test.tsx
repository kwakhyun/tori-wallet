/**
 * WalletConnect 로그 훅 테스트
 */

import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// uuid 모킹
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
}));

// 서비스 모킹
jest.mock('../../../src/realm/services', () => ({
  wcLogService: {
    getActiveSessions: jest.fn().mockResolvedValue([]),
    getSessionHistory: jest.fn().mockResolvedValue([]),
    getRequestsBySession: jest.fn().mockResolvedValue([]),
    getPendingRequests: jest.fn().mockResolvedValue([]),
    getSessionByTopic: jest.fn().mockResolvedValue(null),
    logSessionConnected: jest.fn().mockResolvedValue({}),
    logSessionDisconnected: jest.fn().mockResolvedValue(true),
    logRequest: jest.fn().mockResolvedValue({}),
    cleanOldLogs: jest.fn().mockResolvedValue(0),
  },
}));

import {
  useWCActiveSessions,
  useWCSessionHistory,
  useWCRequestLog,
  useWCPendingRequests,
  useWCLogCleanup,
} from '../../../src/realm/hooks/useWCLog';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useWCLog hooks', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    queryClient.clear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('useWCActiveSessions', () => {
    it('should return active sessions array', async () => {
      const { result, unmount } = renderHook(() => useWCActiveSessions(), {
        wrapper,
      });

      await jest.runAllTimersAsync();

      expect(Array.isArray(result.current.sessions)).toBe(true);
      unmount();
    });

    it('should have logSessionConnected function', async () => {
      const { result, unmount } = renderHook(() => useWCActiveSessions(), {
        wrapper,
      });

      await jest.runAllTimersAsync();

      expect(typeof result.current.logSessionConnected).toBe('function');
      unmount();
    });
  });

  describe('useWCSessionHistory', () => {
    it('should return session history array', async () => {
      const { result, unmount } = renderHook(() => useWCSessionHistory(), {
        wrapper,
      });

      await jest.runAllTimersAsync();

      expect(Array.isArray(result.current.history)).toBe(true);
      unmount();
    });

    it('should accept custom limit', async () => {
      const { result, unmount } = renderHook(() => useWCSessionHistory(10), {
        wrapper,
      });

      await jest.runAllTimersAsync();

      expect(Array.isArray(result.current.history)).toBe(true);
      unmount();
    });
  });

  describe('useWCRequestLog', () => {
    it('should return request logs array', async () => {
      const { result, unmount } = renderHook(() => useWCRequestLog(), {
        wrapper,
      });

      await jest.runAllTimersAsync();

      expect(Array.isArray(result.current.requests)).toBe(true);
      unmount();
    });

    it('should filter by session topic', async () => {
      const { result, unmount } = renderHook(
        () => useWCRequestLog('topic-123'),
        {
          wrapper,
        },
      );

      await jest.runAllTimersAsync();

      expect(Array.isArray(result.current.requests)).toBe(true);
      unmount();
    });
  });

  describe('useWCPendingRequests', () => {
    it('should return pending requests array', () => {
      const { result, unmount } = renderHook(() => useWCPendingRequests(), {
        wrapper,
      });

      // 초기 상태만 확인 (interval 실행 전)
      expect(Array.isArray(result.current.pending)).toBe(true);
      expect(typeof result.current.hasPending).toBe('boolean');
      expect(typeof result.current.refetch).toBe('function');
      unmount();
    });
  });

  describe('useWCLogCleanup', () => {
    it('should return cleanup functions', () => {
      const { result } = renderHook(() => useWCLogCleanup(), { wrapper });

      expect(typeof result.current.cleanOldLogs).toBe('function');
      expect(typeof result.current.deleteAll).toBe('function');
      expect(typeof result.current.isCleaning).toBe('boolean');
    });
  });
});
