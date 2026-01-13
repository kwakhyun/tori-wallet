/**
 * Tori Wallet - Swap Settings Modal
 * 스왑 고급 설정 모달
 */

import React, { useState } from 'react';
import { Modal, Switch } from 'react-native';
import styled from 'styled-components/native';
import { useSwapStore, SwapSettings } from '@/store/swapStore';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SwapSettingsModal({
  visible,
  onClose,
}: Props): React.JSX.Element {
  const { settings, updateSettings, resetSettings } = useSwapStore();
  const [localSettings, setLocalSettings] = useState<SwapSettings>(settings);

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
    setLocalSettings(prev => ({
      ...prev,
      autoSlippage: enabled,
    }));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <Container>
        <Header>
          <CloseButton onPress={onClose}>
            <CloseIcon>✕</CloseIcon>
          </CloseButton>
          <HeaderTitle>스왑 설정</HeaderTitle>
          <SaveButton onPress={handleSave}>
            <SaveButtonText>저장</SaveButtonText>
          </SaveButton>
        </Header>

        <Content>
          {/* 슬리피지 설정 */}
          <Section>
            <SectionTitle>슬리피지 허용치</SectionTitle>
            <SectionDescription>
              실제 거래 가격이 예상 가격과 얼마나 다를 수 있는지 설정합니다.
            </SectionDescription>

            <SettingRow>
              <SettingLabel>자동 슬리피지</SettingLabel>
              <Switch
                value={localSettings.autoSlippage}
                onValueChange={handleAutoSlippageToggle}
                trackColor={{ false: '#3A3A4C', true: '#6366F1' }}
                thumbColor="#FFF"
              />
            </SettingRow>

            {!localSettings.autoSlippage && (
              <SlippageOptions>
                {[0.1, 0.5, 1.0, 2.0, 3.0].map(value => (
                  <SlippageOption
                    key={value}
                    $isSelected={localSettings.defaultSlippage === value}
                    onPress={() => handleSlippageChange(value)}
                  >
                    <SlippageOptionText
                      $isSelected={localSettings.defaultSlippage === value}
                    >
                      {value}%
                    </SlippageOptionText>
                  </SlippageOption>
                ))}
              </SlippageOptions>
            )}

            {localSettings.defaultSlippage >= 3 && (
              <WarningBox>
                <WarningText>
                  ⚠️ 높은 슬리피지는 불리한 가격에 거래될 수 있습니다.
                </WarningText>
              </WarningBox>
            )}
          </Section>

          {/* 거래 기한 */}
          <Section>
            <SectionTitle>거래 기한</SectionTitle>
            <SectionDescription>
              이 시간 내에 거래가 완료되지 않으면 취소됩니다.
            </SectionDescription>

            <DeadlineOptions>
              {[10, 20, 30, 60].map(value => (
                <DeadlineOption
                  key={value}
                  $isSelected={localSettings.txDeadlineMinutes === value}
                  onPress={() =>
                    setLocalSettings(prev => ({
                      ...prev,
                      txDeadlineMinutes: value,
                    }))
                  }
                >
                  <DeadlineOptionText
                    $isSelected={localSettings.txDeadlineMinutes === value}
                  >
                    {value}분
                  </DeadlineOptionText>
                </DeadlineOption>
              ))}
            </DeadlineOptions>
          </Section>

          {/* 가스 설정 */}
          <Section>
            <SectionTitle>가스 우선순위</SectionTitle>
            <SectionDescription>
              거래 처리 속도를 선택합니다. 높을수록 더 빨리 처리됩니다.
            </SectionDescription>

            <GasOptions>
              {[
                { key: 'low', label: '느림', icon: '🐢' },
                { key: 'medium', label: '보통', icon: '🚗' },
                { key: 'high', label: '빠름', icon: '🚀' },
              ].map(option => (
                <GasOption
                  key={option.key}
                  $isSelected={localSettings.gasPreference === option.key}
                  onPress={() =>
                    setLocalSettings(prev => ({
                      ...prev,
                      gasPreference: option.key as 'low' | 'medium' | 'high',
                    }))
                  }
                >
                  <GasIcon>{option.icon}</GasIcon>
                  <GasLabel
                    $isSelected={localSettings.gasPreference === option.key}
                  >
                    {option.label}
                  </GasLabel>
                </GasOption>
              ))}
            </GasOptions>
          </Section>

          {/* 고급 설정 */}
          <Section>
            <SectionTitle>고급 설정</SectionTitle>

            <SettingRow>
              <SettingLabel>전문가 모드</SettingLabel>
              <Switch
                value={localSettings.expertMode}
                onValueChange={value =>
                  setLocalSettings(prev => ({ ...prev, expertMode: value }))
                }
                trackColor={{ false: '#3A3A4C', true: '#6366F1' }}
                thumbColor="#FFF"
              />
            </SettingRow>
            <SettingDescription>
              높은 가격 영향 경고 없이 거래할 수 있습니다.
            </SettingDescription>

            {!localSettings.expertMode && (
              <SettingRow>
                <SettingLabel>가격 영향 경고</SettingLabel>
                <Switch
                  value={localSettings.showPriceImpactWarning}
                  onValueChange={value =>
                    setLocalSettings(prev => ({
                      ...prev,
                      showPriceImpactWarning: value,
                    }))
                  }
                  trackColor={{ false: '#3A3A4C', true: '#6366F1' }}
                  thumbColor="#FFF"
                />
              </SettingRow>
            )}
          </Section>

          {/* 초기화 버튼 */}
          <ResetButton onPress={handleReset}>
            <ResetButtonText>설정 초기화</ResetButtonText>
          </ResetButton>
        </Content>
      </Container>
    </Modal>
  );
}

// Styled Components
const Container = styled.View`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const CloseButton = styled.TouchableOpacity`
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
`;

const CloseIcon = styled.Text`
  font-size: 20px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const HeaderTitle = styled.Text`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const SaveButton = styled.TouchableOpacity`
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
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

const SettingLabel = styled.Text`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const SettingDescription = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: -${({ theme }) => theme.spacing.xs}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const SlippageOptions = styled.View`
  flex-direction: row;
  gap: 8px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

const SlippageOption = styled.TouchableOpacity<{ $isSelected: boolean }>`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme, $isSelected }) =>
    $isSelected ? theme.colors.primary : theme.colors.backgroundSecondary};
  align-items: center;
`;

const SlippageOptionText = styled.Text<{ $isSelected: boolean }>`
  font-size: 14px;
  font-weight: 600;
  color: ${({ $isSelected }) => ($isSelected ? '#FFF' : '#888')};
`;

const DeadlineOptions = styled.View`
  flex-direction: row;
  gap: 8px;
`;

const DeadlineOption = styled.TouchableOpacity<{ $isSelected: boolean }>`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme, $isSelected }) =>
    $isSelected ? theme.colors.primary : theme.colors.backgroundSecondary};
  align-items: center;
`;

const DeadlineOptionText = styled.Text<{ $isSelected: boolean }>`
  font-size: 14px;
  font-weight: 600;
  color: ${({ $isSelected }) => ($isSelected ? '#FFF' : '#888')};
`;

const GasOptions = styled.View`
  flex-direction: row;
  gap: 12px;
`;

const GasOption = styled.TouchableOpacity<{ $isSelected: boolean }>`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme, $isSelected }) =>
    $isSelected ? theme.colors.primary : theme.colors.backgroundSecondary};
  align-items: center;
`;

const GasIcon = styled.Text`
  font-size: 24px;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const GasLabel = styled.Text<{ $isSelected: boolean }>`
  font-size: 13px;
  font-weight: 600;
  color: ${({ $isSelected }) => ($isSelected ? '#FFF' : '#888')};
`;

const WarningBox = styled.View`
  background-color: rgba(255, 193, 7, 0.15);
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  padding: ${({ theme }) => theme.spacing.sm}px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

const WarningText = styled.Text`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.warning};
`;

const ResetButton = styled.TouchableOpacity`
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const ResetButtonText = styled.Text`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-decoration-line: underline;
`;

export default SwapSettingsModal;
