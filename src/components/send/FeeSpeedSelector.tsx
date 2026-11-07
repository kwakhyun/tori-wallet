/**
 * 수수료 속도 선택 (느림/보통/빠름)
 */

import React from 'react';
import styled from 'styled-components/native';
import {
  FEE_SPEEDS,
  FEE_SPEED_LABELS,
  type FeeSpeed,
} from '@/services/txService';

const SPEED_HINTS: Record<FeeSpeed, string> = {
  slow: '수수료가 낮지만 처리가 늦어질 수 있습니다',
  normal: '네트워크 권장 수수료',
  fast: '수수료를 더 내고 빠르게 처리합니다',
};

const SPEED_CAPTIONS: Record<FeeSpeed, string> = {
  slow: '수수료 ↓',
  normal: '권장',
  fast: '속도 ↑',
};

interface Props {
  value: FeeSpeed;
  onChange: (speed: FeeSpeed) => void;
  disabled?: boolean;
  testID?: string;
}

export function FeeSpeedSelector({
  value,
  onChange,
  disabled,
  testID = 'fee-speed',
}: Props): React.JSX.Element {
  return (
    <Row testID={testID} accessibilityRole="radiogroup">
      {FEE_SPEEDS.map(speed => {
        const selected = speed === value;
        return (
          <Option
            key={speed}
            $selected={selected}
            disabled={disabled}
            onPress={() => onChange(speed)}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: !!disabled }}
            accessibilityLabel={`수수료 ${FEE_SPEED_LABELS[speed]}`}
            accessibilityHint={SPEED_HINTS[speed]}
            testID={`${testID}-${speed}`}
          >
            <OptionLabel $selected={selected}>
              {FEE_SPEED_LABELS[speed]}
            </OptionLabel>
            <OptionCaption>{SPEED_CAPTIONS[speed]}</OptionCaption>
          </Option>
        );
      })}
    </Row>
  );
}

const Row = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.sm}px;
`;

const Option = styled.TouchableOpacity<{ $selected: boolean }>`
  flex: 1;
  min-height: 52px;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.xs}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border-width: 1px;
  border-color: ${({ theme, $selected }) =>
    $selected ? theme.colors.primary : theme.colors.border};
  background-color: ${({ theme, $selected }) =>
    $selected ? theme.colors.primarySubtle : theme.colors.surface};
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
`;

const OptionLabel = styled.Text<{ $selected: boolean }>`
  font-size: 14px;
  font-weight: ${({ $selected }) => ($selected ? 700 : 500)};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const OptionCaption = styled.Text`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 2px;
`;

export default FeeSpeedSelector;
