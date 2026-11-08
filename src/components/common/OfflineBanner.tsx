/**
 * 오프라인 안내 배너
 *
 * 화면 위에 겹쳐 띄우지 않고 레이아웃 흐름 안에 그린다. Screen/TabScreen이 상단 안전 영역
 * 바로 아래(ScreenHeader 위)에 배치하므로, 배너가 나타나면 헤더와 내용이 아래로 밀려
 * 뒤로 가기 버튼이나 제목을 가리지 않는다.
 *
 * 연결 상태는 NetInfo 구독 하나를 모든 배너가 공유한다. (스택에 쌓인 화면마다 따로
 * 구독하지 않는다)
 */

import React, { useSyncExternalStore } from 'react';
import NetInfo from '@react-native-community/netinfo';
import styled from 'styled-components/native';

let offline = false;
const listeners = new Set<() => void>();
let unsubscribeNetInfo: (() => void) | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!unsubscribeNetInfo) {
    const unsubscribe = NetInfo.addEventListener(state => {
      // isInternetReachable은 초기에 null일 수 있으므로 false일 때만 오프라인으로 본다.
      const next =
        state.isConnected === false || state.isInternetReachable === false;
      if (next === offline) return;
      offline = next;
      listeners.forEach(notify => notify());
    });
    unsubscribeNetInfo =
      typeof unsubscribe === 'function' ? unsubscribe : () => undefined;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribeNetInfo) {
      unsubscribeNetInfo();
      unsubscribeNetInfo = null;
      // 다시 구독하면 NetInfo가 현재 상태를 곧바로 알려 준다.
      offline = false;
    }
  };
}

const getOffline = () => offline;

/** 기기가 오프라인(연결 없음 또는 인터넷 접근 불가)인지 */
export function useIsOffline(): boolean {
  return useSyncExternalStore(subscribe, getOffline, getOffline);
}

/** 레이아웃 흐름 안에 그리는 오프라인 배너. 온라인이면 아무것도 그리지 않는다. */
export function OfflineBanner(): React.JSX.Element | null {
  const isOffline = useIsOffline();
  if (!isOffline) return null;

  return (
    <Banner
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="offline-banner"
    >
      <BannerText>
        오프라인 상태입니다. 잔액과 시세는 최신이 아닐 수 있습니다.
      </BannerText>
    </Banner>
  );
}

const Banner = styled.View`
  padding: 6px ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme }) => theme.colors.warning};
`;

const BannerText = styled.Text`
  color: ${({ theme }) => theme.colors.onSecondary};
  font-size: 12px;
  font-weight: 600;
  text-align: center;
`;

export default OfflineBanner;
