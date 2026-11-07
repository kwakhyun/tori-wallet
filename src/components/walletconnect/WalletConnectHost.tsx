/**
 * WalletConnect 전역 호스트
 *
 * RootNavigator의 메인 스택과 함께 마운트되어, 어느 화면에 있든 dApp의 연결 제안과
 * 서명/네트워크 전환 요청을 처리한다.
 *
 * - 지갑이 있으면 WalletConnect를 초기화해 저장된 세션의 요청을 받는다.
 * - 잠금 중에는 서비스 구독을 해제해 요청이 서비스 큐에서 기다리게 하고, 어떤
 *   서명 모달도 띄우지 않는다. 잠금 해제 후 대기 요청을 보여주며, 그 사이 만료된
 *   요청은 거절하고 토스트로 알린다.
 * - 서명 흐름(의도 지문, PIN 승인 사본 바인딩, 서명 직전 재검증)은 승인 시점의
 *   요청 사본에만 서명하도록 유지한다.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { useWalletStore, type Network, type Wallet } from '@/store/walletStore';
import { useSecurityStore } from '@/store/securityStore';
import { showToast } from '@/store/toastStore';
import {
  wcService,
  analyzeProposal,
  parseCaipChainId,
  CHAIN_METHODS,
  DEFAULT_REQUEST_TTL_MS,
  WC_NOT_CONFIGURED_MESSAGE,
  type DAppVerification,
  type SessionProposal,
  type SessionRequest,
  type SessionsChangedEvent,
  type WCExpiredNotice,
} from '@/services/wcService';
import { signingService } from '@/services/signingService';
import { prepareSigningRequest } from '@/services/signingReviewService';
import {
  analyzeSigningRequest,
  assertSigningIntentUnchanged,
} from '@/services/signingIntentService';
import { wcLogService } from '@/realm/services';
import { SignRequestModal } from '@/components/SignRequestModal';
import PinConfirmModal from '@/components/common/PinConfirmModal';
import {
  startDeepLinkCapture,
  useDeepLinks,
  type DeepLinkAction,
} from '@/hooks/useDeepLinks';
import { createLogger } from '@/utils/logger';
import { ProposalModal } from './ProposalModal';
import { ChainSwitchModal } from './ChainSwitchModal';
import {
  computeExpiresAt,
  describeMethods,
  describeUnsupported,
  estimateUsdValue,
  getRequestAccount,
  parseRequestedChainId,
  MAX_QUEUED_REQUESTS,
  REVIEW_WINDOW_MS,
  type DAppInfo,
  type QueuedChainRequest,
  type QueuedItem,
  type QueuedSignRequest,
} from './requestReview';

const logger = createLogger('WalletConnect');

// 메인 스택이 마운트되기 전(콜드 스타트 잠금 화면)에 도착한 딥링크도 보관한다.
startDeepLinkCapture();

interface PendingProposal {
  proposal: SessionProposal;
  verification: DAppVerification;
  expiresAt: number;
}

const EMPTY_WALLETS: Wallet[] = [];
const EMPTY_NETWORKS: Network[] = [];

function proposalExpiresAt(proposal: SessionProposal): number {
  const expiryTimestamp = (proposal.params as { expiryTimestamp?: number })
    ?.expiryTimestamp;
  return computeExpiresAt(expiryTimestamp, DEFAULT_REQUEST_TTL_MS);
}

function errorMessage(error: unknown): string | null {
  return error instanceof Error && error.message ? error.message : null;
}

export function WalletConnectHost(): React.JSX.Element | null {
  const {
    hasWallet,
    isLocked,
    wallets,
    activeWalletIndex,
    activeNetworkChainId,
    networks,
    setActiveNetwork,
  } = useWalletStore(
    useShallow(state => ({
      hasWallet: state.hasWallet,
      isLocked: state.isLocked,
      wallets: state.wallets,
      activeWalletIndex: state.activeWalletIndex,
      activeNetworkChainId: state.activeNetworkChainId,
      networks: state.networks,
      setActiveNetwork: state.setActiveNetwork,
    })),
  );
  const { requiresTransactionPin } = useSecurityStore(
    useShallow(state => ({
      requiresTransactionPin: state.requiresTransactionPin,
    })),
  );
  const walletList = Array.isArray(wallets) ? wallets : EMPTY_WALLETS;
  const networkList = Array.isArray(networks) ? networks : EMPTY_NETWORKS;
  const activeWallet = walletList[activeWalletIndex ?? 0];
  const locked = !hasWallet || isLocked !== false;

  // 비동기 처리 중에도 최신 값을 읽도록 ref에 보관한다.
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const activeWalletRef = useRef(activeWallet);
  activeWalletRef.current = activeWallet;
  const networksRef = useRef(networkList);
  networksRef.current = networkList;
  const activeChainRef = useRef(activeNetworkChainId);
  activeChainRef.current = activeNetworkChainId;
  const setActiveNetworkRef = useRef(setActiveNetwork);
  setActiveNetworkRef.current = setActiveNetwork;

  const alive = useRef(true);
  const [queue, setQueue] = useState<QueuedItem[]>([]);
  const queueRef = useRef<QueuedItem[]>([]);
  const [proposals, setProposals] = useState<PendingProposal[]>([]);
  const proposalsRef = useRef<PendingProposal[]>([]);
  const approvedRequest = useRef<QueuedSignRequest | null>(null);
  const signing = useRef(false);
  const [isSigning, setIsSigning] = useState(false);
  const [showSignPinConfirm, setShowSignPinConfirm] = useState(false);
  const [isApprovingSession, setIsApprovingSession] = useState(false);
  const [isSwitchingChain, setIsSwitchingChain] = useState(false);

  const updateQueue = useCallback((next: QueuedItem[]) => {
    queueRef.current = next;
    if (alive.current) setQueue(next);
  }, []);

  const removeItem = useCallback(
    (item: { id: number; topic: string }) => {
      updateQueue(
        queueRef.current.filter(
          queued => queued.id !== item.id || queued.topic !== item.topic,
        ),
      );
    },
    [updateQueue],
  );

  const updateProposals = useCallback((next: PendingProposal[]) => {
    proposalsRef.current = next;
    if (alive.current) setProposals(next);
  }, []);

  const removeProposal = useCallback(
    (id: number) => {
      updateProposals(
        proposalsRef.current.filter(item => item.proposal.id !== id),
      );
    },
    [updateProposals],
  );

  /** 진행 중인 PIN 승인을 취소한다 (실제 서명이 시작된 경우 제외). */
  const cancelPendingApproval = useCallback(
    (match?: { id: number; topic: string }) => {
      const approved = approvedRequest.current;
      if (!approved || signing.current) return;
      if (match && (approved.id !== match.id || approved.topic !== match.topic))
        return;
      approvedRequest.current = null;
      if (alive.current) setShowSignPinConfirm(false);
    },
    [],
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      approvedRequest.current = null;
      // 지갑 삭제 등으로 호스트가 사라지면 남은 요청은 더 이상 처리할 수 없다.
      queueRef.current.forEach(item => {
        wcService
          .rejectRequest(item.topic, item.id)
          .catch(error => logger.warn('Request cleanup failed', error));
      });
      queueRef.current = [];
      proposalsRef.current.forEach(item => {
        wcService
          .rejectSession(item.proposal)
          .catch(error => logger.warn('Proposal cleanup failed', error));
      });
      proposalsRef.current = [];
    };
  }, []);

  // 잠기면 진행 중인 PIN 승인을 취소한다 (잠금 시 서명 세션도 폐기된다).
  useEffect(() => {
    if (locked) cancelPendingApproval();
  }, [locked, cancelPendingApproval]);

  // 지갑이 있으면 앱 시작 시 초기화해 저장된 세션의 요청을 받는다.
  useEffect(() => {
    if (!hasWallet) return;
    wcService
      .initialize()
      .catch(error =>
        logger.warn('WalletConnect initialization failed', error),
      );
  }, [hasWallet]);

  // ---------------------------------------------------------------------------
  // 수신 처리
  // ---------------------------------------------------------------------------

  const rejectUnsafe = async (
    request: SessionRequest,
    dAppName: string,
    error: unknown,
  ) => {
    await wcService
      .rejectRequest(request.topic, request.id)
      .catch(reason => logger.warn('Request rejection failed', reason));
    logger.warn('Rejected request that could not be safely reviewed', error);
    const reason = errorMessage(error);
    showToast(
      `${dAppName} 요청을 안전하게 확인할 수 없어 자동으로 거부했습니다.${
        reason ? ` (${reason})` : ''
      }`,
      'error',
      5000,
    );
  };

  const handleChainRequest = async (
    request: SessionRequest,
    method: QueuedChainRequest['method'],
    requestChainId: number | null,
    args: unknown[],
    dApp: DAppInfo,
  ) => {
    const { topic, id } = request;
    const target = parseRequestedChainId(args);
    if (!requestChainId || !target) {
      await wcService
        .rejectRequest(topic, id, { code: -32602, message: 'Invalid params' })
        .catch(reason => logger.warn('Request rejection failed', reason));
      showToast(
        `${dApp.name}의 네트워크 요청 형식이 올바르지 않아 거부했습니다.`,
        'warning',
        4000,
      );
      return;
    }
    if (!wcService.validateSessionMethod(topic, requestChainId, method)) {
      await rejectUnsafe(
        request,
        dApp.name,
        new Error('승인되지 않은 세션 요청입니다.'),
      );
      return;
    }
    const network = networksRef.current.find(item => item.chainId === target);
    if (!network) {
      await wcService
        .rejectRequest(topic, id, {
          code: 4902,
          message: 'Unrecognized chain ID',
        })
        .catch(reason => logger.warn('Request rejection failed', reason));
      showToast(
        method === 'wallet_addEthereumChain'
          ? `${dApp.name}의 네트워크 추가 요청을 거부했습니다. 토리월렛은 기본 제공 네트워크만 지원합니다.`
          : `${dApp.name}이(가) 지원하지 않는 네트워크(체인 ${target})로 전환을 요청해 거부했습니다.`,
        'warning',
        5000,
      );
      return;
    }
    const address = activeWalletRef.current?.address;
    if (
      target === activeChainRef.current &&
      wcService.sessionHasChain(topic, target)
    ) {
      // 이미 해당 네트워크: 확인 없이 성공 응답하고 dApp 상태만 맞춘다.
      await wcService
        .respondRequest(topic, id, null)
        .catch(reason => logger.warn('Chain response failed', reason));
      if (address) {
        wcService
          .emitChainChangedToSession(topic, target, address)
          .catch(reason => logger.warn('chainChanged failed', reason));
      }
      return;
    }
    if (queueRef.current.some(item => item.id === id && item.topic === topic))
      return;
    if (queueRef.current.length >= MAX_QUEUED_REQUESTS) {
      await rejectUnsafe(
        request,
        dApp.name,
        new Error('대기 중인 요청이 너무 많습니다.'),
      );
      return;
    }
    const queued: QueuedChainRequest = {
      type: 'chain',
      id,
      topic,
      method,
      requestChainId,
      targetChainId: target,
      targetNetworkName: network.name,
      expiresAt: computeExpiresAt(
        request.params.request.expiryTimestamp,
        REVIEW_WINDOW_MS.other,
      ),
      dApp,
    };
    updateQueue([...queueRef.current, queued]);
  };

  const handleRequest = async (request: SessionRequest) => {
    logger.debug('Session request received:', request.params?.request?.method);
    const { topic, params } = request;
    const { request: requestParams } = params;
    const session = wcService.getSessionMetadata(topic);
    const dAppName = session?.name || 'dApp';
    const verification = wcService.getDAppVerification(request.verifyContext);
    if (wcService.isVerificationBlocked(verification)) {
      await wcService
        .rejectRequest(topic, request.id)
        .catch(reason => logger.warn('Request rejection failed', reason));
      logger.warn('Rejected request from invalid or known scam origin');
      showToast(
        `${dAppName}: 위험한 출처로 확인된 요청을 차단했습니다.`,
        'error',
        5000,
      );
      return;
    }
    if (
      requestParams.expiryTimestamp !== undefined &&
      requestParams.expiryTimestamp <= Math.floor(Date.now() / 1000)
    ) {
      await wcService
        .rejectRequest(topic, request.id)
        .catch(reason => logger.warn('Request rejection failed', reason));
      logger.warn('Rejected expired session request');
      showToast(
        `${dAppName} 요청이 만료되어 자동으로 거부되었습니다.`,
        'warning',
        4000,
      );
      return;
    }
    const requestChainId = parseCaipChainId(params.chainId);
    if (!Array.isArray(requestParams.params)) {
      await rejectUnsafe(
        request,
        dAppName,
        new Error('요청 파라미터가 올바르지 않습니다.'),
      );
      return;
    }
    const requestArguments = JSON.parse(
      JSON.stringify(requestParams.params),
    ) as unknown[];
    const dApp: DAppInfo = {
      name: dAppName,
      url: session?.url || '',
      verification,
    };

    if ((CHAIN_METHODS as readonly string[]).includes(requestParams.method)) {
      await handleChainRequest(
        request,
        requestParams.method as QueuedChainRequest['method'],
        requestChainId,
        requestArguments,
        dApp,
      );
      return;
    }

    const requestAccount = getRequestAccount(
      requestParams.method,
      requestArguments,
    );
    if (!requestChainId || !requestAccount) {
      await rejectUnsafe(
        request,
        dAppName,
        new Error('요청 형식이 올바르지 않습니다.'),
      );
      return;
    }

    try {
      if (
        !wcService.validateSessionRequest(
          topic,
          requestChainId,
          requestAccount,
          requestParams.method,
        )
      ) {
        throw new Error('승인되지 않은 세션 요청입니다.');
      }
      const prepared = await prepareSigningRequest({
        method: requestParams.method,
        params: requestArguments,
        chainId: requestChainId,
        account: requestAccount,
      });
      const intent = analyzeSigningRequest(prepared);
      const usdValue = await estimateUsdValue(prepared);
      if (!alive.current) {
        await wcService
          .rejectRequest(topic, request.id)
          .catch(reason => logger.warn('Request rejection failed', reason));
        return;
      }
      if (
        queueRef.current.some(
          item => item.id === request.id && item.topic === topic,
        )
      )
        return;
      if (queueRef.current.length >= MAX_QUEUED_REQUESTS)
        throw new Error('대기 중인 서명 요청이 너무 많습니다.');
      const queued: QueuedSignRequest = {
        ...prepared,
        type: 'sign',
        id: request.id,
        topic,
        intent,
        usdValue,
        expiresAt: computeExpiresAt(
          requestParams.expiryTimestamp,
          intent.kind === 'transaction'
            ? REVIEW_WINDOW_MS.transaction
            : REVIEW_WINDOW_MS.other,
        ),
        dApp,
      };
      updateQueue([...queueRef.current, queued]);
    } catch (error) {
      await rejectUnsafe(request, dAppName, error);
    }
  };

  const handleProposal = async (proposal: SessionProposal) => {
    logger.debug('Session proposal received');
    const verification = wcService.getDAppVerification(proposal.verifyContext);
    const name = proposal.params?.proposer?.metadata?.name || 'dApp';
    if (wcService.isVerificationBlocked(verification)) {
      await wcService
        .rejectSession(proposal)
        .catch(reason => logger.warn('Proposal rejection failed', reason));
      Alert.alert(
        '위험한 연결 차단',
        verification.isScam
          ? 'WalletConnect가 피싱 또는 사기 사이트로 식별했습니다.'
          : 'dApp이 주장한 주소와 검증된 출처가 일치하지 않습니다.',
      );
      return;
    }
    const analysis = analyzeProposal(
      proposal,
      networksRef.current.map(network => network.chainId),
      activeChainRef.current,
    );
    if (!analysis.canApprove) {
      await wcService
        .rejectSession(
          proposal,
          analysis.unsupportedNamespaces.length > 0
            ? 'UNSUPPORTED_NAMESPACE_KEY'
            : 'UNSUPPORTED_CHAINS',
        )
        .catch(reason => logger.warn('Proposal rejection failed', reason));
      const unsupported = [
        describeUnsupported([
          ...analysis.unsupportedRequiredChains,
          ...analysis.unsupportedNamespaces,
        ]),
        analysis.unsupportedRequiredMethods.join(', '),
      ]
        .filter(Boolean)
        .join(', ');
      const networkProblem =
        analysis.unsupportedRequiredChains.length > 0 ||
        analysis.unsupportedNamespaces.length > 0;
      Alert.alert(
        '연결할 수 없는 dApp',
        `${name}이(가) 토리월렛이 지원하지 않는 ${
          networkProblem ? '네트워크' : '기능'
        }를 필수로 요구해 연결을 거부했습니다.${
          unsupported ? `\n\n지원하지 않는 항목: ${unsupported}` : ''
        }`,
      );
      return;
    }
    if (proposalsRef.current.some(item => item.proposal.id === proposal.id))
      return;
    updateProposals([
      ...proposalsRef.current,
      { proposal, verification, expiresAt: proposalExpiresAt(proposal) },
    ]);
  };

  const handleExpired = (notice: WCExpiredNotice) => {
    if (notice.kind === 'request') {
      const inQueue = queueRef.current.some(item => item.id === notice.id);
      if (inQueue) {
        queueRef.current
          .filter(item => item.id === notice.id)
          .forEach(item => cancelPendingApproval(item));
        updateQueue(queueRef.current.filter(item => item.id !== notice.id));
      }
      if (inQueue || notice.source === 'buffer') {
        showToast(
          `${notice.dAppName} 요청이 만료되어 자동으로 거부되었습니다.`,
          'warning',
          4000,
        );
      }
      return;
    }
    const inQueue = proposalsRef.current.some(
      item => item.proposal.id === notice.id,
    );
    if (inQueue) removeProposal(notice.id);
    if (inQueue || notice.source === 'buffer') {
      showToast(
        `${notice.dAppName}의 연결 요청이 만료되었습니다. dApp에서 다시 연결해주세요.`,
        'warning',
        4000,
      );
    }
  };

  const handleRequestRef = useRef(handleRequest);
  handleRequestRef.current = handleRequest;
  const handleProposalRef = useRef(handleProposal);
  handleProposalRef.current = handleProposal;
  const handleExpiredRef = useRef(handleExpired);
  handleExpiredRef.current = handleExpired;

  // 잠금 해제 상태에서만 구독한다. 잠긴 동안 도착한 요청은 서비스 큐에서 기다린다.
  useEffect(() => {
    if (locked) return;
    const unsubscribers = [
      wcService.onSessionProposal(proposal => {
        handleProposalRef.current(proposal);
      }),
      wcService.onSessionRequest(request => {
        handleRequestRef.current(request);
      }),
      wcService.onExpired(notice => handleExpiredRef.current(notice)),
    ];
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [locked]);

  // dApp이 연결을 끊으면 알리고, 그 세션의 대기 요청을 정리한다.
  useEffect(
    () =>
      wcService.onSessionsChanged((event: SessionsChangedEvent) => {
        if (
          event.reason !== 'deleted_by_peer' &&
          event.reason !== 'disconnected'
        )
          return;
        if (event.topic) {
          const stale = queueRef.current.filter(
            item => item.topic === event.topic,
          );
          if (stale.length > 0) {
            stale.forEach(item => cancelPendingApproval(item));
            updateQueue(
              queueRef.current.filter(item => item.topic !== event.topic),
            );
          }
        }
        if (event.reason === 'deleted_by_peer') {
          showToast('dApp이 연결을 해제했습니다', 'info');
          if (event.topic) {
            wcLogService
              .logSessionDisconnected(event.topic)
              .catch(error => logger.warn('Session log failed', error));
          }
        }
      }),
    [cancelPendingApproval, updateQueue],
  );

  // 앱에서 네트워크/계정을 바꾸면 해당 체인을 포함한 세션에 알린다.
  const lastEmitted = useRef<{ chainId: number; address?: string } | null>(
    null,
  );
  const activeAddress = activeWallet?.address;
  useEffect(() => {
    const previous = lastEmitted.current;
    lastEmitted.current = {
      chainId: activeNetworkChainId,
      address: activeAddress,
    };
    if (!previous || !wcService.isReady()) return;
    if (previous.chainId !== activeNetworkChainId) {
      wcService
        .emitChainChanged(activeNetworkChainId, activeAddress)
        .catch(error => logger.warn('chainChanged emit failed', error));
    } else if (
      activeAddress &&
      previous.address?.toLowerCase() !== activeAddress.toLowerCase()
    ) {
      wcService
        .emitAccountsChanged(activeAddress)
        .catch(error => logger.warn('accountsChanged emit failed', error));
    }
  }, [activeNetworkChainId, activeAddress]);

  // 만료된 요청/제안 정리 (잠금 중에는 미루고, 해제 직후 알린다)
  const sweepExpired = () => {
    const now = Date.now();
    const expired = queueRef.current.filter(
      item =>
        item.expiresAt !== undefined &&
        item.expiresAt <= now &&
        !(
          signing.current &&
          approvedRequest.current?.id === item.id &&
          approvedRequest.current?.topic === item.topic
        ),
    );
    if (expired.length > 0) {
      expired.forEach(item => {
        cancelPendingApproval(item);
        wcService
          .rejectRequest(item.topic, item.id)
          .catch(error =>
            logger.warn('Expired request rejection failed', error),
          );
      });
      updateQueue(queueRef.current.filter(item => !expired.includes(item)));
      showToast(
        expired.length === 1
          ? `${expired[0].dApp.name} 요청이 시간 초과로 자동 거부되었습니다.`
          : `dApp 요청 ${expired.length}건이 시간 초과로 자동 거부되었습니다.`,
        'warning',
        4000,
      );
    }
    const expiredProposals = proposalsRef.current.filter(
      item => item.expiresAt <= now,
    );
    if (expiredProposals.length > 0) {
      expiredProposals.forEach(item => {
        wcService
          .rejectSession(item.proposal)
          .catch(error =>
            logger.warn('Expired proposal rejection failed', error),
          );
      });
      updateProposals(
        proposalsRef.current.filter(item => !expiredProposals.includes(item)),
      );
      showToast(
        '연결 요청이 만료되었습니다. dApp에서 다시 연결해주세요.',
        'warning',
        4000,
      );
    }
  };
  const sweepRef = useRef(sweepExpired);
  sweepRef.current = sweepExpired;
  const hasPending = queue.length > 0 || proposals.length > 0;
  useEffect(() => {
    if (!hasPending || locked) return;
    sweepRef.current();
    const timer = setInterval(() => sweepRef.current(), 1000);
    return () => clearInterval(timer);
  }, [hasPending, locked]);

  // 딥링크로 받은 WalletConnect URI는 잠금 해제 후 자동으로 페어링한다.
  const handleDeepLink = useCallback((action: DeepLinkAction) => {
    if (action.kind === 'wake') return;
    if (action.kind === 'invalid') {
      showToast(action.reason, 'error', 5000);
      return;
    }
    if (!wcService.isConfigured()) {
      showToast(WC_NOT_CONFIGURED_MESSAGE, 'error', 5000);
      return;
    }
    showToast('dApp 연결 요청을 불러오는 중입니다…', 'info');
    wcService
      .pairWithUri(action.uri)
      .catch(error =>
        showToast(errorMessage(error) || '연결에 실패했습니다.', 'error', 5000),
      );
  }, []);
  useDeepLinks(!locked, handleDeepLink);

  // ---------------------------------------------------------------------------
  // 서명 요청
  // ---------------------------------------------------------------------------

  // PIN 인증에는 승인 버튼을 눌렀을 때의 요청 사본만 연결한다.
  const executeSignRequest = useCallback(
    async (snapshot: QueuedSignRequest) => {
      if (signing.current || approvedRequest.current !== snapshot) return;
      signing.current = true;
      setIsSigning(true);
      const isAuthorized = () =>
        alive.current &&
        !lockedRef.current &&
        approvedRequest.current === snapshot &&
        activeWalletRef.current?.address.toLowerCase() ===
          snapshot.account.toLowerCase() &&
        Date.now() < (snapshot.expiresAt ?? 0) &&
        wcService.validateSessionRequest(
          snapshot.topic,
          snapshot.chainId,
          snapshot.account,
          snapshot.method,
        );
      try {
        if (!isAuthorized())
          throw new Error(
            '서명 승인이 만료되었거나 계정이 변경되었습니다. 요청을 다시 확인해주세요.',
          );
        assertSigningIntentUnchanged(snapshot.intent.fingerprint, snapshot);
        await wcLogService.logRequest({
          sessionTopic: snapshot.topic,
          requestId: snapshot.id,
          method: snapshot.method,
          params: snapshot.params,
          chainId: snapshot.chainId,
          dappName: snapshot.dApp.name,
        });
        if (!isAuthorized()) throw new Error('서명 승인이 취소되었습니다.');
        const result = await signingService.handleRequest(
          snapshot.method,
          snapshot.params,
          snapshot.chainId,
          isAuthorized,
        );
        await wcService.respondRequest(snapshot.topic, snapshot.id, result);
        if (alive.current)
          showToast(
            snapshot.method === 'eth_sendTransaction'
              ? '트랜잭션을 네트워크에 제출했습니다.'
              : '서명을 완료했습니다.',
            'success',
          );
      } catch (error) {
        await wcService
          .rejectRequest(snapshot.topic, snapshot.id)
          .catch(reason => logger.warn('Request rejection failed', reason));
        if (alive.current)
          Alert.alert(
            '서명 실패',
            errorMessage(error) || '서명 처리에 실패했습니다.',
          );
      } finally {
        if (approvedRequest.current === snapshot)
          approvedRequest.current = null;
        signing.current = false;
        if (alive.current) setIsSigning(false);
        removeItem(snapshot);
      }
    },
    [removeItem],
  );

  const handleApproveSignRequest = useCallback(() => {
    const current = queueRef.current[0];
    if (
      !current ||
      current.type !== 'sign' ||
      current.intent.blocked ||
      approvedRequest.current ||
      lockedRef.current
    )
      return;
    const snapshot: QueuedSignRequest = JSON.parse(JSON.stringify(current));
    approvedRequest.current = snapshot;
    // 거래 한도 정책: 계산 가능한 eth_sendTransaction의 USD 가치를 전달한다.
    const usdValue =
      snapshot.method === 'eth_sendTransaction' ? snapshot.usdValue : undefined;
    if (requiresTransactionPin(usdValue)) setShowSignPinConfirm(true);
    else executeSignRequest(snapshot);
  }, [executeSignRequest, requiresTransactionPin]);

  const handleSignPinConfirmed = useCallback(() => {
    const snapshot = approvedRequest.current;
    setShowSignPinConfirm(false);
    if (snapshot) executeSignRequest(snapshot);
  }, [executeSignRequest]);

  const handleSignPinCancelled = useCallback(() => {
    approvedRequest.current = null;
    setShowSignPinConfirm(false);
  }, []);

  const handleRejectSignRequest = useCallback(async () => {
    const current = queueRef.current[0];
    if (!current || current.type !== 'sign' || signing.current) return;
    approvedRequest.current = null;
    try {
      await wcService.rejectRequest(current.topic, current.id);
    } catch (error) {
      logger.warn('Failed to reject request', error);
    }
    removeItem(current);
  }, [removeItem]);

  // ---------------------------------------------------------------------------
  // 네트워크 전환 요청
  // ---------------------------------------------------------------------------

  const handleApproveChainRequest = useCallback(async () => {
    const current = queueRef.current[0];
    if (!current || current.type !== 'chain' || lockedRef.current) return;
    setIsSwitchingChain(true);
    try {
      const address = activeWalletRef.current?.address;
      if (!address) throw new Error('활성 계정이 없습니다.');
      const network = networksRef.current.find(
        item => item.chainId === current.targetChainId,
      );
      if (!network) throw new Error('지원하지 않는 네트워크입니다.');
      if (
        !wcService.validateSessionMethod(
          current.topic,
          current.requestChainId,
          current.method,
        )
      )
        throw new Error('dApp 연결이 해제되었거나 권한이 없습니다.');
      const ready = await wcService.ensureSessionChain(
        current.topic,
        current.targetChainId,
        address,
      );
      if (!ready)
        throw new Error('이 dApp 연결에 네트워크를 추가하지 못했습니다.');
      setActiveNetworkRef.current?.(current.targetChainId);
      await wcService.respondRequest(current.topic, current.id, null);
      await wcService.emitChainChangedToSession(
        current.topic,
        current.targetChainId,
        address,
      );
      showToast(`${network.name}(으)로 전환했습니다.`, 'success');
    } catch (error) {
      await wcService
        .rejectRequest(current.topic, current.id)
        .catch(reason => logger.warn('Request rejection failed', reason));
      showToast(
        errorMessage(error) || '네트워크를 전환하지 못했습니다.',
        'error',
        4000,
      );
    } finally {
      if (alive.current) setIsSwitchingChain(false);
      removeItem(current);
    }
  }, [removeItem]);

  const handleRejectChainRequest = useCallback(async () => {
    const current = queueRef.current[0];
    if (!current || current.type !== 'chain') return;
    await wcService
      .rejectRequest(current.topic, current.id)
      .catch(error => logger.warn('Failed to reject request', error));
    removeItem(current);
  }, [removeItem]);

  // ---------------------------------------------------------------------------
  // 세션 제안
  // ---------------------------------------------------------------------------

  const handleApproveSession = useCallback(
    async (acknowledged: boolean) => {
      const current = proposalsRef.current[0];
      const wallet = activeWalletRef.current;
      if (!current || !wallet || lockedRef.current) return;
      const { proposal, verification } = current;
      setIsApprovingSession(true);
      try {
        if (
          wcService.isVerificationBlocked(verification) ||
          (verification.validation !== 'VALID' && !acknowledged)
        ) {
          throw new Error('검증되지 않은 dApp 연결 확인이 필요합니다.');
        }
        const analysis = analyzeProposal(
          proposal,
          networksRef.current.map(network => network.chainId),
          activeChainRef.current,
        );
        if (!analysis.canApprove)
          throw new Error('지원하지 않는 네트워크가 포함된 연결 요청입니다.');
        const session = await wcService.approveSession(
          proposal,
          wallet.address,
          analysis.approvedChainIds,
        );
        const proposer = proposal.params.proposer.metadata;
        if (session?.topic) {
          wcLogService
            .logSessionConnected({
              topic: session.topic,
              dappName: proposer.name,
              dappUrl: proposer.url,
              dappIcon: proposer.icons?.[0],
              chains: analysis.approvedChainIds.map(id => `eip155:${id}`),
              accounts: [wallet.address],
              expiresAt: session.expiry
                ? new Date(session.expiry * 1000)
                : undefined,
            })
            .catch(error => logger.warn('Session log failed', error));
        }
        removeProposal(proposal.id);
        showToast(`${proposer.name}에 연결되었습니다.`, 'success');
      } catch (error) {
        logger.error('Failed to approve session:', error);
        removeProposal(proposal.id);
        wcService
          .rejectSession(proposal)
          .catch(reason => logger.warn('Proposal rejection failed', reason));
        Alert.alert(
          '연결 실패',
          errorMessage(error) && /검증|지원/.test(errorMessage(error) || '')
            ? (errorMessage(error) as string)
            : '세션 승인에 실패했습니다. dApp에서 다시 연결해주세요.',
        );
      } finally {
        if (alive.current) setIsApprovingSession(false);
      }
    },
    [removeProposal],
  );

  const handleRejectSession = useCallback(async () => {
    const current = proposalsRef.current[0];
    if (!current) return;
    removeProposal(current.proposal.id);
    await wcService
      .rejectSession(current.proposal)
      .catch(error => logger.warn('Failed to reject session', error));
  }, [removeProposal]);

  // ---------------------------------------------------------------------------
  // 렌더링
  // ---------------------------------------------------------------------------

  const head = queue[0] ?? null;
  const signHead = head?.type === 'sign' ? head : null;
  const chainHead = head?.type === 'chain' ? head : null;
  const queuePosition =
    queue.length > 1 ? { index: 1, total: queue.length } : undefined;
  const currentProposal = proposals[0] ?? null;

  const proposalView = useMemo(() => {
    if (!currentProposal) return null;
    const analysis = analyzeProposal(
      currentProposal.proposal,
      networkList.map(network => network.chainId),
      activeNetworkChainId,
    );
    return {
      chains: analysis.approvedChainIds.map(chainId => ({
        chainId,
        name:
          networkList.find(network => network.chainId === chainId)?.name ||
          `체인 ${chainId}`,
        required: analysis.requiredChainIds.includes(chainId),
      })),
      methodLabels: describeMethods(analysis.methods),
    };
  }, [currentProposal, networkList, activeNetworkChainId]);

  // 동시에 하나의 모달만 띄운다: PIN > 요청 대기열 > 연결 제안. 잠긴 동안은 모두 숨긴다.
  // 서명 → PIN 전환은 같은 커밋에서 하나를 닫고 하나를 연다. iOS에서는 AppModal이 앞 모달의
  // 닫힘이 끝난 뒤 다음 모달을 띄운다. 각 요청 모달은 요청마다 key를 바꿔 새 네이티브
  // 호스트로 표시한다 (이전 요청의 표시 상태가 남지 않는다).
  const pinVisible = !locked && showSignPinConfirm;
  const signVisible = !locked && !!signHead && !pinVisible;
  const chainVisible = !locked && !!chainHead && !pinVisible;
  const proposalVisible =
    !locked && !!currentProposal && !head && !pinVisible && !isSigning;

  const networkName = (chainId: number | undefined) =>
    networkList.find(network => network.chainId === chainId)?.name;

  return (
    <>
      {currentProposal && proposalView ? (
        <ProposalModal
          key={`proposal:${currentProposal.proposal.id}`}
          visible={proposalVisible}
          proposalId={currentProposal.proposal.id}
          dAppName={
            currentProposal.proposal.params.proposer.metadata.name || 'dApp'
          }
          dAppUrl={currentProposal.proposal.params.proposer.metadata.url || ''}
          verification={currentProposal.verification}
          accountAddress={activeWallet?.address || ''}
          accountName={activeWallet?.name}
          chains={proposalView.chains}
          methodLabels={proposalView.methodLabels}
          waitingCount={proposals.length - 1}
          expiresAt={currentProposal.expiresAt}
          isProcessing={isApprovingSession}
          onApprove={handleApproveSession}
          onReject={handleRejectSession}
        />
      ) : null}
      <SignRequestModal
        key={signHead ? `sign:${signHead.topic}:${signHead.id}` : 'sign:none'}
        visible={signVisible}
        request={signHead}
        dAppName={signHead?.dApp.name}
        dAppUrl={signHead?.dApp.url}
        networkName={networkName(signHead?.chainId)}
        dAppVerification={signHead?.dApp.verification}
        isProcessing={isSigning}
        queuePosition={queuePosition}
        onApprove={handleApproveSignRequest}
        onReject={handleRejectSignRequest}
      />
      {chainHead ? (
        <ChainSwitchModal
          key={`chain:${chainHead.topic}:${chainHead.id}`}
          visible={chainVisible}
          dAppName={chainHead.dApp.name}
          dAppUrl={chainHead.dApp.url}
          fromNetworkName={
            networkName(activeNetworkChainId) || `체인 ${activeNetworkChainId}`
          }
          toNetworkName={chainHead.targetNetworkName}
          isAddChain={chainHead.method === 'wallet_addEthereumChain'}
          queuePosition={queuePosition}
          expiresAt={chainHead.expiresAt}
          isProcessing={isSwitchingChain}
          onApprove={handleApproveChainRequest}
          onReject={handleRejectChainRequest}
        />
      ) : null}
      <PinConfirmModal
        visible={pinVisible}
        onConfirm={handleSignPinConfirmed}
        onCancel={handleSignPinCancelled}
        title="dApp 요청 PIN 확인"
        message="외부 dApp의 서명 또는 트랜잭션 요청을 승인하려면 PIN을 입력하세요."
      />
    </>
  );
}

export default WalletConnectHost;
