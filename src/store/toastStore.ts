/**
 * 인앱 토스트 스토어
 *
 * "복사됨", "저장됨" 같은 가벼운 결과 안내는 화면을 막는 Alert 대신 토스트로 표시한다.
 * 확인/취소가 필요한 결정에만 Alert를 사용한다.
 */

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastState {
  current: ToastMessage | null;
  queue: ToastMessage[];
  show: (message: string, type?: ToastType, duration?: number) => void;
  dismiss: (id?: number) => void;
  reset: () => void;
}

let nextId = 1;
const DEFAULT_DURATION = 2500;
const MAX_QUEUE = 3;

export const useToastStore = create<ToastState>()((set, get) => ({
  current: null,
  queue: [],

  show: (message, type = 'info', duration = DEFAULT_DURATION) => {
    const toast: ToastMessage = { id: nextId++, message, type, duration };
    const { current, queue } = get();
    if (!current) {
      set({ current: toast });
      return;
    }
    // 같은 메시지가 연속으로 쌓이지 않도록 한다.
    if (
      current.message === message ||
      queue.some(item => item.message === message)
    ) {
      return;
    }
    set({ queue: [...queue, toast].slice(-MAX_QUEUE) });
  },

  dismiss: id => {
    const { current, queue } = get();
    if (!current || (id !== undefined && current.id !== id)) return;
    const [next, ...rest] = queue;
    set({ current: next ?? null, queue: rest });
  },

  reset: () => set({ current: null, queue: [] }),
}));

/** 컴포넌트 밖에서도 사용할 수 있는 토스트 표시 함수 */
export function showToast(
  message: string,
  type: ToastType = 'info',
  duration?: number,
): void {
  useToastStore.getState().show(message, type, duration);
}
