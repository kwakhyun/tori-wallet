/**
 * 에러 리포터 테스트
 * 에러 리포팅 서비스 테스트
 */

import {
  errorReporter,
  captureException,
  captureError,
  captureWarning,
  setErrorReportingUser,
  clearErrorReportingUser,
  addErrorBreadcrumb,
  ErrorSeverity,
} from '../../src/utils/errorReporter';

describe('ErrorReporter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('errorReporter instance', () => {
    it('should be defined', () => {
      expect(errorReporter).toBeDefined();
    });

    it('should have captureException method', () => {
      expect(typeof errorReporter.captureException).toBe('function');
    });

    it('should have captureMessage method', () => {
      expect(typeof errorReporter.captureMessage).toBe('function');
    });

    it('should have setUser method', () => {
      expect(typeof errorReporter.setUser).toBe('function');
    });

    it('should have clearUser method', () => {
      expect(typeof errorReporter.clearUser).toBe('function');
    });

    it('should have addBreadcrumb method', () => {
      expect(typeof errorReporter.addBreadcrumb).toBe('function');
    });
  });

  describe('captureException', () => {
    it('should capture an exception without throwing', () => {
      const error = new Error('Test error');

      expect(() => {
        captureException(error);
      }).not.toThrow();
    });

    it('should capture an exception with context', () => {
      const error = new Error('Test error with context');
      const context = {
        userId: 'user-123',
        screenName: 'HomeScreen',
        action: 'fetchBalance',
      };

      expect(() => {
        captureException(error, context);
      }).not.toThrow();
    });

    it('should handle errors with extra data', () => {
      const error = new Error('Test error with extra');
      const context = {
        extra: {
          chainId: 1,
          tokenAddress: '0x1234',
        },
      };

      expect(() => {
        captureException(error, context);
      }).not.toThrow();
    });
  });

  describe('captureError', () => {
    it('should capture error message', () => {
      expect(() => {
        captureError('Something went wrong');
      }).not.toThrow();
    });

    it('should capture error message with context', () => {
      expect(() => {
        captureError('Failed to load balance', {
          walletAddress: '0x1234',
          chainId: 1,
        });
      }).not.toThrow();
    });
  });

  describe('captureWarning', () => {
    it('should capture warning message', () => {
      expect(() => {
        captureWarning('Deprecated API usage');
      }).not.toThrow();
    });

    it('should capture warning message with context', () => {
      expect(() => {
        captureWarning('Rate limit approaching', {
          action: 'apiCall',
        });
      }).not.toThrow();
    });
  });

  describe('User Management', () => {
    it('should set user without throwing', () => {
      expect(() => {
        setErrorReportingUser('user-123', 'user@example.com');
      }).not.toThrow();
    });

    it('should set user without email', () => {
      expect(() => {
        setErrorReportingUser('user-456');
      }).not.toThrow();
    });

    it('should clear user without throwing', () => {
      expect(() => {
        clearErrorReportingUser();
      }).not.toThrow();
    });
  });

  describe('Breadcrumbs', () => {
    it('should add breadcrumb without throwing', () => {
      expect(() => {
        addErrorBreadcrumb('User tapped send button');
      }).not.toThrow();
    });

    it('should add breadcrumb with category', () => {
      expect(() => {
        addErrorBreadcrumb('Navigation to SendScreen', 'navigation');
      }).not.toThrow();
    });

    it('should add breadcrumb with data', () => {
      expect(() => {
        addErrorBreadcrumb('Transaction submitted', 'transaction', {
          hash: '0xabc123',
          value: '1.5 ETH',
        });
      }).not.toThrow();
    });

    it('should handle multiple breadcrumbs', () => {
      expect(() => {
        for (let i = 0; i < 10; i++) {
          addErrorBreadcrumb(`Action ${i}`, 'test');
        }
      }).not.toThrow();
    });
  });

  describe('ErrorSeverity', () => {
    it('should have all severity levels defined', () => {
      expect(ErrorSeverity.DEBUG).toBe('debug');
      expect(ErrorSeverity.INFO).toBe('info');
      expect(ErrorSeverity.WARNING).toBe('warning');
      expect(ErrorSeverity.ERROR).toBe('error');
      expect(ErrorSeverity.CRITICAL).toBe('critical');
    });
  });

  describe('Error Context', () => {
    it('should accept all context fields', () => {
      const error = new Error('Full context error');
      const context = {
        userId: 'user-123',
        walletAddress: '0x1234567890123456789012345678901234567890',
        chainId: 137,
        screenName: 'SwapScreen',
        action: 'executeSwap',
        extra: {
          sellToken: 'ETH',
          buyToken: 'USDC',
          amount: '1.5',
        },
      };

      expect(() => {
        captureException(error, context);
      }).not.toThrow();
    });

    it('should handle empty context', () => {
      const error = new Error('No context error');

      expect(() => {
        captureException(error, {});
      }).not.toThrow();
    });
  });

  describe('Integration with error.ts', () => {
    it('should work with logError function', () => {
      // logError는 내부적으로 errorReporter를 사용
      const { logError } = require('../../src/utils/error');

      expect(() => {
        logError(new Error('Integration test error'), 'TestContext');
      }).not.toThrow();
    });
  });
});
