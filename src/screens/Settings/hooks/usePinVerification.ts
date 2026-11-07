/**
 * 설정 화면 공용 PIN 확인 훅
 *
 * 복구 구문 보기, PIN 변경, 생체인증 활성화, 지갑 삭제, 보안 약화 설정 변경이 모두
 * 같은 경로(walletService.retrieveMnemonicWithPin → pinAttemptService)로 PIN을 확인한다.
 *  - 실패 횟수 제한/잠금(PinLockedError)은 서비스가 그대로 적용하고 메시지를 전달한다.
 *  - 인위적인 지연(가짜 진행률)은 두지 않는다. 실제 소요 시간은 키 유도(KDF)뿐이다.
 *  - 화면 종료, 취소, 백그라운드 전환, 지갑 잠금 이후 도착한 결과는 폐기한다.
 *    폐기된 결과의 니모닉은 호출 측에 전달하지 않는다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { walletService } from '@/services/walletService';
import { PinLockedError } from '@/services/pinAttemptService';
import { useWalletStore } from '@/store/walletStore';

export const PIN_LENGTH = 6;

export type PinFailureReason = 'format' | 'invalid' | 'locked' | 'error';

export type PinVerificationResult =
  | { status: 'verified'; mnemonic: string }
  | { status: 'failed'; reason: PinFailureReason; message: string }
  /** 취소/화면 종료/백그라운드/잠금으로 결과를 폐기함 (안내 불필요) */
  | { status: 'cancelled' };

export const PIN_MESSAGES = {
  format: `PIN은 ${PIN_LENGTH}자리 숫자입니다.`,
  invalid: 'PIN이 올바르지 않습니다.',
  error: 'PIN 확인에 실패했습니다. 다시 시도해주세요.',
} as const;

export interface UsePinVerificationResult {
  verify: (pin: string) => Promise<PinVerificationResult>;
  cancel: () => void;
  isVerifying: boolean;
  error: string | null;
  clearError: () => void;
}

export function usePinVerification(): UsePinVerificationResult {
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const busy = useRef(false);

  const cancel = useCallback(() => {
    generation.current += 1;
    busy.current = false;
    if (mounted.current) setIsVerifying(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') cancel();
    });
    const unsubscribeLock = useWalletStore.subscribe((state, previous) => {
      if (state.isLocked && !previous.isLocked) cancel();
    });
    return () => {
      mounted.current = false;
      generation.current += 1;
      busy.current = false;
      subscription.remove();
      unsubscribeLock();
    };
  }, [cancel]);

  const clearError = useCallback(() => setError(null), []);

  const verify = useCallback(
    async (pin: string): Promise<PinVerificationResult> => {
      if (busy.current || !mounted.current) return { status: 'cancelled' };
      if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
        setError(PIN_MESSAGES.format);
        return {
          status: 'failed',
          reason: 'format',
          message: PIN_MESSAGES.format,
        };
      }

      busy.current = true;
      const attempt = ++generation.current;
      const isActive = () =>
        mounted.current &&
        attempt === generation.current &&
        AppState.currentState !== 'background' &&
        !useWalletStore.getState().isLocked;

      setIsVerifying(true);
      setError(null);
      let result: PinVerificationResult;
      try {
        const mnemonic = await walletService.retrieveMnemonicWithPin(pin);
        if (!isActive()) {
          result = { status: 'cancelled' };
        } else if (mnemonic && walletService.validateMnemonic(mnemonic)) {
          result = { status: 'verified', mnemonic };
        } else {
          result = {
            status: 'failed',
            reason: 'invalid',
            message: PIN_MESSAGES.invalid,
          };
        }
      } catch (reason) {
        if (!isActive()) {
          result = { status: 'cancelled' };
        } else if (reason instanceof PinLockedError) {
          result = {
            status: 'failed',
            reason: 'locked',
            message: reason.message,
          };
        } else {
          result = {
            status: 'failed',
            reason: 'error',
            message: PIN_MESSAGES.error,
          };
        }
      }

      if (attempt === generation.current) {
        busy.current = false;
        if (mounted.current) {
          setIsVerifying(false);
          if (result.status === 'failed') setError(result.message);
        }
      }
      return result;
    },
    [],
  );

  return { verify, cancel, isVerifying, error, clearError };
}

export default usePinVerification;
