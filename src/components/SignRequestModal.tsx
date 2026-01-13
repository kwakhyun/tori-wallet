/**
 * Tori Wallet - Sign Request Modal
 * WalletConnect 서명 요청 UI
 */

import React from 'react';
import styled from 'styled-components/native';
import { Modal, ScrollView } from 'react-native';
import { formatEther } from 'viem';

interface SignRequestModalProps {
  visible: boolean;
  request: SignRequest | null;
  dAppName?: string;
  dAppUrl?: string;
  networkName?: string;
  onApprove: () => void;
  onReject: () => void;
}

export interface SignRequest {
  id: number;
  topic: string;
  method: string;
  params: unknown[];
}

interface TransactionParams {
  from?: string;
  to?: string;
  value?: string;
  data?: string;
  gas?: string;
  gasPrice?: string;
  nonce?: string;
}

export function SignRequestModal({
  visible,
  request,
  dAppName,
  dAppUrl,
  networkName,
  onApprove,
  onReject,
}: SignRequestModalProps): React.JSX.Element | null {
  if (!request) return null;

  const getRequestInfo = () => {
    const { method, params } = request;

    switch (method) {
      case 'eth_sendTransaction':
      case 'eth_signTransaction': {
        const tx = (params[0] || {}) as TransactionParams;
        return {
          type: 'transaction',
          title: '트랜잭션 승인',
          icon: '📤',
          description: '이 트랜잭션을 승인하시겠습니까?',
          details: parseTransaction(tx),
        };
      }
      case 'personal_sign':
      case 'eth_sign': {
        const message = params[0] as string;
        return {
          type: 'message',
          title: '메시지 서명',
          icon: '✍️',
          description: '이 메시지에 서명하시겠습니까?',
          details: { message: hexToString(message) },
        };
      }
      case 'eth_signTypedData':
      case 'eth_signTypedData_v3':
      case 'eth_signTypedData_v4': {
        const typedData = params[1] as string;
        let parsed;
        try {
          parsed = JSON.parse(typedData);
        } catch {
          parsed = typedData;
        }
        return {
          type: 'typedData',
          title: '데이터 서명',
          icon: '📋',
          description: '이 데이터에 서명하시겠습니까?',
          details: { typedData: parsed },
        };
      }
      default:
        return {
          type: 'unknown',
          title: '서명 요청',
          icon: '🔐',
          description: `${method} 요청을 승인하시겠습니까?`,
          details: { params },
        };
    }
  };

  const parseTransaction = (tx: TransactionParams) => {
    const value = tx.value ? formatWeiToEth(tx.value) : '0';
    const gasLimit = tx.gas ? parseInt(tx.gas, 16).toString() : '-';
    const gasPrice = tx.gasPrice
      ? (parseInt(tx.gasPrice, 16) / 1e9).toFixed(2) + ' Gwei'
      : '-';

    return {
      to: tx.to || '컨트랙트 생성',
      value,
      gasLimit,
      gasPrice,
      data: tx.data && tx.data !== '0x' ? '있음' : '없음',
      isContractInteraction: tx.data && tx.data !== '0x' && tx.data.length > 2,
    };
  };

  const formatWeiToEth = (weiHex: string): string => {
    try {
      const wei = BigInt(weiHex);
      const eth = Number(formatEther(wei));
      if (eth === 0) return '0 ETH';
      if (eth < 0.0001) return '< 0.0001 ETH';
      return `${eth.toFixed(4)} ETH`;
    } catch {
      return '0 ETH';
    }
  };

  const hexToString = (hex: string): string => {
    try {
      if (!hex.startsWith('0x')) return hex;
      const bytes = [];
      for (let i = 2; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16));
      }
      return new TextDecoder().decode(new Uint8Array(bytes));
    } catch {
      return hex;
    }
  };

  const formatAddress = (address?: string): string => {
    if (!address) return '-';
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  const info = getRequestInfo();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onReject}
    >
      <Overlay>
        <ModalContainer>
          <ModalContent>
            {/* 헤더 */}
            <ModalHeader>
              <IconContainer>
                <IconText>{info.icon}</IconText>
              </IconContainer>
              <ModalTitle>{info.title}</ModalTitle>
              <ModalDescription>{info.description}</ModalDescription>
            </ModalHeader>

            {/* dApp 정보 */}
            <DAppInfoSection>
              <DAppName>{dAppName || 'Unknown dApp'}</DAppName>
              <DAppUrl>{dAppUrl || ''}</DAppUrl>
              {networkName && <NetworkBadge>{networkName}</NetworkBadge>}
            </DAppInfoSection>

            {/* 상세 정보 */}
            <ScrollView style={{ maxHeight: 250 }}>
              {info.type === 'transaction' && info.details && (
                <DetailsSection>
                  <DetailRow>
                    <DetailLabel>받는 주소</DetailLabel>
                    <DetailValue>
                      {formatAddress((info.details as { to?: string }).to)}
                    </DetailValue>
                  </DetailRow>

                  <DetailRow $highlight>
                    <DetailLabel>금액</DetailLabel>
                    <DetailValueLarge>
                      {(info.details as { value: string }).value}
                    </DetailValueLarge>
                  </DetailRow>

                  <DetailRow>
                    <DetailLabel>가스 한도</DetailLabel>
                    <DetailValue>
                      {(info.details as { gasLimit: string }).gasLimit}
                    </DetailValue>
                  </DetailRow>

                  <DetailRow>
                    <DetailLabel>가스 가격</DetailLabel>
                    <DetailValue>
                      {(info.details as { gasPrice: string }).gasPrice}
                    </DetailValue>
                  </DetailRow>

                  {(info.details as { isContractInteraction?: boolean })
                    .isContractInteraction && (
                    <WarningBox>
                      <WarningIcon>⚠️</WarningIcon>
                      <WarningText>
                        스마트 컨트랙트 호출입니다.{'\n'}
                        신뢰할 수 있는 dApp인지 확인하세요.
                      </WarningText>
                    </WarningBox>
                  )}
                </DetailsSection>
              )}

              {info.type === 'message' && info.details && (
                <DetailsSection>
                  <MessageBox>
                    <MessageLabel>메시지 내용</MessageLabel>
                    <MessageContent>
                      {(info.details as { message: string }).message}
                    </MessageContent>
                  </MessageBox>
                </DetailsSection>
              )}

              {info.type === 'typedData' && info.details && (
                <DetailsSection>
                  <MessageBox>
                    <MessageLabel>서명 데이터</MessageLabel>
                    <MessageContent numberOfLines={10}>
                      {JSON.stringify(
                        (info.details as { typedData: unknown }).typedData,
                        null,
                        2,
                      )}
                    </MessageContent>
                  </MessageBox>
                </DetailsSection>
              )}
            </ScrollView>

            {/* 버튼 */}
            <ButtonSection>
              <RejectButton onPress={onReject}>
                <RejectButtonText>거부</RejectButtonText>
              </RejectButton>
              <ApproveButton onPress={onApprove}>
                <ApproveButtonText>승인</ApproveButtonText>
              </ApproveButton>
            </ButtonSection>
          </ModalContent>
        </ModalContainer>
      </Overlay>
    </Modal>
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
  background-color: ${({ theme }) => theme.colors.primaryLight};
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
  color: ${({ theme }) => theme.colors.primary};
  font-size: 12px;
  font-weight: 600;
  background-color: ${({ theme }) => theme.colors.primaryLight};
  padding: 4px 12px;
  border-radius: 12px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
  overflow: hidden;
`;

const DetailsSection = styled.View`
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const DetailRow = styled.View<{ $highlight?: boolean }>`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.sm}px 0;
  border-bottom-width: 1px;
  border-color: ${({ theme }) => theme.colors.border};
  ${({ $highlight, theme }) =>
    $highlight &&
    `
    background-color: ${theme.colors.backgroundSecondary};
    margin: 0 -${theme.spacing.md}px;
    padding: ${theme.spacing.md}px;
    border-radius: ${theme.borderRadius.md}px;
    border-bottom-width: 0;
  `}
`;

const DetailLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

const DetailValue = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  font-family: monospace;
`;

const DetailValueLarge = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 18px;
  font-weight: bold;
`;

const WarningBox = styled.View`
  flex-direction: row;
  align-items: flex-start;
  background-color: rgba(245, 158, 11, 0.1);
  border: 1px solid #f59e0b;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const WarningIcon = styled.Text`
  font-size: 16px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const WarningText = styled.Text`
  flex: 1;
  color: #f59e0b;
  font-size: 13px;
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

const ButtonSection = styled.View`
  flex-direction: row;
  padding: ${({ theme }) => theme.spacing.lg}px;
  gap: ${({ theme }) => theme.spacing.md}px;
`;

const RejectButton = styled.TouchableOpacity`
  flex: 1;
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

const ApproveButton = styled.TouchableOpacity`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme }) => theme.colors.primary};
  align-items: center;
`;

const ApproveButtonText = styled.Text`
  color: white;
  font-size: 16px;
  font-weight: 600;
`;

export default SignRequestModal;
