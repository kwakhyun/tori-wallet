/**
 * 공용 PIN 입력 패드 (점 표시 + 숫자 키패드)
 *
 * PIN 설정, 잠금 해제, 거래 확인이 모두 같은 키패드를 사용하도록 한다.
 *  - 화면 높이에 맞춰 키 크기를 줄여 작은 기기에서도 하단 줄이 잘리지 않는다.
 *  - 입력한 자릿수를 화면 낭독기에 알려 준다.
 *  - 키 입력 햅틱은 Android에서만 짧게 준다(iOS Vibration은 길게 울림).
 */

import React, { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import styled from 'styled-components/native';
import { tapFeedback } from '@/utils/haptics';

export interface PinPadAction {
  /** 키에 표시할 기호 또는 짧은 텍스트 */
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  testID?: string;
}

export interface PinPadProps {
  value: string;
  length?: number;
  onDigit: (digit: string) => void;
  onDelete: () => void;
  disabled?: boolean;
  /** 0 왼쪽 칸 (예: 생체인증). 없으면 빈 칸 */
  leftAction?: PinPadAction | null;
  /** 오류 상태 (점을 빨간색으로 표시) */
  error?: boolean;
  /** 점 영역 접근성 라벨 접두어 */
  label?: string;
  testIDPrefix?: string;
  /** 키 크기 상한 */
  maxKeySize?: number;
  /**
   * 패드가 theme.colors.surface 컨테이너(예: PinConfirmModal 카드) 위에 놓이는지.
   * true면 숫자 키를 컨테이너와 다른 색으로 칠해 키 모양이 사라지지 않게 한다.
   * 기본값(false)은 화면 배경(theme.colors.background) 위에 놓인 경우다.
   */
  onSurface?: boolean;
}

const DIGIT_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

export function PinPad({
  value,
  length = 6,
  onDigit,
  onDelete,
  disabled = false,
  leftAction = null,
  error = false,
  label = 'PIN',
  testIDPrefix = 'pin',
  maxKeySize = 76,
  onSurface = false,
}: PinPadProps): React.JSX.Element {
  const { height, width } = useWindowDimensions();

  // 작은 화면(예: iPhone SE 667pt, 360x640dp)에서 4줄 키패드가 들어가도록 축소
  const keySize = useMemo(() => {
    const byHeight = Math.floor((height * 0.42) / 4) - 12;
    const byWidth = Math.floor((width - 64) / 3) - 16;
    return Math.max(56, Math.min(maxKeySize, byHeight, byWidth));
  }, [height, width, maxKeySize]);

  const handleDigit = (digit: string) => {
    if (disabled || value.length >= length) return;
    tapFeedback();
    onDigit(digit);
  };

  const handleDelete = () => {
    if (disabled || value.length === 0) return;
    tapFeedback();
    onDelete();
  };

  return (
    <Wrapper>
      <DotsRow
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${label} ${length}자리 중 ${value.length}자리 입력됨`}
        accessibilityLiveRegion="polite"
        testID={`${testIDPrefix}-dots`}
      >
        {Array.from({ length }, (_, index) => (
          <Dot
            key={index}
            $filled={index < value.length}
            $error={error}
            testID={`${testIDPrefix}-dot-${index}`}
          />
        ))}
      </DotsRow>

      <Keypad>
        {DIGIT_ROWS.map(row => (
          <KeyRow key={row.join('')}>
            {row.map(digit => (
              <Key
                key={digit}
                $size={keySize}
                $onSurface={onSurface}
                onPress={() => handleDigit(digit)}
                disabled={disabled}
                accessibilityRole="keyboardkey"
                accessibilityLabel={digit}
                accessibilityState={{ disabled }}
                testID={`${testIDPrefix}-key-${digit}`}
              >
                <KeyText $disabled={disabled}>{digit}</KeyText>
              </Key>
            ))}
          </KeyRow>
        ))}
        <KeyRow>
          {leftAction ? (
            <Key
              $size={keySize}
              $ghost
              onPress={leftAction.onPress}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={leftAction.accessibilityLabel}
              testID={leftAction.testID}
            >
              <ActionText $disabled={disabled}>{leftAction.label}</ActionText>
            </Key>
          ) : (
            <EmptyKey $size={keySize} importantForAccessibility="no" />
          )}
          <Key
            $size={keySize}
            $onSurface={onSurface}
            onPress={() => handleDigit('0')}
            disabled={disabled}
            accessibilityRole="keyboardkey"
            accessibilityLabel="0"
            accessibilityState={{ disabled }}
            testID={`${testIDPrefix}-key-0`}
          >
            <KeyText $disabled={disabled}>0</KeyText>
          </Key>
          <Key
            $size={keySize}
            $ghost
            onPress={handleDelete}
            disabled={disabled || value.length === 0}
            accessibilityRole="button"
            accessibilityLabel="한 자리 지우기"
            testID={`${testIDPrefix}-key-delete`}
          >
            <ActionText $disabled={disabled}>⌫</ActionText>
          </Key>
        </KeyRow>
      </Keypad>
    </Wrapper>
  );
}

const Wrapper = styled.View`
  align-items: center;
  width: 100%;
`;

const DotsRow = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-bottom: 28px;
  padding: 8px;
`;

const Dot = styled.View<{ $filled: boolean; $error: boolean }>`
  width: 14px;
  height: 14px;
  border-radius: 7px;
  margin: 0 8px;
  border-width: 2px;
  border-color: ${({ theme, $error }) =>
    $error ? theme.colors.error : theme.colors.primary};
  background-color: ${({ theme, $filled, $error }) =>
    $filled
      ? $error
        ? theme.colors.error
        : theme.colors.primary
      : 'transparent'};
`;

const Keypad = styled.View`
  width: 100%;
  align-items: center;
`;

const KeyRow = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-bottom: 12px;
`;

/**
 * 숫자 키는 채움색 + 1px 테두리로 모양을 드러낸다. 라이트 테마에서 surface(흰색)는
 * 화면 배경(gray-50)과 거의 같고, PinConfirmModal 카드는 surface 자체이므로 채움색만으로는
 * 키가 보이지 않는다. 카드 위에서는 채움색도 backgroundTertiary로 바꾼다.
 */
const Key = styled.TouchableOpacity<{
  $size: number;
  $ghost?: boolean;
  $onSurface?: boolean;
}>`
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border-radius: ${({ $size }) => $size / 2}px;
  margin: 0 8px;
  align-items: center;
  justify-content: center;
  border-width: ${({ $ghost }) => ($ghost ? 0 : 1)}px;
  border-color: ${({ theme, $ghost }) =>
    $ghost ? 'transparent' : theme.colors.borderLight};
  background-color: ${({ theme, $ghost, $onSurface }) =>
    $ghost
      ? 'transparent'
      : $onSurface
      ? theme.colors.backgroundTertiary
      : theme.colors.surface};
`;

const EmptyKey = styled.View<{ $size: number }>`
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  margin: 0 8px;
`;

const KeyText = styled.Text<{ $disabled: boolean }>`
  color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.textMuted : theme.colors.textPrimary};
  font-size: 26px;
  font-weight: 500;
`;

const ActionText = styled.Text<{ $disabled: boolean }>`
  color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.textMuted : theme.colors.textPrimary};
  font-size: 22px;
`;

export default PinPad;
