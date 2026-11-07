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
import { useNavigation } from '@react-navigation/native';
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
import {
  useBalance,
  useMultipleBalances,
  useTokenBalance,
} from '@/hooks/useBalance';
import { useFiat } from '@/hooks/useFiat';
import {
  swapService,
  describeSwapError,
  isNativeSwapToken,
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

const UNKNOWN_IMPACT: PriceImpactInfo = { percent: null, level: 'unknown' };

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

  const activeWallet = wallets[activeWalletIndex];
  // 객체 참조가 아니라 주소 문자열에 의존해 불필요한 견적 초기화를 막는다.
  const takerAddress = activeWallet?.address;
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);
  const nativeSymbol = activeNetwork?.symbol || 'ETH';

  // 서명 중 계정/네트워크가 바뀌면 서명을 막는다.
  const mounted = useRef(true);
  const currentAccount = useRef(activeWallet?.address);
  currentAccount.current = activeWallet?.address;
  const currentChain = useRef(activeNetworkChainId);
  currentChain.current = activeNetworkChainId;
  useEffect(
    () => () => {
      mounted.current = false;
    },
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
  const { data: nativeBalance } = useBalance(
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

  const isAuthorizedFor = useCallback(
    (account: string, chainId: number) => () =>
      mounted.current &&
      currentAccount.current === account &&
      currentChain.current === chainId,
    [],
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
        return allowance >= required ? null : requirement;
      } catch {
        // 확인할 수 없으면 승인이 필요하다고 안내하고, 실행 직전에 다시 확인한다.
        return requirement;
      }
    },
    [sellToken, takerAddress, sellAmount, activeNetworkChainId],
  );

  /**
   * 실행 가능한 견적을 받아 검토 모달을 연다.
   * afterApproval: 승인 후 견적이 만료되어 다시 검토해야 하는 경우
   */
  const prepareReview = useCallback(
    async (options: { afterApproval?: boolean } = {}) => {
      if (!swapIntent || !buyToken) return;
      const refreshing = showReviewModal;
      if (refreshing) setIsRefreshingQuote(true);
      else setIsPreparingReview(true);
      try {
        const latest = await enhancedSwapService.getQuote(
          swapIntent,
          activeNetworkChainId,
        );
        if (!latest) throw new SwapError('UNSUPPORTED_CHAIN');
        const requirement = await readApprovalRequirement(latest);
        if (!mounted.current) return;
        setQuote(latest);
        setApproval(requirement);
        setBuyAmount(formatUnits(BigInt(latest.buyAmount), buyToken.decimals));
        setPriceImpact(enhancedSwapService.calculatePriceImpact(latest));
        setReviewNotice(
          options.afterApproval
            ? '토큰 승인이 완료되었습니다. 승인을 기다리는 동안 견적이 만료되어 새 견적을 받았습니다. 내용을 다시 확인한 뒤 스왑을 진행해주세요.'
            : null,
        );
        setShowReviewModal(true);
      } catch (error) {
        if (!mounted.current) return;
        const message = describeSwapError(error);
        if (options.afterApproval) {
          // 만료된 견적으로는 진행하지 않는다.
          setQuote(null);
          setApproval(null);
          setPriceState({ status: 'error', message });
          Alert.alert(
            '새 견적을 받지 못했습니다',
            `토큰 승인은 완료되었습니다. ${message}\n\n잠시 후 다시 검토해주세요.`,
          );
        } else if (refreshing) {
          setReviewNotice(`새 견적을 받지 못했습니다. ${message}`);
        } else {
          setPriceState({ status: 'error', message });
        }
      } finally {
        if (mounted.current) {
          setIsRefreshingQuote(false);
          setIsPreparingReview(false);
        }
      }
    },
    [
      swapIntent,
      buyToken,
      showReviewModal,
      activeNetworkChainId,
      readApprovalRequirement,
    ],
  );

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
   * 정확한 수량만 승인한다. 이미 충분하면 'not-needed'.
   */
  const approveExactAmount = async (
    swapQuote: SwapQuote,
    isAuthorized: () => boolean,
  ): Promise<'not-needed' | 'approved' | 'failed'> => {
    if (!sellToken || !activeWallet) return 'failed';
    const client = chainClient.getClient(activeNetworkChainId);

    if (!isAddress(swapQuote.allowanceTarget)) {
      throw new Error('유효하지 않은 승인 대상 주소입니다.');
    }

    const requiredAmount = parseUnits(sellAmount, sellToken.decimals);
    const allowance = await client.readContract({
      address: sellToken.address as `0x${string}`,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [
        activeWallet.address as `0x${string}`,
        swapQuote.allowanceTarget as `0x${string}`,
      ],
    });
    if (allowance >= requiredAmount) return 'not-needed';

    setSwapStage('토큰 승인 중… (1/2)');
    const approvalData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [swapQuote.allowanceTarget as `0x${string}`, requiredAmount],
    });
    const approveTxHash = await signingService.sendTransaction(
      {
        from: activeWallet.address,
        to: sellToken.address,
        data: approvalData,
      },
      activeNetworkChainId,
      isAuthorized,
    );

    try {
      await transactionCacheService.createLocalTransaction({
        hash: approveTxHash,
        chainId: activeNetworkChainId,
        from: activeWallet.address,
        to: sellToken.address,
        value: '0',
        valueWei: '0',
        gasPrice: '0',
        type: 'approve',
        tokenSymbol: sellToken.symbol,
        tokenAmount: sellAmount,
        tokenAddress: sellToken.address,
        method: 'approve',
      });
      transactionTracker.reconcile();
    } catch (cacheError) {
      console.warn('Failed to cache approval:', cacheError);
    }

    setSwapStage('승인 확정 대기 중… (1/2)');
    const receipt = await client.waitForTransactionReceipt({
      hash: approveTxHash as `0x${string}`,
    });
    try {
      await transactionCacheService.updateStatus(
        approveTxHash,
        activeNetworkChainId,
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
      Alert.alert(
        '승인 실패',
        '토큰 승인 트랜잭션이 실패했습니다. 스왑은 실행하지 않았습니다.',
      );
      return 'failed';
    }
    return 'approved';
  };

  // 스왑 트랜잭션 전송 (전송 전 시뮬레이션)
  const sendSwap = async (
    swapQuote: SwapQuote,
    isAuthorized: () => boolean,
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
    } catch {
      throw new SwapError(
        'SIMULATION_FAILED',
        '스왑 트랜잭션 시뮬레이션에 실패해 전송하지 않았습니다. 가격이 변했거나 잔액이 부족할 수 있습니다.',
      );
    }

    setSwapStage(
      swapService.needsApproval(sellToken!)
        ? '스왑 전송 중… (2/2)'
        : '스왑 전송 중…',
    );
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

  // 실제 스왑 실행
  const executeSwapTransaction = async () => {
    if (!sellToken || !buyToken || !swapIntent || !activeWallet || !quote) {
      return;
    }

    // 사용자가 검토한 견적과 현재 의도를 다시 바인딩한다. 승인 후 새 견적을
    // 조용히 받아 실행하지 않으며, 변경/만료 시 처음부터 다시 검토한다.
    const swapQuote = quote;
    const intent = swapIntent;
    const chainId = activeNetworkChainId;
    const isAuthorized = isAuthorizedFor(activeWallet.address, chainId);
    let approvedNow = false;

    setIsSwapping(true);
    try {
      swapService.assertQuoteMatchesIntent(swapQuote, intent, chainId);

      if (swapService.needsApproval(sellToken)) {
        const result = await approveExactAmount(swapQuote, isAuthorized);
        if (result === 'failed') return;
        approvedNow = result === 'approved';
        if (
          approvedNow &&
          !swapService.isQuoteUsable(
            swapQuote,
            intent,
            chainId,
            QUOTE_EXECUTION_MARGIN_MS,
          )
        ) {
          // 승인을 기다리는 동안 견적이 만료/변경됨 → 새 견적으로 다시 검토
          setIsSwapping(false);
          setSwapStage(null);
          await prepareReview({ afterApproval: true });
          return;
        }
      }

      swapService.assertQuoteMatchesIntent(swapQuote, intent, chainId);
      const txHash = await sendSwap(swapQuote, isAuthorized);

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
      if (!mounted.current) return;
      const message = describeSwapError(error);
      if (approvedNow) {
        Alert.alert(
          '스왑을 보내지 못했습니다',
          `토큰 승인은 완료되었습니다. ${message}\n\n새 견적을 받아 다시 시도할 수 있습니다.`,
          [
            { text: '닫기', style: 'cancel' },
            { text: '새 견적 받기', onPress: () => prepareReview() },
          ],
        );
      } else {
        Alert.alert('스왑 실패', message);
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
  const pickerTokens = useMemo<PickerToken[]>(
    () =>
      tokens.map(token => {
        let balance: string | null | undefined;
        if (isNativeSwapToken(token)) {
          balance = nativeBalance
            ? formatDisplayAmount(nativeBalance.formatted)
            : undefined;
        } else {
          const entry = tokenBalances?.find(
            item =>
              item.tokenAddress.toLowerCase() === token.address.toLowerCase(),
          );
          balance = entry ? formatDisplayAmount(entry.formatted) : undefined;
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
    [tokens, nativeBalance, tokenBalances],
  );

  const header = (
    <ScreenHeader
      title="토큰 스왑"
      testID="swap-header"
      backTestID="swap-back-button"
      right={
        availability === 'supported' ? (
          <>
            <IconButton
              icon="📋"
              accessibilityLabel="스왑 내역"
              onPress={() => navigation.navigate('SwapHistory')}
              testID="swap-history-button"
            />
            <IconButton
              icon="⚙️"
              accessibilityLabel="스왑 설정"
              onPress={() => setShowSettingsModal(true)}
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
                accessibilityRole="button"
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
                disabled={isSwapping}
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
                editable={!isSwapping}
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
                disabled={isCalculatingMax || !sellBalance || isSwapping}
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
              disabled={isSwapping}
              testID="swap-switch-tokens"
            />
          </SwapArrowWrapper>

          {/* Buy Token */}
          <SwapCard>
            <CardLabel>받는 토큰 (예상)</CardLabel>
            <TokenRow>
              <TokenSelector
                onPress={() => setShowTokenSelector('buy')}
                disabled={isSwapping}
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
            accessibilityRole="button"
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
            $disabled={!canReview}
            accessibilityRole="button"
            accessibilityState={{
              disabled: !canReview,
              busy: isPreparingReview,
            }}
            testID="swap-review-button"
          >
            {isPreparingReview ? (
              <ActivityIndicator color={theme.colors.onPrimary} />
            ) : (
              <SwapButtonText $disabled={!canReview}>
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
        onClose={() => setShowReviewModal(false)}
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
        onRefreshQuote={() => prepareReview()}
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

const FavoritePairChip = styled.TouchableOpacity`
  min-height: 36px;
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

const SlippageRow = styled.TouchableOpacity`
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
