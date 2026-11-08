/**
 * WalletConnect 요청 검토 보조 함수 (호스트에서 사용)
 */

import { formatEther, formatUnits } from 'viem';
import { coinService } from '@/services/coinService';
import { decodeApproveCalldata } from '@/services/approvalService';
import { transactionTracker } from '@/services/transactionTracker';
import { transactionCacheService, type TransactionType } from '@/realm/services';
import type { SignRequest } from '@/components/SignRequestModal';
import type { DAppVerification } from '@/services/wcService';
import {
  getKnownToken,
  nativeSymbol,
  type SigningRequestInput,
} from '@/services/signingIntentService';

export interface DAppInfo {
  name: string;
  url: string;
  verification: DAppVerification;
}

export interface QueuedSignRequest extends SignRequest {
  type: 'sign';
  dApp: DAppInfo;
  /** eth_sendTransaction의 네이티브 전송 USD 가치 (계산 가능할 때만) */
  usdValue?: number;
}

export interface QueuedChainRequest {
  type: 'chain';
  id: number;
  topic: string;
  method: 'wallet_switchEthereumChain' | 'wallet_addEthereumChain';
  /** 요청이 온 체인 */
  requestChainId: number;
  /** 전환할 체인 */
  targetChainId: number;
  targetNetworkName: string;
  expiresAt: number;
  dApp: DAppInfo;
}

export type QueuedItem = QueuedSignRequest | QueuedChainRequest;

/** 검토 화면을 띄운 뒤 서명까지 허용하는 시간 (가스 추정이 오래되지 않도록) */
export const REVIEW_WINDOW_MS = {
  transaction: 90_000,
  other: 300_000,
} as const;

export const MAX_QUEUED_REQUESTS = 20;

export function getRequestAccount(
  method: string,
  params: unknown[],
): string | null {
  if (method === 'eth_sendTransaction' || method === 'eth_signTransaction') {
    return (params[0] as { from?: string } | undefined)?.from || null;
  }
  if (method === 'personal_sign') return (params[1] as string) || null;
  if (method.startsWith('eth_signTypedData')) {
    return (params[0] as string) || null;
  }
  return null;
}

/** wallet_switchEthereumChain/wallet_addEthereumChain의 chainId("0x89")를 읽는다. */
export function parseRequestedChainId(params: unknown[]): number | null {
  const first = params[0] as { chainId?: unknown } | undefined;
  const raw = first?.chainId;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  try {
    const value =
      typeof raw === 'number' ? raw : Number(BigInt(raw.trim() || 'x'));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function computeExpiresAt(
  expiryTimestamp: number | undefined,
  windowMs: number,
  now: number = Date.now(),
): number {
  return Math.min(
    (typeof expiryTimestamp === 'number' ? expiryTimestamp : Infinity) * 1000,
    now + windowMs,
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * eth_sendTransaction의 USD 가치를 계산한다 (네이티브 전송량 × 시세).
 * 컨트랙트 호출은 토큰 이동량을 알 수 없으므로 undefined를 반환해, 거래 한도
 * 정책에서 "알 수 없음"(PIN 필요)으로 취급되게 한다.
 */
export async function estimateUsdValue(
  input: Pick<SigningRequestInput, 'method' | 'params' | 'chainId'>,
): Promise<number | undefined> {
  if (input.method !== 'eth_sendTransaction') return undefined;
  const tx = input.params[0] as { value?: string; data?: string } | undefined;
  const data = tx?.data || '0x';
  if (data !== '0x') return undefined;
  let wei: bigint;
  try {
    wei = BigInt(tx?.value || '0');
  } catch {
    return undefined;
  }
  if (wei === 0n) return 0;
  try {
    const price = await withTimeout(
      coinService.getNativeTokenPrice(input.chainId),
      4000,
    );
    // 가격을 모르면(null) 금액 미상으로 취급해 PIN 정책이 보수적으로 동작하게 한다.
    if (price === null || !Number.isFinite(price) || price <= 0) {
      return undefined;
    }
    const value = Number(formatEther(wei)) * price;
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

const METHOD_LABELS: Record<string, string> = {
  eth_sendTransaction: '트랜잭션 전송 요청',
  eth_signTransaction: '트랜잭션 서명 요청',
  personal_sign: '메시지 서명 요청',
  eth_signTypedData: '타입 데이터(EIP-712) 서명 요청',
  eth_signTypedData_v3: '타입 데이터(EIP-712) 서명 요청',
  eth_signTypedData_v4: '타입 데이터(EIP-712) 서명 요청',
  wallet_switchEthereumChain: '네트워크 전환 요청',
  wallet_addEthereumChain: '네트워크 전환 요청',
};

/** 세션에서 승인될 메서드를 사람이 읽을 수 있는 목록으로 바꾼다. */
export function describeMethods(methods: string[]): string[] {
  return Array.from(
    new Set(methods.map(method => METHOD_LABELS[method]).filter(Boolean)),
  );
}

// ---------------------------------------------------------------------------
// 자동 거부 사유
// ---------------------------------------------------------------------------

const NETWORK_ERRORS = new Set([
  'HttpRequestError',
  'TimeoutError',
  'WebSocketRequestError',
  'RpcRequestError',
]);
const REVERT_ERRORS = new Set([
  'ExecutionRevertedError',
  'ContractFunctionRevertedError',
  'CallExecutionError',
  'EstimateGasExecutionError',
]);
const MAX_REASON_LENGTH = 80;

function errorChain(error: unknown): Error[] {
  const chain: Error[] = [];
  let current: unknown = error;
  while (current instanceof Error && chain.length < 8) {
    if (chain.includes(current)) break;
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

function truncate(text: string): string {
  const line = text.split('\n')[0].trim();
  return line.length > MAX_REASON_LENGTH
    ? `${line.slice(0, MAX_REASON_LENGTH - 1)}…`
    : line;
}

/**
 * 검토 준비(가스 추정, RPC 조회 등) 실패를 토스트에 붙일 짧은 한국어 사유로 바꾼다.
 * viem 오류의 긴 영문 메시지(호출 인자, calldata 포함)는 그대로 보여주지 않는다.
 */
export function describeReviewError(error: unknown): string | null {
  const chain = errorChain(error);
  if (chain.length === 0) return null;
  const names = chain.map(item => item.name);
  if (names.includes('InsufficientFundsError')) return '잔액이 부족합니다';
  if (names.some(name => NETWORK_ERRORS.has(name)))
    return '네트워크 응답이 없습니다';
  if (names.some(name => REVERT_ERRORS.has(name)))
    return '트랜잭션이 실패할 것으로 예상됩니다';
  const own = chain[0].message || '';
  // 앱이 직접 만든 한국어 오류는 그대로 보여준다.
  if (/[가-힣]/.test(own)) return truncate(own);
  const short = (chain[0] as { shortMessage?: unknown }).shortMessage;
  const text = typeof short === 'string' && short ? short : own;
  return text ? truncate(text) : null;
}

// ---------------------------------------------------------------------------
// dApp 트랜잭션 기록
// ---------------------------------------------------------------------------

function quantity(value: unknown): bigint | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * dApp이 보낸 eth_sendTransaction을 로컬 거래 기록에 남긴다. 활동 탭의 대기 행,
 * 상태 토스트(TransactionNotifier)와 가속/취소, 토큰 승인 관리(dApp에 부여한 approve
 * 발견)가 이 기록을 사용한다. 실패해도 dApp 응답에는 영향을 주지 않는다.
 */
export async function recordDAppTransaction(
  request: Pick<
    QueuedSignRequest,
    'params' | 'chainId' | 'account' | 'tokenMetadata' | 'dApp'
  >,
  hash: unknown,
): Promise<void> {
  if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return;
  const tx = request.params[0] as
    | {
        to?: string;
        value?: string;
        data?: string;
        gas?: string;
        gasPrice?: string;
        maxFeePerGas?: string;
        nonce?: string;
      }
    | undefined;
  if (!tx?.to) return;
  const valueWei = quantity(tx.value) ?? 0n;
  const data = tx.data || '0x';
  const approve = decodeApproveCalldata(data);
  const type: TransactionType = approve
    ? 'approve'
    : data !== '0x'
    ? 'contract'
    : 'send';
  const token = approve
    ? getKnownToken(request.chainId, tx.to) ??
      request.tokenMetadata?.[tx.to.toLowerCase()] ??
      null
    : null;
  const nonce = quantity(tx.nonce);
  const gas = quantity(tx.gas);
  let tokenAmount: string | undefined;
  if (approve) {
    tokenAmount = token
      ? formatUnits(approve.amount, token.decimals)
      : approve.amount.toString();
  } else if (type === 'send') {
    tokenAmount = formatEther(valueWei);
  }
  await transactionCacheService.createLocalTransaction({
    hash,
    chainId: request.chainId,
    from: request.account,
    to: tx.to,
    value: formatEther(valueWei),
    valueWei: valueWei.toString(),
    gasPrice: (quantity(tx.gasPrice ?? tx.maxFeePerGas) ?? 0n).toString(),
    gasLimit: gas === null ? undefined : gas.toString(),
    nonce:
      nonce !== null && nonce <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(nonce)
        : undefined,
    type,
    method: `wc:${request.dApp.name}`.slice(0, 80),
    tokenSymbol: approve ? token?.symbol : nativeSymbol(request.chainId),
    tokenAmount,
    tokenAddress: approve ? tx.to : undefined,
  });
  transactionTracker.reconcile();
}

/** "eip155:999" → "체인 999", "solana" → "solana 네임스페이스" */
export function describeUnsupported(items: string[]): string {
  return items
    .map(item => {
      const match = /^eip155:(\d+)$/.exec(item);
      if (match) return `체인 ${match[1]}`;
      if (item.includes(':')) return item;
      return `${item} 네임스페이스`;
    })
    .join(', ');
}
