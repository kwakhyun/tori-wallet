import {
  encodeReplacementMethod,
  parseReplacementMethod,
  TransactionTracker,
  type TransactionStatusEvent,
} from '../../src/services/transactionTracker';
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

const owner = '0x1234567890123456789012345678901234567890';
const original = `0x${'a'.repeat(64)}`;
const replacement = `0x${'b'.repeat(64)}`;
const receipt = { status: 'success', blockNumber: 12n, gasUsed: 21000n };
const notFound = () =>
  Object.assign(new Error('missing'), {
    name: 'TransactionReceiptNotFoundError',
  });

const client = {
  getTransactionReceipt: jest.fn(),
  getTransaction: jest.fn(),
  getTransactionCount: jest.fn(),
};

function record(overrides: Record<string, unknown>) {
  return {
    hash: original,
    chainId: 1,
    from: owner,
    type: 'send',
    value: '0.5',
    tokenAmount: '0.5',
    tokenSymbol: 'ETH',
    ...overrides,
  };
}

let pendingRecords: ReturnType<typeof record>[];

beforeEach(() => {
  jest.clearAllMocks();
  useSwapStore.getState().resetSwapState();
  pendingRecords = [record({})];
  (
    transactionCacheService.getPendingTransactions as jest.Mock
  ).mockImplementation(async () => pendingRecords);
  (transactionCacheService.updateStatus as jest.Mock).mockResolvedValue(null);
  (chainClient.getClient as jest.Mock).mockReturnValue(client);
  client.getTransactionReceipt.mockRejectedValue(notFound());
  client.getTransaction.mockResolvedValue({
    from: owner,
    nonce: 3,
    blockNumber: null,
  });
  client.getTransactionCount.mockResolvedValue(3);
});

function track() {
  const tracker = new TransactionTracker();
  const events: TransactionStatusEvent[] = [];
  const unsubscribe = tracker.subscribe(event => events.push(event));
  return { tracker, events, unsubscribe };
}

it('encodes and parses replacement links strictly', () => {
  expect(
    parseReplacementMethod(encodeReplacementMethod('speedUp', original)),
  ).toEqual({ kind: 'speedUp', originalHash: original });
  expect(parseReplacementMethod('approve')).toBeNull();
  expect(parseReplacementMethod('replacement:other:0x1')).toBeNull();
  expect(parseReplacementMethod(undefined)).toBeNull();
});

it('emits confirmed and failed events with a summary, once', async () => {
  const { tracker, events } = track();
  client.getTransactionReceipt.mockResolvedValue(receipt);
  await tracker.reconcile();
  await tracker.reconcile();
  expect(events).toEqual([
    expect.objectContaining({
      hash: original,
      chainId: 1,
      status: 'confirmed',
      summary: { type: 'send', amount: '0.5', symbol: 'ETH' },
    }),
  ]);

  const second = track();
  client.getTransactionReceipt.mockResolvedValue({
    ...receipt,
    status: 'reverted',
  });
  await second.tracker.reconcile();
  expect(second.events.map(event => event.status)).toEqual(['failed']);
});

it('stops delivering events after unsubscribe and isolates listener errors', async () => {
  const { tracker, events, unsubscribe } = track();
  const broken = jest.fn(() => {
    throw new Error('listener bug');
  });
  tracker.subscribe(broken);
  unsubscribe();
  client.getTransactionReceipt.mockResolvedValue(receipt);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  await tracker.reconcile();
  warn.mockRestore();
  expect(broken).toHaveBeenCalledTimes(1);
  expect(events).toHaveLength(0);
  expect(transactionCacheService.updateStatus).toHaveBeenCalledWith(
    original,
    1,
    expect.objectContaining({ status: 'confirmed' }),
  );
});

it('marks the original as replaced when our replacement confirms', async () => {
  pendingRecords = [
    record({}),
    record({
      hash: replacement,
      nonce: 3,
      method: encodeReplacementMethod('cancel', original),
      tokenAmount: '0',
    }),
  ];
  client.getTransactionReceipt.mockImplementation(async ({ hash }) => {
    if (hash === replacement) return receipt;
    throw notFound();
  });
  const { tracker, events } = track();
  await tracker.reconcile();
  expect(transactionCacheService.updateStatus).toHaveBeenCalledWith(
    original,
    1,
    expect.objectContaining({
      status: 'cancelled',
      errorMessage: expect.stringContaining(replacement),
    }),
  );
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        hash: replacement,
        status: 'confirmed',
        replacement: { kind: 'cancel', originalHash: original },
      }),
      expect.objectContaining({
        hash: original,
        status: 'replaced',
        replacedBy: { hash: replacement, kind: 'cancel' },
        summary: expect.objectContaining({ amount: '0.5', symbol: 'ETH' }),
      }),
    ]),
  );
  expect(events).toHaveLength(2);
});

it('marks a transaction replaced only after its nonce is consumed on two passes', async () => {
  const { tracker, events } = track();
  await tracker.reconcile(); // learns nonce from the mempool
  expect(client.getTransaction).toHaveBeenCalled();
  client.getTransactionCount.mockResolvedValue(4);
  await tracker.reconcile(); // first observation: suspect only
  expect(events).toHaveLength(0);
  await tracker.reconcile(); // node still knows the tx (receipt lag): wait
  expect(events).toHaveLength(0);
  client.getTransaction.mockRejectedValue(
    Object.assign(new Error('gone'), { name: 'TransactionNotFoundError' }),
  );
  await tracker.reconcile(); // nonce used and tx dropped: replaced
  expect(events).toEqual([
    expect.objectContaining({
      hash: original,
      status: 'replaced',
      replacedBy: { hash: undefined, kind: undefined },
    }),
  ]);
  expect(transactionCacheService.updateStatus).toHaveBeenCalledWith(
    original,
    1,
    expect.objectContaining({ status: 'cancelled' }),
  );
});

it('persists the nonce it learns from the mempool on the stored record', async () => {
  const { tracker } = track();
  await tracker.reconcile();
  expect(transactionCacheService.updateStatus).toHaveBeenCalledWith(
    original,
    1,
    { nonce: 3 },
  );
});

it('resolves a dropped transaction after a restart using the persisted nonce', async () => {
  // 이전 세션에서 저장한 nonce가 있고, 앱이 꺼진 사이 mempool에서 사라졌다.
  pendingRecords = [record({ nonce: 3 })];
  client.getTransaction.mockRejectedValue(
    Object.assign(new Error('gone'), { name: 'TransactionNotFoundError' }),
  );
  client.getTransactionCount.mockResolvedValue(4);
  const { tracker, events } = track();
  await tracker.reconcile(); // first observation: suspect only
  expect(events).toHaveLength(0);
  await tracker.reconcile(); // nonce still used and the node no longer knows it
  expect(events).toEqual([
    expect.objectContaining({ hash: original, status: 'replaced' }),
  ]);
  expect(transactionCacheService.updateStatus).toHaveBeenCalledWith(
    original,
    1,
    expect.objectContaining({ status: 'cancelled' }),
  );
});

it('keeps polling in memory when persisting the nonce fails', async () => {
  (transactionCacheService.updateStatus as jest.Mock).mockRejectedValueOnce(
    new Error('realm closed'),
  );
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  const { tracker, events } = track();
  await tracker.reconcile(); // learns the nonce; the write fails
  client.getTransactionCount.mockResolvedValue(4);
  client.getTransaction.mockRejectedValue(
    Object.assign(new Error('gone'), { name: 'TransactionNotFoundError' }),
  );
  await tracker.reconcile();
  await tracker.reconcile();
  warn.mockRestore();
  expect(events.map(event => event.status)).toEqual(['replaced']);
});

it('waits for its own pending replacement instead of guessing', async () => {
  pendingRecords = [
    record({ nonce: 3 }),
    record({
      hash: replacement,
      nonce: 3,
      method: encodeReplacementMethod('speedUp', original),
    }),
  ];
  client.getTransactionCount.mockResolvedValue(4);
  const { tracker, events } = track();
  await tracker.reconcile();
  await tracker.reconcile();
  // The replacement itself has no own replacement, so it may be resolved, but
  // the original is never marked while its replacement is still pending.
  expect(
    events.filter(
      event => event.hash === original && event.status === 'replaced',
    ),
  ).toHaveLength(0);
});

it('treats RPC failures as inconclusive', async () => {
  client.getTransactionReceipt.mockRejectedValue(new Error('timeout'));
  client.getTransactionCount.mockResolvedValue(10);
  const { tracker, events } = track();
  await tracker.reconcile();
  await tracker.reconcile();
  await tracker.reconcile();
  expect(events).toHaveLength(0);
  expect(client.getTransactionCount).not.toHaveBeenCalled();
  expect(transactionCacheService.updateStatus).not.toHaveBeenCalled();
});

it('resolves a sped-up swap as successful in swap history', async () => {
  pendingRecords = [
    record({
      hash: replacement,
      nonce: 3,
      method: encodeReplacementMethod('speedUp', original),
      type: 'swap',
    }),
  ];
  const id = useSwapStore.getState().addHistoryItem({
    chainId: 1,
    timestamp: 0,
    sellToken: { address: 'a', symbol: 'A', amount: '1' },
    buyToken: { address: 'b', symbol: 'B', amount: '2' },
    txHash: original,
    status: 'pending',
    rate: '2',
  });
  client.getTransactionReceipt.mockImplementation(async ({ hash }) => {
    if (hash === replacement) return receipt;
    throw notFound();
  });
  const { tracker, events } = track();
  await tracker.reconcile();
  expect(
    useSwapStore.getState().history.find(item => item.id === id)?.status,
  ).toBe('success');
  expect(
    events.filter(
      event => event.hash === original && event.status === 'replaced',
    ),
  ).toHaveLength(1);
});

it('resolves a cancelled swap as failed when the cancel was sped up', async () => {
  // 취소 거래를 다시 가속한 거래도 replacement:cancel:<원본>으로 기록된다.
  const bumpedCancel = `0x${'c'.repeat(64)}`;
  pendingRecords = [
    record({
      hash: bumpedCancel,
      nonce: 3,
      method: encodeReplacementMethod('cancel', original),
      tokenAmount: '0',
    }),
  ];
  const id = useSwapStore.getState().addHistoryItem({
    chainId: 1,
    timestamp: 0,
    sellToken: { address: 'a', symbol: 'A', amount: '1' },
    buyToken: { address: 'b', symbol: 'B', amount: '2' },
    txHash: original,
    status: 'pending',
    rate: '2',
  });
  client.getTransactionReceipt.mockImplementation(async ({ hash }) => {
    if (hash === bumpedCancel) return receipt;
    throw notFound();
  });
  const { tracker, events } = track();
  await tracker.reconcile();
  expect(
    useSwapStore.getState().history.find(item => item.id === id)?.status,
  ).toBe('failed');
  expect(useSwapStore.getState().favoritePairs).toHaveLength(0);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        hash: original,
        status: 'replaced',
        replacedBy: { hash: bumpedCancel, kind: 'cancel' },
      }),
    ]),
  );
});

it('reports a replaced original once, with its replacement, when both paths race', async () => {
  pendingRecords = [
    record({ nonce: 3 }),
    record({
      hash: replacement,
      nonce: 3,
      method: encodeReplacementMethod('speedUp', original),
    }),
  ];
  client.getTransactionCount.mockResolvedValue(4);
  client.getTransaction.mockRejectedValue(
    Object.assign(new Error('gone'), { name: 'TransactionNotFoundError' }),
  );
  const { tracker, events } = track();
  await tracker.reconcile(); // both suspect; replacement receipt not visible yet
  client.getTransactionReceipt.mockImplementation(async ({ hash }) => {
    if (hash === replacement) return receipt;
    throw notFound();
  });
  await tracker.reconcile();
  await tracker.reconcile();
  expect(events.filter(event => event.status === 'replaced')).toEqual([
    expect.objectContaining({
      hash: original,
      replacedBy: { hash: replacement, kind: 'speedUp' },
    }),
  ]);
  expect(
    events.filter(event => event.status === 'confirmed').map(e => e.hash),
  ).toEqual([replacement]);
});
