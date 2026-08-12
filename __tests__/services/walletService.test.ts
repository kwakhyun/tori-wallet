/**
 * 지갑 저장소는 PIN 암호화본과 명시적으로 활성화된 생체인증 사본만 유지한다.
 */

jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(),
  getGenericPassword: jest.fn(),
  hasGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
  getSupportedBiometryType: jest.fn(),
  ACCESS_CONTROL: {
    BIOMETRY_CURRENT_SET: 'BIOMETRY_CURRENT_SET',
  },
  ACCESSIBLE: {
    WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'WHEN_PASSCODE_SET_THIS_DEVICE_ONLY',
  },
  SECURITY_LEVEL: {
    SECURE_HARDWARE: 'SECURE_HARDWARE',
  },
}));

jest.mock('react-native-encrypted-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

import * as Keychain from 'react-native-keychain';
import EncryptedStorage from 'react-native-encrypted-storage';
import { WalletService, walletService } from '../../src/services/walletService';
import { SecureRandomGenerator } from '../../src/utils/secureRandom';

const VALID_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PIN = '123456';

const keychain = Keychain as unknown as {
  resetGenericPassword: jest.Mock;
  setGenericPassword: jest.Mock;
  getGenericPassword: jest.Mock;
  hasGenericPassword: jest.Mock;
  getSupportedBiometryType: jest.Mock;
};
const storage = EncryptedStorage as unknown as {
  setItem: jest.Mock;
  getItem: jest.Mock;
  removeItem: jest.Mock;
};

describe('WalletService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    keychain.resetGenericPassword.mockResolvedValue(true);
    keychain.setGenericPassword.mockResolvedValue(true);
    keychain.getGenericPassword.mockResolvedValue(false);
    keychain.hasGenericPassword.mockResolvedValue(false);
    keychain.getSupportedBiometryType.mockResolvedValue('FaceID' as never);
    storage.setItem.mockResolvedValue(undefined);
    storage.getItem.mockResolvedValue(null);
    storage.removeItem.mockResolvedValue(undefined);

    await walletService.clearAll();
    jest.clearAllMocks();
  });

  it('generates valid 12-word and 24-word BIP-39 mnemonics', () => {
    const twelveWords = walletService.generateMnemonic();
    const twentyFourWords = walletService.generateMnemonic(24);

    expect(twelveWords.split(' ')).toHaveLength(12);
    expect(twentyFourWords.split(' ')).toHaveLength(24);
    expect(walletService.validateMnemonic(twelveWords)).toBe(true);
    expect(walletService.validateMnemonic(twentyFourWords)).toBe(true);
  });

  it('never creates a mnemonic when the RNG health check fails', () => {
    const weakRandom = new SecureRandomGenerator(target => target.fill(0));
    const service = new WalletService(weakRandom);

    expect(() => service.generateMnemonic()).toThrow(
      '보안 난수 상태 검사에 실패하여 지갑 생성을 중단했습니다.',
    );
  });

  it('rejects a checksum-invalid mnemonic even when all words exist', () => {
    const invalidChecksum =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
    expect(walletService.validateMnemonic(invalidChecksum)).toBe(false);
  });

  it('derives deterministic and distinct HD accounts', () => {
    const account0 = walletService.deriveAccount(VALID_MNEMONIC, 0);
    const account1 = walletService.deriveAccount(VALID_MNEMONIC, 1);

    expect(account0.address.toLowerCase()).toBe(
      '0x9858effd232b4033e47d90003d41ec34ecaeda94',
    );
    expect(account1.address).not.toBe(account0.address);
    expect(
      walletService.deriveAccountAtPath(VALID_MNEMONIC, "m/44'/60'/0'/0/1")
        .address,
    ).toBe(account1.address);
  });

  it('stores only the PIN-encrypted mnemonic by default', async () => {
    await walletService.storeMnemonic(VALID_MNEMONIC, PIN);

    const mnemonicWrite = storage.setItem.mock.calls.find(
      ([key]) => key === 'tori_wallet_mnemonic',
    );
    expect(mnemonicWrite).toBeDefined();
    expect(mnemonicWrite?.[1]).not.toContain(VALID_MNEMONIC);
    expect(JSON.parse(mnemonicWrite?.[1] || '{}')).toMatchObject({
      version: 2,
      kdf: 'scrypt',
      n: 65536,
    });
    expect(keychain.setGenericPassword).not.toHaveBeenCalled();
  });

  it('round-trips the encrypted mnemonic with the correct PIN only', async () => {
    let encrypted = '';
    storage.setItem.mockImplementation(async (key, value) => {
      if (key === 'tori_wallet_mnemonic') encrypted = value;
    });
    await walletService.storeMnemonic(VALID_MNEMONIC, PIN);

    storage.getItem.mockImplementation(async key =>
      key === 'tori_wallet_mnemonic' ? encrypted : '2',
    );
    await expect(walletService.retrieveMnemonicWithPin(PIN)).resolves.toBe(
      VALID_MNEMONIC,
    );
    await expect(
      walletService.retrieveMnemonicWithPin('654321'),
    ).resolves.toBeNull();
  });

  it('never exposes a mnemonic through the unauthenticated legacy method', async () => {
    keychain.getGenericPassword.mockResolvedValue({
      username: 'legacy',
      password: VALID_MNEMONIC,
      service: 'tori_wallet_mnemonic',
      storage: 'keychain',
    } as never);

    await expect(
      walletService.retrieveMnemonicWithoutAuth(),
    ).resolves.toBeNull();
    expect(keychain.getGenericPassword).not.toHaveBeenCalled();
  });

  it('returns the Keychain mnemonic only when biometric storage is enabled', async () => {
    storage.getItem.mockImplementation(async key =>
      key === 'tori_wallet_vault_version' ? '2' : 'true',
    );
    keychain.hasGenericPassword.mockResolvedValue(true);
    keychain.getGenericPassword.mockResolvedValue({
      username: 'tori_wallet_mnemonic',
      password: VALID_MNEMONIC,
      service: 'tori_wallet_mnemonic',
      storage: 'keychain',
    } as never);

    await expect(walletService.retrieveMnemonic()).resolves.toBe(
      VALID_MNEMONIC,
    );
    expect(keychain.getGenericPassword).toHaveBeenCalledWith(
      expect.objectContaining({
        accessControl: 'BIOMETRY_CURRENT_SET',
      }),
    );
  });

  it('uses device-bound Keychain protection when enabling biometrics', async () => {
    storage.getItem.mockResolvedValue('2');
    keychain.getSupportedBiometryType.mockResolvedValue('FaceID' as never);

    await walletService.enableBiometric(VALID_MNEMONIC);

    expect(keychain.setGenericPassword).toHaveBeenCalledWith(
      'tori_wallet_mnemonic',
      VALID_MNEMONIC,
      expect.objectContaining({
        accessible: 'WHEN_PASSCODE_SET_THIS_DEVICE_ONLY',
        accessControl: 'BIOMETRY_CURRENT_SET',
        cloudSync: false,
      }),
    );
  });

  it('stores and retrieves the account derivation metadata', async () => {
    const accounts = [
      {
        address: '0x1234567890123456789012345678901234567890',
        derivationPath: "m/44'/60'/0'/0/0",
        name: 'Account 1',
      },
    ];
    storage.getItem.mockResolvedValue(JSON.stringify(accounts));

    await walletService.storeAccounts(accounts);
    await expect(walletService.retrieveAccounts()).resolves.toEqual(accounts);
    expect(storage.setItem).toHaveBeenCalledWith(
      'tori_wallet_accounts',
      JSON.stringify(accounts),
    );
  });

  it('surfaces account storage failures', async () => {
    storage.setItem.mockRejectedValueOnce(new Error('Storage error'));
    await expect(walletService.storeAccounts([])).rejects.toThrow(
      '계정 정보 저장에 실패했습니다.',
    );
  });

  it('clears every wallet storage location', async () => {
    await walletService.clearAll();

    expect(keychain.resetGenericPassword).toHaveBeenCalled();
    expect(storage.removeItem).toHaveBeenCalledTimes(4);
  });

  it('surfaces partial deletion failures after attempting all locations', async () => {
    keychain.resetGenericPassword.mockRejectedValueOnce(new Error('failed'));

    await expect(walletService.clearAll()).rejects.toThrow(
      '일부 지갑 데이터를 삭제하지 못했습니다.',
    );
    expect(storage.removeItem).toHaveBeenCalledTimes(4);
  });
});
