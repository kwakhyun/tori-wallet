/**
 * PIN 기반 지갑 암호화 유틸리티.
 *
 * v2는 scrypt로 암호화 키와 MAC 키를 분리 파생한 뒤 AES-256-CBC와
 * HMAC-SHA256(Encrypt-then-MAC)을 사용한다. v1/AES 및 XOR 포맷은 기존
 * 사용자의 PIN 해제 후 v2로 마이그레이션하기 위한 읽기 전용 경로다.
 */

import CryptoJS from 'crypto-js';
import { scryptAsync } from '@noble/hashes/scrypt';
import { Buffer } from './polyfills';
import { secureRandomBytes } from './secureRandom';

const CURRENT_VERSION = 2;
const SCRYPT_N = 2 ** 16;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const DERIVED_KEY_BYTES = 64;
const SALT_SIZE = 16;

const LEGACY_PBKDF2_ITERATIONS = 10000;
const OLDER_LEGACY_PBKDF2_ITERATIONS = 100000;
const LEGACY_KEY_SIZE = 256 / 32;

interface EncryptedDataV2 {
  ciphertext: string;
  salt: string;
  iv: string;
  mac: string;
  version: 2;
  kdf: 'scrypt';
  n: number;
  r: number;
  p: number;
}

interface EncryptedDataV1 {
  ciphertext: string;
  salt: string;
  iv: string;
  version: 1;
  iterations?: number;
}

function randomBytes(size: number): CryptoJS.lib.WordArray {
  const bytes = secureRandomBytes(size);
  try {
    return bytesToWordArray(bytes);
  } finally {
    bytes.fill(0);
  }
}

function bytesToWordArray(bytes: Uint8Array): CryptoJS.lib.WordArray {
  return CryptoJS.enc.Hex.parse(Buffer.from(bytes).toString('hex'));
}

async function deriveKeys(
  pin: string,
  saltBase64: string,
  params: Pick<EncryptedDataV2, 'n' | 'r' | 'p'>,
): Promise<{
  encryptionKey: CryptoJS.lib.WordArray;
  macKey: CryptoJS.lib.WordArray;
}> {
  const derived = await scryptAsync(
    new Uint8Array(Buffer.from(pin, 'utf8')),
    new Uint8Array(Buffer.from(saltBase64, 'base64')),
    {
      N: params.n,
      r: params.r,
      p: params.p,
      dkLen: DERIVED_KEY_BYTES,
      asyncTick: 10,
    },
  );

  return {
    encryptionKey: bytesToWordArray(derived.slice(0, 32)),
    macKey: bytesToWordArray(derived.slice(32)),
  };
}

function buildMacInput(data: Omit<EncryptedDataV2, 'mac'>): string {
  return [
    data.version,
    data.kdf,
    data.n,
    data.r,
    data.p,
    data.salt,
    data.iv,
    data.ciphertext,
  ].join(':');
}

function constantTimeEqual(leftBase64: string, rightBase64: string): boolean {
  const left = Buffer.from(leftBase64, 'base64');
  const right = Buffer.from(rightBase64, 'base64');
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    // eslint-disable-next-line no-bitwise
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

export async function encrypt(plaintext: string, pin: string): Promise<string> {
  const salt = randomBytes(SALT_SIZE).toString(CryptoJS.enc.Base64);
  const iv = randomBytes(16);
  const baseData: Omit<EncryptedDataV2, 'mac' | 'ciphertext'> = {
    version: CURRENT_VERSION,
    kdf: 'scrypt',
    n: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    salt,
    iv: iv.toString(CryptoJS.enc.Base64),
  };
  const { encryptionKey, macKey } = await deriveKeys(pin, salt, baseData);

  const encrypted = CryptoJS.AES.encrypt(plaintext, encryptionKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  const dataWithoutMac: Omit<EncryptedDataV2, 'mac'> = {
    ...baseData,
    ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
  };
  const mac = CryptoJS.HmacSHA256(
    buildMacInput(dataWithoutMac),
    macKey,
  ).toString(CryptoJS.enc.Base64);

  return JSON.stringify({ ...dataWithoutMac, mac });
}

async function decryptV2(
  data: EncryptedDataV2,
  pin: string,
): Promise<string | null> {
  if (
    data.kdf !== 'scrypt' ||
    data.n !== SCRYPT_N ||
    data.r !== SCRYPT_R ||
    data.p !== SCRYPT_P
  ) {
    return null;
  }

  const { encryptionKey, macKey } = await deriveKeys(pin, data.salt, data);
  const expectedMac = CryptoJS.HmacSHA256(
    buildMacInput({
      version: data.version,
      kdf: data.kdf,
      n: data.n,
      r: data.r,
      p: data.p,
      salt: data.salt,
      iv: data.iv,
      ciphertext: data.ciphertext,
    }),
    macKey,
  ).toString(CryptoJS.enc.Base64);

  if (!constantTimeEqual(data.mac, expectedMac)) return null;

  try {
    const decrypted = CryptoJS.AES.decrypt(
      CryptoJS.lib.CipherParams.create({
        ciphertext: CryptoJS.enc.Base64.parse(data.ciphertext),
      }),
      encryptionKey,
      {
        iv: CryptoJS.enc.Base64.parse(data.iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      },
    );
    return decrypted.toString(CryptoJS.enc.Utf8) || null;
  } catch {
    return null;
  }
}

function deriveLegacyKey(
  pin: string,
  salt: CryptoJS.lib.WordArray,
  iterations: number,
): CryptoJS.lib.WordArray {
  return CryptoJS.PBKDF2(pin, salt, {
    keySize: LEGACY_KEY_SIZE,
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });
}

function decryptV1(data: EncryptedDataV1, pin: string): string | null {
  try {
    const salt = CryptoJS.enc.Base64.parse(data.salt);
    const iv = CryptoJS.enc.Base64.parse(data.iv);
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(data.ciphertext),
    });
    const iterationCandidates = data.iterations
      ? [data.iterations]
      : [LEGACY_PBKDF2_ITERATIONS, OLDER_LEGACY_PBKDF2_ITERATIONS];

    for (const iterations of iterationCandidates) {
      const result = CryptoJS.AES.decrypt(
        cipherParams,
        deriveLegacyKey(pin, salt, iterations),
        { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 },
      ).toString(CryptoJS.enc.Utf8);
      if (result) return result;
    }
    return null;
  } catch {
    return null;
  }
}

export async function decrypt(
  encryptedValue: string,
  pin: string,
): Promise<string | null> {
  try {
    const parsed = JSON.parse(encryptedValue) as
      | EncryptedDataV2
      | EncryptedDataV1;
    if (parsed.version === CURRENT_VERSION) return decryptV2(parsed, pin);
    if (parsed.version === 1) return decryptV1(parsed, pin);
    return null;
  } catch {
    return decryptLegacyXor(encryptedValue, pin);
  }
}

/** @deprecated 기존 XOR 데이터의 PIN 마이그레이션에만 사용한다. */
function decryptLegacyXor(encrypted: string, pin: string): string | null {
  try {
    const encryptedBuffer = Buffer.from(encrypted, 'base64');
    const pinBuffer = Buffer.from(pin.repeat(encryptedBuffer.length));
    const decrypted = Buffer.alloc(encryptedBuffer.length);

    for (let index = 0; index < encryptedBuffer.length; index += 1) {
      // eslint-disable-next-line no-bitwise
      decrypted[index] = encryptedBuffer[index]! ^ pinBuffer[index]!;
    }

    const result = decrypted.toString('utf8');
    const words = result.trim().split(/\s+/);
    return words.length >= 12 && words.every(word => /^[a-z]+$/.test(word))
      ? result
      : null;
  } catch {
    return null;
  }
}

export function isNewEncryptionFormat(encrypted: string): boolean {
  try {
    return (
      (JSON.parse(encrypted) as { version?: number }).version ===
      CURRENT_VERSION
    );
  } catch {
    return false;
  }
}
