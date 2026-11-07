import {
  bumpFee,
  computeReplacementFees,
  ReplacementError,
  summarizeCalldata,
  txReplacementService,
} from '../../src/services/txReplacementService';
import { chainClient } from '../../src/services/chainClient';
import { signingService } from '../../src/services/signingService';
import {
  parseReplacementMethod,
  transactionTracker,
} from '../../src/services/transactionTracker';
import { transactionCacheService } from '../../src/realm/services/transactionCacheService';
import { encodeFunctionData, erc20Abi } from 'viem';

jest.mock('../../src/services/chainClient', () => ({
  chainClient: { getClient: jest.fn(), estimateGas: jest.fn() },
}));
jest.mock('../../src/services/signingService', () => ({
  signingService: { sendTransaction: jest.fn() },
}));
jest.mock('../../src/realm/services/transactionCacheService', () => ({
  transactionCacheService: {
    getByHash: jest.fn(),
    createLocalTransaction: jest.fn(),
  },
}));

const owner = '0x1234567890123456789012345678901234567890';
const recipient = '0x0987654321098765432109876543210987654321';
const token = '0x1111111111111111111111111111111111111111';
const hash = `0x${'a'.repeat(64)}` as const;
const gwei = 1_000_000_000n;

const notFound = () =>
  Object.assign(new Error('receipt not found'), {
    name: 'TransactionReceiptNotFoundError',
  });

const client = {
  getTransaction: jest.fn(),
  getTransactionReceipt: jest.fn(),
  getTransactionCount: jest.fn(),
  estimateFeesPerGas: jest.fn(),
  getGasPrice: jest.fn(),
  getBalance: jest.fn(),
};

const transferData = encodeFunctionData({
  abi: erc20Abi,
  functionName: 'transfer',
  args: [recipient, 5_000_000n],
});

function pendingTx(overrides: Record<string, unknown> = {}) {
  return {
    hash,
    from: owner,
    to: token,
    value: 0n,
    input: transferData,
    nonce: 7,
    gas: 60_000n,
    type: 'eip1559',
    maxFeePerGas: 40n * gwei,
    maxPriorityFeePerGas: 2n * gwei,
    blockNumber: null,
    chainId: 1,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (chainClient.getClient as jest.Mock).mockReturnValue(client);
  (chainClient.estimateGas as jest.Mock).mockResolvedValue(21_000n);
  client.getTransaction.mockResolvedValue(pendingTx());
  client.getTransactionReceipt.mockRejectedValue(notFound());
  client.getTransactionCount.mockResolvedValue(7);
  client.estimateFeesPerGas.mockResolvedValue({
    maxFeePerGas: 30n * gwei,
    maxPriorityFeePerGas: 1n * gwei,
  });
  client.getGasPrice.mockResolvedValue(10n * gwei);
  client.getBalance.mockResolvedValue(10n ** 18n);
  (transactionCacheService.getByHash as jest.Mock).mockResolvedValue(null);
  (
    transactionCacheService.createLocalTransaction as jest.Mock
  ).mockResolvedValue({});
  (signingService.sendTransaction as jest.Mock).mockResolvedValue(
    `0x${'b'.repeat(64)}`,
  );
  jest.spyOn(transactionTracker, 'reconcile').mockResolvedValue(undefined);
});

describe('fee bump math', () => {
  it('raises fees by at least 12.5% using exact bigint math (rounded up)', () => {
    expect(bumpFee(1000n)).toBe(1125n);
    expect(bumpFee(8n)).toBe(9n); // 8 * 1.125 = 9
    expect(bumpFee(9n)).toBe(11n); // 10.125 → 11 (never rounds down)
    expect(bumpFee(0n)).toBe(0n);
    const huge = 2n ** 200n + 1n;
    expect(bumpFee(huge) * 1000n >= huge * 1125n).toBe(true);
  });

  it('bumps both EIP-1559 fields and never goes below the network estimate', () => {
    const fees = computeReplacementFees(
      {
        type: 'eip1559',
        maxFeePerGas: 40n * gwei,
        maxPriorityFeePerGas: 2n * gwei,
      },
      { maxFeePerGas: 30n * gwei, maxPriorityFeePerGas: 3n * gwei },
    );
    expect(fees).toEqual({
      type: 'eip1559',
      maxFeePerGas: 45n * gwei, // 40 * 1.125 > network 30
      maxPriorityFeePerGas: 3n * gwei, // network 3 > 2 * 1.125
    });

    const spiked = computeReplacementFees(
      { type: 'eip1559', maxFeePerGas: 10n, maxPriorityFeePerGas: 10n },
      { maxFeePerGas: 100n, maxPriorityFeePerGas: 1n },
    );
    expect(spiked.type === 'eip1559' && spiked.maxFeePerGas).toBe(100n);
    expect(spiked.type === 'eip1559' && spiked.maxPriorityFeePerGas).toBe(12n);
  });

  it('keeps maxFeePerGas at or above the bumped priority fee', () => {
    const fees = computeReplacementFees(
      { type: 'eip1559', maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
      { maxPriorityFeePerGas: 50n },
    );
    expect(fees.type === 'eip1559' && fees.maxFeePerGas).toBe(50n);
  });

  it('bumps legacy gasPrice and respects the current gas price', () => {
    expect(
      computeReplacementFees(
        { type: 'legacy', gasPrice: 20n * gwei },
        { gasPrice: 10n * gwei },
      ),
    ).toEqual({ type: 'legacy', gasPrice: 22_500_000_000n });
    expect(
      computeReplacementFees(
        { type: 'legacy', gasPrice: 20n * gwei },
        { gasPrice: 50n * gwei },
      ),
    ).toEqual({ type: 'legacy', gasPrice: 50n * gwei });
  });
});

describe('prepare', () => {
  it('speeds up with the same to/value/data/nonce and bumped fees', async () => {
    const plan = await txReplacementService.prepare({
      kind: 'speedUp',
      hash,
      chainId: 1,
      activeAddress: owner.toUpperCase().replace('0X', '0x'),
    });
    expect(plan.transaction).toEqual({
      from: owner,
      to: token,
      value: '0',
      data: transferData,
      gas: '60000',
      nonce: '7',
      maxFeePerGas: (45n * gwei).toString(),
      maxPriorityFeePerGas: '2250000000',
    });
    expect(plan.originalMaxCostWei).toBe(60_000n * 40n * gwei);
    expect(plan.newMaxCostWei).toBe(60_000n * 45n * gwei);
    expect(plan.extraCostWei).toBe(60_000n * 5n * gwei);
    expect(summarizeCalldata(plan.data)).toContain('transfer(');
  });

  it('cancels with a 0-value self-transfer, same nonce, no data and bumped legacy fees', async () => {
    client.getTransaction.mockResolvedValue(
      pendingTx({
        type: 'legacy',
        gasPrice: 20n * gwei,
        maxFeePerGas: undefined,
        maxPriorityFeePerGas: undefined,
        to: recipient,
        value: 10n ** 17n,
        input: '0x',
        gas: 21_000n,
      }),
    );
    const plan = await txReplacementService.prepare({
      kind: 'cancel',
      hash,
      chainId: 1,
      activeAddress: owner,
    });
    expect(plan.transaction).toEqual({
      from: owner,
      to: owner,
      value: '0',
      data: undefined,
      gas: '21000',
      nonce: '7',
      gasPrice: '22500000000',
    });
    expect(plan.value).toBe(0n);
    expect(plan.totalAtRiskWei).toBe(21_000n * 22_500_000_000n);
  });

  it('refuses transactions that are mined, foreign or unaffordable', async () => {
    client.getTransaction.mockResolvedValueOnce(pendingTx({ blockNumber: 5n }));
    await expect(
      txReplacementService.prepare({
        kind: 'speedUp',
        hash,
        chainId: 1,
        activeAddress: owner,
      }),
    ).rejects.toMatchObject({ code: 'NOT_PENDING' });

    await expect(
      txReplacementService.prepare({
        kind: 'cancel',
        hash,
        chainId: 1,
        activeAddress: recipient,
      }),
    ).rejects.toMatchObject({ code: 'NOT_OWNER' });

    client.getBalance.mockResolvedValueOnce(1n);
    await expect(
      txReplacementService.prepare({
        kind: 'speedUp',
        hash,
        chainId: 1,
        activeAddress: owner,
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

    client.getTransaction.mockRejectedValueOnce(new Error('not found'));
    await expect(
      txReplacementService.prepare({
        kind: 'speedUp',
        hash,
        chainId: 1,
        activeAddress: owner,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('nonce re-check before signing', () => {
  const plan = {
    originalHash: hash,
    chainId: 1,
    from: owner,
    nonce: 7,
  } as const;

  it('passes while the receipt is missing and the nonce is unused', async () => {
    await expect(txReplacementService.assertStillPending(plan)).resolves.toBe(
      undefined,
    );
    expect(client.getTransactionCount).toHaveBeenCalledWith({
      address: owner,
      blockTag: 'latest',
    });
  });

  it('fails when the original was mined or the nonce was consumed', async () => {
    client.getTransactionReceipt.mockResolvedValueOnce({ status: 'success' });
    await expect(
      txReplacementService.assertStillPending(plan),
    ).rejects.toBeInstanceOf(ReplacementError);
    client.getTransactionCount.mockResolvedValueOnce(8);
    await expect(
      txReplacementService.assertStillPending(plan),
    ).rejects.toMatchObject({ code: 'NOT_PENDING' });
  });

  it('fails closed when the receipt lookup errors', async () => {
    client.getTransactionReceipt.mockRejectedValueOnce(new Error('timeout'));
    await expect(txReplacementService.assertStillPending(plan)).rejects.toThrow(
      '거래 상태를 확인하지 못했습니다',
    );
  });
});

describe('submit', () => {
  async function preparedPlan(kind: 'speedUp' | 'cancel' = 'speedUp') {
    return txReplacementService.prepare({
      kind,
      hash,
      chainId: 1,
      activeAddress: owner,
    });
  }

  it('never signs without a valid authorization', async () => {
    const plan = await preparedPlan();
    await expect(
      txReplacementService.submit(plan, () => false),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      txReplacementService.submit(
        { ...plan, expiresAt: Date.now() - 1 },
        () => true,
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(signingService.sendTransaction).not.toHaveBeenCalled();
  });

  it('re-checks the nonce right before signing and aborts when it was used', async () => {
    const plan = await preparedPlan();
    client.getTransactionCount.mockResolvedValueOnce(8);
    await expect(
      txReplacementService.submit(plan, () => true),
    ).rejects.toMatchObject({
      code: 'NOT_PENDING',
    });
    expect(signingService.sendTransaction).not.toHaveBeenCalled();
  });

  it('signs through signingService and records the replacement linked to the original', async () => {
    const plan = await preparedPlan('cancel');
    const isAuthorized = jest.fn(() => true);
    const newHash = await txReplacementService.submit(plan, isAuthorized, {
      nativeSymbol: 'ETH',
    });
    expect(signingService.sendTransaction).toHaveBeenCalledWith(
      plan.transaction,
      1,
      isAuthorized,
    );
    const record = (transactionCacheService.createLocalTransaction as jest.Mock)
      .mock.calls[0][0];
    expect(record).toMatchObject({
      hash: newHash,
      from: owner,
      to: owner,
      value: '0',
      nonce: 7,
      type: 'send',
      tokenSymbol: 'ETH',
    });
    expect(parseReplacementMethod(record.method)).toEqual({
      kind: 'cancel',
      originalHash: hash,
    });
    expect(transactionTracker.reconcile).toHaveBeenCalled();
  });

  it('links a replacement of a replacement to the root transaction', async () => {
    const root = `0x${'c'.repeat(64)}`;
    (transactionCacheService.getByHash as jest.Mock).mockResolvedValue({
      method: `replacement:speedUp:${root}`,
      type: 'send',
      to: recipient,
      value: '5',
      tokenSymbol: 'USDC',
      tokenAmount: '5',
      tokenAddress: token,
    });
    const plan = await preparedPlan();
    expect(plan.rootHash).toBe(root);
    await txReplacementService.submit(plan, () => true);
    const record = (transactionCacheService.createLocalTransaction as jest.Mock)
      .mock.calls[0][0];
    expect(record).toMatchObject({
      to: recipient,
      tokenSymbol: 'USDC',
      tokenAmount: '5',
      tokenAddress: token,
    });
    expect(parseReplacementMethod(record.method)?.originalHash).toBe(root);
  });
});
