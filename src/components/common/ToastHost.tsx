/**
 * 토스트 표시 호스트 (앱 루트에 한 번만 마운트)
 *
 * - 지갑이 잠긴 동안(자동 잠금 오버레이, 콜드 스타트 잠금 화면)에는 아무것도 그리지
 *   않고 화면 낭독기에도 알리지 않는다. 대기열은 그대로 두었다가 잠금 해제 후 표시한다.
 * - iOS: 앱이 활성 상태이고 토스트가 떠 있는 동안 react-native-screens FullWindowOverlay로
 *   앱 창에 직접 올려 RN 모달(시트) 위에서도 보이게 한다. 오버레이 컨테이너는 자식 뷰가
 *   맞은 터치만 받고 나머지는 아래 앱으로 넘기므로(RNSFullWindowOverlayContainer hitTest)
 *   토스트 밖 터치를 막지 않는다. 키보드가 올라와 있으면 키보드 위로 올린다.
 *   앱이 비활성/백그라운드일 때는 앱 트리 안에 그린다. 그때 창에 추가되는 개인정보 보호
 *   화면(AppDelegate privacy view, 앱 전환기 스냅샷)보다 위에 토스트가 올라오지 않게 한다.
 * - Android: 앱 루트의 절대 위치 뷰 (adjustResize라 키보드 위로 자동으로 올라간다).
 *   RN Modal(Dialog)이 열려 있으면 맨 위 모달 안(ModalToastSurface)에 그린다.
 * - 화면 낭독기 알림과 표시 시간 타이머는 이 호스트 하나만 담당한다.
 */

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  type AppStateStatus,
  Keyboard,
  Platform,
  Pressable,
} from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import styled, { useTheme } from 'styled-components/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useToastStore,
  ToastType,
  type ToastMessage,
} from '@/store/toastStore';
import { useWalletLocked } from '@/hooks/useWalletLocked';
import type { Theme } from '@/styles/theme';
import {
  registerToastSurface,
  subscribeToastSurfaces,
  topToastSurface,
  unregisterToastSurface,
} from './toastSurfaces';

/** 기본 위치: 탭 바/하단 버튼 위 */
const BASE_OFFSET = 96;
/** 키보드와의 간격 */
const KEYBOARD_GAP = 16;

/** 앱 루트와 모달 안 표시 위치가 함께 쓰는 페이드 값 (호스트는 하나뿐이다) */
const toastOpacity = new Animated.Value(0);

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

const isForeground = (state: AppStateStatus | undefined): boolean =>
  state !== 'background' && state !== 'inactive';

/** 앱이 화면 앞에서 활성 상태인지 (iOS 개인정보 보호 화면이 없는 상태) */
function useAppActive(): boolean {
  const [active, setActive] = useState(() =>
    isForeground(AppState.currentState),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setActive(isForeground(state));
    });
    return () => subscription.remove();
  }, []);
  return active;
}

function useTopToastSurface(): number | null {
  return useSyncExternalStore(subscribeToastSurfaces, topToastSurface);
}

function ToastView({
  toast,
  bottom,
  onDismiss,
}: {
  toast: ToastMessage;
  bottom: number;
  onDismiss: (id: number) => void;
}): React.JSX.Element {
  const theme = useTheme() as Theme;
  const accent = colorFor(theme, toast.type);
  return (
    <Wrapper
      pointerEvents="box-none"
      style={{ bottom, opacity: toastOpacity }}
      testID="toast-container"
    >
      <Pressable
        onPress={() => onDismiss(toast.id)}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityHint="탭하면 닫힙니다"
        testID="toast"
      >
        <ToastBody>
          <IconCircle style={{ backgroundColor: accent }}>
            <IconText>{ICONS[toast.type]}</IconText>
          </IconCircle>
          <Message numberOfLines={3}>{toast.message}</Message>
        </ToastBody>
      </Pressable>
    </Wrapper>
  );
}

export function ToastHost(): React.JSX.Element | null {
  const current = useToastStore(state => state.current);
  const dismiss = useToastStore(state => state.dismiss);
  const locked = useWalletLocked();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const appActive = useAppActive();
  const modalSurface = useTopToastSurface();

  useEffect(() => {
    // 잠긴 동안에는 알리지도, 소비하지도 않는다. 해제되면 같은 토스트를 다시 시작한다.
    if (!current || locked) return;
    AccessibilityInfo.announceForAccessibility(current.message);
    toastOpacity.setValue(0);
    Animated.timing(toastOpacity, {
      toValue: 1,
      duration: 160,
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => {
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }).start(() => dismiss(current.id));
    }, current.duration);
    return () => clearTimeout(timer);
  }, [current, dismiss, locked]);

  if (!current || locked) return null;
  // Android: 열린 모달(Dialog)이 앱 루트를 가리므로 맨 위 모달 안에서 그린다.
  if (Platform.OS === 'android' && modalSurface !== null) return null;

  const bottom = Math.max(
    insets.bottom + BASE_OFFSET,
    keyboardHeight > 0 ? keyboardHeight + KEYBOARD_GAP : 0,
  );
  const toast = (
    <ToastView toast={current} bottom={bottom} onDismiss={dismiss} />
  );

  if (Platform.OS === 'ios' && appActive) {
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

/**
 * Android: AppModal 안의 토스트 표시 위치. 맨 위 모달일 때만 현재 토스트를 그린다
 * (알림·타이머는 앱 루트 ToastHost가 담당한다). iOS에서는 아무것도 하지 않는다.
 */
export function ModalToastSurface({
  depth,
}: {
  /** 모달 중첩 깊이 (루트 모달 0). 가장 깊은 모달이 맨 위다. */
  depth: number;
}): React.JSX.Element | null {
  const current = useToastStore(state => state.current);
  const dismiss = useToastStore(state => state.dismiss);
  const locked = useWalletLocked();
  const insets = useSafeAreaInsets();
  const top = useTopToastSurface();
  const [surfaceId, setSurfaceId] = useState<number | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const id = registerToastSurface(depth);
    setSurfaceId(id);
    return () => unregisterToastSurface(id);
  }, [depth]);

  if (!current || locked || surfaceId === null || top !== surfaceId) {
    return null;
  }
  return (
    <ToastView
      toast={current}
      bottom={insets.bottom + BASE_OFFSET}
      onDismiss={dismiss}
    />
  );
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
