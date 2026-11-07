/**
 * 지갑 상태 관리 스토어
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signerVault } from '@/services/signerVault';
import { customNetworkRegistry } from '@/services/customNetworks';
import { useSecurityStore } from './securityStore';

export interface Wallet {
  address: string;
  name: string;
  isHD: boolean;
  derivationPath?: string;
}

export interface Network {
  chainId: number;
  name: string;
  rpcUrl: string;
  symbol: string;
  blockExplorerUrl?: string;
  isTestnet?: boolean;
  /** 사용자가 직접 추가한 네트워크 (삭제 가능) */
  isCustom?: boolean;
}

interface WalletState {
  // State
  hasWallet: boolean;
  wallets: Wallet[];
  activeWalletIndex: number;
  networks: Network[];
  activeNetworkChainId: number;
  isLocked: boolean;

  // Actions
  setHasWallet: (hasWallet: boolean) => void;
  addWallet: (wallet: Wallet) => void;
  removeWallet: (address: string) => void;
  setActiveWallet: (index: number) => void;
  /** 계정 이름 변경 (주소로 식별) */
  renameWallet: (address: string, name: string) => void;
  /**
   * 커스텀 네트워크 추가. 기본 네트워크 또는 이미 추가된 체인 ID와 겹치면 예외.
   * RPC 체인 ID 검증은 호출 측(AddNetworkModal)이 chainClient.verifyRpcChainId로 수행한다.
   */
  addNetwork: (network: Network) => void;
  /** 커스텀 네트워크 삭제 (기본 네트워크는 삭제 불가) */
  removeNetwork: (chainId: number) => void;
  setActiveNetwork: (chainId: number) => void;
  lock: () => void;
  unlock: () => void;
  reset: () => void;
}

const DEFAULT_NETWORKS: Network[] = [
  {
    chainId: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://eth.llamarpc.com',
    symbol: 'ETH',
    blockExplorerUrl: 'https://etherscan.io',
    isTestnet: false,
  },
  {
    chainId: 137,
    name: 'Polygon',
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
    symbol: 'MATIC',
    blockExplorerUrl: 'https://polygonscan.com',
    isTestnet: false,
  },
  {
    chainId: 42161,
    name: 'Arbitrum One',
    rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
    symbol: 'ETH',
    blockExplorerUrl: 'https://arbiscan.io',
    isTestnet: false,
  },
  {
    chainId: 10,
    name: 'Optimism',
    rpcUrl: 'https://optimism-rpc.publicnode.com',
    symbol: 'ETH',
    blockExplorerUrl: 'https://optimistic.etherscan.io',
    isTestnet: false,
  },
  {
    chainId: 8453,
    name: 'Base',
    rpcUrl: 'https://base-rpc.publicnode.com',
    symbol: 'ETH',
    blockExplorerUrl: 'https://basescan.org',
    isTestnet: false,
  },
  {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    symbol: 'ETH',
    blockExplorerUrl: 'https://sepolia.etherscan.io',
    isTestnet: true,
  },
];

export const BUILT_IN_CHAIN_IDS: readonly number[] = DEFAULT_NETWORKS.map(
  network => network.chainId,
);

const DEFAULT_CHAIN_ID = 11155111; // Sepolia 테스트넷 (시연용)

const initialState = {
  hasWallet: false,
  wallets: [] as Wallet[],
  activeWalletIndex: 0,
  networks: DEFAULT_NETWORKS,
  activeNetworkChainId: DEFAULT_CHAIN_ID,
  isLocked: true,
};

/** 저장된 네트워크 중 사용자 추가분만 남기고 기본 네트워크는 항상 최신 정의를 쓴다. */
function mergeNetworks(persisted: Network[] | undefined): Network[] {
  const custom = (Array.isArray(persisted) ? persisted : [])
    .filter(
      network =>
        network &&
        Number.isSafeInteger(network.chainId) &&
        !BUILT_IN_CHAIN_IDS.includes(network.chainId),
    )
    .map(network => ({ ...network, isCustom: true }));
  return [...DEFAULT_NETWORKS, ...custom];
}

function syncCustomNetworks(networks: Network[]): void {
  customNetworkRegistry.set(networks.filter(network => network.isCustom));
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setHasWallet: hasWallet => set({ hasWallet }),

      addWallet: wallet =>
        set(state => ({
          wallets: [...state.wallets, wallet],
          hasWallet: true,
        })),

      removeWallet: address =>
        set(state => {
          const newWallets = state.wallets.filter(w => w.address !== address);
          return {
            wallets: newWallets,
            hasWallet: newWallets.length > 0,
            activeWalletIndex:
              newWallets.length === 0
                ? 0
                : Math.min(state.activeWalletIndex, newWallets.length - 1),
          };
        }),

      setActiveWallet: index =>
        set(state =>
          Number.isInteger(index) && index >= 0 && index < state.wallets.length
            ? { activeWalletIndex: index }
            : {},
        ),

      renameWallet: (address, name) => {
        const trimmed = name.trim();
        if (!trimmed) throw new Error('계정 이름을 입력해주세요.');
        set(state => ({
          wallets: state.wallets.map(wallet =>
            wallet.address.toLowerCase() === address.toLowerCase()
              ? { ...wallet, name: trimmed }
              : wallet,
          ),
        }));
      },

      addNetwork: network => {
        const state = get();
        if (BUILT_IN_CHAIN_IDS.includes(network.chainId)) {
          throw new Error('이미 기본으로 제공되는 네트워크입니다.');
        }
        if (state.networks.some(n => n.chainId === network.chainId)) {
          throw new Error('이미 추가된 네트워크입니다.');
        }
        set({ networks: [...state.networks, { ...network, isCustom: true }] });
      },

      removeNetwork: chainId => {
        const state = get();
        const target = state.networks.find(n => n.chainId === chainId);
        if (!target || !target.isCustom) {
          throw new Error('기본 네트워크는 삭제할 수 없습니다.');
        }
        set({
          networks: state.networks.filter(n => n.chainId !== chainId),
          // 사용 중이던 네트워크를 지우면 실제 자산이 없는 기본 테스트넷으로 돌아간다.
          activeNetworkChainId:
            state.activeNetworkChainId === chainId
              ? DEFAULT_CHAIN_ID
              : state.activeNetworkChainId,
        });
      },

      setActiveNetwork: chainId =>
        set(state =>
          state.networks.some(n => n.chainId === chainId)
            ? { activeNetworkChainId: chainId }
            : {},
        ),

      lock: () => {
        signerVault.lock();
        set({ isLocked: true });
      },

      unlock: () => {
        if (!signerVault.isUnlocked()) {
          throw new Error(
            'Cannot unlock without an authenticated signer session',
          );
        }
        // PIN derivation can outlast the inactivity window on slow devices.
        // Start the new session's window before publishing its unlocked state.
        useSecurityStore.getState().updateLastActiveTime();
        set({ isLocked: false });
      },

      reset: () => {
        signerVault.lock();
        set(initialState);
      },
    }),
    {
      name: 'tori-wallet-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({
        hasWallet: state.hasWallet,
        wallets: state.wallets,
        activeWalletIndex: state.activeWalletIndex,
        networks: state.networks,
        activeNetworkChainId: state.activeNetworkChainId,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<WalletState>;
        const networks = mergeNetworks(persisted.networks);
        const activeNetworkChainId = networks.some(
          n => n.chainId === persisted.activeNetworkChainId,
        )
          ? (persisted.activeNetworkChainId as number)
          : currentState.activeNetworkChainId;
        const wallets = Array.isArray(persisted.wallets)
          ? persisted.wallets
          : currentState.wallets;
        const activeWalletIndex =
          typeof persisted.activeWalletIndex === 'number' &&
          persisted.activeWalletIndex >= 0 &&
          persisted.activeWalletIndex < wallets.length
            ? persisted.activeWalletIndex
            : 0;
        return {
          ...currentState,
          ...persisted,
          wallets,
          activeWalletIndex,
          networks,
          activeNetworkChainId,
        };
      },
    },
  ),
);

// 커스텀 네트워크를 chainClient/서명 서비스가 찾을 수 있도록 레지스트리와 동기화한다.
syncCustomNetworks(useWalletStore.getState().networks);
useWalletStore.subscribe((state, previous) => {
  if (state.networks !== previous.networks) syncCustomNetworks(state.networks);
});
