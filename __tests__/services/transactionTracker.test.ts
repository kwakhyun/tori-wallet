import { TransactionTracker } from '../../src/services/transactionTracker';
import { transactionCacheService } from '../../src/realm/services/transactionCacheService';
import { chainClient } from '../../src/services/chainClient';
import { useSwapStore } from '../../src/store/swapStore';

jest.mock('../../src/realm/services/transactionCacheService', () => ({
  transactionCacheService: {
    getPendingTransactions: jest.fn(),
    updateStatus: jest.fn(),
  },
}));
jest.mock('../../src/services/chainClient', () => ({
  chainClient: { getClient: jest.fn() },
}));
const receipt = { status: 'success', blockNumber: 12n, gasUsed: 21000n };
const getReceipt = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  useSwapStore.getState().resetSwapState();
  (
    transactionCacheService.getPendingTransactions as jest.Mock
  ).mockResolvedValue([{ hash: '0xabc', chainId: 1 }]);
  (transactionCacheService.updateStatus as jest.Mock).mockResolvedValue(
    undefined,
  );
  (chainClient.getClient as jest.Mock).mockReturnValue({
    getTransactionReceipt: getReceipt,
  });
});

it.each(['timeout', 'offline', 'not found', 'rate limited'])(
  'keeps %s pending and recovers after a fresh tracker starts',
  async error => {
    getReceipt.mockRejectedValueOnce(new Error(error));
    await new TransactionTracker().reconcile();
    expect(transactionCacheService.updateStatus).not.toHaveBeenCalled();
    getReceipt.mockResolvedValueOnce(receipt);
    await new TransactionTracker().reconcile();
    expect(transactionCacheService.updateStatus).toHaveBeenCalledWith(
      '0xabc',
      1,
      expect.objectContaining({ status: 'confirmed' }),
    );
  },
);

it('records failure only when a mined receipt reverted', async () => {
  getReceipt.mockResolvedValue({ ...receipt, status: 'reverted' });
  await new TransactionTracker().reconcile();
  expect(transactionCacheService.updateStatus).toHaveBeenCalledWith(
    '0xabc',
    1,
    expect.objectContaining({ status: 'failed' }),
  );
});

it('deduplicates overlapping passes and drops late receipts after reset', async () => {
  let resolve!: (value: typeof receipt) => void;
  getReceipt.mockReturnValue(
    new Promise(r => {
      resolve = r;
    }),
  );
  const tracker = new TransactionTracker();
  const first = tracker.reconcile();
  expect(tracker.reconcile()).toBe(first);
  await Promise.resolve();
  tracker.invalidate();
  resolve(receipt);
  await first;
  expect(transactionCacheService.updateStatus).not.toHaveBeenCalled();
});

it('recovers persisted swap history and updates favorites only once', async () => {
  (
    transactionCacheService.getPendingTransactions as jest.Mock
  ).mockResolvedValue([]);
  const id = useSwapStore
    .getState()
    .addHistoryItem({
      chainId: 137,
      timestamp: 0,
      sellToken: { address: 'a', symbol: 'A', amount: '1' },
      buyToken: { address: 'b', symbol: 'B', amount: '2' },
      txHash: '0xswap',
      status: 'pending',
      rate: '2',
    });
  getReceipt.mockResolvedValue(receipt);
  const tracker = new TransactionTracker();
  await tracker.reconcile();
  await tracker.reconcile();
  expect(
    useSwapStore.getState().history.find(item => item.id === id)?.status,
  ).toBe('success');
  expect(useSwapStore.getState().favoritePairs[0].usageCount).toBe(1);
  expect(transactionCacheService.updateStatus).toHaveBeenCalledTimes(1);
  expect(chainClient.getClient).toHaveBeenCalledWith(137);
});
