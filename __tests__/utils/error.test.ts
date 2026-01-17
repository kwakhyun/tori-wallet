/**
 * 에러 유틸 테스트
 * 에러 유틸리티 함수 테스트
 */

import {
  createAppError,
  toAppError,
  isAppError,
  getUserMessage,
  logError,
  ErrorCode,
  AppError,
} from '../../src/utils/error';

describe('Error Utils', () => {
  describe('ErrorCode enum', () => {
    it('should have all error codes defined', () => {
      expect(ErrorCode.UNKNOWN).toBe('UNKNOWN');
      expect(ErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR');
      expect(ErrorCode.TIMEOUT).toBe('TIMEOUT');
      expect(ErrorCode.INVALID_MNEMONIC).toBe('INVALID_MNEMONIC');
      expect(ErrorCode.WALLET_NOT_FOUND).toBe('WALLET_NOT_FOUND');
      expect(ErrorCode.WALLET_LOCKED).toBe('WALLET_LOCKED');
      expect(ErrorCode.INSUFFICIENT_FUNDS).toBe('INSUFFICIENT_FUNDS');
      expect(ErrorCode.TRANSACTION_FAILED).toBe('TRANSACTION_FAILED');
      expect(ErrorCode.TRANSACTION_REJECTED).toBe('TRANSACTION_REJECTED');
    });
  });

  describe('createAppError', () => {
    it('should create an AppError with code and message', () => {
      const error = createAppError(ErrorCode.NETWORK_ERROR);
      expect(error.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(error.message).toBe('네트워크 연결을 확인해주세요.');
    });

    it('should include details when provided', () => {
      const error = createAppError(ErrorCode.UNKNOWN, { extra: 'info' });
      expect(error.details).toEqual({ extra: 'info' });
    });

    it('should include original error when provided', () => {
      const originalError = new Error('Original');
      const error = createAppError(ErrorCode.UNKNOWN, undefined, originalError);
      expect(error.originalError).toBe(originalError);
    });

    it('should return correct message for each error code', () => {
      expect(createAppError(ErrorCode.INVALID_MNEMONIC).message).toBe(
        '올바르지 않은 복구 구문입니다.',
      );
      expect(createAppError(ErrorCode.WALLET_NOT_FOUND).message).toBe(
        '지갑을 찾을 수 없습니다.',
      );
      expect(createAppError(ErrorCode.WALLET_LOCKED).message).toContain(
        '지갑이 잠겨있습니다',
      );
      expect(createAppError(ErrorCode.INSUFFICIENT_FUNDS).message).toBe(
        '잔액이 부족합니다.',
      );
      expect(createAppError(ErrorCode.INSUFFICIENT_GAS).message).toBe(
        '가스비가 부족합니다.',
      );
      expect(createAppError(ErrorCode.TRANSACTION_FAILED).message).toBe(
        '트랜잭션이 실패했습니다.',
      );
      expect(createAppError(ErrorCode.PIN_INCORRECT).message).toContain('PIN');
      expect(createAppError(ErrorCode.BIOMETRIC_FAILED).message).toContain(
        '생체인증',
      );
    });
  });

  describe('toAppError', () => {
    it('should return AppError as-is', () => {
      const appError = createAppError(ErrorCode.NETWORK_ERROR);
      expect(toAppError(appError)).toBe(appError);
    });

    it('should convert network error', () => {
      const error = new Error('Network request failed');
      const appError = toAppError(error);
      expect(appError.code).toBe(ErrorCode.NETWORK_ERROR);
    });

    it('should convert fetch error', () => {
      const error = new Error('Failed to fetch');
      const appError = toAppError(error);
      expect(appError.code).toBe(ErrorCode.NETWORK_ERROR);
    });

    it('should convert timeout error', () => {
      const error = new Error('Request timeout');
      const appError = toAppError(error);
      expect(appError.code).toBe(ErrorCode.TIMEOUT);
    });

    it('should convert insufficient funds error', () => {
      const error = new Error('Insufficient funds for gas');
      const appError = toAppError(error);
      expect(appError.code).toBe(ErrorCode.INSUFFICIENT_FUNDS);
    });

    it('should convert nonce error', () => {
      const error = new Error('Nonce too low');
      const appError = toAppError(error);
      expect(appError.code).toBe(ErrorCode.NONCE_TOO_LOW);
    });

    it('should convert user rejected error', () => {
      const error = new Error('User rejected the request');
      const appError = toAppError(error);
      expect(appError.code).toBe(ErrorCode.TRANSACTION_REJECTED);
    });

    it('should convert user denied error', () => {
      const error = new Error('User denied transaction');
      const appError = toAppError(error);
      expect(appError.code).toBe(ErrorCode.TRANSACTION_REJECTED);
    });

    it('should convert unknown error', () => {
      const error = new Error('Some random error');
      const appError = toAppError(error);
      expect(appError.code).toBe(ErrorCode.UNKNOWN);
      expect(appError.details).toBe('Some random error');
    });

    it('should handle non-Error objects', () => {
      const appError = toAppError('string error');
      expect(appError.code).toBe(ErrorCode.UNKNOWN);
      expect(appError.details).toBe('string error');
    });

    it('should handle null', () => {
      const appError = toAppError(null);
      expect(appError.code).toBe(ErrorCode.UNKNOWN);
    });

    it('should handle undefined', () => {
      const appError = toAppError(undefined);
      expect(appError.code).toBe(ErrorCode.UNKNOWN);
    });
  });

  describe('isAppError', () => {
    it('should return true for valid AppError', () => {
      const appError = createAppError(ErrorCode.NETWORK_ERROR);
      expect(isAppError(appError)).toBe(true);
    });

    it('should return false for regular Error', () => {
      const error = new Error('Regular error');
      expect(isAppError(error)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isAppError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isAppError(undefined)).toBe(false);
    });

    it('should return false for string', () => {
      expect(isAppError('error')).toBe(false);
    });

    it('should return false for object without code', () => {
      expect(isAppError({ message: 'test' })).toBe(false);
    });

    it('should return false for object with invalid code', () => {
      expect(isAppError({ code: 'INVALID_CODE', message: 'test' })).toBe(false);
    });

    it('should return true for object with valid code and message', () => {
      const obj: AppError = {
        code: ErrorCode.NETWORK_ERROR,
        message: '네트워크 에러',
      };
      expect(isAppError(obj)).toBe(true);
    });
  });

  describe('getUserMessage', () => {
    it('should return message from AppError', () => {
      const appError = createAppError(ErrorCode.NETWORK_ERROR);
      expect(getUserMessage(appError)).toBe('네트워크 연결을 확인해주세요.');
    });

    it('should convert and return message from regular Error', () => {
      const error = new Error('Network failed');
      expect(getUserMessage(error)).toBe('네트워크 연결을 확인해주세요.');
    });

    it('should return unknown error message for unknown errors', () => {
      const error = new Error('Something weird');
      expect(getUserMessage(error)).toBe('알 수 없는 오류가 발생했습니다.');
    });
  });

  describe('logError', () => {
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should log error without context', () => {
      logError(new Error('Test error'));
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log error with context', () => {
      logError(new Error('Test error'), 'TestContext');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should handle string error', () => {
      logError('String error');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should handle AppError', () => {
      const appError = createAppError(ErrorCode.NETWORK_ERROR);
      logError(appError, 'Network');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});
