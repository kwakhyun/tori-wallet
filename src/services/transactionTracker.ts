import { AppState } from 'react-native';
import { chainClient } from './chainClient';
import { transactionCacheService } from '@/realm/services/transactionCacheService';
import { useSwapStore } from '@/store/swapStore';

/** A missing receipt or RPC failure is inconclusive. Only a mined receipt is final. */
export class TransactionTracker {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<void> | undefined;
  private generation = 0;

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
    const pending = new Map(
      Array.from(cached, tx => [
        `${tx.chainId}:${tx.hash.toLowerCase()}`,
        { hash: tx.hash, chainId: tx.chainId },
      ]),
    );
    for (const item of useSwapStore.getState().history) {
      if (item.status === 'pending')
        pending.set(`${item.chainId}:${item.txHash.toLowerCase()}`, {
          hash: item.txHash,
          chainId: item.chainId,
        });
    }
    // Limit RPC concurrency while allowing failures on one network to be retried independently.
    const entries = [...pending.values()];
    for (let i = 0; i < entries.length; i += 4) {
      if (generation !== this.generation) return;
      await Promise.all(
        entries.slice(i, i + 4).map(async tx => {
          try {
            const receipt = await chainClient
              .getClient(tx.chainId)
              .getTransactionReceipt({ hash: tx.hash as `0x${string}` });
            if (!receipt || generation !== this.generation) return;
            const succeeded = receipt.status === 'success';
            await transactionCacheService.updateStatus(tx.hash, tx.chainId, {
              status: succeeded ? 'confirmed' : 'failed',
              blockNumber: receipt.blockNumber.toString(),
              gasUsed: receipt.gasUsed.toString(),
              confirmedAt: new Date(),
            });
            if (generation !== this.generation) return;
            const state = useSwapStore.getState();
            for (const item of state.history) {
              if (
                item.status !== 'pending' ||
                item.chainId !== tx.chainId ||
                item.txHash.toLowerCase() !== tx.hash.toLowerCase()
              )
                continue;
              state.updateHistoryStatus(
                item.id,
                succeeded ? 'success' : 'failed',
              );
              if (succeeded)
                state.addFavoritePair({
                  chainId: item.chainId,
                  sellTokenAddress: item.sellToken.address,
                  sellTokenSymbol: item.sellToken.symbol,
                  buyTokenAddress: item.buyToken.address,
                  buyTokenSymbol: item.buyToken.symbol,
                });
            }
          } catch {
            // Timeout, offline, rate limit and not-found all remain pending for the next pass.
          }
        }),
      );
    }
  }
}

export const transactionTracker = new TransactionTracker();
