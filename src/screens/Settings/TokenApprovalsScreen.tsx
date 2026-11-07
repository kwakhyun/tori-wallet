/**
 * 토큰 승인 관리 화면
 *
 * 현재 계정/네트워크에서 알려진 토큰과 알려진 지출 주소 사이의 ERC-20 승인(allowance)을
 * 보여 주고, approve(spender, 0) 거래로 권한을 취소한다.
 * 취소 거래도 송금과 같은 검토 → (PIN) → 서명 경로를 거친다.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
} from 'react-native';
import styled, { useTheme } from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import { useQuery } from '@tanstack/react-query';
import { formatEther } from 'viem';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { EmptyState, ErrorState } from '@/components/common/StateViews';
import PinConfirmModal from '@/components/common/PinConfirmModal';
import {
  TransactionReviewCard,
  type ReviewRow,
} from '@/components/transactions/TransactionReviewCard';
import {
  useNativeUsdPrice,
  weiToUsd,
} from '@/components/transactions/useNativeUsdPrice';
import { useWalletStore } from '@/store/walletStore';
import { useSecurityStore } from '@/store/securityStore';
import { showToast } from '@/store/toastStore';
import { useFiat } from '@/hooks/useFiat';
import {
  approvalService,
  type RevokePlan,
  type TokenApproval,
} from '@/services/approvalService';
import { transactionTracker } from '@/services/transactionTracker';
import { formatDisplayAmount } from '@/utils/format';
import { shortenAddress } from '@/utils/address';
import type { Theme } from '@/styles/theme';

export const APPROVAL_SCOPE_NOTE =
  '알려진 토큰(기본·스왑·직접 추가한 토큰)과 알려진 지출 주소(0x AllowanceHolder, 이 앱에서 보낸 승인 거래)만 확인합니다. 다른 앱에서 부여한 승인까지 모두 찾으려면 온체인 인덱서가 필요합니다.';

/** 무제한/원시 단위 표기는 그대로, 숫자는 공통 표시 규칙으로 줄인다. */
function displayAllowance(item: TokenApproval): string {
  if (item.isUnlimited) return item.formattedAmount;
  const compact = formatDisplayAmount(item.formattedAmount);
  return compact === '—' ? item.formattedAmount : compact;
}

export default function TokenApprovalsScreen(): React.JSX.Element {
  const theme = useTheme() as Theme;
  const { formatFiat } = useFiat();
  const { wallets, activeWalletIndex, activeNetworkChainId, networks } =
    useWalletStore(
      useShallow(state => ({
        wallets: state.wallets,
        activeWalletIndex: state.activeWalletIndex,
        activeNetworkChainId: state.activeNetworkChainId,
        networks: state.networks,
      })),
    );
  const requiresTransactionPin = useSecurityStore(
    state => state.requiresTransactionPin,
  );
  const owner = wallets[activeWalletIndex]?.address as
    | `0x${string}`
    | undefined;
  const chainId = activeNetworkChainId;
  const network = networks.find(item => item.chainId === chainId);
  const symbol = network?.symbol ?? 'ETH';
  const usdPrice = useNativeUsdPrice(chainId);

  const query = useQuery({
    queryKey: ['tokenApprovals', owner, chainId],
    queryFn: () => approvalService.listAllowances(owner!, chainId),
    enabled: !!owner,
    staleTime: 30_000,
  });
  const refetchRef = useRef(query.refetch);
  refetchRef.current = query.refetch;

  const [plan, setPlan] = useState<RevokePlan | null>(null);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  /** 취소 거래를 보냈지만 아직 처리되지 않은 승인 */
  const [pendingRevokes, setPendingRevokes] = useState<Record<string, string>>(
    {},
  );
  const sending = useRef(false);
  const mounted = useRef(true);
  const currentAccount = useRef(owner);
  currentAccount.current = owner;
  const currentChain = useRef(chainId);
  currentChain.current = chainId;
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  // 계정/네트워크가 바뀌면 진행 중인 검토를 폐기한다.
  useEffect(() => {
    setPlan(null);
    setPinVisible(false);
    setPendingRevokes({});
  }, [owner, chainId]);

  // 취소 거래가 처리되면 목록을 다시 불러온다.
  useEffect(
    () =>
      transactionTracker.subscribe(event => {
        if (event.chainId !== currentChain.current) return;
        setPendingRevokes(prev => {
          const entry = Object.entries(prev).find(
            ([, hash]) => hash.toLowerCase() === event.hash.toLowerCase(),
          );
          if (!entry) return prev;
          const next = { ...prev };
          delete next[entry[0]];
          return next;
        });
        refetchRef.current();
      }),
    [],
  );

  const handleRevoke = useCallback(
    async (approval: TokenApproval) => {
      if (!owner || preparingId) return;
      setPreparingId(approval.id);
      try {
        const next = await approvalService.prepareRevoke({
          owner,
          chainId,
          token: approval.token,
          spender: approval.spender,
        });
        if (mounted.current) setPlan(next);
      } catch (error) {
        if (mounted.current)
          Alert.alert(
            '권한 취소를 준비하지 못했습니다',
            error instanceof Error ? error.message : '다시 시도해주세요.',
          );
      } finally {
        if (mounted.current) setPreparingId(null);
      }
    },
    [chainId, owner, preparingId],
  );

  const submitPlan = useCallback(async () => {
    if (!plan || sending.current) return;
    const snapshot = plan;
    const id = `${
      snapshot.chainId
    }:${snapshot.token.address.toLowerCase()}:${snapshot.spender.address.toLowerCase()}`;
    const isAuthorized = () =>
      mounted.current &&
      currentAccount.current?.toLowerCase() === snapshot.owner.toLowerCase() &&
      currentChain.current === snapshot.chainId &&
      Date.now() < snapshot.expiresAt;
    sending.current = true;
    setSubmitting(true);
    try {
      const hash = await approvalService.submitRevoke(snapshot, isAuthorized);
      showToast('권한 취소 거래를 제출했습니다', 'success');
      if (!mounted.current) return;
      setPendingRevokes(prev => ({ ...prev, [id]: hash }));
      setPlan(null);
    } catch (error) {
      if (mounted.current) {
        Alert.alert(
          '권한 취소 실패',
          error instanceof Error ? error.message : '다시 시도해주세요.',
        );
        if (!isAuthorized()) setPlan(null);
      }
    } finally {
      sending.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }, [plan]);

  const handleConfirm = useCallback(() => {
    if (!plan) return;
    const usdValue = weiToUsd(plan.feeWei, usdPrice) ?? undefined;
    if (requiresTransactionPin(usdValue)) setPinVisible(true);
    else submitPlan();
  }, [plan, requiresTransactionPin, submitPlan, usdPrice]);

  const handlePinConfirmed = useCallback(() => {
    setPinVisible(false);
    submitPlan();
  }, [submitPlan]);

  const renderReview = (current: RevokePlan) => {
    const usd = weiToUsd(current.feeWei, usdPrice);
    const rows: ReviewRow[] = [
      { label: '작업', value: '토큰 승인 취소 (approve → 0)' },
      {
        label: '토큰',
        value: `${current.token.symbol} · ${current.token.address}`,
        mono: true,
      },
      {
        label: '지출 주소',
        value: `${current.spender.label ? `${current.spender.label} · ` : ''}${
          current.spender.address
        }`,
        mono: true,
      },
      { label: '받는 주소 (to)', value: current.token.address, mono: true },
      { label: '보내는 금액', value: `0 ${symbol}` },
      {
        label: '호출 데이터',
        value: `approve(${shortenAddress(current.spender.address)}, 0)`,
        testID: 'revoke-review-data',
      },
      { label: 'Nonce', value: '전송 시 다음 nonce 자동 지정' },
      {
        label: '최대 수수료',
        value: `${formatDisplayAmount(formatEther(current.feeWei))} ${symbol}${
          usd !== null
            ? ` (${formatFiat(usd, { showTinyAsLessThan: true })})`
            : ''
        }`,
        emphasis: true,
      },
      { label: '네트워크', value: network?.name ?? `체인 ${chainId}` },
    ];
    return (
      <ScrollView>
        <TransactionReviewCard
          title="권한 취소 검토"
          description="이 거래가 처리되면 지출 주소는 더 이상 이 토큰을 옮길 수 없습니다."
          rows={rows}
          warning="권한 취소도 네트워크 수수료가 드는 일반 거래입니다."
          confirmLabel="권한 취소"
          onConfirm={handleConfirm}
          onCancel={() => setPlan(null)}
          busy={submitting}
          testID="revoke-review"
        />
      </ScrollView>
    );
  };

  const renderItem = ({ item }: { item: TokenApproval }) => {
    const pendingHash = pendingRevokes[item.id];
    const spenderName = item.spender.label ?? '알 수 없는 주소';
    return (
      <Item testID={`approval-${item.id}`}>
        <ItemMain>
          <TokenSymbol>{item.token.symbol}</TokenSymbol>
          <Secondary>{shortenAddress(item.token.address)}</Secondary>
          <SpenderLine>
            {spenderName} · {shortenAddress(item.spender.address)}
          </SpenderLine>
          <AmountRow>
            <AmountLabel>승인 수량</AmountLabel>
            <AmountValue $warning={item.isUnlimited}>
              {displayAllowance(item)}
            </AmountValue>
          </AmountRow>
        </ItemMain>
        {pendingHash ? (
          <PendingText accessibilityLiveRegion="polite">
            취소 처리 중
          </PendingText>
        ) : (
          <RevokeButton
            onPress={() => handleRevoke(item)}
            disabled={!!preparingId}
            accessibilityRole="button"
            accessibilityLabel={`${item.token.symbol} ${spenderName} 권한 취소`}
            accessibilityState={{
              disabled: !!preparingId,
              busy: preparingId === item.id,
            }}
            testID={`revoke-${item.id}`}
          >
            {preparingId === item.id ? (
              <ActivityIndicator size="small" color={theme.colors.error} />
            ) : (
              <RevokeText>권한 취소</RevokeText>
            )}
          </RevokeButton>
        )}
      </Item>
    );
  };

  const renderList = () => {
    if (!owner)
      return (
        <EmptyState
          title="활성 계정이 없습니다"
          testID="approvals-no-account"
        />
      );
    if (query.isLoading)
      return (
        <Centered testID="approvals-loading">
          <ActivityIndicator color={theme.colors.primary} />
          <Secondary>알려진 토큰의 승인 상태를 확인하는 중…</Secondary>
        </Centered>
      );
    if (query.isError)
      return (
        <ErrorState
          title="승인 정보를 불러오지 못했습니다"
          onRetry={() => query.refetch()}
          testID="approvals-error"
        />
      );
    const result = query.data;
    return (
      <FlatList
        data={result?.approvals ?? []}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => query.refetch()}
            tintColor={theme.colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            <Note testID="approvals-scope-note">
              <NoteText>{APPROVAL_SCOPE_NOTE}</NoteText>
            </Note>
            {result && result.failedChecks > 0 ? (
              <Note $warning accessibilityRole="alert">
                <NoteText>
                  일부 토큰({result.failedChecks}건)의 승인 상태를 확인하지
                  못했습니다. 당겨서 새로고침해 다시 시도하세요.
                </NoteText>
              </Note>
            ) : null}
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon="🛡️"
            title="부여된 토큰 승인이 없습니다"
            message={
              result
                ? `${network?.name ?? '현재 네트워크'}에서 토큰 ${
                    result.tokensChecked
                  }개 × 지출 주소 ${result.spendersChecked}개를 확인했습니다.`
                : undefined
            }
            testID="approvals-empty"
          />
        }
        contentContainerStyle={{ paddingBottom: theme.spacing.xl }}
      />
    );
  };

  return (
    <Screen testID="TokenApprovals-screen">
      <ScreenHeader
        title={plan ? '권한 취소 검토' : '토큰 승인 관리'}
        subtitle={plan ? undefined : network?.name}
        onBack={plan ? () => setPlan(null) : undefined}
        backDisabled={submitting}
      />
      {plan ? renderReview(plan) : renderList()}
      <PinConfirmModal
        visible={pinVisible}
        onConfirm={handlePinConfirmed}
        onCancel={() => setPinVisible(false)}
        title="권한 취소 승인"
        message="토큰 승인 취소 거래에 서명하려면 PIN을 입력하세요."
      />
    </Screen>
  );
}

const Centered = styled.View`
  padding: ${({ theme }) => theme.spacing.xxl}px;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md}px;
`;

const Note = styled.View<{ $warning?: boolean }>`
  margin: ${({ theme }) => theme.spacing.md}px
    ${({ theme }) => theme.spacing.md}px 0;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme, $warning }) =>
    $warning ? theme.colors.warningSubtle : theme.colors.primarySubtle};
`;

const NoteText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 13px;
  line-height: 19px;
`;

const Item = styled.View`
  flex-direction: row;
  align-items: center;
  margin: ${({ theme }) => theme.spacing.md}px
    ${({ theme }) => theme.spacing.md}px 0;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

const ItemMain = styled.View`
  flex: 1;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const TokenSymbol = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
`;

const Secondary = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
  margin-top: 2px;
`;

const SpenderLine = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
`;

const AmountRow = styled.View`
  flex-direction: row;
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const AmountLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const AmountValue = styled.Text<{ $warning: boolean }>`
  color: ${({ theme, $warning }) =>
    $warning ? theme.colors.warning : theme.colors.textPrimary};
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 1;
`;

const RevokeButton = styled.TouchableOpacity`
  min-height: 44px;
  min-width: 88px;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border-width: 1px;
  border-color: ${({ theme }) => theme.colors.error};
  align-items: center;
  justify-content: center;
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
`;

const RevokeText = styled.Text`
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
  font-weight: 600;
`;

const PendingText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
`;
