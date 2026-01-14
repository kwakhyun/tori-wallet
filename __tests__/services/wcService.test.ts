/**
 * Tori Wallet - WCService Tests
 * WalletConnect 서비스 테스트
 */

import { wcService } from '../../src/services/wcService';

// WalletConnect 모듈 모킹
jest.mock('@walletconnect/core', () => ({
  Core: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@walletconnect/web3wallet', () => ({
  Web3Wallet: {
    init: jest.fn().mockResolvedValue({
      on: jest.fn(),
      pair: jest.fn(),
      approveSession: jest.fn(),
      rejectSession: jest.fn(),
      respondSessionRequest: jest.fn(),
      getActiveSessions: jest.fn().mockReturnValue({}),
      disconnectSession: jest.fn(),
    }),
  },
}));

jest.mock('@walletconnect/utils', () => ({
  buildApprovedNamespaces: jest.fn().mockReturnValue({}),
  getSdkError: jest
    .fn()
    .mockReturnValue({ code: 5000, message: 'User rejected' }),
}));

describe('WCService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getActiveSessions', () => {
    it('should return empty array when not initialized', () => {
      const sessions = wcService.getActiveSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe('onSessionProposal', () => {
    it('should set session proposal callback', () => {
      const callback = jest.fn();
      expect(() => wcService.onSessionProposal(callback)).not.toThrow();
    });
  });

  describe('onSessionRequest', () => {
    it('should set session request callback', () => {
      const callback = jest.fn();
      expect(() => wcService.onSessionRequest(callback)).not.toThrow();
    });
  });

  describe('pair', () => {
    it('should throw when not initialized', async () => {
      // wcService가 초기화되지 않은 상태에서 pair 호출
      await expect(wcService.pair('wc:test-uri')).rejects.toThrow(
        'WalletConnect not initialized',
      );
    });
  });

  describe('approveSession', () => {
    it('should throw when not initialized', async () => {
      const mockProposal = {
        id: 1,
        params: {},
        verifyContext: {},
      } as any;

      await expect(
        wcService.approveSession(
          mockProposal,
          '0x1234567890123456789012345678901234567890',
        ),
      ).rejects.toThrow('WalletConnect not initialized');
    });
  });

  describe('rejectSession', () => {
    it('should throw when not initialized', async () => {
      const mockProposal = {
        id: 1,
        params: {},
        verifyContext: {},
      } as any;

      await expect(wcService.rejectSession(mockProposal)).rejects.toThrow(
        'WalletConnect not initialized',
      );
    });
  });

  describe('respondRequest', () => {
    it('should throw when not initialized', async () => {
      await expect(
        wcService.respondRequest('topic', 1, { result: 'success' }),
      ).rejects.toThrow('WalletConnect not initialized');
    });
  });

  describe('rejectRequest', () => {
    it('should throw when not initialized', async () => {
      await expect(wcService.rejectRequest('topic', 1)).rejects.toThrow(
        'WalletConnect not initialized',
      );
    });
  });

  describe('disconnectSession', () => {
    it('should throw when not initialized', async () => {
      await expect(wcService.disconnectSession('topic')).rejects.toThrow(
        'WalletConnect not initialized',
      );
    });
  });
});

// WCService 초기화 후 동작 테스트
describe('WCService - Initialized', () => {
  const mockWeb3Wallet = {
    on: jest.fn(),
    pair: jest.fn().mockResolvedValue(undefined),
    approveSession: jest.fn().mockResolvedValue({ topic: 'session-topic' }),
    rejectSession: jest.fn().mockResolvedValue(undefined),
    respondSessionRequest: jest.fn().mockResolvedValue(undefined),
    getActiveSessions: jest.fn().mockReturnValue({
      'session-1': {
        topic: 'session-1',
        peer: {
          metadata: {
            name: 'Test DApp',
            url: 'https://test.dapp.com',
            icons: ['https://test.dapp.com/icon.png'],
          },
        },
        namespaces: {
          eip155: {
            chains: ['eip155:1'],
            accounts: ['eip155:1:0x1234567890123456789012345678901234567890'],
          },
        },
        expiry: Date.now() + 86400000,
      },
    }),
    disconnectSession: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Web3Wallet.init을 모킹하여 초기화된 상태 시뮬레이션
    const { Web3Wallet } = require('@walletconnect/web3wallet');
    Web3Wallet.init.mockResolvedValue(mockWeb3Wallet);

    // 새로운 wcService 인스턴스 초기화
    await wcService.initialize();
  });

  describe('initialize', () => {
    it('should initialize WalletConnect successfully', async () => {
      // 이미 beforeEach에서 초기화됨
      expect(mockWeb3Wallet.on).toHaveBeenCalled();
    });

    it('should set up event listeners', async () => {
      expect(mockWeb3Wallet.on).toHaveBeenCalledWith(
        'session_proposal',
        expect.any(Function),
      );
      expect(mockWeb3Wallet.on).toHaveBeenCalledWith(
        'session_request',
        expect.any(Function),
      );
      expect(mockWeb3Wallet.on).toHaveBeenCalledWith(
        'session_delete',
        expect.any(Function),
      );
    });
  });

  describe('pair', () => {
    it('should pair with WalletConnect URI', async () => {
      const uri = 'wc:a1b2c3d4@2?relay-protocol=irn&symKey=xyz';
      await wcService.pair(uri);

      expect(mockWeb3Wallet.pair).toHaveBeenCalledWith({ uri });
    });
  });

  describe('getActiveSessions', () => {
    it('should return formatted active sessions', () => {
      const sessions = wcService.getActiveSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toEqual({
        topic: 'session-1',
        name: 'Test DApp',
        url: 'https://test.dapp.com',
        icon: 'https://test.dapp.com/icon.png',
        chains: ['eip155:1'],
        accounts: ['eip155:1:0x1234567890123456789012345678901234567890'],
        expiry: expect.any(Number),
      });
    });
  });

  describe('approveSession', () => {
    it('should approve session proposal', async () => {
      const mockProposal = {
        id: 12345,
        params: {
          requiredNamespaces: {
            eip155: {
              chains: ['eip155:1'],
              methods: ['eth_sendTransaction'],
              events: ['accountsChanged'],
            },
          },
        },
        verifyContext: {},
      } as any;

      const address = '0x1234567890123456789012345678901234567890';
      const chainIds = [1, 137];

      await wcService.approveSession(mockProposal, address, chainIds);

      expect(mockWeb3Wallet.approveSession).toHaveBeenCalled();
    });
  });

  describe('rejectSession', () => {
    it('should reject session proposal', async () => {
      const mockProposal = {
        id: 12345,
        params: {},
        verifyContext: {},
      } as any;

      await wcService.rejectSession(mockProposal);

      expect(mockWeb3Wallet.rejectSession).toHaveBeenCalledWith({
        id: 12345,
        reason: expect.any(Object),
      });
    });
  });

  describe('respondRequest', () => {
    it('should respond to session request', async () => {
      const topic = 'session-topic';
      const requestId = 67890;
      const result = '0xsignature';

      await wcService.respondRequest(topic, requestId, result);

      expect(mockWeb3Wallet.respondSessionRequest).toHaveBeenCalledWith({
        topic,
        response: {
          id: requestId,
          jsonrpc: '2.0',
          result,
        },
      });
    });
  });

  describe('rejectRequest', () => {
    it('should reject session request', async () => {
      const topic = 'session-topic';
      const requestId = 67890;

      await wcService.rejectRequest(topic, requestId);

      expect(mockWeb3Wallet.respondSessionRequest).toHaveBeenCalledWith({
        topic,
        response: {
          id: requestId,
          jsonrpc: '2.0',
          error: expect.any(Object),
        },
      });
    });
  });

  describe('disconnectSession', () => {
    it('should disconnect session', async () => {
      const topic = 'session-topic';

      await wcService.disconnectSession(topic);

      expect(mockWeb3Wallet.disconnectSession).toHaveBeenCalledWith({
        topic,
        reason: expect.any(Object),
      });
    });
  });
});

// WCService 에러 핸들링 테스트
describe('WCService - Error Handling', () => {
  const mockWeb3WalletWithErrors = {
    on: jest.fn(),
    pair: jest.fn().mockRejectedValue(new Error('Pairing failed')),
    approveSession: jest.fn().mockRejectedValue(new Error('Approval failed')),
    rejectSession: jest.fn().mockRejectedValue(new Error('Rejection failed')),
    respondSessionRequest: jest
      .fn()
      .mockRejectedValue(new Error('Response failed')),
    getActiveSessions: jest.fn().mockReturnValue({}),
    disconnectSession: jest
      .fn()
      .mockRejectedValue(new Error('Disconnect failed')),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const { Web3Wallet } = require('@walletconnect/web3wallet');
    Web3Wallet.init.mockResolvedValue(mockWeb3WalletWithErrors);
    await wcService.initialize();
  });

  describe('pair error handling', () => {
    it('should throw and log error on pair failure', async () => {
      await expect(wcService.pair('wc:invalid-uri')).rejects.toThrow(
        'Pairing failed',
      );
    });
  });

  describe('approveSession error handling', () => {
    it('should throw and log error on approval failure', async () => {
      const mockProposal = {
        id: 1,
        params: { requiredNamespaces: {} },
        verifyContext: {},
      } as Parameters<typeof wcService.approveSession>[0];

      await expect(
        wcService.approveSession(
          mockProposal,
          '0x1234567890123456789012345678901234567890',
        ),
      ).rejects.toThrow('Approval failed');
    });
  });

  describe('rejectSession error handling', () => {
    it('should throw and log error on rejection failure', async () => {
      const mockProposal = {
        id: 1,
        params: {},
        verifyContext: {},
      } as Parameters<typeof wcService.rejectSession>[0];

      await expect(wcService.rejectSession(mockProposal)).rejects.toThrow(
        'Rejection failed',
      );
    });
  });

  describe('respondRequest error handling', () => {
    it('should throw and log error on response failure', async () => {
      await expect(
        wcService.respondRequest('topic', 1, { result: 'data' }),
      ).rejects.toThrow('Response failed');
    });
  });

  describe('rejectRequest error handling', () => {
    it('should throw and log error on reject failure', async () => {
      await expect(wcService.rejectRequest('topic', 1)).rejects.toThrow(
        'Response failed',
      );
    });
  });

  describe('disconnectSession error handling', () => {
    it('should throw and log error on disconnect failure', async () => {
      await expect(wcService.disconnectSession('topic')).rejects.toThrow(
        'Disconnect failed',
      );
    });
  });
});

// WCService 이벤트 콜백 테스트
describe('WCService - Event Callbacks', () => {
  let sessionProposalHandler: (() => void) | null = null;
  let sessionRequestHandler: (() => void) | null = null;
  let sessionDeleteHandler: ((data: { topic: string }) => void) | null = null;

  const mockWeb3WalletWithCallbacks = {
    on: jest.fn(
      (
        event: string,
        handler: (() => void) | ((data: { topic: string }) => void),
      ) => {
        if (event === 'session_proposal')
          sessionProposalHandler = handler as () => void;
        if (event === 'session_request')
          sessionRequestHandler = handler as () => void;
        if (event === 'session_delete')
          sessionDeleteHandler = handler as (data: { topic: string }) => void;
      },
    ),
    pair: jest.fn().mockResolvedValue(undefined),
    approveSession: jest.fn().mockResolvedValue({ topic: 'test' }),
    rejectSession: jest.fn().mockResolvedValue(undefined),
    respondSessionRequest: jest.fn().mockResolvedValue(undefined),
    getActiveSessions: jest.fn().mockReturnValue({}),
    disconnectSession: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    sessionProposalHandler = null;
    sessionRequestHandler = null;
    sessionDeleteHandler = null;

    const { Web3Wallet } = require('@walletconnect/web3wallet');
    Web3Wallet.init.mockResolvedValue(mockWeb3WalletWithCallbacks);
    await wcService.initialize();
  });

  describe('session_proposal event', () => {
    it('should trigger registered callback on session proposal', () => {
      const callback = jest.fn();
      wcService.onSessionProposal(callback);

      // 이벤트 트리거 시뮬레이션
      if (sessionProposalHandler) {
        sessionProposalHandler();
        expect(callback).toHaveBeenCalled();
      }
    });

    it('should not throw when no callback registered', () => {
      if (sessionProposalHandler) {
        expect(() => sessionProposalHandler!()).not.toThrow();
      }
    });
  });

  describe('session_request event', () => {
    it('should trigger registered callback on session request', () => {
      const callback = jest.fn();
      wcService.onSessionRequest(callback);

      if (sessionRequestHandler) {
        sessionRequestHandler();
        expect(callback).toHaveBeenCalled();
      }
    });
  });

  describe('session_delete event', () => {
    it('should handle session delete event', () => {
      if (sessionDeleteHandler) {
        expect(() =>
          sessionDeleteHandler!({ topic: 'deleted-topic' }),
        ).not.toThrow();
      }
    });
  });
});
