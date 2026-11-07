/**
 * 토스트 표시 호스트 (앱 루트에 한 번만 마운트)
 *
 * - 지갑이 잠긴 동안(자동 잠금 오버레이, 콜드 스타트 잠금 화면)에는 아무것도 그리지
 *   않고 화면 낭독기에도 알리지 않는다. 대기열은 그대로 두었다가 잠금 해제 후 표시한다.
 * - iOS: 토스트가 떠 있는 동안 react-native-screens FullWindowOverlay로 앱 창에 직접
 *   올려 RN 모달(시트) 위에서도 보이게 한다. 오버레이 컨테이너는 자식 뷰가 맞은 터치만
 *   받고 나머지는 아래 앱으로 넘기므로(RNSFullWindowOverlayContainer hitTest) 토스트 밖
 *   터치를 막지 않는다. 키보드가 올라와 있으면 키보드 위로 올린다.
 * - Android: 앱 루트의 절대 위치 뷰 (adjustResize라 키보드 위로 자동으로 올라간다).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Keyboard,
  Platform,
  Pressable,
} from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import styled, { useTheme } from 'styled-components/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore, ToastType } from '@/store/toastStore';
import { useWalletLocked } from '@/hooks/useWalletLocked';
import type { Theme } from '@/styles/theme';

/** 기본 위치: 탭 바/하단 버튼 위 */
const BASE_OFFSET = 96;
/** 키보드와의 간격 */
const KEYBOARD_GAP = 16;

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '!',
  warning: '!',
  info: 'i',
};

function colorFor(theme: Theme, type: ToastType): string {
  switch (type) {
    case 'success':
      return theme.colors.success;
    case 'error':
      return theme.colors.error;
    case 'warning':
      return theme.colors.warning;
    default:
      return theme.colors.primary;
  }
}

/** iOS 키보드 높이 (Android는 adjustResize로 창 자체가 줄어든다) */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', event => {
      setHeight(event.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

export function ToastHost(): React.JSX.Element | null {
  const current = useToastStore(state => state.current);
  const dismiss = useToastStore(state => state.dismiss);
  const locked = useWalletLocked();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const theme = useTheme() as Theme;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 잠긴 동안에는 알리지도, 소비하지도 않는다. 해제되면 같은 토스트를 다시 시작한다.
    if (!current || locked) return;
    AccessibilityInfo.announceForAccessibility(current.message);
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 160,
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }).start(() => dismiss(current.id));
    }, current.duration);
    return () => clearTimeout(timer);
  }, [current, dismiss, locked, opacity]);

  if (!current || locked) return null;

  const accent = colorFor(theme, current.type);
  const bottom = Math.max(
    insets.bottom + BASE_OFFSET,
    keyboardHeight > 0 ? keyboardHeight + KEYBOARD_GAP : 0,
  );

  const toast = (
    <Wrapper
      pointerEvents="box-none"
      style={{ bottom, opacity }}
      testID="toast-container"
    >
      <Pressable
        onPress={() => dismiss(current.id)}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityHint="탭하면 닫힙니다"
        testID="toast"
      >
        <ToastBody>
          <IconCircle style={{ backgroundColor: accent }}>
            <IconText>{ICONS[current.type]}</IconText>
          </IconCircle>
          <Message numberOfLines={3}>{current.message}</Message>
        </ToastBody>
      </Pressable>
    </Wrapper>
  );

  if (Platform.OS === 'ios') {
    // 토스트가 있을 때만 마운트해 그 시점에 표시 중인 모달보다 위에 놓이게 한다.
    // 접근성 모달 컨테이너가 아니어야 화면 낭독기가 아래 앱을 계속 탐색할 수 있다.
    return (
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>
        {toast}
      </FullWindowOverlay>
    );
  }
  return toast;
}

const Wrapper = styled(Animated.View)`
  position: absolute;
  left: 16px;
  right: 16px;
  align-items: center;
  z-index: 1000;
  elevation: 12;
`;

const ToastBody = styled.View`
  flex-direction: row;
  align-items: center;
  max-width: 480px;
  padding: 12px 16px;
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  background-color: ${({ theme }) =>
    theme.isDark ? theme.colors.surface : theme.colors.textPrimary};
`;

const IconCircle = styled.View`
  width: 22px;
  height: 22px;
  border-radius: 11px;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
`;

const IconText = styled.Text`
  color: ${({ theme }) => theme.colors.onPrimary};
  font-size: 13px;
  font-weight: 700;
`;

const Message = styled.Text`
  flex-shrink: 1;
  color: ${({ theme }) =>
    theme.isDark ? theme.colors.textPrimary : theme.colors.background};
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
`;

export default ToastHost;
