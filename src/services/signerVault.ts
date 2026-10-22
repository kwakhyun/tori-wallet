/**
 * 잠금 해제된 동안에만 니모닉 참조를 보관하고 주소에 맞는 HD 계정을 제공한다.
 * 영구 저장은 walletService만 담당하며 잠금/초기화 시 세션을 즉시 폐기한다.
 */

import type { HDAccount } from 'viem/accounts';
import { getAddress } from 'viem';
import { walletService } from './walletService';

class SignerVault {
  private mnemonic: string | null = null;
  private generation = 0;

  isUnlocked(): boolean {
    return this.mnemonic !== null;
  }

  startSession(mnemonic: string): void {
    if (!walletService.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic');
    }
    this.mnemonic = mnemonic;
    this.generation += 1;
  }

  async unlockWithPin(
    pin: string,
    isActive: () => boolean = () => true,
  ): Promise<boolean> {
    const generation = this.generation;
    const mnemonic = await walletService.retrieveMnemonicWithPin(pin);
    if (!mnemonic || generation !== this.generation || !isActive())
      return false;
    this.startSession(mnemonic);
    return true;
  }

  async unlockWithBiometric(
    isActive: () => boolean = () => true,
  ): Promise<boolean> {
    const generation = this.generation;
    const mnemonic = await walletService.retrieveMnemonic();
    if (
      !mnemonic ||
      generation !== this.generation ||
      !isActive() ||
      !walletService.validateMnemonic(mnemonic)
    )
      return false;
    this.startSession(mnemonic);
    return true;
  }

  lock(): void {
    this.mnemonic = null;
    this.generation += 1;
  }

  deriveAccountAtPath(derivationPath: string): HDAccount {
    if (!this.mnemonic) throw new Error('Wallet is locked');
    return walletService.deriveAccountAtPath(this.mnemonic, derivationPath);
  }

  async getAccount(expectedAddress: string): Promise<HDAccount> {
    if (!this.mnemonic) throw new Error('Wallet is locked');
    const generation = this.generation;
    const assertActive = () => {
      if (!this.mnemonic || generation !== this.generation) {
        throw new Error('Wallet signing session expired');
      }
    };

    const normalizedExpectedAddress = getAddress(expectedAddress);
    const storedAccounts = await walletService.retrieveAccounts();
    assertActive();
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
    // viem은 nonce/가스 조회를 기다린 후에 서명한다. 그 사이 잠겼다면 차단한다.
    return {
      ...account,
      signMessage: async (...args) => {
        assertActive();
        return account.signMessage(...args);
      },
      signTypedData: async (...args) => {
        assertActive();
        return account.signTypedData(...args);
      },
      signTransaction: async (...args) => {
        assertActive();
        return account.signTransaction(...args);
      },
    } as HDAccount;
  }
}

export const signerVault = new SignerVault();
