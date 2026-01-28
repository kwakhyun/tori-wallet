/**
 * 암호화 유틸리티 (AES-256 기반)
 */

import CryptoJS from 'crypto-js';
import { Buffer } from './polyfills';

/**
 * PBKDF2 iterations 설정
 * - 모바일 환경에서 적절한 보안과 성능 균형
 * - 10,000: OWASP 모바일 권장 최소값
 * - 너무 높으면 PIN 입력 시 UX가 나빠짐
 */
const PBKDF2_ITERATIONS = 10000;
const LEGACY_PBKDF2_ITERATIONS = 100000; // 기존 암호화 데이터 호환용
const KEY_SIZE = 256 / 32;
const SALT_SIZE = 128 / 8;

interface EncryptedData {
  ciphertext: string;
  salt: string;
  iv: string;
  version: number;
  iterations?: number; // v1.1부터 추가
}

function randomBytes(size: number): CryptoJS.lib.WordArray {
  return CryptoJS.lib.WordArray.random(size);
}

function deriveKey(
  pin: string,
  salt: CryptoJS.lib.WordArray,
  iterations: number = PBKDF2_ITERATIONS,
): CryptoJS.lib.WordArray {
  return CryptoJS.PBKDF2(pin, salt, {
    keySize: KEY_SIZE,
    iterations: iterations,
    hasher: CryptoJS.algo.SHA256,
  });
}

export function encrypt(plaintext: string, pin: string): string {
  const salt = randomBytes(SALT_SIZE);
  const iv = randomBytes(16);
  const key = deriveKey(pin, salt);

  const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const encryptedData: EncryptedData = {
    ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
    salt: salt.toString(CryptoJS.enc.Base64),
    iv: iv.toString(CryptoJS.enc.Base64),
    version: 1,
    iterations: PBKDF2_ITERATIONS,
  };

  return JSON.stringify(encryptedData);
}

export function decrypt(encryptedJson: string, pin: string): string | null {
  try {
    const encryptedData: EncryptedData = JSON.parse(encryptedJson);

    if (encryptedData.version !== 1) {
      return decryptLegacy(encryptedJson, pin);
    }

    const salt = CryptoJS.enc.Base64.parse(encryptedData.salt);
    const iv = CryptoJS.enc.Base64.parse(encryptedData.iv);
    const ciphertext = CryptoJS.enc.Base64.parse(encryptedData.ciphertext);

    // 저장된 iterations 사용, 없으면 현재 기본값 시도
    const iterations = encryptedData.iterations || PBKDF2_ITERATIONS;
    const key = deriveKey(pin, salt, iterations);

    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: ciphertext,
    });

    const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    const result = decrypted.toString(CryptoJS.enc.Utf8);

    // 복호화 성공 여부 확인
    if (result && result.length > 0) {
      return result;
    }

    // iterations가 저장되지 않은 기존 데이터의 경우, 레거시 iterations(100,000)로 재시도
    if (!encryptedData.iterations) {
      const legacyKey = deriveKey(pin, salt, LEGACY_PBKDF2_ITERATIONS);
      const legacyDecrypted = CryptoJS.AES.decrypt(cipherParams, legacyKey, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });
      const legacyResult = legacyDecrypted.toString(CryptoJS.enc.Utf8);
      if (legacyResult && legacyResult.length > 0) {
        return legacyResult;
      }
    }

    return null;
  } catch {
    return decryptLegacy(encryptedJson, pin);
  }
}

/**
 * 레거시 XOR 암호화 데이터 복호화 (마이그레이션 지원)
 * @deprecated 기존 사용자 데이터 마이그레이션용으로만 사용
 */
function decryptLegacy(encrypted: string, pin: string): string | null {
  try {
    const encryptedBuffer = Buffer.from(encrypted, 'base64');
    const pinBuffer = Buffer.from(pin.repeat(encryptedBuffer.length));
    const decrypted = Buffer.alloc(encryptedBuffer.length);

    /* eslint-disable no-bitwise */
    for (let i = 0; i < encryptedBuffer.length; i++) {
      decrypted[i] = encryptedBuffer[i]! ^ pinBuffer[i]!;
    }
    /* eslint-enable no-bitwise */

    const result = decrypted.toString('utf8');

    const words = result.trim().split(/\s+/);
    if (words.length >= 12 && words.every(word => /^[a-z]+$/.test(word))) {
      return result;
    }

    return null;
  } catch {
    return null;
  }
}

export function isNewEncryptionFormat(encrypted: string): boolean {
  try {
    const data = JSON.parse(encrypted);
    return typeof data.version === 'number' && data.version >= 1;
  } catch {
    return false;
  }
}
