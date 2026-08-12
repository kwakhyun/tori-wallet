import {
  WalletResetDependencies,
  WalletResetService,
  walletResetService as defaultWalletResetService,
} from '../../src/services/walletResetService';
import { realmDB } from '../../src/realm/database';
import { useSecurityStore } from '../../src/store/securityStore';
import { useSwapStore } from '../../src/store/swapStore';
import { useWalletStore } from '../../src/store/walletStore';
import { walletService } from '../../src/services/walletService';
import { wcService } from '../../src/services/wcService';

describe('walletResetService', () => {
  let dependencies: jest.Mocked<WalletResetDependencies>;
  let walletResetService: WalletResetService;

  beforeEach(() => {
    dependencies = {
      disconnectAllSessions: jest.fn().mockResolvedValue(undefined),
      clearWalletStorage: jest.fn().mockResolvedValue(undefined),
      deleteLocalRecords: jest.fn().mockResolvedValue(undefined),
      resetRuntimeStores: jest.fn(),
      clearPersistedStores: jest.fn().mockResolvedValue(undefined),
    };
    walletResetService = new WalletResetService(dependencies);
  });

  it('clears wallet data, runtime stores, and persisted stores', async () => {
    await expect(walletResetService.reset()).resolves.toBeUndefined();

    expect(dependencies.disconnectAllSessions).toHaveBeenCalledTimes(1);
    expect(dependencies.clearWalletStorage).toHaveBeenCalledTimes(1);
    expect(dependencies.deleteLocalRecords).toHaveBeenCalledTimes(1);
    expect(dependencies.resetRuntimeStores).toHaveBeenCalledTimes(1);
    expect(dependencies.clearPersistedStores).toHaveBeenCalledTimes(1);
  });

  it('fails closed when encrypted wallet deletion fails', async () => {
    dependencies.clearWalletStorage.mockRejectedValueOnce(
      new Error('storage failed'),
    );

    await expect(walletResetService.reset()).rejects.toThrow(
      '암호화된 지갑 저장소를 완전히 삭제하지 못했습니다.',
    );
    expect(dependencies.resetRuntimeStores).not.toHaveBeenCalled();
    expect(dependencies.clearPersistedStores).not.toHaveBeenCalled();
  });

  it('reports auxiliary cleanup failures after wallet storage is cleared', async () => {
    dependencies.disconnectAllSessions.mockRejectedValueOnce(
      new Error('wc failed'),
    );

    await expect(walletResetService.reset()).rejects.toThrow(
      '지갑은 삭제되었지만 일부 연결 또는 로컬 기록 정리에 실패했습니다.',
    );
    expect(dependencies.resetRuntimeStores).toHaveBeenCalledTimes(1);
    expect(dependencies.clearPersistedStores).toHaveBeenCalledTimes(1);
  });

  it('wires the production cleanup dependencies into the default service', async () => {
    const spies = [
      jest
        .spyOn(wcService, 'disconnectAllSessions')
        .mockResolvedValue(undefined),
      jest.spyOn(walletService, 'clearAll').mockResolvedValue(undefined),
      jest.spyOn(realmDB, 'deleteAll').mockResolvedValue(undefined),
      jest
        .spyOn(useWalletStore.getState(), 'reset')
        .mockImplementation(() => undefined),
      jest
        .spyOn(useSecurityStore.getState(), 'resetSecurityState')
        .mockImplementation(() => undefined),
      jest
        .spyOn(useSwapStore.getState(), 'resetSwapState')
        .mockImplementation(() => undefined),
      jest
        .spyOn(useWalletStore.persist, 'clearStorage')
        .mockImplementation(() => undefined),
      jest
        .spyOn(useSecurityStore.persist, 'clearStorage')
        .mockImplementation(() => undefined),
      jest
        .spyOn(useSwapStore.persist, 'clearStorage')
        .mockImplementation(() => undefined),
    ];

    await expect(defaultWalletResetService.reset()).resolves.toBeUndefined();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    for (const spy of spies) spy.mockRestore();
  });
});
