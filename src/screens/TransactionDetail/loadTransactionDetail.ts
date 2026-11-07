/**
 * 거래 상세 정보 로더
 *
 * 로컬 기록(Realm 캐시, 스왑 내역)을 먼저 읽고 RPC(getTransaction/getTransactionReceipt)로
 * 최신 상태를 보강한다. RPC에 실패해도 로컬 기록이 있으면 그 정보를 보여 준다.
 */

import { decodeFunctionData, erc20Abi, formatUnits, type Hex } from 'viem';
import { chainClient } from '@/services/chainClient';
import { transactionCacheService } from '@/realm/services';
import { useSwapStore } from '@/store/swapStore';
import {
  parseReplacementMethod,
  type ReplacementKind,
} from '@/services/transactionTracker';
import {
  decodeApproveCalldata,
  formatAllowance,
} from '@/services/approvalService';

export type DetailStatus = 'pending' | 'confirmed' | 'failed' | 'replaced';

export interface TokenMovement {
  kind: 'transfer' | 'approve' | 'swap';
  tokenAddress?: string;
  /** transfer: 받는 주소, approve: 지출 주소 */
  counterparty?: string;
  amountDisplay: string;
  symbol?: string;
  /** 스왑의 받는 쪽 표시 (예: "0.5 ETH") */
  receiveDisplay?: string;
}

export interface RelatedReplacement {
  hash: string;
  kind: ReplacementKind;
  status: string;
}

export interface TransactionDetail {
  hash: string;
  chainId: number;
  status: DetailStatus;
  from?: string;
  to?: string;
  valueWei: bigint;
  nonce?: number;
  blockNumber?: bigint;
  /** 밀리초. 채굴 전에는 로컬 제출 시각 */
  timestamp?: number;
  timestampIsSubmission: boolean;
  gasLimit?: bigint;
  gasUsed?: bigint;
  /** 실제 지불 수수료(채굴됨) 또는 최대 수수료(대기 중) */
  feeWei?: bigint;
  feeIsMax: boolean;
  includesL1Fee: boolean;
  gasPriceWei?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  input?: string;
  token?: TokenMovement;
  localType?: string;
  /** 이 거래를 대체한 거래 (알 수 있는 경우) */
  replacedBy?: string;
  /** 이 거래가 가속/취소 거래인 경우 원래 거래 */
  replacementOf?: { kind: ReplacementKind; originalHash: string };
  /** 이 거래를 대체하려고 제출한 거래들 */
  replacements: RelatedReplacement[];
  /** RPC 조회에 실패해 로컬 정보만 표시 중 */
  rpcUnavailable: boolean;
}

export class TransactionNotFoundError extends Error {
  constructor() {
    super('거래를 찾을 수 없습니다.');
    this.name = 'TransactionNotFoundError';
  }
}

interface LocalRecord {
  hash: string;
  from: string;
  to: string;
  valueWei: string;
  gasPrice: string;
  gasLimit?: string;
  gasUsed?: string;
  nonce?: number;
  timestamp: number;
  blockNumber?: string;
  status: string;
  type: string;
  method?: string;
  tokenSymbol?: string;
  tokenAmount?: string;
  tokenAddress?: string;
  errorMessage?: string;
}

const isNotFound = (result: PromiseSettledResult<unknown>) =>
  result.status === 'rejected' &&
  result.reason instanceof Error &&
  /NotFound/.test(result.reason.name);

function safeBigInt(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

async function readLocal(
  hash: string,
  chainId: number,
): Promise<LocalRecord | null> {
  try {
    const entry = await transactionCacheService.getByHash(hash, chainId);
    if (!entry) return null;
    // Realm 객체는 비동기 작업 중 무효화될 수 있으므로 복사한다.
    return {
      hash: entry.hash,
      from: entry.from,
      to: entry.to,
      valueWei: entry.valueWei,
      gasPrice: entry.gasPrice,
      gasLimit: entry.gasLimit,
      gasUsed: entry.gasUsed,
      nonce: entry.nonce,
      timestamp: entry.timestamp,
      blockNumber: entry.blockNumber,
      status: entry.status,
      type: entry.type,
      method: entry.method,
      tokenSymbol: entry.tokenSymbol,
      tokenAmount: entry.tokenAmount,
      tokenAddress: entry.tokenAddress,
      errorMessage: entry.errorMessage,
    };
  } catch {
    return null;
  }
}

async function findReplacements(
  hash: string,
  from: string,
  chainId: number,
): Promise<RelatedReplacement[]> {
  try {
    const entries = await transactionCacheService.getByAddress(from, chainId, {
      limit: 100,
    });
    return entries.flatMap(entry => {
      const link = parseReplacementMethod(entry.method);
      return link && link.originalHash === hash.toLowerCase()
        ? [{ hash: entry.hash, kind: link.kind, status: entry.status }]
        : [];
    });
  } catch {
    return [];
  }
}

async function readTokenMeta(
  chainId: number,
  token: `0x${string}`,
): Promise<{ symbol?: string; decimals?: number }> {
  const client = chainClient.getClient(chainId);
  const [symbol, decimals] = await Promise.allSettled([
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'symbol',
    }),
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'decimals',
    }),
  ]);
  return {
    symbol: symbol.status === 'fulfilled' ? symbol.value : undefined,
    decimals: decimals.status === 'fulfilled' ? decimals.value : undefined,
  };
}

export async function loadTransactionDetail(
  hash: string,
  chainId: number,
): Promise<TransactionDetail> {
  const local = await readLocal(hash, chainId);
  const swap = useSwapStore
    .getState()
    .history.find(
      item =>
        item.chainId === chainId &&
        item.txHash.toLowerCase() === hash.toLowerCase(),
    );

  let txResult: PromiseSettledResult<
    Awaited<
      ReturnType<ReturnType<typeof chainClient.getClient>['getTransaction']>
    >
  >;
  let receiptResult: PromiseSettledResult<
    Awaited<
      ReturnType<
        ReturnType<typeof chainClient.getClient>['getTransactionReceipt']
      >
    >
  >;
  try {
    const client = chainClient.getClient(chainId);
    [txResult, receiptResult] = await Promise.allSettled([
      client.getTransaction({ hash: hash as Hex }),
      client.getTransactionReceipt({ hash: hash as Hex }),
    ]);
  } catch (error) {
    txResult = receiptResult = { status: 'rejected', reason: error };
  }
  const tx = txResult.status === 'fulfilled' ? txResult.value : undefined;
  const receipt =
    receiptResult.status === 'fulfilled' ? receiptResult.value : undefined;
  const rpcUnavailable =
    (txResult.status === 'rejected' && !isNotFound(txResult)) ||
    (receiptResult.status === 'rejected' && !isNotFound(receiptResult));

  if (!tx && !receipt && !local && !swap) {
    if (rpcUnavailable)
      throw new Error('네트워크에서 거래 정보를 불러오지 못했습니다.');
    throw new TransactionNotFoundError();
  }

  let status: DetailStatus;
  if (receipt) status = receipt.status === 'success' ? 'confirmed' : 'failed';
  else if (local?.status === 'cancelled') status = 'replaced';
  else if (local?.status === 'confirmed' || local?.status === 'success')
    status = 'confirmed';
  else if (local?.status === 'failed') status = 'failed';
  else if (swap && swap.status !== 'pending')
    status = swap.status === 'success' ? 'confirmed' : 'failed';
  else status = 'pending';

  const from = tx?.from ?? receipt?.from ?? local?.from;
  const to = tx?.to ?? receipt?.to ?? local?.to ?? undefined;
  const blockNumber =
    receipt?.blockNumber ?? tx?.blockNumber ?? safeBigInt(local?.blockNumber);

  let timestamp: number | undefined;
  let timestampIsSubmission = false;
  if (blockNumber !== undefined && blockNumber !== null && (receipt || tx)) {
    try {
      const block = await chainClient
        .getClient(chainId)
        .getBlock({ blockNumber });
      timestamp = Number(block.timestamp) * 1000;
    } catch {
      // 블록 시각을 모르면 로컬 시각으로 대체한다.
    }
  }
  if (timestamp === undefined) {
    if (local?.timestamp) timestamp = local.timestamp * 1000;
    else if (swap?.timestamp) timestamp = swap.timestamp;
    timestampIsSubmission = timestamp !== undefined && status === 'pending';
  }

  // 수수료
  let feeWei: bigint | undefined;
  let feeIsMax = false;
  let includesL1Fee = false;
  let gasUsed: bigint | undefined;
  let gasPriceWei: bigint | undefined;
  const gasLimit = tx?.gas ?? safeBigInt(local?.gasLimit);
  if (receipt) {
    gasUsed = receipt.gasUsed;
    gasPriceWei = receipt.effectiveGasPrice;
    feeWei = receipt.gasUsed * receipt.effectiveGasPrice;
    const l1Fee = (receipt as { l1Fee?: bigint | null }).l1Fee;
    if (typeof l1Fee === 'bigint') {
      feeWei += l1Fee;
      includesL1Fee = true;
    }
  } else if (tx) {
    gasPriceWei = tx.gasPrice;
    const perGas = tx.maxFeePerGas ?? tx.gasPrice;
    if (perGas !== undefined) {
      feeWei = tx.gas * perGas;
      feeIsMax = true;
    }
  } else if (local) {
    gasUsed = safeBigInt(local.gasUsed);
    const price = safeBigInt(local.gasPrice);
    gasPriceWei = price || undefined;
    if (gasUsed !== undefined && price) feeWei = gasUsed * price;
    else if (gasLimit !== undefined && price && status === 'pending') {
      feeWei = gasLimit * price;
      feeIsMax = true;
    }
  }

  // 토큰 이동 (ERC-20 transfer/approve 디코딩, 없으면 로컬 기록)
  let token: TokenMovement | undefined;
  const input = tx?.input;
  const tokenAddress = tx?.to ?? undefined;
  if (input && tokenAddress && input.toLowerCase().startsWith('0xa9059cbb')) {
    try {
      const decoded = decodeFunctionData({ abi: erc20Abi, data: input });
      if (decoded.functionName === 'transfer') {
        const [recipient, amount] = decoded.args as readonly [string, bigint];
        const meta = await readTokenMeta(chainId, tokenAddress);
        token = {
          kind: 'transfer',
          tokenAddress,
          counterparty: recipient,
          amountDisplay:
            meta.decimals !== undefined
              ? formatUnits(amount, meta.decimals)
              : `${amount.toString()} (원시 단위)`,
          symbol:
            meta.symbol ??
            (local?.tokenAddress?.toLowerCase() === tokenAddress.toLowerCase()
              ? local.tokenSymbol
              : undefined),
        };
      }
    } catch {
      // 디코딩할 수 없는 호출은 원시 데이터로만 표시한다.
    }
  } else if (input && tokenAddress) {
    const approve = decodeApproveCalldata(input);
    if (approve) {
      const meta = await readTokenMeta(chainId, tokenAddress);
      token = {
        kind: 'approve',
        tokenAddress,
        counterparty: approve.spender,
        amountDisplay: formatAllowance(approve.amount, meta.decimals).formatted,
        symbol: meta.symbol ?? local?.tokenSymbol,
      };
    }
  }
  if (!token && swap) {
    token = {
      kind: 'swap',
      tokenAddress: swap.sellToken.address,
      amountDisplay: swap.sellToken.amount,
      symbol: swap.sellToken.symbol,
      receiveDisplay: `${swap.buyToken.amount} ${swap.buyToken.symbol}`,
    };
  } else if (!token && local?.tokenAddress && local.tokenAmount) {
    token = {
      kind: local.type === 'approve' ? 'approve' : 'transfer',
      tokenAddress: local.tokenAddress,
      counterparty: local.type === 'approve' ? undefined : local.to,
      amountDisplay: local.tokenAmount,
      symbol: local.tokenSymbol,
    };
  }

  const replacementOf = parseReplacementMethod(local?.method) ?? undefined;
  const replacements = from ? await findReplacements(hash, from, chainId) : [];
  let replacedBy: string | undefined;
  if (status === 'replaced') {
    replacedBy =
      local?.errorMessage?.match(/0x[0-9a-fA-F]{64}/)?.[0] ??
      replacements.find(item => item.status === 'confirmed')?.hash;
  }

  return {
    hash,
    chainId,
    status,
    from,
    to,
    valueWei: tx?.value ?? safeBigInt(local?.valueWei) ?? 0n,
    nonce: tx?.nonce ?? local?.nonce,
    blockNumber: blockNumber ?? undefined,
    timestamp,
    timestampIsSubmission,
    gasLimit,
    gasUsed,
    feeWei,
    feeIsMax,
    includesL1Fee,
    gasPriceWei,
    maxFeePerGas: tx?.maxFeePerGas,
    maxPriorityFeePerGas: tx?.maxPriorityFeePerGas,
    input,
    token,
    localType: local?.type ?? (swap ? 'swap' : undefined),
    replacedBy,
    replacementOf,
    replacements,
    rpcUnavailable,
  };
}
