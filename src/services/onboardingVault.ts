/**
 * 지갑 생성/복구 중에만 복구 구문을 보관하는 메모리 전용 보관소.
 * 네비게이션 상태, 딥링크, 로그, 영구 저장소에 평문 복구 구문을 넣지 않는다.
 *
 * 앱이 백그라운드로 가거나 10분이 지나면 폐기한다. 이때 사용자가 진행 중이던
 * 흐름이 사라진 이유를 시작 화면에서 설명할 수 있도록 resetNotice를 남긴다.
 */

export type OnboardingSource = 'create' | 'import';

/**
 * - background: 앱이 백그라운드로 전환됨 (보안상 폐기)
 * - expired: 10분 동안 완료하지 않음
 * - cancelled: 사용자가 직접 중단함
 * - completed: 지갑 저장 완료
 */
export type OnboardingClearReason =
  | 'background'
  | 'expired'
  | 'cancelled'
  | 'completed';

export interface OnboardingResetNotice {
  reason: 'background' | 'expired';
  source: OnboardingSource;
}

export interface OnboardingSecretSnapshot {
  sessionId: number;
  mnemonic: string;
  walletAddress?: string;
  source: OnboardingSource;
}

export const ONBOARDING_SESSION_TTL_MS = 10 * 60 * 1000;

class OnboardingVault {
  private snapshot: OnboardingSecretSnapshot | null = null;
  private nextSessionId = 1;
  private clearVersion = 0;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private resetNotice: OnboardingResetNotice | null = null;

  start(
    mnemonic: string,
    walletAddress?: string,
    source: OnboardingSource = walletAddress ? 'import' : 'create',
  ): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.resetNotice = null;
    this.snapshot = {
      sessionId: this.nextSessionId,
      mnemonic,
      walletAddress,
      source,
    };
    this.nextSessionId += 1;
    this.expiryTimer = setTimeout(
      () => this.clear('expired'),
      ONBOARDING_SESSION_TTL_MS,
    );
  }

  setWalletAddress(walletAddress: string): void {
    if (!this.snapshot) throw new Error('Onboarding session expired');
    this.snapshot.walletAddress = walletAddress;
  }

  getSnapshot(): OnboardingSecretSnapshot | null {
    return this.snapshot ? { ...this.snapshot } : null;
  }

  isActive(sessionId: number): boolean {
    return this.snapshot?.sessionId === sessionId;
  }

  clear(reason: OnboardingClearReason = 'cancelled'): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    if (!this.snapshot) return;
    // 구독자(AuthNavigator)가 시작 화면을 다시 그리기 전에 안내를 남긴다.
    this.resetNotice =
      reason === 'background' || reason === 'expired'
        ? { reason, source: this.snapshot.source }
        : null;
    this.snapshot = null;
    this.clearVersion += 1;
    this.listeners.forEach(listener => listener());
  }

  /**
   * 사용자가 흐름을 떠날 때 화면을 다시 그리지 않고 조용히 폐기한다.
   * (예: 가져오기 흐름의 PIN 설정에서 뒤로 가기 — 입력 화면은 이미 비워져 있다)
   * 구독자에게 알리지 않고 clearVersion도 바꾸지 않으므로 AuthNavigator가 시작 화면으로
   * 초기화되지 않는다. 만료 타이머도 함께 해제되어, 나중에 만료나 백그라운드 전환이
   * 이미 떠난 흐름 때문에 다른 화면(입력 중인 가져오기 화면 등)을 초기화하지 않는다.
   */
  discard(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    this.snapshot = null;
    this.resetNotice = null;
  }

  /** 진행 중이던 흐름이 보안상 폐기되었다면 그 이유. 새 흐름을 시작하면 사라진다. */
  getResetNotice(): OnboardingResetNotice | null {
    return this.resetNotice ? { ...this.resetNotice } : null;
  }

  dismissResetNotice(): void {
    this.resetNotice = null;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getClearVersion = (): number => this.clearVersion;
}

export const onboardingVault = new OnboardingVault();
