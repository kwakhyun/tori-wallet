import EncryptedStorage from 'react-native-encrypted-storage';

export const PIN_ATTEMPTS_KEY = 'tori_pin_attempts_v1';
const MAX_FREE_ATTEMPTS = 5;
const MAX_DELAY = 60 * 60 * 1000;

interface AttemptState {
  failures: number;
  blockedUntil: number;
}

export class PinLockedError extends Error {
  constructor(readonly retryAt: number) {
    super(
      `PIN 입력이 제한되었습니다. ${Math.max(
        1,
        Math.ceil((retryAt - Date.now()) / 1000),
      )}초 후 다시 시도해주세요.`,
    );
    this.name = 'PinLockedError';
  }
}

/** 모든 PIN 조회 경로가 공유하는 영구 실패 제한. 검증 전에 시도를 기록한다. */
export class PinAttemptService {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly storage: Pick<
      typeof EncryptedStorage,
      'getItem' | 'setItem' | 'removeItem'
    > = EncryptedStorage,
  ) {}

  verify<T>(check: () => Promise<T | null>): Promise<T | null> {
    const task = this.queue.then(async () => {
      const raw = await this.storage.getItem(PIN_ATTEMPTS_KEY);
      const state: AttemptState = raw
        ? JSON.parse(raw)
        : { failures: 0, blockedUntil: 0 };
      if (
        !Number.isSafeInteger(state.failures) ||
        state.failures < 0 ||
        !Number.isSafeInteger(state.blockedUntil) ||
        state.blockedUntil < 0
      )
        throw new Error('PIN 보안 상태를 읽을 수 없습니다.');
      if (Date.now() < state.blockedUntil) {
        throw new PinLockedError(state.blockedUntil);
      }

      const failures = Math.min(state.failures + 1, MAX_FREE_ATTEMPTS + 16);
      const delay =
        failures < MAX_FREE_ATTEMPTS
          ? 0
          : Math.min(MAX_DELAY, 30_000 * 2 ** (failures - MAX_FREE_ATTEMPTS));
      const next = { failures, blockedUntil: delay ? Date.now() + delay : 0 };
      await this.storage.setItem(PIN_ATTEMPTS_KEY, JSON.stringify(next));

      const result = await check();
      if (result !== null) {
        await this.storage.removeItem(PIN_ATTEMPTS_KEY);
      } else if (delay) {
        // KDF 실행 시간이 길어도 실패 후 대기 시간이 줄어들지 않게 한다.
        next.blockedUntil = Date.now() + delay;
        await this.storage.setItem(PIN_ATTEMPTS_KEY, JSON.stringify(next));
        throw new PinLockedError(next.blockedUntil);
      }
      return result;
    });
    this.queue = task.catch(() => undefined);
    return task;
  }

  reset(
    clearWalletStorage: () => Promise<void> = async () => {},
  ): Promise<void> {
    // Keep vault deletion inside the same queue as PIN checks and legacy
    // migrations. No queued check may read or rewrite the vault during reset.
    const task = this.queue.then(async () => {
      const results = await Promise.allSettled([
        this.storage.removeItem(PIN_ATTEMPTS_KEY),
        clearWalletStorage(),
      ]);
      const failure = results.find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
}

export const pinAttemptService = new PinAttemptService();
