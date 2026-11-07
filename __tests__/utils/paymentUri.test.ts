/**
 * QR 코드 해석 (EIP-681) 테스트
 */

import {
  parseScannedCode,
  parseEip681Number,
  isAcceptedForMode,
  recipientOf,
} from '../../src/utils/paymentUri';

const RECIPIENT = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const TOKEN = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC

describe('parseEip681Number', () => {
  it.each([
    ['1', 1n],
    ['1000000', 1000000n],
    ['1e18', 10n ** 18n],
    ['2.014e18', 2014000000000000000n],
    ['1.5E6', 1500000n],
    ['+5', 5n],
    ['0.0', 0n],
  ])('parses %s', (input, expected) => {
    expect(parseEip681Number(input)).toBe(expected);
  });

  it.each(['1.5', '-1', 'abc', '', '1e', '1.0000001e6'])(
    'rejects %s',
    input => {
      expect(parseEip681Number(input)).toBeNull();
    },
  );
});

describe('parseScannedCode', () => {
  it('parses a plain checksummed address', () => {
    const result = parseScannedCode(RECIPIENT);
    expect(result).toEqual({
      kind: 'address',
      address: RECIPIENT,
      raw: RECIPIENT,
    });
  });

  it('normalizes a lowercase address to checksum form', () => {
    const result = parseScannedCode(RECIPIENT.toLowerCase());
    expect(recipientOf(result)).toBe(RECIPIENT);
  });

  it('rejects an address with a broken checksum', () => {
    const broken = RECIPIENT.replace('C', 'c').replace('d35', 'D35');
    const result = parseScannedCode(broken);
    expect(result.kind).toBe('invalid');
  });

  it('treats ethereum:<address> without params as a plain address', () => {
    const result = parseScannedCode(`ethereum:${RECIPIENT}`);
    expect(result.kind).toBe('address');
    expect(recipientOf(result)).toBe(RECIPIENT);
  });

  it('parses a native payment request with chain and value', () => {
    const result = parseScannedCode(`ethereum:${RECIPIENT}@137?value=2.5e17`);
    expect(result).toMatchObject({
      kind: 'payment',
      recipient: RECIPIENT,
      chainId: 137,
      amountRaw: 250000000000000000n,
    });
    expect(result.kind === 'payment' && result.tokenAddress).toBeFalsy();
  });

  it('uses the address parameter, not the token contract, as recipient for ERC-20 transfers', () => {
    const uri = `ethereum:${TOKEN}@1/transfer?address=${RECIPIENT}&uint256=1e6`;
    const result = parseScannedCode(uri);
    expect(result).toMatchObject({
      kind: 'payment',
      recipient: RECIPIENT,
      tokenAddress: TOKEN,
      chainId: 1,
      amountRaw: 1000000n,
    });
    expect(recipientOf(result)).not.toBe(TOKEN);
  });

  it('supports the pay- prefix', () => {
    const result = parseScannedCode(`ethereum:pay-${RECIPIENT}@1?value=1`);
    expect(result).toMatchObject({ kind: 'payment', recipient: RECIPIENT });
  });

  it('rejects token transfers without a recipient', () => {
    const result = parseScannedCode(`ethereum:${TOKEN}/transfer?uint256=1`);
    expect(result.kind).toBe('invalid');
  });

  it('rejects unsupported contract functions', () => {
    const result = parseScannedCode(
      `ethereum:${TOKEN}/approve?address=${RECIPIENT}&uint256=1`,
    );
    expect(result.kind).toBe('invalid');
  });

  it('rejects ENS targets with a helpful message', () => {
    const result = parseScannedCode('ethereum:vitalik.eth?value=1');
    expect(result.kind).toBe('invalid');
    expect(result.kind === 'invalid' && result.reason).toContain('ENS');
  });

  it('recognizes WalletConnect v2 URIs', () => {
    const uri = 'wc:abc123@2?relay-protocol=irn&symKey=deadbeef';
    expect(parseScannedCode(uri)).toEqual({
      kind: 'walletconnect',
      uri,
      raw: uri,
    });
  });

  it('rejects WalletConnect v1 URIs', () => {
    expect(parseScannedCode('wc:abc@1?bridge=x&key=y').kind).toBe('invalid');
  });

  it('rejects arbitrary text', () => {
    expect(parseScannedCode('https://example.com').kind).toBe('invalid');
  });
});

describe('isAcceptedForMode', () => {
  const address = parseScannedCode(RECIPIENT);
  const wc = parseScannedCode('wc:abc@2?relay-protocol=irn&symKey=1');

  it('accepts addresses only in address mode', () => {
    expect(isAcceptedForMode(address, 'address')).toBe(true);
    expect(isAcceptedForMode(wc, 'address')).toBe(false);
  });

  it('accepts WalletConnect only in walletconnect mode', () => {
    expect(isAcceptedForMode(wc, 'walletconnect')).toBe(true);
    expect(isAcceptedForMode(address, 'walletconnect')).toBe(false);
  });

  it('never accepts invalid results', () => {
    expect(isAcceptedForMode(parseScannedCode('nope'), 'any')).toBe(false);
  });
});
