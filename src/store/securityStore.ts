/**
 * 보안 설정 및 주소록 관리 스토어
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 자동 잠금 타이머 옵션 (밀리초)
export const AUTO_LOCK_OPTIONS = {
  immediate: 0,
  '30s': 30 * 1000,
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  never: -1,
} as const;

export type AutoLockOption = keyof typeof AUTO_LOCK_OPTIONS;

// 주소록 항목
export interface AddressBookEntry {
  id: string;
  name: string;
  address: `0x${string}`;
  chainId?: number; // 특정 체인에서만 사용
  memo?: string;
  createdAt: number;
  lastUsedAt?: number;
}

interface SecurityState {
  // 자동 잠금 설정
  autoLockTimeout: AutoLockOption;
  lastActiveTime: number;

  // 트랜잭션 보안
  requirePinForTransaction: boolean;
  transactionLimit: number | null; // null = 무제한, 단위: USD

  // 주소록
  addressBook: AddressBookEntry[];

  // 최근 사용 주소 (자동 저장)
  recentAddresses: { address: `0x${string}`; lastUsed: number }[];

  // Actions
  setAutoLockTimeout: (timeout: AutoLockOption) => void;
  updateLastActiveTime: () => void;
  setRequirePinForTransaction: (require: boolean) => void;
  setTransactionLimit: (limit: number | null) => void;

  // 주소록 Actions
  addAddressBookEntry: (
    entry: Omit<AddressBookEntry, 'id' | 'createdAt'>,
  ) => void;
  updateAddressBookEntry: (
    id: string,
    updates: Partial<AddressBookEntry>,
  ) => void;
  removeAddressBookEntry: (id: string) => void;
  getAddressBookEntry: (address: string) => AddressBookEntry | undefined;

  // 최근 주소 Actions
  addRecentAddress: (address: `0x${string}`) => void;
  clearRecentAddresses: () => void;

  // 자동 잠금 체크
  shouldAutoLock: () => boolean;
}

const initialState = {
  autoLockTimeout: '1m' as AutoLockOption,
  lastActiveTime: Date.now(),
  requirePinForTransaction: true,
  transactionLimit: null,
  addressBook: [] as AddressBookEntry[],
  recentAddresses: [] as { address: `0x${string}`; lastUsed: number }[],
};

export const useSecurityStore = create<SecurityState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setAutoLockTimeout: timeout => set({ autoLockTimeout: timeout }),

      updateLastActiveTime: () => set({ lastActiveTime: Date.now() }),

      setRequirePinForTransaction: require =>
        set({ requirePinForTransaction: require }),

      setTransactionLimit: limit => set({ transactionLimit: limit }),

      // 주소록 추가
      addAddressBookEntry: entry =>
        set(state => ({
          addressBook: [
            ...state.addressBook,
            {
              ...entry,
              id: `addr_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              createdAt: Date.now(),
            },
          ],
        })),

      // 주소록 수정
      updateAddressBookEntry: (id, updates) =>
        set(state => ({
          addressBook: state.addressBook.map(entry =>
            entry.id === id ? { ...entry, ...updates } : entry,
          ),
        })),

      // 주소록 삭제
      removeAddressBookEntry: id =>
        set(state => ({
          addressBook: state.addressBook.filter(entry => entry.id !== id),
        })),

      // 주소로 주소록 항목 찾기
      getAddressBookEntry: address => {
        const normalizedAddress = address.toLowerCase();
        return get().addressBook.find(
          entry => entry.address.toLowerCase() === normalizedAddress,
        );
      },

      // 최근 주소 추가 (최대 10개)
      addRecentAddress: address =>
        set(state => {
          const filtered = state.recentAddresses.filter(
            r => r.address.toLowerCase() !== address.toLowerCase(),
          );
          return {
            recentAddresses: [
              { address, lastUsed: Date.now() },
              ...filtered,
            ].slice(0, 10),
          };
        }),

      // 최근 주소 초기화
      clearRecentAddresses: () => set({ recentAddresses: [] }),

      // 자동 잠금 필요 여부 체크
      shouldAutoLock: () => {
        const { autoLockTimeout, lastActiveTime } = get();
        if (autoLockTimeout === 'never') return false;

        const timeoutMs = AUTO_LOCK_OPTIONS[autoLockTimeout];
        if (timeoutMs === 0) return true; // immediate

        return Date.now() - lastActiveTime > timeoutMs;
      },
    }),
    {
      name: 'tori-security-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({
        autoLockTimeout: state.autoLockTimeout,
        requirePinForTransaction: state.requirePinForTransaction,
        transactionLimit: state.transactionLimit,
        addressBook: state.addressBook,
        recentAddresses: state.recentAddresses,
      }),
    },
  ),
);

// 자동 잠금 타이머 레이블
export const AUTO_LOCK_LABELS: Record<AutoLockOption, string> = {
  immediate: '즉시',
  '30s': '30초',
  '1m': '1분',
  '5m': '5분',
  '15m': '15분',
  never: '사용 안함',
};
