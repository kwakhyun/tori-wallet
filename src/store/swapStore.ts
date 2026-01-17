/**
 * 스왑 상태 관리 스토어 (히스토리, 즐겨찾기, 설정)
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SwapHistoryItem {
  id: string;
  timestamp: number;
  chainId: number;
  sellToken: {
    symbol: string;
    address: string;
    amount: string;
  };
  buyToken: {
    symbol: string;
    address: string;
    amount: string;
  };
  txHash: string;
  status: 'pending' | 'success' | 'failed';
  rate: string;
  gasFee?: string;
}

export interface FavoriteTokenPair {
  id: string;
  chainId: number;
  sellTokenAddress: string;
  sellTokenSymbol: string;
  buyTokenAddress: string;
  buyTokenSymbol: string;
  usageCount: number;
  lastUsed: number;
}

export interface SwapSettings {
  defaultSlippage: number;
  autoSlippage: boolean;
  txDeadlineMinutes: number;
  gasPreference: 'low' | 'medium' | 'high' | 'custom';
  customGasPrice?: string;
  expertMode: boolean;
  showPriceImpactWarning: boolean;
  priceImpactWarningThreshold: number;
}

interface SwapState {
  // 히스토리
  history: SwapHistoryItem[];
  addHistoryItem: (item: Omit<SwapHistoryItem, 'id'>) => void;
  updateHistoryStatus: (id: string, status: SwapHistoryItem['status']) => void;
  clearHistory: () => void;
  getHistoryByChain: (chainId: number) => SwapHistoryItem[];

  // 즐겨찾기 토큰 페어
  favoritePairs: FavoriteTokenPair[];
  addFavoritePair: (
    pair: Omit<FavoriteTokenPair, 'id' | 'usageCount' | 'lastUsed'>,
  ) => void;
  removeFavoritePair: (id: string) => void;
  incrementPairUsage: (
    chainId: number,
    sellTokenAddress: string,
    buyTokenAddress: string,
  ) => void;
  getTopPairs: (chainId: number, limit?: number) => FavoriteTokenPair[];

  // 설정
  settings: SwapSettings;
  updateSettings: (settings: Partial<SwapSettings>) => void;
  resetSettings: () => void;

  // 최근 토큰
  recentTokens: Record<number, string[]>; // chainId -> token addresses
  addRecentToken: (chainId: number, tokenAddress: string) => void;
  getRecentTokens: (chainId: number) => string[];
}

const DEFAULT_SETTINGS: SwapSettings = {
  defaultSlippage: 0.5,
  autoSlippage: true,
  txDeadlineMinutes: 20,
  gasPreference: 'medium',
  expertMode: false,
  showPriceImpactWarning: true,
  priceImpactWarningThreshold: 5, // 5% 이상 가격 영향시 경고
};

export const useSwapStore = create<SwapState>()(
  persist(
    (set, get) => ({
      // 히스토리
      history: [],

      addHistoryItem: item => {
        const id = `swap_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        set(state => ({
          history: [{ ...item, id }, ...state.history].slice(0, 100), // 최대 100개
        }));
        return id;
      },

      updateHistoryStatus: (id, status) => {
        set(state => ({
          history: state.history.map(item =>
            item.id === id ? { ...item, status } : item,
          ),
        }));
      },

      clearHistory: () => set({ history: [] }),

      getHistoryByChain: chainId => {
        return get().history.filter(item => item.chainId === chainId);
      },

      // 즐겨찾기 토큰 페어
      favoritePairs: [],

      addFavoritePair: pair => {
        const existing = get().favoritePairs.find(
          p =>
            p.chainId === pair.chainId &&
            p.sellTokenAddress.toLowerCase() ===
              pair.sellTokenAddress.toLowerCase() &&
            p.buyTokenAddress.toLowerCase() ===
              pair.buyTokenAddress.toLowerCase(),
        );

        if (existing) {
          // 이미 존재하면 업데이트
          set(state => ({
            favoritePairs: state.favoritePairs.map(p =>
              p.id === existing.id
                ? { ...p, usageCount: p.usageCount + 1, lastUsed: Date.now() }
                : p,
            ),
          }));
        } else {
          const id = `pair_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;
          set(state => ({
            favoritePairs: [
              ...state.favoritePairs,
              { ...pair, id, usageCount: 1, lastUsed: Date.now() },
            ],
          }));
        }
      },

      removeFavoritePair: id => {
        set(state => ({
          favoritePairs: state.favoritePairs.filter(p => p.id !== id),
        }));
      },

      incrementPairUsage: (chainId, sellTokenAddress, buyTokenAddress) => {
        set(state => ({
          favoritePairs: state.favoritePairs.map(p =>
            p.chainId === chainId &&
            p.sellTokenAddress.toLowerCase() ===
              sellTokenAddress.toLowerCase() &&
            p.buyTokenAddress.toLowerCase() === buyTokenAddress.toLowerCase()
              ? { ...p, usageCount: p.usageCount + 1, lastUsed: Date.now() }
              : p,
          ),
        }));
      },

      getTopPairs: (chainId, limit = 5) => {
        return get()
          .favoritePairs.filter(p => p.chainId === chainId)
          .sort((a, b) => b.usageCount - a.usageCount)
          .slice(0, limit);
      },

      // 설정
      settings: DEFAULT_SETTINGS,

      updateSettings: newSettings => {
        set(state => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },

      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),

      // 최근 토큰
      recentTokens: {},

      addRecentToken: (chainId, tokenAddress) => {
        set(state => {
          const current = state.recentTokens[chainId] || [];
          const filtered = current.filter(
            addr => addr.toLowerCase() !== tokenAddress.toLowerCase(),
          );
          return {
            recentTokens: {
              ...state.recentTokens,
              [chainId]: [tokenAddress, ...filtered].slice(0, 10), // 최대 10개
            },
          };
        });
      },

      getRecentTokens: chainId => {
        return get().recentTokens[chainId] || [];
      },
    }),
    {
      name: 'tori-swap-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({
        history: state.history,
        favoritePairs: state.favoritePairs,
        settings: state.settings,
        recentTokens: state.recentTokens,
      }),
    },
  ),
);
