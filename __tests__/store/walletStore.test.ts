/**
 * 지갑 스토어 테스트
 */

import { useWalletStore, Wallet, Network } from '../../src/store/walletStore';

// 초기 상태 저장
const initialState = useWalletStore.getState();

describe('WalletStore', () => {
  beforeEach(() => {
    // 각 테스트 전에 스토어 초기화
    useWalletStore.setState(initialState);
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useWalletStore.getState();
      expect(state.hasWallet).toBe(false);
      expect(state.wallets).toEqual([]);
      expect(state.activeWalletIndex).toBe(0);
      expect(state.isLocked).toBe(true);
    });

    it('should have default networks', () => {
      const { networks } = useWalletStore.getState();
      expect(networks.length).toBeGreaterThan(0);
      expect(networks.some(n => n.chainId === 1)).toBe(true); // Ethereum
      expect(networks.some(n => n.chainId === 137)).toBe(true); // Polygon
    });
  });

  describe('Wallet Management', () => {
    const testWallet: Wallet = {
      address: '0x1234567890123456789012345678901234567890',
      name: 'Test Wallet',
      isHD: true,
      derivationPath: "m/44'/60'/0'/0/0",
    };

    it('should add wallet', () => {
      const { addWallet } = useWalletStore.getState();
      addWallet(testWallet);

      const { wallets, hasWallet } = useWalletStore.getState();
      expect(wallets).toHaveLength(1);
      expect(wallets[0].address).toBe(testWallet.address);
      expect(hasWallet).toBe(true);
    });

    it('should add multiple wallets', () => {
      const { addWallet } = useWalletStore.getState();
      addWallet(testWallet);
      addWallet({
        ...testWallet,
        address: '0x0987654321098765432109876543210987654321',
        name: 'Second Wallet',
      });

      const { wallets } = useWalletStore.getState();
      expect(wallets).toHaveLength(2);
    });

    it('should remove wallet', () => {
      const { addWallet, removeWallet } = useWalletStore.getState();
      addWallet(testWallet);

      removeWallet(testWallet.address);

      const { wallets, hasWallet } = useWalletStore.getState();
      expect(wallets).toHaveLength(0);
      expect(hasWallet).toBe(false);
    });

    it('should adjust activeWalletIndex when removing wallet', () => {
      const { addWallet, setActiveWallet, removeWallet } =
        useWalletStore.getState();

      addWallet(testWallet);
      addWallet({
        ...testWallet,
        address: '0x1111111111111111111111111111111111111111',
        name: 'Second',
      });
      setActiveWallet(1);

      // 두 번째 지갑 삭제
      removeWallet('0x1111111111111111111111111111111111111111');

      const { activeWalletIndex, wallets } = useWalletStore.getState();
      expect(wallets).toHaveLength(1);
      expect(activeWalletIndex).toBe(0); // 인덱스 조정됨
    });

    it('should set active wallet', () => {
      const { addWallet, setActiveWallet } = useWalletStore.getState();
      addWallet(testWallet);
      addWallet({
        ...testWallet,
        address: '0x1111111111111111111111111111111111111111',
      });

      setActiveWallet(1);

      const { activeWalletIndex } = useWalletStore.getState();
      expect(activeWalletIndex).toBe(1);
    });
  });

  describe('Network Management', () => {
    it('should set active network', () => {
      const { setActiveNetwork } = useWalletStore.getState();
      setActiveNetwork(137); // Polygon

      const { activeNetworkChainId } = useWalletStore.getState();
      expect(activeNetworkChainId).toBe(137);
    });

    it('should add custom network', () => {
      const { addNetwork } = useWalletStore.getState();
      const customNetwork: Network = {
        chainId: 56,
        name: 'BNB Smart Chain',
        rpcUrl: 'https://bsc-dataseed.binance.org',
        symbol: 'BNB',
        isTestnet: false,
      };

      addNetwork(customNetwork);

      const { networks } = useWalletStore.getState();
      expect(networks.some(n => n.chainId === 56)).toBe(true);
    });
  });

  describe('Lock/Unlock', () => {
    it('should lock wallet', () => {
      const { unlock, lock } = useWalletStore.getState();
      unlock();
      expect(useWalletStore.getState().isLocked).toBe(false);

      lock();
      expect(useWalletStore.getState().isLocked).toBe(true);
    });

    it('should unlock wallet', () => {
      const { unlock } = useWalletStore.getState();
      unlock();

      const { isLocked } = useWalletStore.getState();
      expect(isLocked).toBe(false);
    });
  });

  describe('Reset', () => {
    it('should reset to initial state', () => {
      const { addWallet, setActiveNetwork, unlock, reset } =
        useWalletStore.getState();

      // 상태 변경
      addWallet({
        address: '0x1234567890123456789012345678901234567890',
        name: 'Test',
        isHD: true,
      });
      setActiveNetwork(137);
      unlock();

      // 리셋
      reset();

      const state = useWalletStore.getState();
      expect(state.hasWallet).toBe(false);
      expect(state.wallets).toHaveLength(0);
      expect(state.isLocked).toBe(true);
    });
  });

  describe('setHasWallet', () => {
    it('should set hasWallet flag', () => {
      const { setHasWallet } = useWalletStore.getState();
      setHasWallet(true);

      expect(useWalletStore.getState().hasWallet).toBe(true);

      setHasWallet(false);
      expect(useWalletStore.getState().hasWallet).toBe(false);
    });
  });
});
