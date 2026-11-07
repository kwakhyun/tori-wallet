/**
 * 민감 정보(복구 구문 등)를 표시하는 동안 지갑이 잠기거나 앱이 화면에서 벗어나면
 * 즉시 지우도록 콜백을 호출한다.
 *
 * 자동 잠금 후에도 메인 스택은 잠금 오버레이 아래에 마운트된 채 남아 있으므로
 * 화면 상태에 남은 비밀값은 직접 지워야 한다. iOS 앱 전환기 스냅샷에 남지 않도록
 * inactive 전환에도 지운다.
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useWalletStore } from '@/store/walletStore';

export function useSecretAutoClear(enabled: boolean, onClear: () => void) {
  const onClearRef = useRef(onClear);
  onClearRef.current = onClear;

  useEffect(() => {
    if (!enabled) return;
    if (useWalletStore.getState().isLocked) {
      onClearRef.current();
      return;
    }
    const unsubscribe = useWalletStore.subscribe(state => {
      if (state.isLocked) onClearRef.current();
    });
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') onClearRef.current();
    });
    return () => {
      unsubscribe();
      subscription.remove();
    };
  }, [enabled]);
}

export default useSecretAutoClear;
