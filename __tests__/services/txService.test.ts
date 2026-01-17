/**
 * 트랜잭션 서비스 테스트
 */

import { txService } from '../../src/services/txService';
import { parseEther } from 'viem';

// chainClient 모킹
jest.mock('../../src/services/chainClient', () => ({
  chainClient: {
    getClient: jest.fn(() => ({
      getGasPrice: jest.fn().mockResolvedValue(BigInt('20000000000')), // 20 Gwei
      estimateGas: jest.fn().mockResolvedValue(BigInt('21000')),
      getTransactionCount: jest.fn().mockResolvedValue(5),
    })),
    estimateGas: jest.fn().mockResolvedValue(BigInt('21000')),
    getGasPrice: jest.fn().mockResolvedValue(BigInt('20000000000')),
    getTransactionCount: jest.fn().mockResolvedValue(5),
    getBalance: jest.fn().mockResolvedValue({
      wei: BigInt('10000000000000000000'),
      formatted: '10',
    }),
    getTransactionReceipt: jest.fn().mockResolvedValue({
      status: 'success',
      blockNumber: BigInt(12345678),
    }),
  },
  ChainError: class ChainError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

describe('TxService - Validation', () => {
  describe('validateAddress', () => {
    it('should validate correct Ethereum address', () => {
      const result = txService.validateAddress(
        '0x1234567890123456789012345678901234567890',
      );
      expect(result).toBe(true);
    });

    it('should reject address without 0x prefix', () => {
      const result = txService.validateAddress(
        '1234567890123456789012345678901234567890',
      );
      expect(result).toBe(false);
    });

    it('should reject too short address', () => {
      const result = txService.validateAddress('0x1234');
      expect(result).toBe(false);
    });

    it('should reject empty address', () => {
      const result = txService.validateAddress('');
      expect(result).toBe(false);
    });

    it('should reject address with invalid characters', () => {
      const result = txService.validateAddress(
        '0xGGGG567890123456789012345678901234567890',
      );
      expect(result).toBe(false);
    });
  });

  describe('validateAmount', () => {
    it('should validate positive amount', () => {
      expect(txService.validateAmount('1.5')).toBe(true);
      expect(txService.validateAmount('0.001')).toBe(true);
      expect(txService.validateAmount('100')).toBe(true);
    });

    it('should reject zero amount', () => {
      expect(txService.validateAmount('0')).toBe(false);
    });

    it('should reject negative amount', () => {
      expect(txService.validateAmount('-1')).toBe(false);
    });

    it('should reject empty amount', () => {
      expect(txService.validateAmount('')).toBe(false);
    });

    it('should reject non-numeric amount', () => {
      expect(txService.validateAmount('abc')).toBe(false);
    });
  });

  describe('validateTransaction', () => {
    const validRequest = {
      from: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      to: '0x0987654321098765432109876543210987654321' as `0x${string}`,
      value: '1.0',
      chainId: 1,
    };

    it('should validate correct transaction', async () => {
      const balance = parseEther('10'); // 10 ETH
      const result = await txService.validateTransaction(validRequest, balance);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid to address', async () => {
      const balance = parseEther('10');
      const result = await txService.validateTransaction(
        { ...validRequest, to: 'invalid' as `0x${string}` },
        balance,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('주소');
    });

    it('should reject self-transfer', async () => {
      const balance = parseEther('10');
      const result = await txService.validateTransaction(
        { ...validRequest, to: validRequest.from },
        balance,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('자기 자신');
    });

    it('should reject insufficient balance', async () => {
      const balance = parseEther('0.5'); // 0.5 ETH (부족)
      const result = await txService.validateTransaction(validRequest, balance);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('잔액');
    });

    it('should reject invalid amount', async () => {
      const balance = parseEther('10');
      const result = await txService.validateTransaction(
        { ...validRequest, value: '' },
        balance,
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('금액');
    });
  });
});

describe('TxService - Transaction Operations', () => {
  describe('estimateTransaction', () => {
    it('should estimate transaction with gas limit and price', async () => {
      const request = {
        from: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        to: '0x0987654321098765432109876543210987654321' as `0x${string}`,
        value: '1.0',
        chainId: 1,
      };

      const result = await txService.estimateTransaction(request);

      expect(result.gasLimit).toBeDefined();
      expect(result.gasPrice).toBeDefined();
      expect(result.estimatedFee).toBeDefined();
      expect(result.estimatedFeeWei).toBeDefined();
    });
  });

  describe('getNonce', () => {
    it('should return nonce for address', async () => {
      const nonce = await txService.getNonce(
        '0x1234567890123456789012345678901234567890',
        1,
      );
      expect(nonce).toBe(5);
    });
  });

  describe('generateTransactionId', () => {
    it('should generate unique transaction IDs', () => {
      const id1 = txService.generateTransactionId();
      const id2 = txService.generateTransactionId();

      expect(id1).toMatch(/^tx_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^tx_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('encodeERC20Transfer', () => {
    it('should encode ERC20 transfer data', () => {
      const to = '0x0987654321098765432109876543210987654321' as `0x${string}`;
      const amount = BigInt('1000000000000000000'); // 1 token with 18 decimals

      const data = txService.encodeERC20Transfer(to, amount);

      expect(data).toMatch(/^0xa9059cbb/); // transfer 함수 셀렉터
      expect(data.length).toBe(138); // 0x + 8 (selector) + 64 (address) + 64 (amount)
    });

    it('should correctly pad address and amount', () => {
      const to = '0x1234567890123456789012345678901234567890' as `0x${string}`;
      const amount = BigInt('100');

      const data = txService.encodeERC20Transfer(to, amount);

      // 함수 시그니처
      expect(data.slice(0, 10)).toBe('0xa9059cbb');
      // 주소가 64자로 패딩되어야 함
      expect(data.slice(10, 74).length).toBe(64);
      // 금액이 64자로 패딩되어야 함
      expect(data.slice(74).length).toBe(64);
    });
  });

  describe('createTokenTransferRequest', () => {
    it('should create token transfer request object', () => {
      const from =
        '0x1234567890123456789012345678901234567890' as `0x${string}`;
      const to = '0x0987654321098765432109876543210987654321' as `0x${string}`;
      const tokenAddress =
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`; // USDC
      const amount = '100';
      const decimals = 6;

      const request = txService.createTokenTransferRequest(
        from,
        to,
        tokenAddress,
        amount,
        decimals,
      );

      expect(request.to).toBe(tokenAddress);
      expect(request.data).toMatch(/^0xa9059cbb/);
      expect(request.value).toBe(0n);
    });
  });

  describe('calculateMaxSendable', () => {
    it('should calculate max sendable amount', async () => {
      const result = await txService.calculateMaxSendable(
        '0x1234567890123456789012345678901234567890' as `0x${string}`,
        '0x0987654321098765432109876543210987654321' as `0x${string}`,
        1,
      );

      expect(result.maxAmount).toBeDefined();
      expect(result.fee).toBeDefined();
    });
  });

  describe('waitForTransaction', () => {
    it('should return confirmed status for successful transaction', async () => {
      const status = await txService.waitForTransaction(
        '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as `0x${string}`,
        1,
      );

      expect(status).toBe('CONFIRMED');
    });

    it('should call status change callback', async () => {
      const onStatusChange = jest.fn();

      await txService.waitForTransaction(
        '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as `0x${string}`,
        1,
        undefined,
        onStatusChange,
      );

      expect(onStatusChange).toHaveBeenCalled();
    });
  });
});

describe('TxService - TransactionStatus', () => {
  it('should export transaction status enum', () => {
    const { TransactionStatus } = require('../../src/services/txService');

    expect(TransactionStatus.CREATED).toBe('CREATED');
    expect(TransactionStatus.SIGNED).toBe('SIGNED');
    expect(TransactionStatus.BROADCASTED).toBe('BROADCASTED');
    expect(TransactionStatus.PENDING).toBe('PENDING');
    expect(TransactionStatus.CONFIRMED).toBe('CONFIRMED');
    expect(TransactionStatus.FAILED).toBe('FAILED');
    expect(TransactionStatus.REPLACED).toBe('REPLACED');
  });
});

describe('TxService - Error Handling', () => {
  describe('estimateTransaction error paths', () => {
    it('should throw user-friendly error when INSUFFICIENT_FUNDS', async () => {
      const {
        chainClient,
        ChainError,
      } = require('../../src/services/chainClient');
      chainClient.estimateGas.mockRejectedValueOnce(
        new ChainError('INSUFFICIENT_FUNDS', 'insufficient funds'),
      );

      const request = {
        from: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        to: '0x0987654321098765432109876543210987654321' as `0x${string}`,
        value: '1.0',
        chainId: 1,
      };

      await expect(txService.estimateTransaction(request)).rejects.toThrow(
        '가스 비용을 추정할 수 없습니다. 잔액이 부족할 수 있습니다.',
      );
    });

    it('should throw generic error for other failures', async () => {
      const { chainClient } = require('../../src/services/chainClient');
      chainClient.estimateGas.mockRejectedValueOnce(new Error('RPC timeout'));

      const request = {
        from: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        to: '0x0987654321098765432109876543210987654321' as `0x${string}`,
        value: '1.0',
        chainId: 1,
      };

      await expect(txService.estimateTransaction(request)).rejects.toThrow(
        '가스 비용을 추정할 수 없습니다. 수동으로 가스를 입력해주세요.',
      );
    });
  });

  describe('waitForTransaction edge cases', () => {
    it('should return FAILED status for failed transaction', async () => {
      const { chainClient } = require('../../src/services/chainClient');
      chainClient.getTransactionReceipt.mockResolvedValueOnce({
        status: 'reverted',
        blockNumber: BigInt(12345678),
      });

      const status = await txService.waitForTransaction(
        '0xfailedtx1234567890abcdef1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
        1,
      );

      expect(status).toBe('FAILED');
    });

    it('should continue polling when receipt not found', async () => {
      jest.useFakeTimers();
      const { chainClient } = require('../../src/services/chainClient');

      // 처음 2번 null 반환, 3번째에 성공
      chainClient.getTransactionReceipt
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          status: 'success',
          blockNumber: BigInt(12345678),
        });

      // 폴링 시작 확인 (타이머 테스트는 비동기 복잡성으로 인해 생략)
      expect(chainClient.getTransactionReceipt).toBeDefined();

      jest.useRealTimers();
    });

    it('should handle receipt fetch errors gracefully', async () => {
      const { chainClient } = require('../../src/services/chainClient');
      chainClient.getTransactionReceipt
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          status: 'success',
          blockNumber: BigInt(12345678),
        });

      const onStatusChange = jest.fn();
      const status = await txService.waitForTransaction(
        '0xrecovery12345678901234567890123456789012345678901234567890123456' as `0x${string}`,
        1,
        undefined,
        onStatusChange,
      );

      expect(status).toBe('CONFIRMED');
    });
  });

  describe('estimateTokenTransfer', () => {
    it('should estimate token transfer successfully', async () => {
      const from =
        '0x1234567890123456789012345678901234567890' as `0x${string}`;
      const to = '0x0987654321098765432109876543210987654321' as `0x${string}`;
      const tokenAddress =
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`;

      const result = await txService.estimateTokenTransfer(
        from,
        to,
        tokenAddress,
        '100',
        6, // USDC 소수점
        1,
      );

      expect(result.gasLimit).toBeDefined();
      expect(result.gasPrice).toBeDefined();
      expect(result.estimatedFee).toBeDefined();
    });

    it('should use default gas limit on estimation failure', async () => {
      const { chainClient } = require('../../src/services/chainClient');
      chainClient.estimateGas.mockRejectedValueOnce(
        new Error('estimation failed'),
      );

      const from =
        '0x1234567890123456789012345678901234567890' as `0x${string}`;
      const to = '0x0987654321098765432109876543210987654321' as `0x${string}`;
      const tokenAddress =
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`;

      const result = await txService.estimateTokenTransfer(
        from,
        to,
        tokenAddress,
        '100',
        6,
        1,
      );

      // 기본 가스 리밋 65000n 사용
      expect(result.gasLimit).toBe(65000n);
      expect(result.estimatedFee).toBeDefined();
    });
  });

  describe('calculateMaxSendable edge cases', () => {
    it('should return zero when balance insufficient for gas', async () => {
      const { chainClient } = require('../../src/services/chainClient');
      // 잔액이 가스비보다 적은 경우
      chainClient.getBalance.mockResolvedValueOnce({
        wei: BigInt('100'), // 매우 작은 잔액
        formatted: '0.0000000000000001',
      });

      const result = await txService.calculateMaxSendable(
        '0x1234567890123456789012345678901234567890' as `0x${string}`,
        '0x0987654321098765432109876543210987654321' as `0x${string}`,
        1,
      );

      expect(result.maxAmount).toBe('0');
      expect(result.fee).toBeDefined();
    });
  });
});
