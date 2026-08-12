import CryptoJS from 'crypto-js';
import { Buffer } from '../../src/utils/polyfills';
import {
  decrypt,
  encrypt,
  isNewEncryptionFormat,
} from '../../src/utils/crypto';

const PIN = '123456';
const PLAINTEXT =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function legacyV1(
  plaintext: string,
  pin: string,
  includeIterations: boolean,
): string {
  const salt = CryptoJS.enc.Hex.parse('00112233445566778899aabbccddeeff');
  const iv = CryptoJS.enc.Hex.parse('ffeeddccbbaa99887766554433221100');
  const key = CryptoJS.PBKDF2(pin, salt, {
    keySize: 256 / 32,
    iterations: 10000,
    hasher: CryptoJS.algo.SHA256,
  });
  const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return JSON.stringify({
    version: 1,
    salt: salt.toString(CryptoJS.enc.Base64),
    iv: iv.toString(CryptoJS.enc.Base64),
    ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
    ...(includeIterations ? { iterations: 10000 } : {}),
  });
}

function legacyXor(plaintext: string, pin: string): string {
  const source = Buffer.from(plaintext, 'utf8');
  const pinBytes = Buffer.from(pin.repeat(source.length));
  const encrypted = Buffer.alloc(source.length);
  for (let index = 0; index < source.length; index += 1) {
    // eslint-disable-next-line no-bitwise
    encrypted[index] = source[index]! ^ pinBytes[index]!;
  }
  return encrypted.toString('base64');
}

describe('crypto vault format', () => {
  let encryptedV2: string;

  beforeAll(async () => {
    encryptedV2 = await encrypt(PLAINTEXT, PIN);
  });

  it('round-trips authenticated v2 ciphertext and rejects a wrong PIN', async () => {
    await expect(decrypt(encryptedV2, PIN)).resolves.toBe(PLAINTEXT);
    await expect(decrypt(encryptedV2, '654321')).resolves.toBeNull();
    expect(isNewEncryptionFormat(encryptedV2)).toBe(true);
  });

  it.each([
    ['kdf', 'pbkdf2'],
    ['n', 2 ** 15],
    ['r', 4],
    ['p', 2],
  ])('rejects unsupported v2 %s parameters before decryption', async (key, value) => {
    const parsed = JSON.parse(encryptedV2) as Record<string, unknown>;
    parsed[key] = value;

    await expect(decrypt(JSON.stringify(parsed), PIN)).resolves.toBeNull();
  });

  it('rejects a malformed MAC length', async () => {
    const parsed = JSON.parse(encryptedV2) as Record<string, unknown>;
    parsed.mac = '';

    await expect(decrypt(JSON.stringify(parsed), PIN)).resolves.toBeNull();
  });

  it('reads both explicit and historical v1 PBKDF2 iteration formats', async () => {
    await expect(decrypt(legacyV1(PLAINTEXT, PIN, true), PIN)).resolves.toBe(
      PLAINTEXT,
    );
    await expect(decrypt(legacyV1(PLAINTEXT, PIN, false), PIN)).resolves.toBe(
      PLAINTEXT,
    );
    await expect(
      decrypt(legacyV1(PLAINTEXT, PIN, true), '000000'),
    ).resolves.toBeNull();
  });

  it('reads only mnemonic-shaped legacy XOR values', async () => {
    await expect(decrypt(legacyXor(PLAINTEXT, PIN), PIN)).resolves.toBe(
      PLAINTEXT,
    );
    await expect(
      decrypt(legacyXor('not a mnemonic', PIN), PIN),
    ).resolves.toBeNull();
  });

  it('rejects unknown structured versions and malformed format checks', async () => {
    await expect(decrypt(JSON.stringify({ version: 99 }), PIN)).resolves.toBeNull();
    expect(isNewEncryptionFormat('{invalid')).toBe(false);
  });
});
