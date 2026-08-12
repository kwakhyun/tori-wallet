/**
 * 지갑 생성/복구 중에만 니모닉을 보관하는 메모리 전용 보관소.
 * 네비게이션 상태, 딥링크, 로그, 영구 저장소에 평문 니모닉을 넣지 않는다.
 */

export interface OnboardingSecretSnapshot {
  sessionId: number;
  mnemonic: string;
  walletAddress?: string;
}

class OnboardingVault {
  private snapshot: OnboardingSecretSnapshot | null = null;
  private nextSessionId = 1;
  private clearVersion = 0;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();

  start(mnemonic: string, walletAddress?: string): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.snapshot = {
      sessionId: this.nextSessionId,
      mnemonic,
      walletAddress,
    };
    this.nextSessionId += 1;
    this.expiryTimer = setTimeout(() => this.clear(), 10 * 60 * 1000);
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

  clear(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    if (!this.snapshot) return;
    this.snapshot = null;
    this.clearVersion += 1;
    this.listeners.forEach(listener => listener());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getClearVersion = (): number => this.clearVersion;
}

export const onboardingVault = new OnboardingVault();
