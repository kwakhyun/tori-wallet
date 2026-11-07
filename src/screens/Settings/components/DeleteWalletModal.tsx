/**
 * 지갑 삭제 (또는 다른 지갑 가져오기 전 현재 지갑 삭제)
 *
 * 1) 안내 + "복구 구문 먼저 확인" 제안
 * 2) 확인 문구 직접 입력
 * 3) PIN 확인 (공용 실패 제한)
 * 4) walletResetService.reset() — 성공하면 앱이 온보딩 화면으로 돌아간다.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert } from 'react-native';
import styled, { useTheme } from 'styled-components/native';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { walletResetService } from '@/services/walletResetService';
import { createLogger } from '@/utils/logger';
import { PinPrompt } from './PinPrompt';
import { RecoveryPhraseContent } from './RecoveryPhraseModal';
import {
  ButtonStack,
  InfoBox,
  InfoText,
  InfoTitle,
  SheetModal,
} from './SettingsUI';

const logger = createLogger('DeleteWallet');

export type DeleteWalletMode = 'delete' | 'replace';

/** 사용자가 직접 입력해야 하는 확인 문구 */
export const DELETE_CONFIRMATION_PHRASE = '삭제';

type Step = 'intro' | 'backup' | 'confirm' | 'pin' | 'deleting';

const COPY: Record<
  DeleteWalletMode,
  {
    title: string;
    heading: string;
    body: string;
    action: string;
    pinDescription: string;
  }
> = {
  delete: {
    title: '지갑 완전 삭제',
    heading: '이 기기에서 지갑이 영구적으로 삭제됩니다',
    body: '복구 구문, 계정, 주소록, 거래 기록, dApp 연결이 모두 삭제됩니다. 복구 구문이 없으면 자산을 다시 찾을 수 없습니다.',
    action: '지갑 삭제',
    pinDescription: '지갑을 삭제하려면 PIN을 입력하세요.',
  },
  replace: {
    title: '다른 지갑 가져오기',
    heading: '현재 지갑을 삭제한 뒤 다른 복구 구문을 가져옵니다',
    body: '이 앱은 한 번에 하나의 복구 구문만 보관합니다. 현재 지갑의 복구 구문을 백업하지 않았다면 자산을 다시 찾을 수 없습니다. 같은 복구 구문의 다른 계정은 "계정 관리"에서 추가하세요.',
    action: '삭제하고 가져오기',
    pinDescription: '현재 지갑을 삭제하려면 PIN을 입력하세요.',
  },
};

interface DeleteWalletModalProps {
  mode: DeleteWalletMode | null;
  onClose: () => void;
}

export function DeleteWalletModal({
  mode,
  onClose,
}: DeleteWalletModalProps): React.JSX.Element {
  const copy = COPY[mode ?? 'delete'];
  const [step, setStep] = useState<Step>('intro');

  useEffect(() => {
    if (mode) setStep('intro');
  }, [mode]);

  return (
    <SheetModal
      visible={mode !== null}
      title={copy.title}
      onClose={onClose}
      closeDisabled={step === 'deleting'}
      testID="delete-wallet-modal"
    >
      {mode ? (
        <DeleteWalletFlow
          copy={copy}
          step={step}
          setStep={setStep}
          onClose={onClose}
        />
      ) : null}
    </SheetModal>
  );
}

interface FlowProps {
  copy: (typeof COPY)[DeleteWalletMode];
  step: Step;
  setStep: (step: Step) => void;
  onClose: () => void;
}

function DeleteWalletFlow({ copy, step, setStep, onClose }: FlowProps) {
  const theme = useTheme();
  const [typed, setTyped] = useState('');
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const confirmed = typed.trim() === DELETE_CONFIRMATION_PHRASE;

  const handleVerified = useCallback(async () => {
    setStep('deleting');
    try {
      await walletResetService.reset();
      logger.info('Wallet deleted by user');
    } catch (error) {
      logger.error('Failed to reset wallet', error);
      if (!mounted.current) return;
      setStep('confirm');
      Alert.alert(
        '삭제 실패',
        error instanceof Error
          ? error.message
          : '지갑을 삭제하지 못했습니다. 다시 시도해주세요.',
      );
    }
  }, [setStep]);

  if (step === 'backup') {
    return (
      <RecoveryPhraseContent
        onDone={() => setStep('intro')}
        doneLabel="백업을 확인했습니다"
        onAutoClear={onClose}
        testIDPrefix="delete-wallet-backup"
      />
    );
  }

  if (step === 'deleting') {
    return (
      <Center accessibilityLiveRegion="polite" testID="delete-wallet-progress">
        <ActivityIndicator color={theme.colors.error} size="large" />
        <CenterText>지갑을 삭제하는 중...</CenterText>
      </Center>
    );
  }

  if (step === 'pin') {
    return (
      <PinPrompt
        description={copy.pinDescription}
        onVerified={handleVerified}
        testIDPrefix="delete-wallet-pin"
      />
    );
  }

  if (step === 'confirm') {
    return (
      <>
        <InfoBox $tone="error">
          <InfoText>
            계속하려면 아래 칸에 &quot;{DELETE_CONFIRMATION_PHRASE}&quot;를
            입력하세요.
          </InfoText>
        </InfoBox>
        <Input
          label="확인 문구"
          value={typed}
          onChangeText={setTyped}
          placeholder={DELETE_CONFIRMATION_PHRASE}
          autoCapitalize="none"
          autoCorrect={false}
          testID="delete-wallet-confirm-input"
        />
        <ButtonStack>
          <DangerButton
            onPress={() => setStep('pin')}
            disabled={!confirmed}
            accessibilityRole="button"
            accessibilityLabel={`${copy.action} 계속`}
            accessibilityState={{ disabled: !confirmed }}
            testID="delete-wallet-confirm-next"
          >
            <DangerButtonText $disabled={!confirmed}>다음</DangerButtonText>
          </DangerButton>
          <Button
            title="취소"
            variant="text"
            onPress={onClose}
            testID="delete-wallet-cancel"
          />
        </ButtonStack>
      </>
    );
  }

  return (
    <>
      <InfoBox $tone="error">
        <InfoTitle accessibilityRole="header">⚠️ {copy.heading}</InfoTitle>
        <InfoText>{copy.body}</InfoText>
      </InfoBox>
      <ButtonStack>
        <Button
          title="복구 구문 먼저 확인"
          onPress={() => setStep('backup')}
          fullWidth
          testID="delete-wallet-show-backup"
        />
        <Button
          title="백업했습니다. 계속"
          variant="outline"
          onPress={() => setStep('confirm')}
          fullWidth
          testID="delete-wallet-continue"
        />
        <Button
          title="취소"
          variant="text"
          onPress={onClose}
          testID="delete-wallet-cancel"
        />
      </ButtonStack>
    </>
  );
}

const DangerButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  min-height: 48px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme, disabled }) =>
    disabled ? theme.colors.disabledBackground : theme.colors.error};
`;

const DangerButtonText = styled.Text<{ $disabled?: boolean }>`
  color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.disabledText : theme.colors.onError};
  font-size: 16px;
  font-weight: 600;
`;

const Center = styled.View`
  align-items: center;
  padding: ${({ theme }) => theme.spacing.xl}px;
`;

const CenterText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;
