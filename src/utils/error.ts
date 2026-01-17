/**
 * 에러 처리 유틸리티
 */

export enum ErrorCode {
  // 일반 오류
  UNKNOWN = 'UNKNOWN',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',

  // 지갑 오류
  INVALID_MNEMONIC = 'INVALID_MNEMONIC',
  WALLET_NOT_FOUND = 'WALLET_NOT_FOUND',
  WALLET_LOCKED = 'WALLET_LOCKED',
  BIOMETRIC_FAILED = 'BIOMETRIC_FAILED',
  PIN_INCORRECT = 'PIN_INCORRECT',

  // 트랜잭션 오류
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INSUFFICIENT_GAS = 'INSUFFICIENT_GAS',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  TRANSACTION_REJECTED = 'TRANSACTION_REJECTED',
  NONCE_TOO_LOW = 'NONCE_TOO_LOW',
  GAS_ESTIMATION_FAILED = 'GAS_ESTIMATION_FAILED',

  // WalletConnect 오류
  WC_NOT_INITIALIZED = 'WC_NOT_INITIALIZED',
  WC_SESSION_REJECTED = 'WC_SESSION_REJECTED',
  WC_SESSION_DISCONNECTED = 'WC_SESSION_DISCONNECTED',
  WC_REQUEST_EXPIRED = 'WC_REQUEST_EXPIRED',

  // 서명 오류
  SIGNATURE_DENIED = 'SIGNATURE_DENIED',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
}

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: unknown;
  originalError?: Error;
}

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.UNKNOWN]: '알 수 없는 오류가 발생했습니다.',
  [ErrorCode.NETWORK_ERROR]: '네트워크 연결을 확인해주세요.',
  [ErrorCode.TIMEOUT]: '요청 시간이 초과되었습니다.',

  [ErrorCode.INVALID_MNEMONIC]: '올바르지 않은 복구 구문입니다.',
  [ErrorCode.WALLET_NOT_FOUND]: '지갑을 찾을 수 없습니다.',
  [ErrorCode.WALLET_LOCKED]: '지갑이 잠겨있습니다. 인증을 진행해주세요.',
  [ErrorCode.BIOMETRIC_FAILED]: '생체인증에 실패했습니다.',
  [ErrorCode.PIN_INCORRECT]: 'PIN이 올바르지 않습니다.',

  [ErrorCode.INSUFFICIENT_FUNDS]: '잔액이 부족합니다.',
  [ErrorCode.INSUFFICIENT_GAS]: '가스비가 부족합니다.',
  [ErrorCode.TRANSACTION_FAILED]: '트랜잭션이 실패했습니다.',
  [ErrorCode.TRANSACTION_REJECTED]: '트랜잭션이 거부되었습니다.',
  [ErrorCode.NONCE_TOO_LOW]: '트랜잭션 순서가 올바르지 않습니다.',
  [ErrorCode.GAS_ESTIMATION_FAILED]: '가스 추정에 실패했습니다.',

  [ErrorCode.WC_NOT_INITIALIZED]: 'WalletConnect가 초기화되지 않았습니다.',
  [ErrorCode.WC_SESSION_REJECTED]: '연결 요청이 거부되었습니다.',
  [ErrorCode.WC_SESSION_DISCONNECTED]: '세션이 연결 해제되었습니다.',
  [ErrorCode.WC_REQUEST_EXPIRED]: '요청이 만료되었습니다.',

  [ErrorCode.SIGNATURE_DENIED]: '서명이 거부되었습니다.',
  [ErrorCode.INVALID_SIGNATURE]: '올바르지 않은 서명입니다.',
};

/**
 * AppError 생성
 */
export function createAppError(
  code: ErrorCode,
  details?: unknown,
  originalError?: Error,
): AppError {
  return {
    code,
    message: ERROR_MESSAGES[code],
    details,
    originalError,
  };
}

/**
 * 에러를 AppError로 변환
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    // 일반적인 에러 메시지 매핑
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('fetch')) {
      return createAppError(ErrorCode.NETWORK_ERROR, undefined, error);
    }

    if (message.includes('timeout')) {
      return createAppError(ErrorCode.TIMEOUT, undefined, error);
    }

    if (message.includes('insufficient funds')) {
      return createAppError(ErrorCode.INSUFFICIENT_FUNDS, undefined, error);
    }

    if (message.includes('nonce')) {
      return createAppError(ErrorCode.NONCE_TOO_LOW, undefined, error);
    }

    if (message.includes('user rejected') || message.includes('user denied')) {
      return createAppError(ErrorCode.TRANSACTION_REJECTED, undefined, error);
    }

    return createAppError(ErrorCode.UNKNOWN, error.message, error);
  }

  return createAppError(ErrorCode.UNKNOWN, error);
}

/**
 * AppError 타입 가드
 */
export function isAppError(error: unknown): error is AppError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    Object.values(ErrorCode).includes((error as AppError).code)
  );
}

import { captureException, addErrorBreadcrumb } from './errorReporter';

/**
 * 사용자에게 보여줄 에러 메시지 가져오기
 */
export function getUserMessage(error: unknown): string {
  const appError = toAppError(error);
  return appError.message;
}

/**
 * 에러 로깅 및 리포팅
 */
export function logError(error: unknown, context?: string): void {
  const appError = toAppError(error);

  // 개발 환경에서는 콘솔에 상세 로그
  if (__DEV__) {
    console.error(
      `[${context || 'Error'}]`,
      appError.code,
      appError.message,
      appError.details,
      appError.originalError,
    );
  }

  // 에러 리포팅 서비스로 전송
  addErrorBreadcrumb(`Error in ${context || 'unknown'}`, 'error', {
    code: appError.code,
  });

  if (appError.originalError) {
    captureException(appError.originalError, {
      action: context,
      extra: {
        code: appError.code,
        message: appError.message,
        details: appError.details,
      },
    });
  }
}
