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
