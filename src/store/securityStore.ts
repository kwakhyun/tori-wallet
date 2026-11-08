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
  /** 금액을 모르면(undefined·null·NaN·Infinity) 보수적으로 PIN을 요구한다. */
  requiresTransactionPin: (usdValue?: number | null) => boolean;
  resetSecurityState: () => void;
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

      setTransactionLimit: limit => {
        if (limit !== null && (!Number.isFinite(limit) || limit < 0)) {
          throw new Error('유효하지 않은 한도 금액입니다.');
        }
        set({ transactionLimit: limit });
      },

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
        const timeoutMs = AUTO_LOCK_OPTIONS[autoLockTimeout];
        if (timeoutMs === 0) return true; // immediate

        return Date.now() - lastActiveTime > timeoutMs;
      },

      requiresTransactionPin: usdValue => {
        const { requirePinForTransaction, transactionLimit } = get();
        if (requirePinForTransaction) return true;
        if (transactionLimit === null) return false;
        // null/NaN은 '모르는 금액'이다. 비교식(NaN > limit === false)에 맡기면 PIN을 건너뛴다.
        if (usdValue == null || !Number.isFinite(usdValue)) return true;
        return usdValue > transactionLimit;
      },

      resetSecurityState: () => set(initialState),
    }),
    {
      name: 'tori-security-storage',
      version: 2,
      migrate: persistedState => {
        const state = persistedState as Partial<SecurityState>;
        return state.autoLockTimeout === ('never' as AutoLockOption)
          ? { ...state, autoLockTimeout: '1m' as AutoLockOption }
          : state;
      },
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

/** PIN 없이 보낼 수 있는 한도의 상한 (USD) */
export const MAX_TRANSACTION_LIMIT_USD = 1_000_000_000;

/**
 * 한도 변경이 보안을 약하게 만드는지 (PIN 재확인 필요 여부)
 *
 * PIN 항상 요구가 꺼져 있을 때 한도 없음(null)은 "모든 거래를 PIN 없이"를 뜻하므로
 * 가장 약한 설정이다. 한도를 없애거나 올리는 변경만 약화로 본다.
 */
export function isTransactionLimitWeakening(
  current: number | null,
  next: number | null,
): boolean {
  if (current === null) return false;
  if (next === null) return true;
  return next > current;
}

/**
 * 한도 입력값을 해석한다. 빈 값은 한도 없음(null).
 * 0 이상의 숫자, 소수점 둘째 자리까지, 쉼표 허용.
 */
export function parseTransactionLimitInput(
  input: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const normalized = input.replace(/[,\s$]/g, '');
  if (normalized === '') return { ok: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return {
      ok: false,
      error: '0 이상의 숫자를 소수점 둘째 자리까지 입력해주세요.',
    };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value > MAX_TRANSACTION_LIMIT_USD) {
    return { ok: false, error: '한도가 너무 큽니다.' };
  }
  return { ok: true, value };
}

/** 한도 표시: null은 "한도 없음", 0은 "$0"으로 표시한다(무제한이 아니다). */
export function formatTransactionLimitUsd(limit: number | null): string {
  if (limit === null) return '한도 없음';
  return `$${limit.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

// 자동 잠금 타이머 레이블
export const AUTO_LOCK_LABELS: Record<AutoLockOption, string> = {
  immediate: '즉시',
  '30s': '30초',
  '1m': '1분',
  '5m': '5분',
  '15m': '15분',
};
