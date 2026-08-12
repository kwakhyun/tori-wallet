/**
 * 지갑과 연결된 모든 로컬 상태를 하나의 경계에서 정리한다.
 */

import { realmDB } from '@/realm/database';
import { useSecurityStore } from '@/store/securityStore';
import { useSwapStore } from '@/store/swapStore';
import { useWalletStore } from '@/store/walletStore';
import { walletService } from './walletService';
import { wcService } from './wcService';

export interface WalletResetDependencies {
  disconnectAllSessions: () => Promise<void>;
  clearWalletStorage: () => Promise<void>;
  deleteLocalRecords: () => Promise<void>;
  resetRuntimeStores: () => void;
  clearPersistedStores: () => Promise<void>;
}

const defaultDependencies: WalletResetDependencies = {
  disconnectAllSessions: () => wcService.disconnectAllSessions(),
  clearWalletStorage: () => walletService.clearAll(),
  deleteLocalRecords: () => realmDB.deleteAll(),
  resetRuntimeStores: () => {
    useWalletStore.getState().reset();
    useSecurityStore.getState().resetSecurityState();
    useSwapStore.getState().resetSwapState();
  },
  clearPersistedStores: async () => {
    await Promise.all([
      useWalletStore.persist.clearStorage(),
      useSecurityStore.persist.clearStorage(),
      useSwapStore.persist.clearStorage(),
    ]);
  },
};

export class WalletResetService {
  constructor(
    private readonly dependencies: WalletResetDependencies = defaultDependencies,
  ) {}

  async reset(): Promise<void> {
    const results = await Promise.allSettled([
      this.dependencies.disconnectAllSessions(),
      this.dependencies.clearWalletStorage(),
      this.dependencies.deleteLocalRecords(),
    ]);

    const walletStorageCleared = results[1].status === 'fulfilled';
    if (!walletStorageCleared) {
      throw new Error('암호화된 지갑 저장소를 완전히 삭제하지 못했습니다.');
    }

    this.dependencies.resetRuntimeStores();
    await this.dependencies.clearPersistedStores();

    const failedAuxiliaryCleanup = results.filter(
      (result, index) => index !== 1 && result.status === 'rejected',
    );
    if (failedAuxiliaryCleanup.length > 0) {
      throw new Error(
        '지갑은 삭제되었지만 일부 연결 또는 로컬 기록 정리에 실패했습니다.',
      );
    }
  }
}

export const walletResetService = new WalletResetService();
