import { signerVault } from '../../src/services/signerVault';
import { walletService } from '../../src/services/walletService';

jest.mock('../../src/services/walletService', () => ({
  walletService: {
    validateMnemonic: jest.fn(),
    retrieveMnemonicWithPin: jest.fn(),
    retrieveMnemonic: jest.fn(),
    deriveAccountAtPath: jest.fn(),
    retrieveAccounts: jest.fn(),
  },
}));

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const ADDRESS = '0x1234567890123456789012345678901234567890';
const OTHER_ADDRESS = '0x0987654321098765432109876543210987654321';
const PATH = "m/44'/60'/0'/0/0";

const mockedWalletService = walletService as jest.Mocked<typeof walletService>;

describe('signerVault', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signerVault.lock();
    mockedWalletService.validateMnemonic.mockReturnValue(true);
    mockedWalletService.deriveAccountAtPath.mockReturnValue({
      address: ADDRESS,
    } as unknown as ReturnType<typeof walletService.deriveAccountAtPath>);
    mockedWalletService.retrieveAccounts.mockResolvedValue([
      { address: ADDRESS, derivationPath: PATH, name: 'Account 1' },
    ]);
  });

  it('starts and clears an unlocked signing session', () => {
    expect(signerVault.isUnlocked()).toBe(false);

    signerVault.startSession(MNEMONIC);
    expect(signerVault.isUnlocked()).toBe(true);

    signerVault.lock();
    expect(signerVault.isUnlocked()).toBe(false);
  });

  it('rejects an invalid mnemonic', () => {
    mockedWalletService.validateMnemonic.mockReturnValue(false);

    expect(() => signerVault.startSession('invalid')).toThrow(
      'Invalid mnemonic',
    );
    expect(signerVault.isUnlocked()).toBe(false);
  });

  it('unlocks with a PIN only when storage returns a valid mnemonic', async () => {
    mockedWalletService.retrieveMnemonicWithPin.mockResolvedValueOnce(null);
    await expect(signerVault.unlockWithPin('000000')).resolves.toBe(false);

    mockedWalletService.retrieveMnemonicWithPin.mockResolvedValueOnce(MNEMONIC);
    await expect(signerVault.unlockWithPin('123456')).resolves.toBe(true);
    expect(signerVault.isUnlocked()).toBe(true);
  });

  it('requires a valid biometric mnemonic', async () => {
    mockedWalletService.retrieveMnemonic.mockResolvedValueOnce(null);
    await expect(signerVault.unlockWithBiometric()).resolves.toBe(false);

    mockedWalletService.retrieveMnemonic.mockResolvedValueOnce(MNEMONIC);
    mockedWalletService.validateMnemonic.mockReturnValueOnce(false);
    await expect(signerVault.unlockWithBiometric()).resolves.toBe(false);

    mockedWalletService.retrieveMnemonic.mockResolvedValueOnce(MNEMONIC);
    mockedWalletService.validateMnemonic.mockReturnValueOnce(true);
    await expect(signerVault.unlockWithBiometric()).resolves.toBe(true);
  });

  it('does not derive an account while locked', () => {
    expect(() => signerVault.deriveAccountAtPath(PATH)).toThrow(
      'Wallet is locked',
    );
  });

  it('derives an account only after unlocking', () => {
    signerVault.startSession(MNEMONIC);

    expect(signerVault.deriveAccountAtPath(PATH).address).toBe(ADDRESS);
    expect(mockedWalletService.deriveAccountAtPath).toHaveBeenCalledWith(
      MNEMONIC,
      PATH,
    );
  });

  it('returns only an account present in encrypted account storage', async () => {
    signerVault.startSession(MNEMONIC);

    await expect(signerVault.getAccount(ADDRESS)).resolves.toMatchObject({
      address: ADDRESS,
    });
  });

  it('blocks unavailable and derivation-mismatched accounts', async () => {
    signerVault.startSession(MNEMONIC);

    await expect(signerVault.getAccount(OTHER_ADDRESS)).rejects.toThrow(
      'Requested account is not available',
    );

    mockedWalletService.deriveAccountAtPath.mockReturnValueOnce({
      address: OTHER_ADDRESS,
    } as unknown as ReturnType<typeof walletService.deriveAccountAtPath>);
    await expect(signerVault.getAccount(ADDRESS)).rejects.toThrow(
      'Stored account derivation mismatch',
    );
  });

  it('blocks account lookup while locked', async () => {
    await expect(signerVault.getAccount(ADDRESS)).rejects.toThrow(
      'Wallet is locked',
    );
  });
});
