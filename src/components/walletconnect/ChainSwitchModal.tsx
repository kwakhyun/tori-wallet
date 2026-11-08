/**
 * dApp의 네트워크 전환 요청(wallet_switchEthereumChain / 이미 지원하는 체인의
 * wallet_addEthereumChain) 확인 모달
 */

import React from 'react';
import styled from 'styled-components/native';
import { AppModal } from '@/components/common/AppModal';
import { RequestQueueBar, type QueuePosition } from './RequestQueueBar';

interface ChainSwitchModalProps {
  visible: boolean;
  dAppName: string;
  dAppUrl: string;
  fromNetworkName: string;
  toNetworkName: string;
  /** 이 dApp에 연결된 계정 (세션에 승인된 계정) */
  accountAddress?: string;
  accountName?: string;
  /** 앱의 활성 계정이 이 dApp에 연결된 계정이 아니면 승인을 막는다. */
  accountMismatch?: boolean;
  /** 연결된 계정으로 앱의 활성 계정을 바꾼다 */
  onSwitchAccount?: () => void;
  isAddChain: boolean;
  queuePosition?: QueuePosition;
  expiresAt?: number;
  isProcessing?: boolean;
  onApprove: () => void;
  onReject: () => void;
}

export function ChainSwitchModal({
  visible,
  dAppName,
  dAppUrl,
  fromNetworkName,
  toNetworkName,
  accountAddress,
  accountName,
  accountMismatch = false,
  onSwitchAccount,
  isAddChain,
  queuePosition,
  expiresAt,
  isProcessing = false,
  onApprove,
  onReject,
}: ChainSwitchModalProps): React.JSX.Element {
  const approveDisabled = isProcessing || accountMismatch;
  const accountLabel = accountName || accountAddress || '';
  return (
    // 잠긴 동안에는 숨기기만 한다. 요청은 대기열에 남고 만료 처리는 계속된다.
    <AppModal
      visible={visible}
      transparent
      animationType="fade"
      // 전환 처리 중에는 Android 뒤로 가기로 거부하지 않는다.
      onRequestClose={isProcessing ? () => undefined : onReject}
    >
      <Overlay>
        <Card accessibilityViewIsModal testID="wc-chain-switch-modal">
          <RequestQueueBar
            queuePosition={queuePosition}
            expiresAt={expiresAt}
            active={visible}
          />
          <Body>
            <Title accessibilityRole="header">네트워크 전환 요청</Title>
            <DAppName>{dAppName}</DAppName>
            <DAppUrl selectable>{dAppUrl}</DAppUrl>
            <Row>
              <NetworkBox>
                <Label>현재</Label>
                <NetworkName>{fromNetworkName}</NetworkName>
              </NetworkBox>
              <Arrow importantForAccessibility="no">→</Arrow>
              <NetworkBox>
                <Label>전환할 네트워크</Label>
                <NetworkName testID="wc-chain-switch-target">
                  {toNetworkName}
                </NetworkName>
              </NetworkBox>
            </Row>
            {accountAddress ? (
              <AccountBox>
                <Label>연결된 계정</Label>
                {accountName ? <NetworkName>{accountName}</NetworkName> : null}
                <AccountAddress selectable testID="wc-chain-switch-account">
                  {accountAddress}
                </AccountAddress>
              </AccountBox>
            ) : null}
            {accountMismatch ? (
              <Notice
                accessibilityRole="alert"
                testID="wc-chain-switch-account-mismatch"
              >
                <NoticeText>
                  {`이 dApp은 계정 "${accountLabel}"에 연결되어 있습니다. 해당 계정으로 전환한 뒤 네트워크를 바꿀 수 있습니다.`}
                </NoticeText>
                {onSwitchAccount ? (
                  <NoticeButton
                    onPress={onSwitchAccount}
                    disabled={isProcessing}
                    accessibilityRole="button"
                    accessibilityLabel={`계정 ${accountLabel}(으)로 전환`}
                    testID="wc-chain-switch-switch-account"
                  >
                    <SecondaryText>이 계정으로 전환</SecondaryText>
                  </NoticeButton>
                ) : null}
              </Notice>
            ) : null}
            <Description>
              {isAddChain
                ? '이 dApp이 네트워크 추가를 요청했습니다. 토리월렛이 이미 지원하는 네트워크이므로 전환만 진행합니다.'
                : '승인하면 지갑 전체의 활성 네트워크가 바뀝니다. 서명 요청은 계속 매번 확인합니다.'}
            </Description>
          </Body>
          <ButtonRow>
            <SecondaryButton
              onPress={onReject}
              disabled={isProcessing}
              accessibilityRole="button"
              accessibilityLabel="네트워크 전환 거부"
              testID="wc-chain-switch-reject"
            >
              <SecondaryText>거부</SecondaryText>
            </SecondaryButton>
            <PrimaryButton
              onPress={onApprove}
              disabled={approveDisabled}
              $disabled={approveDisabled}
              accessibilityRole="button"
              accessibilityLabel={`${toNetworkName}(으)로 전환`}
              accessibilityState={{ disabled: approveDisabled }}
              testID="wc-chain-switch-approve"
            >
              <PrimaryText $disabled={approveDisabled}>전환</PrimaryText>
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
`;

const Body = styled.View`
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

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

const Row = styled.View`
  flex-direction: row;
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.lg}px;
`;

const NetworkBox = styled.View`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
`;

const Label = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
`;

const NetworkName = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 15px;
  font-weight: 600;
  margin-top: 2px;
`;

const Arrow = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 20px;
  margin: 0 ${({ theme }) => theme.spacing.sm}px;
`;

const AccountBox = styled.View`
  margin-top: ${({ theme }) => theme.spacing.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
`;

const AccountAddress = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
  font-family: monospace;
  margin-top: 2px;
`;

const Notice = styled.View`
  margin-top: ${({ theme }) => theme.spacing.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.warning};
  background-color: ${({ theme }) => theme.colors.warningSubtle};
  gap: ${({ theme }) => theme.spacing.sm}px;
`;

const NoticeText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 13px;
  font-weight: 600;
  line-height: 19px;
`;

const NoticeButton = styled.TouchableOpacity`
  min-height: 44px;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.surface};
`;

const Description = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  line-height: 19px;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const ButtonRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.md}px;
  padding: ${({ theme }) => theme.spacing.lg}px;
  padding-top: 0;
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

export default ChainSwitchModal;
