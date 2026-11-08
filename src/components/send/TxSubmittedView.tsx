/**
 * 트랜잭션 제출 완료 화면 (전송/스왑 공용)
 *
 * 해시 전체를 보여 주고 복사(토스트), 블록 익스플로러, 거래 상세로 이어지게 한다.
 */

import React from 'react';
import { Linking } from 'react-native';
import { copyToClipboard } from '@/utils/clipboard';
import styled from 'styled-components/native';
import { showToast } from '@/store/toastStore';

interface Props {
  title: string;
  description?: string;
  txHash: string;
  /** 네트워크의 blockExplorerUrl (없으면 익스플로러 버튼 숨김) */
  explorerUrl?: string;
  onViewDetail?: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  testID?: string;
}

export function explorerTxUrl(
  explorerUrl: string | undefined,
  txHash: string,
): string | null {
  if (!explorerUrl) return null;
  return `${explorerUrl.replace(/\/+$/, '')}/tx/${txHash}`;
}

export function TxSubmittedView({
  title,
  description,
  txHash,
  explorerUrl,
  onViewDetail,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  testID = 'tx-submitted',
}: Props): React.JSX.Element {
  const txUrl = explorerTxUrl(explorerUrl, txHash);

  const handleCopy = () => {
    copyToClipboard(txHash);
    showToast('트랜잭션 해시를 복사했습니다.', 'success');
  };

  const handleOpenExplorer = async () => {
    if (!txUrl) return;
    try {
      await Linking.openURL(txUrl);
    } catch {
      showToast('블록 익스플로러를 열 수 없습니다.', 'error');
    }
  };

  return (
    <Container testID={testID}>
      <Icon importantForAccessibility="no">✅</Icon>
      <Title accessibilityRole="header">{title}</Title>
      {description ? <Description>{description}</Description> : null}

      <HashCard>
        <HashLabel>트랜잭션 해시</HashLabel>
        <HashValue selectable testID={`${testID}-hash`}>
          {txHash}
        </HashValue>
        <HashActions>
          <LinkButton
            onPress={handleCopy}
            accessibilityRole="button"
            accessibilityLabel="트랜잭션 해시 복사"
            testID={`${testID}-copy`}
          >
            <LinkButtonText>해시 복사</LinkButtonText>
          </LinkButton>
          {txUrl ? (
            <LinkButton
              onPress={handleOpenExplorer}
              accessibilityRole="link"
              accessibilityLabel="블록 익스플로러에서 보기"
              testID={`${testID}-explorer`}
            >
              <LinkButtonText>익스플로러에서 보기</LinkButtonText>
            </LinkButton>
          ) : null}
        </HashActions>
      </HashCard>

      {onViewDetail ? (
        <SecondaryButton
          onPress={onViewDetail}
          accessibilityRole="button"
          testID={`${testID}-detail`}
        >
          <SecondaryButtonText>거래 상세</SecondaryButtonText>
        </SecondaryButton>
      ) : null}
      {secondaryLabel && onSecondary ? (
        <SecondaryButton
          onPress={onSecondary}
          accessibilityRole="button"
          testID={`${testID}-secondary`}
        >
          <SecondaryButtonText>{secondaryLabel}</SecondaryButtonText>
        </SecondaryButton>
      ) : null}
      <PrimaryButton
        onPress={onPrimary}
        accessibilityRole="button"
        testID={`${testID}-primary`}
      >
        <PrimaryButtonText>{primaryLabel}</PrimaryButtonText>
      </PrimaryButton>
    </Container>
  );
}

const Container = styled.View`
  flex: 1;
  justify-content: center;
  align-items: stretch;
  padding: ${({ theme }) => theme.spacing.lg}px 0;
`;

const Icon = styled.Text`
  font-size: 56px;
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h2.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h2.fontWeight};
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const Description = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const HashCard = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const HashLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const HashValue = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 13px;
  line-height: 18px;
  font-family: monospace;
`;

const HashActions = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm}px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

const LinkButton = styled.TouchableOpacity`
  min-height: 44px;
  justify-content: center;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  border: 1px solid ${({ theme }) => theme.colors.primary};
  background-color: ${({ theme }) => theme.colors.primarySubtle};
`;

const LinkButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  font-weight: 600;
`;

const SecondaryButton = styled.TouchableOpacity`
  min-height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.surface};
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const SecondaryButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

const PrimaryButton = styled.TouchableOpacity`
  min-height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme }) => theme.colors.primary};
`;

const PrimaryButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.onPrimary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

export default TxSubmittedView;
