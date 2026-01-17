/**
 * 로거 유틸리티 (프로덕션 환경에서 민감 로그 숨김)
 */

const isDev = __DEV__;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  /** 프로덕션에서도 로그 출력 여부 */
  forceLog?: boolean;
  /** 로그에 포함할 컨텍스트 정보 */
  context?: string;
}

/**
 * 로그 메시지 포맷팅
 */
function formatMessage(context: string | undefined, message: string): string {
  return context ? `[${context}] ${message}` : message;
}

/**
 * 민감한 데이터 마스킹
 */
function maskSensitiveData(data: unknown): unknown {
  if (typeof data === 'string') {
    // 프라이빗 키 마스킹 (0x로 시작하는 64자리 hex)
    if (/^0x[a-fA-F0-9]{64}$/.test(data)) {
      return '0x****...****';
    }
    // 니모닉 마스킹 (12단어 또는 24단어)
    if (data.split(' ').length >= 12) {
      const words = data.split(' ');
      if (words.every(word => /^[a-z]+$/.test(word))) {
        return '****...****';
      }
    }
    // 긴 주소 축약
    if (/^0x[a-fA-F0-9]{40}$/.test(data)) {
      return `${data.slice(0, 6)}...${data.slice(-4)}`;
    }
  }
  return data;
}

/**
 * 로그 출력
 */
function log(
  level: LogLevel,
  message: string,
  data?: unknown,
  options?: LoggerOptions,
): void {
  const { forceLog = false, context } = options || {};

  // 프로덕션에서는 forceLog가 true이거나 error 레벨만 출력
  if (!isDev && !forceLog && level !== 'error') {
    return;
  }

  const formattedMessage = formatMessage(context, message);
  const maskedData = data !== undefined ? maskSensitiveData(data) : undefined;

  switch (level) {
    case 'debug':
      if (maskedData !== undefined) {
        console.debug(formattedMessage, maskedData);
      } else {
        console.debug(formattedMessage);
      }
      break;
    case 'info':
      if (maskedData !== undefined) {
        console.info(formattedMessage, maskedData);
      } else {
        console.info(formattedMessage);
      }
      break;
    case 'warn':
      if (maskedData !== undefined) {
        console.warn(formattedMessage, maskedData);
      } else {
        console.warn(formattedMessage);
      }
      break;
    case 'error':
      if (maskedData !== undefined) {
        console.error(formattedMessage, maskedData);
      } else {
        console.error(formattedMessage);
      }
      break;
  }
}

/**
 * Logger 클래스
 * 컨텍스트별로 로거 인스턴스 생성 가능
 */
class Logger {
  private context?: string;

  constructor(context?: string) {
    this.context = context;
  }

  debug(message: string, data?: unknown, options?: LoggerOptions): void {
    log('debug', message, data, { ...options, context: this.context });
  }

  info(message: string, data?: unknown, options?: LoggerOptions): void {
    log('info', message, data, { ...options, context: this.context });
  }

  warn(message: string, data?: unknown, options?: LoggerOptions): void {
    log('warn', message, data, { ...options, context: this.context });
  }

  error(message: string, data?: unknown, options?: LoggerOptions): void {
    log('error', message, data, { ...options, context: this.context });
  }

  /**
   * 새로운 컨텍스트로 로거 생성
   */
  child(context: string): Logger {
    const prefix = this.context ? `${this.context}:${context}` : context;
    return new Logger(prefix);
  }
}

// 기본 로거 인스턴스
export const logger = new Logger();

// 서비스별 로거 생성 함수
export function createLogger(context: string): Logger {
  return new Logger(context);
}

// 편의 함수들 (기존 console.* 대체)
export const logDebug = (message: string, data?: unknown) =>
  logger.debug(message, data);
export const logInfo = (message: string, data?: unknown) =>
  logger.info(message, data);
export const logWarn = (message: string, data?: unknown) =>
  logger.warn(message, data);
export const logError = (message: string, data?: unknown) =>
  logger.error(message, data);

export default logger;
