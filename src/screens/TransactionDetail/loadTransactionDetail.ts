/**
 * 거래 상세 정보 로더
 *
 * 로컬 기록(Realm 캐시, 스왑 내역)을 먼저 읽고 RPC(getTransaction/getTransactionReceipt)로
 * 최신 상태를 보강한다. RPC에 실패해도 로컬 기록이 있으면 그 정보를 보여 준다.
 *
 * 토큰 이동은 transfer/approve 호출 데이터 → 앱 스왑 내역 → 영수증의 ERC-20 Transfer 로그
 * → 로컬 기록 순으로 찾는다. 컨트랙트를 거쳐 받은 토큰(에어드롭, 브리지)이나 dApp 스왑은
 * 호출 데이터로 알 수 없으므로 영수증 로그에서 내 주소가 관련된 전송을 읽는다.
 */

import {
  decodeEventLog,
  decodeFunctionData,
  erc20Abi,
  formatEther,
  formatUnits,
  type Hex,
} from 'viem';
import { chainClient } from '@/services/chainClient';
import { formatDisplayAmount } from '@/utils/format';
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
  /** 스왑에서 판 쪽이 네이티브 자산이면 true (기호는 화면에서 네트워크 기호로 채운다) */
  nativeSell?: boolean;
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

const sameAddress = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

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

/** ERC-20 Transfer(address,address,uint256) */
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

interface ReceiptLog {
  address: string;
  topics: readonly (string | null)[];
  data: string;
}

interface DecodedTransfer {
  token: `0x${string}`;
  from: string;
  to: string;
  value: bigint;
}

/** 영수증 로그에서 owner가 보내거나 받은 ERC-20 전송만 읽는다. */
export function decodeOwnerTransfers(
  logs: readonly ReceiptLog[] | undefined,
  owner: string,
): DecodedTransfer[] {
  const me = owner.toLowerCase();
  const transfers: DecodedTransfer[] = [];
  for (const log of logs ?? []) {
    // ERC-721은 같은 topic0이지만 tokenId까지 인덱싱되어 topic이 4개다.
    if (
      log.topics?.length !== 3 ||
      log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC
    )
      continue;
    try {
      const decoded = decodeEventLog({
        abi: erc20Abi,
        eventName: 'Transfer',
        data: log.data as Hex,
        topics: log.topics as [Hex, Hex, Hex],
      });
      const { from, to, value } = decoded.args;
      if (from.toLowerCase() !== me && to.toLowerCase() !== me) continue;
      transfers.push({ token: log.address as `0x${string}`, from, to, value });
    } catch {
      // 표준과 다른 로그는 건너뛴다.
    }
  }
  return transfers;
}

async function movementFromLogs(
  chainId: number,
  logs: readonly ReceiptLog[] | undefined,
  owner: string,
  sentNativeWei: bigint,
): Promise<TokenMovement | undefined> {
  const transfers = decodeOwnerTransfers(logs, owner);
  if (transfers.length === 0) return undefined;
  const me = owner.toLowerCase();
  const outgoing = transfers.filter(
    t => t.from.toLowerCase() === me && t.to.toLowerCase() !== me,
  );
  const incoming = transfers.filter(
    t => t.to.toLowerCase() === me && t.from.toLowerCase() !== me,
  );
  const describe = async (transfer: DecodedTransfer) => {
    const meta = await readTokenMeta(chainId, transfer.token);
    return {
      amount:
        meta.decimals !== undefined
          ? formatUnits(transfer.value, meta.decimals)
          : `${transfer.value.toString()} (원시 단위)`,
      symbol: meta.symbol,
      decimalsKnown: meta.decimals !== undefined,
    };
  };

  // 보낸 자산(토큰 또는 네이티브)과 다른 토큰을 받았다면 스왑 (Activity 목록과 같은 기준)
  const received = incoming[0];
  const sold = outgoing.find(
    t => !received || t.token.toLowerCase() !== received.token.toLowerCase(),
  );
  if (received && (sold || sentNativeWei > 0n)) {
    const [receivedInfo, soldInfo] = await Promise.all([
      describe(received),
      sold ? describe(sold) : Promise.resolve(undefined),
    ]);
    const receivedAmount = receivedInfo.decimalsKnown
      ? formatDisplayAmount(receivedInfo.amount)
      : receivedInfo.amount;
    return {
      kind: 'swap',
      tokenAddress: sold?.token,
      amountDisplay: soldInfo ? soldInfo.amount : formatEther(sentNativeWei),
      symbol: soldInfo?.symbol,
      nativeSell: !sold,
      receiveDisplay: `${receivedAmount} ${receivedInfo.symbol ?? ''}`.trim(),
    };
  }

  const transfer = outgoing[0] ?? incoming[0] ?? transfers[0];
  const info = await describe(transfer);
  return {
    kind: 'transfer',
    tokenAddress: transfer.token,
    counterparty: transfer.to,
    amountDisplay: info.amount,
    symbol: info.symbol,
  };
}

/**
 * @param owner 화면을 보는 계정 주소. 컨트랙트를 거쳐 받은 토큰처럼 내가 보내지 않은
 *   거래의 토큰 이동을 영수증 로그에서 찾을 때 사용한다 (없으면 보낸 주소 기준).
 */
export async function loadTransactionDetail(
  hash: string,
  chainId: number,
  owner?: string,
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
  }
  const logOwner = owner ?? from;
  if (!token && receipt && logOwner) {
    try {
      token = await movementFromLogs(
        chainId,
        (receipt as { logs?: readonly ReceiptLog[] }).logs,
        logOwner,
        tx && sameAddress(tx.from, logOwner) ? tx.value : 0n,
      );
    } catch {
      token = undefined;
    }
  }
  if (!token && local?.tokenAddress && local.tokenAmount) {
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
