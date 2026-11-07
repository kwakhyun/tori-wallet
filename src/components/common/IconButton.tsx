/**
 * 아이콘(기호) 버튼
 *
 * ←, ✕, ⚙️ 같은 기호만 있는 버튼은 화면 낭독기가 기호 이름을 읽으므로
 * accessibilityLabel을 필수로 받고, 최소 44pt 터치 영역을 보장한다.
 */

import React from 'react';
import styled from 'styled-components/native';
import type { TouchableOpacityProps } from 'react-native';

export interface IconButtonProps
  extends Omit<TouchableOpacityProps, 'accessibilityLabel'> {
  /** 화면 낭독기가 읽을 버튼 이름 (예: "뒤로 가기") */
  accessibilityLabel: string;
  icon: React.ReactNode;
  /** 원형 배경 표시 여부 */
  filled?: boolean;
  size?: number;
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export function IconButton({
  icon,
  filled = false,
  size = 44,
  accessibilityLabel,
  disabled,
  ...props
}: IconButtonProps): React.JSX.Element {
  return (
    <Touchable
      $filled={filled}
      $size={size}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      activeOpacity={0.7}
      {...props}
    >
      {typeof icon === 'string' ? (
        <IconText importantForAccessibility="no">{icon}</IconText>
      ) : (
        icon
      )}
    </Touchable>
  );
}

const Touchable = styled.TouchableOpacity<{ $filled: boolean; $size: number }>`
  min-width: ${({ $size }) => $size}px;
  min-height: ${({ $size }) => $size}px;
  border-radius: ${({ $size }) => $size / 2}px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme, $filled }) =>
    $filled ? theme.colors.surface : 'transparent'};
  opacity: ${({ disabled }) => (disabled ? 0.4 : 1)};
`;

const IconText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 22px;
  line-height: 26px;
`;

export default IconButton;
