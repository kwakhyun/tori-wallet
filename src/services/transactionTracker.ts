import { AppState } from 'react-native';
import { chainClient } from './chainClient';
import { transactionCacheService } from '@/realm/services/transactionCacheService';
import { useSwapStore } from '@/store/swapStore';

export type ReplacementKind = 'speedUp' | 'cancel';

/** 추적 중인 거래가 도달할 수 있는 최종 상태 */
export type TrackedTransactionStatus = 'confirmed' | 'failed' | 'replaced';

export interface TrackedTransactionSummary {
  /** Realm 기록 유형 (send | swap | approve | contract ...) */
  type?: string;
  /** 사람이 읽는 수량 (예: "0.1") */
  amount?: string;
  symbol?: string;
}

export interface TransactionStatusEvent {
  hash: string;
  chainId: number;
  status: TrackedTransactionStatus;
  summary?: TrackedTransactionSummary;
  /** 이 거래 자체가 다른 거래의 가속/취소 거래인 경우 */
  replacement?: { kind: ReplacementKind; originalHash: string };
  /** status === 'replaced'일 때 같은 nonce를 사용한 거래 (알 수 있는 경우) */
  replacedBy?: { hash?: string; kind?: ReplacementKind };
}

export type TransactionStatusListener = (event: TransactionStatusEvent) => void;

/**
 * 가속/취소 거래는 Realm `method` 필드에 원래 거래를 기록한다.
 * Realm에 저장하므로 지갑 초기화 시 함께 삭제되고 앱 재시작 후에도 연결이 유지된다.
 */
const REPLACEMENT_PREFIX = 'replacement:';

export function encodeReplacementMethod(
  kind: ReplacementKind,
  originalHash: string,
): string {
  return `${REPLACEMENT_PREFIX}${kind}:${originalHash.toLowerCase()}`;
}

export function parseReplacementMethod(
  method: string | null | undefined,
): { kind: ReplacementKind; originalHash: string } | null {
  if (!method || !method.startsWith(REPLACEMENT_PREFIX)) return null;
  const [kind, originalHash] = method
    .slice(REPLACEMENT_PREFIX.length)
    .split(':');
  if (
    (kind !== 'speedUp' && kind !== 'cancel') ||
    !/^0x[0-9a-fA-F]{64}$/.test(originalHash ?? '')
  )
    return null;
  return { kind, originalHash: originalHash.toLowerCase() };
}

interface PendingEntry {
  hash: string;
  chainId: number;
  from?: string;
  nonce?: number;
  /** Realm 기록이 있는 거래 (nonce를 저장할 수 있음) */
  stored?: boolean;
  summary?: TrackedTransactionSummary;
  replacement?: { kind: ReplacementKind; originalHash: string };
}

const keyOf = (chainId: number, hash: string) =>
  `${chainId}:${hash.toLowerCase()}`;

const isReceiptNotFound = (error: unknown) =>
  error instanceof Error && error.name === 'TransactionReceiptNotFoundError';

/** A missing receipt or RPC failure is inconclusive. Only a mined receipt is final. */
export class TransactionTracker {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<void> | undefined;
  private generation = 0;
  private listeners = new Set<TransactionStatusListener>();
  /**
   * 대기 중 mempool에서 확인한 nonce (Realm 기록에 nonce가 없을 때).
   * Realm 기록이 있으면 함께 저장해, 앱을 다시 시작한 뒤 거래가 mempool에서 사라져도
   * nonce 소진(대체됨)을 판단할 수 있게 한다.
   */
  private nonces = new Map<string, { from: string; nonce: number }>();
  /** 한 번 nonce 소진이 관찰된 거래. 두 번 연속 관찰되어야 대체됨으로 확정한다. */
  private suspects = new Set<string>();
  /**
   * 이번 세션에서 최종 상태를 기록한(또는 기록 중인) 거래와 그 상태.
   * await 전에 동기적으로 선점해 같은 거래를 두 경로에서 중복 처리하지 않는다.
   */
  private finalized = new Map<string, TrackedTransactionStatus>();

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (AppState.currentState === 'active') this.reconcile();
    }, 15_000);
    this.reconcile();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.invalidate();
  }

  invalidate() {
    this.generation += 1;
    this.nonces.clear();
    this.suspects.clear();
    this.finalized.clear();
  }

  /**
   * 거래 상태 변경(완료/실패/대체됨)을 구독한다. 반환된 함수로 구독을 해제한다.
   * 리스너 예외는 추적 루프에 영향을 주지 않는다.
   */
  subscribe(listener: TransactionStatusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: TransactionStatusEvent) {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.warn('Transaction status listener failed:', error);
      }
    }
  }

  reconcile(): Promise<void> {
    if (this.running) return this.running;
    const generation = this.generation;
    const task = this.check(generation)
      .catch(error => {
        console.warn('Pending transaction recovery will retry:', error);
      })
      .finally(() => {
        if (this.running === task) this.running = undefined;
      });
    this.running = task;
    return task;
  }

  private async check(generation: number) {
    const cached = await transactionCacheService.getPendingTransactions();
    // Copy Realm objects before asynchronous work; they can be invalidated on reset.
    const pending = new Map<string, PendingEntry>(
      Array.from(cached, tx => [
        keyOf(tx.chainId, tx.hash),
        {
          hash: tx.hash,
          chainId: tx.chainId,
          from: tx.from,
          nonce: typeof tx.nonce === 'number' ? tx.nonce : undefined,
          stored: true,
          summary: {
            type: tx.type,
            amount: tx.tokenAmount ?? tx.value,
            symbol: tx.tokenSymbol,
          },
          replacement: parseReplacementMethod(tx.method) ?? undefined,
        },
      ]),
    );
    for (const item of useSwapStore.getState().history) {
      const key = keyOf(item.chainId, item.txHash);
      if (item.status === 'pending' && !pending.has(key))
        pending.set(key, {
          hash: item.txHash,
          chainId: item.chainId,
          summary: {
            type: 'swap',
            amount: item.sellToken.amount,
            symbol: item.sellToken.symbol,
          },
        });
    }
    // Limit RPC concurrency while allowing failures on one network to be retried independently.
    const entries = [...pending.values()];
    for (let i = 0; i < entries.length; i += 4) {
      if (generation !== this.generation) return;
      await Promise.all(
        entries
          .slice(i, i + 4)
          .map(tx => this.checkEntry(tx, pending, generation)),
      );
    }
  }

  private async checkEntry(
    tx: PendingEntry,
    pending: Map<string, PendingEntry>,
    generation: number,
  ) {
    const key = keyOf(tx.chainId, tx.hash);
    if (this.finalized.has(key)) return;
    try {
      const client = chainClient.getClient(tx.chainId);
      let receipt;
      try {
        receipt = await client.getTransactionReceipt({
          hash: tx.hash as `0x${string}`,
        });
      } catch (error) {
        // Timeout, offline, rate limit remain pending for the next pass.
        if (!isReceiptNotFound(error)) return;
      }
      if (generation !== this.generation || this.finalized.has(key)) return;
      if (receipt) {
        const succeeded = receipt.status === 'success';
        await this.finalize(
          tx,
          generation,
          succeeded ? 'confirmed' : 'failed',
          {
            blockNumber: receipt.blockNumber.toString(),
            gasUsed: receipt.gasUsed.toString(),
          },
        );
        if (generation !== this.generation) return;
        if (tx.replacement) {
          const originalKey = keyOf(tx.chainId, tx.replacement.originalHash);
          const original = pending.get(originalKey) ?? {
            hash: tx.replacement.originalHash,
            chainId: tx.chainId,
          };
          await this.markReplaced(original, generation, {
            hash: tx.hash,
            kind: tx.replacement.kind,
            succeeded,
          });
        }
        return;
      }
      await this.checkNonce(tx, key, pending, generation);
    } catch {
      // Any RPC or storage failure leaves the transaction pending for the next pass.
    }
  }

  /**
   * 영수증이 없는 거래의 nonce가 이미 다른 거래로 소진되었는지 확인한다.
   * RPC 노드 간 지연을 고려해 두 번 연속 관찰된 경우에만 대체됨으로 확정한다.
   */
  private async checkNonce(
    tx: PendingEntry,
    key: string,
    pending: Map<string, PendingEntry>,
    generation: number,
  ) {
    const client = chainClient.getClient(tx.chainId);
    let known =
      tx.nonce !== undefined && tx.from
        ? { from: tx.from, nonce: tx.nonce }
        : this.nonces.get(key);
    if (!known) {
      const onChain = await client.getTransaction({
        hash: tx.hash as `0x${string}`,
      });
      if (!onChain || onChain.blockNumber != null) return;
      known = { from: onChain.from, nonce: onChain.nonce };
      this.nonces.set(key, known);
      if (tx.stored && generation === this.generation) {
        try {
          await transactionCacheService.updateStatus(tx.hash, tx.chainId, {
            nonce: onChain.nonce,
          });
        } catch (error) {
          // 저장에 실패해도 이번 세션에서는 메모리의 nonce로 계속 추적한다.
          console.warn('Failed to persist transaction nonce:', error);
        }
      }
      return;
    }
    const latest = await client.getTransactionCount({
      address: known.from as `0x${string}`,
      blockTag: 'latest',
    });
    if (generation !== this.generation) return;
    if (latest <= known.nonce) {
      this.suspects.delete(key);
      return;
    }
    if (!this.suspects.has(key)) {
      this.suspects.add(key);
      return;
    }
    // 같은 nonce로 우리가 제출한 대체 거래가 아직 대기 중이거나 채굴되었다면
    // 그 거래의 영수증 경로가 원래 거래를 (대체한 해시와 함께) 기록한다.
    const ownReplacement = [...pending.values()].some(other => {
      if (
        other.chainId !== tx.chainId ||
        other.replacement?.originalHash !== tx.hash.toLowerCase()
      )
        return false;
      return (
        this.finalized.get(keyOf(other.chainId, other.hash)) !== 'replaced'
      );
    });
    if (ownReplacement) return;
    // 노드가 이 거래를 아직 알고 있다면(채굴됨, 영수증 지연 등) 대체로 단정하지 않는다.
    try {
      await client.getTransaction({ hash: tx.hash as `0x${string}` });
      return;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.name !== 'TransactionNotFoundError'
      )
        return;
    }
    await this.markReplaced(tx, generation, {});
  }

  private async finalize(
    tx: PendingEntry,
    generation: number,
    status: 'confirmed' | 'failed',
    receipt: { blockNumber: string; gasUsed: string },
  ) {
    const key = keyOf(tx.chainId, tx.hash);
    if (this.finalized.has(key)) return;
    this.finalized.set(key, status);
    try {
      await transactionCacheService.updateStatus(tx.hash, tx.chainId, {
        status,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        confirmedAt: new Date(),
      });
    } catch (error) {
      this.finalized.delete(key);
      throw error;
    }
    // 초기화(지갑 삭제) 이후 도착한 결과는 스토어와 구독자에게 반영하지 않는다.
    if (generation !== this.generation) return;
    this.updateSwapHistory(tx, status === 'confirmed' ? 'success' : 'failed');
    this.suspects.delete(key);
    this.emit({
      hash: tx.hash,
      chainId: tx.chainId,
      status,
      summary: tx.summary,
      replacement: tx.replacement,
    });
  }

  /**
   * 같은 nonce의 다른 거래가 채굴되어 더 이상 처리될 수 없는 거래를 기록한다.
   * Realm 스키마에는 'replaced' 상태가 없으므로 'cancelled'로 저장하고
   * errorMessage에 대체 정보를 남긴다.
   */
  private async markReplaced(
    tx: PendingEntry,
    generation: number,
    by: { hash?: string; kind?: ReplacementKind; succeeded?: boolean },
  ) {
    const key = keyOf(tx.chainId, tx.hash);
    if (this.finalized.has(key) || generation !== this.generation) return;
    this.finalized.set(key, 'replaced');
    try {
      await transactionCacheService.updateStatus(tx.hash, tx.chainId, {
        status: 'cancelled',
        errorMessage: by.hash
          ? `다른 거래로 대체됨: ${by.hash}`
          : '같은 nonce의 다른 거래가 먼저 처리되어 대체됨',
        confirmedAt: new Date(),
      });
    } catch (error) {
      this.finalized.delete(key);
      throw error;
    }
    if (generation !== this.generation) return;
    // 가속 거래가 성공했다면 스왑 자체는 실행된 것이다.
    this.updateSwapHistory(
      tx,
      by.kind === 'speedUp' && by.succeeded ? 'success' : 'failed',
    );
    this.suspects.delete(key);
    this.emit({
      hash: tx.hash,
      chainId: tx.chainId,
      status: 'replaced',
      summary: tx.summary,
      replacement: tx.replacement,
      replacedBy: { hash: by.hash, kind: by.kind },
    });
  }

  private updateSwapHistory(tx: PendingEntry, status: 'success' | 'failed') {
    const state = useSwapStore.getState();
    for (const item of state.history) {
      if (
        item.status !== 'pending' ||
        item.chainId !== tx.chainId ||
        item.txHash.toLowerCase() !== tx.hash.toLowerCase()
      )
        continue;
      state.updateHistoryStatus(item.id, status);
      if (status === 'success')
        state.addFavoritePair({
          chainId: item.chainId,
          sellTokenAddress: item.sellToken.address,
          sellTokenSymbol: item.sellToken.symbol,
          buyTokenAddress: item.buyToken.address,
          buyTokenSymbol: item.buyToken.symbol,
        });
    }
  }
}

export const transactionTracker = new TransactionTracker();
