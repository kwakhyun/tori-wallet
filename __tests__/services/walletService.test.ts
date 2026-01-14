/**
 * Tori Wallet - Wallet Service Tests
 * 지갑 서비스 핵심 기능 테스트
 */

import { walletService } from '../../src/services/walletService';

// Mock react-native-keychain
jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn().mockResolvedValue(true),
  getGenericPassword: jest.fn().mockResolvedValue({
    username: 'tori_wallet_mnemonic',
    password: 'test mnemonic phrase',
  }),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
  getSupportedBiometryType: jest.fn().mockResolvedValue('FaceID'),
  ACCESS_CONTROL: {
    BIOMETRY_ANY: 'BIOMETRY_ANY',
    BIOMETRY_ANY_OR_DEVICE_PASSCODE: 'BIOMETRY_ANY_OR_DEVICE_PASSCODE',
  },
  AUTHENTICATION_TYPE: {
    DEVICE_PASSCODE_OR_BIOMETRICS: 'DEVICE_PASSCODE_OR_BIOMETRICS',
  },
}));

// Mock react-native-encrypted-storage
jest.mock('react-native-encrypted-storage', () => ({
  setItem: jest.fn().mockResolvedValue(true),
  getItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(true),
}));

describe('WalletService', () => {
  describe('generateMnemonic', () => {
    it('should generate a 12-word mnemonic by default', () => {
      const mnemonic = walletService.generateMnemonic();
      const words = mnemonic.split(' ');
      expect(words).toHaveLength(12);
    });

    it('should generate a 24-word mnemonic when specified', () => {
      const mnemonic = walletService.generateMnemonic(24);
      const words = mnemonic.split(' ');
      expect(words).toHaveLength(24);
    });

    it('should generate different mnemonics each time', () => {
      const mnemonic1 = walletService.generateMnemonic();
      const mnemonic2 = walletService.generateMnemonic();
      expect(mnemonic1).not.toBe(mnemonic2);
    });
  });

  describe('validateMnemonic', () => {
    it('should validate a correct 12-word mnemonic', () => {
      // 유효한 BIP-39 니모닉 사용
      const validMnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      expect(walletService.validateMnemonic(validMnemonic)).toBe(true);
    });

    it('should validate a correct 24-word mnemonic', () => {
      const validMnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
      expect(walletService.validateMnemonic(validMnemonic)).toBe(true);
    });

    it('should reject invalid word count', () => {
      expect(walletService.validateMnemonic('one two three')).toBe(false);
      expect(walletService.validateMnemonic('')).toBe(false);
    });

    it('should reject invalid words', () => {
      const invalidMnemonic =
        'invalid words that are not in bip39 wordlist test test test test test test';
      expect(walletService.validateMnemonic(invalidMnemonic)).toBe(false);
    });
  });

  describe('deriveAccount', () => {
    const testMnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    it('should derive an account from mnemonic', () => {
      const account = walletService.deriveAccount(testMnemonic, 0);
      expect(account).toBeDefined();
      expect(account.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should derive different accounts for different indices', () => {
      const account0 = walletService.deriveAccount(testMnemonic, 0);
      const account1 = walletService.deriveAccount(testMnemonic, 1);
      expect(account0.address).not.toBe(account1.address);
    });

    it('should derive the same account for the same index', () => {
      const account1 = walletService.deriveAccount(testMnemonic, 0);
      const account2 = walletService.deriveAccount(testMnemonic, 0);
      expect(account1.address).toBe(account2.address);
    });

    it('should derive deterministic addresses', () => {
      const account = walletService.deriveAccount(testMnemonic, 0);
      // BIP-44 표준 경로로 파생된 주소는 항상 동일
      expect(account.address.toLowerCase()).toBe(
        '0x9858effd232b4033e47d90003d41ec34ecaeda94',
      );
    });
  });
});

describe('WalletService - Storage', () => {
  const testMnemonic =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const testPin = '123456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('storeMnemonic', () => {
    it('should store mnemonic securely', async () => {
      const Keychain = require('react-native-keychain');
      await walletService.storeMnemonic(testMnemonic, testPin);
      expect(Keychain.setGenericPassword).toHaveBeenCalled();
    });
  });

  describe('retrieveMnemonic', () => {
    it('should retrieve stored mnemonic', async () => {
      const mnemonic = await walletService.retrieveMnemonic();
      expect(mnemonic).toBeDefined();
    });
  });
});

describe('WalletService - Biometric', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isBiometricSupported', () => {
    it('should check if biometric is supported', async () => {
      const result = await walletService.isBiometricSupported();
      expect(typeof result).toBe('boolean');
    });
  });
});

describe('WalletService - Error Handling', () => {
  const testMnemonic =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const testPin = '123456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('retrieveMnemonicWithoutAuth', () => {
    it('should return mnemonic or null', async () => {
      const result = await walletService.retrieveMnemonicWithoutAuth();
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });

  describe('storeMnemonic error handling', () => {
    it('should handle storage errors', async () => {
      const Keychain = require('react-native-keychain');
      Keychain.setGenericPassword.mockRejectedValueOnce(
        new Error('Storage error'),
      );

      await expect(
        walletService.storeMnemonic(testMnemonic, testPin),
      ).rejects.toThrow('니모닉 저장에 실패했습니다');
    });
  });

  describe('isBiometricSupported', () => {
    it('should return boolean value', async () => {
      const result = await walletService.isBiometricSupported();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('retrieveAccounts error handling', () => {
    it('should return empty array on error', async () => {
      const EncryptedStorage = require('react-native-encrypted-storage');
      EncryptedStorage.getItem.mockRejectedValueOnce(
        new Error('Storage error'),
      );

      const accounts = await walletService.retrieveAccounts();
      expect(accounts).toEqual([]);
    });
  });

  describe('storeAccounts error handling', () => {
    it('should handle storage error gracefully', async () => {
      const EncryptedStorage = require('react-native-encrypted-storage');
      EncryptedStorage.setItem.mockRejectedValueOnce(
        new Error('Storage error'),
      );

      const accounts = [
        {
          address: '0x1234567890123456789012345678901234567890',
          derivationPath: "m/44'/60'/0'/0/0",
          name: 'Account 1',
        },
      ];

      await expect(
        walletService.storeAccounts(accounts),
      ).resolves.not.toThrow();
    });
  });
});

describe('WalletService - Security Features', () => {
  const testMnemonic =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const testPin = '123456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('retrieveMnemonic with biometric', () => {
    it('should return mnemonic when keychain has credentials', async () => {
      const Keychain = require('react-native-keychain');
      Keychain.getGenericPassword.mockResolvedValueOnce({
        password: testMnemonic,
      });

      const result = await walletService.retrieveMnemonic();
      expect(result).toBe(testMnemonic);
    });

    it('should try biometric auth when no simple credentials', async () => {
      const Keychain = require('react-native-keychain');
      // 첫 번째 호출: 인증 없이 - 실패
      Keychain.getGenericPassword.mockResolvedValueOnce(false);
      // 두 번째 호출: 생체인증으로 - 성공
      Keychain.getGenericPassword.mockResolvedValueOnce({
        password: testMnemonic,
      });

      const result = await walletService.retrieveMnemonic();
      expect(result).toBe(testMnemonic);
      expect(Keychain.getGenericPassword).toHaveBeenCalledTimes(2);
    });

    it('should return null when all auth methods fail', async () => {
      const Keychain = require('react-native-keychain');
      Keychain.getGenericPassword.mockResolvedValue(false);

      const result = await walletService.retrieveMnemonic();
      expect(result).toBeNull();
    });

    it('should fallback to retrieveMnemonicWithoutAuth on error', async () => {
      const Keychain = require('react-native-keychain');
      Keychain.getGenericPassword
        .mockRejectedValueOnce(new Error('Biometric failed'))
        .mockResolvedValueOnce(false);

      const result = await walletService.retrieveMnemonic();
      // retrieveMnemonicWithoutAuth이 호출되어 null 또는 mnemonic 반환
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });

  describe('retrieveMnemonicWithoutAuth', () => {
    it('should return mnemonic from keychain if available', async () => {
      const Keychain = require('react-native-keychain');
      Keychain.getGenericPassword.mockResolvedValueOnce({
        password: testMnemonic,
      });

      const result = await walletService.retrieveMnemonicWithoutAuth();
      expect(result).toBe(testMnemonic);
    });

    it('should check encrypted storage when keychain empty', async () => {
      const Keychain = require('react-native-keychain');
      const EncryptedStorage = require('react-native-encrypted-storage');

      Keychain.getGenericPassword.mockResolvedValueOnce(false);
      EncryptedStorage.getItem.mockResolvedValueOnce('encrypted_data');

      const result = await walletService.retrieveMnemonicWithoutAuth();
      // PIN 없이는 복호화 불가하므로 null 반환
      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      const Keychain = require('react-native-keychain');
      Keychain.getGenericPassword.mockRejectedValueOnce(
        new Error('Keychain error'),
      );

      const result = await walletService.retrieveMnemonicWithoutAuth();
      expect(result).toBeNull();
    });
  });

  describe('retrieveMnemonicWithPin', () => {
    it('should return null when no encrypted data exists', async () => {
      const EncryptedStorage = require('react-native-encrypted-storage');
      EncryptedStorage.getItem.mockResolvedValueOnce(null);

      const result = await walletService.retrieveMnemonicWithPin(testPin);
      expect(result).toBeNull();
    });

    it('should decrypt mnemonic with correct PIN', async () => {
      const EncryptedStorage = require('react-native-encrypted-storage');
      // 실제 XOR 암호화 로직을 시뮬레이션
      // walletService.encryptWithPin과 동일한 방식으로 암호화
      const mnemonicBuffer = Buffer.from(testMnemonic);
      const pinBuffer = Buffer.from(testPin.repeat(mnemonicBuffer.length));
      const encryptedBuffer = Buffer.alloc(mnemonicBuffer.length);

      for (let i = 0; i < mnemonicBuffer.length; i++) {
        // eslint-disable-next-line no-bitwise
        encryptedBuffer[i] = mnemonicBuffer[i]! ^ pinBuffer[i]!;
      }

      const encrypted = encryptedBuffer.toString('base64');
      EncryptedStorage.getItem.mockResolvedValueOnce(encrypted);

      const result = await walletService.retrieveMnemonicWithPin(testPin);
      expect(result).toBe(testMnemonic);
    });

    it('should return null on decryption error', async () => {
      const EncryptedStorage = require('react-native-encrypted-storage');
      EncryptedStorage.getItem.mockRejectedValueOnce(
        new Error('Storage error'),
      );

      const result = await walletService.retrieveMnemonicWithPin(testPin);
      expect(result).toBeNull();
    });
  });

  describe('clearAll', () => {
    it('should clear all wallet data', async () => {
      const Keychain = require('react-native-keychain');
      const EncryptedStorage = require('react-native-encrypted-storage');

      Keychain.resetGenericPassword.mockResolvedValueOnce(true);
      EncryptedStorage.removeItem.mockResolvedValue(undefined);

      await walletService.clearAll();

      expect(Keychain.resetGenericPassword).toHaveBeenCalled();
      expect(EncryptedStorage.removeItem).toHaveBeenCalledTimes(2);
    });

    it('should handle errors during clear', async () => {
      const Keychain = require('react-native-keychain');
      Keychain.resetGenericPassword.mockRejectedValueOnce(
        new Error('Clear error'),
      );

      // 에러가 발생해도 throw하지 않음
      await expect(walletService.clearAll()).resolves.not.toThrow();
    });
  });

  describe('isBiometricSupported', () => {
    it('should return true when biometry is available', async () => {
      const Keychain = require('react-native-keychain');
      Keychain.getSupportedBiometryType.mockResolvedValueOnce('FaceID');

      const result = await walletService.isBiometricSupported();
      expect(result).toBe(true);
    });

    it('should return false when biometry is not available', async () => {
      const Keychain = require('react-native-keychain');
      Keychain.getSupportedBiometryType.mockResolvedValueOnce(null);

      const result = await walletService.isBiometricSupported();
      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      const Keychain = require('react-native-keychain');
      Keychain.getSupportedBiometryType.mockRejectedValueOnce(
        new Error('Biometry error'),
      );

      const result = await walletService.isBiometricSupported();
      expect(result).toBe(false);
    });
  });
});

describe('WalletService - Account Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('storeAccounts', () => {
    it('should store accounts array', async () => {
      const EncryptedStorage = require('react-native-encrypted-storage');
      EncryptedStorage.setItem.mockResolvedValueOnce(undefined);

      const accounts = [
        {
          address: '0x1234567890123456789012345678901234567890' as const,
          derivationPath: "m/44'/60'/0'/0/0",
          name: 'Account 1',
        },
        {
          address: '0xabcdef1234567890123456789012345678901234' as const,
          derivationPath: "m/44'/60'/0'/0/1",
          name: 'Account 2',
        },
      ];

      await walletService.storeAccounts(accounts);

      expect(EncryptedStorage.setItem).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify(accounts),
      );
    });
  });

  describe('retrieveAccounts', () => {
    it('should retrieve stored accounts', async () => {
      const EncryptedStorage = require('react-native-encrypted-storage');
      const accounts = [
        {
          address: '0x1234567890123456789012345678901234567890',
          derivationPath: "m/44'/60'/0'/0/0",
          name: 'Account 1',
        },
      ];
      EncryptedStorage.getItem.mockResolvedValueOnce(JSON.stringify(accounts));

      const result = await walletService.retrieveAccounts();
      expect(result).toEqual(accounts);
    });

    it('should return empty array when no accounts stored', async () => {
      const EncryptedStorage = require('react-native-encrypted-storage');
      EncryptedStorage.getItem.mockResolvedValueOnce(null);

      const result = await walletService.retrieveAccounts();
      expect(result).toEqual([]);
    });
  });
});
