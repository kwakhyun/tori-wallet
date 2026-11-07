import {
  describePinAttemptWarning,
  formatLockoutDuration,
  formatLockoutRemaining,
  isWeakPin,
  lockoutDelayForFailure,
  PinAttemptService,
  PinLockedError,
  PIN_ATTEMPTS_KEY,
  remainingAttemptsBeforeLockout,
} from '../../src/services/pinAttemptService';

describe('PIN lockout display helpers', () => {
  it('formats the remaining lockout as mm:ss instead of seconds', () => {
    expect(formatLockoutRemaining(3_600_000)).toBe('60:00');
    expect(formatLockoutRemaining(65_000)).toBe('01:05');
    expect(formatLockoutRemaining(29_001)).toBe('00:30');
    expect(formatLockoutRemaining(0)).toBe('00:00');
    expect(formatLockoutRemaining(-5)).toBe('00:00');
  });

  it('mirrors the lockout policy: free attempts, then 30s doubling to 1h', () => {
    expect([1, 2, 3, 4].map(lockoutDelayForFailure)).toEqual([0, 0, 0, 0]);
    expect(lockoutDelayForFailure(5)).toBe(30_000);
    expect(lockoutDelayForFailure(6)).toBe(60_000);
    expect(lockoutDelayForFailure(12)).toBe(3_600_000);
    expect(lockoutDelayForFailure(21)).toBe(3_600_000);
    expect(remainingAttemptsBeforeLockout(0)).toBe(5);
    expect(remainingAttemptsBeforeLockout(4)).toBe(1);
    expect(remainingAttemptsBeforeLockout(7)).toBe(0);
  });

  it('describes durations and the upcoming lockout in Korean', () => {
    expect(formatLockoutDuration(30_000)).toBe('30초');
    expect(formatLockoutDuration(120_000)).toBe('2분');
    expect(formatLockoutDuration(3_600_000)).toBe('1시간');
    expect(describePinAttemptWarning(0)).toBeNull();
    expect(describePinAttemptWarning(1)).toBe(
      '4번 더 틀리면 PIN 입력이 30초 동안 제한됩니다.',
    );
    expect(describePinAttemptWarning(5)).toBe(
      '다시 틀리면 PIN 입력이 1분 동안 제한됩니다.',
    );
  });

  it('formats PinLockedError without raw second counts', () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    expect(new PinLockedError(3_600_000).message).toBe(
      'PIN 입력이 제한되었습니다. 60:00 후 다시 시도해주세요.',
    );
    jest.useRealTimers();
  });

  it.each([
    '000000',
    '111111',
    '123456',
    '234567',
    '567890',
    '654321',
    '098765',
    '121212',
    '123123',
  ])('rejects the weak PIN %s', pin => {
    expect(isWeakPin(pin)).toBe(true);
  });

  it.each(['135790', '258036', '102938', '112358', '860413'])(
    'accepts %s',
    pin => {
      expect(isWeakPin(pin)).toBe(false);
    },
  );
});

describe('durable PIN attempt limit', () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: jest.fn(async (key: string) => data.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      data.delete(key);
    }),
  };
  beforeEach(() => {
    data.clear();
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(100_000);
  });
  afterEach(() => jest.useRealTimers());

  it('blocks the fifth failure and keeps the lock across instances and time', async () => {
    const check = jest.fn(async () => null);
    const service = new PinAttemptService(storage);
    for (let i = 0; i < 4; i++) await service.verify(check);
    await expect(service.verify(check)).rejects.toBeInstanceOf(PinLockedError);
    const restarted = new PinAttemptService(storage);
    await expect(restarted.verify(check)).rejects.toBeInstanceOf(
      PinLockedError,
    );
    expect(check).toHaveBeenCalledTimes(5);
    jest.advanceTimersByTime(30_000);
    await expect(restarted.verify(check)).rejects.toMatchObject({
      retryAt: 190_000,
    });
  });

  it('serializes concurrent attempts and never decrypts during a lock', async () => {
    const check = jest.fn(async () => null);
    const service = new PinAttemptService(storage);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => service.verify(check)),
    );
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(6);
    expect(check).toHaveBeenCalledTimes(5);
  });

  it('starts the full cooldown after a slow PIN verification finishes', async () => {
    const service = new PinAttemptService(storage);
    for (let i = 0; i < 4; i++) await service.verify(async () => null);
    await expect(
      service.verify(async () => {
        jest.advanceTimersByTime(60_000);
        return null;
      }),
    ).rejects.toMatchObject({ retryAt: 190_000 });

    const check = jest.fn(async () => 'secret');
    jest.advanceTimersByTime(29_999);
    await expect(
      new PinAttemptService(storage).verify(check),
    ).rejects.toBeInstanceOf(PinLockedError);
    expect(check).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await expect(service.verify(check)).resolves.toBe('secret');
  });

  it('clears failures only after successful verification and resets on wallet deletion', async () => {
    const service = new PinAttemptService(storage);
    await service.verify(async () => null);
    await expect(service.verify(async () => 'mnemonic')).resolves.toBe(
      'mnemonic',
    );
    expect(data.has(PIN_ATTEMPTS_KEY)).toBe(false);
    await service.verify(async () => null);
    await service.reset();
    expect(data.size).toBe(0);
  });

  it('fails closed on corrupt storage and storage write failure', async () => {
    const check = jest.fn(async () => 'secret');
    const service = new PinAttemptService(storage);
    data.set(PIN_ATTEMPTS_KEY, '{}');
    await expect(service.verify(check)).rejects.toThrow();
    data.clear();
    storage.setItem.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(service.verify(check)).rejects.toThrow('storage unavailable');
    expect(check).not.toHaveBeenCalled();
  });

  it('reports the stored status without recording an attempt', async () => {
    const service = new PinAttemptService(storage);
    await expect(service.getStatus()).resolves.toEqual({
      failures: 0,
      blockedUntil: 0,
    });
    for (let i = 0; i < 4; i++) await service.verify(async () => null);
    await expect(service.verify(async () => null)).rejects.toBeInstanceOf(
      PinLockedError,
    );
    await expect(service.getStatus()).resolves.toEqual({
      failures: 5,
      blockedUntil: 130_000,
    });
    await service.getStatus();
    expect(JSON.parse(data.get(PIN_ATTEMPTS_KEY)!).failures).toBe(5);
  });

  it('holds new PIN checks until wallet deletion completes', async () => {
    const service = new PinAttemptService(storage);
    let completeDeletion!: () => void;
    let deletionStarted!: () => void;
    const started = new Promise<void>(resolve => {
      deletionStarted = resolve;
    });
    const deletion = service.reset(() => {
      deletionStarted();
      return new Promise<void>(resolve => {
        completeDeletion = resolve;
      });
    });
    await started;
    const check = jest.fn(async () => null);
    const authentication = service.verify(check);
    await Promise.resolve();
    expect(check).not.toHaveBeenCalled();
    completeDeletion();
    await Promise.all([deletion, authentication]);
    expect(check).toHaveBeenCalledTimes(1);
  });
});
