/**
 * 에러 리포팅 서비스 추상화 레이어
 * 프로덕션: Sentry/Crashlytics 연동, 개발: 콘솔 로깅
 */

import { createLogger } from './logger';

const logger = createLogger('ErrorReporter');

// 에러 심각도 레벨
export enum ErrorSeverity {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

// 에러 컨텍스트 정보
export interface ErrorContext {
  userId?: string;
  walletAddress?: string;
  chainId?: number;
  screenName?: string;
  action?: string;
  extra?: Record<string, unknown>;
}

// 에러 리포터 인터페이스
interface ErrorReporterService {
  captureException(error: Error, context?: ErrorContext): void;
  captureMessage(
    message: string,
    severity: ErrorSeverity,
    context?: ErrorContext,
  ): void;
  setUser(userId: string, email?: string): void;
  clearUser(): void;
  addBreadcrumb(
    message: string,
    category?: string,
    data?: Record<string, unknown>,
  ): void;
}

/**
 * 개발 환경용 에러 리포터 (콘솔 로깅)
 */
class DevErrorReporter implements ErrorReporterService {
  captureException(error: Error, context?: ErrorContext): void {
    logger.error('Exception captured:', {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      context,
    });
  }

  captureMessage(
    message: string,
    severity: ErrorSeverity,
    context?: ErrorContext,
  ): void {
    const logFn =
      severity === ErrorSeverity.ERROR || severity === ErrorSeverity.CRITICAL
        ? logger.error
        : severity === ErrorSeverity.WARNING
        ? logger.warn
        : logger.info;

    logFn(`[${severity.toUpperCase()}] ${message}`, context);
  }

  setUser(userId: string, email?: string): void {
    logger.debug('User set:', { userId, email });
  }

  clearUser(): void {
    logger.debug('User cleared');
  }

  addBreadcrumb(
    message: string,
    category?: string,
    data?: Record<string, unknown>,
  ): void {
    logger.debug(`Breadcrumb [${category || 'default'}]: ${message}`, data);
  }
}

/**
 * 프로덕션 환경용 에러 리포터
 * 실제 서비스(Sentry, Crashlytics) 연동 준비
 */
class ProductionErrorReporter implements ErrorReporterService {
  private breadcrumbs: Array<{
    message: string;
    category?: string;
    data?: Record<string, unknown>;
    timestamp: number;
  }> = [];

  private userId?: string;
  private maxBreadcrumbs = 50;

  captureException(error: Error, context?: ErrorContext): void {
    // 프로덕션에서는 실제 서비스로 전송
    // Sentry 예시:
    // Sentry.captureException(error, { extra: context });

    // Crashlytics 예시:
    // crashlytics().recordError(error);

    // 현재는 구조화된 로깅으로 대체 (나중에 실제 서비스 연동)
    const errorReport = {
      type: 'exception',
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      context,
      userId: this.userId,
      breadcrumbs: this.breadcrumbs.slice(-10), // 최근 10개만
    };

    // 구조화된 에러 로그 (실제 서비스 연동 시 교체)
    console.error('[ErrorReport]', JSON.stringify(errorReport, null, 2));
  }

  captureMessage(
    message: string,
    severity: ErrorSeverity,
    context?: ErrorContext,
  ): void {
    // Sentry 예시:
    // Sentry.captureMessage(message, severity);

    const messageReport = {
      type: 'message',
      timestamp: new Date().toISOString(),
      message,
      severity,
      context,
      userId: this.userId,
    };

    if (
      severity === ErrorSeverity.ERROR ||
      severity === ErrorSeverity.CRITICAL
    ) {
      console.error('[ErrorReport]', JSON.stringify(messageReport, null, 2));
    } else {
      console.warn('[ErrorReport]', JSON.stringify(messageReport, null, 2));
    }
  }

  setUser(userId: string, _email?: string): void {
    this.userId = userId;
    // Sentry.setUser({ id: userId, email });
  }

  clearUser(): void {
    this.userId = undefined;
    // Sentry.setUser(null);
  }

  addBreadcrumb(
    message: string,
    category?: string,
    data?: Record<string, unknown>,
  ): void {
    this.breadcrumbs.push({
      message,
      category,
      data,
      timestamp: Date.now(),
    });

    // 최대 개수 초과 시 오래된 것 제거
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs = this.breadcrumbs.slice(-this.maxBreadcrumbs);
    }

    // Sentry.addBreadcrumb({ message, category, data });
  }
}

// 환경에 따라 적절한 리포터 선택
const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : true;

/**
 * 에러 리포터 싱글톤 인스턴스
 */
export const errorReporter: ErrorReporterService = isDev
  ? new DevErrorReporter()
  : new ProductionErrorReporter();

/**
 * 편의 함수들
 */
export function captureException(error: Error, context?: ErrorContext): void {
  errorReporter.captureException(error, context);
}

export function captureError(message: string, context?: ErrorContext): void {
  errorReporter.captureMessage(message, ErrorSeverity.ERROR, context);
}

export function captureWarning(message: string, context?: ErrorContext): void {
  errorReporter.captureMessage(message, ErrorSeverity.WARNING, context);
}

export function setErrorReportingUser(userId: string, email?: string): void {
  errorReporter.setUser(userId, email);
}

export function clearErrorReportingUser(): void {
  errorReporter.clearUser();
}

export function addErrorBreadcrumb(
  message: string,
  category?: string,
  data?: Record<string, unknown>,
): void {
  errorReporter.addBreadcrumb(message, category, data);
}
