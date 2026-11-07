/**
 * 스왑 설정 모달
 *
 * 0x v2 견적이 실제로 반영하는 슬리피지만 설정한다. 저장한 값은 swapStore에
 * 영구 저장되고, 스왑 화면은 이 값을 견적 요청(slippageBps)에 사용한다.
 */

import React, { useEffect, useState } from 'react';
import { Switch } from 'react-native';
import { AppModal } from '@/components/common/AppModal';
import styled, { useTheme } from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import {
  useSwapStore,
  SwapSettings,
  SLIPPAGE_OPTIONS,
  AUTO_SLIPPAGE_DEFAULT,
  AUTO_SLIPPAGE_STABLE,
  HIGH_SLIPPAGE_PERCENT,
} from '@/store/swapStore';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SwapSettingsModal({
  visible,
  onClose,
}: Props): React.JSX.Element {
  const theme = useTheme();
  const { settings, updateSettings, resetSettings } = useSwapStore(
    useShallow(state => ({
      settings: state.settings,
      updateSettings: state.updateSettings,
      resetSettings: state.resetSettings,
    })),
  );
  const [localSettings, setLocalSettings] = useState<SwapSettings>(settings);

  // 다시 열 때마다 저장된 값에서 시작한다 (저장하지 않은 변경은 버림).
  useEffect(() => {
    if (visible) setLocalSettings(settings);
  }, [visible, settings]);

  const handleSave = () => {
    updateSettings(localSettings);
    onClose();
  };

  const handleReset = () => {
    resetSettings();
    setLocalSettings(useSwapStore.getState().settings);
  };

  const handleSlippageChange = (value: number) => {
    setLocalSettings(prev => ({
      ...prev,
      defaultSlippage: value,
      autoSlippage: false,
    }));
  };

  const handleAutoSlippageToggle = (enabled: boolean) => {
    setLocalSettings(prev => ({ ...prev, autoSlippage: enabled }));
  };

  const isHighSlippage =
    !localSettings.autoSlippage &&
    localSettings.defaultSlippage >= HIGH_SLIPPAGE_PERCENT;

  return (
    <AppModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onLock={onClose}
    >
      <Screen testID="swap-settings-modal">
        <ScreenHeader
          title="스왑 설정"
          leftIcon="close"
          onBack={onClose}
          backTestID="swap-settings-close"
          right={
            <SaveButton
              onPress={handleSave}
              accessibilityRole="button"
              accessibilityLabel="설정 저장"
              testID="swap-settings-save"
            >
              <SaveButtonText>저장</SaveButtonText>
            </SaveButton>
          }
        />

        <Content>
          <Section>
            <SectionTitle>슬리피지 허용치</SectionTitle>
            <SectionDescription>
              견적보다 불리하게 체결될 수 있는 최대 비율입니다. 이 범위를 넘으면
              스왑은 실패하고, 수수료만 소모됩니다.
            </SectionDescription>

            <SettingRow>
              <SettingTextGroup>
                <SettingLabel>자동</SettingLabel>
                <SettingHint>
                  스테이블코인끼리 {AUTO_SLIPPAGE_STABLE}%, 그 외{' '}
                  {AUTO_SLIPPAGE_DEFAULT}%
                </SettingHint>
              </SettingTextGroup>
              <Switch
                value={localSettings.autoSlippage}
                onValueChange={handleAutoSlippageToggle}
                trackColor={{
                  false: theme.colors.disabledBackground,
                  true: theme.colors.primary,
                }}
                thumbColor={theme.colors.onPrimary}
                accessibilityLabel="자동 슬리피지"
                testID="swap-settings-auto-slippage"
              />
            </SettingRow>

            <SlippageOptions accessibilityRole="radiogroup">
              {SLIPPAGE_OPTIONS.map(value => {
                const selected =
                  !localSettings.autoSlippage &&
                  localSettings.defaultSlippage === value;
                return (
                  <SlippageOption
                    key={value}
                    $isSelected={selected}
                    onPress={() => handleSlippageChange(value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`슬리피지 ${value}%`}
                    testID={`swap-settings-slippage-${value}`}
                  >
                    <SlippageOptionText $isSelected={selected}>
                      {value}%
                    </SlippageOptionText>
                  </SlippageOption>
                );
              })}
            </SlippageOptions>

            {isHighSlippage && (
              <WarningBox accessibilityRole="alert">
                <WarningText>
                  ⚠️ 높은 슬리피지는 불리한 가격에 체결되거나 샌드위치 공격을
                  받을 수 있습니다.
                </WarningText>
              </WarningBox>
            )}
          </Section>

          <Note>
            거래 기한과 가스 우선순위는 0x 견적에 포함된 값으로 처리되어 따로
            설정할 수 없습니다. 검토한 견적은 90초 동안 유효합니다.
          </Note>

          <ResetButton
            onPress={handleReset}
            accessibilityRole="button"
            testID="swap-settings-reset"
          >
            <ResetButtonText>설정 초기화</ResetButtonText>
          </ResetButton>
        </Content>
      </Screen>
    </AppModal>
  );
}

// Styled Components
const SaveButton = styled.TouchableOpacity`
  min-height: 44px;
  justify-content: center;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
`;

const SaveButtonText = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.primary};
`;

const Content = styled.ScrollView`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const Section = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const SectionTitle = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const SectionDescription = styled.Text`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
  line-height: 18px;
`;

const SettingRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.sm}px 0;
`;

const SettingTextGroup = styled.View`
  flex: 1;
  margin-right: ${({ theme }) => theme.spacing.md}px;
`;

const SettingLabel = styled.Text`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const SettingHint = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 2px;
`;

const SlippageOptions = styled.View`
  flex-direction: row;
  gap: 8px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

const SlippageOption = styled.TouchableOpacity<{ $isSelected: boolean }>`
  flex: 1;
  min-height: 44px;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border-width: 1px;
  border-color: ${({ theme, $isSelected }) =>
    $isSelected ? theme.colors.primary : theme.colors.border};
  background-color: ${({ theme, $isSelected }) =>
    $isSelected
      ? theme.colors.primarySubtle
      : theme.colors.backgroundSecondary};
  align-items: center;
`;

const SlippageOptionText = styled.Text<{ $isSelected: boolean }>`
  font-size: 14px;
  font-weight: ${({ $isSelected }) => ($isSelected ? 700 : 500)};
  color: ${({ theme, $isSelected }) =>
    $isSelected ? theme.colors.textPrimary : theme.colors.textSecondary};
`;

const WarningBox = styled.View`
  background-color: ${({ theme }) => theme.colors.warningSubtle};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  padding: ${({ theme }) => theme.spacing.sm}px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

const WarningText = styled.Text`
  font-size: 13px;
  line-height: 18px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const Note = styled.Text`
  font-size: 12px;
  line-height: 18px;
  color: ${({ theme }) => theme.colors.textSecondary};
  padding: 0 ${({ theme }) => theme.spacing.xs}px;
`;

const ResetButton = styled.TouchableOpacity`
  min-height: 44px;
  justify-content: center;
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const ResetButtonText = styled.Text`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-decoration-line: underline;
`;

export default SwapSettingsModal;
