/**
 * 같은 뷰 컨트롤러에서 표시 중이거나 닫히는 중인 모달 목록 (AppModal 내부용)
 *
 * iOS는 한 VC가 모달 하나만 present할 수 있고, 닫히는 애니메이션 중에도 새 present를
 * 거부한다. AppModal은 이 목록이 비었을 때만 새 모달을 띄운다. 의존성이 없는 모듈로
 * 두어 테스트 설정에서 가볍게 초기화할 수 있게 한다.
 */

/**
 * onShow/onDismiss가 오지 않을 때(거부된 present, 언마운트된 모달) 표시/닫힘이
 * 끝났다고 보는 시간. iOS 모달 애니메이션(약 0.3~0.5초)보다 길다.
 */
export const MODAL_PRESENCE_FALLBACK_MS = 600;

export interface PresenceToken {
  readonly id: number;
}

/** 같은 VC에서 표시 중이거나 닫히는 중인 모달 목록 */
export interface ModalPresenceRegistry {
  isIdle: () => boolean;
  isActive: (token: PresenceToken) => boolean;
  acquire: () => PresenceToken;
  release: (token: PresenceToken) => void;
  /** 대체 타이머 후 해제한다. 이미 예약되어 있으면 기존 예약을 유지한다. */
  releaseLater: (token: PresenceToken, delayMs?: number) => void;
  subscribe: (listener: () => void) => () => void;
  reset: () => void;
}

let nextTokenId = 1;

export function createModalPresenceRegistry(): ModalPresenceRegistry {
  const active = new Set<PresenceToken>();
  const timers = new Map<PresenceToken, ReturnType<typeof setTimeout>>();
  const listeners = new Set<() => void>();
  const emit = () => {
    listeners.forEach(listener => listener());
  };
  const release = (token: PresenceToken) => {
    const timer = timers.get(token);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(token);
    }
    if (active.delete(token)) emit();
  };
  return {
    isIdle: () => active.size === 0,
    isActive: token => active.has(token),
    acquire: () => {
      const token = { id: nextTokenId++ };
      active.add(token);
      emit();
      return token;
    },
    release,
    releaseLater: (token, delayMs = MODAL_PRESENCE_FALLBACK_MS) => {
      if (!active.has(token) || timers.has(token)) return;
      timers.set(
        token,
        setTimeout(() => release(token), delayMs),
      );
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset: () => {
      timers.forEach(timer => clearTimeout(timer));
      timers.clear();
      if (active.size > 0) {
        active.clear();
        emit();
      }
    },
  };
}

/** 루트 VC(화면 모달과 WalletConnect 호스트 모달)가 표시하는 모달 */
export const rootModalPresence = createModalPresenceRegistry();

/** 루트 범위에 표시 중이거나 닫히는 중인 AppModal이 있는지 */
export function isRootModalPresent(): boolean {
  return !rootModalPresence.isIdle();
}

/** 테스트 전용: 테스트 사이에 남은 표시 상태와 타이머를 지운다. */
export function resetModalPresence(): void {
  rootModalPresence.reset();
}
