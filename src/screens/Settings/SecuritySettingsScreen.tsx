/**
 * Tori Wallet - Security Settings Screen
 * 보안 설정 화면 - 자동 잠금, 트랜잭션 보안 설정
 */

import React, { useState, useCallback } from 'react';
import styled from 'styled-components/native';
import {
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  Modal,
  Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  useSecurityStore,
  AUTO_LOCK_OPTIONS,
  AUTO_LOCK_LABELS,
  AutoLockOption,
} from '@/store/securityStore';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function SecuritySettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const {
    autoLockTimeout,
    setAutoLockTimeout,
    requirePinForTransaction,
    setRequirePinForTransaction,
    transactionLimit,
    setTransactionLimit,
    addressBook,
    clearRecentAddresses,
  } = useSecurityStore();

  const [showAutoLockModal, setShowAutoLockModal] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitInput, setLimitInput] = useState(
    transactionLimit?.toString() || '',
  );

  const handleSelectAutoLock = useCallback(
    (option: AutoLockOption) => {
      setAutoLockTimeout(option);
      setShowAutoLockModal(false);
    },
    [setAutoLockTimeout],
  );

  const handleTogglePinForTransaction = useCallback(
    (value: boolean) => {
      if (!value) {
        Alert.alert(
          '주의',
          '트랜잭션 PIN 확인을 비활성화하면 송금/스왑 시 추가 인증 없이 진행됩니다.\n\n정말 비활성화하시겠습니까?',
          [
            { text: '취소', style: 'cancel' },
            {
              text: '비활성화',
              style: 'destructive',
              onPress: () => setRequirePinForTransaction(false),
            },
          ],
        );
      } else {
        setRequirePinForTransaction(true);
      }
    },
    [setRequirePinForTransaction],
  );

  const handleSaveLimit = useCallback(() => {
    const value = limitInput.trim();
    if (value === '') {
      setTransactionLimit(null);
    } else {
      const numValue = parseFloat(value);
      if (isNaN(numValue) || numValue < 0) {
        Alert.alert('오류', '유효한 금액을 입력해주세요.');
        return;
      }
      setTransactionLimit(numValue);
    }
    setShowLimitModal(false);
  }, [limitInput, setTransactionLimit]);

  const handleClearRecentAddresses = useCallback(() => {
    Alert.alert(
      '최근 주소 삭제',
      '최근 사용한 주소 기록을 모두 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            clearRecentAddresses();
            Alert.alert('완료', '최근 주소가 삭제되었습니다.');
          },
        },
      ],
    );
  }, [clearRecentAddresses]);

  const navigateToAddressBook = useCallback(() => {
    navigation.navigate('AddressBook' as never);
  }, [navigation]);

  return (
    <Container>
      <StatusBar barStyle="light-content" />
      <ScrollView>
        <Content>
          <Title>보안 설정</Title>

          {/* 자동 잠금 설정 */}
          <Section>
            <SectionTitle>자동 잠금</SectionTitle>
            <SettingItem onPress={() => setShowAutoLockModal(true)}>
              <SettingLeft>
                <SettingIcon>🔒</SettingIcon>
                <SettingTextContainer>
                  <SettingText>자동 잠금 시간</SettingText>
                  <SettingSubtext>
                    앱이 백그라운드로 전환된 후 자동으로 잠금
                  </SettingSubtext>
                </SettingTextContainer>
              </SettingLeft>
              <SettingValue>
                <ValueText>{AUTO_LOCK_LABELS[autoLockTimeout]}</ValueText>
                <ArrowText>›</ArrowText>
              </SettingValue>
            </SettingItem>
          </Section>

          {/* 트랜잭션 보안 */}
          <Section>
            <SectionTitle>트랜잭션 보안</SectionTitle>

            <SettingItemRow>
              <SettingLeft>
                <SettingIcon>🔐</SettingIcon>
                <SettingTextContainer>
                  <SettingText>송금/스왑 시 PIN 확인</SettingText>
                  <SettingSubtext>트랜잭션 전 PIN 입력 필요</SettingSubtext>
                </SettingTextContainer>
              </SettingLeft>
              <Switch
                value={requirePinForTransaction}
                onValueChange={handleTogglePinForTransaction}
                trackColor={{ false: '#3e3e3e', true: '#4CAF50' }}
              />
            </SettingItemRow>

            <SettingItem onPress={() => setShowLimitModal(true)}>
              <SettingLeft>
                <SettingIcon>💰</SettingIcon>
                <SettingTextContainer>
                  <SettingText>트랜잭션 한도</SettingText>
                  <SettingSubtext>
                    설정 금액 초과 시 추가 확인 필요
                  </SettingSubtext>
                </SettingTextContainer>
              </SettingLeft>
              <SettingValue>
                <ValueText>
                  {transactionLimit
                    ? `$${transactionLimit.toLocaleString()}`
                    : '무제한'}
                </ValueText>
                <ArrowText>›</ArrowText>
              </SettingValue>
            </SettingItem>
          </Section>

          {/* 주소록 관리 */}
          <Section>
            <SectionTitle>주소 관리</SectionTitle>

            <SettingItem onPress={navigateToAddressBook}>
              <SettingLeft>
                <SettingIcon>📋</SettingIcon>
                <SettingTextContainer>
                  <SettingText>주소록</SettingText>
                  <SettingSubtext>
                    {addressBook.length}개의 저장된 주소
                  </SettingSubtext>
                </SettingTextContainer>
              </SettingLeft>
              <ArrowText>›</ArrowText>
            </SettingItem>

            <SettingItem onPress={handleClearRecentAddresses}>
              <SettingLeft>
                <SettingIcon>🗑️</SettingIcon>
                <SettingTextContainer>
                  <SettingText>최근 주소 삭제</SettingText>
                  <SettingSubtext>최근 사용한 주소 기록 삭제</SettingSubtext>
                </SettingTextContainer>
              </SettingLeft>
            </SettingItem>
          </Section>
        </Content>
      </ScrollView>

      {/* 자동 잠금 선택 모달 */}
      <Modal
        visible={showAutoLockModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAutoLockModal(false)}
      >
        <ModalContainer>
          <ModalHeader>
            <ModalTitle>자동 잠금 시간</ModalTitle>
            <CloseButton onPress={() => setShowAutoLockModal(false)}>
              <CloseButtonText>✕</CloseButtonText>
            </CloseButton>
          </ModalHeader>
          <ModalContent>
            {(Object.keys(AUTO_LOCK_OPTIONS) as AutoLockOption[]).map(
              option => (
                <OptionItem
                  key={option}
                  onPress={() => handleSelectAutoLock(option)}
                  $selected={autoLockTimeout === option}
                >
                  <OptionText $selected={autoLockTimeout === option}>
                    {AUTO_LOCK_LABELS[option]}
                  </OptionText>
                  {autoLockTimeout === option && <CheckMark>✓</CheckMark>}
                </OptionItem>
              ),
            )}
          </ModalContent>
        </ModalContainer>
      </Modal>

      {/* 트랜잭션 한도 설정 모달 */}
      <Modal
        visible={showLimitModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLimitModal(false)}
      >
        <ModalContainer>
          <ModalHeader>
            <ModalTitle>트랜잭션 한도</ModalTitle>
            <CloseButton onPress={() => setShowLimitModal(false)}>
              <CloseButtonText>✕</CloseButtonText>
            </CloseButton>
          </ModalHeader>
          <ModalContent>
            <InputLabel>한도 금액 (USD)</InputLabel>
            <TextInput
              value={limitInput}
              onChangeText={setLimitInput}
              placeholder="비워두면 무제한"
              placeholderTextColor="#666"
              keyboardType="numeric"
            />
            <HelpText>
              설정한 금액을 초과하는 트랜잭션 시 추가 확인이 필요합니다.
            </HelpText>
            <SaveButton onPress={handleSaveLimit}>
              <SaveButtonText>저장</SaveButtonText>
            </SaveButton>
          </ModalContent>
        </ModalContainer>
      </Modal>
    </Container>
  );
}

// Styled Components
const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Content = styled.View`
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const Title = styled.Text`
  font-size: 28px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const Section = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const SectionTitle = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const SettingItem = styled.TouchableOpacity`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const SettingItemRow = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const SettingLeft = styled.View`
  flex-direction: row;
  align-items: center;
  flex: 1;
`;

const SettingIcon = styled.Text`
  font-size: 20px;
  margin-right: ${({ theme }) => theme.spacing.md}px;
`;

const SettingTextContainer = styled.View`
  flex: 1;
`;

const SettingText = styled.Text`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const SettingSubtext = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 2px;
`;

const SettingValue = styled.View`
  flex-direction: row;
  align-items: center;
`;

const ValueText = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const ArrowText = styled.Text`
  font-size: 20px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

// Modal Styles
const ModalContainer = styled.View`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const ModalHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const ModalTitle = styled.Text`
  font-size: 20px;
  font-weight: bold;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const CloseButton = styled.TouchableOpacity`
  padding: ${({ theme }) => theme.spacing.sm}px;
`;

const CloseButtonText = styled.Text`
  font-size: 20px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ModalContent = styled.View`
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const OptionItem = styled.TouchableOpacity<{ $selected?: boolean }>`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ $selected, theme }) =>
    $selected ? theme.colors.primaryLight : theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const OptionText = styled.Text<{ $selected?: boolean }>`
  font-size: 16px;
  color: ${({ $selected, theme }) =>
    $selected ? theme.colors.primary : theme.colors.textPrimary};
  font-weight: ${({ $selected }) => ($selected ? '600' : '400')};
`;

const CheckMark = styled.Text`
  font-size: 18px;
  color: ${({ theme }) => theme.colors.primary};
`;

const InputLabel = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const TextInput = styled.TextInput`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.border};
`;

const HelpText = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

const SaveButton = styled.TouchableOpacity`
  background-color: ${({ theme }) => theme.colors.primary};
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.lg}px;
`;

const SaveButtonText = styled.Text`
  color: #fff;
  font-size: 16px;
  font-weight: 600;
`;

export default SecuritySettingsScreen;
