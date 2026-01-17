/**
 * Query Client 테스트
 * React Query 클라이언트 설정 테스트
 */

const mockAddEventListener = jest.fn(() => jest.fn());
const mockSetOnline = jest.fn();
const mockSetFocused = jest.fn();
const mockAppStateAddEventListener = jest.fn(() => ({ remove: jest.fn() }));

// QueryClient 호출 추적하여 옵션 캡처
let capturedQueryClientOptions: any = null;

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: mockAddEventListener,
}));

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: mockAppStateAddEventListener,
  },
}));

jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn().mockImplementation(options => {
    capturedQueryClientOptions = options;
    return {
      setDefaultOptions: jest.fn(),
      getQueryCache: jest.fn(() => ({
        subscribe: jest.fn(() => jest.fn()),
      })),
      getMutationCache: jest.fn(() => ({
        subscribe: jest.fn(() => jest.fn()),
      })),
    };
  }),
  onlineManager: {
    setOnline: mockSetOnline,
  },
  focusManager: {
    setFocused: mockSetFocused,
  },
}));

// errorReporter 모킹
jest.mock('../../src/utils/errorReporter', () => ({
  captureException: jest.fn(),
}));

describe('QueryClient Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedQueryClientOptions = null;
  });

  describe('setupNetworkListener', () => {
    it('should be exported as a function', () => {
      const module = require('../../src/config/queryClient');
      expect(typeof module.setupNetworkListener).toBe('function');
    });

    it('should return an unsubscribe function', () => {
      const module = require('../../src/config/queryClient');
      const unsubscribe = module.setupNetworkListener();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should register a netinfo listener', () => {
      jest.resetModules();
      const module = require('../../src/config/queryClient');
      module.setupNetworkListener();
      expect(mockAddEventListener).toHaveBeenCalled();
    });

    it('should handle online state', () => {
      jest.resetModules();
      type NetInfoCallback = (state: {
        isConnected: boolean;
        isInternetReachable: boolean;
      }) => void;
      (mockAddEventListener as jest.Mock).mockImplementation(
        (callback: NetInfoCallback) => {
          callback({ isConnected: true, isInternetReachable: true });
          return jest.fn();
        },
      );
      const module = require('../../src/config/queryClient');
      module.setupNetworkListener();
      expect(mockSetOnline).toHaveBeenCalledWith(true);
    });

    it('should handle offline state', () => {
      jest.resetModules();
      type NetInfoCallback = (state: {
        isConnected: boolean;
        isInternetReachable: boolean;
      }) => void;
      (mockAddEventListener as jest.Mock).mockImplementation(
        (callback: NetInfoCallback) => {
          callback({ isConnected: false, isInternetReachable: false });
          return jest.fn();
        },
      );
      const module = require('../../src/config/queryClient');
      module.setupNetworkListener();
      expect(mockSetOnline).toHaveBeenCalledWith(false);
    });
  });

  describe('setupAppFocusListener', () => {
    it('should be exported as a function', () => {
      const module = require('../../src/config/queryClient');
      expect(typeof module.setupAppFocusListener).toBe('function');
    });

    it('should return an unsubscribe function', () => {
      const module = require('../../src/config/queryClient');
      const unsubscribe = module.setupAppFocusListener();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should register an AppState listener', () => {
      jest.resetModules();
      const module = require('../../src/config/queryClient');
      module.setupAppFocusListener();
      expect(mockAppStateAddEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function),
      );
    });

    it('should handle active app state', () => {
      jest.resetModules();
      type AppStateCallback = (state: string) => void;
      (mockAppStateAddEventListener as jest.Mock).mockImplementation(
        (_event: string, callback: AppStateCallback) => {
          callback('active');
          return { remove: jest.fn() };
        },
      );
      const module = require('../../src/config/queryClient');
      module.setupAppFocusListener();
      expect(mockSetFocused).toHaveBeenCalledWith(true);
    });

    it('should handle background app state', () => {
      jest.resetModules();
      type AppStateCallback = (state: string) => void;
      (mockAppStateAddEventListener as jest.Mock).mockImplementation(
        (_event: string, callback: AppStateCallback) => {
          callback('background');
          return { remove: jest.fn() };
        },
      );
      const module = require('../../src/config/queryClient');
      module.setupAppFocusListener();
      expect(mockSetFocused).toHaveBeenCalledWith(false);
    });
  });

  describe('createQueryClient', () => {
    it('should be exported as a function', () => {
      const module = require('../../src/config/queryClient');
      expect(typeof module.createQueryClient).toBe('function');
    });

    it('should return a QueryClient instance', () => {
      const module = require('../../src/config/queryClient');
      const client = module.createQueryClient();
      expect(client).toBeDefined();
    });

    it('should create client with default options', () => {
      const { QueryClient } = require('@tanstack/react-query');
      const module = require('../../src/config/queryClient');
      module.createQueryClient();
      expect(QueryClient).toHaveBeenCalled();
    });
  });

  describe('createQueryClient - retry logic', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it('should configure retry to return false after 3 failures', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      expect(capturedQueryClientOptions).toBeDefined();
      const retryFn = capturedQueryClientOptions.defaultOptions.queries.retry;

      // After 3 failures, should return false
      expect(retryFn(3, new Error('network error'))).toBe(false);
      expect(retryFn(4, new Error('network error'))).toBe(false);
    });

    it('should retry on network errors', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      const retryFn = capturedQueryClientOptions.defaultOptions.queries.retry;

      // 네트워크 에러는 재시도해야 함
      expect(retryFn(0, new Error('network error'))).toBe(true);
      expect(retryFn(1, new Error('Network connection failed'))).toBe(true);
      expect(retryFn(2, new Error('fetch failed'))).toBe(true);
    });

    it('should retry on timeout errors', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      const retryFn = capturedQueryClientOptions.defaultOptions.queries.retry;

      expect(retryFn(0, new Error('Request timeout'))).toBe(true);
      expect(retryFn(1, new Error('ETIMEDOUT'))).toBe(true);
    });

    it('should retry on connection errors', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      const retryFn = capturedQueryClientOptions.defaultOptions.queries.retry;

      expect(retryFn(0, new Error('ECONNREFUSED'))).toBe(true);
      expect(retryFn(1, new Error('connection refused'))).toBe(true);
    });

    it('should retry on rate limit errors', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      const retryFn = capturedQueryClientOptions.defaultOptions.queries.retry;

      expect(retryFn(0, new Error('rate limit exceeded'))).toBe(true);
      expect(retryFn(1, new Error('Error 429: Too Many Requests'))).toBe(true);
    });

    it('should retry on 5xx server errors', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      const retryFn = capturedQueryClientOptions.defaultOptions.queries.retry;

      expect(retryFn(0, new Error('500 Internal Server Error'))).toBe(true);
      expect(retryFn(1, new Error('502 Bad Gateway'))).toBe(true);
      expect(retryFn(2, new Error('503 Service Unavailable'))).toBe(true);
    });

    it('should retry on HTTP status object with 5xx', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      const retryFn = capturedQueryClientOptions.defaultOptions.queries.retry;

      expect(retryFn(0, { status: 500 })).toBe(true);
      expect(retryFn(1, { status: 502 })).toBe(true);
      expect(retryFn(2, { status: 503 })).toBe(true);
    });

    it('should retry on HTTP status 429', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      const retryFn = capturedQueryClientOptions.defaultOptions.queries.retry;

      expect(retryFn(0, { status: 429 })).toBe(true);
    });

    it('should NOT retry on 4xx client errors (except 429)', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      const retryFn = capturedQueryClientOptions.defaultOptions.queries.retry;

      expect(retryFn(0, { status: 400 })).toBe(false);
      expect(retryFn(0, { status: 401 })).toBe(false);
      expect(retryFn(0, { status: 403 })).toBe(false);
      expect(retryFn(0, { status: 404 })).toBe(false);
    });

    it('should NOT retry on non-retryable errors', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      const retryFn = capturedQueryClientOptions.defaultOptions.queries.retry;

      expect(retryFn(0, new Error('Invalid input'))).toBe(false);
      expect(retryFn(0, new Error('User not found'))).toBe(false);
      expect(retryFn(0, new Error('Permission denied'))).toBe(false);
    });

    it('should NOT retry on non-Error objects without status', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      const retryFn = capturedQueryClientOptions.defaultOptions.queries.retry;

      expect(retryFn(0, 'string error')).toBe(false);
      expect(retryFn(0, 123)).toBe(false);
      expect(retryFn(0, null)).toBe(false);
      expect(retryFn(0, undefined)).toBe(false);
      expect(retryFn(0, { message: 'no status' })).toBe(false);
    });

    it('should configure mutation retry to return false after 2 failures', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      const retryFn = capturedQueryClientOptions.defaultOptions.mutations.retry;

      expect(retryFn(2, new Error('network error'))).toBe(false);
      expect(retryFn(3, new Error('network error'))).toBe(false);
    });

    it('should retry mutations on retryable errors', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      const retryFn = capturedQueryClientOptions.defaultOptions.mutations.retry;

      expect(retryFn(0, new Error('network error'))).toBe(true);
      expect(retryFn(1, new Error('timeout'))).toBe(true);
    });
  });

  describe('createQueryClient - retryDelay logic', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it('should return delay with exponential backoff', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      const retryDelayFn =
        capturedQueryClientOptions.defaultOptions.queries.retryDelay;

      // 기본 딜레이 1000ms, 지수적 증가
      const delay0 = retryDelayFn(0);
      const delay1 = retryDelayFn(1);
      const delay2 = retryDelayFn(2);

      // 1차 시도: 기본 1000 * 2^0 = 1000, 지터 추가 (0-25%)
      expect(delay0).toBeGreaterThanOrEqual(1000);
      expect(delay0).toBeLessThanOrEqual(1250);

      // 2차 시도: 기본 1000 * 2^1 = 2000, 지터 추가
      expect(delay1).toBeGreaterThanOrEqual(2000);
      expect(delay1).toBeLessThanOrEqual(2500);

      // 3차 시도: 기본 1000 * 2^2 = 4000, 지터 추가
      expect(delay2).toBeGreaterThanOrEqual(4000);
      expect(delay2).toBeLessThanOrEqual(5000);
    });

    it('should cap delay at 30 seconds', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      const retryDelayFn =
        capturedQueryClientOptions.defaultOptions.queries.retryDelay;

      // 높은 시도 횟수에서는 딜레이가 30000으로 제한되어야 함
      const delay10 = retryDelayFn(10);

      // 최대 딜레이 30000 + 25% 지터 = 최대 37500
      expect(delay10).toBeLessThanOrEqual(37500);
      expect(delay10).toBeGreaterThanOrEqual(30000);
    });

    it('should apply jitter to prevent thundering herd', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      const retryDelayFn =
        capturedQueryClientOptions.defaultOptions.queries.retryDelay;

      // 랜덤성 확인을 위해 여러 번 실행
      const delays = Array.from({ length: 10 }, () => retryDelayFn(1));

      // 지터로 인해 약간의 변동이 있어야 함 (모두 동일하지 않음)
      // 드물게 모두 같을 수 있으므로 범위만 확인
      delays.forEach(d => {
        expect(d).toBeGreaterThanOrEqual(2000);
        expect(d).toBeLessThanOrEqual(2500);
      });
    });

    it('should configure mutation retryDelay the same way', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      const retryDelayFn =
        capturedQueryClientOptions.defaultOptions.mutations.retryDelay;

      const delay0 = retryDelayFn(0);
      expect(delay0).toBeGreaterThanOrEqual(1000);
      expect(delay0).toBeLessThanOrEqual(1250);
    });
  });

  describe('createQueryClient - default options', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it('should set staleTime to 30 seconds', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      expect(capturedQueryClientOptions.defaultOptions.queries.staleTime).toBe(
        30000,
      );
    });

    it('should set gcTime to 5 minutes', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      expect(capturedQueryClientOptions.defaultOptions.queries.gcTime).toBe(
        300000,
      );
    });

    it('should enable refetchOnWindowFocus', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      expect(
        capturedQueryClientOptions.defaultOptions.queries.refetchOnWindowFocus,
      ).toBe(true);
    });

    it('should enable refetchOnReconnect', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      expect(
        capturedQueryClientOptions.defaultOptions.queries.refetchOnReconnect,
      ).toBe(true);
    });

    it('should enable refetchOnMount', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      expect(
        capturedQueryClientOptions.defaultOptions.queries.refetchOnMount,
      ).toBe(true);
    });

    it('should set networkMode to offlineFirst for queries', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      expect(
        capturedQueryClientOptions.defaultOptions.queries.networkMode,
      ).toBe('offlineFirst');
    });

    it('should set networkMode to offlineFirst for mutations', () => {
      const module = require('../../src/config/queryClient');
      module.createQueryClient();

      expect(
        capturedQueryClientOptions.defaultOptions.mutations.networkMode,
      ).toBe('offlineFirst');
    });
  });

  describe('handleQueryError', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it('should call captureException for Error instances', () => {
      const mockCaptureException = jest.fn();
      jest.doMock('../../src/utils/errorReporter', () => ({
        captureException: mockCaptureException,
      }));

      // Re-require after mocking
      jest.resetModules();
      const module = require('../../src/config/queryClient');

      const testError = new Error('Test error');
      module.handleQueryError(testError);

      expect(mockCaptureException).toHaveBeenCalledWith(testError, {
        action: 'QueryError',
      });
    });

    it('should NOT call captureException for non-Error objects', () => {
      const mockCaptureException = jest.fn();
      jest.doMock('../../src/utils/errorReporter', () => ({
        captureException: mockCaptureException,
      }));

      jest.resetModules();
      const module = require('../../src/config/queryClient');

      module.handleQueryError('string error');
      module.handleQueryError({ message: 'object error' });
      module.handleQueryError(123);

      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });

  describe('queryKeys', () => {
    let queryKeys: any;

    beforeAll(() => {
      const module = require('../../src/config/queryClient');
      queryKeys = module.queryKeys;
    });

    describe('wallet keys', () => {
      it('should return all wallet keys', () => {
        expect(queryKeys.wallet.all).toEqual(['wallet']);
      });

      it('should return balance key with address and chainId', () => {
        const key = queryKeys.wallet.balance('0x123', 1);
        expect(key).toEqual(['wallet', 'balance', '0x123', 1]);
      });

      it('should return tokens key with address and chainId', () => {
        const key = queryKeys.wallet.tokens('0x456', 137);
        expect(key).toEqual(['wallet', 'tokens', '0x456', 137]);
      });

      it('should return nfts key with address and chainId', () => {
        const key = queryKeys.wallet.nfts('0x789', 42161);
        expect(key).toEqual(['wallet', 'nfts', '0x789', 42161]);
      });
    });

    describe('transactions keys', () => {
      it('should return all transactions keys', () => {
        expect(queryKeys.transactions.all).toEqual(['transactions']);
      });

      it('should return list key with address and chainId', () => {
        const key = queryKeys.transactions.list('0x123', 1);
        expect(key).toEqual(['transactions', 'list', '0x123', 1]);
      });

      it('should return detail key with txHash', () => {
        const key = queryKeys.transactions.detail('0xabc');
        expect(key).toEqual(['transactions', 'detail', '0xabc']);
      });

      it('should return pending key with address', () => {
        const key = queryKeys.transactions.pending('0x123');
        expect(key).toEqual(['transactions', 'pending', '0x123']);
      });
    });

    describe('tokens keys', () => {
      it('should return all tokens keys', () => {
        expect(queryKeys.tokens.all).toEqual(['tokens']);
      });

      it('should return price key', () => {
        const key = queryKeys.tokens.price('0xtoken', 1);
        expect(key).toEqual(['tokens', 'price', '0xtoken', 1]);
      });

      it('should return metadata key', () => {
        const key = queryKeys.tokens.metadata('0xtoken', 137);
        expect(key).toEqual(['tokens', 'metadata', '0xtoken', 137]);
      });

      it('should return list key with chainId', () => {
        const key = queryKeys.tokens.list(1);
        expect(key).toEqual(['tokens', 'list', 1]);
      });
    });

    describe('swap keys', () => {
      it('should return all swap keys', () => {
        expect(queryKeys.swap.all).toEqual(['swap']);
      });

      it('should return quote key', () => {
        const key = queryKeys.swap.quote('ETH', 'USDC', '1000000', 1);
        expect(key).toEqual(['swap', 'quote', 'ETH', 'USDC', '1000000', 1]);
      });

      it('should return price key', () => {
        const key = queryKeys.swap.price('ETH', 'USDC', 1);
        expect(key).toEqual(['swap', 'price', 'ETH', 'USDC', 1]);
      });
    });

    describe('gas keys', () => {
      it('should return all gas keys', () => {
        expect(queryKeys.gas.all).toEqual(['gas']);
      });

      it('should return price key with chainId', () => {
        const key = queryKeys.gas.price(1);
        expect(key).toEqual(['gas', 'price', 1]);
      });

      it('should return estimate key with txData', () => {
        const key = queryKeys.gas.estimate('0xabcdef');
        expect(key).toEqual(['gas', 'estimate', '0xabcdef']);
      });
    });

    describe('coins keys', () => {
      it('should return all coins keys', () => {
        expect(queryKeys.coins.all).toEqual(['coins']);
      });

      it('should return list key', () => {
        expect(queryKeys.coins.list()).toEqual(['coins', 'list']);
      });

      it('should return detail key with coinId', () => {
        const key = queryKeys.coins.detail('bitcoin');
        expect(key).toEqual(['coins', 'detail', 'bitcoin']);
      });

      it('should return chart key with coinId and days', () => {
        const key = queryKeys.coins.chart('ethereum', 7);
        expect(key).toEqual(['coins', 'chart', 'ethereum', 7]);
      });
    });
  });
});
