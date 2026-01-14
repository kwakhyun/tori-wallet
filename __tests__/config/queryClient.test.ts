/**
 * Tori Wallet - Query Client Tests
 * React Query 클라이언트 설정 테스트
 */

const mockAddEventListener = jest.fn(() => jest.fn());
const mockSetOnline = jest.fn();
const mockSetFocused = jest.fn();
const mockAppStateAddEventListener = jest.fn(() => ({ remove: jest.fn() }));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: mockAddEventListener,
}));

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: mockAppStateAddEventListener,
  },
}));

jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn().mockImplementation(() => ({
    setDefaultOptions: jest.fn(),
    getQueryCache: jest.fn(() => ({
      subscribe: jest.fn(() => jest.fn()),
    })),
    getMutationCache: jest.fn(() => ({
      subscribe: jest.fn(() => jest.fn()),
    })),
  })),
  onlineManager: {
    setOnline: mockSetOnline,
  },
  focusManager: {
    setFocused: mockSetFocused,
  },
}));

describe('QueryClient Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  describe('handleQueryError', () => {
    it('should be exported as a function', () => {
      const module = require('../../src/config/queryClient');
      expect(typeof module.handleQueryError).toBe('function');
    });

    it('should handle Error instances', () => {
      const module = require('../../src/config/queryClient');
      expect(() => module.handleQueryError(new Error('Test'))).not.toThrow();
    });

    it('should handle non-Error objects', () => {
      const module = require('../../src/config/queryClient');
      expect(() =>
        module.handleQueryError({ message: 'Object error' }),
      ).not.toThrow();
    });

    it('should handle string errors', () => {
      const module = require('../../src/config/queryClient');
      expect(() => module.handleQueryError('String error')).not.toThrow();
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
