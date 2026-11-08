/**
 * 대기 중 거래 가속/취소 서비스
 *
 * 같은 nonce로 수수료를 올린 대체 거래를 만든다.
 *  - 가속: 같은 to/value/data, 수수료 ≥ +12.5% (그리고 현재 네트워크 추정치 이상)
 *  - 취소: 자기 자신에게 0 전송, 같은 nonce, 수수료 ≥ +12.5%
 * 서명 직전에 원래 거래가 아직 대기 중인지(영수증 없음, nonce 미사용) 다시 확인한다.
 * 서명은 기존 송금과 같은 signingService 경로(서명 금고 + 승인 확인)를 사용한다.
 *
 * 가속은 RPC가 돌려준 원래 거래의 to/value/data를 그대로 다시 서명하므로,
 * 이 기기에 기록이 있으면 그 기록과 맞는지 먼저 확인한다 (사용자 지정 RPC가 다른 내용을 돌려주는 경우 차단).
 * 취소 거래를 가속하면 계속 취소 거래로 만든다.
 */

import {
  decodeFunctionData,
  erc20Abi,
  formatEther,
  type Hex,
  type Transaction,
} from 'viem';
import { chainClient } from './chainClient';
import { signingService, type TransactionParams } from './signingService';
import {
  encodeReplacementMethod,
  parseReplacementMethod,
  transactionTracker,
  type ReplacementKind,
} from './transactionTracker';
import {
  transactionCacheService,
  type TransactionType,
} from '@/realm/services/transactionCacheService';

/** 노드 대체 규칙(geth 10%)보다 여유 있는 기본 인상률: 12.5% */
export const FEE_BUMP_NUMERATOR = 1125n;
export const FEE_BUMP_DENOMINATOR = 1000n;
const PLAN_TTL_MS = 90_000;
const MIN_TRANSFER_GAS = 21_000n;

export type FeeFields =
  | { type: 'eip1559'; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }
  | { type: 'legacy'; gasPrice: bigint };

/** 원래 값의 112.5% (올림). 0이면 0. */
export function bumpFee(value: bigint): bigint {
  if (value <= 0n) return 0n;
  return (
    (value * FEE_BUMP_NUMERATOR + FEE_BUMP_DENOMINATOR - 1n) /
    FEE_BUMP_DENOMINATOR
  );
}

const max = (...values: bigint[]) =>
  values.reduce((a, b) => (b > a ? b : a), 0n);

/**
 * 대체 거래 수수료 계산.
 * EIP-1559는 maxFeePerGas와 maxPriorityFeePerGas를 모두 올리고,
 * 각각 현재 네트워크 추정치보다 낮지 않게 한다. maxFee는 항상 priority 이상이다.
 */
export function computeReplacementFees(
  original: FeeFields,
  network: Partial<{
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    gasPrice: bigint;
  }>,
): FeeFields {
  if (original.type === 'legacy') {
    return {
      type: 'legacy',
      gasPrice: max(bumpFee(original.gasPrice), network.gasPrice ?? 0n),
    };
  }
  const maxPriorityFeePerGas = max(
    bumpFee(original.maxPriorityFeePerGas),
    network.maxPriorityFeePerGas ?? 0n,
  );
  const maxFeePerGas = max(
    bumpFee(original.maxFeePerGas),
    network.maxFeePerGas ?? 0n,
    maxPriorityFeePerGas,
  );
  return { type: 'eip1559', maxFeePerGas, maxPriorityFeePerGas };
}

export function maxFeePerGasOf(fees: FeeFields): bigint {
  return fees.type === 'legacy' ? fees.gasPrice : fees.maxFeePerGas;
}

/** 호출 데이터를 사람이 읽을 수 있게 요약한다. */
export function summarizeCalldata(data: string | null | undefined): string {
  if (!data || data === '0x') return '없음 (단순 전송)';
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: data as Hex });
    if (
      decoded.functionName === 'transfer' ||
      decoded.functionName === 'approve'
    ) {
      const [address, amount] = decoded.args as readonly [string, bigint];
      return `${decoded.functionName}(${address.slice(0, 6)}…${address.slice(
        -4,
      )}, ${amount.toString()})`;
    }
    return decoded.functionName;
  } catch {
    const bytes = Math.max(0, (data.length - 2) / 2);
    return `컨트랙트 호출 ${data.slice(0, 10)} · ${bytes} bytes`;
  }
}

export interface ReplacementPlan {
  kind: ReplacementKind;
  /** 취소 거래를 다시 가속하는 경우 (kind는 'cancel'로 유지된다) */
  acceleratesCancel: boolean;
  chainId: number;
  from: `0x${string}`;
  originalHash: `0x${string}`;
  /** Realm 연결에 사용하는 최초 원본 거래 (대체 거래를 다시 대체하는 경우) */
  rootHash: `0x${string}`;
  nonce: number;
  to: `0x${string}`;
  value: bigint;
  data?: Hex;
  gas: bigint;
  fees: FeeFields;
  originalFees: FeeFields;
  originalMaxCostWei: bigint;
  newMaxCostWei: bigint;
  /** 새 최대 수수료 - 기존 최대 수수료 (음수면 0) */
  extraCostWei: bigint;
  /** value + 새 최대 수수료: 승인 정책(USD 한도) 계산용 */
  totalAtRiskWei: bigint;
  transaction: TransactionParams;
  expiresAt: number;
}

export class ReplacementError extends Error {
  constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'NOT_PENDING'
      | 'NOT_OWNER'
      | 'UNSUPPORTED'
      | 'INSUFFICIENT_FUNDS'
      | 'UNAUTHORIZED'
      | 'MISMATCH',
    message: string,
  ) {
    super(message);
    this.name = 'ReplacementError';
  }
}

function feesOf(tx: Transaction): FeeFields {
  if (
    tx.type === 'eip1559' &&
    tx.maxFeePerGas !== undefined &&
    tx.maxPriorityFeePerGas !== undefined
  ) {
    return {
      type: 'eip1559',
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    };
  }
  // EIP-2930 등은 액세스 목록을 보존하지 못하므로 지원하지 않는다.
  if (tx.type === 'legacy' && tx.gasPrice !== undefined)
    return { type: 'legacy', gasPrice: tx.gasPrice };
  throw new ReplacementError(
    'UNSUPPORTED',
    '이 거래 유형은 가속/취소를 지원하지 않습니다.',
  );
}

/** 대체 계획에 필요한 로컬 기록 필드 (Realm 객체는 비동기 작업 중 무효화될 수 있어 복사한다) */
interface LocalRecordSnapshot {
  method?: string;
  type?: string;
  to?: string;
  valueWei?: string;
  tokenAddress?: string;
}

const sameAddress = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

function parseWei(value: string | undefined): bigint | undefined {
  if (!value) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

/**
 * 가속 전에 RPC가 돌려준 원래 거래가 이 기기의 기록과 맞는지 확인한다.
 * 기록마다 믿을 수 있는 필드만 비교한다 (토큰 전송 기록의 to는 실제 수신자,
 * 스왑 기록의 tokenAddress는 판 토큰이므로 거래의 to와 다를 수 있다).
 */
export function assertMatchesLocalRecord(
  original: Pick<Transaction, 'to' | 'value' | 'input'>,
  record: LocalRecordSnapshot,
): void {
  const mismatch = () =>
    new ReplacementError(
      'MISMATCH',
      '네트워크가 알려준 거래 내용이 이 기기에서 보낸 기록과 다릅니다. 안전을 위해 가속하지 않았습니다.',
    );
  const recordedValue = parseWei(record.valueWei);
  if (recordedValue !== undefined && recordedValue !== original.value)
    throw mismatch();

  const isTokenSend = record.type === 'send' && !!record.tokenAddress;
  const expectedTo =
    isTokenSend || record.type === 'approve'
      ? record.tokenAddress ?? record.to
      : record.to;
  if (expectedTo && !sameAddress(expectedTo, original.to)) throw mismatch();

  // 토큰 전송은 호출 데이터가 transfer이고 수신자도 기록과 같아야 한다.
  if (isTokenSend && record.to) {
    let recipient: string | undefined;
    try {
      const decoded = decodeFunctionData({
        abi: erc20Abi,
        data: original.input,
      });
      if (decoded.functionName === 'transfer')
        recipient = (decoded.args as readonly [string, bigint])[0];
    } catch {
      recipient = undefined;
    }
    if (!recipient || !sameAddress(recipient, record.to)) throw mismatch();
  }
}

function feeParams(fees: FeeFields): Partial<TransactionParams> {
  return fees.type === 'legacy'
    ? { gasPrice: fees.gasPrice.toString() }
    : {
        maxFeePerGas: fees.maxFeePerGas.toString(),
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
      };
}

class TxReplacementService {
  /** 원래 거래를 RPC에서 읽고 아직 대기 중인지 확인한다. */
  async getPendingOriginal(hash: `0x${string}`, chainId: number) {
    const client = chainClient.getClient(chainId);
    let tx: Transaction;
    try {
      tx = await client.getTransaction({ hash });
    } catch {
      throw new ReplacementError(
        'NOT_FOUND',
        '원래 거래를 네트워크에서 찾을 수 없습니다. 이미 처리되었거나 네트워크에서 제거되었을 수 있습니다.',
      );
    }
    if (tx.blockNumber !== null && tx.blockNumber !== undefined)
      throw new ReplacementError(
        'NOT_PENDING',
        '이미 블록에 포함된 거래는 가속하거나 취소할 수 없습니다.',
      );
    return tx;
  }

  /**
   * 서명 직전 재확인: 원래 거래의 영수증이 없고 nonce가 아직 사용되지 않았는지 확인한다.
   */
  async assertStillPending(plan: {
    originalHash: `0x${string}`;
    chainId: number;
    from: `0x${string}`;
    nonce: number;
  }): Promise<void> {
    const client = chainClient.getClient(plan.chainId);
    let mined = false;
    try {
      await client.getTransactionReceipt({ hash: plan.originalHash });
      mined = true;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.name !== 'TransactionReceiptNotFoundError'
      )
        throw new Error(
          '거래 상태를 확인하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해주세요.',
        );
    }
    if (mined)
      throw new ReplacementError(
        'NOT_PENDING',
        '원래 거래가 이미 처리되었습니다. 대체 거래를 보내지 않았습니다.',
      );
    const latest = await client.getTransactionCount({
      address: plan.from,
      blockTag: 'latest',
    });
    if (latest > plan.nonce)
      throw new ReplacementError(
        'NOT_PENDING',
        '이 nonce는 이미 다른 거래로 처리되었습니다. 대체 거래를 보내지 않았습니다.',
      );
  }

  private async readLocal(
    hash: string,
    chainId: number,
  ): Promise<LocalRecordSnapshot | null> {
    try {
      const entry = await transactionCacheService.getByHash(hash, chainId);
      if (!entry) return null;
      return {
        method: entry.method ?? undefined,
        type: entry.type ?? undefined,
        to: entry.to ?? undefined,
        valueWei: entry.valueWei ?? undefined,
        tokenAddress: entry.tokenAddress ?? undefined,
      };
    } catch {
      // 로컬 기록이 없어도 대체는 가능하다.
      return null;
    }
  }

  async prepare(input: {
    kind: ReplacementKind;
    hash: `0x${string}`;
    chainId: number;
    activeAddress: string;
  }): Promise<ReplacementPlan> {
    const original = await this.getPendingOriginal(input.hash, input.chainId);
    if (original.from.toLowerCase() !== input.activeAddress.toLowerCase())
      throw new ReplacementError(
        'NOT_OWNER',
        '현재 계정에서 보낸 거래만 가속하거나 취소할 수 있습니다.',
      );
    if (
      original.chainId !== undefined &&
      original.chainId !== null &&
      Number(original.chainId) !== input.chainId
    )
      throw new ReplacementError(
        'UNSUPPORTED',
        '현재 네트워크의 거래가 아닙니다.',
      );
    if (!original.to)
      throw new ReplacementError(
        'UNSUPPORTED',
        '컨트랙트 배포 거래는 가속/취소를 지원하지 않습니다.',
      );
    const from = original.from;
    const originalFees = feesOf(original);
    const client = chainClient.getClient(input.chainId);

    const local = await this.readLocal(input.hash, input.chainId);
    const parent = parseReplacementMethod(local?.method);
    // 대체 거래를 다시 대체하면 Realm 연결은 최초 원본 거래를 가리킨다.
    const rootHash = (parent?.originalHash ?? input.hash) as `0x${string}`;
    // 취소 거래를 가속해도 취소로 기록해야 알림과 스왑 내역이 '취소됨'으로 정리된다.
    const acceleratesCancel =
      input.kind === 'speedUp' && parent?.kind === 'cancel';
    const kind: ReplacementKind = acceleratesCancel ? 'cancel' : input.kind;
    if (kind === 'speedUp' && local) assertMatchesLocalRecord(original, local);

    const network =
      originalFees.type === 'eip1559'
        ? await client.estimateFeesPerGas({ type: 'eip1559', chain: undefined })
        : { gasPrice: await client.getGasPrice() };
    const fees = computeReplacementFees(originalFees, network);

    let to: `0x${string}`;
    let value: bigint;
    let data: Hex | undefined;
    let gas: bigint;
    if (kind === 'speedUp') {
      to = original.to;
      value = original.value;
      data =
        original.input && original.input !== '0x' ? original.input : undefined;
      gas = original.gas;
    } else {
      to = from;
      value = 0n;
      data = undefined;
      // L2에서는 21000으로 부족할 수 있으므로 추정치를 사용한다.
      const estimated = await chainClient.estimateGas(
        { from, to: from, value: 0n },
        { chainId: input.chainId },
      );
      gas = max(estimated, MIN_TRANSFER_GAS);
    }

    const newMaxCostWei = gas * maxFeePerGasOf(fees);
    const originalMaxCostWei = original.gas * maxFeePerGasOf(originalFees);
    const totalAtRiskWei = value + newMaxCostWei;
    const balance = await client.getBalance({ address: from });
    if (balance < totalAtRiskWei)
      throw new ReplacementError(
        'INSUFFICIENT_FUNDS',
        `대체 거래 수수료를 지불할 잔액이 부족합니다. (필요: 최대 ${formatEther(
          totalAtRiskWei,
        )})`,
      );

    return {
      kind,
      acceleratesCancel,
      chainId: input.chainId,
      from,
      originalHash: input.hash,
      rootHash,
      nonce: original.nonce,
      to,
      value,
      data,
      gas,
      fees,
      originalFees,
      originalMaxCostWei,
      newMaxCostWei,
      extraCostWei:
        newMaxCostWei > originalMaxCostWei
          ? newMaxCostWei - originalMaxCostWei
          : 0n,
      totalAtRiskWei,
      expiresAt: Date.now() + PLAN_TTL_MS,
      transaction: {
        from,
        to,
        value: value.toString(),
        data,
        gas: gas.toString(),
        nonce: original.nonce.toString(),
        ...feeParams(fees),
      },
    };
  }

  /**
   * 승인(PIN 등)이 끝난 계획을 서명/전파한다.
   * isAuthorized는 화면이 살아 있고 계정/네트워크가 그대로이며 만료되지 않았는지 확인한다.
   */
  async submit(
    plan: ReplacementPlan,
    isAuthorized: () => boolean,
    meta?: { nativeSymbol?: string },
  ): Promise<string> {
    const unauthorized = () =>
      new ReplacementError(
        'UNAUTHORIZED',
        '승인이 만료되었거나 계정/네트워크가 변경되었습니다. 다시 확인해주세요.',
      );
    if (!isAuthorized() || Date.now() >= plan.expiresAt) throw unauthorized();
    await this.assertStillPending(plan);
    if (!isAuthorized()) throw unauthorized();
    const hash = await signingService.sendTransaction(
      plan.transaction,
      plan.chainId,
      isAuthorized,
    );
    await this.record(plan, hash, meta?.nativeSymbol);
    transactionTracker.reconcile();
    return hash;
  }

  private async record(
    plan: ReplacementPlan,
    hash: string,
    nativeSymbol?: string,
  ) {
    try {
      const original = await transactionCacheService
        .getByHash(plan.originalHash, plan.chainId)
        .catch(() => null);
      const isCancel = plan.kind === 'cancel';
      const type: TransactionType = isCancel
        ? 'send'
        : (original?.type as TransactionType | undefined) ??
          (plan.data ? 'contract' : 'send');
      await transactionCacheService.createLocalTransaction({
        hash,
        chainId: plan.chainId,
        from: plan.from,
        to: isCancel ? plan.from : original?.to ?? plan.to,
        value: isCancel ? '0' : original?.value ?? formatEther(plan.value),
        valueWei: plan.value.toString(),
        gasPrice: maxFeePerGasOf(plan.fees).toString(),
        gasLimit: plan.gas.toString(),
        nonce: plan.nonce,
        type,
        tokenSymbol: isCancel
          ? nativeSymbol
          : original?.tokenSymbol ?? nativeSymbol,
        tokenAmount: isCancel
          ? '0'
          : original?.tokenAmount ?? formatEther(plan.value),
        tokenAddress: isCancel ? undefined : original?.tokenAddress,
        method: encodeReplacementMethod(plan.kind, plan.rootHash),
      });
    } catch (error) {
      console.warn('Failed to cache replacement transaction:', error);
    }
  }
}

export const txReplacementService = new TxReplacementService();
