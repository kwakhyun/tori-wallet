/**
 * 토큰 스왑 화면
 *
 * 흐름: 금액 입력 → /price로 예상 수령량 → [검토] /quote(검증·지문) + 승인 필요 여부
 *  → 검토 모달 → PIN → (필요 시 정확한 수량 승인 → 견적이 만료/변경되면 새 견적으로
 *  다시 검토) → 스왑 전송 → 제출 완료 화면
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import { StatusBar, ScrollView, Alert, ActivityIndicator } from 'react-native';
import styled, { useTheme as useStyledTheme } from 'styled-components/native';
import { useTheme } from '@/hooks/useTheme';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  encodeFunctionData,
  erc20Abi,
  formatEther,
  formatUnits,
  isAddress,
  parseUnits,
} from 'viem';

import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useWalletStore } from '@/store/walletStore';
import { useSwapStore, resolveSlippage } from '@/store/swapStore';
import { useSecurityStore } from '@/store/securityStore';
import { showToast } from '@/store/toastStore';
import { useWalletLocked } from '@/hooks/useWalletLocked';
import {
  useBalance,
  useMultipleBalances,
  useTokenBalance,
} from '@/hooks/useBalance';
import { useFiat } from '@/hooks/useFiat';
import {
  swapService,
  describeSwapError,
  isInsufficientFundsError,
  isNativeSwapToken,
  isReceiptTimeoutError,
  nativeSwapMax,
  SwapError,
  SWAP_GAS_LIMIT_ESTIMATE,
  QUOTE_EXECUTION_MARGIN_MS,
  type PriceImpactInfo,
  type SwapToken,
} from '@/services/swapService';
import {
  enhancedSwapService,
  type SwapQuote,
} from '@/services/enhancedSwapService';
import { getSwapAvailability } from '@/services/swapApiConfig';
import {
  parseTransferAmount,
  txService,
  maxPricePerGas,
} from '@/services/txService';
import { signingService } from '@/services/signingService';
import { transactionTracker } from '@/services/transactionTracker';
import { chainClient } from '@/services/chainClient';
import { transactionCacheService } from '@/realm/services';
import {
  SwapReviewModal,
  SwapSettingsModal,
  type ApprovalRequirement,
} from '@/components/swap';
import {
  NetworkBadge,
  TokenPickerModal,
  TxSubmittedView,
  type PickerToken,
} from '@/components/send';
import PinConfirmModal from '@/components/common/PinConfirmModal';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { IconButton } from '@/components/common/IconButton';
import { ErrorState } from '@/components/common/StateViews';
import { formatDisplayAmount } from '@/utils/format';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type PriceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; insufficientBalance: boolean }
  | { status: 'error'; message: string };

/** 토큰 승인 후 다시 검토해야 하는 이유 */
type ReReviewReason = 'expired' | 'locked';

interface ReviewOptions {
  /** 승인 트랜잭션 확정 후 다시 검토하는 경우 그 이유 */
  afterApproval?: ReReviewReason;
  /** 열려 있는 검토 모달의 '견적 새로고침' */
  refreshing?: boolean;
}

interface ApprovalOutcome {
  status: 'not-needed' | 'approved' | 'failed';
  /** 보낸(또는 보내려던) 승인 관련 트랜잭션 수 (초기화 포함) */
  transactions: number;
}

const UNKNOWN_IMPACT: PriceImpactInfo = { percent: null, level: 'unknown' };

const RE_REVIEW_NOTICES: Record<ReReviewReason, string> = {
  expired:
    '토큰 승인이 완료되었습니다. 승인을 기다리는 동안 견적이 만료되어 새 견적을 받았습니다. 내용을 다시 확인한 뒤 스왑을 진행해주세요.',
  locked:
    '토큰 승인이 완료되었습니다. 그동안 지갑이 잠겨 스왑을 보내지 않았으므로 새 견적을 받았습니다. 내용을 다시 확인한 뒤 스왑을 진행해주세요.',
};

const LOCKED_AFTER_APPROVAL_MESSAGE =
  '지갑이 잠겨 스왑을 보내지 않았습니다. 토큰 승인은 완료되었으며, 잠금을 해제하면 새 견적으로 다시 검토합니다.';
const LOCKED_BEFORE_SWAP_MESSAGE =
  '지갑이 잠겨 스왑을 보내지 않았습니다. 잠금을 해제한 뒤 다시 시도해주세요.';
const APPROVED_NOT_SENT_MESSAGE =
  '토큰 승인은 완료되었지만 스왑은 전송되지 않았습니다. 스왑 화면에서 다시 진행해주세요.';

/**
 * 비동기 흐름에서 읽는 현재 잠금 상태 (렌더링 시점 값이 아닌 스토어 값).
 * 거래 서명은 잠금 해제가 확실할 때만 허용한다.
 */
function isWalletLockedNow(): boolean {
  return useWalletStore.getState().isLocked !== false;
}

function withStep(label: string, step: number, total: number): string {
  return total > 1 ? `${label} (${step}/${total})` : label;
}

function SwapScreen(): React.JSX.Element {
  const { isDarkMode } = useTheme();
  const theme = useStyledTheme();
  const navigation = useNavigation<NavigationProp>();
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
  const walletLocked = useWalletLocked();

  const activeWallet = wallets[activeWalletIndex];
  // 객체 참조가 아니라 주소 문자열에 의존해 불필요한 견적 초기화를 막는다.
  const takerAddress = activeWallet?.address;
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);
  const nativeSymbol = activeNetwork?.symbol || 'ETH';

  // 서명 중 계정/네트워크가 바뀌거나 지갑이 잠기면 서명을 막는다.
  const mounted = useRef(true);
  const currentAccount = useRef(activeWallet?.address);
  currentAccount.current = activeWallet?.address;
  const currentChain = useRef(activeNetworkChainId);
  currentChain.current = activeNetworkChainId;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 잠길 때마다 증가한다. 진행 중인 승인→스왑 흐름은 도중에 한 번이라도 잠기면
  // (잠금 해제 후라도) 이어서 서명하지 않고 다시 검토를 받는다.
  const lockEpoch = useRef(0);
  useEffect(
    () =>
      useWalletStore.subscribe((state, previous) => {
        if (state.isLocked && !previous.isLocked) lockEpoch.current += 1;
      }),
    [],
  );

  const tokens = useMemo(
    () => swapService.getTokens(activeNetworkChainId),
    [activeNetworkChainId],
  );
  const availability = getSwapAvailability(activeNetworkChainId);

  // 상태
  const [sellToken, setSellToken] = useState<SwapToken | null>(
    tokens[0] || null,
  );
  const [buyToken, setBuyToken] = useState<SwapToken | null>(tokens[1] || null);
  const [sellAmount, setSellAmount] = useState('');
  const [buyAmount, setBuyAmount] = useState('');
  const [priceState, setPriceState] = useState<PriceState>({ status: 'idle' });
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [approval, setApproval] = useState<ApprovalRequirement | null>(null);
  const [priceImpact, setPriceImpact] =
    useState<PriceImpactInfo>(UNKNOWN_IMPACT);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [isPreparingReview, setIsPreparingReview] = useState(false);
  const [isRefreshingQuote, setIsRefreshingQuote] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapStage, setSwapStage] = useState<string | null>(null);
  const [isCalculatingMax, setIsCalculatingMax] = useState(false);
  const [showTokenSelector, setShowTokenSelector] = useState<
    'sell' | 'buy' | null
  >(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showPinConfirmModal, setShowPinConfirmModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [submitted, setSubmitted] = useState<{
    txHash: string;
    chainId: number;
  } | null>(null);

  // 견적을 받는 중이거나 스왑 중에는 입력을 바꿀 수 없다 (검토 내용과 실행 의도가 어긋나지 않게).
  const inputsLocked = isPreparingReview || isSwapping;

  // 스왑 스토어
  const {
    settings,
    addHistoryItem,
    getTopPairs,
    recentTokens,
    addRecentToken,
  } = useSwapStore(
    useShallow(state => ({
      settings: state.settings,
      addHistoryItem: state.addHistoryItem,
      getTopPairs: state.getTopPairs,
      recentTokens: state.recentTokens,
      addRecentToken: state.addRecentToken,
    })),
  );
  const { requiresTransactionPin } = useSecurityStore(
    useShallow(state => ({
      requiresTransactionPin: state.requiresTransactionPin,
    })),
  );

  const slippage = resolveSlippage(
    settings ?? { autoSlippage: true, defaultSlippage: 0.5 },
    sellToken?.symbol,
    buyToken?.symbol,
  );

  // 잔액
  const { data: nativeBalance, isError: nativeBalanceError } = useBalance(
    activeWallet?.address,
    activeNetworkChainId,
  );
  const sellTokenIsNative = sellToken ? isNativeSwapToken(sellToken) : false;
  const { data: sellTokenBalance } = useTokenBalance(
    sellToken && !sellTokenIsNative ? activeWallet?.address : undefined,
    sellToken?.address || '',
    sellToken?.decimals || 18,
    activeNetworkChainId,
  );
  const sellBalance = sellTokenIsNative ? nativeBalance : sellTokenBalance;

  const erc20Tokens = useMemo(
    () =>
      tokens
        .filter(token => !isNativeSwapToken(token))
        .map(token => ({
          address: token.address,
          decimals: token.decimals,
          symbol: token.symbol,
        })),
    [tokens],
  );
  const { data: tokenBalances } = useMultipleBalances(
    showTokenSelector ? activeWallet?.address : undefined,
    erc20Tokens,
    activeNetworkChainId,
  );

  // 금액 검증
  const sellUnits = useMemo(() => {
    if (!sellToken || !sellAmount) return null;
    try {
      return parseTransferAmount(sellAmount, sellToken.decimals);
    } catch {
      return null;
    }
  }, [sellAmount, sellToken]);
  const isAmountInvalid = !!sellAmount && sellUnits === null;
  const isLocallyInsufficient =
    sellUnits !== null && !!sellBalance && sellUnits > sellBalance.wei;

  const swapIntent = useMemo(
    () =>
      sellToken && buyToken && takerAddress && sellUnits !== null
        ? {
            sellToken,
            buyToken,
            sellAmount,
            slippagePercentage: slippage,
            takerAddress,
          }
        : null,
    [sellToken, buyToken, takerAddress, sellUnits, sellAmount, slippage],
  );
  // 비동기 결과가 도착했을 때 그 사이 의도가 바뀌었는지 확인한다.
  const swapIntentRef = useRef(swapIntent);
  swapIntentRef.current = swapIntent;

  // 승인 후 잠금/화면 이탈로 미뤄 둔 재검토
  const pendingReReview = useRef<ReReviewReason | null>(null);

  // 네트워크 변경 시 초기화
  useEffect(() => {
    setSellToken(tokens[0] || null);
    setBuyToken(tokens[1] || null);
    setSellAmount('');
    setBuyAmount('');
    setQuote(null);
    setApproval(null);
    setSubmitted(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNetworkChainId]);

  // 가격 조회 (최신 요청만 반영)
  const priceRequestId = useRef(0);
  const fetchPrice = useCallback(async () => {
    if (!swapIntent) return;
    const requestId = ++priceRequestId.current;
    setPriceState({ status: 'loading' });
    try {
      const result = await swapService.getPrice(
        swapIntent,
        activeNetworkChainId,
      );
      if (requestId !== priceRequestId.current || !mounted.current) return;
      if (!result) throw new SwapError('UNSUPPORTED_CHAIN');
      setBuyAmount(result.buyAmount);
      setPriceState({
        status: 'ready',
        insufficientBalance: result.insufficientBalance,
      });
    } catch (error) {
      if (requestId !== priceRequestId.current || !mounted.current) return;
      setBuyAmount('');
      setPriceState({ status: 'error', message: describeSwapError(error) });
    }
  }, [swapIntent, activeNetworkChainId]);

  // 입력이 바뀌면 이전 견적을 버리고 가격을 다시 조회 (디바운스)
  useEffect(() => {
    setQuote(null);
    setApproval(null);
    // 이전 의도에 대한 재검토는 더 이상 의미가 없다.
    pendingReReview.current = null;
    if (!swapIntent || availability !== 'supported') {
      priceRequestId.current++;
      setBuyAmount('');
      setPriceState({ status: 'idle' });
      return;
    }
    // 이전 오류/결과를 남기지 않고 바로 조회 중으로 표시한다.
    priceRequestId.current++;
    setPriceState({ status: 'loading' });
    const timeoutId = setTimeout(() => {
      fetchPrice();
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [swapIntent, availability, fetchPrice]);

  /** 서명 직전마다 확인: 화면, 계정, 네트워크가 그대로이고 그동안 잠긴 적이 없는지 */
  const isAuthorizedFor = useCallback((account: string, chainId: number) => {
    const epoch = lockEpoch.current;
    return () =>
      mounted.current &&
      currentAccount.current === account &&
      currentChain.current === chainId &&
      lockEpoch.current === epoch &&
      !isWalletLockedNow();
  }, []);

  /**
   * 실패 안내. 잠금 화면 위나 다른 화면 위에는 Alert을 띄우지 않고 토스트로 바꾼다
   * (토스트는 잠긴 동안 보류되었다가 잠금 해제 후 표시된다).
   */
  const alertOrToast = useCallback(
    (title: string, message: string) => {
      if (!mounted.current || isWalletLockedNow() || !navigation.isFocused()) {
        showToast(message, 'error');
        return;
      }
      Alert.alert(title, message);
    },
    [navigation],
  );

  /** 현재 승인량을 읽어 승인 트랜잭션이 필요한지 판단한다. */
  const readApprovalRequirement = useCallback(
    async (swapQuote: SwapQuote): Promise<ApprovalRequirement | null> => {
      if (!sellToken || !takerAddress || !swapService.needsApproval(sellToken))
        return null;
      const required = parseUnits(sellAmount, sellToken.decimals);
      const requirement: ApprovalRequirement = {
        tokenSymbol: sellToken.symbol,
        tokenAddress: sellToken.address,
        amount: sellAmount,
        spender: swapQuote.allowanceTarget,
      };
      try {
        const allowance = await chainClient
          .getClient(activeNetworkChainId)
          .readContract({
            address: sellToken.address as `0x${string}`,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [
              takerAddress as `0x${string}`,
              swapQuote.allowanceTarget as `0x${string}`,
            ],
          });
        if (allowance >= required) return null;
        // 남은 승인량을 먼저 0으로 초기화해야 하는 토큰 (메인넷 USDT 등)
        return allowance > 0n &&
          swapService.requiresAllowanceReset(
            activeNetworkChainId,
            sellToken.address,
          )
          ? { ...requirement, resetRequired: true }
          : requirement;
      } catch {
        // 확인할 수 없으면 승인이 필요하다고 안내하고, 실행 직전에 다시 확인한다.
        return requirement;
      }
    },
    [sellToken, takerAddress, sellAmount, activeNetworkChainId],
  );

  // 검토 요청 번호: 입력 변경, 모달 닫기, 새 요청이 있으면 이전 결과를 버린다.
  const reviewRequestId = useRef(0);
  const cancelPendingReview = useCallback(() => {
    reviewRequestId.current += 1;
    setIsPreparingReview(false);
    setIsRefreshingQuote(false);
  }, []);

  /**
   * 실행 가능한 견적을 받아 검토 모달을 연다.
   * afterApproval: 승인 후 견적이 만료되었거나 지갑이 잠겨 다시 검토해야 하는 경우
   * refreshing: 열려 있는 검토 모달에서 견적을 새로 받는 경우
   */
  const prepareReview = useCallback(
    async (options: ReviewOptions = {}) => {
      if (!swapIntent || !buyToken) return;
      const intent = swapIntent;
      const requestId = ++reviewRequestId.current;
      const refreshing = options.refreshing === true;
      if (refreshing) setIsRefreshingQuote(true);
      else setIsPreparingReview(true);

      const isCurrent = () =>
        mounted.current &&
        requestId === reviewRequestId.current &&
        swapIntentRef.current === intent;
      // 잠겨 있거나 다른 화면이 위에 있으면 모달을 열지 않는다.
      // 승인 후 재검토는 잠금 해제/화면 복귀 후 다시 시도한다.
      const deferIfHidden = () => {
        if (!isWalletLockedNow() && navigation.isFocused()) return false;
        if (options.afterApproval) {
          pendingReReview.current = options.afterApproval;
        }
        return true;
      };

      try {
        const latest = await enhancedSwapService.getQuote(
          intent,
          activeNetworkChainId,
        );
        if (!latest) throw new SwapError('UNSUPPORTED_CHAIN');
        const requirement = await readApprovalRequirement(latest);
        if (!isCurrent() || deferIfHidden()) return;
        setQuote(latest);
        setApproval(requirement);
        setBuyAmount(formatUnits(BigInt(latest.buyAmount), buyToken.decimals));
        setPriceImpact(enhancedSwapService.calculatePriceImpact(latest));
        setReviewNotice(
          options.afterApproval
            ? RE_REVIEW_NOTICES[options.afterApproval]
            : null,
        );
        setShowReviewModal(true);
      } catch (error) {
        if (!isCurrent() || deferIfHidden()) return;
        const message = describeSwapError(error, { nativeSymbol });
        if (options.afterApproval) {
          // 만료된 견적으로는 진행하지 않는다.
          setQuote(null);
          setApproval(null);
          setPriceState({ status: 'error', message });
          alertOrToast(
            '새 견적을 받지 못했습니다',
            `토큰 승인은 완료되었습니다. ${message}\n\n잠시 후 다시 검토해주세요.`,
          );
        } else if (refreshing) {
          setReviewNotice(`새 견적을 받지 못했습니다. ${message}`);
        } else {
          setPriceState({ status: 'error', message });
        }
      } finally {
        if (mounted.current && requestId === reviewRequestId.current) {
          setIsRefreshingQuote(false);
          setIsPreparingReview(false);
        }
      }
    },
    [
      swapIntent,
      buyToken,
      activeNetworkChainId,
      readApprovalRequirement,
      navigation,
      nativeSymbol,
      alertOrToast,
    ],
  );
  const prepareReviewRef = useRef(prepareReview);
  prepareReviewRef.current = prepareReview;

  /** 미뤄 둔 승인 후 재검토를 잠금 해제·화면 복귀 시 실행한다. */
  const flushPendingReReview = useCallback(() => {
    const reason = pendingReReview.current;
    if (
      !reason ||
      !mounted.current ||
      isWalletLockedNow() ||
      !navigation.isFocused()
    ) {
      return;
    }
    pendingReReview.current = null;
    prepareReviewRef.current({ afterApproval: reason });
  }, [navigation]);

  useEffect(() => {
    if (!walletLocked) flushPendingReReview();
  }, [walletLocked, flushPendingReReview]);

  useEffect(
    () => navigation.addListener('focus', flushPendingReReview),
    [navigation, flushPendingReReview],
  );

  // 스왑 중에는 화면을 벗어나지 않게 한다 (헤더, Android 뒤로 가기, iOS 스와이프).
  usePreventRemove(isSwapping, ({ data }) => {
    // 잠금 화면 위에 Alert을 띄우지 않는다. 잠긴 동안에는 그대로 머문다.
    if (isWalletLockedNow()) return;
    Alert.alert(
      '스왑 진행 중',
      '스왑을 처리하고 있습니다. 지금 나가면 아직 보내지 않은 스왑은 전송되지 않습니다. 이미 보낸 토큰 승인은 그대로 처리됩니다.',
      [
        { text: '머무르기', style: 'cancel' },
        {
          text: '나가기',
          style: 'destructive',
          onPress: () => navigation.dispatch(data.action),
        },
      ],
    );
  });

  // 토큰 위치 스왑
  const handleSwapTokens = useCallback(() => {
    const temp = sellToken;
    setSellToken(buyToken);
    setBuyToken(temp);
    setSellAmount(buyAmount);
    setBuyAmount('');
  }, [sellToken, buyToken, buyAmount]);

  // 토큰 선택
  const handleSelectToken = useCallback(
    (picked: PickerToken) => {
      const token = tokens.find(
        t => t.address.toLowerCase() === picked.id.toLowerCase(),
      );
      if (!token) return;
      if (showTokenSelector === 'sell') {
        if (token.address === buyToken?.address) setBuyToken(sellToken);
        setSellToken(token);
      } else if (showTokenSelector === 'buy') {
        if (token.address === sellToken?.address) setSellToken(buyToken);
        setBuyToken(token);
      }
      addRecentToken(activeNetworkChainId, token.address);
      setShowTokenSelector(null);
    },
    [
      tokens,
      showTokenSelector,
      sellToken,
      buyToken,
      addRecentToken,
      activeNetworkChainId,
    ],
  );

  // 최대값 설정 (네이티브는 예상 가스비를 bigint로 남김)
  const handleSetMax = useCallback(async () => {
    if (!sellToken || !sellBalance) return;
    if (!sellTokenIsNative) {
      setSellAmount(formatUnits(sellBalance.wei, sellToken.decimals));
      return;
    }
    setIsCalculatingMax(true);
    try {
      const fee = await txService.getFeeData(activeNetworkChainId, 'normal');
      const networkPrice = maxPricePerGas(fee);
      const quotePrice = quote ? BigInt(quote.gasPrice) : 0n;
      const { maxWei, reserveWei } = nativeSwapMax(
        sellBalance.wei,
        quote ? BigInt(quote.gas) : SWAP_GAS_LIMIT_ESTIMATE,
        quotePrice > networkPrice ? quotePrice : networkPrice,
      );
      if (!mounted.current) return;
      if (maxWei <= 0n) {
        showToast(
          '가스비를 제외하면 스왑할 수 있는 잔액이 없습니다.',
          'warning',
        );
        return;
      }
      setSellAmount(formatUnits(maxWei, sellToken.decimals));
      showToast(
        `가스비로 약 ${formatDisplayAmount(
          formatEther(reserveWei),
        )} ${nativeSymbol}를 남겼습니다.`,
        'info',
      );
    } catch {
      showToast(
        '가스비를 확인하지 못해 최대 금액을 계산할 수 없습니다.',
        'error',
      );
    } finally {
      if (mounted.current) setIsCalculatingMax(false);
    }
  }, [
    sellToken,
    sellBalance,
    sellTokenIsNative,
    activeNetworkChainId,
    quote,
    nativeSymbol,
  ]);

  // 검토 모달 닫기: 진행 중인 새로고침 결과로 모달이 다시 열리지 않게 한다.
  const handleCloseReview = useCallback(() => {
    setShowReviewModal(false);
    cancelPendingReview();
  }, [cancelPendingReview]);

  // 검토 모달에서 확인 → PIN (거래 USD 가치를 함께 전달)
  const handleConfirmSwap = () => {
    setShowReviewModal(false);
    const usdValue =
      typeof quote?.sellValueUsd === 'number' ? quote.sellValueUsd : undefined;
    if (requiresTransactionPin(usdValue)) {
      setShowPinConfirmModal(true);
      return;
    }
    executeSwapTransaction();
  };

  const handlePinConfirmed = () => {
    setShowPinConfirmModal(false);
    executeSwapTransaction();
  };

  /**
   * approve(spender, amount) 한 건을 보내고 확정을 기다린다. 확정되면 true.
   * amount가 0이면 기존 승인량 초기화 트랜잭션이다.
   */
  const sendApproval = async ({
    token,
    owner,
    spender,
    amount,
    step,
    total,
    chainId,
    isAuthorized,
  }: {
    token: SwapToken;
    owner: string;
    spender: `0x${string}`;
    amount: bigint;
    step: number;
    total: number;
    chainId: number;
    isAuthorized: () => boolean;
  }): Promise<boolean> => {
    const isReset = amount === 0n;
    const client = chainClient.getClient(chainId);
    const subject = isReset ? '기존 승인 초기화' : '토큰 승인';

    setSwapStage(
      withStep(isReset ? '기존 승인 초기화 중…' : '토큰 승인 중…', step, total),
    );
    const approvalData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, amount],
    });
    const approveTxHash = await signingService.sendTransaction(
      { from: owner, to: token.address, data: approvalData },
      chainId,
      isAuthorized,
    );

    try {
      await transactionCacheService.createLocalTransaction({
        hash: approveTxHash,
        chainId,
        from: owner,
        to: token.address,
        value: '0',
        valueWei: '0',
        gasPrice: '0',
        type: 'approve',
        tokenSymbol: token.symbol,
        tokenAmount: isReset ? '0' : sellAmount,
        tokenAddress: token.address,
        method: 'approve',
      });
      transactionTracker.reconcile();
    } catch (cacheError) {
      console.warn('Failed to cache approval:', cacheError);
    }

    setSwapStage(
      withStep(
        isReset ? '초기화 확정 대기 중…' : '승인 확정 대기 중…',
        step,
        total,
      ),
    );
    let receipt: Awaited<ReturnType<typeof client.waitForTransactionReceipt>>;
    try {
      receipt = await client.waitForTransactionReceipt({
        hash: approveTxHash as `0x${string}`,
      });
    } catch (error) {
      // 대기 시간 초과·조회 실패: 트랜잭션은 아직 대기 중일 수 있으므로 '스왑 실패'로
      // 안내하지 않고 활동 내역에서 확인하게 한다 (같은 승인을 다시 보내지 않도록).
      alertOrToast(
        '승인 확인 필요',
        isReceiptTimeoutError(error)
          ? `${subject} 트랜잭션이 아직 확정되지 않았습니다. 활동 내역에서 확인한 뒤 다시 시도해주세요. 스왑은 실행하지 않았습니다.`
          : `${subject} 트랜잭션의 확정 여부를 확인하지 못했습니다. 활동 내역에서 확인한 뒤 다시 시도해주세요. 스왑은 실행하지 않았습니다.`,
      );
      return false;
    }
    try {
      await transactionCacheService.updateStatus(
        approveTxHash,
        chainId,
        receipt.status === 'success'
          ? {
              status: 'confirmed',
              blockNumber: receipt.blockNumber.toString(),
              gasUsed: receipt.gasUsed.toString(),
              confirmedAt: new Date(),
            }
          : { status: 'failed' },
      );
    } catch (cacheError) {
      console.warn('Failed to update approval status:', cacheError);
    }
    if (receipt.status !== 'success') {
      alertOrToast(
        isReset ? '승인 초기화 실패' : '승인 실패',
        `${subject} 트랜잭션이 실패했습니다. 스왑은 실행하지 않았습니다.`,
      );
      return false;
    }
    return true;
  };

  /**
   * 정확한 수량만 승인한다. 이미 충분하면 'not-needed'.
   * 남은 승인량이 있으면 새로 승인할 수 없는 토큰(메인넷 USDT 등)은 먼저 0으로 초기화한다.
   */
  const approveExactAmount = async (
    swapQuote: SwapQuote,
    isAuthorized: () => boolean,
  ): Promise<ApprovalOutcome> => {
    if (!sellToken || !activeWallet)
      return { status: 'failed', transactions: 0 };
    const token = sellToken;
    const owner = activeWallet.address;
    const chainId = activeNetworkChainId;
    const client = chainClient.getClient(chainId);

    if (!isAddress(swapQuote.allowanceTarget)) {
      throw new Error('유효하지 않은 승인 대상 주소입니다.');
    }
    const spender = swapQuote.allowanceTarget as `0x${string}`;

    const requiredAmount = parseUnits(sellAmount, token.decimals);
    const allowance = await client.readContract({
      address: token.address as `0x${string}`,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner as `0x${string}`, spender],
    });
    if (allowance >= requiredAmount) {
      return { status: 'not-needed', transactions: 0 };
    }

    const resetFirst =
      allowance > 0n &&
      swapService.requiresAllowanceReset(chainId, token.address);
    const transactions = resetFirst ? 2 : 1;
    // 승인 관련 트랜잭션 + 스왑
    const total = transactions + 1;
    const common = { token, owner, spender, total, chainId, isAuthorized };

    if (resetFirst) {
      const reset = await sendApproval({ ...common, amount: 0n, step: 1 });
      if (!reset) return { status: 'failed', transactions };
    }
    const approved = await sendApproval({
      ...common,
      amount: requiredAmount,
      step: transactions,
    });
    return { status: approved ? 'approved' : 'failed', transactions };
  };

  // 스왑 트랜잭션 전송 (전송 전 시뮬레이션)
  const sendSwap = async (
    swapQuote: SwapQuote,
    isAuthorized: () => boolean,
    step: number,
  ): Promise<string> => {
    if (!activeWallet) throw new Error('활성 계정을 찾을 수 없습니다.');
    if (!isAddress(swapQuote.to) || !swapQuote.data.startsWith('0x')) {
      throw new Error('스왑 견적에 유효하지 않은 트랜잭션이 포함되었습니다.');
    }

    const client = chainClient.getClient(activeNetworkChainId);
    try {
      await client.estimateGas({
        account: activeWallet.address as `0x${string}`,
        to: swapQuote.to as `0x${string}`,
        data: swapQuote.data as `0x${string}`,
        value: BigInt(swapQuote.value || '0'),
      });
    } catch (error) {
      if (isInsufficientFundsError(error)) {
        throw new SwapError(
          'INSUFFICIENT_BALANCE',
          `가스비로 쓸 ${nativeSymbol} 잔액이 부족해 스왑을 전송하지 않았습니다.`,
        );
      }
      throw new SwapError(
        'SIMULATION_FAILED',
        '스왑 트랜잭션 시뮬레이션에 실패해 전송하지 않았습니다. 가격이 변했거나 잔액이 부족할 수 있습니다.',
      );
    }

    setSwapStage(withStep('스왑 전송 중…', step, step));
    return signingService.sendTransaction(
      {
        from: activeWallet.address,
        to: swapQuote.to,
        data: swapQuote.data,
        value: swapQuote.value,
        gas: swapQuote.gas,
        gasPrice: swapQuote.gasPrice,
      },
      activeNetworkChainId,
      isAuthorized,
    );
  };

  /**
   * 승인은 확정됐지만 화면 이탈·잠금·계정/네트워크 변경으로 스왑을 보내지 않은 경우.
   * 잠금이면 잠금 해제 후 새 견적으로 다시 검토한다.
   */
  const handleApprovedButStopped = (lockedDuringFlow: boolean) => {
    if (!mounted.current) {
      // 토스트는 전역이라 화면을 벗어난 뒤에도 표시된다.
      showToast(APPROVED_NOT_SENT_MESSAGE, 'warning');
      return;
    }
    if (lockedDuringFlow) {
      // 아직 잠겨 있을 때만 알린다 (잠금 해제 후 표시). 이미 풀려 있으면 바로 다시
      // 검토하고, 그 이유는 검토 모달 상단 안내가 설명한다.
      if (isWalletLockedNow()) {
        showToast(LOCKED_AFTER_APPROVAL_MESSAGE, 'warning');
      }
      pendingReReview.current = 'locked';
      flushPendingReReview();
      return;
    }
    alertOrToast(
      '스왑을 보내지 않았습니다',
      '토큰 승인은 완료되었지만 검토 후 계정 또는 네트워크가 바뀌어 스왑을 보내지 않았습니다.',
    );
  };

  // 실제 스왑 실행
  const executeSwapTransaction = async () => {
    if (!sellToken || !buyToken || !swapIntent || !activeWallet || !quote) {
      return;
    }

    // 사용자가 검토한 견적과 현재 의도를 다시 바인딩한다. 승인 후 새 견적을
    // 조용히 받아 실행하지 않으며, 변경/만료/잠금 시 처음부터 다시 검토한다.
    const swapQuote = quote;
    const intent = swapIntent;
    const chainId = activeNetworkChainId;
    const epoch = lockEpoch.current;
    const isAuthorized = isAuthorizedFor(activeWallet.address, chainId);
    const lockedDuringFlow = () =>
      lockEpoch.current !== epoch || isWalletLockedNow();
    let approvedNow = false;

    setIsSwapping(true);
    try {
      swapService.assertQuoteMatchesIntent(swapQuote, intent, chainId);

      let approvalTransactions = 0;
      if (swapService.needsApproval(sellToken)) {
        const result = await approveExactAmount(swapQuote, isAuthorized);
        if (result.status === 'failed') return;
        approvedNow = result.status === 'approved';
        approvalTransactions = result.transactions;
        if (approvedNow && !isAuthorized()) {
          // 승인을 기다리는 동안 잠겼거나 화면을 벗어남 → 스왑을 보내지 않는다.
          handleApprovedButStopped(lockedDuringFlow());
          return;
        }
        if (
          approvedNow &&
          !swapService.isQuoteUsable(
            swapQuote,
            intent,
            chainId,
            QUOTE_EXECUTION_MARGIN_MS,
          )
        ) {
          // 승인을 기다리는 동안 견적이 만료/변경됨 → 새 견적으로 다시 검토.
          // 새 견적을 받는 동안에도 진행 중으로 표시해 버튼을 다시 누르지 않게 한다.
          setSwapStage('새 견적 확인 중…');
          await prepareReview({ afterApproval: 'expired' });
          return;
        }
      }

      swapService.assertQuoteMatchesIntent(swapQuote, intent, chainId);
      const txHash = await sendSwap(
        swapQuote,
        isAuthorized,
        approvalTransactions + 1,
      );

      const confirmedBuyAmount = formatUnits(
        BigInt(swapQuote.buyAmount),
        buyToken.decimals,
      );
      const rate = (
        parseFloat(confirmedBuyAmount) / parseFloat(sellAmount)
      ).toFixed(6);
      addHistoryItem({
        timestamp: Date.now(),
        chainId,
        sellToken: {
          symbol: sellToken.symbol,
          address: sellToken.address,
          amount: sellAmount,
        },
        buyToken: {
          symbol: buyToken.symbol,
          address: buyToken.address,
          amount: confirmedBuyAmount,
        },
        txHash,
        status: 'pending',
        rate,
      });
      addRecentToken(chainId, buyToken.address);
      addRecentToken(chainId, sellToken.address);

      try {
        await transactionCacheService.createLocalTransaction({
          hash: txHash,
          chainId,
          from: activeWallet.address,
          to: swapQuote.to,
          value: swapQuote.value,
          valueWei: swapQuote.value,
          gasPrice: swapQuote.gasPrice,
          gasLimit: swapQuote.gas,
          type: 'swap',
          tokenSymbol: sellToken.symbol,
          tokenAmount: sellAmount,
        });
      } catch (cacheError) {
        console.warn('Failed to cache pending swap:', cacheError);
      }
      transactionTracker.reconcile();

      if (mounted.current) {
        setSubmitted({ txHash, chainId });
        setQuote(null);
        setApproval(null);
      }
    } catch (error: unknown) {
      if (approvedNow && !isAuthorized()) {
        handleApprovedButStopped(lockedDuringFlow());
        return;
      }
      if (!mounted.current) return;
      if (lockedDuringFlow()) {
        // 잠금 화면 위에 Alert을 띄우지 않는다. 토스트는 잠금 해제 후 표시된다.
        showToast(LOCKED_BEFORE_SWAP_MESSAGE, 'warning');
        return;
      }
      const message = describeSwapError(error, { nativeSymbol });
      if (approvedNow && !navigation.isFocused()) {
        // 다른 화면 위에는 Alert을 띄우지 않는다.
        showToast(
          `토큰 승인은 완료되었지만 스왑을 보내지 못했습니다. ${message}`,
          'error',
        );
      } else if (approvedNow) {
        Alert.alert(
          '스왑을 보내지 못했습니다',
          `토큰 승인은 완료되었습니다. ${message}\n\n새 견적을 받아 다시 시도할 수 있습니다.`,
          [
            { text: '닫기', style: 'cancel' },
            {
              text: '새 견적 받기',
              onPress: () => prepareReviewRef.current(),
            },
          ],
        );
      } else {
        alertOrToast('스왑 실패', message);
      }
    } finally {
      if (mounted.current) {
        setIsSwapping(false);
        setSwapStage(null);
      }
    }
  };

  const handleResetAfterSubmit = () => {
    setSubmitted(null);
    setSellAmount('');
    setBuyAmount('');
    setQuote(null);
    setApproval(null);
  };

  // 버튼 상태
  const insufficient =
    isLocallyInsufficient ||
    (priceState.status === 'ready' && priceState.insufficientBalance);
  const canReview =
    !!swapIntent &&
    priceState.status === 'ready' &&
    !insufficient &&
    !!buyAmount &&
    !isPreparingReview &&
    !isSwapping;
  // 진행 중에는 비활성(회색) 대신 기본 색을 유지해 스피너/진행 문구가 보이게 한다.
  const isBusy = isPreparingReview || isSwapping;
  const reviewButtonLooksDisabled = !canReview && !isBusy;

  const buttonLabel = isSwapping
    ? swapStage || '처리 중…'
    : !sellAmount
    ? '금액을 입력하세요'
    : isAmountInvalid
    ? '올바른 금액을 입력하세요'
    : insufficient
    ? `${sellToken?.symbol ?? ''} 잔액이 부족합니다`
    : priceState.status === 'loading' || priceState.status === 'idle'
    ? '견적 조회 중...'
    : priceState.status === 'error'
    ? '견적을 가져올 수 없습니다'
    : '스왑 검토하기';

  // 가격 정보 표시
  const priceInfo = useMemo(() => {
    if (!sellToken || !buyToken || !sellAmount || !buyAmount) return null;
    const rate = parseFloat(buyAmount) / parseFloat(sellAmount);
    if (!Number.isFinite(rate)) return null;
    return `1 ${sellToken.symbol} = ${formatDisplayAmount(rate)} ${
      buyToken.symbol
    }`;
  }, [sellToken, buyToken, sellAmount, buyAmount]);

  // 토큰 선택 목록 (잔액 포함)
  // balance: 문자열 = 표시, null = 조회 실패('잔액 알 수 없음'), undefined = 조회 중/표시 안 함
  const pickerTokens = useMemo<PickerToken[]>(
    () =>
      tokens.map(token => {
        let balance: string | null | undefined;
        if (isNativeSwapToken(token)) {
          balance = nativeBalance
            ? formatDisplayAmount(nativeBalance.formatted)
            : nativeBalanceError
            ? null
            : undefined;
        } else {
          const entry = tokenBalances?.find(
            item =>
              item.tokenAddress.toLowerCase() === token.address.toLowerCase(),
          );
          balance = entry
            ? entry.error || entry.formatted === null
              ? null
              : formatDisplayAmount(entry.formatted)
            : undefined;
        }
        return {
          id: token.address,
          symbol: token.symbol,
          name: token.name,
          address: token.address,
          logoUrl: token.logoUrl,
          balance,
        };
      }),
    [tokens, nativeBalance, nativeBalanceError, tokenBalances],
  );

  const header = (
    <ScreenHeader
      title="토큰 스왑"
      testID="swap-header"
      backTestID="swap-back-button"
      backDisabled={isSwapping}
      right={
        availability === 'supported' ? (
          <>
            <IconButton
              icon="📋"
              accessibilityLabel="스왑 내역"
              onPress={() => navigation.navigate('SwapHistory')}
              disabled={inputsLocked}
              testID="swap-history-button"
            />
            <IconButton
              icon="⚙️"
              accessibilityLabel="스왑 설정"
              onPress={() => setShowSettingsModal(true)}
              disabled={inputsLocked}
              testID="swap-settings-button"
            />
          </>
        ) : undefined
      }
    />
  );

  // 스왑 서비스 미설정 (운영 빌드에 프록시 없음) — 네트워크 미지원과 구분
  if (availability === 'not-configured') {
    return (
      <Screen testID="swap-screen">
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        {header}
        <UnsupportedContainer testID="swap-not-configured">
          <UnsupportedIcon importantForAccessibility="no">🛠️</UnsupportedIcon>
          <UnsupportedTitle>스왑 서비스가 설정되지 않았습니다</UnsupportedTitle>
          <UnsupportedText>
            이 앱 빌드에 스왑 서버가 연결되어 있지 않아 스왑을 사용할 수
            없습니다. 네트워크나 지갑 문제는 아닙니다.
          </UnsupportedText>
          <UnsupportedText>
            앱을 최신 버전으로 업데이트한 뒤 다시 시도해주세요.
          </UnsupportedText>
        </UnsupportedContainer>
      </Screen>
    );
  }

  // 스왑 미지원 네트워크
  if (availability === 'unsupported-chain') {
    return (
      <Screen testID="swap-screen">
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        {header}
        <UnsupportedContainer testID="swap-unsupported-network">
          <UnsupportedIcon importantForAccessibility="no">🔄</UnsupportedIcon>
          <UnsupportedTitle>스왑 미지원 네트워크</UnsupportedTitle>
          <UnsupportedText>
            {activeNetwork?.name || '현재 네트워크'}에서는 스왑 기능을 사용할 수
            없습니다.
          </UnsupportedText>
          <UnsupportedText>
            Ethereum, Polygon, Arbitrum, Optimism, Base에서 사용 가능합니다.
          </UnsupportedText>
        </UnsupportedContainer>
      </Screen>
    );
  }

  if (submitted) {
    return (
      <Screen testID="swap-screen">
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        {header}
        <SubmittedScroll>
          <SubmittedContent>
            <TxSubmittedView
              testID="swap-submitted"
              title="스왑 제출 완료"
              description={
                '트랜잭션이 네트워크에 제출되었습니다.\n체인에서 확정되기 전까지는 대기 상태로 표시됩니다.'
              }
              txHash={submitted.txHash}
              explorerUrl={
                networks.find(n => n.chainId === submitted.chainId)
                  ?.blockExplorerUrl
              }
              onViewDetail={() =>
                navigation.navigate('TransactionDetail', {
                  txHash: submitted.txHash,
                  chainId: submitted.chainId,
                })
              }
              secondaryLabel="스왑 내역"
              onSecondary={() => navigation.navigate('SwapHistory')}
              primaryLabel="확인"
              onPrimary={handleResetAfterSubmit}
            />
          </SubmittedContent>
        </SubmittedScroll>
      </Screen>
    );
  }

  const topPairs = getTopPairs(activeNetworkChainId, 3);

  return (
    <Screen testID="swap-screen">
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      {header}

      {/* 즐겨찾기 토큰 페어 */}
      {topPairs.length > 0 && (
        <FavoritePairsContainer>
          <FavoritePairsLabel>자주 사용하는 페어</FavoritePairsLabel>
          <FavoritePairsRow>
            {topPairs.map(pair => (
              <FavoritePairChip
                key={pair.id}
                hitSlop={{ top: 4, bottom: 4 }}
                disabled={inputsLocked}
                $disabled={inputsLocked}
                accessibilityRole="button"
                accessibilityState={{ disabled: inputsLocked }}
                accessibilityLabel={`${pair.sellTokenSymbol}에서 ${pair.buyTokenSymbol}로 스왑 페어 선택`}
                onPress={() => {
                  const sell = tokens.find(
                    t =>
                      t.address.toLowerCase() ===
                      pair.sellTokenAddress.toLowerCase(),
                  );
                  const buy = tokens.find(
                    t =>
                      t.address.toLowerCase() ===
                      pair.buyTokenAddress.toLowerCase(),
                  );
                  if (sell) setSellToken(sell);
                  if (buy) setBuyToken(buy);
                }}
              >
                <FavoritePairText>
                  {pair.sellTokenSymbol} → {pair.buyTokenSymbol}
                </FavoritePairText>
              </FavoritePairChip>
            ))}
          </FavoritePairsRow>
        </FavoritePairsContainer>
      )}

      <ScrollView keyboardShouldPersistTaps="handled">
        <Content>
          {/* 네트워크 정보 */}
          <BadgeWrapper>
            <NetworkBadge
              name={activeNetwork?.name}
              isTestnet={activeNetwork?.isTestnet}
              testID="swap-network-badge"
            />
          </BadgeWrapper>

          {/* 메인넷 경고 */}
          {!activeNetwork?.isTestnet && (
            <MainnetWarningBox>
              <WarningIcon importantForAccessibility="no">⚠️</WarningIcon>
              <WarningText>
                실제 자산이 사용됩니다. 거래 전 신중히 확인하세요.
              </WarningText>
            </MainnetWarningBox>
          )}

          {/* Sell Token */}
          <SwapCard>
            <CardLabel>보내는 토큰</CardLabel>
            <TokenRow>
              <TokenSelector
                onPress={() => setShowTokenSelector('sell')}
                disabled={inputsLocked}
                accessibilityRole="button"
                accessibilityLabel={`보내는 토큰 ${
                  sellToken?.symbol ?? '선택'
                }, 변경`}
                testID="swap-sell-token-button"
              >
                {sellToken?.logoUrl && (
                  <SmallTokenLogo source={{ uri: sellToken.logoUrl }} />
                )}
                <TokenSelectorText>
                  {sellToken?.symbol || '선택'}
                </TokenSelectorText>
                <TokenSelectorArrow importantForAccessibility="no">
                  ▼
                </TokenSelectorArrow>
              </TokenSelector>
              <AmountInput
                value={sellAmount}
                onChangeText={text => setSellAmount(text.replace(',', '.'))}
                placeholder="0.0"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="decimal-pad"
                editable={!inputsLocked}
                accessibilityLabel="보내는 수량"
                testID="swap-sell-amount-input"
              />
            </TokenRow>
            <BalanceRow>
              <BalanceText testID="swap-sell-balance">
                잔액: {formatDisplayAmount(sellBalance?.formatted)}{' '}
                {sellToken?.symbol}
              </BalanceText>
              <MaxButton
                onPress={handleSetMax}
                disabled={isCalculatingMax || !sellBalance || inputsLocked}
                accessibilityRole="button"
                accessibilityLabel={
                  sellTokenIsNative
                    ? '최대 수량 입력 (가스비 제외)'
                    : '최대 수량 입력'
                }
                testID="swap-max-button"
              >
                {isCalculatingMax ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primary}
                  />
                ) : (
                  <MaxButtonText>MAX</MaxButtonText>
                )}
              </MaxButton>
            </BalanceRow>
          </SwapCard>

          {/* Swap Button */}
          <SwapArrowWrapper>
            <IconButton
              icon="⇅"
              filled
              accessibilityLabel="보내는 토큰과 받는 토큰 바꾸기"
              onPress={handleSwapTokens}
              disabled={inputsLocked}
              testID="swap-switch-tokens"
            />
          </SwapArrowWrapper>

          {/* Buy Token */}
          <SwapCard>
            <CardLabel>받는 토큰 (예상)</CardLabel>
            <TokenRow>
              <TokenSelector
                onPress={() => setShowTokenSelector('buy')}
                disabled={inputsLocked}
                accessibilityRole="button"
                accessibilityLabel={`받는 토큰 ${
                  buyToken?.symbol ?? '선택'
                }, 변경`}
                testID="swap-buy-token-button"
              >
                {buyToken?.logoUrl && (
                  <SmallTokenLogo source={{ uri: buyToken.logoUrl }} />
                )}
                <TokenSelectorText>
                  {buyToken?.symbol || '선택'}
                </TokenSelectorText>
                <TokenSelectorArrow importantForAccessibility="no">
                  ▼
                </TokenSelectorArrow>
              </TokenSelector>
              <AmountDisplay testID="swap-buy-amount">
                {priceState.status === 'loading' ? (
                  <ActivityIndicator
                    color={theme.colors.primary}
                    size="small"
                  />
                ) : buyAmount ? (
                  formatDisplayAmount(buyAmount)
                ) : (
                  '0.0'
                )}
              </AmountDisplay>
            </TokenRow>
          </SwapCard>

          {/* 견적 오류 (원인 + 다시 시도) */}
          {priceState.status === 'error' && (
            <ErrorWrapper>
              <ErrorState
                compact
                title="견적을 가져올 수 없습니다"
                message={priceState.message}
                onRetry={fetchPrice}
                testID="swap-price-error"
              />
            </ErrorWrapper>
          )}

          {/* 슬리피지 (설정 모달에서 변경, 영구 저장) */}
          <SlippageRow
            onPress={() => setShowSettingsModal(true)}
            disabled={inputsLocked}
            $disabled={inputsLocked}
            accessibilityRole="button"
            accessibilityState={{ disabled: inputsLocked }}
            accessibilityLabel={`슬리피지 허용치 ${
              settings?.autoSlippage ? '자동 ' : ''
            }${slippage}%, 변경`}
            testID="swap-slippage-row"
          >
            <SlippageLabel>슬리피지 허용치</SlippageLabel>
            <SlippageValue testID="swap-slippage-value">
              {settings?.autoSlippage ? `자동 (${slippage}%)` : `${slippage}%`}{' '}
              ›
            </SlippageValue>
          </SlippageRow>

          {/* 가격 정보 */}
          {priceInfo && (
            <PriceInfoCard>
              <PriceInfoRow>
                <PriceInfoLabel>환율</PriceInfoLabel>
                <PriceInfoValue>{priceInfo}</PriceInfoValue>
              </PriceInfoRow>
              {quote?.sellValueUsd !== undefined &&
                quote?.sellValueUsd !== null && (
                  <PriceInfoRow>
                    <PriceInfoLabel>보내는 가치</PriceInfoLabel>
                    <PriceInfoValue>
                      {formatFiat(quote.sellValueUsd)}
                    </PriceInfoValue>
                  </PriceInfoRow>
                )}
            </PriceInfoCard>
          )}

          {/* 스왑 버튼 */}
          <SwapButton
            onPress={() => prepareReview()}
            disabled={!canReview}
            $disabled={reviewButtonLooksDisabled}
            accessibilityRole="button"
            accessibilityLabel={
              isPreparingReview && !isSwapping ? '견적 확인 중' : undefined
            }
            accessibilityState={{
              disabled: !canReview,
              busy: isBusy,
            }}
            testID="swap-review-button"
          >
            {isPreparingReview && !isSwapping ? (
              <ActivityIndicator
                color={theme.colors.onPrimary}
                testID="swap-review-button-spinner"
              />
            ) : (
              <SwapButtonText $disabled={reviewButtonLooksDisabled}>
                {buttonLabel}
              </SwapButtonText>
            )}
          </SwapButton>

          {/* 안내 문구 */}
          <DisclaimerText>
            스왑은 0x Protocol을 통해 처리됩니다.{'\n'}
            가격은 실시간으로 변동될 수 있습니다.
          </DisclaimerText>
        </Content>
      </ScrollView>

      <TokenPickerModal
        visible={showTokenSelector !== null}
        title={
          showTokenSelector === 'buy' ? '받는 토큰 선택' : '보내는 토큰 선택'
        }
        tokens={pickerTokens}
        selectedId={
          showTokenSelector === 'buy' ? buyToken?.address : sellToken?.address
        }
        recentIds={recentTokens?.[activeNetworkChainId] ?? []}
        onSelect={handleSelectToken}
        onClose={() => setShowTokenSelector(null)}
        testID="swap-token-picker"
      />

      {/* 리뷰 모달 */}
      <SwapReviewModal
        visible={showReviewModal}
        onClose={handleCloseReview}
        onConfirm={handleConfirmSwap}
        isLoading={isSwapping}
        sellToken={sellToken}
        buyToken={buyToken}
        sellAmount={sellAmount}
        buyAmount={buyAmount}
        quote={quote}
        slippage={slippage}
        priceImpact={priceImpact}
        approval={approval}
        nativeSymbol={nativeSymbol}
        networkName={activeNetwork?.name}
        onRefreshQuote={() => prepareReview({ refreshing: true })}
        isRefreshing={isRefreshingQuote}
        notice={reviewNotice}
      />

      {/* 설정 모달 */}
      <SwapSettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />

      <PinConfirmModal
        visible={showPinConfirmModal}
        onConfirm={handlePinConfirmed}
        onCancel={() => setShowPinConfirmModal(false)}
        title="스왑 PIN 확인"
        message={
          approval
            ? '토큰 승인과 스왑을 실행하려면 PIN을 입력하세요.'
            : '스왑을 실행하려면 PIN을 입력하세요.'
        }
      />
    </Screen>
  );
}

// Styled Components
const FavoritePairsContainer = styled.View`
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const FavoritePairsLabel = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const FavoritePairsRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
`;

const FavoritePairChip = styled.TouchableOpacity<{ $disabled?: boolean }>`
  min-height: 36px;
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.surface};
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

const FavoritePairText = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 500;
`;

const Content = styled.View`
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const SubmittedScroll = styled(ScrollView).attrs({
  contentContainerStyle: { flexGrow: 1 },
})``;

const SubmittedContent = styled.View`
  flex-grow: 1;
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const BadgeWrapper = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const MainnetWarningBox = styled.View`
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.errorSubtle};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
  border-left-width: 3px;
  border-left-color: ${({ theme }) => theme.colors.error};
`;

const WarningIcon = styled.Text`
  font-size: 16px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const WarningText = styled.Text`
  flex: 1;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  line-height: 18px;
`;

const SwapCard = styled.View`
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const CardLabel = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const TokenRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const TokenSelector = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  min-height: 44px;
  background-color: ${({ theme }) => theme.colors.backgroundTertiary};
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
`;

const SmallTokenLogo = styled.Image`
  width: 24px;
  height: 24px;
  border-radius: 12px;
  margin-right: ${({ theme }) => theme.spacing.xs}px;
`;

const TokenSelectorText = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TokenSelectorArrow = styled.Text`
  font-size: 10px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-left: ${({ theme }) => theme.spacing.xs}px;
`;

const AmountInput = styled.TextInput`
  flex: 1;
  font-size: 28px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  text-align: right;
  padding: ${({ theme }) => theme.spacing.sm}px;
`;

const AmountDisplay = styled.Text`
  flex: 1;
  font-size: 28px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: right;
  padding: ${({ theme }) => theme.spacing.sm}px;
`;

const BalanceRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
  padding-top: ${({ theme }) => theme.spacing.sm}px;
  border-top-width: 1px;
  border-top-color: ${({ theme }) => theme.colors.border};
`;

const BalanceText = styled.Text`
  flex: 1;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const MaxButton = styled.TouchableOpacity`
  min-width: 56px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  border: 1px solid ${({ theme }) => theme.colors.primary};
  background-color: ${({ theme }) => theme.colors.primarySubtle};
`;

const MaxButtonText = styled.Text`
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const SwapArrowWrapper = styled.View`
  align-self: center;
  margin: -10px 0;
  z-index: 1;
  border-radius: 26px;
  border: 3px solid ${({ theme }) => theme.colors.background};
`;

const ErrorWrapper = styled.View`
  margin-top: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme }) => theme.colors.errorSubtle};
`;

const SlippageRow = styled.TouchableOpacity<{ $disabled?: boolean }>`
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  min-height: 48px;
  margin-top: ${({ theme }) => theme.spacing.lg}px;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
`;

const SlippageLabel = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const SlippageValue = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const PriceInfoCard = styled.View`
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const PriceInfoRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.xs}px 0;
`;

const PriceInfoLabel = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PriceInfoValue = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 500;
`;

const SwapButton = styled.TouchableOpacity<{ $disabled: boolean }>`
  background-color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.disabledBackground : theme.colors.primary};
  min-height: 52px;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.xl}px;
`;

const SwapButtonText = styled.Text<{ $disabled: boolean }>`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.disabledText : theme.colors.onPrimary};
`;

const DisclaimerText = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  margin-top: ${({ theme }) => theme.spacing.md}px;
  line-height: 18px;
`;

// Unsupported Network Styles
const UnsupportedContainer = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.xl}px;
`;

const UnsupportedIcon = styled.Text`
  font-size: 64px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const UnsupportedTitle = styled.Text`
  font-size: 20px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
  text-align: center;
`;

const UnsupportedText = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

export default SwapScreen;
