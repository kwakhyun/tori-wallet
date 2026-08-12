/**
 * 잠금 해제된 동안에만 니모닉 참조를 보관하고 주소에 맞는 HD 계정을 제공한다.
 * 영구 저장은 walletService만 담당하며 잠금/초기화 시 세션을 즉시 폐기한다.
 */

import type { HDAccount } from 'viem/accounts';
import { getAddress } from 'viem';
import { walletService } from './walletService';

class SignerVault {
  private mnemonic: string | null = null;

  isUnlocked(): boolean {
    return this.mnemonic !== null;
  }

  startSession(mnemonic: string): void {
    if (!walletService.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic');
    }
    this.mnemonic = mnemonic;
  }

  async unlockWithPin(pin: string): Promise<boolean> {
    const mnemonic = await walletService.retrieveMnemonicWithPin(pin);
    if (!mnemonic) return false;
    this.startSession(mnemonic);
    return true;
  }

  async unlockWithBiometric(): Promise<boolean> {
    const mnemonic = await walletService.retrieveMnemonic();
    if (!mnemonic || !walletService.validateMnemonic(mnemonic)) return false;
    this.startSession(mnemonic);
    return true;
  }

  lock(): void {
    this.mnemonic = null;
  }

  deriveAccountAtPath(derivationPath: string): HDAccount {
    if (!this.mnemonic) throw new Error('Wallet is locked');
    return walletService.deriveAccountAtPath(this.mnemonic, derivationPath);
  }

  async getAccount(expectedAddress: string): Promise<HDAccount> {
    if (!this.mnemonic) throw new Error('Wallet is locked');

    const normalizedExpectedAddress = getAddress(expectedAddress);
    const storedAccounts = await walletService.retrieveAccounts();
    const storedAccount = storedAccounts.find(
      account => getAddress(account.address) === normalizedExpectedAddress,
    );
    if (!storedAccount) throw new Error('Requested account is not available');

    const account = walletService.deriveAccountAtPath(
      this.mnemonic,
      storedAccount.derivationPath,
    );
    if (getAddress(account.address) !== normalizedExpectedAddress) {
      throw new Error('Stored account derivation mismatch');
    }
    return account;
  }
}

export const signerVault = new SignerVault();
