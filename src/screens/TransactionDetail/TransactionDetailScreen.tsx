/**
 * 거래 상세 화면
 *
 * 해시로 거래를 조회해 상태, 방향, 주소, 금액, 수수료, nonce, 블록, 시각, 네트워크를 보여 준다.
 * 대기 중인 거래는 자동으로 새로고침하며, 현재 계정에서 보낸 대기 중 거래는
 * 검토 → (PIN) → 서명 단계를 거쳐 가속하거나 취소할 수 있다.
 *
 * - 호출 데이터가 있는 거래(토큰 전송, 승인, 스왑 등)를 가속하면 금액을 알 수 없는 거래로 보고
 *   거래 PIN 정책을 적용한다 (WalletConnect와 같은 기준).
 * - 취소 거래를 가속하면 '취소 가속'으로 표시하고 계속 취소 거래로 서명한다.
 * - 서명 직전 검토의 비용은 잔액 숨기기와 관계없이 표시한다 (송금/스왑 검토와 같음).
 * - 비동기 작업이 끝났을 때 지갑이 잠겨 있으면 Alert 대신 토스트로 알린다
 *   (Alert은 잠금 화면 위에 뜨지만 토스트는 잠금 해제 후 표시된다).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Linking,
  RefreshControl,
  ScrollView,
} from 'react-native';
import styled, { useTheme } from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import { useQuery } from '@tanstack/react-query';
import { formatEther } from 'viem';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { IconButton } from '@/components/common/IconButton';
import { Button } from '@/components/common/Button';
import { ErrorState } from '@/components/common/StateViews';
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
import { chainClient } from '@/services/chainClient';
import { transactionTracker } from '@/services/transactionTracker';
import {
  ReplacementError,
  summarizeCalldata,
  txReplacementService,
  type FeeFields,
  type ReplacementPlan,
} from '@/services/txReplacementService';
import { formatDisplayAmount, formatGwei } from '@/utils/format';
import { shortenAddress } from '@/utils/address';
import type { Theme } from '@/styles/theme';
import {
  loadTransactionDetail,
  TransactionNotFoundError,
  type DetailStatus,
  type TransactionDetail,
} from './loadTransactionDetail';

type Navigation = NativeStackNavigationProp<
  RootStackParamList,
  'TransactionDetail'
>;

const PENDING_REFRESH_MS = 10_000;

export const STATUS_LABELS: Record<DetailStatus, string> = {
  pending: '대기 중',
  confirmed: '완료',
  failed: '실패',
  replaced: '대체됨',
};

function statusColors(theme: Theme, status: DetailStatus) {
  switch (status) {
    case 'confirmed':
      return { fg: theme.colors.success, bg: theme.colors.successSubtle };
    case 'failed':
      return { fg: theme.colors.error, bg: theme.colors.errorSubtle };
    case 'pending':
      return { fg: theme.colors.warning, bg: theme.colors.warningSubtle };
    default:
      return {
        fg: theme.colors.textSecondary,
        bg: theme.colors.backgroundTertiary,
      };
  }
}

const formatNative = (wei: bigint, symbol: string) =>
  `${formatDisplayAmount(formatEther(wei))} ${symbol}`;

const formatGweiText = (wei: bigint) =>
  `${formatDisplayAmount(formatGwei(wei))} Gwei`;

function formatFees(fees: FeeFields): string {
  return fees.type === 'legacy'
    ? formatGweiText(fees.gasPrice)
    : `최대 ${formatGweiText(fees.maxFeePerGas)} · 우선 ${formatGweiText(
        fees.maxPriorityFeePerGas,
      )}`;
}

const sameHex = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

function directionOf(detail: TransactionDetail, owner?: string): string {
  const counterparty =
    detail.token?.kind === 'transfer' ? detail.token.counterparty : detail.to;
  if (detail.token?.kind === 'approve') return '토큰 승인';
  if (detail.token?.kind === 'swap' || detail.localType === 'swap')
    return '스왑';
  if (sameHex(detail.from, owner) && sameHex(counterparty, owner))
    return '내 주소로 전송';
  if (sameHex(detail.from, owner)) return '보냄';
  if (sameHex(counterparty, owner)) return '받음';
  return '거래';
}

export default function TransactionDetailScreen(): React.JSX.Element {
  const route = useRoute<RouteProp<RootStackParamList, 'TransactionDetail'>>();
  const navigation = useNavigation<Navigation>();
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

  const txHash = route.params?.txHash ?? '';
  const ownerKey = (wallets[activeWalletIndex]?.address ?? '').toLowerCase();
  // 화면을 연 시점의 네트워크로 고정한다 (도중에 네트워크를 바꿔도 다른 체인을 조회하지 않음).
  const [chainId] = useState(
    () => route.params?.chainId ?? activeNetworkChainId,
  );
  const network = networks.find(item => item.chainId === chainId);
  const symbol = network?.symbol ?? 'ETH';
  const networkName =
    network?.name ??
    chainClient.getChainInfo(chainId)?.name ??
    `체인 ${chainId}`;
  const activeAddress = wallets[activeWalletIndex]?.address;
  const usdPrice = useNativeUsdPrice(chainId);

  const query = useQuery({
    queryKey: ['transactionDetail', chainId, txHash.toLowerCase(), ownerKey],
    queryFn: () =>
      loadTransactionDetail(txHash, chainId, ownerKey || undefined),
    enabled: !!txHash,
    retry: (count, error) =>
      !(error instanceof TransactionNotFoundError) && count < 1,
    refetchInterval: current =>
      current.state.data?.status === 'pending' ? PENDING_REFRESH_MS : false,
  });
  const detail = query.data;
  const refetchRef = useRef(query.refetch);
  refetchRef.current = query.refetch;

  // 추적기가 상태 변화를 감지하면 즉시 다시 불러온다.
  useEffect(
    () =>
      transactionTracker.subscribe(event => {
        if (event.chainId !== chainId) return;
        const related = [
          event.hash,
          event.replacedBy?.hash,
          event.replacement?.originalHash,
        ];
        if (related.some(hash => sameHex(hash, txHash))) refetchRef.current();
      }),
    [chainId, txHash],
  );

  // 가속/취소 흐름 상태
  const [plan, setPlan] = useState<ReplacementPlan | null>(null);
  const [preparing, setPreparing] = useState<ReplacementPlan['kind'] | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  const sending = useRef(false);
  const mounted = useRef(true);
  const currentAccount = useRef(activeAddress);
  currentAccount.current = activeAddress;
  const currentChain = useRef(activeNetworkChainId);
  currentChain.current = activeNetworkChainId;
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const isOwnPending =
    detail?.status === 'pending' && sameHex(detail.from, activeAddress);
  const canReplace = isOwnPending && chainId === activeNetworkChainId;
  // 취소 거래는 다시 취소할 대상이 없으므로 '취소 가속'만 제공한다.
  const isCancelTx = detail?.replacementOf?.kind === 'cancel';

  /** 비동기 작업 결과 알림: 잠겨 있으면 Alert 대신 (잠금 해제 후 표시되는) 토스트 */
  const notifyFailure = useCallback((title: string, message: string) => {
    const { hasWallet, isLocked } = useWalletStore.getState();
    if (hasWallet && isLocked) showToast(`${title} · ${message}`, 'error');
    else Alert.alert(title, message);
  }, []);

  const copy = useCallback((value: string, label: string) => {
    Clipboard.setString(value);
    showToast(`${label}를 복사했습니다`, 'success');
  }, []);

  const openExplorer = useCallback(async () => {
    if (!network?.blockExplorerUrl) return;
    try {
      await Linking.openURL(`${network.blockExplorerUrl}/tx/${txHash}`);
    } catch {
      showToast('익스플로러를 열 수 없습니다', 'error');
    }
  }, [network?.blockExplorerUrl, txHash]);

  const handlePrepare = useCallback(
    async (kind: ReplacementPlan['kind']) => {
      if (!activeAddress || preparing) return;
      setPreparing(kind);
      try {
        const next = await txReplacementService.prepare({
          kind,
          hash: txHash as `0x${string}`,
          chainId,
          activeAddress,
        });
        if (mounted.current) setPlan(next);
      } catch (error) {
        if (!mounted.current) return;
        notifyFailure(
          kind === 'speedUp' ? '가속할 수 없습니다' : '취소할 수 없습니다',
          error instanceof Error ? error.message : '다시 시도해주세요.',
        );
        refetchRef.current();
      } finally {
        if (mounted.current) setPreparing(null);
      }
    },
    [activeAddress, chainId, notifyFailure, preparing, txHash],
  );

  const submitPlan = useCallback(async () => {
    if (!plan || sending.current) return;
    const snapshot = plan;
    const isAuthorized = () =>
      mounted.current &&
      sameHex(currentAccount.current, snapshot.from) &&
      currentChain.current === snapshot.chainId &&
      Date.now() < snapshot.expiresAt;
    sending.current = true;
    setSubmitting(true);
    try {
      const hash = await txReplacementService.submit(snapshot, isAuthorized, {
        nativeSymbol: symbol,
      });
      showToast(
        snapshot.kind === 'speedUp'
          ? '가속 거래를 제출했습니다'
          : '취소 거래를 제출했습니다',
        'success',
      );
      if (!mounted.current) return;
      setPlan(null);
      refetchRef.current();
      navigation.push('TransactionDetail', {
        txHash: hash,
        chainId: snapshot.chainId,
      });
    } catch (error) {
      if (!mounted.current) return;
      notifyFailure(
        '제출하지 못했습니다',
        error instanceof Error ? error.message : '다시 시도해주세요.',
      );
      if (
        error instanceof ReplacementError &&
        (error.code === 'NOT_PENDING' || error.code === 'UNAUTHORIZED')
      ) {
        setPlan(null);
        refetchRef.current();
      }
    } finally {
      sending.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }, [navigation, notifyFailure, plan, symbol]);

  const handleConfirmPlan = useCallback(() => {
    if (!plan) return;
    // 호출 데이터를 다시 서명하는 가속(토큰 전송, 승인, 스왑 등)은 옮겨지는 금액을
    // 수수료만으로 알 수 없으므로 '알 수 없는 금액'으로 보고 PIN 정책을 적용한다.
    const usdValue = plan.data
      ? undefined
      : weiToUsd(plan.totalAtRiskWei, usdPrice) ?? undefined;
    if (requiresTransactionPin(usdValue)) setPinVisible(true);
    else submitPlan();
  }, [plan, requiresTransactionPin, submitPlan, usdPrice]);

  const handlePinConfirmed = useCallback(() => {
    setPinVisible(false);
    submitPlan();
  }, [submitPlan]);

  /** ignoreHidden: 서명 전에 승인하는 비용은 잔액 숨기기와 관계없이 보여 준다. */
  const fiatText = (wei: bigint, ignoreHidden = false) => {
    const usd = weiToUsd(wei, usdPrice);
    return usd === null
      ? null
      : formatFiat(usd, { showTinyAsLessThan: true, ignoreHidden });
  };
  const fiatOf = (wei: bigint, ignoreHidden = false) => {
    const text = fiatText(wei, ignoreHidden);
    return text ? ` (${text})` : '';
  };

  const renderReview = (current: ReplacementPlan) => {
    const isSpeedUp = current.kind === 'speedUp';
    const title = current.acceleratesCancel
      ? '취소 가속 검토'
      : isSpeedUp
      ? '거래 가속 검토'
      : '거래 취소 검토';
    const rows: ReviewRow[] = [
      {
        label: '작업',
        value: current.acceleratesCancel
          ? `취소 가속: 0 ${symbol} 취소 거래를 더 높은 수수료로 다시 제출`
          : isSpeedUp
          ? '가속: 같은 거래를 더 높은 수수료로 다시 제출'
          : `취소: 0 ${symbol}을 내 주소로 보내 원래 거래를 대체`,
      },
      { label: '받는 주소 (to)', value: current.to, mono: true },
      { label: '보내는 금액', value: formatNative(current.value, symbol) },
      { label: '호출 데이터', value: summarizeCalldata(current.data) },
      { label: 'Nonce', value: String(current.nonce), testID: 'review-nonce' },
      { label: '가스 한도', value: current.gas.toString() },
      { label: '기존 수수료', value: formatFees(current.originalFees) },
      { label: '새 수수료', value: formatFees(current.fees) },
      {
        label: '새 거래 최대 수수료',
        value:
          formatNative(current.newMaxCostWei, symbol) +
          fiatOf(current.newMaxCostWei, true),
      },
      {
        label: '추가 비용 (최대)',
        value:
          formatNative(current.extraCostWei, symbol) +
          fiatOf(current.extraCostWei, true),
        emphasis: true,
        testID: 'review-extra-cost',
      },
      { label: '네트워크', value: networkName },
    ];
    return (
      <TransactionReviewCard
        title={title}
        description="아래 내용으로 새 거래에 서명합니다. 같은 nonce를 사용하므로 둘 중 하나만 처리됩니다."
        rows={rows}
        warning={
          isSpeedUp
            ? '원래 거래가 먼저 처리되면 가속 거래는 무시되고 수수료가 청구되지 않습니다.'
            : '취소는 보장되지 않습니다. 원래 거래가 먼저 처리되면 취소되지 않으며, 취소에 성공해도 취소 거래 수수료는 청구됩니다.'
        }
        confirmLabel={
          current.acceleratesCancel
            ? '취소 가속하기'
            : isSpeedUp
            ? '가속하기'
            : '취소 거래 보내기'
        }
        onConfirm={handleConfirmPlan}
        onCancel={() => setPlan(null)}
        busy={submitting}
        testID="replacement-review"
      />
    );
  };

  const renderDetail = (current: TransactionDetail) => {
    const colors = statusColors(theme, current.status);
    const isToken = current.token && current.token.kind !== 'swap';
    // 네이티브 자산을 판 스왑은 기호를 네트워크 기호로 채운다.
    const tokenSymbol =
      current.token?.symbol ?? (current.token?.nativeSell ? symbol : '');
    const amountText =
      current.token?.kind === 'approve'
        ? `${current.token.amountDisplay} ${tokenSymbol}`.trim()
        : current.token
        ? `${formatDisplayAmount(
            current.token.amountDisplay,
          )} ${tokenSymbol}`.trim()
        : formatNative(current.valueWei, symbol);
    const showNativeFiat = !current.token;
    return (
      <>
        <SummaryCard>
          <Badge
            style={{ backgroundColor: colors.bg }}
            accessibilityLabel={`상태: ${STATUS_LABELS[current.status]}`}
            testID="tx-status-badge"
          >
            {current.status === 'pending' ? (
              <ActivityIndicator size="small" color={colors.fg} />
            ) : null}
            <BadgeText style={{ color: colors.fg }}>
              {STATUS_LABELS[current.status]}
            </BadgeText>
          </Badge>
          <Direction>{directionOf(current, activeAddress)}</Direction>
          <Amount testID="tx-amount" selectable>
            {amountText}
          </Amount>
          {current.token?.kind === 'swap' && current.token.receiveDisplay ? (
            <SubAmount>→ {current.token.receiveDisplay}</SubAmount>
          ) : null}
          {showNativeFiat &&
          current.valueWei > 0n &&
          fiatText(current.valueWei) ? (
            <SubAmount>{fiatText(current.valueWei)}</SubAmount>
          ) : null}
        </SummaryCard>

        {current.rpcUnavailable ? (
          <Notice $tone="warning" accessibilityRole="alert">
            <NoticeText>
              네트워크에서 최신 정보를 불러오지 못해 저장된 정보를 표시합니다.
            </NoticeText>
          </Notice>
        ) : null}

        {current.status === 'replaced' ? (
          <Notice $tone="neutral" testID="tx-replaced-notice">
            <NoticeText>
              같은 nonce를 사용한 다른 거래가 먼저 처리되어 이 거래는 실행되지
              않습니다.
            </NoticeText>
            {current.replacedBy ? (
              <LinkButton
                accessibilityRole="button"
                accessibilityLabel="대체한 거래 보기"
                onPress={() =>
                  navigation.push('TransactionDetail', {
                    txHash: current.replacedBy!,
                    chainId,
                  })
                }
              >
                <LinkText>대체한 거래 보기</LinkText>
              </LinkButton>
            ) : null}
          </Notice>
        ) : null}

        {current.replacementOf ? (
          <Notice $tone="neutral">
            <NoticeText>
              {current.replacementOf.kind === 'speedUp'
                ? '가속을 위해 다시 제출한 거래입니다.'
                : '원래 거래를 취소하기 위해 보낸 거래입니다.'}
            </NoticeText>
            <LinkButton
              accessibilityRole="button"
              accessibilityLabel="원래 거래 보기"
              onPress={() =>
                navigation.push('TransactionDetail', {
                  txHash: current.replacementOf!.originalHash,
                  chainId,
                })
              }
            >
              <LinkText>원래 거래 보기</LinkText>
            </LinkButton>
          </Notice>
        ) : null}

        {current.status === 'pending' &&
        current.replacements.some(item => item.status === 'pending') ? (
          <Notice $tone="neutral">
            <NoticeText>
              이 거래를 대체하는 거래가 제출되어 처리를 기다리고 있습니다.
            </NoticeText>
          </Notice>
        ) : null}

        <Section>
          <AddressRow
            label="보낸 주소"
            address={current.from}
            onCopy={copy}
            testID="tx-from"
          />
          <AddressRow
            label={isToken ? '컨트랙트' : '받는 주소'}
            address={current.to}
            onCopy={copy}
            testID="tx-to"
          />
          {current.token?.counterparty ? (
            <AddressRow
              label={
                current.token.kind === 'approve'
                  ? '승인 대상'
                  : '토큰 받는 주소'
              }
              address={current.token.counterparty}
              onCopy={copy}
              testID="tx-counterparty"
            />
          ) : null}
          {isToken && current.valueWei > 0n ? (
            <InfoRow
              label="보낸 금액 (네이티브)"
              value={formatNative(current.valueWei, symbol)}
            />
          ) : null}
          <InfoRow
            label={
              current.feeIsMax
                ? '최대 수수료'
                : current.includesL1Fee
                ? '지불한 수수료 (L1 포함)'
                : '지불한 수수료'
            }
            value={
              current.feeWei !== undefined
                ? formatNative(current.feeWei, symbol) + fiatOf(current.feeWei)
                : '—'
            }
            testID="tx-fee"
          />
          {current.gasPriceWei ? (
            <InfoRow
              label="가스 가격"
              value={formatGweiText(current.gasPriceWei)}
            />
          ) : null}
          {current.maxFeePerGas !== undefined &&
          current.status === 'pending' ? (
            <InfoRow
              label="최대 가스 가격"
              value={`${formatGweiText(current.maxFeePerGas)}${
                current.maxPriorityFeePerGas !== undefined
                  ? ` · 우선 ${formatGweiText(current.maxPriorityFeePerGas)}`
                  : ''
              }`}
            />
          ) : null}
          {current.gasUsed !== undefined || current.gasLimit !== undefined ? (
            <InfoRow
              label="가스 사용량 / 한도"
              value={`${current.gasUsed?.toString() ?? '—'} / ${
                current.gasLimit?.toString() ?? '—'
              }`}
            />
          ) : null}
          <InfoRow
            label="Nonce"
            value={current.nonce !== undefined ? String(current.nonce) : '—'}
            testID="tx-nonce"
          />
          <InfoRow
            label="블록"
            value={
              current.blockNumber !== undefined
                ? current.blockNumber.toString()
                : '아직 포함되지 않음'
            }
            testID="tx-block"
          />
          <InfoRow
            label={current.timestampIsSubmission ? '제출 시각' : '시각'}
            value={
              current.timestamp
                ? new Date(current.timestamp).toLocaleString('ko-KR')
                : '—'
            }
          />
          <InfoRow label="네트워크" value={networkName} />
          {current.input && current.input !== '0x' ? (
            <InfoRow
              label="호출 데이터"
              value={summarizeCalldata(current.input)}
            />
          ) : null}
          <HashRow
            accessible
            accessibilityRole="button"
            accessibilityLabel="거래 해시 복사"
            onPress={() => copy(current.hash, '거래 해시')}
            testID="tx-copy-hash"
          >
            <RowLabel>거래 해시</RowLabel>
            <MonoText selectable>{current.hash}</MonoText>
          </HashRow>
        </Section>

        {canReplace ? (
          <Section testID="tx-replace-actions">
            <SectionTitle>대기 중인 거래</SectionTitle>
            <HintText>
              {isCancelTx
                ? '취소 거래의 수수료를 올려 더 빨리 처리되게 할 수 있습니다.'
                : '수수료를 올려 더 빨리 처리되게 하거나, 같은 nonce의 빈 거래로 대체해 취소를 시도할 수 있습니다.'}
            </HintText>
            <ActionRow $inset>
              <ActionSlot>
                <Button
                  title={isCancelTx ? '취소 가속' : '가속하기'}
                  onPress={() => handlePrepare('speedUp')}
                  loading={preparing === 'speedUp'}
                  disabled={!!preparing}
                  fullWidth
                  testID="tx-speed-up"
                />
              </ActionSlot>
              {isCancelTx ? null : (
                <ActionSlot>
                  <Button
                    title="거래 취소"
                    variant="outline"
                    onPress={() => handlePrepare('cancel')}
                    loading={preparing === 'cancel'}
                    disabled={!!preparing}
                    fullWidth
                    testID="tx-cancel"
                  />
                </ActionSlot>
              )}
            </ActionRow>
          </Section>
        ) : isOwnPending ? (
          <Notice $tone="neutral">
            <NoticeText>
              가속/취소하려면 {networkName} 네트워크로 전환하세요.
            </NoticeText>
          </Notice>
        ) : null}

        <ActionRow>
          {network?.blockExplorerUrl ? (
            <ActionSlot>
              <Button
                title="익스플로러에서 보기"
                variant="outline"
                onPress={openExplorer}
                fullWidth
                testID="tx-open-explorer"
              />
            </ActionSlot>
          ) : null}
          <ActionSlot>
            <Button
              title="해시 복사"
              variant="outline"
              onPress={() => copy(current.hash, '거래 해시')}
              fullWidth
              testID="tx-copy-hash-button"
            />
          </ActionSlot>
        </ActionRow>
      </>
    );
  };

  const renderBody = () => {
    if (!txHash) return <ErrorState title="거래 정보가 없습니다" message="" />;
    if (plan) return renderReview(plan);
    if (query.isLoading)
      return (
        <Centered testID="tx-loading">
          <ActivityIndicator color={theme.colors.primary} />
        </Centered>
      );
    if (query.isError || !detail) {
      const notFound = query.error instanceof TransactionNotFoundError;
      return (
        <ErrorState
          title={
            notFound ? '거래를 찾을 수 없습니다' : '거래를 불러오지 못했습니다'
          }
          message={
            notFound
              ? '아직 네트워크에 전파되지 않았거나 다른 네트워크의 거래일 수 있습니다.'
              : '네트워크 연결을 확인한 뒤 다시 시도해주세요.'
          }
          onRetry={() => query.refetch()}
          testID="tx-error"
        />
      );
    }
    return renderDetail(detail);
  };

  return (
    <Screen testID="TransactionDetail-screen">
      <ScreenHeader
        title={plan ? '거래 검토' : '거래 상세'}
        onBack={plan ? () => setPlan(null) : undefined}
        backDisabled={submitting}
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: theme.spacing.xl }}
        refreshControl={
          plan ? undefined : (
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
              tintColor={theme.colors.primary}
            />
          )
        }
      >
        {renderBody()}
      </ScrollView>
      <PinConfirmModal
        visible={pinVisible}
        onConfirm={handlePinConfirmed}
        onCancel={() => setPinVisible(false)}
        title="거래 승인"
        message={
          plan?.kind === 'cancel'
            ? '취소 거래에 서명하려면 PIN을 입력하세요.'
            : '가속 거래에 서명하려면 PIN을 입력하세요.'
        }
      />
    </Screen>
  );
}

function AddressRow({
  label,
  address,
  onCopy,
  testID,
}: {
  label: string;
  address?: string;
  onCopy: (value: string, label: string) => void;
  testID?: string;
}) {
  if (!address) return <InfoRow label={label} value="—" testID={testID} />;
  return (
    <Row testID={testID}>
      <RowMain>
        <RowLabel>{label}</RowLabel>
        <RowValue accessibilityLabel={`${label} ${address}`}>
          {shortenAddress(address)}
        </RowValue>
        <MonoText selectable>{address}</MonoText>
      </RowMain>
      <IconButton
        icon="⧉"
        accessibilityLabel={`${label} 복사`}
        onPress={() => onCopy(address, label)}
        testID={testID ? `${testID}-copy` : undefined}
      />
    </Row>
  );
}

function InfoRow({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID?: string;
}) {
  return (
    <Row testID={testID} accessible accessibilityLabel={`${label}: ${value}`}>
      <RowMain>
        <RowLabel>{label}</RowLabel>
        <RowValue selectable>{value}</RowValue>
      </RowMain>
    </Row>
  );
}

const Centered = styled.View`
  padding: ${({ theme }) => theme.spacing.xxl}px;
  align-items: center;
`;

const SummaryCard = styled.View`
  margin: ${({ theme }) => theme.spacing.md}px;
  padding: ${({ theme }) => theme.spacing.lg}px;
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  background-color: ${({ theme }) => theme.colors.surface};
  align-items: center;
`;

const Badge = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
`;

const BadgeText = styled.Text`
  font-size: 14px;
  font-weight: 700;
`;

const Direction = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const Amount = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 26px;
  font-weight: 700;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
  text-align: center;
`;

const SubAmount = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 15px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const Notice = styled.View<{ $tone: 'warning' | 'neutral' }>`
  margin: 0 ${({ theme }) => theme.spacing.md}px
    ${({ theme }) => theme.spacing.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme, $tone }) =>
    $tone === 'warning'
      ? theme.colors.warningSubtle
      : theme.colors.primarySubtle};
`;

const NoticeText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 14px;
  line-height: 20px;
`;

const LinkButton = styled.TouchableOpacity`
  min-height: 44px;
  justify-content: center;
  align-self: flex-start;
`;

const LinkText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 15px;
  font-weight: 600;
`;

const Section = styled.View`
  margin: 0 ${({ theme }) => theme.spacing.md}px
    ${({ theme }) => theme.spacing.md}px;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

const SectionTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const HintText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  line-height: 18px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const Row = styled.View`
  flex-direction: row;
  align-items: center;
  min-height: 44px;
  padding: ${({ theme }) => theme.spacing.sm + 4}px 0;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const HashRow = styled.TouchableOpacity`
  min-height: 44px;
  padding: ${({ theme }) => theme.spacing.sm + 4}px 0;
`;

const RowMain = styled.View`
  flex: 1;
`;

const RowLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  margin-bottom: 2px;
`;

const RowValue = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 15px;
`;

const MonoText = styled.Text`
  color: ${({ theme }) => theme.colors.textTertiary};
  font-size: 12px;
  font-family: monospace;
  margin-top: 2px;
`;

const ActionRow = styled.View<{ $inset?: boolean }>`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.sm}px;
  margin: ${({ theme }) => theme.spacing.md}px
    ${({ theme, $inset }) => ($inset ? 0 : theme.spacing.md)}px;
`;

const ActionSlot = styled.View`
  flex: 1;
`;
