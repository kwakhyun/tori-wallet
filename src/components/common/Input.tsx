/**
 * 인풋 컴포넌트
 */

import React, { useState } from 'react';
import styled, { useTheme } from 'styled-components/native';
import { TextInputProps, ViewStyle } from 'react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helper?: string;
  containerStyle?: ViewStyle;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  testID?: string;
}

export function Input({
  label,
  error,
  helper,
  containerStyle,
  leftIcon,
  rightIcon,
  testID,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const theme = useTheme();

  return (
    <Container style={containerStyle}>
      {label && <Label>{label}</Label>}
      <InputWrapper $focused={isFocused} $error={!!error}>
        {leftIcon && <IconContainer>{leftIcon}</IconContainer>}
        <StyledInput
          placeholderTextColor={theme.colors.textMuted}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          testID={testID}
          accessibilityLabel={label || props.placeholder}
          accessibilityHint={helper}
          {...props}
        />
        {rightIcon && <IconContainer>{rightIcon}</IconContainer>}
      </InputWrapper>
      {error && <ErrorText>{error}</ErrorText>}
      {helper && !error && <HelperText>{helper}</HelperText>}
    </Container>
  );
}

const Container = styled.View`
  width: 100%;
`;

const Label = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
`;

const InputWrapper = styled.View<{ $focused: boolean; $error: boolean }>`
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.backgroundTertiary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border-width: 2px;
  border-color: ${({ theme, $focused, $error }) =>
    $error
      ? theme.colors.error
      : $focused
      ? theme.colors.primary
      : 'transparent'};
  padding: 0 16px;
  min-height: 52px;
`;

const StyledInput = styled.TextInput`
  flex: 1;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  padding: 12px 0;
`;

const IconContainer = styled.View`
  margin-right: 12px;
`;

const ErrorText = styled.Text`
  color: ${({ theme }) => theme.colors.error};
  font-size: 12px;
  margin-top: 4px;
`;

const HelperText = styled.Text`
  color: ${({ theme }) => theme.colors.textTertiary};
  font-size: 12px;
  margin-top: 4px;
`;
