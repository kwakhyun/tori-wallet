/**
 * 로컬 데이터베이스 테스트
 * 로컬 데이터베이스 기능 테스트
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  localDatabase,
  TransactionRecord,
  TokenInfo,
  DAppConnection,
  SwapRecord,
} from '../../src/database/localDatabase';

// AsyncStorage 모킹 초기화
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

describe('LocalDatabase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Transactions', () => {
    const mockTransaction: TransactionRecord = {
      id: 'tx_123',
      hash: '0xabc123',
      from: '0x1234567890123456789012345678901234567890',
      to: '0x0987654321098765432109876543210987654321',
      value: '1.0',
      chainId: 1,
      status: 'confirmed',
      type: 'send',
      timestamp: Date.now(),
    };

    it('should return empty array when no transactions', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const result = await localDatabase.getTransactions();
      expect(result).toEqual([]);
    });

    it('should get transactions', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([mockTransaction]),
      );

      const result = await localDatabase.getTransactions();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('tx_123');
    });

    it('should filter transactions by chainId', async () => {
      const transactions = [
        { ...mockTransaction, chainId: 1 },
        { ...mockTransaction, id: 'tx_456', chainId: 137 },
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify(transactions),
      );

      const result = await localDatabase.getTransactions(1);
      expect(result).toHaveLength(1);
      expect(result[0].chainId).toBe(1);
    });

    it('should add new transaction', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await localDatabase.addTransaction(mockTransaction);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'tori_transactions',
        expect.stringContaining('tx_123'),
      );
    });

    it('should update existing transaction', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([mockTransaction]),
      );

      const updated = { ...mockTransaction, status: 'failed' as const };
      await localDatabase.addTransaction(updated);

      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    it('should update transaction status', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([mockTransaction]),
      );

      await localDatabase.updateTransactionStatus('tx_123', 'failed');

      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    it('should get transaction by hash', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([mockTransaction]),
      );

      const result = await localDatabase.getTransactionByHash('0xabc123');
      expect(result).not.toBeNull();
      expect(result?.hash).toBe('0xabc123');
    });

    it('should return null for non-existent hash', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([mockTransaction]),
      );

      const result = await localDatabase.getTransactionByHash('0xnotfound');
      expect(result).toBeNull();
    });
  });

  describe('Custom Tokens', () => {
    const mockToken: TokenInfo = {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      chainId: 1,
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      isCustom: true,
      addedAt: Date.now(),
    };

    it('should get custom tokens', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([mockToken]),
      );

      const result = await localDatabase.getCustomTokens();
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('USDC');
    });

    it('should add custom token', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await localDatabase.addCustomToken(mockToken);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'tori_custom_tokens',
        expect.stringContaining('USDC'),
      );
    });

    it('should throw when adding duplicate token', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([mockToken]),
      );

      await expect(localDatabase.addCustomToken(mockToken)).rejects.toThrow(
        'Token already exists',
      );
    });

    it('should remove custom token', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([mockToken]),
      );

      await localDatabase.removeCustomToken(mockToken.address, 1);

      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('DApp Connections', () => {
    const mockConnection: DAppConnection = {
      topic: 'session_123',
      name: 'Test dApp',
      url: 'https://test.dapp.com',
      chainIds: [1, 137],
      connectedAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    it('should get dApp connections', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([mockConnection]),
      );

      const result = await localDatabase.getDAppConnections();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test dApp');
    });

    it('should save new dApp connection', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await localDatabase.saveDAppConnection(mockConnection);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'tori_dapp_connections',
        expect.stringContaining('Test dApp'),
      );
    });

    it('should update lastActiveAt for existing connection', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([mockConnection]),
      );

      await localDatabase.saveDAppConnection(mockConnection);

      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    it('should remove dApp connection', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([mockConnection]),
      );

      await localDatabase.removeDAppConnection('session_123');

      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('Swap History', () => {
    const mockSwap: SwapRecord = {
      id: 'swap_123',
      txHash: '0xswap123',
      fromToken: '0xETH',
      toToken: '0xUSDC',
      fromAmount: '1.0',
      toAmount: '2500',
      fromSymbol: 'ETH',
      toSymbol: 'USDC',
      chainId: 1,
      provider: 'uniswap',
      slippage: 0.5,
      status: 'completed',
      timestamp: Date.now(),
    };

    it('should get swap history', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([mockSwap]),
      );

      const result = await localDatabase.getSwapHistory();
      expect(result).toHaveLength(1);
      expect(result[0].fromSymbol).toBe('ETH');
    });

    it('should add swap record', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await localDatabase.addSwapRecord(mockSwap);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'tori_swap_history',
        expect.stringContaining('swap_123'),
      );
    });

    it('should update swap status', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([mockSwap]),
      );

      await localDatabase.updateSwapStatus('swap_123', 'failed');

      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('Utility Methods', () => {
    it('should clear all data', async () => {
      await localDatabase.clearAllData();

      expect(AsyncStorage.removeItem).toHaveBeenCalledTimes(4);
    });

    it('should get storage size', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify({ test: 'data' }),
      );

      const size = await localDatabase.getStorageSize();
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle getTransactions error gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(
        new Error('Storage error'),
      );

      const result = await localDatabase.getTransactions();
      expect(result).toEqual([]);
    });

    it('should handle addTransaction error gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(
        new Error('Write error'),
      );

      // 에러가 발생하면 안 됨
      await expect(
        localDatabase.addTransaction({
          id: 'test',
          hash: '0x',
          from: '0x',
          to: '0x',
          value: '0',
          chainId: 1,
          status: 'pending',
          type: 'send',
          timestamp: Date.now(),
        }),
      ).resolves.not.toThrow();
    });
  });
});
