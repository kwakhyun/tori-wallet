/**
 * 스왑 확인 모달
 */

import React from 'react';
import { Modal, ActivityIndicator } from 'react-native';
import styled from 'styled-components/native';
import { SwapToken, SwapQuote } from '@/services/enhancedSwapService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  sellToken: SwapToken | null;
  buyToken: SwapToken | null;
  sellAmount: string;
  buyAmount: string;
  quote: SwapQuote | null;
  slippage: number;
  priceImpact: {
    percent: string;
    level: 'low' | 'medium' | 'high' | 'critical';
  };
}

export function SwapReviewModal({
  visible,
  onClose,
  onConfirm,
  isLoading,
  sellToken,
  buyToken,
  sellAmount,
  buyAmount,
  quote,
  slippage,
  priceImpact,
}: Props): React.JSX.Element {
  if (!sellToken || !buyToken || !quote) {
    return <></>;
  }

  const rate = parseFloat(buyAmount) / parseFloat(sellAmount);
  const isHighImpact =
    priceImpact.level === 'high' || priceImpact.level === 'critical';

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
          <HeaderTitle>스왑 확인</HeaderTitle>
          <HeaderSpacer />
        </Header>

        <Content>
          {/* 스왑 토큰 표시 */}
          <TokensContainer>
            <TokenCard>
              <TokenLabel>보내는 토큰</TokenLabel>
              <TokenRow>
                {sellToken.logoUrl && (
                  <TokenLogo source={{ uri: sellToken.logoUrl }} />
                )}
                <TokenAmount>{parseFloat(sellAmount).toFixed(6)}</TokenAmount>
                <TokenSymbol>{sellToken.symbol}</TokenSymbol>
              </TokenRow>
            </TokenCard>

            <ArrowContainer>
              <ArrowIcon>↓</ArrowIcon>
            </ArrowContainer>

            <TokenCard>
              <TokenLabel>받는 토큰</TokenLabel>
              <TokenRow>
                {buyToken.logoUrl && (
                  <TokenLogo source={{ uri: buyToken.logoUrl }} />
                )}
                <TokenAmount $highlight>
                  {parseFloat(buyAmount).toFixed(6)}
                </TokenAmount>
                <TokenSymbol>{buyToken.symbol}</TokenSymbol>
              </TokenRow>
            </TokenCard>
          </TokensContainer>

          {/* 상세 정보 */}
          <DetailsCard>
            <DetailRow>
              <DetailLabel>환율</DetailLabel>
              <DetailValue>
                1 {sellToken.symbol} = {rate.toFixed(6)} {buyToken.symbol}
              </DetailValue>
            </DetailRow>

            <Divider />

            <DetailRow>
              <DetailLabel>최소 수령량</DetailLabel>
              <DetailValue>
                {quote.minimumReceived
                  ? `${parseFloat(quote.minimumReceived).toFixed(6)} ${
                      buyToken.symbol
                    }`
                  : '-'}
              </DetailValue>
            </DetailRow>

            <DetailRow>
              <DetailLabel>슬리피지 허용치</DetailLabel>
              <DetailValue>{slippage}%</DetailValue>
            </DetailRow>

            <Divider />

            <DetailRow>
              <DetailLabel>가격 영향</DetailLabel>
              <PriceImpactValue $level={priceImpact.level}>
                {priceImpact.percent}%
              </PriceImpactValue>
            </DetailRow>

            <DetailRow>
              <DetailLabel>예상 가스비</DetailLabel>
              <DetailValue>
                {quote.estimatedGasUsd
                  ? `~$${quote.estimatedGasUsd}`
                  : '계산 중...'}
              </DetailValue>
            </DetailRow>

            {/* 경로 표시 */}
            {quote.route && quote.route.length > 0 && (
              <>
                <Divider />
                <DetailRow>
                  <DetailLabel>스왑 경로</DetailLabel>
                </DetailRow>
                <RouteContainer>
                  {quote.route.map((r, index) => (
                    <RouteItem key={index}>
                      <RouteName>{r.name}</RouteName>
                      <RouteProportion>
                        {r.proportion.toFixed(0)}%
                      </RouteProportion>
                    </RouteItem>
                  ))}
                </RouteContainer>
              </>
            )}
          </DetailsCard>

          {/* 가격 영향 경고 */}
          {isHighImpact && (
            <WarningBox $critical={priceImpact.level === 'critical'}>
              <WarningIcon>
                {priceImpact.level === 'critical' ? '🚨' : '⚠️'}
              </WarningIcon>
              <WarningText>
                {priceImpact.level === 'critical'
                  ? '가격 영향이 매우 높습니다! 이 거래로 인해 큰 손실이 발생할 수 있습니다.'
                  : '가격 영향이 높습니다. 거래 전 다시 확인해주세요.'}
              </WarningText>
            </WarningBox>
          )}
        </Content>

        {/* 확인 버튼 */}
        <BottomContainer>
          <ConfirmButton
            onPress={onConfirm}
            disabled={isLoading}
            $warning={isHighImpact}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ConfirmButtonText>
                {isHighImpact ? '그래도 스왑하기' : '스왑 확인'}
              </ConfirmButtonText>
            )}
          </ConfirmButton>

          <CancelButton onPress={onClose} disabled={isLoading}>
            <CancelButtonText>취소</CancelButtonText>
          </CancelButton>
        </BottomContainer>
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

const HeaderSpacer = styled.View`
  width: 40px;
`;

const Content = styled.ScrollView`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const TokensContainer = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const TokenCard = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const TokenLabel = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const TokenRow = styled.View`
  flex-direction: row;
  align-items: center;
`;

const TokenLogo = styled.Image`
  width: 32px;
  height: 32px;
  border-radius: 16px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const TokenAmount = styled.Text<{ $highlight?: boolean }>`
  font-size: 24px;
  font-weight: 700;
  color: ${({ theme, $highlight }) =>
    $highlight ? theme.colors.success : theme.colors.textPrimary};
  flex: 1;
`;

const TokenSymbol = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const ArrowContainer = styled.View`
  align-items: center;
  padding: ${({ theme }) => theme.spacing.xs}px 0;
`;

const ArrowIcon = styled.Text`
  font-size: 24px;
  color: ${({ theme }) => theme.colors.primary};
`;

const DetailsCard = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const DetailRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.xs}px 0;
`;

const DetailLabel = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const DetailValue = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 500;
`;

const PriceImpactValue = styled.Text<{
  $level: 'low' | 'medium' | 'high' | 'critical';
}>`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme, $level }) => {
    switch ($level) {
      case 'critical':
        return theme.colors.error;
      case 'high':
        return '#FF6B6B';
      case 'medium':
        return theme.colors.warning;
      default:
        return theme.colors.success;
    }
  }};
`;

const Divider = styled.View`
  height: 1px;
  background-color: ${({ theme }) => theme.colors.border};
  margin: ${({ theme }) => theme.spacing.sm}px 0;
`;

const RouteContainer = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const RouteItem = styled.View`
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
`;

const RouteName = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-right: ${({ theme }) => theme.spacing.xs}px;
`;

const RouteProportion = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.primary};
  font-weight: 600;
`;

const WarningBox = styled.View<{ $critical?: boolean }>`
  flex-direction: row;
  align-items: flex-start;
  background-color: ${({ $critical }) =>
    $critical ? 'rgba(255, 77, 79, 0.15)' : 'rgba(255, 193, 7, 0.15)'};
  border: 1px solid ${({ $critical }) => ($critical ? '#FF4D4F' : '#FFC107')};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const WarningIcon = styled.Text`
  font-size: 20px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const WarningText = styled.Text`
  flex: 1;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 20px;
`;

const BottomContainer = styled.View`
  padding: ${({ theme }) => theme.spacing.md}px;
  border-top-width: 1px;
  border-top-color: ${({ theme }) => theme.colors.border};
`;

const ConfirmButton = styled.TouchableOpacity<{
  disabled?: boolean;
  $warning?: boolean;
}>`
  background-color: ${({ theme, disabled, $warning }) =>
    disabled
      ? theme.colors.border
      : $warning
      ? '#FF6B6B'
      : theme.colors.primary};
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const ConfirmButtonText = styled.Text`
  color: #fff;
  font-size: 16px;
  font-weight: 600;
`;

const CancelButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
`;

const CancelButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 16px;
`;

export default SwapReviewModal;
