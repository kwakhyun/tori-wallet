import { onboardingVault } from '../../src/services/onboardingVault';

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('onboardingVault', () => {
  beforeEach(() => {
    onboardingVault.clear();
    jest.useRealTimers();
  });

  afterEach(() => {
    onboardingVault.clear();
    jest.useRealTimers();
  });

  it('keeps the onboarding secret in memory without navigation payloads', () => {
    onboardingVault.start(MNEMONIC);
    onboardingVault.setWalletAddress(
      '0x1234567890123456789012345678901234567890',
    );

    const snapshot = onboardingVault.getSnapshot();
    expect(snapshot?.mnemonic).toBe(MNEMONIC);
    expect(onboardingVault.isActive(snapshot!.sessionId)).toBe(true);
  });

  it('invalidates the session and notifies subscribers when cleared', () => {
    const listener = jest.fn();
    const unsubscribe = onboardingVault.subscribe(listener);
    onboardingVault.start(MNEMONIC);
    const sessionId = onboardingVault.getSnapshot()!.sessionId;

    onboardingVault.clear();

    expect(onboardingVault.getSnapshot()).toBeNull();
    expect(onboardingVault.isActive(sessionId)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('expires and clears an unfinished flow after ten minutes', () => {
    jest.useFakeTimers();
    onboardingVault.start(MNEMONIC);

    jest.advanceTimersByTime(10 * 60 * 1000);

    expect(onboardingVault.getSnapshot()).toBeNull();
  });
});
