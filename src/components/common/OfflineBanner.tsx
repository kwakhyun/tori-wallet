/**
 * 오프라인 안내 배너 (앱 루트에 한 번만 마운트)
 */

import React, { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import styled from 'styled-components/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function OfflineBanner(): React.JSX.Element | null {
  const [offline, setOffline] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      // isInternetReachable은 초기에 null일 수 있으므로 false일 때만 오프라인으로 본다.
      setOffline(
        state.isConnected === false || state.isInternetReachable === false,
      );
    });
    return unsubscribe;
  }, []);

  if (!offline) return null;

  return (
    <Banner
      pointerEvents="none"
      style={{ paddingTop: insets.top + 4 }}
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
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding-bottom: 6px;
  padding-horizontal: 16px;
  background-color: ${({ theme }) => theme.colors.warning};
  z-index: 999;
  elevation: 10;
`;

const BannerText = styled.Text`
  color: ${({ theme }) => theme.colors.onSecondary};
  font-size: 12px;
  font-weight: 600;
  text-align: center;
`;

export default OfflineBanner;
