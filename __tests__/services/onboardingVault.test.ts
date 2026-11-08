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

    jest.advanceTimersByTime(10 * 60 * 1000 - 1);
    expect(onboardingVault.getSnapshot()).not.toBeNull();
    jest.advanceTimersByTime(1);

    expect(onboardingVault.getSnapshot()).toBeNull();
    expect(onboardingVault.getResetNotice()).toEqual({
      reason: 'expired',
      source: 'create',
    });
  });

  it('discards an abandoned flow quietly so later expiry or background clears do nothing', () => {
    jest.useFakeTimers();
    const listener = jest.fn();
    const unsubscribe = onboardingVault.subscribe(listener);
    onboardingVault.start(
      MNEMONIC,
      '0x1234567890123456789012345678901234567890',
      'import',
    );
    const version = onboardingVault.getClearVersion();

    onboardingVault.discard();

    expect(onboardingVault.getSnapshot()).toBeNull();
    // AuthNavigator가 다시 그려지지 않는다 (사용자가 있는 가져오기 화면 유지).
    expect(listener).not.toHaveBeenCalled();
    expect(onboardingVault.getClearVersion()).toBe(version);

    // 만료 타이머도 해제되어 10분 뒤 시작 화면 초기화/안내가 생기지 않는다.
    jest.advanceTimersByTime(10 * 60 * 1000);
    onboardingVault.clear('background');
    expect(listener).not.toHaveBeenCalled();
    expect(onboardingVault.getResetNotice()).toBeNull();
    unsubscribe();
  });

  it('records why an in-progress flow was discarded for the welcome screen', () => {
    onboardingVault.start(
      MNEMONIC,
      '0x1234567890123456789012345678901234567890',
    );
    expect(onboardingVault.getSnapshot()?.source).toBe('import');

    onboardingVault.clear('background');

    expect(onboardingVault.getResetNotice()).toEqual({
      reason: 'background',
      source: 'import',
    });
  });

  it('sets the notice before notifying subscribers', () => {
    let seen: unknown = 'unset';
    const unsubscribe = onboardingVault.subscribe(() => {
      seen = onboardingVault.getResetNotice();
    });
    onboardingVault.start(MNEMONIC);
    onboardingVault.clear('background');
    expect(seen).toEqual({ reason: 'background', source: 'create' });
    unsubscribe();
  });

  it.each(['cancelled', 'completed'] as const)(
    'does not leave a notice when the flow was %s',
    reason => {
      onboardingVault.start(MNEMONIC);
      onboardingVault.clear(reason);
      expect(onboardingVault.getResetNotice()).toBeNull();
    },
  );

  it('does not leave a notice when nothing was in progress', () => {
    onboardingVault.dismissResetNotice();
    onboardingVault.clear('background');
    expect(onboardingVault.getResetNotice()).toBeNull();
  });

  it('drops the notice when a new flow starts or it is dismissed', () => {
    onboardingVault.start(MNEMONIC);
    onboardingVault.clear('background');
    onboardingVault.start(MNEMONIC);
    expect(onboardingVault.getResetNotice()).toBeNull();

    onboardingVault.clear('expired');
    onboardingVault.dismissResetNotice();
    expect(onboardingVault.getResetNotice()).toBeNull();
  });
});
