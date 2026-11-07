/**
 * 지갑 상태 및 액션 접근 훅
 */

import { useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWalletStore } from '../store/walletStore';
import { walletService } from '../services/walletService';
import { signerVault } from '../services/signerVault';
import { walletResetService } from '../services/walletResetService';
import { toAppError, logError } from '../utils/error';

const ACCOUNT_PATH_PREFIX = "m/44'/60'/0'/0/";
export const MAX_ACCOUNT_NAME_LENGTH = 24;

/** m/44'/60'/0'/0/n 경로의 n (다른 형태면 null) */
export function accountIndexOf(derivationPath?: string): number | null {
  if (!derivationPath?.startsWith(ACCOUNT_PATH_PREFIX)) return null;
  const tail = derivationPath.slice(ACCOUNT_PATH_PREFIX.length);
  if (!/^\d+$/.test(tail)) return null;
  const index = Number(tail);
  return Number.isSafeInteger(index) ? index : null;
}

/** 이미 사용 중인 가장 큰 계정 인덱스 다음 번호 */
export function nextAccountIndex(
  paths: Array<string | undefined>,
  fallback: number,
): number {
  const used = paths
    .map(accountIndexOf)
    .filter((index): index is number => index !== null);
  return used.length > 0 ? Math.max(...used) + 1 : fallback;
}

export function useWallet() {
  const {
    wallets,
    activeWalletIndex,
    isLocked,
    hasWallet,
    activeNetworkChainId,
    addWallet,
    setActiveWallet,
    renameWallet,
    lock,
    unlock: unlockStore,
  } = useWalletStore(
    useShallow(state => ({
      wallets: state.wallets,
      activeWalletIndex: state.activeWalletIndex,
      isLocked: state.isLocked,
      hasWallet: state.hasWallet,
      activeNetworkChainId: state.activeNetworkChainId,
      addWallet: state.addWallet,
      setActiveWallet: state.setActiveWallet,
      renameWallet: state.renameWallet,
      lock: state.lock,
      unlock: state.unlock,
    })),
  );

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

  const addingAccount = useRef(false);

  /**
   * 추가 계정 파생 (m/44'/60'/0'/0/n, n = 사용 중인 최대 인덱스 + 1)
   * 잠금 해제된 서명 세션이 있어야 한다. 계정은 암호화 저장소에 먼저 기록한 뒤
   * 스토어에 추가하므로 signerVault.getAccount가 곧바로 새 계정으로 서명할 수 있다.
   */
  const addAccount = useCallback(
    async (name?: string) => {
      if (addingAccount.current) {
        throw toAppError(new Error('계정을 추가하는 중입니다.'));
      }
      addingAccount.current = true;
      try {
        const storedAccounts = await walletService.retrieveAccounts();
        const newIndex = nextAccountIndex(
          [
            ...storedAccounts.map(account => account.derivationPath),
            ...wallets.map(wallet => wallet.derivationPath),
          ],
          wallets.length,
        );
        const derivationPath = `${ACCOUNT_PATH_PREFIX}${newIndex}`;
        const account = signerVault.deriveAccountAtPath(derivationPath);
        const accountName =
          name?.trim().slice(0, MAX_ACCOUNT_NAME_LENGTH) ||
          `Account ${newIndex + 1}`;

        const alreadyStored = storedAccounts.some(
          stored =>
            stored.address.toLowerCase() === account.address.toLowerCase(),
        );
        if (!alreadyStored) {
          await walletService.storeAccounts([
            ...storedAccounts,
            {
              address: account.address,
              derivationPath,
              name: accountName,
            },
          ]);
        }

        if (
          !wallets.some(
            wallet =>
              wallet.address.toLowerCase() === account.address.toLowerCase(),
          )
        ) {
          addWallet({
            address: account.address,
            name: accountName,
            isHD: true,
            derivationPath,
          });
        }

        return account.address;
      } catch (error) {
        logError(error, 'addAccount');
        throw toAppError(error);
      } finally {
        addingAccount.current = false;
      }
    },
    [wallets, addWallet],
  );

  /**
   * 계정 이름 변경 (암호화 저장소와 스토어 모두 갱신)
   */
  const renameAccount = useCallback(
    async (address: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw toAppError(new Error('계정 이름을 입력해주세요.'));
      if (trimmed.length > MAX_ACCOUNT_NAME_LENGTH) {
        throw toAppError(
          new Error(
            `계정 이름은 ${MAX_ACCOUNT_NAME_LENGTH}자 이하로 입력해주세요.`,
          ),
        );
      }
      try {
        const storedAccounts = await walletService.retrieveAccounts();
        await walletService.storeAccounts(
          storedAccounts.map(account =>
            account.address.toLowerCase() === address.toLowerCase()
              ? { ...account, name: trimmed }
              : account,
          ),
        );
        renameWallet(address, trimmed);
      } catch (error) {
        logError(error, 'renameAccount');
        throw toAppError(error);
      }
    },
    [renameWallet],
  );

  /**
   * 활성 계정 전환. 송금/스왑/WalletConnect는 활성 계정 주소를 from으로 사용하고,
   * 진행 중이던 서명 요청은 계정이 바뀌면 승인 검사에서 거부된다.
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
    renameAccount,
    switchAccount,
    resetWallet,
  };
}
