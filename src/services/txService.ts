/**
 * 트랜잭션 전송 서비스 (검증 → 추정 → 서명 → 전파 → 추적)
 */

import { chainClient, ChainError } from './chainClient';
import { parseEther, formatEther, parseUnits, isAddress } from 'viem';

const HEX_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

/**
 * 주소 입력의 형식 문제
 *  - invalid: 0x + 40자리 16진수가 아님
 *  - checksum: 형식은 맞지만 대소문자(EIP-55 체크섬)가 틀림
 */
export type AddressFormatIssue = 'empty' | 'invalid' | 'checksum';

export function getAddressFormatIssue(
  input: string,
): AddressFormatIssue | null {
  const value = input.trim();
  if (!value) return 'empty';
  if (!HEX_ADDRESS.test(value)) return 'invalid';
  // viem 기본(strict) 검사: 대소문자가 섞인 주소는 체크섬까지 확인한다.
  if (!isAddress(value)) return 'checksum';
  return null;
}

/** 수수료 속도 */
export type FeeSpeed = 'slow' | 'normal' | 'fast';
export const FEE_SPEEDS: FeeSpeed[] = ['slow', 'normal', 'fast'];
export const FEE_SPEED_LABELS: Record<FeeSpeed, string> = {
  slow: '느림',
  normal: '보통',
  fast: '빠름',
};

// 정수 백분율 배율 (bigint 연산으로 반올림 오차 없이 계산)
const PRIORITY_FEE_PERCENT: Record<FeeSpeed, bigint> = {
  slow: 80n,
  normal: 100n,
  fast: 150n,
};
const BASE_FEE_HEADROOM_PERCENT: Record<FeeSpeed, bigint> = {
  slow: 100n,
  normal: 100n,
  fast: 125n,
};
const LEGACY_GAS_PRICE_PERCENT: Record<FeeSpeed, bigint> = {
  slow: 90n,
  normal: 100n,
  fast: 125n,
};

export type FeeData =
  | { type: 'eip1559'; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }
  | { type: 'legacy'; gasPrice: bigint };

/**
 * 네트워크 기본 수수료(보통)에 속도별 배율을 적용한다.
 * EIP-1559: 우선 수수료와 기본 수수료 여유분(maxFee − priority)을 각각 조정한다.
 */
export function applyFeeSpeed(base: FeeData, speed: FeeSpeed): FeeData {
  if (base.type === 'legacy') {
    return {
      type: 'legacy',
      gasPrice: (base.gasPrice * LEGACY_GAS_PRICE_PERCENT[speed]) / 100n,
    };
  }
  const priority = base.maxPriorityFeePerGas;
  const headroom =
    base.maxFeePerGas > priority ? base.maxFeePerGas - priority : 0n;
  const maxPriorityFeePerGas = (priority * PRIORITY_FEE_PERCENT[speed]) / 100n;
  const maxFeePerGas =
    (headroom * BASE_FEE_HEADROOM_PERCENT[speed]) / 100n + maxPriorityFeePerGas;
  return { type: 'eip1559', maxFeePerGas, maxPriorityFeePerGas };
}

/** 가스 단위당 최대 지불 가격 */
export function maxPricePerGas(fee: FeeData): bigint {
  return fee.type === 'legacy' ? fee.gasPrice : fee.maxFeePerGas;
}

export function parseTransferAmount(amount: string, decimals = 18): bigint {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 255 ||
    !/^\d+(\.\d+)?$/.test(amount) ||
    (amount.split('.')[1]?.length ?? 0) > decimals
  ) {
    throw new Error('토큰의 소수 자릿수에 맞는 금액을 입력해주세요.');
  }
  const units = parseUnits(amount, decimals);
  if (units <= 0n || units >= 2n ** 256n)
    throw new Error('유효하지 않은 금액입니다.');
  return units;
}

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
  /** 레거시: gasPrice, EIP-1559: maxFeePerGas (가스당 최대 가격) */
  gasPrice: bigint;
  feeType: FeeData['type'];
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  /** gasLimit × 가스당 최대 가격 (최대 수수료) */
  estimatedFee: string;
  estimatedFeeWei: bigint;
  speed: FeeSpeed;
}

function buildEstimate(
  gasLimit: bigint,
  fee: FeeData,
  speed: FeeSpeed,
): TransactionEstimate {
  const pricePerGas = maxPricePerGas(fee);
  const estimatedFeeWei = gasLimit * pricePerGas;
  return {
    gasLimit,
    gasPrice: pricePerGas,
    feeType: fee.type,
    ...(fee.type === 'eip1559'
      ? {
          maxFeePerGas: fee.maxFeePerGas,
          maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
        }
      : {}),
    estimatedFee: formatEther(estimatedFeeWei),
    estimatedFeeWei,
    speed,
  };
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
    return getAddressFormatIssue(address) === null;
  }

  /**
   * 네트워크 수수료 조회 (EIP-1559 지원 시 estimateFeesPerGas, 아니면 gasPrice)
   */
  async getFeeData(
    chainId: number,
    speed: FeeSpeed = 'normal',
    rpcUrl?: string,
  ): Promise<FeeData> {
    try {
      const client = chainClient.getClient(chainId, rpcUrl);
      const fees = await client.estimateFeesPerGas();
      if (
        typeof fees?.maxFeePerGas === 'bigint' &&
        typeof fees?.maxPriorityFeePerGas === 'bigint'
      ) {
        return applyFeeSpeed(
          {
            type: 'eip1559',
            maxFeePerGas: fees.maxFeePerGas,
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
          },
          speed,
        );
      }
    } catch {
      // EIP-1559 미지원 체인 또는 조회 실패 → 레거시 gasPrice
    }
    const gasPrice = await chainClient.getGasPrice({ chainId, rpcUrl });
    return applyFeeSpeed({ type: 'legacy', gasPrice }, speed);
  }

  /**
   * 금액 유효성 검증
   */
  validateAmount(amount: string): boolean {
    try {
      parseTransferAmount(amount);
      return true;
    } catch {
      return false;
    }
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
    speed: FeeSpeed = 'normal',
  ): Promise<TransactionEstimate> {
    try {
      const valueWei = parseEther(request.value);

      const [gasLimit, fee] = await Promise.all([
        chainClient.estimateGas(
          {
            from: request.from,
            to: request.to,
            value: valueWei,
            data: request.data,
          },
          { chainId: request.chainId, rpcUrl: request.rpcUrl },
        ),
        this.getFeeData(request.chainId, speed, request.rpcUrl),
      ]);

      // 가스 버퍼 추가 (20%)
      const adjustedGasLimit = (gasLimit * 120n) / 100n;
      return buildEstimate(adjustedGasLimit, fee, speed);
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
    speed: FeeSpeed = 'normal',
  ): Promise<{ maxAmount: string; fee: string; maxWei: bigint }> {
    const { wei: balance } = await chainClient.getBalance(from, {
      chainId,
      rpcUrl,
    });

    // 1 wei로 가스를 추정한다 (잔액이 아주 적어도 추정이 실패하지 않도록).
    const estimate = await this.estimateTransaction(
      {
        from,
        to,
        value: formatEther(1n),
        chainId,
        rpcUrl,
      },
      speed,
    );

    const maxWei = balance - estimate.estimatedFeeWei;

    if (maxWei <= 0n) {
      return { maxAmount: '0', fee: estimate.estimatedFee, maxWei: 0n };
    }

    return {
      maxAmount: formatEther(maxWei),
      fee: estimate.estimatedFee,
      maxWei,
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
    speed: FeeSpeed = 'normal',
  ): Promise<TransactionEstimate> {
    try {
      const tokenAmount = parseTransferAmount(amount, decimals);
      const data = this.encodeERC20Transfer(to, tokenAmount);

      const [gasLimit, fee] = await Promise.all([
        chainClient.estimateGas(
          {
            from,
            to: tokenAddress,
            data,
          },
          { chainId, rpcUrl },
        ),
        this.getFeeData(chainId, speed, rpcUrl),
      ]);

      // 가스 버퍼 추가 (30% - 토큰 전송은 더 많이)
      const adjustedGasLimit = (gasLimit * 130n) / 100n;
      return buildEstimate(adjustedGasLimit, fee, speed);
    } catch {
      throw new Error(
        '토큰 전송을 확인할 수 없습니다. 금액, 잔액과 네트워크를 확인해주세요.',
      );
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
    const tokenAmount = parseTransferAmount(amount, decimals);
    const data = this.encodeERC20Transfer(to, tokenAmount);

    return {
      to: tokenAddress,
      data,
      value: 0n,
    };
  }
}

export const txService = new TransactionService();
