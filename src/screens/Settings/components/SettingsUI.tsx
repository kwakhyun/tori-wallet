/**
 * 설정 화면 공용 UI (행, 스위치 행, 선택 옵션, 시트 모달, 안내 상자)
 *
 * 모든 터치 요소에 accessibilityRole/라벨과 44pt 이상 터치 영역을 주고,
 * 색상은 테마 토큰만 사용한다.
 */

import React from 'react';
import { Switch, type ViewStyle } from 'react-native';
import { AppModal } from '@/components/common/AppModal';
import styled, { useTheme } from 'styled-components/native';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';

export const Section = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

export const SectionTitle = styled.Text.attrs({ accessibilityRole: 'header' })`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  font-weight: 600;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  margin-left: ${({ theme }) => theme.spacing.xs}px;
`;

export const Group = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  overflow: hidden;
`;

interface SettingRowProps {
  icon?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** 오른쪽 › 표시 (기본: onPress가 있으면 표시) */
  showChevron?: boolean;
  accessibilityHint?: string;
  testID?: string;
  /** 같은 그룹의 마지막 행이 아니면 구분선을 그린다 */
  divider?: boolean;
  right?: React.ReactNode;
}

export function SettingRow({
  icon,
  title,
  subtitle,
  value,
  onPress,
  disabled,
  danger,
  showChevron,
  accessibilityHint,
  testID,
  divider,
  right,
}: SettingRowProps): React.JSX.Element {
  const chevron = showChevron ?? !!onPress;
  const label = [title, value, subtitle].filter(Boolean).join(', ');
  const content = (
    <>
      {icon ? <RowIcon importantForAccessibility="no">{icon}</RowIcon> : null}
      <RowText>
        <RowTitle $danger={danger} $disabled={disabled}>
          {title}
        </RowTitle>
        {subtitle ? <RowSubtitle>{subtitle}</RowSubtitle> : null}
      </RowText>
      {value ? <RowValue numberOfLines={1}>{value}</RowValue> : null}
      {right}
      {chevron ? (
        <Chevron importantForAccessibility="no" accessibilityElementsHidden>
          ›
        </Chevron>
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <RowStatic
        $divider={divider}
        accessible
        accessibilityLabel={label}
        testID={testID}
      >
        {content}
      </RowStatic>
    );
  }

  return (
    <RowTouchable
      $divider={divider}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
    >
      {content}
    </RowTouchable>
  );
}

interface SwitchRowProps {
  icon?: string;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
  divider?: boolean;
}

export function SwitchRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
  testID,
  divider,
}: SwitchRowProps): React.JSX.Element {
  return (
    <RowStatic $divider={divider}>
      {icon ? <RowIcon importantForAccessibility="no">{icon}</RowIcon> : null}
      <RowText
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <RowTitle $disabled={disabled}>{title}</RowTitle>
        {subtitle ? <RowSubtitle>{subtitle}</RowSubtitle> : null}
      </RowText>
      <ThemedSwitch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={title}
        accessibilityHint={subtitle}
        testID={testID}
      />
    </RowStatic>
  );
}

interface ThemedSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
  accessibilityHint?: string;
  testID?: string;
}

/** 테마 색상을 쓰는 스위치 (화면 낭독기에 스위치 역할과 상태를 알린다) */
export function ThemedSwitch({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ThemedSwitchProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
      thumbColor={theme.colors.onPrimary}
      ios_backgroundColor={theme.colors.border}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      testID={testID}
    />
  );
}

interface OptionRowProps {
  label: string;
  description?: string;
  icon?: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}

/** 단일 선택 목록 항목. 선택 상태는 primarySubtle 배경 + primary 테두리 + 본문 색 글자 */
export function OptionRow({
  label,
  description,
  icon,
  selected,
  onPress,
  testID,
}: OptionRowProps): React.JSX.Element {
  return (
    <OptionTouchable
      $selected={selected}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="radio"
      accessibilityLabel={description ? `${label}, ${description}` : label}
      accessibilityState={{ selected, checked: selected }}
      testID={testID}
    >
      {icon ? <RowIcon importantForAccessibility="no">{icon}</RowIcon> : null}
      <RowText>
        <OptionLabel $selected={selected}>{label}</OptionLabel>
        {description ? <RowSubtitle>{description}</RowSubtitle> : null}
      </RowText>
      {selected ? (
        <CheckMark importantForAccessibility="no">✓</CheckMark>
      ) : null}
    </OptionTouchable>
  );
}

interface SheetModalProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  testID?: string;
  /** false면 내용을 스크롤 뷰로 감싸지 않는다 (PIN 패드처럼 고정 레이아웃) */
  scrollable?: boolean;
  closeDisabled?: boolean;
  /**
   * 열려 있는 동안 지갑이 잠기면 호출된다. 기본값은 onClose이며, closeDisabled(진행 중인
   * 작업)일 때는 닫지 않고 숨기기만 했다가 잠금 해제 후 다시 표시한다.
   */
  onLock?: () => void;
}

/** 페이지 시트 모달 + 접근성 닫기 버튼 헤더 */
export function SheetModal({
  visible,
  title,
  onClose,
  children,
  testID,
  scrollable = true,
  closeDisabled,
  onLock,
}: SheetModalProps): React.JSX.Element {
  return (
    <AppModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeDisabled ? () => undefined : onClose}
      onLock={onLock ?? (closeDisabled ? undefined : onClose)}
    >
      {/* 스크롤하지 않는 고정 레이아웃(PIN 패드)은 오프라인 배너만큼 키패드가 화면 밖으로
          밀릴 수 있다. PIN 확인은 네트워크와 무관하므로 PinVerifyModal처럼 배너를 끈다. */}
      <Screen testID={testID} offlineBanner={scrollable}>
        <ScreenHeader
          title={title}
          leftIcon="close"
          onBack={onClose}
          backDisabled={closeDisabled}
          backTestID={testID ? `${testID}-close` : undefined}
        />
        {scrollable ? (
          <SheetScroll
            contentContainerStyle={sheetContentStyle}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </SheetScroll>
        ) : (
          <SheetBody>{children}</SheetBody>
        )}
      </Screen>
    </AppModal>
  );
}

const sheetContentStyle: ViewStyle = { padding: 20, paddingBottom: 40 };

export type InfoTone = 'info' | 'warning' | 'error';

export const InfoBox = styled.View<{ $tone?: InfoTone }>`
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
  border-width: 1px;
  background-color: ${({ theme, $tone = 'info' }) =>
    $tone === 'error'
      ? theme.colors.errorSubtle
      : $tone === 'warning'
      ? theme.colors.warningSubtle
      : theme.colors.primarySubtle};
  border-color: ${({ theme, $tone = 'info' }) =>
    $tone === 'error'
      ? theme.colors.error
      : $tone === 'warning'
      ? theme.colors.warning
      : theme.colors.primary};
`;

export const InfoTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 15px;
  font-weight: 700;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

export const InfoText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  line-height: 20px;
`;

export const HintText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  line-height: 18px;
  margin: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.xs}px 0;
`;

export const ErrorMessage = styled.Text.attrs({
  accessibilityRole: 'alert',
  accessibilityLiveRegion: 'polite',
})`
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
  text-align: center;
  margin: ${({ theme }) => theme.spacing.sm}px 0;
`;

export const ButtonStack = styled.View`
  margin-top: ${({ theme }) => theme.spacing.lg}px;
  gap: ${({ theme }) => theme.spacing.sm}px;
`;

export const Badge = styled.Text<{ $tone?: 'primary' | 'warning' | 'muted' }>`
  font-size: 11px;
  font-weight: 700;
  overflow: hidden;
  padding: 2px 6px;
  border-radius: 6px;
  margin-left: ${({ theme }) => theme.spacing.xs}px;
  color: ${({ theme }) => theme.colors.textPrimary};
  background-color: ${({ theme, $tone = 'primary' }) =>
    $tone === 'warning'
      ? theme.colors.warningSubtle
      : $tone === 'muted'
      ? theme.colors.backgroundTertiary
      : theme.colors.primarySubtle};
`;

const rowBase = `
  flex-direction: row;
  align-items: center;
  min-height: 56px;
`;

const RowTouchable = styled.TouchableOpacity<{ $divider?: boolean }>`
  ${rowBase}
  padding: 12px ${({ theme }) => theme.spacing.md}px;
  border-bottom-width: ${({ $divider }) => ($divider ? 1 : 0)}px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const RowStatic = styled.View<{ $divider?: boolean }>`
  ${rowBase}
  padding: 12px ${({ theme }) => theme.spacing.md}px;
  border-bottom-width: ${({ $divider }) => ($divider ? 1 : 0)}px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const RowIcon = styled.Text`
  font-size: 20px;
  width: 28px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
  text-align: center;
`;

const RowText = styled.View`
  flex: 1;
  padding-right: ${({ theme }) => theme.spacing.sm}px;
`;

const RowTitle = styled.Text<{ $danger?: boolean; $disabled?: boolean }>`
  color: ${({ theme, $danger, $disabled }) =>
    $disabled
      ? theme.colors.disabledText
      : $danger
      ? theme.colors.error
      : theme.colors.textPrimary};
  font-size: 16px;
`;

const RowSubtitle = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  line-height: 18px;
  margin-top: 2px;
`;

const RowValue = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
  max-width: 50%;
  margin-right: ${({ theme }) => theme.spacing.xs}px;
`;

const Chevron = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 22px;
`;

const OptionTouchable = styled.TouchableOpacity<{ $selected: boolean }>`
  ${rowBase}
  padding: 12px ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border-width: 1px;
  border-color: ${({ theme, $selected }) =>
    $selected ? theme.colors.primary : theme.colors.border};
  background-color: ${({ theme, $selected }) =>
    $selected ? theme.colors.primarySubtle : theme.colors.surface};
`;

const OptionLabel = styled.Text<{ $selected: boolean }>`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: ${({ $selected }) => ($selected ? '600' : '400')};
`;

const CheckMark = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 20px;
  font-weight: 700;
`;

const SheetScroll = styled.ScrollView`
  flex: 1;
`;

const SheetBody = styled.View`
  flex: 1;
  padding: 20px;
`;
