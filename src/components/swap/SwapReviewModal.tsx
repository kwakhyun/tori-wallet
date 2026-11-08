/**
 * 스왑 확인 모달
 *
 * PIN 전에 사용자가 확인해야 할 모든 것을 보여 준다.
 *  - 승인 트랜잭션이 먼저 필요한지 (토큰, 정확한 수량, 승인 대상 AllowanceHolder)
 *  - 견적 유효 시간(카운트다운)과 새로고침
 *  - 가격 영향 (계산 불가 시 경고, 10% 이상은 위험 확인 후에만 진행)
 *  - 예상 가스비 (네트워크 네이티브 단위 + 법정화폐)
 */

import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator } from 'react-native';
import { AppModal } from '@/components/common/AppModal';
import styled, { useTheme } from 'styled-components/native';
import { formatEther } from 'viem';
import { SwapToken, SwapQuote } from '@/services/enhancedSwapService';
import { quoteRemainingMs, type PriceImpactInfo } from '@/services/swapService';
import { useFiat } from '@/hooks/useFiat';
import { formatDisplayAmount } from '@/utils/format';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';

export interface ApprovalRequirement {
  tokenSymbol: string;
  tokenAddress: string;
  /** 사람이 읽는 정확한 승인 수량 */
  amount: string;
  /** 승인 대상 (0x AllowanceHolder) */
  spender: string;
  /**
   * 남은 승인량을 먼저 0으로 초기화하는 트랜잭션이 추가로 필요한지
   * (남은 승인량이 있으면 새 수량을 승인할 수 없는 메인넷 USDT 등)
   */
  resetRequired?: boolean;
}

type TimerAnnouncement = 60 | 30 | 10 | 'expired' | null;

/** 화면 낭독기에 알릴 남은 시간 구간 (매초가 아니라 이 구간이 바뀔 때만 알린다) */
function timerAnnouncement(remainingSeconds: number): TimerAnnouncement {
  if (remainingSeconds <= 0) return 'expired';
  if (remainingSeconds <= 10) return 10;
  if (remainingSeconds <= 30) return 30;
  if (remainingSeconds <= 60) return 60;
  return null;
}

const TIMER_ANNOUNCEMENTS: Record<Exclude<TimerAnnouncement, null>, string> = {
  60: '견적 유효 시간이 1분 남았습니다.',
  30: '견적 유효 시간이 30초 남았습니다.',
  10: '견적 유효 시간이 10초 남았습니다.',
  expired: '견적이 만료되었습니다. 새로고침 후 다시 확인해주세요.',
};

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
  priceImpact: PriceImpactInfo;
  /** 스왑 전에 필요한 승인 트랜잭션 (없으면 null) */
  approval?: ApprovalRequirement | null;
  /** 가스비 단위 (네트워크 네이티브 심볼) */
  nativeSymbol?: string;
  networkName?: string;
  onRefreshQuote?: () => void;
  isRefreshing?: boolean;
  /** 다시 검토가 필요한 이유 등 상단 안내 */
  notice?: string | null;
  /**
   * 열려 있는 동안(또는 잠긴 동안 열려고 할 때) 지갑이 잠기면 호출된다.
   * 기본값은 onClose: 잠금 화면 위에 검토 시트가 남지 않는다.
   */
  onLock?: () => void;
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
  approval = null,
  nativeSymbol = 'ETH',
  networkName,
  onRefreshQuote,
  isRefreshing = false,
  notice,
  onLock,
}: Props): React.JSX.Element {
  const theme = useTheme();
  const { formatFiat } = useFiat();
  const [now, setNow] = useState(() => Date.now());
  const [acknowledged, setAcknowledged] = useState(false);

  // 새 견적이 오면 위험 확인을 다시 받는다.
  const quoteKey = quote?.security.quoteFingerprint;
  useEffect(() => {
    setAcknowledged(false);
    setNow(Date.now());
  }, [quoteKey]);

  useEffect(() => {
    if (!visible || !quote) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [visible, quote]);

  const remainingSeconds = quote
    ? Math.max(0, Math.ceil(quoteRemainingMs(quote, now) / 1000))
    : 0;
  const isExpired = remainingSeconds <= 0;

  // 매초 바뀌는 카운트다운은 라이브 영역에 두지 않는다 (TalkBack이 매초 읽어 다른 내용을
  // 끊는다). 1분·30초·10초·만료 구간에 들어설 때만 알린다. 처음 열 때는 알리지 않는다.
  const announcement =
    visible && quote ? timerAnnouncement(remainingSeconds) : null;
  const lastAnnouncement = useRef<TimerAnnouncement | undefined>(undefined);
  useEffect(() => {
    if (!visible || !quote) {
      lastAnnouncement.current = undefined;
      return;
    }
    const previous = lastAnnouncement.current;
    lastAnnouncement.current = announcement;
    if (previous === undefined || announcement === previous) return;
    if (announcement !== null) {
      AccessibilityInfo.announceForAccessibility(
        TIMER_ANNOUNCEMENTS[announcement],
      );
    }
  }, [announcement, visible, quote]);

  if (!sellToken || !buyToken || !quote) {
    return <></>;
  }
  const rate = parseFloat(buyAmount) / parseFloat(sellAmount);
  const isCritical = priceImpact.level === 'critical';
  const isHigh = priceImpact.level === 'high';
  const isUnknownImpact = priceImpact.level === 'unknown';
  const needsAcknowledgement = isCritical && !acknowledged;
  const confirmDisabled =
    isLoading || isRefreshing || isExpired || needsAcknowledgement;

  let gasNative: string | null = null;
  try {
    gasNative = formatDisplayAmount(
      formatEther(BigInt(quote.gas || 0) * BigInt(quote.gasPrice || 0)),
    );
  } catch {
    gasNative = null;
  }
  const gasUsd =
    quote.estimatedGasUsd !== undefined ? Number(quote.estimatedGasUsd) : null;

  const confirmLabel = isCritical
    ? '그래도 스왑하기'
    : approval
    ? '승인 후 스왑하기'
    : '스왑 확인';

  return (
    <AppModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onLock={onLock ?? onClose}
    >
      <Screen testID="swap-review-modal">
        <ScreenHeader
          title="스왑 확인"
          subtitle={networkName}
          leftIcon="close"
          onBack={onClose}
          backDisabled={isLoading}
          backTestID="swap-review-close"
        />

        <Content>
          {notice ? (
            <NoticeBox accessibilityRole="alert" testID="swap-review-notice">
              <NoticeText>{notice}</NoticeText>
            </NoticeBox>
          ) : null}

          {/* 견적 유효 시간 */}
          <QuoteTimerRow $expired={isExpired} testID="swap-quote-timer">
            <QuoteTimerText $expired={isExpired} testID="swap-quote-timer-text">
              {isExpired
                ? '견적이 만료되었습니다. 새로고침 후 다시 확인해주세요.'
                : `견적 유효 시간 ${remainingSeconds}초`}
            </QuoteTimerText>
            {onRefreshQuote ? (
              <RefreshButton
                onPress={onRefreshQuote}
                disabled={isRefreshing || isLoading}
                accessibilityRole="button"
                accessibilityLabel="견적 새로고침"
                testID="swap-quote-refresh"
              >
                {isRefreshing ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primary}
                  />
                ) : (
                  <RefreshText>견적 새로고침</RefreshText>
                )}
              </RefreshButton>
            ) : null}
          </QuoteTimerRow>

          {/* 승인 필요 안내 */}
          {approval ? (
            <ApprovalBox testID="swap-review-approval">
              <ApprovalTitle>먼저 토큰 승인이 필요합니다</ApprovalTitle>
              <ApprovalText>
                스왑 전에 {approval.tokenSymbol}을(를) 0x AllowanceHolder가
                정확히 아래 수량만 사용할 수 있도록 승인하는 트랜잭션을 먼저
                보냅니다.{' '}
                {approval.resetRequired
                  ? '초기화, 승인, 스왑까지 세 번의 네트워크 수수료가 발생합니다.'
                  : '승인과 스왑, 두 번의 네트워크 수수료가 발생합니다.'}
              </ApprovalText>
              {approval.resetRequired ? (
                <ApprovalText testID="swap-review-approval-reset">
                  {approval.tokenSymbol}은(는) 이전 승인 수량이 남아 있으면 새
                  수량을 승인할 수 없습니다. 그래서 먼저 기존 승인을 0으로
                  초기화하는 트랜잭션을 한 번 더 보냅니다.
                </ApprovalText>
              ) : null}
              <DetailRow>
                <DetailLabel>승인 토큰</DetailLabel>
                <DetailValue>{approval.tokenSymbol}</DetailValue>
              </DetailRow>
              <DetailRow>
                <DetailLabel>승인 수량</DetailLabel>
                <DetailValue testID="swap-review-approval-amount">
                  {approval.amount} {approval.tokenSymbol}
                </DetailValue>
              </DetailRow>
              <AddressDetail>
                <DetailLabel>승인 대상 (0x AllowanceHolder)</DetailLabel>
                <AddressValue selectable>{approval.spender}</AddressValue>
              </AddressDetail>
            </ApprovalBox>
          ) : null}

          {/* 스왑 토큰 표시 */}
          <TokensContainer>
            <TokenCard>
              <TokenLabel>보내는 토큰</TokenLabel>
              <TokenRow>
                {sellToken.logoUrl && (
                  <TokenLogo source={{ uri: sellToken.logoUrl }} />
                )}
                <TokenAmount>{formatDisplayAmount(sellAmount)}</TokenAmount>
                <TokenSymbol>{sellToken.symbol}</TokenSymbol>
              </TokenRow>
            </TokenCard>

            <ArrowContainer>
              <ArrowIcon importantForAccessibility="no">↓</ArrowIcon>
            </ArrowContainer>

            <TokenCard>
              <TokenLabel>받는 토큰 (예상)</TokenLabel>
              <TokenRow>
                {buyToken.logoUrl && (
                  <TokenLogo source={{ uri: buyToken.logoUrl }} />
                )}
                <TokenAmount $highlight>
                  {formatDisplayAmount(buyAmount)}
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
                1 {sellToken.symbol} ={' '}
                {Number.isFinite(rate) ? formatDisplayAmount(rate) : '—'}{' '}
                {buyToken.symbol}
              </DetailValue>
            </DetailRow>

            <Divider />

            <DetailRow>
              <DetailLabel>최소 수령량</DetailLabel>
              <DetailValue>
                {quote.minimumReceived
                  ? `${formatDisplayAmount(quote.minimumReceived)} ${
                      buyToken.symbol
                    }`
                  : '—'}
              </DetailValue>
            </DetailRow>

            <DetailRow>
              <DetailLabel>슬리피지 허용치</DetailLabel>
              <DetailValue>{slippage}%</DetailValue>
            </DetailRow>

            <Divider />

            <DetailRow>
              <DetailLabel>가격 영향</DetailLabel>
              <PriceImpactValue
                $level={priceImpact.level}
                testID="swap-review-price-impact"
              >
                {priceImpact.percent !== null
                  ? `${priceImpact.percent}%`
                  : '계산할 수 없음'}
              </PriceImpactValue>
            </DetailRow>

            <DetailRow>
              <DetailLabel>예상 가스비</DetailLabel>
              <DetailValue testID="swap-review-gas">
                {gasNative !== null ? `${gasNative} ${nativeSymbol}` : '—'}
                {gasUsd !== null && Number.isFinite(gasUsd)
                  ? ` (≈ ${formatFiat(gasUsd, { ignoreHidden: true })})`
                  : ''}
              </DetailValue>
            </DetailRow>

            <Divider />

            <AddressDetail>
              <DetailLabel>스왑 실행 대상</DetailLabel>
              <AddressValue selectable>{quote.to}</AddressValue>
            </AddressDetail>

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
          {(isHigh || isCritical || isUnknownImpact) && (
            <WarningBox
              $critical={isCritical}
              accessibilityRole="alert"
              testID="swap-review-impact-warning"
            >
              <WarningIcon importantForAccessibility="no">
                {isCritical ? '🚨' : '⚠️'}
              </WarningIcon>
              <WarningText>
                {isCritical
                  ? `가격 영향이 ${priceImpact.percent}%로 매우 높습니다. 이 거래로 큰 손실이 발생할 수 있습니다.`
                  : isHigh
                  ? `가격 영향이 ${priceImpact.percent}%로 높습니다. 수량을 줄이면 손실을 줄일 수 있습니다.`
                  : '가격 영향을 계산할 수 없습니다. 시세 정보를 가져오지 못했습니다. 받는 수량과 최소 수령량을 직접 확인해주세요.'}
              </WarningText>
            </WarningBox>
          )}

          {isCritical && (
            <AckRow
              onPress={() => setAcknowledged(value => !value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acknowledged }}
              accessibilityLabel="큰 손실 위험을 이해했으며 계속 진행합니다"
              testID="swap-review-acknowledge"
            >
              <AckBox $checked={acknowledged}>
                {acknowledged ? (
                  <AckMark importantForAccessibility="no">✓</AckMark>
                ) : null}
              </AckBox>
              <AckText>큰 손실 위험을 이해했으며 계속 진행합니다</AckText>
            </AckRow>
          )}
        </Content>

        {/* 확인 버튼 */}
        <BottomContainer>
          <ConfirmButton
            onPress={onConfirm}
            disabled={confirmDisabled}
            // 처리 중에는 회색 대신 기본 색을 유지해 흰 스피너가 보이게 한다.
            $looksDisabled={confirmDisabled && !isLoading}
            $warning={isCritical}
            accessibilityRole="button"
            accessibilityState={{ disabled: confirmDisabled, busy: isLoading }}
            testID="swap-review-confirm"
          >
            {isLoading ? (
              <ActivityIndicator
                color={
                  isCritical ? theme.colors.onError : theme.colors.onPrimary
                }
                testID="swap-review-confirm-spinner"
              />
            ) : (
              <ConfirmButtonText $disabled={confirmDisabled}>
                {confirmLabel}
              </ConfirmButtonText>
            )}
          </ConfirmButton>

          <CancelButton
            onPress={onClose}
            disabled={isLoading}
            accessibilityRole="button"
            testID="swap-review-cancel"
          >
            <CancelButtonText>취소</CancelButtonText>
          </CancelButton>
        </BottomContainer>
      </Screen>
    </AppModal>
  );
}

// Styled Components
const Content = styled.ScrollView`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const NoticeBox = styled.View`
  background-color: ${({ theme }) => theme.colors.primarySubtle};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const NoticeText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  line-height: 20px;
`;

const QuoteTimerRow = styled.View<{ $expired: boolean }>`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  background-color: ${({ theme, $expired }) =>
    $expired ? theme.colors.errorSubtle : theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const QuoteTimerText = styled.Text<{ $expired: boolean }>`
  flex: 1;
  font-size: 13px;
  color: ${({ theme, $expired }) =>
    $expired ? theme.colors.textPrimary : theme.colors.textSecondary};
`;

const RefreshButton = styled.TouchableOpacity`
  min-height: 44px;
  justify-content: center;
  padding-left: ${({ theme }) => theme.spacing.sm}px;
`;

const RefreshText = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.primary};
`;

const ApprovalBox = styled.View`
  background-color: ${({ theme }) => theme.colors.warningSubtle};
  border: 1px solid ${({ theme }) => theme.colors.warning};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const ApprovalTitle = styled.Text`
  font-size: 15px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const ApprovalText = styled.Text`
  font-size: 13px;
  line-height: 19px;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
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

const AddressDetail = styled.View`
  padding: ${({ theme }) => theme.spacing.sm}px 0;
  gap: 4px;
`;

const AddressValue = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: monospace;
  font-size: 12px;
  line-height: 17px;
`;

const DetailLabel = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const DetailValue = styled.Text`
  flex-shrink: 1;
  text-align: right;
  margin-left: ${({ theme }) => theme.spacing.sm}px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 500;
`;

const PriceImpactValue = styled.Text<{
  $level: PriceImpactInfo['level'];
}>`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme, $level }) => {
    switch ($level) {
      case 'critical':
      case 'high':
        return theme.colors.error;
      case 'medium':
      case 'unknown':
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
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 600;
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
  font-size: 20px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const WarningText = styled.Text`
  flex: 1;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 20px;
`;

const AckRow = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  min-height: 44px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const AckBox = styled.View<{ $checked: boolean }>`
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border-width: 2px;
  border-color: ${({ theme, $checked }) =>
    $checked ? theme.colors.error : theme.colors.border};
  background-color: ${({ theme, $checked }) =>
    $checked ? theme.colors.error : 'transparent'};
  align-items: center;
  justify-content: center;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const AckMark = styled.Text`
  color: ${({ theme }) => theme.colors.onError};
  font-size: 14px;
  font-weight: 700;
`;

const AckText = styled.Text`
  flex: 1;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const BottomContainer = styled.View`
  padding: ${({ theme }) => theme.spacing.md}px;
  border-top-width: 1px;
  border-top-color: ${({ theme }) => theme.colors.border};
`;

const ConfirmButton = styled.TouchableOpacity<{
  $looksDisabled?: boolean;
  $warning?: boolean;
}>`
  background-color: ${({ theme, $looksDisabled, $warning }) =>
    $looksDisabled
      ? theme.colors.disabledBackground
      : $warning
      ? theme.colors.error
      : theme.colors.primary};
  min-height: 48px;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const ConfirmButtonText = styled.Text<{ $disabled?: boolean }>`
  color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.disabledText : theme.colors.onPrimary};
  font-size: 16px;
  font-weight: 600;
`;

const CancelButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  min-height: 44px;
  justify-content: center;
  align-items: center;
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
`;

const CancelButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 16px;
`;

export default SwapReviewModal;
