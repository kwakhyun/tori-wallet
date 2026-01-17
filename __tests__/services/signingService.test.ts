/**
 * 서명 서비스 테스트
 */

const TEST_ADDRESS = '0x1234567890123456789012345678901234567890';
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// walletService 모킹
const mockRetrieveMnemonic = jest.fn();

jest.mock('../../src/services/walletService', () => ({
  walletService: {
    retrieveMnemonic: () => mockRetrieveMnemonic(),
  },
}));

// viem 모킹
jest.mock('viem', () => ({
  createWalletClient: jest.fn().mockImplementation(() => ({
    sendTransaction: jest.fn().mockResolvedValue('0xmocktxhash'),
  })),
  http: jest.fn(() => ({})),
  hexToString: jest.fn().mockImplementation((hex: string) => {
    if (hex.startsWith('0x')) {
      return 'decoded message';
    }
    return hex;
  }),
}));

// viem/accounts 모킹
jest.mock('viem/accounts', () => ({
  privateKeyToAccount: jest.fn().mockImplementation(() => ({
    address: TEST_ADDRESS,
    signMessage: jest.fn().mockResolvedValue('0xmocksignature'),
    signTransaction: jest.fn().mockResolvedValue('0xmocksignedtx'),
    signTypedData: jest.fn().mockResolvedValue('0xmocktypedsignature'),
  })),
  mnemonicToAccount: jest.fn().mockImplementation(() => ({
    address: TEST_ADDRESS,
    getHdKey: () => ({
      privateKey: new Uint8Array(32).fill(1),
    }),
  })),
}));

import { signingService } from '../../src/services/signingService';

describe('SigningService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRetrieveMnemonic.mockResolvedValue(null);
  });

  describe('handleRequest', () => {
    it('should throw for unsupported method', async () => {
      await expect(
        signingService.handleRequest('unsupported_method', [], 1),
      ).rejects.toThrow('Unsupported method: unsupported_method');
    });

    it('should throw for unknown_method', async () => {
      await expect(
        signingService.handleRequest('unknown_method', [], 1),
      ).rejects.toThrow('Unsupported method: unknown_method');
    });

    describe('with authenticated wallet', () => {
      beforeEach(() => {
        mockRetrieveMnemonic.mockResolvedValue(TEST_MNEMONIC);
      });

      it('should handle eth_sendTransaction method', async () => {
        const txParams = {
          from: TEST_ADDRESS,
          to: '0x0987654321098765432109876543210987654321',
          value: '0x0',
        };

        const result = await signingService.handleRequest(
          'eth_sendTransaction',
          [txParams],
          1,
        );
        expect(result).toBe('0xmocktxhash');
      });

      it('should handle eth_signTransaction method', async () => {
        const txParams = {
          from: TEST_ADDRESS,
          to: '0x0987654321098765432109876543210987654321',
          value: '0x0',
        };

        const result = await signingService.handleRequest(
          'eth_signTransaction',
          [txParams],
          1,
        );
        expect(result).toBe('0xmocksignedtx');
      });

      it('should handle personal_sign method', async () => {
        const result = await signingService.handleRequest(
          'personal_sign',
          ['Hello World', TEST_ADDRESS],
          1,
        );
        expect(result).toBe('0xmocksignature');
      });

      it('should handle eth_sign method', async () => {
        const result = await signingService.handleRequest(
          'eth_sign',
          [TEST_ADDRESS, '0x1234'],
          1,
        );
        expect(result).toBe('0xmocksignature');
      });

      it('should handle eth_signTypedData method', async () => {
        const typedData = JSON.stringify({
          domain: {},
          types: { EIP712Domain: [] },
          primaryType: 'Mail',
          message: {},
        });

        const result = await signingService.handleRequest(
          'eth_signTypedData',
          [TEST_ADDRESS, typedData],
          1,
        );
        expect(result).toBe('0xmocktypedsignature');
      });

      it('should handle eth_signTypedData_v3 method', async () => {
        const typedData = JSON.stringify({
          domain: {},
          types: { EIP712Domain: [] },
          primaryType: 'Mail',
          message: {},
        });

        const result = await signingService.handleRequest(
          'eth_signTypedData_v3',
          [TEST_ADDRESS, typedData],
          1,
        );
        expect(result).toBe('0xmocktypedsignature');
      });

      it('should handle eth_signTypedData_v4 method', async () => {
        const typedData = JSON.stringify({
          domain: {},
          types: { EIP712Domain: [] },
          primaryType: 'Mail',
          message: {},
        });

        const result = await signingService.handleRequest(
          'eth_signTypedData_v4',
          [TEST_ADDRESS, typedData],
          1,
        );
        expect(result).toBe('0xmocktypedsignature');
      });
    });

    describe('without authenticated wallet', () => {
      it('should throw for eth_sendTransaction when not authenticated', async () => {
        const txParams = {
          from: TEST_ADDRESS,
          to: '0x0987654321098765432109876543210987654321',
          value: '0x0',
        };

        await expect(
          signingService.handleRequest('eth_sendTransaction', [txParams], 1),
        ).rejects.toThrow('Failed to retrieve mnemonic');
      });

      it('should throw for personal_sign when not authenticated', async () => {
        await expect(
          signingService.handleRequest(
            'personal_sign',
            ['Hello World', TEST_ADDRESS],
            1,
          ),
        ).rejects.toThrow('Failed to retrieve mnemonic');
      });
    });
  });

  describe('sendTransaction', () => {
    it('should throw error when wallet is not authenticated', async () => {
      const txParams = {
        from: TEST_ADDRESS,
        to: '0x0987654321098765432109876543210987654321',
        value: '0x0',
      };

      await expect(signingService.sendTransaction(txParams, 1)).rejects.toThrow(
        'Failed to retrieve mnemonic',
      );
    });

    describe('with authenticated wallet', () => {
      beforeEach(() => {
        mockRetrieveMnemonic.mockResolvedValue(TEST_MNEMONIC);
      });

      it('should send transaction with basic params', async () => {
        const txParams = {
          from: TEST_ADDRESS,
          to: '0x0987654321098765432109876543210987654321',
          value: '0x1',
        };

        const result = await signingService.sendTransaction(txParams, 1);
        expect(result).toBe('0xmocktxhash');
      });

      it('should send transaction with gas params', async () => {
        const txParams = {
          from: TEST_ADDRESS,
          to: '0x0987654321098765432109876543210987654321',
          value: '0x1',
          gas: '0x5208',
          gasPrice: '0x4a817c800',
        };

        const result = await signingService.sendTransaction(txParams, 1);
        expect(result).toBe('0xmocktxhash');
      });

      it('should send transaction with EIP-1559 params', async () => {
        const txParams = {
          from: TEST_ADDRESS,
          to: '0x0987654321098765432109876543210987654321',
          value: '0x1',
          maxFeePerGas: '0x4a817c800',
          maxPriorityFeePerGas: '0x3b9aca00',
        };

        const result = await signingService.sendTransaction(txParams, 1);
        expect(result).toBe('0xmocktxhash');
      });

      it('should send transaction with nonce', async () => {
        const txParams = {
          from: TEST_ADDRESS,
          to: '0x0987654321098765432109876543210987654321',
          value: '0x1',
          nonce: '0x1',
        };

        const result = await signingService.sendTransaction(txParams, 1);
        expect(result).toBe('0xmocktxhash');
      });

      it('should send transaction with data', async () => {
        const txParams = {
          from: TEST_ADDRESS,
          to: '0x0987654321098765432109876543210987654321',
          data: '0xa9059cbb0000000000000000000000001234567890123456789012345678901234567890',
        };

        const result = await signingService.sendTransaction(txParams, 1);
        expect(result).toBe('0xmocktxhash');
      });

      it('should throw for unsupported chain', async () => {
        const txParams = {
          from: TEST_ADDRESS,
          to: '0x0987654321098765432109876543210987654321',
          value: '0x0',
        };

        await expect(
          signingService.sendTransaction(txParams, 99999),
        ).rejects.toThrow('Unsupported chain');
      });
    });
  });

  describe('signTransaction', () => {
    it('should throw error when wallet is not authenticated', async () => {
      const txParams = {
        from: TEST_ADDRESS,
        to: '0x0987654321098765432109876543210987654321',
      };

      await expect(signingService.signTransaction(txParams, 1)).rejects.toThrow(
        'Failed to retrieve mnemonic',
      );
    });

    describe('with authenticated wallet', () => {
      beforeEach(() => {
        mockRetrieveMnemonic.mockResolvedValue(TEST_MNEMONIC);
      });

      it('should sign transaction with basic params', async () => {
        const txParams = {
          from: TEST_ADDRESS,
          to: '0x0987654321098765432109876543210987654321',
        };

        const result = await signingService.signTransaction(txParams, 1);
        expect(result).toBe('0xmocksignedtx');
      });

      it('should sign transaction with value and gas', async () => {
        const txParams = {
          from: TEST_ADDRESS,
          to: '0x0987654321098765432109876543210987654321',
          value: '0x1',
          gas: '0x5208',
          gasPrice: '0x4a817c800',
        };

        const result = await signingService.signTransaction(txParams, 1);
        expect(result).toBe('0xmocksignedtx');
      });

      it('should sign transaction with nonce', async () => {
        const txParams = {
          from: TEST_ADDRESS,
          to: '0x0987654321098765432109876543210987654321',
          nonce: '0x5',
        };

        const result = await signingService.signTransaction(txParams, 1);
        expect(result).toBe('0xmocksignedtx');
      });

      it('should throw for unsupported chain', async () => {
        const txParams = {
          from: TEST_ADDRESS,
          to: '0x0987654321098765432109876543210987654321',
        };

        await expect(
          signingService.signTransaction(txParams, 99999),
        ).rejects.toThrow('Unsupported chain');
      });
    });
  });

  describe('personalSign', () => {
    it('should throw error when wallet is not authenticated', async () => {
      await expect(
        signingService.personalSign('Hello World', TEST_ADDRESS),
      ).rejects.toThrow('Failed to retrieve mnemonic');
    });

    describe('with authenticated wallet', () => {
      beforeEach(() => {
        mockRetrieveMnemonic.mockResolvedValue(TEST_MNEMONIC);
      });

      it('should sign plain text message', async () => {
        const result = await signingService.personalSign(
          'Hello World',
          TEST_ADDRESS,
        );
        expect(result).toBe('0xmocksignature');
      });

      it('should sign hex message', async () => {
        const result = await signingService.personalSign(
          '0x48656c6c6f',
          TEST_ADDRESS,
        );
        expect(result).toBe('0xmocksignature');
      });
    });
  });

  describe('ethSign', () => {
    it('should throw error when wallet is not authenticated', async () => {
      await expect(
        signingService.ethSign('0x1234', TEST_ADDRESS),
      ).rejects.toThrow('Failed to retrieve mnemonic');
    });

    describe('with authenticated wallet', () => {
      beforeEach(() => {
        mockRetrieveMnemonic.mockResolvedValue(TEST_MNEMONIC);
      });

      it('should sign raw hash', async () => {
        const result = await signingService.ethSign('0x1234', TEST_ADDRESS);
        expect(result).toBe('0xmocksignature');
      });
    });
  });

  describe('signTypedData', () => {
    it('should throw error when wallet is not authenticated', async () => {
      const typedData = JSON.stringify({
        domain: {},
        types: { EIP712Domain: [] },
        primaryType: 'Mail',
        message: {},
      });

      await expect(
        signingService.signTypedData(typedData, TEST_ADDRESS),
      ).rejects.toThrow('Failed to retrieve mnemonic');
    });

    describe('with authenticated wallet', () => {
      beforeEach(() => {
        mockRetrieveMnemonic.mockResolvedValue(TEST_MNEMONIC);
      });

      it('should sign typed data from JSON string', async () => {
        const typedData = JSON.stringify({
          domain: { name: 'Test' },
          types: { EIP712Domain: [], Mail: [] },
          primaryType: 'Mail',
          message: { from: 'Alice', to: 'Bob' },
        });

        const result = await signingService.signTypedData(
          typedData,
          TEST_ADDRESS,
        );
        expect(result).toBe('0xmocktypedsignature');
      });

      it('should sign typed data from object', async () => {
        const typedData = {
          domain: { name: 'Test' },
          types: { EIP712Domain: [], Mail: [] },
          primaryType: 'Mail',
          message: { from: 'Alice', to: 'Bob' },
        };

        const result = await signingService.signTypedData(
          typedData,
          TEST_ADDRESS,
        );
        expect(result).toBe('0xmocktypedsignature');
      });

      it('should throw error for invalid typed data format', async () => {
        const invalidTypedData = 'invalid json {{{';

        await expect(
          signingService.signTypedData(invalidTypedData, TEST_ADDRESS),
        ).rejects.toThrow('Invalid typed data format');
      });
    });
  });

  describe('chain support', () => {
    beforeEach(() => {
      mockRetrieveMnemonic.mockResolvedValue(TEST_MNEMONIC);
    });

    const supportedChains = [1, 11155111, 137, 42161, 10, 8453];

    it.each(supportedChains)('should support chain %i', async chainId => {
      const txParams = {
        from: TEST_ADDRESS,
        to: '0x0987654321098765432109876543210987654321',
        value: '0x0',
      };

      const result = await signingService.sendTransaction(txParams, chainId);
      expect(result).toBe('0xmocktxhash');
    });
  });
});
