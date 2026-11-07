/**
 * 데이터 상태 표시 컴포넌트 (오류 + 다시 시도, 빈 상태)
 *
 * 조회 실패를 0이나 빈 목록으로 보여 주지 않고, 원인과 다시 시도 수단을 제공한다.
 */

import React from 'react';
import styled from 'styled-components/native';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
  testID?: string;
}

export function ErrorState({
  title = '불러오지 못했습니다',
  message = '네트워크 연결을 확인한 뒤 다시 시도해주세요.',
  onRetry,
  retryLabel = '다시 시도',
  compact = false,
  testID = 'error-state',
}: ErrorStateProps): React.JSX.Element {
  return (
    <Container $compact={compact} testID={testID} accessibilityRole="alert">
      {!compact && <Icon importantForAccessibility="no">⚠️</Icon>}
      <Title>{title}</Title>
      {message ? <Message>{message}</Message> : null}
      {onRetry ? (
        <RetryButton
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
          testID={`${testID}-retry`}
        >
          <RetryText>{retryLabel}</RetryText>
        </RetryButton>
      ) : null}
    </Container>
  );
}

interface EmptyStateProps {
  icon?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  testID = 'empty-state',
}: EmptyStateProps): React.JSX.Element {
  return (
    <Container $compact={false} testID={testID}>
      {icon ? <Icon importantForAccessibility="no">{icon}</Icon> : null}
      <Title>{title}</Title>
      {message ? <Message>{message}</Message> : null}
      {actionLabel && onAction ? (
        <RetryButton
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          testID={`${testID}-action`}
        >
          <RetryText>{actionLabel}</RetryText>
        </RetryButton>
      ) : null}
    </Container>
  );
}

const Container = styled.View<{ $compact: boolean }>`
  align-items: center;
  justify-content: center;
  padding: ${({ $compact }) => ($compact ? '16px' : '40px 24px')};
`;

const Icon = styled.Text`
  font-size: 40px;
  margin-bottom: 12px;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
  text-align: center;
`;

const Message = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  line-height: 20px;
  text-align: center;
  margin-top: 6px;
`;

const RetryButton = styled.TouchableOpacity`
  margin-top: 16px;
  min-height: 44px;
  padding: 10px 20px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.primary};
  justify-content: center;
`;

const RetryText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 15px;
  font-weight: 600;
`;
