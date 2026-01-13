/**
 * Tori Wallet - Card Component
 */

import React from 'react';
import styled from 'styled-components/native';
import { ViewStyle } from 'react-native';
import { palette } from '@/styles/theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'elevated' | 'outlined';
  onPress?: () => void;
}

export function Card({
  children,
  style,
  variant = 'default',
  onPress,
}: CardProps) {
  if (onPress) {
    return (
      <TouchableCard
        $variant={variant}
        style={style}
        onPress={onPress}
        activeOpacity={0.8}
      >
        {children}
      </TouchableCard>
    );
  }

  return (
    <StyledCard $variant={variant} style={style}>
      {children}
    </StyledCard>
  );
}

const baseCardStyles = `
  padding: 16px;
`;

const StyledCard = styled.View<{ $variant: string }>`
  ${baseCardStyles}
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;

  ${({ $variant, theme }) => {
    switch ($variant) {
      case 'elevated':
        return `
          background-color: ${theme.colors.surface};
          shadow-color: ${palette.black};
          shadow-offset: 0px 4px;
          shadow-opacity: 0.15;
          shadow-radius: 8px;
          elevation: 4;
        `;
      case 'outlined':
        return `
          background-color: transparent;
          border-width: 1px;
          border-color: ${theme.colors.border};
        `;
      default:
        return `
          background-color: ${theme.colors.backgroundTertiary};
        `;
    }
  }}
`;

const TouchableCard = styled.TouchableOpacity<{ $variant: string }>`
  ${baseCardStyles}
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;

  ${({ $variant, theme }) => {
    switch ($variant) {
      case 'elevated':
        return `
          background-color: ${theme.colors.surface};
          shadow-color: ${palette.black};
          shadow-offset: 0px 4px;
          shadow-opacity: 0.15;
          shadow-radius: 8px;
          elevation: 4;
        `;
      case 'outlined':
        return `
          background-color: transparent;
          border-width: 1px;
          border-color: ${theme.colors.border};
        `;
      default:
        return `
          background-color: ${theme.colors.backgroundTertiary};
        `;
    }
  }}
`;
