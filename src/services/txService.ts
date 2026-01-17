/**
 * 트랜잭션 전송 서비스 (검증 → 추정 → 서명 → 전파 → 추적)
 */

import { chainClient, ChainError } from './chainClient';
import { parseEther, formatEther } from 'viem';

export enum TransactionStatus {
  CREATED = 'CREATED',
  SIGNED = 'SIGNED',
  BROADCASTED = 'BROADCASTED',
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  REPLACED = 'REPLACED',
}

export interface TransactionRequest {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string; // ETH 단위 (e.g., "0.1")
  data?: `0x${string}`;
  chainId: number;
  rpcUrl?: string;
}

export interface TransactionEstimate {
  gasLimit: bigint;
  gasPrice: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  estimatedFee: string;
  estimatedFeeWei: bigint;
}

export interface TransactionRecord {
  id: string;
  hash?: string;
  from: string;
  to: string;
  value: string;
  chainId: number;
  status: TransactionStatus;
  nonce?: number;
  gasLimit?: string;
  gasPrice?: string;
  timestamp: number;
  error?: string;
}

class TransactionService {
  /**
   * 주소 유효성 검증
   */
  validateAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * 금액 유효성 검증
   */
  validateAmount(amount: string): boolean {
    if (!amount || amount === '') return false;
    const num = parseFloat(amount);
    return !isNaN(num) && num > 0;
  }

  /**
   * 전송 전 검증
   */
  async validateTransaction(
    request: TransactionRequest,
    balance: bigint,
  ): Promise<{ valid: boolean; error?: string }> {
    // 주소 검증
    if (!this.validateAddress(request.to)) {
      return { valid: false, error: '유효하지 않은 수신 주소입니다.' };
    }

    // 자기 자신에게 전송 검증
    if (request.from.toLowerCase() === request.to.toLowerCase()) {
      return { valid: false, error: '자기 자신에게 전송할 수 없습니다.' };
    }

    // 금액 검증
    if (!this.validateAmount(request.value)) {
      return { valid: false, error: '유효하지 않은 금액입니다.' };
    }

    const valueWei = parseEther(request.value);

    // 잔액 검증
    if (valueWei > balance) {
      return { valid: false, error: '잔액이 부족합니다.' };
    }

    return { valid: true };
  }

  /**
   * 가스 추정
   */
  async estimateTransaction(
    request: TransactionRequest,
  ): Promise<TransactionEstimate> {
    try {
      const valueWei = parseEther(request.value);

      const [gasLimit, gasPrice] = await Promise.all([
        chainClient.estimateGas(
          {
            from: request.from,
            to: request.to,
            value: valueWei,
            data: request.data,
          },
          { chainId: request.chainId, rpcUrl: request.rpcUrl },
        ),
        chainClient.getGasPrice({
          chainId: request.chainId,
          rpcUrl: request.rpcUrl,
        }),
      ]);

      // 가스 버퍼 추가 (20%)
      const adjustedGasLimit = (gasLimit * 120n) / 100n;
      const estimatedFeeWei = adjustedGasLimit * gasPrice;

      return {
        gasLimit: adjustedGasLimit,
        gasPrice,
        estimatedFee: formatEther(estimatedFeeWei),
        estimatedFeeWei,
      };
    } catch (error) {
      if (error instanceof ChainError && error.code === 'INSUFFICIENT_FUNDS') {
        throw new Error(
          '가스 비용을 추정할 수 없습니다. 잔액이 부족할 수 있습니다.',
        );
      }
      throw new Error(
        '가스 비용을 추정할 수 없습니다. 수동으로 가스를 입력해주세요.',
      );
    }
  }

  /**
   * 보낼 수 있는 최대 금액 계산 (가스 비용 제외)
   */
  async calculateMaxSendable(
    from: `0x${string}`,
    to: `0x${string}`,
    chainId: number,
    rpcUrl?: string,
  ): Promise<{ maxAmount: string; fee: string }> {
    const { wei: balance } = await chainClient.getBalance(from, {
      chainId,
      rpcUrl,
    });

    // 최소 금액으로 가스 추정
    const estimate = await this.estimateTransaction({
      from,
      to,
      value: '0.0001',
      chainId,
      rpcUrl,
    });

    const maxWei = balance - estimate.estimatedFeeWei;

    if (maxWei <= 0n) {
      return { maxAmount: '0', fee: estimate.estimatedFee };
    }

    return {
      maxAmount: formatEther(maxWei),
      fee: estimate.estimatedFee,
    };
  }

  /**
   * 트랜잭션 상태 추적 (폴링)
   */
  async waitForTransaction(
    txHash: `0x${string}`,
    chainId: number,
    rpcUrl?: string,
    onStatusChange?: (status: TransactionStatus) => void,
  ): Promise<TransactionStatus> {
    const maxAttempts = 60;
    const pollInterval = 3000;

    onStatusChange?.(TransactionStatus.PENDING);

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const receipt = await chainClient.getTransactionReceipt(txHash, {
          chainId,
          rpcUrl,
        });

        if (receipt) {
          const status =
            receipt.status === 'success'
              ? TransactionStatus.CONFIRMED
              : TransactionStatus.FAILED;
          onStatusChange?.(status);
          return status;
        }
      } catch {
        // 트랜잭션이 아직 처리되지 않음
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return TransactionStatus.PENDING;
  }

  /**
   * Nonce 조회 (pending stuck 대응)
   */
  async getNonce(
    address: `0x${string}`,
    chainId: number,
    rpcUrl?: string,
  ): Promise<number> {
    return chainClient.getTransactionCount(address, { chainId, rpcUrl });
  }

  /**
   * 트랜잭션 ID 생성
   */
  generateTransactionId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * ERC-20 토큰 전송 데이터 생성
   */
  encodeERC20Transfer(to: `0x${string}`, amount: bigint): `0x${string}` {
    // transfer(address,uint256) 함수 시그니처
    const functionSelector = '0xa9059cbb';

    // 주소를 32바이트로 패딩
    const paddedTo = to.slice(2).padStart(64, '0');

    // 금액을 32바이트로 패딩
    const paddedAmount = amount.toString(16).padStart(64, '0');

    return `${functionSelector}${paddedTo}${paddedAmount}` as `0x${string}`;
  }

  /**
   * ERC-20 토큰 전송 가스 추정
   */
  async estimateTokenTransfer(
    from: `0x${string}`,
    to: `0x${string}`,
    tokenAddress: `0x${string}`,
    amount: string,
    decimals: number,
    chainId: number,
    rpcUrl?: string,
  ): Promise<TransactionEstimate> {
    try {
      const tokenAmount = BigInt(
        Math.floor(parseFloat(amount) * Math.pow(10, decimals)),
      );
      const data = this.encodeERC20Transfer(to, tokenAmount);

      const [gasLimit, gasPrice] = await Promise.all([
        chainClient.estimateGas(
          {
            from,
            to: tokenAddress,
            data,
          },
          { chainId, rpcUrl },
        ),
        chainClient.getGasPrice({ chainId, rpcUrl }),
      ]);

      // 가스 버퍼 추가 (30% - 토큰 전송은 더 많이)
      const adjustedGasLimit = (gasLimit * 130n) / 100n;
      const estimatedFeeWei = adjustedGasLimit * gasPrice;

      return {
        gasLimit: adjustedGasLimit,
        gasPrice,
        estimatedFee: formatEther(estimatedFeeWei),
        estimatedFeeWei,
      };
    } catch {
      // 기본 가스 추정값 사용 (토큰 전송 평균)
      const defaultGasLimit = 65000n;
      const gasPrice = await chainClient.getGasPrice({ chainId, rpcUrl });
      const estimatedFeeWei = defaultGasLimit * gasPrice;

      return {
        gasLimit: defaultGasLimit,
        gasPrice,
        estimatedFee: formatEther(estimatedFeeWei),
        estimatedFeeWei,
      };
    }
  }

  /**
   * ERC-20 토큰 전송 요청 객체 생성
   */
  createTokenTransferRequest(
    from: `0x${string}`,
    to: `0x${string}`,
    tokenAddress: `0x${string}`,
    amount: string,
    decimals: number,
  ): { to: `0x${string}`; data: `0x${string}`; value: bigint } {
    const tokenAmount = BigInt(
      Math.floor(parseFloat(amount) * Math.pow(10, decimals)),
    );
    const data = this.encodeERC20Transfer(to, tokenAmount);

    return {
      to: tokenAddress,
      data,
      value: 0n,
    };
  }
}

export const txService = new TransactionService();
