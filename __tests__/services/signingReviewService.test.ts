import { prepareSigningRequest } from '../../src/services/signingReviewService';
import {
  analyzeSigningRequest,
  assertSigningIntentUnchanged,
} from '../../src/services/signingIntentService';
import { chainClient } from '../../src/services/chainClient';

jest.mock('../../src/services/chainClient', () => ({
  chainClient: { getClient: jest.fn() },
}));
const account = '0x1234567890123456789012345678901234567890';
const to = '0x0987654321098765432109876543210987654321';
const getGasPrice = jest.fn();
const estimateGas = jest.fn();
const estimateFeesPerGas = jest.fn();
const input = () => ({
  account,
  chainId: 1,
  method: 'eth_sendTransaction',
  params: [{ from: account, to, value: '1000000000000000000' }],
});
beforeEach(() => {
  jest.clearAllMocks();
  (chainClient.getClient as jest.Mock).mockReturnValue({
    getGasPrice,
    estimateGas,
    estimateFeesPerGas,
  });
  getGasPrice.mockResolvedValue(1_000_000_000n);
  estimateGas.mockResolvedValue(21_000n);
  estimateFeesPerGas.mockResolvedValue({
    maxFeePerGas: 2_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
});

it('prepares missing fees once and binds the displayed maximum fee and total', async () => {
  const original = input();
  const prepared = await prepareSigningRequest(original);
  expect(original.params[0]).not.toHaveProperty('gas');
  expect(prepared.params[0]).toMatchObject({
    gas: '25200',
    maxFeePerGas: '2000000000',
  });
  const review = analyzeSigningRequest(prepared);
  expect(review.blocked).toBe(false);
  expect(review.details).toContainEqual({
    label: '최대 네트워크 수수료',
    value: '0.0000504 ETH',
  });
  expect(review.details).toContainEqual({
    label: '최대 총지출액',
    value: '1.0000504 ETH',
  });
  expect(() =>
    assertSigningIntentUnchanged(review.fingerprint, {
      ...prepared,
      params: [{ ...(prepared.params[0] as object), gas: '9000000' }],
    }),
  ).toThrow('변경');
});

it('requires acknowledgement for excessive fees even on a plain native transfer', async () => {
  const prepared = await prepareSigningRequest({
    ...input(),
    params: [{ ...input().params[0], gas: '21000', gasPrice: '1000000000000' }],
  });
  const review = analyzeSigningRequest(prepared);
  expect(review.requiresRiskAcknowledgement).toBe(true);
  expect(review.warnings).toContainEqual(
    expect.objectContaining({
      level: 'critical',
      message: expect.stringContaining('수수료가 높습니다'),
    }),
  );
});

it('blocks missing fees and RPC failure instead of showing a zero fee', async () => {
  expect(analyzeSigningRequest(input()).blocked).toBe(true);
  getGasPrice.mockRejectedValue(new Error('offline'));
  await expect(prepareSigningRequest(input())).rejects.toThrow('offline');
});

it.each([
  { gasPrice: '1', maxFeePerGas: '2' },
  { maxFeePerGas: '1', maxPriorityFeePerGas: '2' },
  { gasPrice: '-1' },
])('rejects malformed fee fields %j', fee => {
  expect(() =>
    analyzeSigningRequest({
      ...input(),
      params: [{ ...input().params[0], gas: '21000', ...fee }],
    }),
  ).toThrow();
});

it('does not label the execution fee as the entire fee on rollups', () => {
  const review = analyzeSigningRequest({
    ...input(),
    chainId: 8453,
    params: [{ ...input().params[0], gas: '21000', gasPrice: '1000000000' }],
  });
  expect(review.details).toContainEqual(
    expect.objectContaining({ label: '실행비 포함 금액 (L1 비용 별도)' }),
  );
  expect(review.warnings).toContainEqual(
    expect.objectContaining({
      message: expect.stringContaining('L1 데이터 수수료'),
    }),
  );
});

it('resolves a missing pending nonce before reviewing a sign-only transaction', async () => {
  const getTransactionCount = jest.fn().mockResolvedValue(10);
  (chainClient.getClient as jest.Mock).mockReturnValue({
    getGasPrice,
    estimateGas,
    estimateFeesPerGas,
    getTransactionCount,
  });
  const prepared = await prepareSigningRequest({
    ...input(),
    method: 'eth_signTransaction',
  });
  expect(prepared.params[0]).toMatchObject({
    nonce: '10',
    maxFeePerGas: '2000000000',
  });
  expect(getTransactionCount).toHaveBeenCalledWith({
    address: account,
    blockTag: 'pending',
  });
});
