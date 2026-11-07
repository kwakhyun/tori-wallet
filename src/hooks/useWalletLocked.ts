/**
 * 지갑이 있고 잠긴 상태인지 (자동 잠금 오버레이 또는 콜드 스타트 잠금 화면)
 *
 * 지갑이 없는 온보딩 단계의 isLocked는 의미가 없으므로 잠금으로 보지 않는다.
 * 모달·토스트처럼 잠금 화면 위에 나타나면 안 되는 UI를 숨기는 데 사용한다.
 */

import { useShallow } from 'zustand/react/shallow';
import { useWalletStore } from '@/store/walletStore';

export function useWalletLocked(): boolean {
  const { hasWallet, isLocked } = useWalletStore(
    useShallow(state => ({
      hasWallet: state.hasWallet,
      isLocked: state.isLocked,
    })),
  );
  return Boolean(hasWallet && isLocked);
}

export default useWalletLocked;
