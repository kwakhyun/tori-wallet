/**
 * 버튼 컴포넌트
 */

import React from 'react';
import styled, { useTheme } from 'styled-components/native';
import { ActivityIndicator, TouchableOpacityProps } from 'react-native';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'text';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  fullWidth?: boolean;
  testID?: string;
}

export function Button({
  title,
  variant = 'primary',
  size = 'medium',
  loading = false,
  fullWidth = false,
  disabled,
  testID,
  ...props
}: ButtonProps) {
  const theme = useTheme();
  const filled = variant === 'primary' || variant === 'secondary';
  // 로딩 중에는 누를 수 없지만 배경은 활성 색을 유지한다. 비활성 회색 배경 위의 흰 스피너는
  // (라이트 테마 #E4E4E7 위 #FFF ≈ 1.3:1) 보이지 않아 앱이 멈춘 것처럼 보인다.
  const spinnerColor =
    disabled && filled
      ? theme.colors.disabledText
      : variant === 'primary'
      ? theme.colors.onPrimary
      : variant === 'secondary'
      ? theme.colors.onSecondary
      : theme.colors.primary;

  return (
    <StyledButton
      $variant={variant}
      $size={size}
      $fullWidth={fullWidth}
      $disabledLook={!!disabled}
      disabled={disabled || loading}
      activeOpacity={0.7}
      testID={testID}
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={
        loading ? { disabled: true, busy: true } : { disabled: !!disabled }
      }
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={spinnerColor}
          size="small"
          testID={testID ? `${testID}-spinner` : undefined}
        />
      ) : (
        <ButtonText
          $variant={variant}
          $size={size}
          $disabled={disabled || loading}
        >
          {title}
        </ButtonText>
      )}
    </StyledButton>
  );
}

const StyledButton = styled.TouchableOpacity<{
  $variant: string;
  $size: string;
  $fullWidth: boolean;
  /** 명시적으로 비활성화된 경우에만 비활성 모양을 쓴다 (로딩 중은 제외) */
  $disabledLook: boolean;
}>`
  flex-direction: row;
  justify-content: center;
  align-items: center;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  width: ${({ $fullWidth }) => ($fullWidth ? '100%' : 'auto')};

  ${({ $variant, theme }) => {
    switch ($variant) {
      case 'secondary':
        return `
          background-color: ${theme.colors.secondary};
        `;
      case 'outline':
        return `
          background-color: transparent;
          border-width: 2px;
          border-color: ${theme.colors.primary};
        `;
      case 'text':
        return `
          background-color: transparent;
        `;
      default:
        return `
          background-color: ${theme.colors.primary};
        `;
    }
  }}

  ${({ $size }) => {
    switch ($size) {
      case 'small':
        return `
          padding: 8px 16px;
          min-height: 36px;
        `;
      case 'large':
        return `
          padding: 16px 32px;
          min-height: 56px;
        `;
      default:
        return `
          padding: 12px 24px;
          min-height: 48px;
        `;
    }
  }}

  ${({ $disabledLook, $variant, theme }) =>
    $disabledLook &&
    ($variant === 'primary' || $variant === 'secondary'
      ? `
    background-color: ${theme.colors.disabledBackground};
  `
      : `
    opacity: 0.5;
  `)}
`;

const ButtonText = styled.Text<{
  $variant: string;
  $size: string;
  $disabled?: boolean;
}>`
  font-weight: 600;

  ${({ $variant, theme, $disabled }) => {
    if ($disabled && ($variant === 'primary' || $variant === 'secondary')) {
      return `color: ${theme.colors.disabledText};`;
    }
    switch ($variant) {
      case 'outline':
      case 'text':
        return `color: ${theme.colors.primary};`;
      case 'secondary':
        // 시안 배경 위 흰 글씨는 대비가 1.8:1이라 어두운 글씨를 사용
        return `color: ${theme.colors.onSecondary};`;
      default:
        return `color: ${theme.colors.onPrimary};`;
    }
  }}

  ${({ $size }) => {
    switch ($size) {
      case 'small':
        return 'font-size: 14px;';
      case 'large':
        return 'font-size: 18px;';
      default:
        return 'font-size: 16px;';
    }
  }}
`;
