import {
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  maxUint256,
} from 'viem';
import {
  approvalService,
  decodeApproveCalldata,
  formatAllowance,
  UNLIMITED_ALLOWANCE_THRESHOLD,
} from '../../src/services/approvalService';
import { chainClient } from '../../src/services/chainClient';
import { signingService } from '../../src/services/signingService';
import { transactionTracker } from '../../src/services/transactionTracker';
import { ZERO_X_ALLOWANCE_HOLDER } from '../../src/services/swapService';
import { transactionCacheService } from '../../src/realm/services/transactionCacheService';
import { tokenListService } from '../../src/realm/services/tokenListService';

jest.mock('../../src/services/chainClient', () => ({
  chainClient: {
    getClient: jest.fn(),
    estimateGas: jest.fn(),
    getGasPrice: jest.fn(),
  },
}));
jest.mock('../../src/services/signingService', () => ({
  signingService: { sendTransaction: jest.fn() },
}));
jest.mock('../../src/realm/services/transactionCacheService', () => ({
  transactionCacheService: {
    getByAddress: jest.fn(),
    createLocalTransaction: jest.fn(),
  },
}));
jest.mock('../../src/realm/services/tokenListService', () => ({
  tokenListService: { getCustomTokens: jest.fn() },
}));

const owner = '0x1234567890123456789012345678901234567890';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const custom = '0x2222222222222222222222222222222222222222';
const router = '0x3333333333333333333333333333333333333333';
const approveHash = `0x${'d'.repeat(64)}`;

const client = {
  readContract: jest.fn(),
  getTransaction: jest.fn(),
  getBalance: jest.fn(),
};

type Allowances = Record<string, bigint>;
let allowances: Allowances;
const pairKey = (token: string, spender: string) =>
  `${token.toLowerCase()}:${spender.toLowerCase()}`;

beforeEach(() => {
  jest.clearAllMocks();
  allowances = {};
  (chainClient.getClient as jest.Mock).mockReturnValue(client);
  (chainClient.estimateGas as jest.Mock).mockResolvedValue(50_000n);
  (chainClient.getGasPrice as jest.Mock).mockResolvedValue(10_000_000_000n);
  client.getBalance.mockResolvedValue(10n ** 18n);
  client.readContract.mockImplementation(
    async ({ address, functionName, args }) => {
      if (functionName === 'allowance')
        return allowances[pairKey(address, args[1])] ?? 0n;
      if (functionName === 'decimals') return 18;
      if (functionName === 'symbol') return 'CUS';
      throw new Error(`unexpected ${functionName}`);
    },
  );
  (transactionCacheService.getByAddress as jest.Mock).mockResolvedValue([]);
  (tokenListService.getCustomTokens as jest.Mock).mockResolvedValue([]);
  (signingService.sendTransaction as jest.Mock).mockResolvedValue(
    `0x${'e'.repeat(64)}`,
  );
  jest.spyOn(transactionTracker, 'reconcile').mockResolvedValue(undefined);
});

describe('formatting helpers', () => {
  it('formats with decimals and shows 무제한 at or above 2^255', () => {
    expect(formatAllowance(1_500_000n, 6)).toEqual({
      isUnlimited: false,
      formatted: '1.5',
    });
    expect(formatAllowance(UNLIMITED_ALLOWANCE_THRESHOLD, 6)).toEqual({
      isUnlimited: true,
      formatted: '무제한',
    });
    expect(formatAllowance(maxUint256).formatted).toBe('무제한');
    expect(formatAllowance(5n).formatted).toBe('5 (원시 단위)');
  });

  it('decodes approve calldata only', () => {
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [router, 7n],
    });
    expect(decodeApproveCalldata(data)).toEqual({
      spender: router,
      amount: 7n,
    });
    expect(decodeApproveCalldata('0xa9059cbb')).toBeNull();
    expect(decodeApproveCalldata(undefined)).toBeNull();
  });
});

describe('listAllowances', () => {
  it('lists non-zero allowances for known tokens against the AllowanceHolder', async () => {
    allowances[pairKey(USDC, ZERO_X_ALLOWANCE_HOLDER)] = maxUint256;
    allowances[pairKey(USDT, ZERO_X_ALLOWANCE_HOLDER)] = 2_500_000n;
    const result = await approvalService.listAllowances(owner, 1);
    expect(result.failedChecks).toBe(0);
    expect(result.spendersChecked).toBe(1);
    const bySymbol = Object.fromEntries(
      result.approvals.map(item => [item.token.symbol, item]),
    );
    expect(Object.keys(bySymbol).sort()).toEqual(['USDC', 'USDT']);
    expect(bySymbol.USDC).toMatchObject({
      isUnlimited: true,
      formattedAmount: '무제한',
      spender: { label: '0x AllowanceHolder' },
    });
    expect(bySymbol.USDT.formattedAmount).toBe('2.5');
    // 네이티브 자리표시자와 형식이 잘못된 주소는 조회하지 않는다.
    const queried = client.readContract.mock.calls.map(([call]) =>
      call.address.toLowerCase(),
    );
    expect(queried).not.toContain('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    expect(
      queried.every((address: string) => /^0x[0-9a-f]{40}$/.test(address)),
    ).toBe(true);
  });

  it('adds spenders decoded from local approve records and custom tokens', async () => {
    (tokenListService.getCustomTokens as jest.Mock).mockResolvedValue([
      { address: custom, symbol: 'MINE', decimals: 2 },
    ]);
    (transactionCacheService.getByAddress as jest.Mock).mockResolvedValue([
      {
        hash: approveHash,
        from: owner,
        to: custom,
        tokenAddress: custom,
        tokenSymbol: 'MINE',
        type: 'approve',
      },
    ]);
    client.getTransaction.mockResolvedValue({
      to: custom,
      input: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [router, 1234n],
      }),
    });
    allowances[pairKey(custom, router)] = 1234n;
    const result = await approvalService.listAllowances(owner, 1);
    expect(transactionCacheService.getByAddress).toHaveBeenCalledWith(
      owner,
      1,
      {
        type: 'approve',
        limit: 30,
      },
    );
    expect(result.spendersChecked).toBe(2);
    expect(result.approvals).toEqual([
      expect.objectContaining({
        token: expect.objectContaining({ symbol: 'MINE', decimals: 2 }),
        spender: { address: router, label: undefined },
        formattedAmount: '12.34',
      }),
    ]);
  });

  it('returns an empty list when nothing is approved and fails when every read fails', async () => {
    await expect(
      approvalService.listAllowances(owner, 1),
    ).resolves.toMatchObject({ approvals: [] });
    client.readContract.mockRejectedValue(new Error('offline'));
    await expect(approvalService.listAllowances(owner, 1)).rejects.toThrow(
      '토큰 승인 정보를 불러오지 못했습니다.',
    );
  });

  it('reports partial failures without hiding found approvals', async () => {
    allowances[pairKey(USDC, ZERO_X_ALLOWANCE_HOLDER)] = 1n;
    client.readContract.mockImplementation(async ({ address }) => {
      if (address.toLowerCase() === USDT.toLowerCase())
        throw new Error('rate limited');
      return allowances[pairKey(address, ZERO_X_ALLOWANCE_HOLDER)] ?? 0n;
    });
    const result = await approvalService.listAllowances(owner, 1);
    expect(result.failedChecks).toBe(1);
    expect(result.approvals.map(item => item.token.symbol)).toEqual(['USDC']);
  });
});

describe('revoke', () => {
  const token = { address: USDC as `0x${string}`, symbol: 'USDC', decimals: 6 };
  const spender = {
    address: ZERO_X_ALLOWANCE_HOLDER as `0x${string}`,
    label: '0x AllowanceHolder',
  };

  it('builds approve(spender, 0) to the token contract with zero value', async () => {
    const plan = await approvalService.prepareRevoke({
      owner,
      chainId: 1,
      token,
      spender,
    });
    expect(plan.transaction).toMatchObject({
      from: owner,
      to: USDC,
      value: '0',
      gas: '60000',
      gasPrice: '10000000000',
    });
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: plan.transaction.data as `0x${string}`,
    });
    expect(decoded.functionName).toBe('approve');
    expect(decoded.args).toEqual([ZERO_X_ALLOWANCE_HOLDER, 0n]);
    expect(plan.feeWei).toBe(60_000n * 10_000_000_000n);
  });

  it('refuses when the fee is unaffordable', async () => {
    client.getBalance.mockResolvedValue(1n);
    await expect(
      approvalService.prepareRevoke({ owner, chainId: 1, token, spender }),
    ).rejects.toThrow('잔액이 부족합니다');
  });

  it('requires authorization before signing', async () => {
    const plan = await approvalService.prepareRevoke({
      owner,
      chainId: 1,
      token,
      spender,
    });
    await expect(
      approvalService.submitRevoke(plan, () => false),
    ).rejects.toThrow('승인이 만료되었거나');
    await expect(
      approvalService.submitRevoke({ ...plan, expiresAt: 0 }, () => true),
    ).rejects.toThrow('승인이 만료되었거나');
    expect(signingService.sendTransaction).not.toHaveBeenCalled();

    const isAuthorized = jest.fn(() => true);
    await approvalService.submitRevoke(plan, isAuthorized);
    expect(signingService.sendTransaction).toHaveBeenCalledWith(
      plan.transaction,
      1,
      isAuthorized,
    );
    expect(transactionCacheService.createLocalTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'approve',
        method: 'approve',
        tokenAddress: USDC,
        tokenAmount: '0',
      }),
    );
    expect(transactionTracker.reconcile).toHaveBeenCalled();
  });
});
