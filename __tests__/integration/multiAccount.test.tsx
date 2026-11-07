/**
 * 다중 계정: 계정 추가/이름 변경/전환과 서명 계정 바인딩 통합 테스트
 *
 * 실제 walletService 파생 + signerVault + walletStore를 사용하고 암호화 저장소만
 * 메모리로 대체한다.
 */

import { act, renderHook } from '@testing-library/react-native';
import { recoverMessageAddress } from 'viem';
import { useWallet } from '../../src/hooks/useWallet';
import { signerVault } from '../../src/services/signerVault';
import { signingService } from '../../src/services/signingService';
import { walletService } from '../../src/services/walletService';
import { useWalletStore } from '../../src/store/walletStore';

const mockStorage = new Map<string, string>();
jest.mock('react-native-encrypted-storage', () => ({
  setItem: jest.fn(async (key: string, value: string) => {
    mockStorage.set(key, value);
  }),
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  removeItem: jest.fn(async (key: string) => {
    mockStorage.delete(key);
  }),
  clear: jest.fn(async () => mockStorage.clear()),
}));

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const ACCOUNT_0 = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const ACCOUNT_1 = '0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0';

const initial = useWalletStore.getState();

describe('multi-account', () => {
  beforeEach(async () => {
    mockStorage.clear();
    useWalletStore.setState(initial);
    await walletService.storeAccounts([
      {
        address: ACCOUNT_0,
        derivationPath: "m/44'/60'/0'/0/0",
        name: 'Account 1',
      },
    ]);
    useWalletStore.getState().addWallet({
      address: ACCOUNT_0,
      name: 'Account 1',
      isHD: true,
      derivationPath: "m/44'/60'/0'/0/0",
    });
    signerVault.startSession(MNEMONIC);
    useWalletStore.getState().unlock();
  });

  afterEach(() => {
    signerVault.lock();
  });

  it('adds the next derived account, renames it and signs with the active account', async () => {
    const { result } = renderHook(() => useWallet());

    let added = '';
    await act(async () => {
      added = await result.current.addAccount();
    });
    expect(added).toBe(ACCOUNT_1);
    expect(useWalletStore.getState().wallets.map(w => w.address)).toEqual([
      ACCOUNT_0,
      ACCOUNT_1,
    ]);
    const stored = await walletService.retrieveAccounts();
    expect(stored[1]).toEqual({
      address: ACCOUNT_1,
      derivationPath: "m/44'/60'/0'/0/1",
      name: 'Account 2',
    });

    await act(async () => {
      await result.current.renameAccount(ACCOUNT_1, '저축');
    });
    expect(useWalletStore.getState().wallets[1].name).toBe('저축');
    expect((await walletService.retrieveAccounts())[1].name).toBe('저축');

    act(() => {
      result.current.switchAccount(1);
    });
    const { wallets, activeWalletIndex } = useWalletStore.getState();
    const active = wallets[activeWalletIndex];
    expect(active.address).toBe(ACCOUNT_1);

    // 송금/WalletConnect는 활성 계정을 from/주소로 넘긴다. 서명자가 그 계정과 일치해야 한다.
    const signature = await signingService.personalSign(
      'hello',
      active.address,
    );
    await expect(
      recoverMessageAddress({
        message: 'hello',
        signature: signature as `0x${string}`,
      }),
    ).resolves.toBe(ACCOUNT_1);
  });

  it('refuses to sign for accounts that are not in encrypted storage', async () => {
    useWalletStore.getState().addWallet({
      address: ACCOUNT_1,
      name: 'Injected',
      isHD: true,
      derivationPath: "m/44'/60'/0'/0/1",
    });
    useWalletStore.getState().setActiveWallet(1);

    await expect(
      signingService.personalSign('hello', ACCOUNT_1),
    ).rejects.toThrow('Requested account is not available');
  });

  it('refuses to add or sign once the wallet is locked', async () => {
    const { result } = renderHook(() => useWallet());
    useWalletStore.getState().lock();

    await act(async () => {
      await expect(result.current.addAccount()).rejects.toBeDefined();
    });
    await expect(
      signingService.personalSign('hello', ACCOUNT_0),
    ).rejects.toThrow('Wallet is locked');
    expect(useWalletStore.getState().wallets).toHaveLength(1);
  });
});
