/**
 * 블록체인 클라이언트 테스트
 */

// 전역 타임아웃 10초 설정
jest.setTimeout(10000);

import {
  chainClient,
  ChainError,
  formatEther,
  parseEther,
} from '../../src/services/chainClient';

// viem 모킹 - createPublicClient는 전달된 체인을 반환
jest.mock('viem', () => ({
  createPublicClient: jest.fn(
    (opts: { chain: { id: number; name: string } }) => ({
      chain: opts.chain,
      getBalance: jest.fn(),
      getGasPrice: jest.fn(),
      estimateGas: jest.fn(),
      getTransactionCount: jest.fn(),
      getTransactionReceipt: jest.fn(),
      getBlockNumber: jest.fn(),
    }),
  ),
  http: jest.fn(() => ({})),
  formatEther: jest.fn((value: bigint) => {
    const eth = Number(value) / 1e18;
    return eth.toString();
  }),
  parseEther: jest.fn((value: string) =>
    BigInt(Math.floor(parseFloat(value) * 1e18)),
  ),
}));

const TEST_ADDRESS =
  '0x1234567890123456789012345678901234567890' as `0x${string}`;

describe('ChainClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chainClient.clearCache();
  });

  describe('getClient', () => {
    it('should return a client for Ethereum mainnet', () => {
      const client = chainClient.getClient(1);
      expect(client).toBeDefined();
      expect(client.chain?.id).toBe(1);
    });

    it('should return a client for Polygon', () => {
      const client = chainClient.getClient(137);
      expect(client).toBeDefined();
      expect(client.chain?.id).toBe(137);
    });

    it('should return a client for Arbitrum', () => {
      const client = chainClient.getClient(42161);
      expect(client).toBeDefined();
      expect(client.chain?.id).toBe(42161);
    });

    it('should return a client for Optimism', () => {
      const client = chainClient.getClient(10);
      expect(client).toBeDefined();
      expect(client.chain?.id).toBe(10);
    });

    it('should return a client for Base', () => {
      const client = chainClient.getClient(8453);
      expect(client).toBeDefined();
      expect(client.chain?.id).toBe(8453);
    });

    it('should return a client for Sepolia testnet', () => {
      const client = chainClient.getClient(11155111);
      expect(client).toBeDefined();
      expect(client.chain?.id).toBe(11155111);
    });

    it('should cache clients', () => {
      const client1 = chainClient.getClient(1);
      const client2 = chainClient.getClient(1);
      expect(client1).toBe(client2);
    });

    it('should accept custom RPC URL', () => {
      const customRpc = 'https://custom-rpc.example.com';
      const client = chainClient.getClient(1, customRpc);
      expect(client).toBeDefined();
    });

    it('should throw error for unsupported chain', () => {
      expect(() => chainClient.getClient(99999)).toThrow('Unsupported chain');
    });

    it('should create different client with custom RPC URL after cache clear', () => {
      const client1 = chainClient.getClient(1);
      chainClient.clearCache();
      const client2 = chainClient.getClient(
        1,
        'https://custom-rpc.example.com',
      );
      expect(client1).not.toBe(client2);
    });
  });

  describe('getSupportedChainIds', () => {
    it('should return list of supported chain IDs', () => {
      const chains = chainClient.getSupportedChainIds();
      expect(Array.isArray(chains)).toBe(true);
      expect(chains).toContain(1); // Ethereum
      expect(chains).toContain(137); // Polygon
      expect(chains).toContain(42161); // Arbitrum
      expect(chains).toContain(10); // Optimism
      expect(chains).toContain(8453); // Base
    });

    it('should include testnet chain IDs', () => {
      const chains = chainClient.getSupportedChainIds();
      expect(chains).toContain(11155111); // Sepolia
    });
  });

  describe('getChainInfo', () => {
    it('should return chain info for Ethereum', () => {
      const info = chainClient.getChainInfo(1);
      expect(info).toBeDefined();
      expect(info?.name).toContain('Ethereum');
    });

    it('should return chain info for Polygon', () => {
      const info = chainClient.getChainInfo(137);
      expect(info).toBeDefined();
      expect(info?.name).toBeDefined();
    });

    it('should return chain info for Arbitrum', () => {
      const info = chainClient.getChainInfo(42161);
      expect(info).toBeDefined();
    });

    it('should return chain info for Optimism', () => {
      const info = chainClient.getChainInfo(10);
      expect(info).toBeDefined();
    });

    it('should return chain info for Base', () => {
      const info = chainClient.getChainInfo(8453);
      expect(info).toBeDefined();
    });

    it('should return null for unsupported chain', () => {
      const info = chainClient.getChainInfo(99999);
      expect(info).toBeNull();
    });

    it('should identify testnet', () => {
      const info = chainClient.getChainInfo(11155111); // Sepolia
      expect(info?.isTestnet).toBe(true);
    });

    it('should identify mainnet', () => {
      const info = chainClient.getChainInfo(1); // Ethereum 메인넷
      expect(info?.isTestnet).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached clients', () => {
      const client1 = chainClient.getClient(1);
      chainClient.clearCache();
      const client2 = chainClient.getClient(1);
      // 캐시 클리어 후 새 클라이언트가 생성되어야 함
      expect(client1).not.toBe(client2);
    });

    it('should allow caching new clients after clear', () => {
      chainClient.getClient(1);
      chainClient.clearCache();
      const client1 = chainClient.getClient(1);
      const client2 = chainClient.getClient(1);
      expect(client1).toBe(client2);
    });
  });

  describe('testConnection', () => {
    it('should be a function', () => {
      expect(typeof chainClient.testConnection).toBe('function');
    });

    it('should return connection status object', async () => {
      // 함수 시그니처 테스트 - 테스트 환경에서는 실제 연결이 실패할 수 있음
      const result = await chainClient.testConnection(1);
      expect(result).toBeDefined();
      expect(typeof result.connected).toBe('boolean');
    });
  });

  describe('getBalance', () => {
    it('should be a function', () => {
      expect(typeof chainClient.getBalance).toBe('function');
    });
  });

  describe('estimateGas', () => {
    it('should be a function', () => {
      expect(typeof chainClient.estimateGas).toBe('function');
    });
  });

  describe('getGasPrice', () => {
    it('should be a function', () => {
      expect(typeof chainClient.getGasPrice).toBe('function');
    });
  });

  describe('getTransactionCount', () => {
    it('should be a function', () => {
      expect(typeof chainClient.getTransactionCount).toBe('function');
    });
  });

  describe('getTransactionReceipt', () => {
    it('should be a function', () => {
      expect(typeof chainClient.getTransactionReceipt).toBe('function');
    });
  });

  describe('getBalance - with mocked responses', () => {
    it('should return formatted balance', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        getBalance: jest.fn().mockResolvedValue(BigInt('1000000000000000000')), // 1 ETH
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      const result = await chainClient.getBalance(TEST_ADDRESS, { chainId: 1 });

      expect(result.wei).toBe(BigInt('1000000000000000000'));
      expect(mockClient.getBalance).toHaveBeenCalledWith({
        address: TEST_ADDRESS,
      });
    });

    it('should handle zero balance', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        getBalance: jest.fn().mockResolvedValue(BigInt('0')),
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      const result = await chainClient.getBalance(TEST_ADDRESS, { chainId: 1 });

      expect(result.wei).toBe(BigInt('0'));
    });

    it('should handle RPC timeout error', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        getBalance: jest.fn().mockRejectedValue(new Error('Request timeout')),
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      await expect(
        chainClient.getBalance(TEST_ADDRESS, { chainId: 1 }),
      ).rejects.toThrow();
    });

    it('should handle rate limit error (429)', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        getBalance: jest
          .fn()
          .mockRejectedValue(new Error('HTTP 429 Too Many Requests')),
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      await expect(
        chainClient.getBalance(TEST_ADDRESS, { chainId: 1 }),
      ).rejects.toThrow();
    });

    it('should handle insufficient funds error', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        getBalance: jest
          .fn()
          .mockRejectedValue(new Error('insufficient funds for transfer')),
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      await expect(
        chainClient.getBalance(TEST_ADDRESS, { chainId: 1 }),
      ).rejects.toThrow();
    });

    it('should handle unknown error object', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        getBalance: jest.fn().mockRejectedValue('string error'),
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      await expect(
        chainClient.getBalance(TEST_ADDRESS, { chainId: 1 }),
      ).rejects.toThrow();
    });
  });

  describe('getGasPrice - with mocked responses', () => {
    it('should return gas price', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        getGasPrice: jest.fn().mockResolvedValue(BigInt('20000000000')), // 20 Gwei
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      const result = await chainClient.getGasPrice({ chainId: 1 });

      expect(result).toBe(BigInt('20000000000'));
      expect(mockClient.getGasPrice).toHaveBeenCalled();
    });

    it('should handle error in getGasPrice', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        getGasPrice: jest.fn().mockRejectedValue(new Error('RPC error')),
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      await expect(chainClient.getGasPrice({ chainId: 1 })).rejects.toThrow();
    });
  });

  describe('estimateGas - with mocked responses', () => {
    it('should estimate gas for transfer', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        estimateGas: jest.fn().mockResolvedValue(BigInt('21000')),
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      const params = {
        from: TEST_ADDRESS,
        to: '0x0987654321098765432109876543210987654321' as `0x${string}`,
        value: BigInt('1000000000000000000'),
      };

      const result = await chainClient.estimateGas(params, { chainId: 1 });

      expect(result).toBe(BigInt('21000'));
    });

    it('should estimate gas with data', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        estimateGas: jest.fn().mockResolvedValue(BigInt('50000')),
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      const params = {
        from: TEST_ADDRESS,
        to: '0x0987654321098765432109876543210987654321' as `0x${string}`,
        data: '0xa9059cbb' as `0x${string}`,
      };

      const result = await chainClient.estimateGas(params, { chainId: 1 });

      expect(result).toBe(BigInt('50000'));
    });

    it('should handle error in estimateGas', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        estimateGas: jest
          .fn()
          .mockRejectedValue(new Error('Execution reverted')),
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      const params = {
        from: TEST_ADDRESS,
        to: '0x0987654321098765432109876543210987654321' as `0x${string}`,
      };

      await expect(
        chainClient.estimateGas(params, { chainId: 1 }),
      ).rejects.toThrow();
    });
  });

  describe('getTransactionCount - with mocked responses', () => {
    it('should return transaction count', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        getTransactionCount: jest.fn().mockResolvedValue(42),
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      const result = await chainClient.getTransactionCount(TEST_ADDRESS, {
        chainId: 1,
      });

      expect(result).toBe(42);
      expect(mockClient.getTransactionCount).toHaveBeenCalledWith({
        address: TEST_ADDRESS,
      });
    });

    it('should handle zero transaction count (new account)', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        getTransactionCount: jest.fn().mockResolvedValue(0),
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      const result = await chainClient.getTransactionCount(TEST_ADDRESS, {
        chainId: 1,
      });

      expect(result).toBe(0);
    });

    it('should handle error in getTransactionCount', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        getTransactionCount: jest
          .fn()
          .mockRejectedValue(new Error('Network error')),
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      await expect(
        chainClient.getTransactionCount(TEST_ADDRESS, { chainId: 1 }),
      ).rejects.toThrow();
    });
  });

  describe('getTransactionReceipt - with mocked responses', () => {
    const mockTxHash =
      '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as `0x${string}`;

    it('should return transaction receipt', async () => {
      const { createPublicClient } = require('viem');
      const mockReceipt = {
        blockNumber: BigInt(1000),
        status: 'success',
        gasUsed: BigInt(21000),
        transactionHash: mockTxHash,
      };
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        getTransactionReceipt: jest.fn().mockResolvedValue(mockReceipt),
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      const result = await chainClient.getTransactionReceipt(mockTxHash, {
        chainId: 1,
      });

      expect(result).toEqual(mockReceipt);
      expect(mockClient.getTransactionReceipt).toHaveBeenCalledWith({
        hash: mockTxHash,
      });
    });

    it('should handle pending transaction (null receipt)', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        getTransactionReceipt: jest.fn().mockResolvedValue(null),
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      const result = await chainClient.getTransactionReceipt(mockTxHash, {
        chainId: 1,
      });

      expect(result).toBeNull();
    });

    it('should handle error in getTransactionReceipt', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        getTransactionReceipt: jest
          .fn()
          .mockRejectedValue(new Error('Transaction not found')),
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      await expect(
        chainClient.getTransactionReceipt(mockTxHash, { chainId: 1 }),
      ).rejects.toThrow();
    });
  });

  describe('testConnection - with mocked responses', () => {
    it('should return success when connection works', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        getBlockNumber: jest.fn().mockResolvedValue(BigInt(12345678)),
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      const result = await chainClient.testConnection(1);

      expect(result.connected).toBe(true);
      expect(result.blockNumber).toBe(BigInt(12345678));
      expect(result.latency).toBeDefined();
      expect(typeof result.latency).toBe('number');
    });

    it('should return failure when connection fails', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        getBlockNumber: jest
          .fn()
          .mockRejectedValue(new Error('Connection refused')),
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      const result = await chainClient.testConnection(1);

      expect(result.connected).toBe(false);
      expect(result.error).toBe('Connection refused');
    });

    it('should handle unknown error type', async () => {
      const { createPublicClient } = require('viem');
      const mockClient = {
        chain: { id: 1, name: 'Ethereum' },
        getBlockNumber: jest.fn().mockRejectedValue('string error'),
      };
      createPublicClient.mockReturnValue(mockClient);
      chainClient.clearCache();

      const result = await chainClient.testConnection(1);

      expect(result.connected).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });
});

describe('ChainError', () => {
  it('should create error with code and message', () => {
    const error = new ChainError('RPC_TIMEOUT', 'RPC 서버 응답 시간 초과');
    expect(error.code).toBe('RPC_TIMEOUT');
    expect(error.message).toBe('RPC 서버 응답 시간 초과');
    expect(error.name).toBe('ChainError');
  });

  it('should be instanceof Error', () => {
    const error = new ChainError('TEST_ERROR', 'Test message');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof ChainError).toBe(true);
  });

  it('should have different error codes', () => {
    const rpcError = new ChainError('RPC_ERROR', 'RPC error');
    const insufficientFunds = new ChainError(
      'INSUFFICIENT_FUNDS',
      'Not enough funds',
    );
    const networkError = new ChainError('NETWORK_ERROR', 'Network issue');
    const rateLimitError = new ChainError('RATE_LIMIT', 'Too many requests');
    const timeoutError = new ChainError('RPC_TIMEOUT', 'Request timed out');

    expect(rpcError.code).toBe('RPC_ERROR');
    expect(insufficientFunds.code).toBe('INSUFFICIENT_FUNDS');
    expect(networkError.code).toBe('NETWORK_ERROR');
    expect(rateLimitError.code).toBe('RATE_LIMIT');
    expect(timeoutError.code).toBe('RPC_TIMEOUT');
  });

  it('should inherit from Error properly', () => {
    const error = new ChainError('TEST', 'Test message');
    expect(error.stack).toBeDefined();
    expect(error.toString()).toContain('ChainError');
  });
});

describe('formatEther and parseEther exports', () => {
  it('should export formatEther', () => {
    expect(typeof formatEther).toBe('function');
  });

  it('should export parseEther', () => {
    expect(typeof parseEther).toBe('function');
  });
});
