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

/**
 * 스왑 설정
 *
 * 0x v2(AllowanceHolder) 견적이 실제로 반영하는 값만 둔다.
 *  - 슬리피지: slippageBps로 전달되어 최소 수령량(minBuyAmount)에 반영된다.
 * 거래 기한/가스 우선순위/전문가 모드는 0x 견적과 서명된 트랜잭션에 반영할 수
 * 없어(가스 값은 검토한 견적 지문에 포함) 제공하지 않는다.
 */
export interface SwapSettings {
  /** 수동 슬리피지 (%) */
  defaultSlippage: number;
  /** 자동: 스테이블 쌍 0.1%, 그 외 0.5% */
  autoSlippage: boolean;
}

export const SLIPPAGE_OPTIONS = [0.1, 0.5, 1.0, 3.0] as const;
export const AUTO_SLIPPAGE_STABLE = 0.1;
export const AUTO_SLIPPAGE_DEFAULT = 0.5;
export const HIGH_SLIPPAGE_PERCENT = 3;
const MIN_SLIPPAGE = 0.01;
const MAX_SLIPPAGE = 50;

const STABLECOIN_SYMBOLS = new Set([
  'USDC',
  'USDT',
  'DAI',
  'USDC.E',
  'USDBC',
  'FRAX',
  'LUSD',
]);

/**
 * 실제 견적 요청에 사용할 슬리피지(%)를 정한다.
 */
export function resolveSlippage(
  settings: Pick<SwapSettings, 'autoSlippage' | 'defaultSlippage'>,
  sellSymbol?: string,
  buySymbol?: string,
): number {
  if (!settings.autoSlippage) return settings.defaultSlippage;
  const isStablePair =
    !!sellSymbol &&
    !!buySymbol &&
    STABLECOIN_SYMBOLS.has(sellSymbol.toUpperCase()) &&
    STABLECOIN_SYMBOLS.has(buySymbol.toUpperCase());
  return isStablePair ? AUTO_SLIPPAGE_STABLE : AUTO_SLIPPAGE_DEFAULT;
}

function sanitizeSettings(value: unknown): SwapSettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<
    Record<keyof SwapSettings, unknown>
  >;
  const slippage = Number(raw.defaultSlippage);
  return {
    defaultSlippage:
      Number.isFinite(slippage) &&
      slippage >= MIN_SLIPPAGE &&
      slippage <= MAX_SLIPPAGE
        ? slippage
        : DEFAULT_SETTINGS.defaultSlippage,
    autoSlippage:
      typeof raw.autoSlippage === 'boolean'
        ? raw.autoSlippage
        : DEFAULT_SETTINGS.autoSlippage,
  };
}

interface SwapState {
  // 히스토리
  history: SwapHistoryItem[];
  addHistoryItem: (item: Omit<SwapHistoryItem, 'id'>) => string;
  updateHistoryStatus: (id: string, status: SwapHistoryItem['status']) => void;
  clearHistory: () => void;
  /** 한 네트워크의 내역만 삭제 */
  clearHistoryForChain: (chainId: number) => void;
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
  resetSwapState: () => void;
}

const DEFAULT_SETTINGS: SwapSettings = {
  defaultSlippage: 0.5,
  autoSlippage: true,
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

      clearHistoryForChain: chainId =>
        set(state => ({
          history: state.history.filter(item => item.chainId !== chainId),
        })),

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
          settings: sanitizeSettings({ ...state.settings, ...newSettings }),
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

      resetSwapState: () =>
        set({
          history: [],
          favoritePairs: [],
          settings: DEFAULT_SETTINGS,
          recentTokens: {},
        }),
    }),
    {
      name: 'tori-swap-store',
      version: 1,
      // v0의 거래 기한/가스/전문가 모드 설정은 0x 흐름에서 반영되지 않아 제거한다.
      migrate: persistedState => {
        const state = (persistedState ?? {}) as Partial<SwapState>;
        return { ...state, settings: sanitizeSettings(state.settings) };
      },
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
