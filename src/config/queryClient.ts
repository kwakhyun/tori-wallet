/**
 * React Query 클라이언트 설정 (에러 처리, 재시도, 오프라인 대응)
 */

import { QueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { AppState, AppStateStatus } from 'react-native';
import { focusManager } from '@tanstack/react-query';
import { createLogger } from '@/utils/logger';

const logger = createLogger('QueryClient');

/**
 * 네트워크 상태 연동
 * 오프라인시 자동으로 쿼리 일시정지, 온라인 복구시 자동 재시도
 */
export function setupNetworkListener(): () => void {
  const unsubscribe = NetInfo.addEventListener(state => {
    const isOnline = state.isConnected && state.isInternetReachable !== false;
    onlineManager.setOnline(isOnline ?? true);

    if (isOnline) {
      logger.info('Network restored, resuming queries');
    } else {
      logger.warn('Network lost, pausing queries');
    }
  });

  return unsubscribe;
}

/**
 * 앱 포커스 상태 연동
 * 앱이 백그라운드에서 포그라운드로 돌아올 때 stale 쿼리 자동 새로고침
 */
export function setupAppFocusListener(): () => void {
  const onAppStateChange = (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  };

  const subscription = AppState.addEventListener('change', onAppStateChange);

  return () => subscription.remove();
}

/**
 * 에러가 재시도 가능한지 판단
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // 네트워크 관련 에러는 재시도
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('fetch failed') ||
      message.includes('connection') ||
      message.includes('econnrefused') ||
      message.includes('etimedout')
    ) {
      return true;
    }

    // Rate limiting은 재시도
    if (message.includes('rate limit') || message.includes('429')) {
      return true;
    }

    // 서버 에러(5xx)는 재시도
    if (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503')
    ) {
      return true;
    }
  }

  // HTTP Response 객체인 경우
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status;
    // 5xx 서버 에러, 429 Rate Limit
    return status >= 500 || status === 429;
  }

  return false;
}

/**
 * 재시도 딜레이 계산 (지수 백오프 + 지터)
 */
function calculateRetryDelay(attemptIndex: number): number {
  const baseDelay = 1000; // 1초
  const maxDelay = 30000; // 최대 30초

  // 지수 백오프: 1초, 2초, 4초, 8초...
  const exponentialDelay = Math.min(
    maxDelay,
    baseDelay * Math.pow(2, attemptIndex),
  );

  // 지터 추가 (0-25% 랜덤)
  const jitter = exponentialDelay * Math.random() * 0.25;

  return exponentialDelay + jitter;
}

/**
 * QueryClient 생성
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 재시도 설정
        retry: (failureCount, error) => {
          // 최대 3번 재시도
          if (failureCount >= 3) {
            return false;
          }
          // 재시도 가능한 에러만 재시도
          return isRetryableError(error);
        },
        retryDelay: attemptIndex => calculateRetryDelay(attemptIndex),

        // 캐싱 설정
        staleTime: 30 * 1000, // 30초 동안 fresh
        gcTime: 5 * 60 * 1000, // 5분 동안 캐시 유지

        // 리페치 설정
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchOnMount: true,

        // 네트워크 모드
        networkMode: 'offlineFirst', // 오프라인일 때 캐시 데이터 사용
      },
      mutations: {
        // 뮤테이션 재시도 설정
        retry: (failureCount, error) => {
          if (failureCount >= 2) {
            return false;
          }
          return isRetryableError(error);
        },
        retryDelay: attemptIndex => calculateRetryDelay(attemptIndex),

        // 네트워크 모드
        networkMode: 'offlineFirst',
      },
    },
  });
}

/**
 * 전역 에러 핸들러
 */
export function handleQueryError(error: unknown): void {
  logger.error('Query error:', error);

  // 에러 리포팅 서비스로 전송
  if (error instanceof Error) {
    const { captureException } = require('@/utils/errorReporter');
    captureException(error, {
      action: 'QueryError',
    });
  }
}

/**
 * 쿼리 키 팩토리
 * 일관된 쿼리 키 관리
 */
export const queryKeys = {
  // 지갑 관련
  wallet: {
    all: ['wallet'] as const,
    balance: (address: string, chainId: number) =>
      ['wallet', 'balance', address, chainId] as const,
    tokens: (address: string, chainId: number) =>
      ['wallet', 'tokens', address, chainId] as const,
    nfts: (address: string, chainId: number) =>
      ['wallet', 'nfts', address, chainId] as const,
  },

  // 트랜잭션 관련
  transactions: {
    all: ['transactions'] as const,
    list: (address: string, chainId: number) =>
      ['transactions', 'list', address, chainId] as const,
    detail: (txHash: string) => ['transactions', 'detail', txHash] as const,
    pending: (address: string) => ['transactions', 'pending', address] as const,
  },

  // 토큰 관련
  tokens: {
    all: ['tokens'] as const,
    price: (address: string, chainId: number) =>
      ['tokens', 'price', address, chainId] as const,
    metadata: (address: string, chainId: number) =>
      ['tokens', 'metadata', address, chainId] as const,
    list: (chainId: number) => ['tokens', 'list', chainId] as const,
  },

  // 스왑 관련
  swap: {
    all: ['swap'] as const,
    quote: (
      sellToken: string,
      buyToken: string,
      amount: string,
      chainId: number,
    ) => ['swap', 'quote', sellToken, buyToken, amount, chainId] as const,
    price: (sellToken: string, buyToken: string, chainId: number) =>
      ['swap', 'price', sellToken, buyToken, chainId] as const,
  },

  // 가스 관련
  gas: {
    all: ['gas'] as const,
    price: (chainId: number) => ['gas', 'price', chainId] as const,
    estimate: (txData: string) => ['gas', 'estimate', txData] as const,
  },

  // 코인 시세 관련
  coins: {
    all: ['coins'] as const,
    list: () => ['coins', 'list'] as const,
    detail: (coinId: string) => ['coins', 'detail', coinId] as const,
    chart: (coinId: string, days: number) =>
      ['coins', 'chart', coinId, days] as const,
  },
};

export default createQueryClient;
