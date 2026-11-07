/**
 * WalletConnect 서명 요청 모달
 */

import React, { useEffect, useState } from 'react';
import styled from 'styled-components/native';
import { AppModal } from '@/components/common/AppModal';
import type {
  SigningIntent,
  TokenMetadata,
} from '@/services/signingIntentService';
import type { DAppVerification } from '@/services/wcService';
import {
  RequestQueueBar,
  type QueuePosition,
} from '@/components/walletconnect/RequestQueueBar';

interface SignRequestModalProps {
  visible: boolean;
  request: SignRequest | null;
  dAppName?: string;
  dAppUrl?: string;
  networkName?: string;
  dAppVerification?: DAppVerification;
  onApprove: () => void;
  onReject: () => void;
  isProcessing?: boolean;
  /** 대기 중인 요청이 여러 개일 때 "1/N" 표시 */
  queuePosition?: QueuePosition;
}

export interface SignRequest {
  id: number;
  topic: string;
  method: string;
  params: unknown[];
  chainId: number;
  account: string;
  intent: SigningIntent;
  referenceGasPrice?: string;
  /** 검토 시 확정한 토큰 표시 정보 (서명 직전 지문 재검증에 포함) */
  tokenMetadata?: Record<string, TokenMetadata>;
  expiresAt?: number;
}

export function SignRequestModal({
  visible,
  request,
  dAppName,
  dAppUrl,
  networkName,
  dAppVerification,
  onApprove,
  onReject,
  isProcessing = false,
  queuePosition,
}: SignRequestModalProps): React.JSX.Element | null {
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  useEffect(() => {
    setRiskAcknowledged(false);
  }, [
    request?.id,
    request?.topic,
    request?.intent.fingerprint,
    dAppVerification?.validation,
  ]);

  if (!request) return null;

  const { intent } = request;
  const verificationBlocked =
    dAppVerification !== undefined &&
    (dAppVerification.isScam || dAppVerification.validation === 'INVALID');
  const verificationNeedsAcknowledgement =
    dAppVerification !== undefined && dAppVerification.validation !== 'VALID';
  const approveDisabled =
    isProcessing ||
    intent.blocked ||
    verificationBlocked ||
    ((intent.requiresRiskAcknowledgement || verificationNeedsAcknowledgement) &&
      !riskAcknowledged);
  const icon =
    intent.kind === 'transaction'
      ? '📤'
      : intent.kind === 'typedData'
      ? '📋'
      : '✍️';

  return (
    // 잠긴 동안에는 숨기기만 한다. 요청은 대기열에 남고 만료 처리는 계속된다.
    <AppModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onReject}
    >
      <Overlay>
        <ModalContainer>
          <ModalContent accessibilityViewIsModal>
            <RequestQueueBar
              queuePosition={queuePosition}
              expiresAt={request.expiresAt}
              active={visible}
            />
            {/* 헤더 */}
            <ModalHeader>
              <IconContainer>
                <IconText importantForAccessibility="no">{icon}</IconText>
              </IconContainer>
              <ModalTitle accessibilityRole="header">{intent.title}</ModalTitle>
              <ModalDescription>{intent.summary}</ModalDescription>
            </ModalHeader>

            {/* dApp 정보 */}
            <DAppInfoSection>
              <DAppName>{dAppName || 'Unknown dApp'}</DAppName>
              <DAppUrl>{dAppUrl || ''}</DAppUrl>
              {dAppVerification && (
                <VerificationBadge
                  $valid={dAppVerification.validation === 'VALID'}
                  $blocked={verificationBlocked}
                >
                  <VerificationIcon importantForAccessibility="no">
                    {verificationBlocked
                      ? '⛔'
                      : dAppVerification.validation === 'VALID'
                      ? '✓'
                      : '⚠'}
                  </VerificationIcon>
                  <VerificationText>
                    {verificationBlocked
                      ? '검증 실패 · 차단'
                      : dAppVerification.validation === 'VALID'
                      ? 'WalletConnect 출처 검증됨'
                      : '출처 검증 불가'}
                  </VerificationText>
                </VerificationBadge>
              )}
              {!!dAppVerification?.origin && (
                <DAppUrl selectable>{dAppVerification.origin}</DAppUrl>
              )}
              {networkName && <NetworkBadge>{networkName}</NetworkBadge>}
              <DAppUrl selectable>{request.account}</DAppUrl>
            </DAppInfoSection>

            {/* 상세 정보 */}
            <DetailsScrollView>
              <DetailsSection>
                {intent.details.map(detail => (
                  <DetailColumn key={`${detail.label}:${detail.value}`}>
                    <DetailLabel>{detail.label}</DetailLabel>
                    <DetailValue selectable>{detail.value}</DetailValue>
                  </DetailColumn>
                ))}

                {intent.rawPayload !== undefined && (
                  <MessageBox>
                    <MessageLabel>
                      {intent.kind === 'message'
                        ? '메시지 원문'
                        : intent.kind === 'typedData'
                        ? 'EIP-712 전체 원문'
                        : '전체 호출 데이터'}
                    </MessageLabel>
                    <MessageContent selectable>
                      {intent.rawPayload}
                    </MessageContent>
                  </MessageBox>
                )}

                {intent.warnings.map(warning => (
                  <WarningBox
                    key={warning.message}
                    $critical={warning.level === 'critical'}
                  >
                    <WarningIcon importantForAccessibility="no">
                      {warning.level === 'critical' ? '🚨' : '⚠️'}
                    </WarningIcon>
                    <WarningText $critical={warning.level === 'critical'}>
                      {warning.message}
                    </WarningText>
                  </WarningBox>
                ))}

                {verificationNeedsAcknowledgement && !verificationBlocked && (
                  <WarningBox>
                    <WarningIcon importantForAccessibility="no">⚠️</WarningIcon>
                    <WarningText>
                      WalletConnect가 dApp 출처를 검증하지 못했습니다. 표시된
                      도메인을 직접 확인하세요.
                    </WarningText>
                  </WarningBox>
                )}

                {(intent.blocked || verificationBlocked) && (
                  <BlockedBox accessibilityRole="alert">
                    <BlockedText>
                      이 요청은 보안 정책에 의해 차단되어 승인할 수 없습니다.
                    </BlockedText>
                  </BlockedBox>
                )}

                {(intent.requiresRiskAcknowledgement ||
                  verificationNeedsAcknowledgement) &&
                  !intent.blocked &&
                  !verificationBlocked && (
                    <RiskAcknowledgeButton
                      onPress={() => setRiskAcknowledged(value => !value)}
                      accessibilityRole="checkbox"
                      accessibilityLabel="위험과 전체 원문을 확인했습니다."
                      accessibilityState={{ checked: riskAcknowledged }}
                      testID="sign-request-acknowledge"
                    >
                      <RiskAcknowledgeMark>
                        {riskAcknowledged ? '☑' : '☐'}
                      </RiskAcknowledgeMark>
                      <RiskAcknowledgeText>
                        위험과 전체 원문을 확인했습니다.
                      </RiskAcknowledgeText>
                    </RiskAcknowledgeButton>
                  )}
              </DetailsSection>
            </DetailsScrollView>

            {/* 버튼 */}
            <ButtonSection>
              <RejectButton
                onPress={onReject}
                disabled={isProcessing}
                accessibilityRole="button"
                accessibilityLabel="요청 거부"
                accessibilityState={{ disabled: isProcessing }}
                testID="sign-request-reject"
              >
                <RejectButtonText>거부</RejectButtonText>
              </RejectButton>
              <ApproveButton
                onPress={onApprove}
                disabled={approveDisabled}
                $disabled={approveDisabled}
                accessibilityRole="button"
                accessibilityLabel={
                  intent.blocked || verificationBlocked
                    ? '차단된 요청'
                    : '요청 승인'
                }
                accessibilityState={{ disabled: approveDisabled }}
                testID="sign-request-approve"
              >
                <ApproveButtonText $disabled={approveDisabled}>
                  {intent.blocked || verificationBlocked ? '차단됨' : '승인'}
                </ApproveButtonText>
              </ApproveButton>
            </ButtonSection>
          </ModalContent>
        </ModalContainer>
      </Overlay>
    </AppModal>
  );
}

// Styled Components
const Overlay = styled.View`
  flex: 1;
  background-color: rgba(0, 0, 0, 0.7);
  justify-content: center;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const ModalContainer = styled.View`
  width: 100%;
  max-width: 400px;
`;

const ModalContent = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.xl}px;
  overflow: hidden;
`;

const ModalHeader = styled.View`
  align-items: center;
  padding: ${({ theme }) => theme.spacing.xl}px;
  padding-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const IconContainer = styled.View`
  width: 64px;
  height: 64px;
  border-radius: 32px;
  background-color: ${({ theme }) => theme.colors.primarySubtle};
  align-items: center;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const IconText = styled.Text`
  font-size: 32px;
`;

const ModalTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 20px;
  font-weight: bold;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const ModalDescription = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  text-align: center;
`;

const DAppInfoSection = styled.View`
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-top-width: 1px;
  border-bottom-width: 1px;
  border-color: ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
`;

const DAppName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
`;

const DAppUrl = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
  margin-top: 2px;
`;

const NetworkBadge = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 12px;
  font-weight: 600;
  background-color: ${({ theme }) => theme.colors.primarySubtle};
  padding: 4px 12px;
  border-radius: 12px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
  overflow: hidden;
`;

const VerificationBadge = styled.View<{
  $valid: boolean;
  $blocked: boolean;
}>`
  flex-direction: row;
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
  padding: 2px 10px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
  border-width: 1px;
  border-color: ${({ theme, $valid, $blocked }) =>
    $blocked
      ? theme.colors.error
      : $valid
      ? theme.colors.success
      : theme.colors.warning};
  background-color: ${({ theme, $valid, $blocked }) =>
    $blocked
      ? theme.colors.errorSubtle
      : $valid
      ? theme.colors.successSubtle
      : theme.colors.warningSubtle};
`;

const VerificationIcon = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 12px;
  margin-right: 4px;
`;

const VerificationText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 12px;
  font-weight: 700;
`;

const DetailsSection = styled.View`
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const DetailColumn = styled.View`
  padding: ${({ theme }) => theme.spacing.sm}px 0;
  border-bottom-width: 1px;
  border-color: ${({ theme }) => theme.colors.border};
  gap: 4px;
`;

const DetailLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const DetailValue = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  font-family: monospace;
  line-height: 19px;
`;

const WarningBox = styled.View<{ $critical?: boolean }>`
  flex-direction: row;
  align-items: flex-start;
  background-color: ${({ theme, $critical }) =>
    $critical ? theme.colors.errorSubtle : theme.colors.warningSubtle};
  border: 1px solid
    ${({ theme, $critical }) =>
      $critical ? theme.colors.error : theme.colors.warning};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const WarningIcon = styled.Text`
  font-size: 16px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const WarningText = styled.Text<{ $critical?: boolean }>`
  flex: 1;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 13px;
  font-weight: ${({ $critical }) => ($critical ? 600 : 400)};
  line-height: 18px;
`;

const MessageBox = styled.View`
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const MessageLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const MessageContent = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  font-family: monospace;
  line-height: 20px;
`;

const DetailsScrollView = styled.ScrollView`
  max-height: 360px;
`;

const BlockedBox = styled.View`
  background-color: ${({ theme }) => theme.colors.errorSubtle};
  border-left-width: 4px;
  border-left-color: ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const BlockedText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 13px;
  font-weight: 700;
  line-height: 19px;
`;

const RiskAcknowledgeButton = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  min-height: 44px;
  padding: ${({ theme }) => theme.spacing.md}px 0;
`;

const RiskAcknowledgeMark = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 22px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const RiskAcknowledgeText = styled.Text`
  flex: 1;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
`;

const ButtonSection = styled.View`
  flex-direction: row;
  padding: ${({ theme }) => theme.spacing.lg}px;
  gap: ${({ theme }) => theme.spacing.md}px;
`;

const RejectButton = styled.TouchableOpacity`
  flex: 1;
  min-height: 48px;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  align-items: center;
`;

const RejectButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
`;

const ApproveButton = styled.TouchableOpacity<{ $disabled?: boolean }>`
  flex: 1;
  min-height: 48px;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.disabledBackground : theme.colors.primary};
  align-items: center;
`;

const ApproveButtonText = styled.Text<{ $disabled?: boolean }>`
  color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.disabledText : theme.colors.onPrimary};
  font-size: 16px;
  font-weight: 600;
`;

export default SignRequestModal;
