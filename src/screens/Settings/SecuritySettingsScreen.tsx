/**
 * 보안 화면
 *
 * 지갑 백업(복구 구문) · 잠금(PIN 변경, 생체 인증, 자동 잠금) · 거래 승인(PIN 정책, 한도)
 * · dApp 권한(토큰 승인) · 주소 기록.
 *
 * 보안을 약하게 만드는 변경(거래 PIN 끄기, 한도 올리기/없애기)과 생체 인증 활성화는
 * PIN 확인을 거친다.
 */

import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StatusBar } from 'react-native';
import styled from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { useTheme } from '@/hooks/useTheme';
import {
  AUTO_LOCK_LABELS,
  formatTransactionLimitUsd,
  useSecurityStore,
  type AutoLockOption,
} from '@/store/securityStore';
import { showToast } from '@/store/toastStore';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import {
  Group,
  HintText,
  InfoBox,
  InfoText,
  Section,
  SectionTitle,
  SettingRow,
  SwitchRow,
} from './components/SettingsUI';
import { RecoveryPhraseModal } from './components/RecoveryPhraseModal';
import { ChangePinModal } from './components/ChangePinModal';
import { PinVerifyModal } from './components/PinPrompt';
import {
  AutoLockModal,
  TransactionLimitModal,
  useLimitInSelectedCurrency,
} from './components/SecurityModals';
import { useBiometricSetting } from './hooks/useBiometricSetting';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ActiveModal =
  | 'recovery'
  | 'changePin'
  | 'autoLock'
  | 'limit'
  | 'biometricPin'
  | 'disableTxPin'
  | null;

/** 현재 거래 PIN 정책을 한 문장으로 설명한다. */
export function describeTransactionPinPolicy(
  requirePin: boolean,
  limit: number | null,
  limitInSelectedCurrency?: string | null,
): string {
  if (requirePin) {
    return '모든 송금·스왑·dApp 서명 전에 PIN을 입력합니다.';
  }
  if (limit === null) {
    return '모든 거래가 PIN 없이 진행됩니다. 잠금 해제된 기기를 가진 사람은 누구나 송금할 수 있어 권장하지 않습니다.';
  }
  const amount = `${formatTransactionLimitUsd(limit)}${
    limitInSelectedCurrency ? `(${limitInSelectedCurrency})` : ''
  }`;
  return `${amount} 이하 거래는 PIN 없이 진행되고, 한도를 넘거나 금액(USD)을 확인할 수 없는 거래는 PIN이 필요합니다.`;
}

export function SecuritySettingsScreen(): React.JSX.Element {
  const { isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const {
    autoLockTimeout,
    setAutoLockTimeout,
    requirePinForTransaction,
    setRequirePinForTransaction,
    transactionLimit,
    setTransactionLimit,
    recentAddressCount,
    clearRecentAddresses,
  } = useSecurityStore(
    useShallow(state => ({
      autoLockTimeout: state.autoLockTimeout,
      setAutoLockTimeout: state.setAutoLockTimeout,
      requirePinForTransaction: state.requirePinForTransaction,
      setRequirePinForTransaction: state.setRequirePinForTransaction,
      transactionLimit: state.transactionLimit,
      setTransactionLimit: state.setTransactionLimit,
      recentAddressCount: state.recentAddresses?.length ?? 0,
      clearRecentAddresses: state.clearRecentAddresses,
    })),
  );
  const biometric = useBiometricSetting();
  const toSelectedCurrency = useLimitInSelectedCurrency();
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const closeModal = useCallback(() => setActiveModal(null), []);

  const limitLabel = formatTransactionLimitUsd(transactionLimit);
  const limitConverted = toSelectedCurrency(transactionLimit);

  const handleSelectAutoLock = useCallback(
    (option: AutoLockOption) => {
      setAutoLockTimeout(option);
      closeModal();
    },
    [closeModal, setAutoLockTimeout],
  );

  const handleToggleTxPin = useCallback(
    (value: boolean) => {
      if (value) {
        setRequirePinForTransaction(true);
        showToast('모든 거래에 PIN을 요구합니다.', 'success');
      } else {
        setActiveModal('disableTxPin');
      }
    },
    [setRequirePinForTransaction],
  );

  const handleDisableTxPinVerified = useCallback(() => {
    setRequirePinForTransaction(false);
    closeModal();
    showToast('거래 PIN 요구를 껐습니다.', 'warning');
  }, [closeModal, setRequirePinForTransaction]);

  const handleSaveLimit = useCallback(
    (limit: number | null) => {
      try {
        setTransactionLimit(limit);
        closeModal();
        showToast(
          `한도를 ${formatTransactionLimitUsd(limit)}(으)로 저장했습니다.`,
          'success',
        );
      } catch (error) {
        Alert.alert(
          '저장 실패',
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [closeModal, setTransactionLimit],
  );

  const handleToggleBiometric = useCallback(
    async (value: boolean) => {
      if (!value) {
        try {
          await biometric.disable();
          showToast('생체 인증을 껐습니다.', 'success');
        } catch {
          Alert.alert('오류', '생체 인증을 끄지 못했습니다.');
        }
        return;
      }
      if (!biometric.supported) {
        Alert.alert(
          '사용할 수 없음',
          '이 기기에서는 생체 인증을 사용할 수 없습니다.',
        );
        return;
      }
      setActiveModal('biometricPin');
    },
    [biometric],
  );

  const handleBiometricPinVerified = useCallback(
    async (mnemonic: string) => {
      closeModal();
      try {
        await biometric.enable(mnemonic);
        showToast('생체 인증을 켰습니다.', 'success');
      } catch {
        Alert.alert('오류', '생체 인증을 켜지 못했습니다. 다시 시도해주세요.');
      }
    },
    [biometric, closeModal],
  );

  const handleClearRecentAddresses = useCallback(() => {
    Alert.alert(
      '최근 주소 삭제',
      '송금 화면에 표시되는 최근 사용 주소 기록을 모두 삭제할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            clearRecentAddresses();
            showToast('최근 주소를 삭제했습니다.', 'success');
          },
        },
      ],
    );
  }, [clearRecentAddresses]);

  return (
    <Screen testID="security-settings-screen">
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScreenHeader title="보안" testID="security-settings-header" />
      <ScrollView contentContainerStyle={contentStyle}>
        <Section>
          <SectionTitle>지갑 백업</SectionTitle>
          <Group>
            <SettingRow
              icon="🔑"
              title="복구 구문 보기"
              subtitle="PIN 확인 후 12/24개 단어를 표시합니다"
              onPress={() => setActiveModal('recovery')}
              testID="security-recovery-phrase"
            />
          </Group>
        </Section>

        <Section>
          <SectionTitle>잠금</SectionTitle>
          <Group>
            <SettingRow
              icon="🔢"
              title="PIN 변경"
              onPress={() => setActiveModal('changePin')}
              divider
              testID="security-change-pin"
            />
            <SwitchRow
              icon="👆"
              title="생체 인증으로 잠금 해제"
              subtitle={
                biometric.isLoaded && !biometric.supported
                  ? '이 기기에서는 사용할 수 없습니다'
                  : 'Face ID / 지문으로 잠금을 해제합니다'
              }
              value={biometric.enabled}
              onValueChange={handleToggleBiometric}
              disabled={
                (!biometric.supported && !biometric.enabled) ||
                biometric.isUpdating
              }
              divider
              testID="security-biometric-switch"
            />
            <SettingRow
              icon="⏱️"
              title="자동 잠금 시간"
              subtitle="사용하지 않거나 앱을 벗어난 뒤 잠금"
              value={AUTO_LOCK_LABELS[autoLockTimeout]}
              onPress={() => setActiveModal('autoLock')}
              testID="security-auto-lock"
            />
          </Group>
        </Section>

        <Section>
          <SectionTitle>거래 승인</SectionTitle>
          <Group>
            <SwitchRow
              icon="🔐"
              title="PIN 항상 요구"
              subtitle="송금·스왑·dApp 서명 전 PIN 입력"
              value={requirePinForTransaction}
              onValueChange={handleToggleTxPin}
              divider
              testID="security-tx-pin-switch"
            />
            <SettingRow
              icon="💰"
              title="PIN 없이 허용할 한도"
              subtitle={
                requirePinForTransaction
                  ? '"PIN 항상 요구"를 끄면 적용됩니다'
                  : limitConverted ?? 'USD 기준'
              }
              value={limitLabel}
              onPress={() => setActiveModal('limit')}
              testID="security-tx-limit"
            />
          </Group>
          <PolicyBox
            $tone={
              !requirePinForTransaction && transactionLimit === null
                ? 'warning'
                : 'info'
            }
          >
            <InfoText testID="security-tx-policy">
              현재 설정:{' '}
              {describeTransactionPinPolicy(
                requirePinForTransaction,
                transactionLimit,
                limitConverted,
              )}
            </InfoText>
          </PolicyBox>
        </Section>

        <Section>
          <SectionTitle>dApp 권한</SectionTitle>
          <Group>
            <SettingRow
              icon="🛡️"
              title="토큰 승인 관리"
              subtitle="dApp에 허용한 토큰 사용 권한 확인·취소"
              onPress={() => navigation.navigate('TokenApprovals')}
              testID="security-token-approvals"
            />
          </Group>
        </Section>

        <Section>
          <SectionTitle>주소 기록</SectionTitle>
          <Group>
            <SettingRow
              icon="🧹"
              title="최근 주소 삭제"
              subtitle={`최근 사용한 주소 ${recentAddressCount}개`}
              onPress={handleClearRecentAddresses}
              disabled={recentAddressCount === 0}
              showChevron={false}
              testID="security-clear-recent"
            />
          </Group>
          <HintText>
            주소록은 설정 화면의 &quot;주소록&quot;에서 관리할 수 있습니다.
          </HintText>
        </Section>
      </ScrollView>

      <RecoveryPhraseModal
        visible={activeModal === 'recovery'}
        onClose={closeModal}
      />
      <ChangePinModal
        visible={activeModal === 'changePin'}
        onClose={closeModal}
      />
      <AutoLockModal
        visible={activeModal === 'autoLock'}
        value={autoLockTimeout}
        onSelect={handleSelectAutoLock}
        onClose={closeModal}
      />
      <TransactionLimitModal
        visible={activeModal === 'limit'}
        currentLimit={transactionLimit}
        onSave={handleSaveLimit}
        onClose={closeModal}
      />
      <PinVerifyModal
        visible={activeModal === 'biometricPin'}
        title="생체 인증 켜기"
        description="생체 인증을 켜려면 PIN을 입력하세요."
        onVerified={handleBiometricPinVerified}
        onCancel={closeModal}
        testID="biometric-pin-modal"
      />
      <PinVerifyModal
        visible={activeModal === 'disableTxPin'}
        title="거래 PIN 끄기"
        description="PIN 없이 거래할 수 있게 하려면 PIN을 입력하세요."
        onVerified={handleDisableTxPinVerified}
        onCancel={closeModal}
        testID="disable-tx-pin-modal"
      />
    </Screen>
  );
}

const contentStyle = { padding: 20, paddingBottom: 40 };

const PolicyBox = styled(InfoBox)`
  margin-top: ${({ theme }) => theme.spacing.sm}px;
  margin-bottom: 0;
`;

export default SecuritySettingsScreen;
