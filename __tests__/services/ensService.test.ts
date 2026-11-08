/**
 * ENS 이름 해석 테스트
 */

import {
  ensService,
  isEnsName,
  normalizeEnsName,
  EnsError,
} from '../../src/services/ensService';
import { chainClient } from '../../src/services/chainClient';
import { toCoinType } from 'viem/ens';

jest.mock('../../src/services/chainClient', () => ({
  chainClient: { getClient: jest.fn() },
}));

const getEnsAddress = jest.fn();
const resolved = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

beforeEach(() => {
  jest.clearAllMocks();
  ensService.clearCache();
  (chainClient.getClient as jest.Mock).mockReturnValue({ getEnsAddress });
});

describe('isEnsName', () => {
  it.each([
    ['vitalik.eth', true],
    ['  Vitalik.ETH ', true],
    ['sub.name.eth', true],
    ['0x1234567890123456789012345678901234567890', false],
    ['vitalik', false],
    ['vitalik.com', false],
    ['bad name.eth', false],
  ])('%p → %p', (input, expected) => {
    expect(isEnsName(input)).toBe(expected);
  });
});

describe('ensService.resolve', () => {
  it('normalizes the name and resolves it on the mainnet registry', async () => {
    getEnsAddress.mockResolvedValue(resolved.toLowerCase());

    await expect(ensService.resolve('Vitalik.eth')).resolves.toEqual({
      name: 'vitalik.eth',
      address: resolved,
      source: 'chain',
    });
    expect(chainClient.getClient).toHaveBeenCalledWith(1);
    expect(getEnsAddress).toHaveBeenCalledTimes(1);
    expect(getEnsAddress).toHaveBeenCalledWith({ name: 'vitalik.eth' });
  });

  it('caches successful lookups', async () => {
    getEnsAddress.mockResolvedValue(resolved);
    await ensService.resolve('vitalik.eth');
    await ensService.resolve('VITALIK.eth');
    expect(getEnsAddress).toHaveBeenCalledTimes(1);
  });

  it.each([null, undefined, '0x0000000000000000000000000000000000000000'])(
    'reports a name without an address (%p) as not found',
    async value => {
      getEnsAddress.mockResolvedValue(value);
      await expect(ensService.resolve('nobody.eth')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    },
  );

  it('reports RPC failures as network errors', async () => {
    getEnsAddress.mockRejectedValue(new Error('timeout'));
    await expect(ensService.resolve('vitalik.eth')).rejects.toMatchObject({
      code: 'NETWORK',
    });
  });

  it('rejects names that fail ENS normalization', () => {
    expect(() => normalizeEnsName('in valid.eth')).toThrow(EnsError);
  });
});

describe('ensService.resolve on other networks (ENSIP-11/19)', () => {
  const baseCoinType = toCoinType(8453);
  const defaultEvmCoinType = 0x80000000n;
  const baseAddress = '0x00000000219ab540356cBB839Cbe05303d7705Fa';
  const evmAddress = '0x1111111111111111111111111111111111111111';

  it('prefers the chain-specific record on the mainnet registry', async () => {
    getEnsAddress.mockImplementation(async ({ coinType }) =>
      coinType === baseCoinType ? baseAddress : resolved,
    );
    await expect(ensService.resolve('treasury.eth', 8453)).resolves.toEqual({
      name: 'treasury.eth',
      address: baseAddress,
      source: 'chain',
    });
    expect(chainClient.getClient).toHaveBeenCalledWith(1);
    expect(getEnsAddress).toHaveBeenCalledWith({
      name: 'treasury.eth',
      coinType: baseCoinType,
    });
  });

  it('uses the default EVM record before the mainnet record', async () => {
    getEnsAddress.mockImplementation(async ({ coinType }) =>
      coinType === defaultEvmCoinType
        ? evmAddress
        : coinType === undefined
        ? resolved
        : null,
    );
    await expect(ensService.resolve('treasury.eth', 8453)).resolves.toEqual({
      name: 'treasury.eth',
      address: evmAddress,
      source: 'chain',
    });
  });

  it('falls back to the mainnet record and flags it', async () => {
    getEnsAddress.mockImplementation(async ({ coinType }) =>
      coinType === undefined ? resolved : null,
    );
    await expect(ensService.resolve('treasury.eth', 8453)).resolves.toEqual({
      name: 'treasury.eth',
      address: resolved,
      source: 'default',
    });
  });

  it('does not fall back to a lower-priority record when a lookup fails', async () => {
    getEnsAddress.mockImplementation(async ({ coinType }) => {
      if (coinType === baseCoinType) throw new Error('timeout');
      return resolved;
    });
    await expect(ensService.resolve('treasury.eth', 8453)).rejects.toMatchObject(
      { code: 'NETWORK' },
    );
  });

  it('caches per name and network', async () => {
    getEnsAddress.mockImplementation(async ({ coinType }) =>
      coinType === baseCoinType ? baseAddress : resolved,
    );
    const onBase = await ensService.resolve('treasury.eth', 8453);
    const onMainnet = await ensService.resolve('treasury.eth', 1);
    expect(onBase.address).toBe(baseAddress);
    expect(onMainnet.address).toBe(resolved);
    const calls = getEnsAddress.mock.calls.length;
    await ensService.resolve('treasury.eth', 8453);
    await ensService.resolve('treasury.eth', 1);
    expect(getEnsAddress).toHaveBeenCalledTimes(calls);
  });

  it('skips the chain-specific record for chain IDs outside ENSIP-11', async () => {
    getEnsAddress.mockImplementation(async ({ coinType }) =>
      coinType === undefined ? resolved : null,
    );
    await expect(
      ensService.resolve('treasury.eth', 2 ** 31 + 5),
    ).resolves.toMatchObject({ source: 'default' });
    expect(getEnsAddress).toHaveBeenCalledTimes(2);
  });
});
