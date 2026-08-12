/**
 * 지갑 상태 및 액션 접근 훅
 */

import { useCallback } from 'react';
import { useWalletStore } from '../store/walletStore';
import { walletService } from '../services/walletService';
import { signerVault } from '../services/signerVault';
import { walletResetService } from '../services/walletResetService';
import { toAppError, logError } from '../utils/error';

export function useWallet() {
  const {
    wallets,
    activeWalletIndex,
    isLocked,
    hasWallet,
    activeNetworkChainId,
    addWallet,
    setActiveWallet,
    lock,
    unlock: unlockStore,
  } = useWalletStore();

  const activeWallet = wallets[activeWalletIndex] || null;

  /**
   * 새 지갑 생성
   */
  const createWallet = useCallback(
    async (pin: string, wordCount: 12 | 24 = 12) => {
      try {
        const mnemonic = walletService.generateMnemonic(wordCount);
        const account = walletService.deriveAccount(mnemonic, 0);

        await walletService.storeMnemonic(mnemonic, pin);
        await walletService.storeAccounts([
          {
            address: account.address,
            derivationPath: "m/44'/60'/0'/0/0",
            name: 'Account 1',
          },
        ]);

        addWallet({
          address: account.address,
          name: 'Account 1',
          isHD: true,
          derivationPath: "m/44'/60'/0'/0/0",
        });

        signerVault.startSession(mnemonic);
        unlockStore();

        return { mnemonic, address: account.address };
      } catch (error) {
        logError(error, 'createWallet');
        throw toAppError(error);
      }
    },
    [addWallet, unlockStore],
  );

  /**
   * 니모닉으로 지갑 복구
   */
  const importWallet = useCallback(
    async (mnemonic: string, pin: string) => {
      try {
        if (!walletService.validateMnemonic(mnemonic)) {
          throw new Error('Invalid mnemonic');
        }

        const account = walletService.deriveAccount(mnemonic, 0);

        await walletService.storeMnemonic(mnemonic, pin);
        await walletService.storeAccounts([
          {
            address: account.address,
            derivationPath: "m/44'/60'/0'/0/0",
            name: 'Account 1',
          },
        ]);

        addWallet({
          address: account.address,
          name: 'Account 1',
          isHD: true,
          derivationPath: "m/44'/60'/0'/0/0",
        });

        signerVault.startSession(mnemonic);
        unlockStore();

        return { address: account.address };
      } catch (error) {
        logError(error, 'importWallet');
        throw toAppError(error);
      }
    },
    [addWallet, unlockStore],
  );

  /**
   * 지갑 잠금 해제 (생체인증)
   */
  const unlockWithBiometrics = useCallback(async () => {
    try {
      if (await signerVault.unlockWithBiometric()) {
        unlockStore();
        return true;
      }
      return false;
    } catch (error) {
      logError(error, 'unlock');
      return false;
    }
  }, [unlockStore]);

  /**
   * PIN으로 지갑 잠금 해제
   */
  const unlockWithPin = useCallback(
    async (pin: string) => {
      try {
        if (await signerVault.unlockWithPin(pin)) {
          unlockStore();
          return true;
        }
        return false;
      } catch (error) {
        logError(error, 'unlockWithPin');
        return false;
      }
    },
    [unlockStore],
  );

  /**
   * 추가 계정 파생
   */
  const addAccount = useCallback(
    async (name: string) => {
      try {
        const newIndex = wallets.length;
        const derivationPath = `m/44'/60'/0'/0/${newIndex}`;
        const account = signerVault.deriveAccountAtPath(derivationPath);

        const storedAccounts = await walletService.retrieveAccounts();
        const newStoredAccounts = [
          ...storedAccounts,
          {
            address: account.address,
            derivationPath,
            name,
          },
        ];

        await walletService.storeAccounts(newStoredAccounts);

        addWallet({
          address: account.address,
          name,
          isHD: true,
          derivationPath,
        });

        return account.address;
      } catch (error) {
        logError(error, 'addAccount');
        throw toAppError(error);
      }
    },
    [wallets.length, addWallet],
  );

  /**
   * 활성 계정 전환
   */
  const switchAccount = useCallback(
    (index: number) => {
      if (index >= 0 && index < wallets.length) {
        setActiveWallet(index);
      }
    },
    [wallets.length, setActiveWallet],
  );

  /**
   * 지갑 초기화 (모든 데이터 삭제)
   */
  const resetWallet = useCallback(async () => {
    try {
      await walletResetService.reset();
    } catch (error) {
      logError(error, 'resetWallet');
      throw toAppError(error);
    }
  }, []);

  return {
    // State
    wallets,
    activeWallet,
    activeWalletIndex,
    isLocked,
    hasWallet,
    activeNetworkChainId,

    // Actions
    createWallet,
    importWallet,
    unlockWithBiometrics,
    unlockWithPin,
    lock,
    addAccount,
    switchAccount,
    resetWallet,
  };
}
