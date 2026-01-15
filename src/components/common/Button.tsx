/**
 * Tori Wallet - Button Component
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

  return (
    <StyledButton
      $variant={variant}
      $size={size}
      $fullWidth={fullWidth}
      disabled={disabled || loading}
      activeOpacity={0.7}
      testID={testID}
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'primary' || variant === 'secondary'
              ? '#FFFFFF'
              : theme.colors.primary
          }
          size="small"
        />
      ) : (
        <ButtonText $variant={variant} $size={size}>
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

  ${({ disabled }) =>
    disabled &&
    `
    opacity: 0.5;
  `}
`;

const ButtonText = styled.Text<{ $variant: string; $size: string }>`
  font-weight: 600;

  ${({ $variant, theme }) => {
    switch ($variant) {
      case 'outline':
      case 'text':
        return `color: ${theme.colors.primary};`;
      case 'secondary':
        return `color: #FFFFFF;`;
      default:
        // primary 버튼은 항상 흰색 텍스트
        return `color: #FFFFFF;`;
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
