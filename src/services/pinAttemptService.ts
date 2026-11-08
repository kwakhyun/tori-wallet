import EncryptedStorage from 'react-native-encrypted-storage';

export const PIN_ATTEMPTS_KEY = 'tori_pin_attempts_v1';
/** 이 횟수만큼 연속으로 틀리면(5번째 실패부터) 입력이 제한된다. */
export const MAX_FREE_PIN_ATTEMPTS = 5;
const MAX_FREE_ATTEMPTS = MAX_FREE_PIN_ATTEMPTS;
const BASE_DELAY = 30_000;
const MAX_DELAY = 60 * 60 * 1000;

interface AttemptState {
  failures: number;
  blockedUntil: number;
}

export type PinAttemptStatus = Readonly<AttemptState>;

/** n번째 연속 실패가 발생시키는 제한 시간(ms). 제한이 없으면 0. */
export function lockoutDelayForFailure(failures: number): number {
  return failures < MAX_FREE_ATTEMPTS
    ? 0
    : Math.min(MAX_DELAY, BASE_DELAY * 2 ** (failures - MAX_FREE_ATTEMPTS));
}

/** 입력 제한이 시작되기 전까지 남은 시도 횟수. 이미 제한 정책이 적용 중이면 0. */
export function remainingAttemptsBeforeLockout(failures: number): number {
  return Math.max(0, MAX_FREE_ATTEMPTS - Math.max(0, failures));
}

/** 남은 제한 시간을 mm:ss 형식으로 표시한다. (예: 3600000 → "60:00") */
export function formatLockoutRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0',
  )}`;
}

/** 제한 시간을 읽기 쉬운 한국어로 표시한다. (예: 30000 → "30초", 120000 → "2분") */
export function formatLockoutDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}초`;
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}분`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}시간 ${minutes}분` : `${hours}시간`;
}

/**
 * 실패 후 표시할 경고 문구. 실패 기록이 없으면 null.
 * (예: "3번 더 틀리면 PIN 입력이 30초 동안 제한됩니다.")
 */
export function describePinAttemptWarning(failures: number): string | null {
  if (failures <= 0) return null;
  const remaining = remainingAttemptsBeforeLockout(failures);
  if (remaining > 0) {
    const delay = lockoutDelayForFailure(failures + remaining);
    return `${remaining}번 더 틀리면 PIN 입력이 ${formatLockoutDuration(
      delay,
    )} 동안 제한됩니다.`;
  }
  const delay = lockoutDelayForFailure(failures + 1);
  return `다시 틀리면 PIN 입력이 ${formatLockoutDuration(
    delay,
  )} 동안 제한됩니다.`;
}

/** 추측하기 쉬운 PIN을 거부할 때 표시하는 공통 문구 (PIN 설정·PIN 변경) */
export const WEAK_PIN_MESSAGE =
  '추측하기 쉬운 PIN입니다. 같은 숫자 반복(111111), 연속된 숫자(123456, 654321), 반복 패턴(121212)은 사용할 수 없습니다.';

/**
 * 추측하기 쉬운 PIN인지 확인한다.
 *  - 같은 숫자 반복: 000000, 111111
 *  - 연속된 숫자: 123456, 234567, 567890, 654321, 098765
 *  - 반복 패턴: 121212, 123123
 */
export function isWeakPin(pin: string): boolean {
  if (!/^\d+$/.test(pin) || pin.length < 2) return false;
  const digits = pin.split('').map(Number);
  const steps = digits
    .slice(1)
    .map((digit, index) => (digit - digits[index] + 10) % 10);
  if (steps.every(step => step === 0)) return true;
  if (steps.every(step => step === 1) || steps.every(step => step === 9)) {
    return true;
  }
  return [2, 3].some(
    size =>
      pin.length > size &&
      pin.length % size === 0 &&
      pin.slice(0, size).repeat(pin.length / size) === pin,
  );
}

export class PinLockedError extends Error {
  constructor(readonly retryAt: number) {
    super(
      `PIN 입력이 제한되었습니다. ${formatLockoutRemaining(
        Math.max(1000, retryAt - Date.now()),
      )} 후 다시 시도해주세요.`,
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

  private async readState(): Promise<AttemptState> {
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
    return state;
  }

  /**
   * 화면 표시용 현재 실패 횟수와 제한 해제 시각. 시도를 기록하지 않으며
   * 앞서 대기 중인 PIN 검증이 끝난 뒤의 상태를 반환한다.
   */
  getStatus(): Promise<PinAttemptStatus> {
    return this.queue.then(async () => {
      const { failures, blockedUntil } = await this.readState();
      return { failures, blockedUntil };
    });
  }

  verify<T>(check: () => Promise<T | null>): Promise<T | null> {
    const task = this.queue.then(async () => {
      const state = await this.readState();
      if (Date.now() < state.blockedUntil) {
        throw new PinLockedError(state.blockedUntil);
      }

      const failures = Math.min(state.failures + 1, MAX_FREE_ATTEMPTS + 16);
      const delay = lockoutDelayForFailure(failures);
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
