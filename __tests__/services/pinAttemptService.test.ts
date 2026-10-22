import {
  PinAttemptService,
  PinLockedError,
  PIN_ATTEMPTS_KEY,
} from '../../src/services/pinAttemptService';

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
