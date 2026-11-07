/**
 * 토스트 표시 호스트 (앱 루트에 한 번만 마운트)
 */

import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Pressable } from 'react-native';
import styled, { useTheme } from 'styled-components/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore, ToastType } from '@/store/toastStore';
import type { Theme } from '@/styles/theme';

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

export function ToastHost(): React.JSX.Element | null {
  const current = useToastStore(state => state.current);
  const dismiss = useToastStore(state => state.dismiss);
  const insets = useSafeAreaInsets();
  const theme = useTheme() as Theme;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!current) return;
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
  }, [current, dismiss, opacity]);

  if (!current) return null;

  const accent = colorFor(theme, current.type);

  return (
    <Wrapper
      pointerEvents="box-none"
      style={{ bottom: insets.bottom + 96, opacity }}
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
