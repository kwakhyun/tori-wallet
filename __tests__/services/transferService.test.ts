import { decodeFunctionData, erc20Abi, parseEther } from 'viem';
import { transferService } from '../../src/services/transferService';
import { parseTransferAmount, txService } from '../../src/services/txService';
import { chainClient } from '../../src/services/chainClient';

jest.mock('../../src/services/chainClient', () => ({
  chainClient: {
    getClient: jest.fn(),
    estimateGas: jest.fn(),
    getGasPrice: jest.fn(),
  },
  ChainError: class extends Error {},
}));
const from = '0x1234567890123456789012345678901234567890';
const to = '0x0987654321098765432109876543210987654321';
const tokenAddress = '0x1111111111111111111111111111111111111111';
const getBalance = jest.fn();
const readContract = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  (chainClient.getClient as jest.Mock).mockReturnValue({
    getBalance,
    readContract,
  });
  getBalance.mockResolvedValue(parseEther('10'));
  readContract.mockImplementation(
    async ({ functionName }) =>
      ({ decimals: 18, symbol: 'TEST', balanceOf: 100000000000000000000n }[
        functionName as string
      ]),
  );
  (chainClient.estimateGas as jest.Mock).mockResolvedValue(50_000n);
  (chainClient.getGasPrice as jest.Mock).mockResolvedValue(1_000_000_000n);
});

it('sends exact 18-decimal ERC20 units to the contract with zero native value', async () => {
  const amount = '1.000000000000000001';
  const plan = await transferService.prepare({
    from,
    to,
    tokenAddress,
    amount,
    chainId: 1,
  });
  expect(plan.transaction).toMatchObject({
    from,
    to: tokenAddress,
    value: '0',
    gas: '65000',
    gasPrice: '1000000000',
  });
  const decoded = decodeFunctionData({
    abi: erc20Abi,
    data: plan.transaction.data! as `0x${string}`,
  });
  expect(decoded).toMatchObject({
    functionName: 'transfer',
    args: [to, 1000000000000000001n],
  });
  expect(chainClient.estimateGas).toHaveBeenCalledWith(
    expect.objectContaining({ to: tokenAddress, data: plan.transaction.data }),
    expect.objectContaining({ chainId: 1 }),
  );
});

it('keeps native transfers separate and includes their fee in the balance check', async () => {
  const plan = await transferService.prepare({
    from,
    to,
    amount: '1',
    chainId: 1,
  });
  expect(plan.transaction).toMatchObject({
    to,
    value: parseEther('1').toString(),
    data: undefined,
  });
  getBalance.mockResolvedValue(parseEther('1'));
  await expect(
    transferService.prepare({ from, to, amount: '1', chainId: 1 }),
  ).rejects.toThrow('수수료');
});

it('requires both token balance and native gas balance, without a native fallback', async () => {
  getBalance.mockResolvedValue(0n);
  await expect(
    transferService.prepare({
      from,
      to,
      tokenAddress,
      amount: '1',
      chainId: 1,
    }),
  ).rejects.toThrow('수수료');
  getBalance.mockResolvedValue(parseEther('10'));
  await expect(
    transferService.prepare({
      from,
      to,
      tokenAddress,
      amount: '101',
      chainId: 1,
    }),
  ).rejects.toThrow('잔액');
  readContract.mockRejectedValue(new Error('metadata unavailable'));
  await expect(
    transferService.prepare({
      from,
      to,
      tokenAddress,
      amount: '1',
      chainId: 1,
    }),
  ).rejects.toThrow('metadata unavailable');
});

it.each(['1e3', '1x', ' 1', '-1', 'Infinity', '0', '0.0000001'])(
  'rejects invalid or over-precision amount %s for 6-decimal tokens',
  amount => {
    expect(() => parseTransferAmount(amount, 6)).toThrow();
  },
);

it('does not round a maximum token balance or silently substitute gas on failure', async () => {
  const amount = '9007199254.740993';
  expect(parseTransferAmount(amount, 6)).toBe(9007199254740993n);
  const data = txService.createTokenTransferRequest(
    from,
    to,
    tokenAddress,
    amount,
    6,
  ).data;
  expect(decodeFunctionData({ abi: erc20Abi, data }).args?.[1]).toBe(
    9007199254740993n,
  );
  (chainClient.estimateGas as jest.Mock).mockRejectedValue(new Error('revert'));
  await expect(
    txService.estimateTokenTransfer(from, to, tokenAddress, '1', 6, 1),
  ).rejects.toThrow('토큰 전송');
});

describe('EIP-1559 fees and speed options', () => {
  const estimateFeesPerGas = jest.fn();
  beforeEach(() => {
    estimateFeesPerGas.mockResolvedValue({
      maxFeePerGas: 30_000_000_000n,
      maxPriorityFeePerGas: 2_000_000_000n,
    });
    (chainClient.getClient as jest.Mock).mockReturnValue({
      getBalance,
      readContract,
      estimateFeesPerGas,
    });
  });

  it('uses EIP-1559 fee fields and freezes them in the plan', async () => {
    const plan = await transferService.prepare({
      from,
      to,
      amount: '1',
      chainId: 1,
    });
    expect(plan.feeType).toBe('eip1559');
    expect(plan.transaction.gasPrice).toBeUndefined();
    expect(plan.transaction.maxFeePerGas).toBe('30000000000');
    expect(plan.transaction.maxPriorityFeePerGas).toBe('2000000000');
    // 50,000 × 120% 버퍼 = 60,000 gas × 최대 30 gwei
    expect(plan.feeWei).toBe(60_000n * 30_000_000_000n);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.transaction)).toBe(true);
    expect(chainClient.getGasPrice).not.toHaveBeenCalled();
  });

  it('applies slow/normal/fast multipliers to the priority fee and base headroom', async () => {
    const [slow, normal, fast] = await Promise.all(
      (['slow', 'normal', 'fast'] as const).map(feeSpeed =>
        transferService.prepare({
          from,
          to,
          amount: '1',
          chainId: 1,
          feeSpeed,
        }),
      ),
    );
    expect(slow.transaction.maxPriorityFeePerGas).toBe('1600000000');
    expect(slow.transaction.maxFeePerGas).toBe('29600000000');
    expect(normal.transaction.maxPriorityFeePerGas).toBe('2000000000');
    expect(fast.transaction.maxPriorityFeePerGas).toBe('3000000000');
    // (30 − 2) × 125% + 3 = 38 gwei
    expect(fast.transaction.maxFeePerGas).toBe('38000000000');
    expect(fast.feeSpeed).toBe('fast');
    expect(fast.feeWei > normal.feeWei && normal.feeWei > slow.feeWei).toBe(
      true,
    );
  });

  it('falls back to legacy gasPrice when the chain has no EIP-1559 fees', async () => {
    estimateFeesPerGas.mockRejectedValue(new Error('Eip1559FeesNotSupported'));
    const plan = await transferService.prepare({
      from,
      to,
      amount: '1',
      chainId: 1,
      feeSpeed: 'fast',
    });
    expect(plan.feeType).toBe('legacy');
    expect(plan.transaction.maxFeePerGas).toBeUndefined();
    expect(plan.transaction.gasPrice).toBe('1250000000'); // 1 gwei × 125%
  });

  it('sends the whole native balance minus the max fee with bigint precision', async () => {
    getBalance.mockResolvedValue(1_000_000_000_000_000_001n);
    const plan = await transferService.prepare({
      from,
      to,
      amount: '',
      chainId: 1,
      sendMax: true,
    });
    const fee = 60_000n * 30_000_000_000n;
    expect(plan.units).toBe(1_000_000_000_000_000_001n - fee);
    expect(plan.transaction.value).toBe(plan.units.toString());
    expect(BigInt(plan.transaction.value!) + plan.feeWei).toBe(
      1_000_000_000_000_000_001n,
    );
    getBalance.mockResolvedValue(fee);
    await expect(
      transferService.prepare({
        from,
        to,
        amount: '',
        chainId: 1,
        sendMax: true,
      }),
    ).rejects.toThrow('수수료를 제외하면');
  });

  it('detects tampering with a reviewed plan before signing', async () => {
    const plan = await transferService.prepare({
      from,
      to,
      amount: '1',
      chainId: 1,
      ensName: 'friend.eth',
    });
    expect(plan.ensName).toBe('friend.eth');
    expect(() => transferService.assertPlanIntact(plan)).not.toThrow();
    expect(() =>
      transferService.assertPlanIntact({
        ...plan,
        transaction: { ...plan.transaction, to: tokenAddress },
      }),
    ).toThrow('변경되어 차단');
    expect(() =>
      transferService.assertPlanIntact({
        ...plan,
        transaction: { ...plan.transaction, maxFeePerGas: '1' },
      }),
    ).toThrow('변경되어 차단');
  });
});

describe('recipient kind (contract warning)', () => {
  const getCode = jest.fn();
  beforeEach(() => {
    (chainClient.getClient as jest.Mock).mockReturnValue({ getCode });
  });

  it.each([
    [undefined, 'eoa'],
    ['0x', 'eoa'],
    ['0x6080604052', 'contract'],
    // EIP-7702 위임 계정은 개인 계정이다.
    [`0xef0100${'ab'.repeat(20)}`, 'eoa'],
  ])('classifies code %p as %s', async (code, kind) => {
    getCode.mockResolvedValue(code);
    await expect(transferService.getRecipientKind(to, 1)).resolves.toBe(kind);
  });

  it('returns unknown when the RPC fails', async () => {
    getCode.mockRejectedValue(new Error('offline'));
    await expect(transferService.getRecipientKind(to, 1)).resolves.toBe(
      'unknown',
    );
  });
});
