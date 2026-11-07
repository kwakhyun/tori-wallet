/**
 * 전송 화면 (네이티브/ERC-20)
 *
 * 입력 → 검토(고정된 전송 계획, 90초 만료, 계정/체인 재확인) → PIN → 제출 완료
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import styled, { useTheme as useStyledTheme } from 'styled-components/native';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '@/hooks/useTheme';
import {
  StatusBar,
  ScrollView,
  Alert,
  ActivityIndicator,
  Keyboard,
  Clipboard,
  Modal,
  Platform,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { formatUnits, getAddress, isAddress } from 'viem';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useWalletStore } from '@/store/walletStore';
import { useSecurityStore } from '@/store/securityStore';
import { showToast } from '@/store/toastStore';
import { useAddressName } from '@/realm/hooks';
import { useBalance } from '@/hooks/useBalance';
import { useFiat } from '@/hooks/useFiat';
import {
  txService,
  getAddressFormatIssue,
  FEE_SPEED_LABELS,
  type FeeSpeed,
} from '@/services/txService';
import { signingService } from '@/services/signingService';
import {
  transferService,
  type TransferPlan,
  type RecipientKind,
} from '@/services/transferService';
import { ensService, isEnsName, normalizeEnsName } from '@/services/ensService';
import { tokenService } from '@/services/tokenService';
import { enhancedSwapService } from '@/services/enhancedSwapService';
import { NATIVE_TOKEN_ADDRESS } from '@/services/swapService';
import { transactionTracker } from '@/services/transactionTracker';
import { transactionCacheService } from '@/realm/services';
import { QRScanner } from '@/components/common';
import { Screen } from '@/components/common/Screen';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import {
  NetworkBadge,
  TokenPickerModal,
  FeeSpeedSelector,
  TxSubmittedView,
  type PickerToken,
} from '@/components/send';
import type { ScanResult } from '@/utils/paymentUri';
import { formatDisplayAmount } from '@/utils/format';
import PinConfirmModal from '@/components/common/PinConfirmModal';
import AddressBookScreen from '@/screens/Settings/AddressBookScreen';

type NavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'SendTransaction'
>;

/** AddressBookScreen '최근' 탭이 실제 이름 대신 붙이는 임시 이름 */
const RECENT_PLACEHOLDER_NAME = '최근 주소';

type EnsState =
  | { status: 'idle' }
  | { status: 'resolving'; input: string }
  | { status: 'resolved'; input: string; name: string; address: `0x${string}` }
  | { status: 'error'; input: string; message: string };

function parseAmountRaw(value: string | undefined): bigint | null {
  if (!value || !/^\d+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function shortAddress(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function SendTransactionScreen(): React.JSX.Element {
  const { isDarkMode } = useTheme();
  const theme = useStyledTheme();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProp<RootStackParamList, 'SendTransaction'>>();
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
  const {
    requiresTransactionPin,
    addRecentAddress,
    recentAddresses,
    legacyAddressBook,
  } = useSecurityStore(
    useShallow(state => ({
      requiresTransactionPin: state.requiresTransactionPin,
      addRecentAddress: state.addRecentAddress,
      recentAddresses: state.recentAddresses,
      legacyAddressBook: state.addressBook,
    })),
  );
  const activeWallet = wallets[activeWalletIndex];
  const activeAddress = activeWallet?.address as `0x${string}` | undefined;
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);
  const nativeSymbol = activeNetwork?.symbol || 'ETH';

  // 라우트 파라미터 (QR/딥링크/토큰 상세에서 미리 채움)
  const initialToken = route.params?.tokenAddress;
  const [tokenAddress, setTokenAddress] = useState<`0x${string}` | undefined>(
    initialToken && isAddress(initialToken, { strict: false })
      ? (initialToken as `0x${string}`)
      : undefined,
  );
  const [recipientInput, setRecipientInput] = useState(
    route.params?.recipient ?? '',
  );
  const pendingAmountRaw = useRef<bigint | null>(
    parseAmountRaw(route.params?.amountRaw),
  );

  const { data: balance, refetch: refetchBalance } = useBalance(
    activeAddress,
    activeNetworkChainId,
  );

  const {
    data: tokenBalance,
    refetch: refetchToken,
    error: tokenMetaError,
  } = useQuery({
    queryKey: [
      'transferToken',
      activeAddress,
      tokenAddress,
      activeNetworkChainId,
    ],
    queryFn: () =>
      transferService.readToken(
        activeAddress as `0x${string}`,
        tokenAddress as `0x${string}`,
        activeNetworkChainId,
      ),
    enabled: !!activeAddress && !!tokenAddress,
  });

  // 토큰 목록 (선택 모달, QR 토큰 확인용)
  const {
    data: tokenList,
    isLoading: tokensLoading,
    error: tokensError,
    refetch: refetchTokens,
  } = useQuery({
    queryKey: ['sendTokens', activeAddress, activeNetworkChainId],
    queryFn: () =>
      tokenService.getTokens(activeAddress as string, activeNetworkChainId),
    enabled: !!activeAddress,
    staleTime: 30_000,
  });

  // 시세 (테스트넷/조회 실패 시 null → '—')
  const { data: assetPriceUsd = null } = useQuery({
    queryKey: [
      'sendAssetPrice',
      activeNetworkChainId,
      tokenAddress ?? 'native',
    ],
    queryFn: async () => {
      const key = tokenAddress ?? NATIVE_TOKEN_ADDRESS;
      const prices = await enhancedSwapService.getUsdPrices(
        activeNetworkChainId,
        [{ address: key }],
      );
      return prices[key.toLowerCase()] ?? null;
    },
    staleTime: 60_000,
  });
  const { data: nativePriceUsd = null } = useQuery({
    queryKey: ['nativeUsdPrice', activeNetworkChainId],
    queryFn: () => enhancedSwapService.getNativeUsdPrice(activeNetworkChainId),
    staleTime: 60_000,
  });

  const assetBalance = tokenAddress ? tokenBalance : balance;
  const listedToken = tokenAddress
    ? tokenList?.find(
        token =>
          token.address !== 'native' &&
          token.address.toLowerCase() === tokenAddress.toLowerCase(),
      )
    : undefined;
  const assetSymbol = tokenAddress
    ? tokenBalance?.symbol || listedToken?.symbol || '토큰'
    : nativeSymbol;

  const [plan, setPlan] = useState<TransferPlan | null>(null);
  const sending = useRef(false);
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

  const [toAddressName, setToAddressName] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [amountIsMax, setAmountIsMax] = useState(false);
  const [feeSpeed, setFeeSpeed] = useState<FeeSpeed>('normal');
  const [preview, setPreview] = useState<TransferPlan | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCalculatingMax, setIsCalculatingMax] = useState(false);
  const [step, setStep] = useState<'input' | 'confirm' | 'success'>('input');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showPinConfirmModal, setShowPinConfirmModal] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showAddressBook, setShowAddressBook] = useState(false);
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  // 라우트로 받은 최소 단위 수량은 소수 자릿수를 알게 된 뒤 한 번만 적용한다.
  useEffect(() => {
    if (pendingAmountRaw.current === null) return;
    const decimals = tokenAddress ? tokenBalance?.decimals : 18;
    if (decimals === undefined) return;
    setAmount(formatUnits(pendingAmountRaw.current, decimals));
    pendingAmountRaw.current = null;
  }, [tokenAddress, tokenBalance?.decimals]);

  // 네트워크가 바뀌면 다른 체인의 토큰/금액을 버린다.
  const previousChain = useRef(activeNetworkChainId);
  useEffect(() => {
    if (previousChain.current === activeNetworkChainId) return;
    previousChain.current = activeNetworkChainId;
    setTokenAddress(undefined);
    setAmount('');
    setAmountIsMax(false);
    setPlan(null);
    setStep(current => (current === 'success' ? current : 'input'));
  }, [activeNetworkChainId]);

  // ── 수신자 해석/검증 ─────────────────────────────────────────
  const trimmedInput = recipientInput.trim();
  const isEns = isEnsName(trimmedInput);
  const [ens, setEns] = useState<EnsState>({ status: 'idle' });

  useEffect(() => {
    if (!isEns) {
      setEns({ status: 'idle' });
      return;
    }
    try {
      normalizeEnsName(trimmedInput);
    } catch (error) {
      setEns({
        status: 'error',
        input: trimmedInput,
        message:
          error instanceof Error
            ? error.message
            : '올바르지 않은 ENS 이름입니다.',
      });
      return;
    }
    let cancelled = false;
    setEns({ status: 'resolving', input: trimmedInput });
    const timer = setTimeout(() => {
      ensService
        .resolve(trimmedInput)
        .then(result => {
          if (!cancelled)
            setEns({
              status: 'resolved',
              input: trimmedInput,
              name: result.name,
              address: result.address,
            });
        })
        .catch(error => {
          if (!cancelled)
            setEns({
              status: 'error',
              input: trimmedInput,
              message:
                error instanceof Error
                  ? error.message
                  : 'ENS 이름을 확인하지 못했습니다.',
            });
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isEns, trimmedInput]);

  const formatIssue =
    !trimmedInput || isEns ? null : getAddressFormatIssue(trimmedInput);
  const ensCurrent =
    isEns && ens.status !== 'idle' && ens.input === trimmedInput ? ens : null;
  const resolvedRecipient: `0x${string}` | null = isEns
    ? ensCurrent?.status === 'resolved'
      ? ensCurrent.address
      : null
    : trimmedInput && formatIssue === null
    ? (getAddress(trimmedInput) as `0x${string}`)
    : null;
  const isSelf =
    !!resolvedRecipient &&
    !!activeAddress &&
    resolvedRecipient.toLowerCase() === activeAddress.toLowerCase();
  const isResolvingEns =
    isEns && (!ensCurrent || ensCurrent.status === 'resolving');

  const recipientError =
    formatIssue === 'invalid'
      ? '유효하지 않은 주소입니다.'
      : formatIssue === 'checksum'
      ? '주소의 대소문자(체크섬)가 올바르지 않습니다'
      : ensCurrent?.status === 'error'
      ? ensCurrent.message
      : isSelf
      ? '내 지갑 주소입니다. 자기 자신에게는 보낼 수 없습니다.'
      : null;

  // 컨트랙트 주소 경고
  const [recipientKind, setRecipientKind] = useState<{
    address: string;
    kind: RecipientKind;
  } | null>(null);
  useEffect(() => {
    if (!resolvedRecipient || isSelf) {
      setRecipientKind(null);
      return;
    }
    let cancelled = false;
    transferService
      .getRecipientKind(resolvedRecipient, activeNetworkChainId)
      .then(kind => {
        if (!cancelled) setRecipientKind({ address: resolvedRecipient, kind });
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedRecipient, isSelf, activeNetworkChainId]);
  const isContractRecipient =
    recipientKind?.address === resolvedRecipient &&
    recipientKind?.kind === 'contract';

  // 주소록 이름 / 처음 보내는 주소
  const { name: realmAddressName, isLoading: isNameLoading } = useAddressName(
    resolvedRecipient ?? undefined,
  );
  const legacyEntry = resolvedRecipient
    ? (legacyAddressBook ?? []).find(
        entry =>
          entry.address.toLowerCase() === resolvedRecipient.toLowerCase(),
      )
    : undefined;
  const knownName =
    toAddressName || realmAddressName || legacyEntry?.name || null;
  const isRecentRecipient =
    !!resolvedRecipient &&
    (recentAddresses ?? []).some(
      entry => entry.address.toLowerCase() === resolvedRecipient.toLowerCase(),
    );
  const isFirstTimeRecipient =
    !!resolvedRecipient &&
    !isSelf &&
    !isNameLoading &&
    !knownName &&
    !isRecentRecipient;

  // ── 전송 계획 ─────────────────────────────────────────────
  const prepareAmount = amountIsMax ? '' : amount;
  const ensName =
    ensCurrent?.status === 'resolved' ? ensCurrent.name : undefined;
  const prepareTransfer = useCallback(async () => {
    if (!activeAddress) throw new Error('활성 계정을 찾을 수 없습니다.');
    if (!resolvedRecipient) throw new Error('유효하지 않은 주소입니다.');
    return transferService.prepare({
      from: activeAddress,
      to: resolvedRecipient,
      amount: prepareAmount,
      chainId: activeNetworkChainId,
      tokenAddress,
      feeSpeed,
      sendMax: amountIsMax,
      ensName,
    });
  }, [
    activeAddress,
    resolvedRecipient,
    prepareAmount,
    activeNetworkChainId,
    tokenAddress,
    feeSpeed,
    amountIsMax,
    ensName,
  ]);

  const hasAmount = amountIsMax || !!amount;
  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setEstimateError(null);
    if (
      step !== 'input' ||
      !resolvedRecipient ||
      recipientError ||
      !hasAmount
    ) {
      setIsEstimating(false);
      return;
    }
    setIsEstimating(true);
    const timer = setTimeout(() => {
      prepareTransfer()
        .then(next => {
          if (cancelled) return;
          setPreview(next);
          if (amountIsMax) setAmount(next.amount);
        })
        .catch(error => {
          if (!cancelled)
            setEstimateError(
              error instanceof Error
                ? error.message
                : '전송을 확인할 수 없습니다.',
            );
        })
        .finally(() => {
          if (!cancelled) setIsEstimating(false);
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    prepareTransfer,
    step,
    resolvedRecipient,
    recipientError,
    hasAmount,
    amountIsMax,
  ]);

  // ── 입력 핸들러 ────────────────────────────────────────────
  const handleRecipientChange = useCallback((text: string) => {
    setRecipientInput(text);
    setToAddressName(null);
  }, []);

  // 주소록에서 주소 선택
  const handleSelectAddressFromBook = useCallback(
    (address: `0x${string}`, name: string) => {
      setRecipientInput(address);
      // '최근' 탭 항목의 임시 이름은 실제 이름이 아니므로 표시하지 않는다.
      setToAddressName(name && name !== RECENT_PLACEHOLDER_NAME ? name : null);
      setShowAddressBook(false);
    },
    [],
  );

  // 클립보드에서 주소 붙여넣기
  const handlePasteAddress = useCallback(async () => {
    try {
      const clipboardContent = (await Clipboard.getString())?.trim();
      if (
        clipboardContent &&
        (/^0x[0-9a-fA-F]{40}$/.test(clipboardContent) ||
          isEnsName(clipboardContent))
      ) {
        handleRecipientChange(clipboardContent);
      } else {
        showToast('클립보드에 지갑 주소나 ENS 이름이 없습니다.', 'error');
      }
    } catch {
      showToast('클립보드를 읽을 수 없습니다.', 'error');
    }
  }, [handleRecipientChange]);

  /** 결제 요청(EIP-681) 적용: 수신자, 토큰, 수량, 체인 */
  const handleQRScan = useCallback(
    async (result: ScanResult) => {
      if (result.kind === 'address') {
        handleRecipientChange(result.address);
        return;
      }
      if (result.kind !== 'payment') {
        Alert.alert('오류', '유효하지 않은 지갑 주소입니다.');
        return;
      }

      if (
        result.chainId !== undefined &&
        result.chainId !== activeNetworkChainId
      ) {
        const requested =
          networks.find(n => n.chainId === result.chainId)?.name ??
          `체인 ID ${result.chainId}`;
        Alert.alert(
          '다른 네트워크의 결제 요청',
          `이 결제 요청은 ${requested} 네트워크용입니다. 현재 네트워크는 ${
            activeNetwork?.name ?? '알 수 없음'
          }입니다.\n\n다른 네트워크로 보내면 자산을 잃을 수 있습니다. 네트워크를 전환한 뒤 다시 스캔해주세요.`,
          [
            { text: '취소', style: 'cancel' },
            {
              text: '수신 주소만 사용',
              onPress: () => {
                handleRecipientChange(result.recipient);
                showToast(
                  '토큰과 금액은 적용하지 않았습니다. 네트워크를 확인해주세요.',
                  'warning',
                );
              },
            },
          ],
        );
        return;
      }

      if (result.tokenAddress) {
        const requestedToken = result.tokenAddress;
        const known = tokenList?.find(
          token =>
            token.address !== 'native' &&
            token.address.toLowerCase() === requestedToken.toLowerCase(),
        );
        let meta: { decimals: number; symbol: string };
        try {
          meta = known
            ? { decimals: known.decimals, symbol: known.symbol }
            : await transferService.readToken(
                activeAddress as `0x${string}`,
                requestedToken,
                activeNetworkChainId,
              );
        } catch {
          Alert.alert(
            '토큰을 확인할 수 없습니다',
            '결제 요청의 토큰 계약을 현재 네트워크에서 찾을 수 없습니다. 요청을 다시 확인해주세요.',
          );
          return;
        }
        const apply = () => {
          setTokenAddress(requestedToken);
          handleRecipientChange(result.recipient);
          setAmountIsMax(false);
          setAmount(
            result.amountRaw !== undefined
              ? formatUnits(result.amountRaw, meta.decimals)
              : '',
          );
          showToast('결제 요청을 적용했습니다. 내용을 확인해주세요.', 'info');
        };
        if (known) {
          apply();
        } else {
          Alert.alert(
            '목록에 없는 토큰',
            `요청한 토큰 ${meta.symbol}은(는) 지갑의 토큰 목록에 없습니다. 이름이 같은 가짜 토큰일 수 있으니 계약 주소를 확인한 뒤 진행하세요.\n\n${requestedToken}`,
            [
              { text: '취소', style: 'cancel' },
              { text: '확인 후 계속', onPress: apply },
            ],
          );
        }
        return;
      }

      setTokenAddress(undefined);
      handleRecipientChange(result.recipient);
      if (result.amountRaw !== undefined) {
        setAmountIsMax(false);
        setAmount(formatUnits(result.amountRaw, 18));
      }
      showToast('결제 요청을 적용했습니다. 내용을 확인해주세요.', 'info');
    },
    [
      activeNetworkChainId,
      activeNetwork?.name,
      networks,
      tokenList,
      activeAddress,
      handleRecipientChange,
    ],
  );

  const handleSelectToken = useCallback((token: PickerToken) => {
    setTokenAddress(
      token.id === 'native' ? undefined : (token.id as `0x${string}`),
    );
    setAmount('');
    setAmountIsMax(false);
    setShowTokenPicker(false);
  }, []);

  const handleContinue = useCallback(async () => {
    Keyboard.dismiss();
    setIsEstimating(true);
    try {
      const next = await prepareTransfer();
      if (!mounted.current) return;
      setPlan(next);
      setStep('confirm');
    } catch (error) {
      Alert.alert(
        '오류',
        error instanceof Error ? error.message : '전송을 확인할 수 없습니다.',
      );
    } finally {
      if (mounted.current) setIsEstimating(false);
    }
  }, [prepareTransfer]);

  const handleSendTransaction = useCallback(async () => {
    if (!plan || sending.current) return;
    const snapshot = plan;
    const isAuthorized = () =>
      mounted.current &&
      currentAccount.current === snapshot.from &&
      currentChain.current === snapshot.chainId &&
      Date.now() < snapshot.expiresAt;
    if (!isAuthorized()) {
      Alert.alert(
        '다시 확인해주세요',
        '전송 정보가 만료되었거나 계정이 변경되었습니다.',
      );
      setStep('input');
      return;
    }
    sending.current = true;
    setIsSending(true);
    try {
      transferService.assertPlanIntact(snapshot);
      const hash = await signingService.sendTransaction(
        snapshot.transaction,
        snapshot.chainId,
        isAuthorized,
      );
      if (mounted.current) {
        setTxHash(hash);
        setStep('success');
      }
      addRecentAddress(snapshot.to);
      try {
        await transactionCacheService.createLocalTransaction({
          hash,
          chainId: snapshot.chainId,
          from: snapshot.from,
          to: snapshot.to,
          value: snapshot.tokenAddress ? '0' : snapshot.amount,
          valueWei: snapshot.transaction.value || '0',
          gasPrice:
            snapshot.transaction.gasPrice ||
            snapshot.transaction.maxFeePerGas ||
            '0',
          gasLimit: snapshot.transaction.gas,
          type: 'send',
          tokenSymbol: snapshot.symbol || activeNetwork?.symbol,
          tokenAmount: snapshot.amount,
          tokenAddress: snapshot.tokenAddress,
        });
        transactionTracker.reconcile();
      } catch (error) {
        console.warn('Failed to cache pending transaction:', error);
      }
      refetchBalance();
      if (snapshot.tokenAddress) refetchToken();
    } catch (error) {
      if (mounted.current)
        Alert.alert(
          '전송 실패',
          error instanceof Error ? error.message : '전송에 실패했습니다.',
        );
    } finally {
      sending.current = false;
      if (mounted.current) setIsSending(false);
    }
  }, [
    plan,
    activeNetwork?.symbol,
    addRecentAddress,
    refetchBalance,
    refetchToken,
  ]);

  // 거래의 USD 가치 (모르면 undefined → 한도 설정 시 PIN 필요)
  const planUsdValue = useMemo(() => {
    if (!plan || assetPriceUsd === null) return undefined;
    const value = Number(plan.amount) * assetPriceUsd;
    return Number.isFinite(value) ? value : undefined;
  }, [plan, assetPriceUsd]);

  const handleConfirm = useCallback(() => {
    if (requiresTransactionPin(planUsdValue)) setShowPinConfirmModal(true);
    else handleSendTransaction();
  }, [requiresTransactionPin, planUsdValue, handleSendTransaction]);

  const handlePinConfirmed = useCallback(() => {
    setShowPinConfirmModal(false);
    handleSendTransaction();
  }, [handleSendTransaction]);

  /**
   * 최대 금액: 토큰은 전체 잔액, 네이티브는 잔액 − 최대 수수료 (bigint).
   * 받는 주소가 아직 없으면 내 주소로 가스를 추정한다.
   */
  const handleMaxAmount = useCallback(async () => {
    if (tokenAddress) {
      if (tokenBalance) {
        setAmount(tokenBalance.formatted);
        setAmountIsMax(true);
      }
      return;
    }
    if (!activeAddress) return;
    setIsCalculatingMax(true);
    try {
      const estimateTo =
        resolvedRecipient && !isSelf ? resolvedRecipient : activeAddress;
      const result = await txService.calculateMaxSendable(
        activeAddress,
        estimateTo,
        activeNetworkChainId,
        undefined,
        feeSpeed,
      );
      if (!mounted.current) return;
      if (result.maxWei <= 0n) {
        showToast('수수료를 제외하면 보낼 수 있는 잔액이 없습니다.', 'warning');
        return;
      }
      setAmount(result.maxAmount);
      setAmountIsMax(true);
    } catch {
      showToast(
        '최대 금액을 계산하지 못했습니다. 네트워크를 확인해주세요.',
        'error',
      );
    } finally {
      if (mounted.current) setIsCalculatingMax(false);
    }
  }, [
    tokenAddress,
    tokenBalance,
    activeAddress,
    resolvedRecipient,
    isSelf,
    activeNetworkChainId,
    feeSpeed,
  ]);

  const handleAmountChange = useCallback((text: string) => {
    setAmount(text.replace(',', '.'));
    setAmountIsMax(false);
  }, []);

  // ── 표시용 값 ─────────────────────────────────────────────
  const amountNumber = Number(amount);
  const amountUsd =
    assetPriceUsd !== null && amount && Number.isFinite(amountNumber)
      ? amountNumber * assetPriceUsd
      : null;
  const feeUsd = (fee: string | undefined) => {
    if (!fee || nativePriceUsd === null) return null;
    const value = Number(fee) * nativePriceUsd;
    return Number.isFinite(value) ? value : null;
  };

  const pickerTokens = useMemo<PickerToken[]>(() => {
    const items: PickerToken[] = (tokenList ?? []).map(token => ({
      id: token.address,
      symbol: token.symbol,
      name: token.name,
      address: token.address === 'native' ? undefined : token.address,
      logoUrl: token.logoUrl,
      balance: formatDisplayAmount(token.balanceRaw),
      fiatValue:
        !activeNetwork?.isTestnet && token.price > 0
          ? formatFiat(token.value)
          : undefined,
    }));
    if (!items.some(item => item.id === 'native')) {
      items.unshift({
        id: 'native',
        symbol: nativeSymbol,
        name: activeNetwork?.name,
        balance: balance ? formatDisplayAmount(balance.formatted) : undefined,
      });
    }
    if (
      tokenAddress &&
      !items.some(item => item.id.toLowerCase() === tokenAddress.toLowerCase())
    ) {
      items.push({
        id: tokenAddress,
        symbol: tokenBalance?.symbol ?? '토큰',
        address: tokenAddress,
        balance: tokenBalance
          ? formatDisplayAmount(tokenBalance.formatted)
          : undefined,
      });
    }
    return items;
  }, [
    tokenList,
    activeNetwork?.isTestnet,
    activeNetwork?.name,
    formatFiat,
    nativeSymbol,
    balance,
    tokenAddress,
    tokenBalance,
  ]);

  const canContinue =
    !!resolvedRecipient &&
    !recipientError &&
    hasAmount &&
    !!preview &&
    !estimateError &&
    !isEstimating &&
    !isCalculatingMax;

  const renderRecipientStatus = () => {
    if (!trimmedInput) return null;
    if (recipientError) {
      return (
        <InlineMessage
          $tone="error"
          accessibilityRole="alert"
          testID="send-recipient-error"
        >
          <InlineMessageText>{recipientError}</InlineMessageText>
          {formatIssue === 'checksum' ? (
            <InlineHint>
              주소를 다시 복사해 붙여넣어 주세요. 한 글자라도 다르면 다른
              주소입니다.
            </InlineHint>
          ) : null}
        </InlineMessage>
      );
    }
    return (
      <>
        {isResolvingEns ? (
          <InlineMessage $tone="info" testID="send-ens-resolving">
            <InlineRow>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <InlineMessageText> ENS 이름 확인 중...</InlineMessageText>
            </InlineRow>
          </InlineMessage>
        ) : null}
        {ensCurrent?.status === 'resolved' ? (
          <InlineMessage $tone="info" testID="send-ens-resolved">
            <InlineMessageText>
              {ensCurrent.name} → 아래 주소로 보냅니다
            </InlineMessageText>
            <MonoText selectable>{ensCurrent.address}</MonoText>
          </InlineMessage>
        ) : null}
        {knownName ? (
          <AddressNameBadge testID="send-address-name-badge">
            <AddressNameText>주소록: {knownName}</AddressNameText>
          </AddressNameBadge>
        ) : null}
        {isContractRecipient ? (
          <InlineMessage
            $tone="warning"
            accessibilityRole="alert"
            testID="send-recipient-contract-warning"
          >
            <InlineMessageText>
              컨트랙트 주소입니다. 토큰을 직접 보내면 되찾지 못할 수 있습니다
            </InlineMessageText>
          </InlineMessage>
        ) : null}
        {isFirstTimeRecipient ? (
          <InlineMessage $tone="info" testID="send-recipient-first-time">
            <InlineMessageText>
              처음 보내는 주소입니다. 주소 앞뒤 글자를 받는 사람과 한 번 더
              확인해주세요.
            </InlineMessageText>
          </InlineMessage>
        ) : null}
      </>
    );
  };

  const renderInputStep = () => (
    <>
      <BadgeWrapper>
        <NetworkBadge
          label="네트워크"
          name={activeNetwork?.name}
          isTestnet={activeNetwork?.isTestnet}
          testID="send-network-badge"
        />
      </BadgeWrapper>

      <FormSection>
        <Label>보낼 자산</Label>
        <AssetSelector
          onPress={() => setShowTokenPicker(true)}
          accessibilityRole="button"
          accessibilityLabel={`보낼 자산 ${assetSymbol}, 변경`}
          testID="send-asset-button"
        >
          <AssetSymbol>{assetSymbol}</AssetSymbol>
          {tokenAddress ? (
            <AssetAddress numberOfLines={1}>
              {shortAddress(tokenAddress)}
            </AssetAddress>
          ) : (
            <AssetAddress>{activeNetwork?.name}</AssetAddress>
          )}
          <AssetChevron importantForAccessibility="no">▼</AssetChevron>
        </AssetSelector>
        {tokenAddress && tokenMetaError ? (
          <InlineMessage $tone="error" testID="send-token-error">
            <InlineMessageText>
              {tokenMetaError instanceof Error
                ? tokenMetaError.message
                : '토큰 정보를 불러오지 못했습니다.'}
            </InlineMessageText>
          </InlineMessage>
        ) : null}
      </FormSection>

      <FormSection>
        <LabelRow>
          <Label>받는 주소</Label>
          <AddressButtonRow>
            <AddressActionButton
              onPress={() => setShowAddressBook(true)}
              accessibilityRole="button"
              accessibilityLabel="주소록에서 선택"
              hitSlop={{ top: 6, bottom: 6 }}
              testID="send-address-book-button"
            >
              <AddressActionText>주소록</AddressActionText>
            </AddressActionButton>
            <AddressActionButton
              onPress={handlePasteAddress}
              accessibilityRole="button"
              accessibilityLabel="클립보드에서 주소 붙여넣기"
              hitSlop={{ top: 6, bottom: 6 }}
              testID="send-paste-button"
            >
              <AddressActionText>붙여넣기</AddressActionText>
            </AddressActionButton>
            <AddressActionButton
              onPress={() => setShowQRScanner(true)}
              accessibilityRole="button"
              accessibilityLabel="QR 코드 스캔"
              hitSlop={{ top: 6, bottom: 6 }}
              testID="send-qr-button"
            >
              <AddressActionText>QR 스캔</AddressActionText>
            </AddressActionButton>
          </AddressButtonRow>
        </LabelRow>
        <Input
          value={recipientInput}
          onChangeText={handleRecipientChange}
          placeholder="0x... 또는 ENS 이름(.eth)"
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="받는 주소"
          $invalid={!!recipientError}
          testID="send-address-input"
        />
        {renderRecipientStatus()}
      </FormSection>

      <FormSection>
        <LabelRow>
          <Label>금액 ({assetSymbol})</Label>
          <MaxButton
            onPress={handleMaxAmount}
            disabled={isCalculatingMax}
            accessibilityRole="button"
            accessibilityLabel={
              tokenAddress ? '최대 금액 입력' : '최대 금액 입력 (수수료 제외)'
            }
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            testID="send-max-button"
          >
            <MaxButtonText>
              {isCalculatingMax ? '계산중...' : '최대'}
            </MaxButtonText>
          </MaxButton>
        </LabelRow>
        <Input
          value={amount}
          onChangeText={handleAmountChange}
          placeholder="0.0"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="decimal-pad"
          accessibilityLabel={`보낼 금액 (${assetSymbol})`}
          testID="send-amount-input"
        />
        <AmountMetaRow>
          <BalanceText testID="send-balance-text">
            잔액: {assetBalance?.formatted || '0'} {assetSymbol}
          </BalanceText>
          {amount ? (
            <FiatText testID="send-amount-fiat">
              ≈ {formatFiat(amountUsd, { ignoreHidden: true })}
            </FiatText>
          ) : null}
        </AmountMetaRow>
        {amountIsMax && !tokenAddress ? (
          <HelperText>수수료를 뺀 전체 잔액을 보냅니다.</HelperText>
        ) : null}
        {tokenAddress ? (
          <HelperText>수수료는 {nativeSymbol}로 지불됩니다.</HelperText>
        ) : null}
      </FormSection>

      <FormSection>
        <Label>수수료 속도</Label>
        <FeeSpeedSelector
          value={feeSpeed}
          onChange={setFeeSpeed}
          testID="send-fee-speed"
        />
      </FormSection>

      {(isEstimating || isCalculatingMax) && (
        <GasEstimate>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <GasText>
            {isCalculatingMax ? '최대 금액 계산 중...' : '수수료 추정 중...'}
          </GasText>
        </GasEstimate>
      )}

      {preview && !isEstimating && !estimateError && (
        <GasEstimate testID="send-fee-estimate">
          <GasLabel>
            예상 최대 수수료 ({FEE_SPEED_LABELS[preview.feeSpeed]})
          </GasLabel>
          <GasValueColumn>
            <GasText>
              ~{formatDisplayAmount(preview.fee)} {nativeSymbol}
            </GasText>
            <GasFiat>
              ≈ {formatFiat(feeUsd(preview.fee), { ignoreHidden: true })}
            </GasFiat>
          </GasValueColumn>
        </GasEstimate>
      )}

      {estimateError && (
        <ErrorBox accessibilityRole="alert">
          <ErrorContent>
            <ErrorTitle>전송 확인 실패</ErrorTitle>
            <ErrorMessage>{estimateError}</ErrorMessage>
            <ErrorHint>
              주소, 수량, 잔액과 네트워크 상태를 확인해주세요.
            </ErrorHint>
          </ErrorContent>
        </ErrorBox>
      )}

      <Spacer />

      <PrimaryButton
        testID="send-continue-button"
        onPress={handleContinue}
        disabled={!canContinue}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canContinue }}
      >
        <PrimaryButtonText $disabled={!canContinue}>다음</PrimaryButtonText>
      </PrimaryButton>
    </>
  );

  const planNetwork = networks.find(
    network => network.chainId === plan?.chainId,
  );
  const confirmedSymbol = plan?.symbol || planNetwork?.symbol || assetSymbol;
  const planFeeSymbol = planNetwork?.symbol || nativeSymbol;
  const renderConfirmStep = () => (
    <>
      {/* 메인넷 경고 */}
      {!planNetwork?.isTestnet && (
        <MainnetWarningBox>
          <WarningIcon importantForAccessibility="no">🔴</WarningIcon>
          <WarningText>
            메인넷 전송입니다. 실제 {confirmedSymbol}가 전송됩니다.
          </WarningText>
        </MainnetWarningBox>
      )}

      <ConfirmCard>
        <ConfirmRow>
          <ConfirmLabel>보내는 금액</ConfirmLabel>
          <ConfirmValueColumn>
            <ConfirmValue>
              {plan?.amount || amount} {confirmedSymbol}
            </ConfirmValue>
            {planUsdValue !== undefined ? (
              <ConfirmSub>
                ≈ {formatFiat(planUsdValue, { ignoreHidden: true })}
              </ConfirmSub>
            ) : null}
          </ConfirmValueColumn>
        </ConfirmRow>
        {plan?.ensName ? (
          <ConfirmRow>
            <ConfirmLabel>받는 사람 (ENS)</ConfirmLabel>
            <ConfirmValue testID="send-confirm-ens">
              {plan.ensName}
            </ConfirmValue>
          </ConfirmRow>
        ) : null}
        <ConfirmRow>
          <ConfirmLabel>받는 주소</ConfirmLabel>
          <ConfirmAddress selectable>{plan?.to}</ConfirmAddress>
        </ConfirmRow>
        {plan?.tokenAddress && (
          <ConfirmRow>
            <ConfirmLabel>토큰 계약</ConfirmLabel>
            <ConfirmAddress selectable>{plan.tokenAddress}</ConfirmAddress>
          </ConfirmRow>
        )}
        <ConfirmRow>
          <ConfirmLabel>네트워크</ConfirmLabel>
          <ConfirmValue>
            {planNetwork?.name || activeNetwork?.name}
          </ConfirmValue>
        </ConfirmRow>
        <ConfirmRow>
          <ConfirmLabel>
            {[10, 8453, 42161].includes(plan?.chainId || 0)
              ? '최대 실행 수수료 (L1 비용 별도)'
              : '최대 수수료'}
          </ConfirmLabel>
          <ConfirmValueColumn>
            <ConfirmValue>
              {plan?.fee || '0'} {planFeeSymbol}
            </ConfirmValue>
            <ConfirmSub>
              {plan ? FEE_SPEED_LABELS[plan.feeSpeed] : ''}
              {plan && feeUsd(plan.fee) !== null
                ? ` · ≈ ${formatFiat(feeUsd(plan.fee), { ignoreHidden: true })}`
                : ''}
            </ConfirmSub>
          </ConfirmValueColumn>
        </ConfirmRow>
      </ConfirmCard>

      {isContractRecipient && plan?.to === resolvedRecipient ? (
        <InlineMessage $tone="warning" accessibilityRole="alert">
          <InlineMessageText>
            컨트랙트 주소입니다. 토큰을 직접 보내면 되찾지 못할 수 있습니다
          </InlineMessageText>
        </InlineMessage>
      ) : null}

      <WarningBox>
        <WarningIcon importantForAccessibility="no">⚠️</WarningIcon>
        <WarningText>
          전송 후에는 취소할 수 없습니다. 주소와 금액을 다시 확인해주세요.
        </WarningText>
      </WarningBox>

      <Spacer />

      <ButtonRow>
        <SecondaryButton
          onPress={() => setStep('input')}
          disabled={isSending}
          accessibilityRole="button"
          testID="send-confirm-cancel"
        >
          <SecondaryButtonText>취소</SecondaryButtonText>
        </SecondaryButton>
        <FlexButton
          testID="send-confirm-button"
          onPress={handleConfirm}
          disabled={isSending}
          accessibilityRole="button"
          accessibilityState={{ disabled: isSending, busy: isSending }}
        >
          {isSending ? (
            <ActivityIndicator color={theme.colors.onPrimary} />
          ) : (
            <PrimaryButtonText>전송</PrimaryButtonText>
          )}
        </FlexButton>
      </ButtonRow>
    </>
  );

  const goHome = useCallback(() => {
    navigation.navigate('Main', { screen: 'Home' } as never);
  }, [navigation]);

  const renderSuccessStep = () =>
    txHash ? (
      <TxSubmittedView
        testID="send-success"
        title="전송 제출 완료"
        description={
          '트랜잭션이 네트워크에 전송되었습니다.\n확인까지 몇 분 정도 소요될 수 있습니다.'
        }
        txHash={txHash}
        explorerUrl={planNetwork?.blockExplorerUrl}
        onViewDetail={() =>
          navigation.navigate('TransactionDetail', {
            txHash,
            chainId: plan?.chainId ?? activeNetworkChainId,
          })
        }
        primaryLabel="홈으로"
        onPrimary={goHome}
      />
    ) : null;

  return (
    <Screen testID="send-transaction-screen">
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        title="전송"
        testID="send-header"
        backTestID="send-back-button"
        backDisabled={isSending}
      />
      <StyledScrollView testID="send-scroll">
        <Content>
          {step === 'input' && renderInputStep()}
          {step === 'confirm' && renderConfirmStep()}
          {step === 'success' && renderSuccessStep()}
        </Content>
      </StyledScrollView>

      {/* PIN 확인 모달 (보안 설정에 따라) */}
      <PinConfirmModal
        visible={showPinConfirmModal}
        onConfirm={handlePinConfirmed}
        onCancel={() => setShowPinConfirmModal(false)}
        title="트랜잭션 확인"
        message="송금을 진행하려면 PIN을 입력하세요."
      />

      {/* 주소록 모달 */}
      <Modal
        visible={showAddressBook}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddressBook(false)}
      >
        <Screen testID="send-address-book-modal">
          <ScreenHeader
            title="받는 주소 선택"
            leftIcon="close"
            onBack={() => setShowAddressBook(false)}
            backTestID="send-address-book-close"
          />
          <AddressBookScreen
            selectionMode
            onSelectAddress={handleSelectAddressFromBook}
          />
        </Screen>
      </Modal>

      <TokenPickerModal
        visible={showTokenPicker}
        title="보낼 자산 선택"
        tokens={pickerTokens}
        selectedId={tokenAddress ?? 'native'}
        isLoading={tokensLoading}
        error={
          tokensError
            ? tokensError instanceof Error
              ? tokensError.message
              : '토큰 목록을 불러오지 못했습니다.'
            : null
        }
        onRetry={() => refetchTokens()}
        onSelect={handleSelectToken}
        onClose={() => setShowTokenPicker(false)}
        testID="send-token-picker"
      />

      <QRScanner
        visible={showQRScanner}
        onClose={() => setShowQRScanner(false)}
        onScan={handleQRScan}
        mode="address"
        title="주소 또는 결제 요청 스캔"
      />
    </Screen>
  );
}

const StyledScrollView = styled(ScrollView).attrs({
  contentContainerStyle: { flexGrow: 1 },
  automaticallyAdjustKeyboardInsets: Platform.OS === 'ios',
  keyboardDismissMode: Platform.OS === 'ios' ? 'on-drag' : undefined,
  keyboardShouldPersistTaps: 'handled',
})``;

const Content = styled.View`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.lg}px;
  padding-top: ${({ theme }) => theme.spacing.sm}px;
`;

const BadgeWrapper = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const FormSection = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const Label = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const LabelRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const AssetSelector = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  min-height: 52px;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.surface};
`;

const AssetSymbol = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-weight: 600;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const AssetAddress = styled.Text`
  flex: 1;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
`;

const AssetChevron = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 10px;
`;

const AddressButtonRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.sm}px;
`;

const AddressActionButton = styled.TouchableOpacity`
  min-height: 32px;
  justify-content: center;
  padding: 0 ${({ theme }) => theme.spacing.sm}px;
  background-color: ${({ theme }) => theme.colors.primarySubtle};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
`;

const AddressActionText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  font-weight: 600;
`;

const MaxButton = styled.TouchableOpacity`
  min-height: 32px;
  justify-content: center;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme }) => theme.colors.primarySubtle};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
`;

const MaxButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  font-weight: 600;
`;

const Input = styled.TextInput<{ $invalid?: boolean }>`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  border-width: 1px;
  border-color: ${({ theme, $invalid }) =>
    $invalid ? theme.colors.error : theme.colors.border};
`;

const AmountMetaRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const BalanceText = styled.Text`
  flex: 1;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
`;

const FiatText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-left: ${({ theme }) => theme.spacing.sm}px;
`;

const HelperText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const InlineMessage = styled.View<{ $tone: 'error' | 'warning' | 'info' }>`
  margin-top: ${({ theme }) => theme.spacing.sm}px;
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  border-left-width: 3px;
  border-left-color: ${({ theme, $tone }) =>
    $tone === 'error'
      ? theme.colors.error
      : $tone === 'warning'
      ? theme.colors.warning
      : theme.colors.primary};
  background-color: ${({ theme, $tone }) =>
    $tone === 'error'
      ? theme.colors.errorSubtle
      : $tone === 'warning'
      ? theme.colors.warningSubtle
      : theme.colors.primarySubtle};
`;

const InlineRow = styled.View`
  flex-direction: row;
  align-items: center;
`;

const InlineMessageText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 13px;
  line-height: 19px;
`;

const InlineHint = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
  line-height: 17px;
  margin-top: 2px;
`;

const MonoText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-family: monospace;
  font-size: 12px;
  margin-top: 4px;
`;

const GasEstimate = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md}px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const GasLabel = styled.Text`
  flex: 1;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
`;

const GasValueColumn = styled.View`
  align-items: flex-end;
`;

const GasText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
`;

const GasFiat = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-top: 2px;
`;

const Spacer = styled.View`
  flex: 1;
`;

const PrimaryButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  background-color: ${({ theme, disabled }) =>
    disabled ? theme.colors.disabledBackground : theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  min-height: 48px;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
`;

const PrimaryButtonText = styled.Text<{ $disabled?: boolean }>`
  color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.disabledText : theme.colors.onPrimary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

const SecondaryButton = styled.TouchableOpacity`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  min-height: 48px;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const SecondaryButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

const ButtonRow = styled.View`
  flex-direction: row;
`;

const FlexButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  flex: 1;
  background-color: ${({ theme, disabled }) =>
    disabled ? theme.colors.disabledBackground : theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  min-height: 48px;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
`;

const ConfirmCard = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.lg}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const ConfirmRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.sm}px 0;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const ConfirmLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
`;

const ConfirmValueColumn = styled.View`
  flex-shrink: 1;
  align-items: flex-end;
  margin-left: ${({ theme }) => theme.spacing.md}px;
`;

const ConfirmValue = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
  text-align: right;
`;

const ConfirmSub = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  margin-top: 2px;
`;

const ConfirmAddress = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  flex: 1;
  text-align: right;
  margin-left: ${({ theme }) => theme.spacing.md}px;
`;

const WarningBox = styled.View`
  flex-direction: row;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-top: ${({ theme }) => theme.spacing.md}px;
  border-left-width: 4px;
  border-left-color: ${({ theme }) => theme.colors.warning};
`;

const WarningIcon = styled.Text`
  font-size: 20px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const WarningText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  flex: 1;
`;

const ErrorBox = styled.View`
  flex-direction: row;
  background-color: ${({ theme }) => theme.colors.errorSubtle};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const ErrorContent = styled.View`
  flex: 1;
`;

const ErrorTitle = styled.Text`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const ErrorMessage = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const ErrorHint = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 18px;
`;

const MainnetWarningBox = styled.View`
  flex-direction: row;
  background-color: ${({ theme }) => theme.colors.errorSubtle};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
`;

const AddressNameBadge = styled.View`
  background-color: ${({ theme }) => theme.colors.primarySubtle};
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
  align-self: flex-start;
`;

const AddressNameText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 12px;
  font-weight: 600;
`;

export default SendTransactionScreen;
