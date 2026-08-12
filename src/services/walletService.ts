/** 니모닉/계정 저장과 기기 인증 정책을 관리한다. */

import { Platform } from 'react-native';
import * as Keychain from 'react-native-keychain';
import EncryptedStorage from 'react-native-encrypted-storage';
import { mnemonicToAccount } from 'viem/accounts';
import type { HDAccount } from 'viem/accounts';
import {
  entropyToMnemonic,
  validateMnemonic as validateBip39Mnemonic,
} from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english';
import { createLogger } from '@/utils/logger';
import { decrypt, encrypt, isNewEncryptionFormat } from '@/utils/crypto';
import {
  SecureRandomGenerator,
  secureRandomGenerator,
} from '@/utils/secureRandom';

const logger = createLogger('Wallet');

const MNEMONIC_STORAGE_KEY = 'tori_wallet_mnemonic';
const ACCOUNTS_STORAGE_KEY = 'tori_wallet_accounts';
export const BIOMETRIC_ENABLED_KEY = 'tori_biometric_enabled';
const VAULT_VERSION_KEY = 'tori_wallet_vault_version';
const VAULT_VERSION = '2';

export interface StoredAccount {
  address: string;
  derivationPath: string;
  name: string;
}

export class WalletService {
  private initializationPromise: Promise<void> | null = null;

  constructor(
    private readonly randomGenerator: SecureRandomGenerator = secureRandomGenerator,
  ) {}

  generateMnemonic(wordCount: 12 | 24 = 12): string {
    const entropy = this.randomGenerator.bytes(wordCount === 24 ? 32 : 16);
    try {
      const mnemonic = entropyToMnemonic(entropy, englishWordlist);
      if (!validateBip39Mnemonic(mnemonic, englishWordlist)) {
        throw new Error('Generated mnemonic checksum is invalid');
      }
      return mnemonic;
    } finally {
      entropy.fill(0);
    }
  }

  validateMnemonic(mnemonic: string): boolean {
    const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
    const wordCount = normalized.split(' ').length;
    return (
      (wordCount === 12 || wordCount === 24) &&
      validateBip39Mnemonic(normalized, englishWordlist)
    );
  }

  deriveAccount(mnemonic: string, index: number = 0): HDAccount {
    return this.deriveAccountAtPath(mnemonic, `m/44'/60'/0'/0/${index}`);
  }

  deriveAccountAtPath(mnemonic: string, derivationPath: string): HDAccount {
    if (!/^m\/44'\/60'\/.+/.test(derivationPath)) {
      throw new Error('Unsupported derivation path');
    }
    return mnemonicToAccount(mnemonic, {
      path: derivationPath as `m/44'/60'/${string}`,
    });
  }

  /** 기존 무인증 Keychain 자격 증명을 최초 1회 제거한다. */
  async initializeSecureStorage(): Promise<void> {
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = (async () => {
      const version = await EncryptedStorage.getItem(VAULT_VERSION_KEY);
      if (version === VAULT_VERSION) return;

      await Keychain.resetGenericPassword({ service: MNEMONIC_STORAGE_KEY });
      await EncryptedStorage.setItem(BIOMETRIC_ENABLED_KEY, 'false');
      await EncryptedStorage.setItem(VAULT_VERSION_KEY, VAULT_VERSION);
      logger.info('Legacy keychain credential removed');
    })().catch(error => {
      this.initializationPromise = null;
      throw error;
    });

    return this.initializationPromise;
  }

  /** PIN 암호화본만 저장한다. 생체인증 사본은 명시적 활성화 시 별도 저장한다. */
  async storeMnemonic(mnemonic: string, pin: string): Promise<void> {
    try {
      await this.initializeSecureStorage();
      const encrypted = await encrypt(mnemonic, pin);
      await EncryptedStorage.setItem(MNEMONIC_STORAGE_KEY, encrypted);
    } catch (error) {
      logger.error('Failed to store mnemonic:', error);
      throw new Error('니모닉 저장에 실패했습니다.');
    }
  }

  /** 생체정보로 보호된 Keychain 항목만 조회한다. 실패 시 PIN 경로로 폴백하지 않는다. */
  async retrieveMnemonic(): Promise<string | null> {
    try {
      await this.initializeSecureStorage();
      if (!(await this.isBiometricEnabled())) return null;

      const credentials = await Keychain.getGenericPassword({
        service: MNEMONIC_STORAGE_KEY,
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
        authenticationPrompt: {
          title: 'Tori Wallet',
          subtitle: '지갑에 접근하려면 생체인증이 필요합니다',
          cancel: '취소',
        },
      });
      return credentials ? credentials.password : null;
    } catch (error) {
      logger.warn('Biometric mnemonic retrieval failed', error);
      return null;
    }
  }

  /** @deprecated 민감정보의 무인증 조회는 지원하지 않는다. */
  async retrieveMnemonicWithoutAuth(): Promise<null> {
    return null;
  }

  async retrieveMnemonicWithPin(pin: string): Promise<string | null> {
    try {
      await this.initializeSecureStorage();
      const encrypted = await EncryptedStorage.getItem(MNEMONIC_STORAGE_KEY);
      if (!encrypted) return null;

      const mnemonic = await decrypt(encrypted, pin);
      if (!mnemonic || !this.validateMnemonic(mnemonic)) return null;

      if (!isNewEncryptionFormat(encrypted)) {
        await EncryptedStorage.setItem(
          MNEMONIC_STORAGE_KEY,
          await encrypt(mnemonic, pin),
        );
        logger.info('Mnemonic encryption migrated to vault v2');
      }
      return mnemonic;
    } catch (error) {
      logger.warn('Failed to decrypt mnemonic', error);
      return null;
    }
  }

  async enableBiometric(mnemonic: string): Promise<void> {
    await this.initializeSecureStorage();
    if (!(await this.isBiometricSupported())) {
      throw new Error('Biometric authentication is not available');
    }

    const securityLevel =
      Platform.OS === 'android'
        ? Keychain.SECURITY_LEVEL.SECURE_HARDWARE
        : undefined;
    const stored = await Keychain.setGenericPassword(
      MNEMONIC_STORAGE_KEY,
      mnemonic,
      {
        service: MNEMONIC_STORAGE_KEY,
        accessible: Keychain.ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
        securityLevel,
        cloudSync: false,
      },
    );
    if (!stored) throw new Error('Failed to secure biometric credential');
    await EncryptedStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
  }

  async disableBiometric(): Promise<void> {
    await Keychain.resetGenericPassword({ service: MNEMONIC_STORAGE_KEY });
    await EncryptedStorage.setItem(BIOMETRIC_ENABLED_KEY, 'false');
  }

  async isBiometricEnabled(): Promise<boolean> {
    return (
      (await EncryptedStorage.getItem(BIOMETRIC_ENABLED_KEY)) === 'true' &&
      (await Keychain.hasGenericPassword({ service: MNEMONIC_STORAGE_KEY }))
    );
  }

  async isBiometricSupported(): Promise<boolean> {
    try {
      return (await Keychain.getSupportedBiometryType()) !== null;
    } catch {
      return false;
    }
  }

  async storeAccounts(accounts: StoredAccount[]): Promise<void> {
    try {
      await EncryptedStorage.setItem(
        ACCOUNTS_STORAGE_KEY,
        JSON.stringify(accounts),
      );
    } catch (error) {
      logger.error('Failed to store accounts:', error);
      throw new Error('계정 정보 저장에 실패했습니다.');
    }
  }

  async retrieveAccounts(): Promise<StoredAccount[]> {
    const data = await EncryptedStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!data) return [];
    const accounts = JSON.parse(data) as StoredAccount[];
    if (!Array.isArray(accounts)) throw new Error('Invalid account storage');
    return accounts;
  }

  /** 모든 보안 저장소 삭제를 끝까지 시도하고 일부 실패도 호출자에게 알린다. */
  async clearAll(): Promise<void> {
    const results = await Promise.allSettled([
      Keychain.resetGenericPassword({ service: MNEMONIC_STORAGE_KEY }),
      EncryptedStorage.removeItem(MNEMONIC_STORAGE_KEY),
      EncryptedStorage.removeItem(ACCOUNTS_STORAGE_KEY),
      EncryptedStorage.removeItem(BIOMETRIC_ENABLED_KEY),
      EncryptedStorage.removeItem(VAULT_VERSION_KEY),
    ]);
    this.initializationPromise = null;

    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length > 0) {
      logger.error('Failed to clear all wallet data', failures);
      throw new Error('일부 지갑 데이터를 삭제하지 못했습니다.');
    }
  }
}

export const walletService = new WalletService();
