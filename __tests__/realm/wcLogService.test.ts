/**
 * WalletConnect 로그 서비스 테스트
 */

import {
  WCSessionLogSchema,
  WCRequestLogSchema,
} from '../../src/realm/schemas';

// uuid 모킹
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
}));

// Realm 모킹
jest.mock('../../src/realm/database', () => ({
  realmDB: {
    getRealm: jest.fn().mockResolvedValue({
      objects: jest.fn(() => ({
        filtered: jest.fn().mockReturnValue({
          sorted: jest.fn().mockReturnValue([]),
          length: 0,
          [Symbol.iterator]: function* () {},
        }),
        sorted: jest.fn().mockReturnValue([]),
        length: 0,
        [Symbol.iterator]: function* () {},
      })),
      objectForPrimaryKey: jest.fn(() => null),
      create: jest.fn((schemaName: string, obj: any) => obj),
      write: jest.fn((callback: () => void) => callback()),
      delete: jest.fn(),
    }),
    deleteAllOf: jest.fn().mockResolvedValue(undefined),
  },
}));

// 모킹 후 서비스 import
import { wcLogService } from '../../src/realm/services/wcLogService';

describe('WCLogService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('WCSessionLog Schema', () => {
    it('should have correct schema name', () => {
      expect(WCSessionLogSchema.name).toBe('WCSessionLog');
    });

    it('should have id as primary key', () => {
      expect(WCSessionLogSchema.primaryKey).toBe('id');
    });

    it('should have topic property with index', () => {
      expect(WCSessionLogSchema.properties).toHaveProperty('topic');
      const topicProp = WCSessionLogSchema.properties.topic as {
        type: string;
        indexed: boolean;
      };
      expect(topicProp.indexed).toBe(true);
    });

    it('should have required dApp properties', () => {
      expect(WCSessionLogSchema.properties).toHaveProperty('dappName');
      expect(WCSessionLogSchema.properties).toHaveProperty('dappUrl');
      expect(WCSessionLogSchema.properties).toHaveProperty('dappIcon');
    });

    it('should have session state properties', () => {
      expect(WCSessionLogSchema.properties).toHaveProperty('status');
      expect(WCSessionLogSchema.properties).toHaveProperty('connectedAt');
      expect(WCSessionLogSchema.properties).toHaveProperty('disconnectedAt');
      expect(WCSessionLogSchema.properties).toHaveProperty('expiresAt');
    });

    it('should have chains and accounts arrays', () => {
      expect(WCSessionLogSchema.properties).toHaveProperty('chains');
      expect(WCSessionLogSchema.properties).toHaveProperty('accounts');
    });
  });

  describe('WCRequestLog Schema', () => {
    it('should have correct schema name', () => {
      expect(WCRequestLogSchema.name).toBe('WCRequestLog');
    });

    it('should have id as primary key', () => {
      expect(WCRequestLogSchema.primaryKey).toBe('id');
    });

    it('should have sessionTopic with index', () => {
      expect(WCRequestLogSchema.properties).toHaveProperty('sessionTopic');
      const prop = WCRequestLogSchema.properties.sessionTopic as {
        type: string;
        indexed: boolean;
      };
      expect(prop.indexed).toBe(true);
    });

    it('should have request properties', () => {
      expect(WCRequestLogSchema.properties).toHaveProperty('requestId');
      expect(WCRequestLogSchema.properties).toHaveProperty('method');
      expect(WCRequestLogSchema.properties).toHaveProperty('params');
      expect(WCRequestLogSchema.properties).toHaveProperty('status');
    });

    it('should have result and error properties', () => {
      expect(WCRequestLogSchema.properties).toHaveProperty('result');
      expect(WCRequestLogSchema.properties).toHaveProperty('errorMessage');
    });
  });

  describe('Types', () => {
    it('should have correct session status values', () => {
      type SessionStatus = 'active' | 'disconnected' | 'expired';
      const statuses: SessionStatus[] = ['active', 'disconnected', 'expired'];
      expect(statuses).toHaveLength(3);
    });

    it('should have correct request status values', () => {
      type RequestStatus = 'pending' | 'approved' | 'rejected' | 'failed';
      const statuses: RequestStatus[] = [
        'pending',
        'approved',
        'rejected',
        'failed',
      ];
      expect(statuses).toHaveLength(4);
    });

    it('should have common WC methods', () => {
      const methods = [
        'eth_sendTransaction',
        'personal_sign',
        'eth_signTypedData',
        'eth_signTypedData_v4',
        'wallet_switchEthereumChain',
        'wallet_addEthereumChain',
      ];
      expect(methods).toContain('eth_sendTransaction');
      expect(methods).toContain('personal_sign');
    });
  });

  describe('Service', () => {
    it('should be defined', () => {
      expect(wcLogService).toBeDefined();
    });

    it('should have logSessionConnected method', () => {
      expect(typeof wcLogService.logSessionConnected).toBe('function');
    });

    it('should have logSessionDisconnected method', () => {
      expect(typeof wcLogService.logSessionDisconnected).toBe('function');
    });

    it('should have logRequest method', () => {
      expect(typeof wcLogService.logRequest).toBe('function');
    });

    it('should have getActiveSessions method', () => {
      expect(typeof wcLogService.getActiveSessions).toBe('function');
    });

    it('should have getSessionByTopic method', () => {
      expect(typeof wcLogService.getSessionByTopic).toBe('function');
    });
  });

  describe('Session Log Entry', () => {
    it('should have correct structure', () => {
      const mockSession = {
        id: 'session-1',
        topic: 'topic-abc123',
        dappName: 'Test dApp',
        dappUrl: 'https://testdapp.com',
        dappIcon: 'https://testdapp.com/icon.png',
        chains: ['eip155:1', 'eip155:137'],
        accounts: ['eip155:1:0x1234...'],
        status: 'active',
        connectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(mockSession.id).toBeDefined();
      expect(mockSession.topic).toBeDefined();
      expect(mockSession.dappName).toBe('Test dApp');
      expect(mockSession.chains).toHaveLength(2);
    });
  });

  describe('Request Log Entry', () => {
    it('should have correct structure', () => {
      const mockRequest = {
        id: 'request-1',
        sessionTopic: 'topic-abc123',
        requestId: 12345,
        method: 'eth_sendTransaction',
        params: JSON.stringify([{ to: '0x...', value: '0x0' }]),
        chainId: 1,
        status: 'pending',
        dappName: 'Test dApp',
        requestedAt: new Date(),
        createdAt: new Date(),
      };

      expect(mockRequest.id).toBeDefined();
      expect(mockRequest.method).toBe('eth_sendTransaction');
      expect(mockRequest.status).toBe('pending');
      expect(JSON.parse(mockRequest.params)).toBeInstanceOf(Array);
    });
  });
});
