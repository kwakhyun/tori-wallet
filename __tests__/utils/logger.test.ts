/**
 * Tori Wallet - Logger Utils Tests
 * 로거 유틸리티 테스트
 */

import {
  createLogger,
  logger,
  logDebug,
  logInfo,
  logWarn,
  logError,
} from '../../src/utils/logger';

describe('Logger Utils', () => {
  let consoleSpy: {
    debug: jest.SpyInstance;
    info: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    consoleSpy = {
      debug: jest.spyOn(console, 'debug').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createLogger', () => {
    it('should create a logger with context', () => {
      const testLogger = createLogger('TestContext');
      expect(testLogger).toBeDefined();
    });
  });

  describe('logger instance', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should have debug, info, warn, error methods', () => {
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should have child method', () => {
      expect(typeof logger.child).toBe('function');
      const childLogger = logger.child('Child');
      expect(childLogger).toBeDefined();
    });
  });

  describe('Logger methods (in dev mode)', () => {
    // __DEV__가 true인 경우 로그가 출력됨
    it('should call console.error for error level', () => {
      logger.error('test error');
      // error 레벨은 항상 출력됨
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should call console.error with data', () => {
      logger.error('test error', { key: 'value' });
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });

  describe('convenience functions', () => {
    it('should export logDebug function', () => {
      expect(typeof logDebug).toBe('function');
    });

    it('should export logInfo function', () => {
      expect(typeof logInfo).toBe('function');
    });

    it('should export logWarn function', () => {
      expect(typeof logWarn).toBe('function');
    });

    it('should export logError function', () => {
      expect(typeof logError).toBe('function');
      logError('test');
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });

  describe('sensitive data masking', () => {
    it('should mask private key patterns in error logs', () => {
      const privateKey =
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      logger.error('Key:', privateKey);
      // 로그가 호출되었는지 확인
      expect(consoleSpy.error).toHaveBeenCalled();
      // 마스킹된 값이 전달되었는지 확인
      const callArg = consoleSpy.error.mock.calls[0][1];
      expect(callArg).toBe('0x****...****');
    });

    it('should mask mnemonic patterns in error logs', () => {
      const mnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      logger.error('Mnemonic:', mnemonic);
      expect(consoleSpy.error).toHaveBeenCalled();
      const callArg = consoleSpy.error.mock.calls[0][1];
      expect(callArg).toBe('****...****');
    });

    it('should shorten Ethereum addresses in error logs', () => {
      const address = '0x1234567890123456789012345678901234567890';
      logger.error('Address:', address);
      expect(consoleSpy.error).toHaveBeenCalled();
      const callArg = consoleSpy.error.mock.calls[0][1];
      expect(callArg).toBe('0x1234...7890');
    });
  });

  describe('child logger', () => {
    it('should create child logger with prefixed context', () => {
      const parentLogger = createLogger('Parent');
      const childLogger = parentLogger.child('Child');

      childLogger.error('test message');
      expect(consoleSpy.error).toHaveBeenCalled();
      const callArg = consoleSpy.error.mock.calls[0][0];
      expect(callArg).toContain('Parent:Child');
    });
  });
});

describe('Logger Utils - Additional Coverage', () => {
  let consoleSpy: {
    debug: jest.SpyInstance;
    info: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    consoleSpy = {
      debug: jest.spyOn(console, 'debug').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('logDebug convenience function', () => {
    it('should call with message only', () => {
      logDebug('debug message');
      // debug는 DEV 모드에서만 동작
    });

    it('should call with message and data', () => {
      logDebug('debug message', { key: 'value' });
    });
  });

  describe('logInfo convenience function', () => {
    it('should call with message only', () => {
      logInfo('info message');
    });

    it('should call with message and data', () => {
      logInfo('info message', { key: 'value' });
    });
  });

  describe('logWarn convenience function', () => {
    it('should call with message only', () => {
      logWarn('warn message');
    });

    it('should call with message and data', () => {
      logWarn('warn message', { key: 'value' });
    });
  });

  describe('Logger with various data types', () => {
    it('should handle null data', () => {
      logger.error('null:', null);
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should handle undefined data', () => {
      logger.error('undefined:', undefined);
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should handle array data', () => {
      logger.error('array:', [1, 2, 3]);
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should handle nested object data', () => {
      logger.error('nested:', { a: { b: { c: 1 } } });
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should handle Error objects', () => {
      logger.error('error:', new Error('test error'));
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });
});
