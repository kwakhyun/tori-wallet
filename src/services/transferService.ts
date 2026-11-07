import {
  erc20Abi,
  formatEther,
  formatUnits,
  isAddress,
  keccak256,
  toHex,
} from 'viem';
import { chainClient } from './chainClient';
import { parseTransferAmount, txService, type FeeSpeed } from './txService';
import type { TransactionParams } from './signingService';

/** 검토한 전송 계획을 서명할 수 있는 최대 시간 */
export const TRANSFER_PLAN_TTL_MS = 90_000;

interface TransferInput {
  from: `0x${string}`;
  to: `0x${string}`;
  amount: string;
  chainId: number;
  tokenAddress?: `0x${string}`;
  /** 수수료 속도 (기본: 보통) */
  feeSpeed?: FeeSpeed;
  /**
   * 전체 잔액 전송. 네이티브는 잔액 − 최대 수수료, 토큰은 전체 토큰 잔액을
   * 같은 추정값으로 계산해 계획에 고정한다 (amount는 무시).
   */
  sendMax?: boolean;
  /** 표시 전용: 수신자를 ENS 이름으로 입력한 경우 그 이름 */
  ensName?: string;
}

export interface TransferPlan extends TransferInput {
  transaction: TransactionParams;
  units: bigint;
  decimals: number;
  /** 최대 수수료 (네이티브 단위 문자열) */
  fee: string;
  feeWei: bigint;
  feeSpeed: FeeSpeed;
  feeType: 'eip1559' | 'legacy';
  symbol?: string;
  expiresAt: number;
  /** 서명 직전 계획이 바뀌지 않았는지 확인하는 지문 */
  fingerprint: `0x${string}`;
}

export type RecipientKind = 'eoa' | 'contract' | 'unknown';

// EIP-7702 위임 지정자: 코드가 있어도 실제로는 개인 계정(EOA)이다.
const EIP7702_DELEGATION_PREFIX = '0xef0100';

function planFingerprint(
  plan: Omit<TransferPlan, 'fingerprint'>,
): `0x${string}` {
  const tx = plan.transaction;
  return keccak256(
    toHex(
      JSON.stringify([
        plan.chainId,
        plan.from.toLowerCase(),
        plan.to.toLowerCase(),
        plan.tokenAddress?.toLowerCase() ?? null,
        plan.units.toString(),
        plan.feeSpeed,
        tx.from.toLowerCase(),
        tx.to?.toLowerCase() ?? null,
        tx.data ?? null,
        tx.value ?? null,
        tx.gas ?? null,
        tx.gasPrice ?? null,
        tx.maxFeePerGas ?? null,
        tx.maxPriorityFeePerGas ?? null,
        plan.expiresAt,
      ]),
    ),
  );
}

export const transferService = {
  async readToken(
    address: `0x${string}`,
    token: `0x${string}`,
    chainId: number,
  ) {
    if (!isAddress(token)) throw new Error('유효하지 않은 토큰 주소입니다.');
    const client = chainClient.getClient(chainId);
    const [decimals, symbol, balance] = await Promise.all([
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'decimals',
      }),
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'symbol',
      }),
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      }),
    ]);
    return {
      decimals,
      symbol,
      wei: balance,
      formatted: formatUnits(balance, decimals),
    };
  },

  /**
   * 수신 주소가 컨트랙트인지 확인한다 (조회 실패 시 'unknown').
   */
  async getRecipientKind(
    address: `0x${string}`,
    chainId: number,
  ): Promise<RecipientKind> {
    try {
      const code = await chainClient.getClient(chainId).getCode({ address });
      if (!code || code === '0x') return 'eoa';
      if (code.toLowerCase().startsWith(EIP7702_DELEGATION_PREFIX))
        return 'eoa';
      return 'contract';
    } catch {
      return 'unknown';
    }
  },

  async prepare(input: TransferInput): Promise<TransferPlan> {
    if (!isAddress(input.from) || !isAddress(input.to))
      throw new Error('유효하지 않은 주소입니다.');
    if (input.from.toLowerCase() === input.to.toLowerCase())
      throw new Error('자기 자신에게 전송할 수 없습니다.');
    const feeSpeed = input.feeSpeed ?? 'normal';
    const client = chainClient.getClient(input.chainId);
    const [nativeBalance, token] = await Promise.all([
      client.getBalance({ address: input.from }),
      input.tokenAddress
        ? this.readToken(input.from, input.tokenAddress, input.chainId)
        : undefined,
    ]);
    const decimals = token?.decimals ?? 18;

    let amount = input.amount;
    let units: bigint;
    let estimate: Awaited<ReturnType<typeof txService.estimateTransaction>>;
    let transaction: { to: `0x${string}`; data?: `0x${string}`; value: bigint };

    if (input.tokenAddress && token) {
      if (input.sendMax) {
        if (token.wei <= 0n)
          throw new Error('보낼 수 있는 토큰 잔액이 없습니다.');
        amount = formatUnits(token.wei, decimals);
      }
      units = parseTransferAmount(amount, decimals);
      if (units > token.wei) throw new Error('잔액이 부족합니다.');
      transaction = txService.createTokenTransferRequest(
        input.from,
        input.to,
        input.tokenAddress,
        amount,
        decimals,
      );
      estimate = await txService.estimateTokenTransfer(
        input.from,
        input.to,
        input.tokenAddress,
        amount,
        decimals,
        input.chainId,
        undefined,
        feeSpeed,
      );
    } else if (input.sendMax) {
      // 같은 추정값으로 수수료를 먼저 확보하고 남는 잔액을 보낸다 (bigint).
      estimate = await txService.estimateTransaction(
        {
          from: input.from,
          to: input.to,
          value: formatEther(1n),
          chainId: input.chainId,
        },
        feeSpeed,
      );
      units = nativeBalance - estimate.estimatedFeeWei;
      if (units <= 0n)
        throw new Error('수수료를 제외하면 보낼 수 있는 잔액이 없습니다.');
      amount = formatEther(units);
      transaction = { to: input.to, value: units, data: undefined };
    } else {
      units = parseTransferAmount(amount, decimals);
      if (units > nativeBalance) throw new Error('잔액이 부족합니다.');
      transaction = { to: input.to, value: units, data: undefined };
      estimate = await txService.estimateTransaction(
        {
          from: input.from,
          to: input.to,
          value: amount,
          chainId: input.chainId,
        },
        feeSpeed,
      );
    }

    if (nativeBalance < transaction.value + estimate.estimatedFeeWei)
      throw new Error('전송 수수료를 지불할 잔액이 부족합니다.');

    const feeFields: Pick<
      TransactionParams,
      'gasPrice' | 'maxFeePerGas' | 'maxPriorityFeePerGas'
    > =
      estimate.feeType === 'eip1559' &&
      estimate.maxFeePerGas !== undefined &&
      estimate.maxPriorityFeePerGas !== undefined
        ? {
            maxFeePerGas: estimate.maxFeePerGas.toString(),
            maxPriorityFeePerGas: estimate.maxPriorityFeePerGas.toString(),
          }
        : { gasPrice: estimate.gasPrice.toString() };

    const unsigned: Omit<TransferPlan, 'fingerprint'> = {
      ...input,
      amount,
      units,
      decimals,
      symbol: token?.symbol,
      fee: estimate.estimatedFee,
      feeWei: estimate.estimatedFeeWei,
      feeSpeed,
      feeType: feeFields.maxFeePerGas !== undefined ? 'eip1559' : 'legacy',
      expiresAt: Date.now() + TRANSFER_PLAN_TTL_MS,
      transaction: Object.freeze({
        ...transaction,
        from: input.from,
        value: transaction.value.toString(),
        gas: estimate.gasLimit.toString(),
        ...feeFields,
      }),
    };
    return Object.freeze({
      ...unsigned,
      fingerprint: planFingerprint(unsigned),
    });
  },

  /**
   * 서명 직전에 계획이 검토 이후 바뀌지 않았는지 확인한다.
   */
  assertPlanIntact(plan: TransferPlan): void {
    const { fingerprint, ...rest } = plan;
    if (planFingerprint(rest) !== fingerprint)
      throw new Error('검토 후 전송 정보가 변경되어 차단했습니다.');
  },
};
