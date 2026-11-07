/**
 * dApp 요청 대기열 위치("1/3")와 만료까지 남은 시간을 표시한다.
 */

import React from 'react';
import styled from 'styled-components/native';
import {
  describeRemaining,
  formatRemaining,
  useCountdown,
} from './useCountdown';

export interface QueuePosition {
  /** 1부터 시작 */
  index: number;
  total: number;
}

interface Props {
  queuePosition?: QueuePosition;
  expiresAt?: number;
  active?: boolean;
}

const URGENT_SECONDS = 15;

export function RequestQueueBar({
  queuePosition,
  expiresAt,
  active = true,
}: Props): React.JSX.Element | null {
  const seconds = useCountdown(expiresAt, active);
  const showPosition = !!queuePosition && queuePosition.total > 1;
  if (!showPosition && seconds === null) return null;

  return (
    <Row>
      {showPosition ? (
        <PositionBadge
          accessible
          accessibilityLabel={`대기 중인 요청 ${queuePosition.total}개 중 ${queuePosition.index}번째`}
          testID="wc-queue-position"
        >
          <PositionText>
            {queuePosition.index}/{queuePosition.total}
          </PositionText>
        </PositionBadge>
      ) : (
        <Spacer />
      )}
      {seconds !== null ? (
        <TimerText
          $urgent={seconds <= URGENT_SECONDS}
          accessibilityLabel={`남은 시간 ${describeRemaining(seconds)}`}
          testID="wc-request-countdown"
        >
          {seconds === 0 ? '만료됨' : `남은 시간 ${formatRemaining(seconds)}`}
        </TimerText>
      ) : null}
    </Row>
  );
}

const Row = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px 0;
`;

const Spacer = styled.View``;

const PositionBadge = styled.View`
  background-color: ${({ theme }) => theme.colors.primarySubtle};
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
  padding: 2px 10px;
`;

const PositionText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 13px;
  font-weight: 700;
`;

const TimerText = styled.Text<{ $urgent: boolean }>`
  color: ${({ theme, $urgent }) =>
    $urgent ? theme.colors.error : theme.colors.textSecondary};
  font-size: 13px;
  font-weight: ${({ $urgent }) => ($urgent ? 700 : 400)};
`;

export default RequestQueueBar;
