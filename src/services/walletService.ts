/**
 * Tori Wallet - Wallet Service
 * 니모닉/키 관리 (보안 저장소 분리)
 */

import { Buffer } from '../utils/polyfills';
import * as Keychain from 'react-native-keychain';
import EncryptedStorage from 'react-native-encrypted-storage';
import { generateMnemonic, english, mnemonicToAccount } from 'viem/accounts';
import type { HDAccount } from 'viem/accounts';
import { createLogger } from '@/utils/logger';

const logger = createLogger('Wallet');

const MNEMONIC_STORAGE_KEY = 'tori_wallet_mnemonic';
const ACCOUNTS_STORAGE_KEY = 'tori_wallet_accounts';

export interface StoredAccount {
  address: string;
  derivationPath: string;
  name: string;
}

class WalletService {
  /**
   * 새로운 니모닉 생성 (12 또는 24 단어)
   */
  generateMnemonic(wordCount: 12 | 24 = 12): string {
    // 12 words = 128 bits, 24 words = 256 bits
    const strength = wordCount === 24 ? 256 : 128;
    return generateMnemonic(english, strength);
  }

  /**
   * 니모닉 유효성 검증
   */
  validateMnemonic(mnemonic: string): boolean {
    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      return false;
    }

    // 모든 단어가 BIP-39 영어 단어 목록에 있는지 확인
    return words.every(word => english.includes(word));
  }

  /**
   * 니모닉에서 계정 파생
   */
  deriveAccount(mnemonic: string, index: number = 0): HDAccount {
    const path = `m/44'/60'/0'/0/${index}` as const;
    return mnemonicToAccount(mnemonic, { path });
  }

  /**
   * 니모닉을 암호화하여 안전하게 저장
   */
  async storeMnemonic(mnemonic: string, pin: string): Promise<void> {
    try {
      // Keychain에 니모닉 저장
      // 시뮬레이터 호환성을 위해 생체인증 없이 저장 (실제 앱에서는 생체인증 사용 권장)
      await Keychain.setGenericPassword(MNEMONIC_STORAGE_KEY, mnemonic, {
        service: MNEMONIC_STORAGE_KEY,
        // 시뮬레이터에서는 생체인증이 없을 수 있으므로 옵션 제거
        // 실제 배포 시에는 아래 주석 해제:
        // accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
      });

      // 암호화된 저장소에 백업 (PIN 암호화)
      const encrypted = this.encryptWithPin(mnemonic, pin);
      await EncryptedStorage.setItem(MNEMONIC_STORAGE_KEY, encrypted);
    } catch (error) {
      logger.error('Failed to store mnemonic:', error);
      throw new Error('니모닉 저장에 실패했습니다.');
    }
  }

  /**
   * 저장된 니모닉 불러오기 (생체인증 요청)
   */
  async retrieveMnemonic(): Promise<string | null> {
    try {
      // 먼저 생체인증 없이 시도 (시뮬레이터 호환)
      const credentials = await Keychain.getGenericPassword({
        service: MNEMONIC_STORAGE_KEY,
      });

      if (credentials) {
        return credentials.password;
      }

      // Keychain에 없으면 생체인증으로 다시 시도
      const credentialsWithAuth = await Keychain.getGenericPassword({
        service: MNEMONIC_STORAGE_KEY,
        authenticationPrompt: {
          title: 'Tori Wallet',
          subtitle: '지갑에 접근하려면 인증이 필요합니다',
        },
      });

      if (credentialsWithAuth) {
        return credentialsWithAuth.password;
      }

      return null;
    } catch (error) {
      logger.error('Failed to retrieve mnemonic with biometric:', error);
      // 생체인증 실패 시 인증 없이 다시 시도
      return this.retrieveMnemonicWithoutAuth();
    }
  }

  /**
   * 저장된 니모닉 불러오기 (인증 없이 - 개발/테스트용)
   */
  async retrieveMnemonicWithoutAuth(): Promise<string | null> {
    try {
      // Keychain에서 인증 없이 가져오기 시도
      const credentials = await Keychain.getGenericPassword({
        service: MNEMONIC_STORAGE_KEY,
      });

      if (credentials) {
        return credentials.password;
      }

      // Keychain에 없으면 EncryptedStorage에서 시도
      // 참고: EncryptedStorage의 데이터는 PIN으로 암호화되어 있으므로
      // 인증 없이는 복호화할 수 없음 (보안 정책)
      const encrypted = await EncryptedStorage.getItem(MNEMONIC_STORAGE_KEY);
      if (encrypted) {
        // PIN 없이는 복호화 불가 - 사용자에게 PIN 입력 요청 필요
        logger.debug('Encrypted mnemonic found, PIN required for decryption');
      }

      return null;
    } catch (error) {
      logger.error('Failed to retrieve mnemonic without auth:', error);
      return null;
    }
  }

  /**
   * PIN으로 니모닉 복호화
   */
  async retrieveMnemonicWithPin(pin: string): Promise<string | null> {
    try {
      const encrypted = await EncryptedStorage.getItem(MNEMONIC_STORAGE_KEY);
      if (!encrypted) {
        return null;
      }
      return this.decryptWithPin(encrypted, pin);
    } catch (error) {
      logger.error('Failed to decrypt mnemonic:', error);
      return null;
    }
  }

  /**
   * 생체인증 지원 여부 확인
   */
  async isBiometricSupported(): Promise<boolean> {
    try {
      const biometryType = await Keychain.getSupportedBiometryType();
      return biometryType !== null;
    } catch {
      return false;
    }
  }

  /**
   * 계정 목록 저장
   */
  async storeAccounts(accounts: StoredAccount[]): Promise<void> {
    try {
      await EncryptedStorage.setItem(
        ACCOUNTS_STORAGE_KEY,
        JSON.stringify(accounts),
      );
    } catch (error) {
      logger.error('Failed to store accounts:', error);
    }
  }

  /**
   * 계정 목록 불러오기
   */
  async retrieveAccounts(): Promise<StoredAccount[]> {
    try {
      const data = await EncryptedStorage.getItem(ACCOUNTS_STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
      return [];
    } catch (error) {
      logger.error('Failed to retrieve accounts:', error);
      return [];
    }
  }

  /**
   * 모든 지갑 데이터 삭제
   */
  async clearAll(): Promise<void> {
    try {
      await Keychain.resetGenericPassword({ service: MNEMONIC_STORAGE_KEY });
      await EncryptedStorage.removeItem(MNEMONIC_STORAGE_KEY);
      await EncryptedStorage.removeItem(ACCOUNTS_STORAGE_KEY);
    } catch (error) {
      logger.error('Failed to clear wallet data:', error);
    }
  }

  // 간단한 PIN 기반 암호화 (실제 서비스에서는 더 강력한 암호화 사용 권장)
  /* eslint-disable no-bitwise */
  private encryptWithPin(data: string, pin: string): string {
    // XOR 기반 간단한 암호화 (데모용)
    const pinBuffer = Buffer.from(pin.repeat(data.length));
    const dataBuffer = Buffer.from(data);
    const encrypted = Buffer.alloc(data.length);

    for (let i = 0; i < data.length; i++) {
      encrypted[i] = dataBuffer[i]! ^ pinBuffer[i]!;
    }

    return encrypted.toString('base64');
  }

  private decryptWithPin(encrypted: string, pin: string): string {
    const encryptedBuffer = Buffer.from(encrypted, 'base64');
    const pinBuffer = Buffer.from(pin.repeat(encryptedBuffer.length));
    const decrypted = Buffer.alloc(encryptedBuffer.length);

    for (let i = 0; i < encryptedBuffer.length; i++) {
      decrypted[i] = encryptedBuffer[i]! ^ pinBuffer[i]!;
    }

    return decrypted.toString();
  }
  /* eslint-enable no-bitwise */
}

export const walletService = new WalletService();
