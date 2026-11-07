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
    });
    expect(chainClient.getClient).toHaveBeenCalledWith(1);
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
