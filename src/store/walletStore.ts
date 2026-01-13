/**
 * Tori Wallet - Wallet Store (Zustand)
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  addNetwork: (network: Network) => void;
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

const initialState = {
  hasWallet: false,
  wallets: [] as Wallet[],
  activeWalletIndex: 0,
  networks: DEFAULT_NETWORKS,
  activeNetworkChainId: 11155111, // Sepolia 테스트넷 (시연용)
  isLocked: true,
};

export const useWalletStore = create<WalletState>()(
  persist(
    set => ({
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
            activeWalletIndex: Math.min(
              state.activeWalletIndex,
              newWallets.length - 1,
            ),
          };
        }),

      setActiveWallet: index => set({ activeWalletIndex: index }),

      addNetwork: network =>
        set(state => ({
          networks: [...state.networks, network],
        })),

      setActiveNetwork: chainId => set({ activeNetworkChainId: chainId }),

      lock: () => set({ isLocked: true }),

      unlock: () => set({ isLocked: false }),

      reset: () => set(initialState),
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
    },
  ),
);
