/**
 * 설정 화면 공용 PIN 확인 훅 테스트
 */

import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { usePinVerification } from '../../../src/screens/Settings/hooks/usePinVerification';
import { PinLockedError } from '../../../src/services/pinAttemptService';
import { useWalletStore } from '../../../src/store/walletStore';

const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const mockRetrieveMnemonicWithPin = jest.fn();
jest.mock('../../../src/services/walletService', () => ({
  walletService: {
    retrieveMnemonicWithPin: (pin: string) => mockRetrieveMnemonicWithPin(pin),
    validateMnemonic: (value: string) => value.split(' ').length === 12,
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('usePinVerification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useWalletStore.setState({ isLocked: false });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('verifies the PIN without any artificial delay', async () => {
    jest.useFakeTimers();
    mockRetrieveMnemonicWithPin.mockResolvedValue(MNEMONIC);
    const { result } = renderHook(() => usePinVerification());

    let outcome: Awaited<ReturnType<typeof result.current.verify>> | undefined;
    // 타이머를 전혀 진행하지 않아도 결과가 나와야 한다 (가짜 진행률 지연 없음).
    await act(async () => {
      outcome = await result.current.verify('123456');
    });

    expect(outcome).toEqual({ status: 'verified', mnemonic: MNEMONIC });
    expect(mockRetrieveMnemonicWithPin).toHaveBeenCalledWith('123456');
    expect(result.current.isVerifying).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('reports an incorrect PIN', async () => {
    mockRetrieveMnemonicWithPin.mockResolvedValue(null);
    const { result } = renderHook(() => usePinVerification());

    let outcome: Awaited<ReturnType<typeof result.current.verify>> | undefined;
    await act(async () => {
      outcome = await result.current.verify('000000');
    });

    expect(outcome).toMatchObject({ status: 'failed', reason: 'invalid' });
    expect(result.current.error).toBe('PIN이 올바르지 않습니다.');
  });

  it('respects the shared PIN lockout and surfaces its message', async () => {
    const lock = new PinLockedError(Date.now() + 30_000);
    mockRetrieveMnemonicWithPin.mockRejectedValue(lock);
    const { result } = renderHook(() => usePinVerification());

    let outcome: Awaited<ReturnType<typeof result.current.verify>> | undefined;
    await act(async () => {
      outcome = await result.current.verify('123456');
    });

    expect(outcome).toEqual({
      status: 'failed',
      reason: 'locked',
      message: lock.message,
      retryAt: lock.retryAt,
    });
    expect(result.current.error).toContain('PIN 입력이 제한되었습니다');
  });

  it('rejects malformed PINs without touching the vault', async () => {
    const { result } = renderHook(() => usePinVerification());

    let outcome: Awaited<ReturnType<typeof result.current.verify>> | undefined;
    await act(async () => {
      outcome = await result.current.verify('12a4');
    });

    expect(outcome).toMatchObject({ status: 'failed', reason: 'format' });
    expect(mockRetrieveMnemonicWithPin).not.toHaveBeenCalled();
  });

  it('discards the mnemonic when the wallet locks during verification', async () => {
    const pending = deferred<string | null>();
    mockRetrieveMnemonicWithPin.mockReturnValue(pending.promise);
    const { result } = renderHook(() => usePinVerification());

    let verification!: ReturnType<typeof result.current.verify>;
    act(() => {
      verification = result.current.verify('123456');
    });
    act(() => {
      useWalletStore.setState({ isLocked: true });
    });
    pending.resolve(MNEMONIC);

    await act(async () => {
      await expect(verification).resolves.toEqual({ status: 'cancelled' });
    });
  });

  it('discards the result when the app moves to the background', async () => {
    const pending = deferred<string | null>();
    mockRetrieveMnemonicWithPin.mockReturnValue(pending.promise);
    const addListener = AppState.addEventListener as jest.Mock;
    addListener.mockClear();
    const { result } = renderHook(() => usePinVerification());
    const handler = addListener.mock.calls[0][1] as (state: string) => void;

    let verification!: ReturnType<typeof result.current.verify>;
    act(() => {
      verification = result.current.verify('123456');
    });
    act(() => handler('background'));
    pending.resolve(MNEMONIC);

    await act(async () => {
      await expect(verification).resolves.toEqual({ status: 'cancelled' });
    });
  });

  it('ignores a second submission while one is in flight', async () => {
    const pending = deferred<string | null>();
    mockRetrieveMnemonicWithPin.mockReturnValue(pending.promise);
    const { result } = renderHook(() => usePinVerification());

    let first!: ReturnType<typeof result.current.verify>;
    let second!: ReturnType<typeof result.current.verify>;
    act(() => {
      first = result.current.verify('123456');
      second = result.current.verify('123456');
    });

    await act(async () => {
      await expect(second).resolves.toEqual({ status: 'cancelled' });
      pending.resolve(MNEMONIC);
      await expect(first).resolves.toMatchObject({ status: 'verified' });
    });
    expect(mockRetrieveMnemonicWithPin).toHaveBeenCalledTimes(1);
  });
});
