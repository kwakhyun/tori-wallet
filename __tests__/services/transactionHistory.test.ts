/**
 * 트랜잭션 히스토리 서비스 테스트
 */

import { transactionHistoryService } from '../../src/services/transactionHistory';

// fetch 모킹
global.fetch = jest.fn();

describe('TransactionHistoryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    transactionHistoryService.clearCache();
  });

  describe('getTransactions', () => {
    it('should return empty array for unsupported chain', async () => {
      const transactions = await transactionHistoryService.getTransactions(
        '0x1234567890123456789012345678901234567890',
        999999, // 지원하지 않는 체인
      );
      expect(transactions).toEqual([]);
    });

    it('should return empty array when no transactions found', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            status: '0',
            message: 'No transactions found',
            result: [],
          }),
      });

      const transactions = await transactionHistoryService.getTransactions(
        '0x1234567890123456789012345678901234567890',
        1,
      );
      expect(transactions).toEqual([]);
    });

    it('should fetch and map transactions', async () => {
      const mockTxs = [
        {
          hash: '0xabc123',
          from: '0x1234567890123456789012345678901234567890',
          to: '0x0987654321098765432109876543210987654321',
          value: '1000000000000000000', // 1 ETH
          gasUsed: '21000',
          gasPrice: '50000000000', // 50 Gwei
          timeStamp: '1700000000',
          blockNumber: '12345678',
          isError: '0',
          confirmations: '100',
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            status: '1',
            message: 'OK',
            result: mockTxs,
          }),
      });

      const transactions = await transactionHistoryService.getTransactions(
        '0x1234567890123456789012345678901234567890',
        1,
      );

      expect(transactions.length).toBe(1);
      expect(transactions[0].hash).toBe('0xabc123');
      expect(transactions[0].type).toBe('send');
      expect(transactions[0].status).toBe('success');
    });

    it('should identify receive transactions', async () => {
      const mockTxs = [
        {
          hash: '0xdef456',
          from: '0x0987654321098765432109876543210987654321',
          to: '0x1234567890123456789012345678901234567890',
          value: '500000000000000000', // 0.5 ETH
          gasUsed: '21000',
          gasPrice: '30000000000',
          timeStamp: '1700000000',
          blockNumber: '12345678',
          isError: '0',
          confirmations: '50',
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            status: '1',
            message: 'OK',
            result: mockTxs,
          }),
      });

      const transactions = await transactionHistoryService.getTransactions(
        '0x1234567890123456789012345678901234567890',
        1,
      );

      expect(transactions[0].type).toBe('receive');
      expect(transactions[0].fee).toBe('0'); // receive는 수수료 없음
    });

    it('should mark failed transactions', async () => {
      const mockTxs = [
        {
          hash: '0xfailed',
          from: '0x1234567890123456789012345678901234567890',
          to: '0x0987654321098765432109876543210987654321',
          value: '0',
          gasUsed: '21000',
          gasPrice: '50000000000',
          timeStamp: '1700000000',
          blockNumber: '12345678',
          isError: '1',
          confirmations: '100',
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            status: '1',
            message: 'OK',
            result: mockTxs,
          }),
      });

      const transactions = await transactionHistoryService.getTransactions(
        '0x1234567890123456789012345678901234567890',
        1,
      );

      expect(transactions[0].status).toBe('failed');
      expect(transactions[0].isError).toBe(true);
    });

    it('should use cache on repeated calls', async () => {
      const mockTxs = [
        {
          hash: '0xcached',
          from: '0x1234567890123456789012345678901234567890',
          to: '0x0987654321098765432109876543210987654321',
          value: '1000000000000000000',
          gasUsed: '21000',
          gasPrice: '50000000000',
          timeStamp: '1700000000',
          blockNumber: '12345678',
          isError: '0',
          confirmations: '100',
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            status: '1',
            message: 'OK',
            result: mockTxs,
          }),
      });

      // 첫 번째 호출
      await transactionHistoryService.getTransactions(
        '0x1234567890123456789012345678901234567890',
        1,
      );

      // 두 번째 호출 (캐시 사용)
      await transactionHistoryService.getTransactions(
        '0x1234567890123456789012345678901234567890',
        1,
      );

      // fetch는 한 번만 호출되어야 함
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should bypass cache when forceRefresh is true', async () => {
      const mockTxs = [
        {
          hash: '0xrefresh',
          from: '0x1234567890123456789012345678901234567890',
          to: '0x0987654321098765432109876543210987654321',
          value: '1000000000000000000',
          gasUsed: '21000',
          gasPrice: '50000000000',
          timeStamp: '1700000000',
          blockNumber: '12345678',
          isError: '0',
          confirmations: '100',
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        json: () =>
          Promise.resolve({
            status: '1',
            message: 'OK',
            result: mockTxs,
          }),
      });

      // 첫 번째 호출
      await transactionHistoryService.getTransactions(
        '0x1234567890123456789012345678901234567890',
        1,
      );

      // 두 번째 호출 (forceRefresh)
      await transactionHistoryService.getTransactions(
        '0x1234567890123456789012345678901234567890',
        1,
        1,
        20,
        true,
      );

      // fetch는 두 번 호출되어야 함
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const transactions = await transactionHistoryService.getTransactions(
        '0x1234567890123456789012345678901234567890',
        1,
      );

      expect(transactions).toEqual([]);
    });

    it('should handle API error response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            status: '0',
            message: 'NOTOK',
            result: 'Error! Invalid address format',
          }),
      });

      const transactions = await transactionHistoryService.getTransactions(
        'invalid-address',
        1,
      );

      expect(transactions).toEqual([]);
    });
  });

  describe('clearCache', () => {
    it('should clear cache without error', () => {
      expect(() => transactionHistoryService.clearCache()).not.toThrow();
    });
  });
});
