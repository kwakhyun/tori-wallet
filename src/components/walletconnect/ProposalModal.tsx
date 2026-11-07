/**
 * dApp 연결(세션 제안) 승인 모달
 *
 * 연결될 계정과 네트워크, dApp이 보낼 수 있는 요청 종류를 실제 제안 내용으로
 * 보여준다. 출처를 검증하지 못한 dApp은 사용자가 위험을 확인해야 연결할 수 있다.
 */

import React, { useEffect, useState } from 'react';
import styled from 'styled-components/native';
import { AppModal } from '@/components/common/AppModal';
import type { DAppVerification } from '@/services/wcService';
import { RequestQueueBar } from './RequestQueueBar';

export interface ProposalChain {
  chainId: number;
  name: string;
  required: boolean;
}

interface ProposalModalProps {
  visible: boolean;
  proposalId: number;
  dAppName: string;
  dAppUrl: string;
  verification: DAppVerification;
  accountAddress: string;
  accountName?: string;
  chains: ProposalChain[];
  methodLabels: string[];
  /** 이 제안 뒤에 대기 중인 제안 수 */
  waitingCount?: number;
  expiresAt?: number;
  isProcessing?: boolean;
  onApprove: (acknowledged: boolean) => void;
  onReject: () => void;
}

export function ProposalModal({
  visible,
  proposalId,
  dAppName,
  dAppUrl,
  verification,
  accountAddress,
  accountName,
  chains,
  methodLabels,
  waitingCount = 0,
  expiresAt,
  isProcessing = false,
  onApprove,
  onReject,
}: ProposalModalProps): React.JSX.Element {
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => setAcknowledged(false), [proposalId]);

  const verified = verification.validation === 'VALID';
  const needsAcknowledgement = !verified;
  const approveDisabled =
    isProcessing || (needsAcknowledgement && !acknowledged);

  return (
    // 잠긴 동안에는 숨기기만 한다. 제안은 대기열에 남고 만료 처리는 계속된다.
    <AppModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onReject}
    >
      <Overlay>
        <Card accessibilityViewIsModal testID="wc-proposal-modal">
          <RequestQueueBar
            queuePosition={
              waitingCount > 0
                ? { index: 1, total: waitingCount + 1 }
                : undefined
            }
            expiresAt={expiresAt}
            active={visible}
          />
          <Body>
            <Title accessibilityRole="header">연결 요청</Title>
            <DAppName>{dAppName}</DAppName>
            <DAppUrl selectable>{dAppUrl}</DAppUrl>
            <Badge $verified={verified}>
              <BadgeText>
                {verified
                  ? '✓ WalletConnect 출처 검증됨'
                  : '⚠ 출처를 검증할 수 없음'}
              </BadgeText>
            </Badge>
            {!!verification.origin && verification.origin !== dAppUrl && (
              <DAppUrl selectable>검증된 출처: {verification.origin}</DAppUrl>
            )}

            <Section>
              <SectionLabel>연결할 계정</SectionLabel>
              {accountName ? <SectionValue>{accountName}</SectionValue> : null}
              <Mono selectable testID="wc-proposal-account">
                {accountAddress}
              </Mono>
            </Section>

            <Section>
              <SectionLabel>연결할 네트워크</SectionLabel>
              {chains.map(chain => (
                <SectionValue key={chain.chainId}>
                  • {chain.name}
                  {chain.required ? ' (필수)' : ''}
                </SectionValue>
              ))}
            </Section>

            {methodLabels.length > 0 && (
              <Section>
                <SectionLabel>dApp이 보낼 수 있는 요청</SectionLabel>
                {methodLabels.map(label => (
                  <SectionValue key={label}>• {label}</SectionValue>
                ))}
                <Hint>
                  연결 후에도 모든 서명과 전송은 매번 직접 확인하고 승인해야
                  합니다.
                </Hint>
              </Section>
            )}

            {needsAcknowledgement && (
              <Acknowledge
                onPress={() => setAcknowledged(value => !value)}
                accessibilityRole="checkbox"
                accessibilityLabel="도메인을 직접 확인했으며 검증되지 않은 연결 위험을 이해합니다."
                accessibilityState={{ checked: acknowledged }}
                testID="wc-proposal-acknowledge"
              >
                <AcknowledgeMark>{acknowledged ? '☑' : '☐'}</AcknowledgeMark>
                <AcknowledgeText>
                  도메인을 직접 확인했으며 검증되지 않은 연결 위험을 이해합니다.
                </AcknowledgeText>
              </Acknowledge>
            )}
          </Body>

          <ButtonRow>
            <SecondaryButton
              onPress={onReject}
              disabled={isProcessing}
              accessibilityRole="button"
              accessibilityLabel="연결 거부"
              testID="wc-proposal-reject"
            >
              <SecondaryText>거부</SecondaryText>
            </SecondaryButton>
            <PrimaryButton
              onPress={() => onApprove(acknowledged)}
              disabled={approveDisabled}
              $disabled={approveDisabled}
              accessibilityRole="button"
              accessibilityLabel="연결 승인"
              accessibilityState={{ disabled: approveDisabled }}
              testID="wc-proposal-approve"
            >
              <PrimaryText $disabled={approveDisabled}>연결</PrimaryText>
            </PrimaryButton>
          </ButtonRow>
        </Card>
      </Overlay>
    </AppModal>
  );
}

const Overlay = styled.View`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.overlay};
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const Card = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.xl}px;
  overflow: hidden;
  max-height: 90%;
`;

const Body = styled.ScrollView.attrs(({ theme }) => ({
  contentContainerStyle: { padding: theme.spacing.lg },
}))``;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 20px;
  font-weight: 700;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const DAppName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
`;

const DAppUrl = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  margin-top: 2px;
`;

const Badge = styled.View<{ $verified: boolean }>`
  align-self: flex-start;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
  padding: 2px 10px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
  border-width: 1px;
  border-color: ${({ theme, $verified }) =>
    $verified ? theme.colors.success : theme.colors.warning};
  background-color: ${({ theme, $verified }) =>
    $verified ? theme.colors.successSubtle : theme.colors.warningSubtle};
`;

const BadgeText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 12px;
  font-weight: 700;
`;

const Section = styled.View`
  margin-top: ${({ theme }) => theme.spacing.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
`;

const SectionLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const SectionValue = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  line-height: 21px;
`;

const Mono = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 13px;
  font-family: monospace;
`;

const Hint = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const Acknowledge = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  min-height: 44px;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const AcknowledgeMark = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 22px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const AcknowledgeText = styled.Text`
  flex: 1;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 13px;
  line-height: 18px;
`;

const ButtonRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.md}px;
  padding: ${({ theme }) => theme.spacing.lg}px;
  padding-top: ${({ theme }) => theme.spacing.md}px;
`;

const PrimaryButton = styled.TouchableOpacity<{ $disabled?: boolean }>`
  flex: 1;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.disabledBackground : theme.colors.primary};
`;

const PrimaryText = styled.Text<{ $disabled?: boolean }>`
  color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.disabledText : theme.colors.onPrimary};
  font-size: 16px;
  font-weight: 600;
`;

const SecondaryButton = styled.TouchableOpacity`
  flex: 1;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.border};
`;

const SecondaryText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
`;

export default ProposalModal;
