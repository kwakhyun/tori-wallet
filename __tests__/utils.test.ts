/**
 * Tori Wallet - Utils Tests
 * 유틸리티 함수 테스트
 */

import { shortenAddress, isValidAddress } from '../src/utils/address';
import {
  formatCurrency,
  formatCrypto,
  formatNumber,
  formatPercentage,
} from '../src/utils/format';
import {
  createAppError,
  toAppError,
  isAppError,
  getUserMessage,
  ErrorCode,
} from '../src/utils/error';

describe('Address Utils', () => {
  describe('shortenAddress', () => {
    it('should shorten a valid address', () => {
      const address = '0x1234567890123456789012345678901234567890';
      expect(shortenAddress(address)).toBe('0x1234...7890');
    });

    it('should handle custom lengths', () => {
      const address = '0x1234567890123456789012345678901234567890';
      expect(shortenAddress(address, 6, 6)).toBe('0x1234...567890');
    });

    it('should return short addresses as-is', () => {
      const address = '0x1234';
      expect(shortenAddress(address)).toBe('0x1234');
    });
  });

  describe('isValidAddress', () => {
    it('should validate correct addresses', () => {
      expect(isValidAddress('0x1234567890123456789012345678901234567890')).toBe(
        true,
      );
    });

    it('should reject invalid addresses', () => {
      expect(isValidAddress('0x1234')).toBe(false);
      expect(isValidAddress('invalid')).toBe(false);
      expect(isValidAddress('')).toBe(false);
    });
  });
});

describe('Format Utils', () => {
  describe('formatCurrency', () => {
    it('should format USD currency', () => {
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
    });

    it('should format with different currencies', () => {
      expect(formatCurrency(1234.56, 'KRW')).toContain('1,234');
    });
  });

  describe('formatCrypto', () => {
    it('should format crypto amounts', () => {
      expect(formatCrypto(1.23456789, 'ETH')).toBe('1.234568 ETH');
    });

    it('should handle small amounts', () => {
      expect(formatCrypto(0.000001, 'ETH')).toBe('0.000001 ETH');
    });
  });

  describe('formatNumber', () => {
    it('should format large numbers', () => {
      expect(formatNumber(1234567.89)).toBe('1,234,567.89');
    });
  });

  describe('formatPercentage', () => {
    it('should format positive percentages', () => {
      expect(formatPercentage(5.5)).toBe('+5.50%');
    });

    it('should format negative percentages', () => {
      expect(formatPercentage(-3.2)).toBe('-3.20%');
    });
  });
});

describe('Error Utils', () => {
  describe('createAppError', () => {
    it('should create an AppError', () => {
      const error = createAppError(ErrorCode.NETWORK_ERROR);
      expect(error.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(error.message).toBe('네트워크 연결을 확인해주세요.');
    });
  });

  describe('toAppError', () => {
    it('should convert Error to AppError', () => {
      const error = new Error('Network request failed');
      const appError = toAppError(error);
      expect(appError.code).toBe(ErrorCode.NETWORK_ERROR);
    });

    it('should return AppError as-is', () => {
      const original = createAppError(ErrorCode.INSUFFICIENT_FUNDS);
      const result = toAppError(original);
      expect(result).toBe(original);
    });
  });

  describe('isAppError', () => {
    it('should identify AppError', () => {
      const error = createAppError(ErrorCode.TIMEOUT);
      expect(isAppError(error)).toBe(true);
    });

    it('should reject non-AppError', () => {
      expect(isAppError(new Error('test'))).toBe(false);
      expect(isAppError({ code: 'INVALID' })).toBe(false);
    });
  });

  describe('getUserMessage', () => {
    it('should return user-friendly message', () => {
      const error = new Error('insufficient funds for gas');
      expect(getUserMessage(error)).toBe('잔액이 부족합니다.');
    });
  });
});

describe('Format Utils - Additional', () => {
  describe('formatNumber', () => {
    it('should handle zero', () => {
      expect(formatNumber(0)).toBe('0');
    });

    it('should handle negative numbers', () => {
      expect(formatNumber(-1234.56)).toBe('-1,234.56');
    });

    it('should handle string input', () => {
      expect(formatNumber('1234.56')).toBe('1,234.56');
    });

    it('should handle NaN input', () => {
      expect(formatNumber('not-a-number')).toBe('0');
    });

    it('should respect decimal places', () => {
      expect(formatNumber(1.23456789, 2)).toBe('1.23');
    });
  });

  describe('formatCurrency', () => {
    it('should handle zero', () => {
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('should handle NaN input', () => {
      expect(formatCurrency('invalid')).toBe('$0.00');
    });

    it('should handle string input', () => {
      expect(formatCurrency('1234.56')).toBe('$1,234.56');
    });
  });

  describe('formatCrypto', () => {
    it('should handle zero', () => {
      expect(formatCrypto(0, 'ETH')).toBe('0 ETH');
    });

    it('should handle very small amounts', () => {
      const result = formatCrypto(0.0000001, 'ETH');
      expect(result).toContain('ETH');
    });
  });
});

describe('Error Utils - Additional', () => {
  describe('toAppError', () => {
    it('should handle timeout errors', () => {
      const error = new Error('Request timeout');
      const appError = toAppError(error);
      expect(appError.code).toBe(ErrorCode.TIMEOUT);
    });

    it('should handle nonce errors', () => {
      const error = new Error('nonce too low');
      const appError = toAppError(error);
      expect(appError.code).toBe(ErrorCode.NONCE_TOO_LOW);
    });

    it('should handle user rejection', () => {
      const error = new Error('user rejected transaction');
      const appError = toAppError(error);
      expect(appError.code).toBe(ErrorCode.TRANSACTION_REJECTED);
    });

    it('should handle unknown errors', () => {
      const appError = toAppError('string error');
      expect(appError.code).toBe(ErrorCode.UNKNOWN);
    });

    it('should handle null/undefined', () => {
      const appError = toAppError(null);
      expect(appError.code).toBe(ErrorCode.UNKNOWN);
    });
  });

  describe('createAppError with details', () => {
    it('should include details', () => {
      const error = createAppError(ErrorCode.NETWORK_ERROR, {
        url: 'test.com',
      });
      expect(error.details).toEqual({ url: 'test.com' });
    });

    it('should include original error', () => {
      const original = new Error('Original');
      const error = createAppError(ErrorCode.UNKNOWN, undefined, original);
      expect(error.originalError).toBe(original);
    });
  });
});
