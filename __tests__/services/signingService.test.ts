/**
 * 서명은 인증된 메모리 세션의 정확한 계정으로만 수행되어야 한다.
 */

const TEST_ADDRESS = '0x1234567890123456789012345678901234567890';
const TO_ADDRESS = '0x0987654321098765432109876543210987654321';

const mockSendTransaction = jest.fn();
const mockSignMessage = jest.fn();
const mockSignTransaction = jest.fn();
const mockSignTypedData = jest.fn();
const mockGetAccount = jest.fn();

const mockAccount = {
  address: TEST_ADDRESS,
  signMessage: mockSignMessage,
  signTransaction: mockSignTransaction,
  signTypedData: mockSignTypedData,
};

jest.mock('../../src/services/signerVault', () => ({
  signerVault: {
    getAccount: (address: string) => mockGetAccount(address),
  },
}));

jest.mock('viem', () => ({
  createWalletClient: jest.fn(() => ({
    sendTransaction: (...args: unknown[]) => mockSendTransaction(...args),
  })),
  http: jest.fn(() => ({})),
}));

import { signingService } from '../../src/services/signingService';

describe('SigningService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccount.mockResolvedValue(mockAccount);
    mockSendTransaction.mockResolvedValue('0xmocktxhash');
    mockSignMessage.mockResolvedValue('0xmocksignature');
    mockSignTransaction.mockResolvedValue('0xmocksignedtx');
    mockSignTypedData.mockResolvedValue('0xmocktypedsignature');
  });

  it('rejects unsupported methods', async () => {
    await expect(
      signingService.handleRequest('unsupported_method', [], 1),
    ).rejects.toThrow('Unsupported method: unsupported_method');
  });

  it('uses the exact transaction from account', async () => {
    const result = await signingService.sendTransaction(
      { from: TEST_ADDRESS, to: TO_ADDRESS, value: '0x1' },
      1,
    );

    expect(result).toBe('0xmocktxhash');
    expect(mockGetAccount).toHaveBeenCalledWith(TEST_ADDRESS);
    expect(mockSendTransaction).toHaveBeenCalled();
  });

  it('does not sign while the signer vault is locked', async () => {
    mockGetAccount.mockRejectedValueOnce(new Error('Wallet is locked'));

    await expect(
      signingService.sendTransaction(
        { from: TEST_ADDRESS, to: TO_ADDRESS },
        1,
      ),
    ).rejects.toThrow('Wallet is locked');
  });

  it('rejects transactions without a from account', async () => {
    await expect(
      signingService.sendTransaction(
        { from: '', to: TO_ADDRESS },
        1,
      ),
    ).rejects.toThrow('Transaction account is required');
  });

  it('rejects unsupported chains', async () => {
    await expect(
      signingService.sendTransaction(
        { from: TEST_ADDRESS, to: TO_ADDRESS },
        99999,
      ),
    ).rejects.toThrow('Unsupported chain');
  });

  it('signs a transaction without broadcasting it', async () => {
    const result = await signingService.signTransaction(
      {
        from: TEST_ADDRESS,
        to: TO_ADDRESS,
        value: '0x1',
        gas: '0x5208',
        nonce: '0x2',
      },
      1,
    );

    expect(result).toBe('0xmocksignedtx');
    expect(mockGetAccount).toHaveBeenCalledWith(TEST_ADDRESS);
    expect(mockSignTransaction).toHaveBeenCalled();
  });

  it('preserves hexadecimal personal_sign messages as raw bytes', async () => {
    await signingService.personalSign('0x48656c6c6f', TEST_ADDRESS);

    expect(mockSignMessage).toHaveBeenCalledWith({
      message: { raw: '0x48656c6c6f' },
    });
  });

  it('disables eth_sign', async () => {
    await expect(
      signingService.ethSign('0x1234', TEST_ADDRESS),
    ).rejects.toThrow('eth_sign is disabled');
  });

  it('signs valid typed data with the requested account', async () => {
    const typedData = JSON.stringify({
      domain: { name: 'Test' },
      types: { EIP712Domain: [], Mail: [] },
      primaryType: 'Mail',
      message: { from: 'Alice' },
    });

    const result = await signingService.handleRequest(
      'eth_signTypedData_v4',
      [TEST_ADDRESS, typedData],
      1,
    );

    expect(result).toBe('0xmocktypedsignature');
    expect(mockGetAccount).toHaveBeenCalledWith(TEST_ADDRESS);
  });

  it('rejects malformed typed data', async () => {
    await expect(
      signingService.signTypedData('invalid json {{{', TEST_ADDRESS),
    ).rejects.toThrow('Invalid typed data format');
  });

  it.each([1, 11155111, 137, 42161, 10, 8453])(
    'supports chain %i',
    async chainId => {
      await expect(
        signingService.sendTransaction(
          { from: TEST_ADDRESS, to: TO_ADDRESS },
          chainId,
        ),
      ).resolves.toBe('0xmocktxhash');
    },
  );
});
