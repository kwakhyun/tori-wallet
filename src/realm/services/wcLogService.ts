/**
 * WalletConnect 세션 및 요청 로그 관리 서비스
 */

import { realmDB } from '../database';
import type { WCSessionLogEntry, WCRequestLogEntry } from '../schemas';
import { createLogger } from '@/utils/logger';
import { v4 as uuid } from 'uuid';

const logger = createLogger('WCLog');

export type SessionStatus = 'active' | 'disconnected' | 'expired';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'failed';

export interface CreateSessionLogInput {
  topic: string;
  dappName: string;
  dappUrl: string;
  dappIcon?: string;
  chains: string[];
  accounts: string[];
  expiresAt?: Date;
}

export interface CreateRequestLogInput {
  sessionTopic: string;
  requestId: number;
  method: string;
  params: unknown;
  chainId?: number;
  dappName?: string;
}

class WCLogService {
  private static instance: WCLogService;

  private constructor() {}

  static getInstance(): WCLogService {
    if (!WCLogService.instance) {
      WCLogService.instance = new WCLogService();
    }
    return WCLogService.instance;
  }

  // ============================================================================
  // 세션 로그
  // ============================================================================

  /**
   * 세션 연결 로그 생성
   */
  async logSessionConnected(
    input: CreateSessionLogInput,
  ): Promise<WCSessionLogEntry> {
    const realm = await realmDB.getRealm();
    const now = new Date();

    // 기존 세션 확인 (같은 topic)
    const existing = realm
      .objects<WCSessionLogEntry>('WCSessionLog')
      .filtered('topic == $0 AND status == "active"', input.topic);

    // 기존 활성 세션이 있으면 업데이트
    if (existing.length > 0) {
      const session = existing[0];
      realm.write(() => {
        session.updatedAt = now;
      });
      return session;
    }

    const entry: WCSessionLogEntry = {
      id: uuid(),
      topic: input.topic,
      dappName: input.dappName,
      dappUrl: input.dappUrl,
      dappIcon: input.dappIcon,
      chains: input.chains,
      accounts: input.accounts,
      status: 'active',
      connectedAt: now,
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    let created: WCSessionLogEntry | null = null;

    realm.write(() => {
      created = realm.create<WCSessionLogEntry>('WCSessionLog', entry);
    });

    logger.info(`Session connected: ${input.dappName} (${input.topic})`);
    return created!;
  }

  /**
   * 세션 연결 해제 로그
   */
  async logSessionDisconnected(topic: string): Promise<boolean> {
    const realm = await realmDB.getRealm();
    const now = new Date();

    const sessions = realm
      .objects<WCSessionLogEntry>('WCSessionLog')
      .filtered('topic == $0 AND status == "active"', topic);

    if (sessions.length === 0) {
      logger.warn(`Active session not found: ${topic}`);
      return false;
    }

    realm.write(() => {
      for (const session of sessions) {
        session.status = 'disconnected';
        session.disconnectedAt = now;
        session.updatedAt = now;
      }
    });

    logger.info(`Session disconnected: ${topic}`);
    return true;
  }

  /**
   * 만료된 세션 처리
   */
  async markExpiredSessions(): Promise<number> {
    const realm = await realmDB.getRealm();
    const now = new Date();

    const expiredSessions = realm
      .objects<WCSessionLogEntry>('WCSessionLog')
      .filtered(
        'status == "active" AND expiresAt != null AND expiresAt < $0',
        now,
      );

    const count = expiredSessions.length;

    if (count > 0) {
      realm.write(() => {
        for (const session of expiredSessions) {
          session.status = 'expired';
          session.updatedAt = now;
        }
      });
      logger.info(`Marked ${count} sessions as expired`);
    }

    return count;
  }

  /**
   * 활성 세션 목록
   */
  async getActiveSessions(): Promise<WCSessionLogEntry[]> {
    const realm = await realmDB.getRealm();
    const results = realm
      .objects<WCSessionLogEntry>('WCSessionLog')
      .filtered('status == "active"')
      .sorted('connectedAt', true);

    return Array.from(results);
  }

  /**
   * 세션 히스토리 (모든 상태)
   */
  async getSessionHistory(limit: number = 50): Promise<WCSessionLogEntry[]> {
    const realm = await realmDB.getRealm();
    const results = realm
      .objects<WCSessionLogEntry>('WCSessionLog')
      .sorted('createdAt', true);

    return Array.from(results).slice(0, limit);
  }

  /**
   * dApp별 세션 히스토리
   */
  async getSessionsByDApp(dappUrl: string): Promise<WCSessionLogEntry[]> {
    const realm = await realmDB.getRealm();
    const results = realm
      .objects<WCSessionLogEntry>('WCSessionLog')
      .filtered('dappUrl CONTAINS[c] $0', dappUrl)
      .sorted('createdAt', true);

    return Array.from(results);
  }

  /**
   * 토픽으로 세션 조회
   */
  async getSessionByTopic(topic: string): Promise<WCSessionLogEntry | null> {
    const realm = await realmDB.getRealm();
    const results = realm
      .objects<WCSessionLogEntry>('WCSessionLog')
      .filtered('topic == $0', topic)
      .sorted('createdAt', true);

    return results.length > 0 ? results[0] : null;
  }

  // ============================================================================
  // 요청 로그
  // ============================================================================

  /**
   * 요청 로그 생성
   */
  async logRequest(input: CreateRequestLogInput): Promise<WCRequestLogEntry> {
    const realm = await realmDB.getRealm();
    const now = new Date();

    const entry: WCRequestLogEntry = {
      id: uuid(),
      sessionTopic: input.sessionTopic,
      requestId: input.requestId,
      method: input.method,
      params: JSON.stringify(input.params),
      chainId: input.chainId,
      status: 'pending',
      dappName: input.dappName,
      requestedAt: now,
      createdAt: now,
    };

    let created: WCRequestLogEntry | null = null;

    realm.write(() => {
      created = realm.create<WCRequestLogEntry>('WCRequestLog', entry);
    });

    logger.info(`Request logged: ${input.method} (${input.requestId})`);
    return created!;
  }

  /**
   * 요청 승인 로그
   */
  async logRequestApproved(
    requestId: number,
    result?: unknown,
  ): Promise<boolean> {
    return this.updateRequestStatus(requestId, 'approved', result);
  }

  /**
   * 요청 거절 로그
   */
  async logRequestRejected(
    requestId: number,
    errorMessage?: string,
  ): Promise<boolean> {
    return this.updateRequestStatus(
      requestId,
      'rejected',
      undefined,
      errorMessage,
    );
  }

  /**
   * 요청 실패 로그
   */
  async logRequestFailed(
    requestId: number,
    errorMessage: string,
  ): Promise<boolean> {
    return this.updateRequestStatus(
      requestId,
      'failed',
      undefined,
      errorMessage,
    );
  }

  /**
   * 요청 상태 업데이트
   */
  private async updateRequestStatus(
    requestId: number,
    status: RequestStatus,
    result?: unknown,
    errorMessage?: string,
  ): Promise<boolean> {
    const realm = await realmDB.getRealm();
    const now = new Date();

    const requests = realm
      .objects<WCRequestLogEntry>('WCRequestLog')
      .filtered('requestId == $0', requestId)
      .sorted('createdAt', true);

    if (requests.length === 0) {
      logger.warn(`Request not found: ${requestId}`);
      return false;
    }

    realm.write(() => {
      const request = requests[0];
      request.status = status;
      request.respondedAt = now;
      if (result !== undefined) {
        request.result = JSON.stringify(result);
      }
      if (errorMessage) {
        request.errorMessage = errorMessage;
      }
    });

    logger.info(`Request ${requestId} ${status}`);
    return true;
  }

  /**
   * 세션별 요청 로그 조회
   */
  async getRequestsBySession(
    sessionTopic: string,
    limit: number = 50,
  ): Promise<WCRequestLogEntry[]> {
    const realm = await realmDB.getRealm();
    const results = realm
      .objects<WCRequestLogEntry>('WCRequestLog')
      .filtered('sessionTopic == $0', sessionTopic)
      .sorted('requestedAt', true);

    return Array.from(results).slice(0, limit);
  }

  /**
   * 최근 요청 로그
   */
  async getRecentRequests(limit: number = 50): Promise<WCRequestLogEntry[]> {
    const realm = await realmDB.getRealm();
    const results = realm
      .objects<WCRequestLogEntry>('WCRequestLog')
      .sorted('requestedAt', true);

    return Array.from(results).slice(0, limit);
  }

  /**
   * 펜딩 요청 조회
   */
  async getPendingRequests(): Promise<WCRequestLogEntry[]> {
    const realm = await realmDB.getRealm();
    const results = realm
      .objects<WCRequestLogEntry>('WCRequestLog')
      .filtered('status == "pending"')
      .sorted('requestedAt', true);

    return Array.from(results);
  }

  /**
   * 메서드별 요청 통계
   */
  async getRequestStats(): Promise<
    Map<string, { total: number; approved: number; rejected: number }>
  > {
    const realm = await realmDB.getRealm();
    const allRequests = realm.objects<WCRequestLogEntry>('WCRequestLog');

    const stats = new Map<
      string,
      { total: number; approved: number; rejected: number }
    >();

    for (const request of allRequests) {
      const current = stats.get(request.method) ?? {
        total: 0,
        approved: 0,
        rejected: 0,
      };
      current.total++;
      if (request.status === 'approved') current.approved++;
      if (request.status === 'rejected') current.rejected++;
      stats.set(request.method, current);
    }

    return stats;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * 오래된 로그 정리 (기본 90일)
   */
  async cleanOldLogs(
    daysOld: number = 90,
  ): Promise<{ sessions: number; requests: number }> {
    const realm = await realmDB.getRealm();
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

    const oldSessions = realm
      .objects<WCSessionLogEntry>('WCSessionLog')
      .filtered('createdAt < $0 AND status != "active"', cutoffDate);

    const oldRequests = realm
      .objects<WCRequestLogEntry>('WCRequestLog')
      .filtered('createdAt < $0', cutoffDate);

    const sessionsCount = oldSessions.length;
    const requestsCount = oldRequests.length;

    realm.write(() => {
      realm.delete(oldSessions);
      realm.delete(oldRequests);
    });

    logger.info(
      `Cleaned ${sessionsCount} sessions and ${requestsCount} requests`,
    );
    return { sessions: sessionsCount, requests: requestsCount };
  }

  /**
   * 모든 로그 삭제
   */
  async deleteAll(): Promise<void> {
    await realmDB.deleteAllOf('WCSessionLog');
    await realmDB.deleteAllOf('WCRequestLog');
    logger.info('All WC logs deleted');
  }
}

export const wcLogService = WCLogService.getInstance();
