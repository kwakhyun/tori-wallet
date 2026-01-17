/**
 * WalletConnect 로그 관리 훅
 */

import { useState, useEffect, useCallback } from 'react';
import {
  wcLogService,
  type CreateSessionLogInput,
  type CreateRequestLogInput,
} from '../services';
import type { WCSessionLogEntry, WCRequestLogEntry } from '../schemas';

/**
 * WalletConnect 활성 세션 훅
 */
export function useWCActiveSessions() {
  const [sessions, setSessions] = useState<WCSessionLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      // 먼저 만료된 세션 처리
      await wcLogService.markExpiredSessions();
      const result = await wcLogService.getActiveSessions();
      setSessions(result);
    } catch {
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const logSessionConnected = useCallback(
    async (input: CreateSessionLogInput) => {
      const session = await wcLogService.logSessionConnected(input);
      await loadSessions();
      return session;
    },
    [loadSessions],
  );

  const logSessionDisconnected = useCallback(
    async (topic: string) => {
      const success = await wcLogService.logSessionDisconnected(topic);
      if (success) {
        await loadSessions();
      }
      return success;
    },
    [loadSessions],
  );

  return {
    sessions,
    isLoading,
    refetch: loadSessions,
    logSessionConnected,
    logSessionDisconnected,
    count: sessions.length,
  };
}

/**
 * WalletConnect 세션 히스토리 훅
 */
export function useWCSessionHistory(limit: number = 50) {
  const [history, setHistory] = useState<WCSessionLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        setIsLoading(true);
        const result = await wcLogService.getSessionHistory(limit);
        setHistory(result);
      } catch {
        setHistory([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, [limit]);

  return { history, isLoading };
}

/**
 * WalletConnect 요청 로그 훅
 */
export function useWCRequestLog(sessionTopic?: string, limit: number = 50) {
  const [requests, setRequests] = useState<WCRequestLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadRequests = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = sessionTopic
        ? await wcLogService.getRequestsBySession(sessionTopic, limit)
        : await wcLogService.getRecentRequests(limit);
      setRequests(result);
    } catch {
      setRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, [sessionTopic, limit]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const logRequest = useCallback(
    async (input: CreateRequestLogInput) => {
      const request = await wcLogService.logRequest(input);
      await loadRequests();
      return request;
    },
    [loadRequests],
  );

  const logApproved = useCallback(
    async (requestId: number, result?: unknown) => {
      await wcLogService.logRequestApproved(requestId, result);
      await loadRequests();
    },
    [loadRequests],
  );

  const logRejected = useCallback(
    async (requestId: number, reason?: string) => {
      await wcLogService.logRequestRejected(requestId, reason);
      await loadRequests();
    },
    [loadRequests],
  );

  return {
    requests,
    isLoading,
    refetch: loadRequests,
    logRequest,
    logApproved,
    logRejected,
  };
}

/**
 * 펜딩 요청 훅
 */
export function useWCPendingRequests() {
  const [pending, setPending] = useState<WCRequestLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPending = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await wcLogService.getPendingRequests();
      setPending(result);
    } catch {
      setPending([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPending();

    // 주기적으로 확인
    const interval = setInterval(loadPending, 5000);
    return () => clearInterval(interval);
  }, [loadPending]);

  return {
    pending,
    isLoading,
    count: pending.length,
    hasPending: pending.length > 0,
    refetch: loadPending,
  };
}

/**
 * WalletConnect 요청 통계 훅
 */
export function useWCRequestStats() {
  const [stats, setStats] = useState<
    Map<string, { total: number; approved: number; rejected: number }>
  >(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        setIsLoading(true);
        const result = await wcLogService.getRequestStats();
        setStats(result);
      } catch {
        setStats(new Map());
      } finally {
        setIsLoading(false);
      }
    };

    loadStats();
  }, []);

  // 전체 통계
  const totals = {
    total: 0,
    approved: 0,
    rejected: 0,
  };

  for (const stat of stats.values()) {
    totals.total += stat.total;
    totals.approved += stat.approved;
    totals.rejected += stat.rejected;
  }

  return { stats, totals, isLoading };
}

/**
 * dApp별 세션 히스토리 훅
 */
export function useWCDAppHistory(dappUrl: string) {
  const [sessions, setSessions] = useState<WCSessionLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!dappUrl) {
      setSessions([]);
      setIsLoading(false);
      return;
    }

    const loadHistory = async () => {
      try {
        setIsLoading(true);
        const result = await wcLogService.getSessionsByDApp(dappUrl);
        setSessions(result);
      } catch {
        setSessions([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, [dappUrl]);

  return { sessions, isLoading };
}

/**
 * WC 로그 정리 훅
 */
export function useWCLogCleanup() {
  const [isCleaning, setIsCleaning] = useState(false);

  const cleanOldLogs = useCallback(async (daysOld: number = 90) => {
    setIsCleaning(true);
    try {
      const result = await wcLogService.cleanOldLogs(daysOld);
      return result;
    } finally {
      setIsCleaning(false);
    }
  }, []);

  const deleteAll = useCallback(async () => {
    setIsCleaning(true);
    try {
      await wcLogService.deleteAll();
    } finally {
      setIsCleaning(false);
    }
  }, []);

  return { cleanOldLogs, deleteAll, isCleaning };
}
