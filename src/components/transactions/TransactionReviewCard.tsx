/**
 * 서명 전 거래 검토 카드
 *
 * 가속/취소/승인 취소처럼 새로 서명하는 거래는 반드시 이 검토 단계를 거친다.
 * 무엇에 서명하는지(to, value, data 요약, nonce, 수수료)를 보여 준 뒤
 * 사용자가 명시적으로 확인해야 다음 단계(PIN 등)로 넘어간다.
 */

import React from 'react';
import styled from 'styled-components/native';
import { Button } from '@/components/common/Button';

export interface ReviewRow {
  label: string;
  value: string;
  /** 주소/해시처럼 고정폭이 읽기 쉬운 값 */
  mono?: boolean;
  /** 강조 표시 (예: 추가 비용) */
  emphasis?: boolean;
  testID?: string;
}

interface Props {
  title: string;
  description?: string;
  rows: ReviewRow[];
  warning?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  testID?: string;
}

export function TransactionReviewCard({
  title,
  description,
  rows,
  warning,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  testID = 'transaction-review',
}: Props): React.JSX.Element {
  return (
    <Container testID={testID}>
      <Title accessibilityRole="header">{title}</Title>
      {description ? <Description>{description}</Description> : null}
      <Card>
        {rows.map((row, index) => (
          <Row
            key={row.label}
            $last={index === rows.length - 1}
            accessible
            accessibilityLabel={`${row.label}: ${row.value}`}
            testID={row.testID}
          >
            <RowLabel>{row.label}</RowLabel>
            <RowValue $mono={row.mono} $emphasis={row.emphasis} selectable>
              {row.value}
            </RowValue>
          </Row>
        ))}
      </Card>
      {warning ? (
        <WarningBox accessibilityRole="alert">
          <WarningText>{warning}</WarningText>
        </WarningBox>
      ) : null}
      <Buttons>
        <ButtonSlot>
          <Button
            title="취소"
            variant="outline"
            onPress={onCancel}
            disabled={busy}
            fullWidth
            testID={`${testID}-cancel`}
          />
        </ButtonSlot>
        <ButtonSlot>
          <Button
            title={confirmLabel}
            onPress={onConfirm}
            loading={busy}
            fullWidth
            testID={`${testID}-confirm`}
          />
        </ButtonSlot>
      </Buttons>
    </Container>
  );
}

const Container = styled.View`
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h3.fontSize}px;
  font-weight: 600;
`;

const Description = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  line-height: 20px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const Card = styled.View`
  margin-top: ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
`;

const Row = styled.View<{ $last: boolean }>`
  padding: ${({ theme }) => theme.spacing.sm + 4}px 0;
  border-bottom-width: ${({ $last }) => ($last ? 0 : 1)}px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const RowLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  margin-bottom: 2px;
`;

const RowValue = styled.Text<{ $mono?: boolean; $emphasis?: boolean }>`
  color: ${({ theme, $emphasis }) =>
    $emphasis ? theme.colors.warning : theme.colors.textPrimary};
  font-size: ${({ $mono }) => ($mono ? 13 : 15)}px;
  font-weight: ${({ $emphasis }) => ($emphasis ? 600 : 400)};
  ${({ $mono }) => ($mono ? 'font-family: monospace;' : '')}
`;

const WarningBox = styled.View`
  margin-top: ${({ theme }) => theme.spacing.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme }) => theme.colors.warningSubtle};
`;

const WarningText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  line-height: 20px;
`;

const Buttons = styled.View`
  flex-direction: row;
  margin-top: ${({ theme }) => theme.spacing.lg}px;
  gap: ${({ theme }) => theme.spacing.sm}px;
`;

const ButtonSlot = styled.View`
  flex: 1;
`;

export default TransactionReviewCard;
