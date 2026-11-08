/**
 * WalletConnect dApp 연결 관리 서비스
 *
 * - 지갑이 있으면 앱 시작 시(WalletConnectHost 마운트) 초기화되어, 저장된 세션의
 *   요청을 어느 화면에서든 받는다.
 * - 세션 제안/요청은 구독자가 생길 때까지 서비스 큐에 보관한다. 잠금 중에는
 *   호스트가 구독을 해제하므로 요청이 큐에서 기다리고, 잠금 해제 후 전달된다.
 *   큐에서 만료된 항목은 dApp에 거절 응답을 보내고 만료 알림으로 전달한다.
 * - 모든 on* 구독은 여러 구독자를 지원하며 구독 해제 함수를 반환한다.
 */

import { Core } from '@walletconnect/core';
import { WalletKit, IWalletKit } from '@reown/walletkit';
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils';
import type { SessionTypes, SignClientTypes } from '@walletconnect/types';
import Config from 'react-native-config';
import { createLogger } from '@/utils/logger';

const logger = createLogger('WalletConnect');

/** 테스트에서 설정을 바꿀 수 있도록 호출 시점에 읽는다. */
function getProjectId(): string {
  return Config.WALLETCONNECT_PROJECT_ID || '';
}

const METADATA = {
  name: 'Tori Wallet',
  description: '안전하고 편리한 Web3 지갑',
  url: 'https://tori.wallet',
  icons: ['https://tori.wallet/icon.png'],
};

export const WC_NOT_CONFIGURED_MESSAGE =
  'WalletConnect가 설정되지 않았습니다 (개발 빌드: WALLETCONNECT_PROJECT_ID 필요)';

/** 서명/전송 메서드 (SignRequestModal 검토 대상) */
export const SIGNING_METHODS = [
  'eth_sendTransaction',
  'eth_signTransaction',
  'personal_sign',
  'eth_signTypedData',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
] as const;

/** 네트워크 관련 메서드 (사용자 확인 후 처리) */
export const CHAIN_METHODS = [
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
] as const;

export const SUPPORTED_METHODS: string[] = [
  ...SIGNING_METHODS,
  ...CHAIN_METHODS,
];
export const SUPPORTED_EVENTS = ['chainChanged', 'accountsChanged'];

/** WalletConnect 기본 요청 만료(5분)와 같게 맞춘다. */
export const DEFAULT_REQUEST_TTL_MS = 5 * 60_000;
const DEFAULT_PROPOSAL_TTL_MS = 5 * 60_000;
const MAX_BUFFERED_REQUESTS = 20;
const MAX_BUFFERED_PROPOSALS = 5;
const MAX_SEEN_IDS = 200;

export type SessionProposal =
  SignClientTypes.EventArguments['session_proposal'];
export type SessionRequest = SignClientTypes.EventArguments['session_request'];

export interface DAppSession {
  topic: string;
  name: string;
  url: string;
  icon?: string;
  chains: string[];
  accounts: string[];
  expiry: number;
}

export interface DAppVerification {
  validation: 'UNKNOWN' | 'VALID' | 'INVALID';
  origin: string;
  verifyUrl: string;
  isScam: boolean;
}

interface VerifyContextLike {
  verified?: {
    validation?: 'UNKNOWN' | 'VALID' | 'INVALID';
    origin?: string;
    verifyUrl?: string;
    isScam?: boolean;
  };
}

export type WCStatus =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'not_configured'
  | 'error';

export interface WCExpiredNotice {
  kind: 'proposal' | 'request';
  id: number;
  topic?: string;
  method?: string;
  dAppName: string;
  /** buffer: 구독자가 받기 전 서비스 큐에서 만료됨 / sdk: SDK가 만료를 알림 */
  source: 'buffer' | 'sdk';
}

export type SessionsChangeReason =
  | 'initialized'
  | 'approved'
  | 'disconnected'
  | 'deleted_by_peer'
  | 'updated';

export interface SessionsChangedEvent {
  reason: SessionsChangeReason;
  topic?: string;
  dAppName?: string;
}

export interface RpcErrorPayload {
  code: number;
  message: string;
}

export type WalletConnectErrorCode =
  | 'not_configured'
  | 'invalid_uri'
  | 'pair_failed'
  | 'not_initialized';

export class WalletConnectError extends Error {
  constructor(public readonly code: WalletConnectErrorCode, message: string) {
    super(message);
    this.name = 'WalletConnectError';
  }
}

type SessionProposalCallback = (proposal: SessionProposal) => void;
type SessionRequestCallback = (request: SessionRequest) => void;
type ExpiredCallback = (notice: WCExpiredNotice) => void;
type SessionsChangedCallback = (event: SessionsChangedEvent) => void;
type StatusCallback = (status: WCStatus) => void;

interface Buffered<T> {
  event: T;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// URI 검증
// ---------------------------------------------------------------------------

export type WalletConnectUriParseResult =
  | { ok: true; uri: string; topic: string; expiryTimestamp?: number }
  | {
      ok: false;
      code: 'empty' | 'not_wc' | 'v1' | 'malformed' | 'expired';
      reason: string;
    };

function parseQueryString(query: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [key, ...rest] = pair.split('=');
    try {
      params.set(decodeURIComponent(key), decodeURIComponent(rest.join('=')));
    } catch {
      params.set(key, rest.join('='));
    }
  }
  return params;
}

/** 붙여넣기/QR/딥링크로 받은 WalletConnect URI를 검증한다 (v2만 지원). */
export function parseWalletConnectUri(
  input: string,
  nowMs: number = Date.now(),
): WalletConnectUriParseResult {
  const raw = (input || '').trim();
  if (!raw) {
    return {
      ok: false,
      code: 'empty',
      reason: 'WalletConnect URI를 입력해주세요.',
    };
  }
  if (!/^wc:/i.test(raw)) {
    return {
      ok: false,
      code: 'not_wc',
      reason:
        'WalletConnect 연결 링크가 아닙니다. "wc:"로 시작하는 URI를 붙여넣어 주세요.',
    };
  }
  const match = /^wc:([^@?/]+)@(\d+)(?:\?(.*))?$/i.exec(raw);
  if (!match) {
    return {
      ok: false,
      code: 'malformed',
      reason:
        'WalletConnect URI 형식이 올바르지 않습니다. 전체 링크를 다시 복사해주세요.',
    };
  }
  const [, topic, version, query = ''] = match;
  if (version === '1') {
    return {
      ok: false,
      code: 'v1',
      reason:
        'WalletConnect v1 링크는 더 이상 지원되지 않습니다. dApp에서 최신 WalletConnect로 다시 연결해주세요.',
    };
  }
  if (version !== '2') {
    return {
      ok: false,
      code: 'malformed',
      reason: `지원하지 않는 WalletConnect 버전(v${version})입니다.`,
    };
  }
  if (!/^[0-9a-zA-Z]+$/.test(topic)) {
    return {
      ok: false,
      code: 'malformed',
      reason: 'WalletConnect URI의 연결 주제(topic)가 올바르지 않습니다.',
    };
  }
  const params = parseQueryString(query);
  const symKey = params.get('symKey') || '';
  if (!/^[0-9a-fA-F]{64}$/.test(symKey) || !params.get('relay-protocol')) {
    return {
      ok: false,
      code: 'malformed',
      reason:
        '연결 정보가 빠진 WalletConnect URI입니다. dApp에서 연결 링크를 다시 복사해주세요.',
    };
  }
  const expiryRaw = params.get('expiryTimestamp');
  const expiryTimestamp = expiryRaw ? Number(expiryRaw) : undefined;
  if (
    expiryTimestamp !== undefined &&
    Number.isFinite(expiryTimestamp) &&
    expiryTimestamp * 1000 <= nowMs
  ) {
    return {
      ok: false,
      code: 'expired',
      reason: '만료된 연결 QR입니다. dApp에서 새 QR을 생성해주세요.',
    };
  }
  return { ok: true, uri: raw, topic, expiryTimestamp };
}

function describePairingError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/expired/i.test(message)) {
    return '연결 QR이 만료되었습니다. dApp에서 새 QR을 생성해주세요.';
  }
  if (/already|exists|duplicate/i.test(message)) {
    return '이미 사용된 연결 QR입니다. dApp에서 새 QR을 생성해주세요.';
  }
  return '연결에 실패했습니다. 네트워크 상태를 확인하고 dApp에서 새 QR로 다시 시도해주세요.';
}

// ---------------------------------------------------------------------------
// 네임스페이스 (멀티체인 승인)
// ---------------------------------------------------------------------------

export function parseCaipChainId(chainId: string): number | null {
  const match = /^eip155:(\d+)$/.exec(chainId);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

interface NamespaceLike {
  chains?: string[];
  methods?: string[];
  events?: string[];
}

export interface ProposalAnalysis {
  /** dApp이 필수로 요구한 EVM 체인 */
  requiredChainIds: number[];
  /** dApp이 선택적으로 요청한 EVM 체인 */
  optionalChainIds: number[];
  /** 실제로 승인할 체인 (요청 ∩ 지갑 네트워크, 활성 체인 우선) */
  approvedChainIds: number[];
  /** 지갑이 지원하지 않는 필수 체인 (CAIP-2) */
  unsupportedRequiredChains: string[];
  /**
   * 지갑이 지원하지 않는 선택 체인 (CAIP-2). 요청한 EVM 체인 중 지원하는 것이 하나도
   * 없으면 연결할 네트워크가 없으므로 승인할 수 없다.
   */
  unsupportedOptionalChains: string[];
  /** 지원하지 않는 필수 네임스페이스 (예: solana) */
  unsupportedNamespaces: string[];
  /** EVM(eip155) 없이 요청한 선택 네임스페이스 (예: solana만 요청한 dApp) */
  unsupportedOptionalNamespaces: string[];
  /** 지원하지 않는 필수 메서드/이벤트 (예: 보안상 막은 eth_sign) */
  unsupportedRequiredMethods: string[];
  /** 승인될 메서드 (요청 ∩ 지원) */
  methods: string[];
  /** 승인 가능 여부 */
  canApprove: boolean;
}

interface CollectedNamespaces {
  chains: string[];
  methods: Set<string>;
  events: Set<string>;
  /** eip155 / eip155:<id> 네임스페이스가 하나라도 있었는지 */
  hasEvm: boolean;
  /** EVM이 아닌 네임스페이스 키 */
  otherNamespaces: string[];
}

function collectNamespace(
  namespaces: Record<string, NamespaceLike> | undefined,
  out: CollectedNamespaces,
): void {
  for (const [key, ns] of Object.entries(namespaces || {})) {
    if (key === 'eip155') {
      out.hasEvm = true;
      out.chains.push(...(ns?.chains || []));
    } else if (key.startsWith('eip155:')) {
      out.hasEvm = true;
      out.chains.push(key);
    } else {
      out.otherNamespaces.push(key);
      continue;
    }
    (ns?.methods || []).forEach(method => out.methods.add(method));
    (ns?.events || []).forEach(event => out.events.add(event));
  }
}

/** 제안을 지갑 네트워크와 비교해 승인할 체인/메서드를 계산한다. */
export function analyzeProposal(
  proposal: Pick<SessionProposal, 'params'>,
  walletChainIds: number[],
  activeChainId: number,
): ProposalAnalysis {
  const params = proposal.params as unknown as {
    requiredNamespaces?: Record<string, NamespaceLike>;
    optionalNamespaces?: Record<string, NamespaceLike>;
  };
  const empty = (): CollectedNamespaces => ({
    chains: [],
    methods: new Set<string>(),
    events: new Set<string>(),
    hasEvm: false,
    otherNamespaces: [],
  });
  const required = empty();
  const optional = empty();
  collectNamespace(params.requiredNamespaces, required);
  collectNamespace(params.optionalNamespaces, optional);

  const supported = new Set(walletChainIds);
  const unsupportedRequiredChains: string[] = [];
  const requiredChainIds: number[] = [];
  for (const caip of required.chains) {
    const chainId = parseCaipChainId(caip);
    if (chainId === null || !supported.has(chainId)) {
      if (!unsupportedRequiredChains.includes(caip))
        unsupportedRequiredChains.push(caip);
    } else if (!requiredChainIds.includes(chainId)) {
      requiredChainIds.push(chainId);
    }
  }
  const optionalChainIds: number[] = [];
  const unsupportedOptionalChains: string[] = [];
  for (const caip of optional.chains) {
    const chainId = parseCaipChainId(caip);
    if (chainId !== null && !optionalChainIds.includes(chainId))
      optionalChainIds.push(chainId);
    if (
      (chainId === null || !supported.has(chainId)) &&
      !unsupportedOptionalChains.includes(caip)
    )
      unsupportedOptionalChains.push(caip);
  }

  const requested = [
    ...requiredChainIds,
    ...optionalChainIds.filter(id => supported.has(id)),
  ];
  let approvedChainIds = Array.from(new Set(requested));
  // 요청에 EVM 체인이 하나도 없을 때만 현재 네트워크로 연결한다. dApp이 체인을 나열했는데
  // 지원하는 것이 없으면 승인할 체인이 없다 (WalletConnect도 교집합만 승인한다).
  const proposedEvmChains = required.chains.length + optional.chains.length > 0;
  // EVM 네임스페이스 없이 다른 네임스페이스(예: solana)만 요청했다면 연결할 것이 없다.
  const onlyOtherNamespaces =
    !required.hasEvm &&
    !optional.hasEvm &&
    required.otherNamespaces.length + optional.otherNamespaces.length > 0;
  if (
    approvedChainIds.length === 0 &&
    !proposedEvmChains &&
    !onlyOtherNamespaces &&
    supported.has(activeChainId)
  ) {
    approvedChainIds = [activeChainId];
  }
  if (approvedChainIds.includes(activeChainId)) {
    approvedChainIds = [
      activeChainId,
      ...approvedChainIds.filter(id => id !== activeChainId),
    ];
  }

  const methods = SUPPORTED_METHODS.filter(
    method => required.methods.has(method) || optional.methods.has(method),
  );
  // 필수 메서드/이벤트를 승인하지 못하면 WalletConnect가 승인 자체를 거부한다.
  const unsupportedRequiredMethods = [
    ...Array.from(required.methods).filter(
      method => !SUPPORTED_METHODS.includes(method),
    ),
    ...Array.from(required.events).filter(
      event => !SUPPORTED_EVENTS.includes(event),
    ),
  ];

  return {
    requiredChainIds,
    optionalChainIds,
    approvedChainIds,
    unsupportedRequiredChains,
    unsupportedOptionalChains,
    unsupportedNamespaces: required.otherNamespaces,
    unsupportedOptionalNamespaces: onlyOtherNamespaces
      ? optional.otherNamespaces
      : [],
    unsupportedRequiredMethods,
    methods,
    canApprove:
      unsupportedRequiredChains.length === 0 &&
      required.otherNamespaces.length === 0 &&
      unsupportedRequiredMethods.length === 0 &&
      approvedChainIds.length > 0,
  };
}

/**
 * 승인할 eip155 네임스페이스를 만든다. 필수 체인을 지원하지 못하면 예외.
 *
 * WalletConnect의 buildApprovedNamespaces는 제안에 나열된 체인과의 교집합만 승인하므로,
 * 체인을 나열하지 않은 eip155 네임스페이스(현재 네트워크로 연결하는 경우)는 빈 결과가
 * 된다. 그때는 요청한 메서드/이벤트 중 지원하는 것만으로 직접 만든다.
 */
export function buildSessionNamespaces(
  proposal: Pick<SessionProposal, 'params'>,
  address: string,
  chainIds: number[],
): SessionTypes.Namespaces {
  const chains = chainIds.map(chainId => `eip155:${chainId}`);
  const accounts = chainIds.map(chainId => `eip155:${chainId}:${address}`);
  const approved = buildApprovedNamespaces({
    proposal: proposal.params,
    supportedNamespaces: {
      eip155: {
        chains,
        methods: SUPPORTED_METHODS,
        events: SUPPORTED_EVENTS,
        accounts,
      },
    },
  });
  if ((approved.eip155?.accounts?.length ?? 0) > 0 || chainIds.length === 0)
    return approved;

  const params = proposal.params as unknown as {
    requiredNamespaces?: Record<string, NamespaceLike>;
    optionalNamespaces?: Record<string, NamespaceLike>;
  };
  const requested = { methods: new Set<string>(), events: new Set<string>() };
  [params.requiredNamespaces, params.optionalNamespaces].forEach(group =>
    Object.entries(group || {}).forEach(([key, ns]) => {
      if (key !== 'eip155' && !key.startsWith('eip155:')) return;
      (ns?.methods || []).forEach(method => requested.methods.add(method));
      (ns?.events || []).forEach(event => requested.events.add(event));
    }),
  );
  return {
    ...approved,
    eip155: {
      chains,
      methods: SUPPORTED_METHODS.filter(method => requested.methods.has(method)),
      events: SUPPORTED_EVENTS.filter(event => requested.events.has(event)),
      accounts,
    },
  };
}

// ---------------------------------------------------------------------------
// 서비스
// ---------------------------------------------------------------------------

function requestExpiry(request: SessionRequest, receivedAt: number): number {
  const expiryTimestamp = request.params?.request?.expiryTimestamp;
  const fallback = receivedAt + DEFAULT_REQUEST_TTL_MS;
  return typeof expiryTimestamp === 'number'
    ? Math.min(expiryTimestamp * 1000, fallback)
    : fallback;
}

function proposalExpiry(proposal: SessionProposal, receivedAt: number): number {
  const expiryTimestamp = (proposal.params as { expiryTimestamp?: number })
    ?.expiryTimestamp;
  const fallback = receivedAt + DEFAULT_PROPOSAL_TTL_MS;
  return typeof expiryTimestamp === 'number'
    ? Math.min(expiryTimestamp * 1000, fallback)
    : fallback;
}

function safeCall<T>(listener: (value: T) => void, value: T): void {
  try {
    listener(value);
  } catch (error) {
    logger.error('WalletConnect listener failed', error);
  }
}

class WCService {
  private walletKit: IWalletKit | null = null;
  private initializationPromise: Promise<void> | null = null;
  private status: WCStatus = 'idle';
  private lastError: string | null = null;

  private proposalListeners = new Set<SessionProposalCallback>();
  private requestListeners = new Set<SessionRequestCallback>();
  private expiredListeners = new Set<ExpiredCallback>();
  private sessionsListeners = new Set<SessionsChangedCallback>();
  private statusListeners = new Set<StatusCallback>();

  private bufferedProposals: Buffered<SessionProposal>[] = [];
  private bufferedRequests: Buffered<SessionRequest>[] = [];
  private pendingNotices: WCExpiredNotice[] = [];
  private seenRequestIds: number[] = [];

  // ----- 상태 -----

  isConfigured(): boolean {
    return getProjectId().length > 0;
  }

  getStatus(): WCStatus {
    if (this.status === 'idle' && !this.isConfigured()) return 'not_configured';
    return this.status;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  isReady(): boolean {
    return this.walletKit !== null;
  }

  private setStatus(status: WCStatus, error: string | null = null): void {
    this.status = status;
    this.lastError = error;
    this.statusListeners.forEach(listener => safeCall(listener, status));
  }

  onStatusChange(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  /**
   * WalletConnect 초기화. 프로젝트 ID가 없으면 'not_configured' 상태로 두고
   * 예외 없이 반환한다.
   */
  async initialize(): Promise<void> {
    if (this.walletKit) return;
    if (this.initializationPromise) return this.initializationPromise;
    const projectId = getProjectId();
    if (!projectId) {
      logger.warn(
        'WalletConnect Project ID is not set. WalletConnect features will be disabled.',
      );
      this.setStatus('not_configured');
      return;
    }

    this.setStatus('initializing');
    this.initializationPromise = (async () => {
      const core = new Core({ projectId });
      this.walletKit = await WalletKit.init({
        core,
        metadata: METADATA,
      });
      this.setupEventListeners();
      this.setStatus('ready');
      this.recoverPendingRequests();
      this.emitSessionsChanged({ reason: 'initialized' });
      logger.info('WalletConnect initialized successfully');
    })().catch(error => {
      this.initializationPromise = null;
      this.walletKit = null;
      this.setStatus(
        'error',
        error instanceof Error ? error.message : 'WalletConnect 초기화 실패',
      );
      logger.error('Failed to initialize WalletConnect:', error);
      throw error;
    });

    return this.initializationPromise;
  }

  private setupEventListeners(): void {
    const kit = this.walletKit;
    if (!kit) return;

    kit.on('session_proposal', proposal => this.handleProposal(proposal));
    kit.on('session_request', request => this.handleRequest(request));
    kit.on('session_delete', event => {
      const topic = (event as { topic?: string } | undefined)?.topic;
      logger.info('Session deleted by peer');
      this.emitSessionsChanged({ reason: 'deleted_by_peer', topic });
    });
    kit.on('proposal_expire', event => {
      const id = (event as { id?: number } | undefined)?.id;
      if (typeof id === 'number') this.handleSdkExpiry('proposal', id);
    });
    kit.on('session_request_expire', event => {
      const id = (event as { id?: number } | undefined)?.id;
      if (typeof id === 'number') this.handleSdkExpiry('request', id);
    });
  }

  /** 초기화 이전(앱 종료 중)에 도착해 SDK에 보관된 요청을 큐로 가져온다. */
  private recoverPendingRequests(): void {
    const kit = this.walletKit as
      | (IWalletKit & {
          getPendingSessionRequests?: () => Array<{
            id: number;
            topic: string;
            params: SessionRequest['params'];
            verifyContext: SessionRequest['verifyContext'];
          }>;
        })
      | null;
    if (typeof kit?.getPendingSessionRequests !== 'function') return;
    try {
      kit.getPendingSessionRequests().forEach(pending =>
        this.handleRequest({
          id: pending.id,
          topic: pending.topic,
          params: pending.params,
          verifyContext: pending.verifyContext,
        }),
      );
    } catch (error) {
      logger.warn('Failed to recover pending session requests', error);
    }
  }

  private dAppNameForTopic(topic: string | undefined): string {
    if (!topic) return 'dApp';
    return this.getSessionMetadata(topic)?.name || 'dApp';
  }

  private handleProposal(proposal: SessionProposal | undefined): void {
    if (!proposal || typeof proposal.id !== 'number') return;
    this.pruneExpired();
    if (this.proposalListeners.size > 0) {
      this.proposalListeners.forEach(listener => safeCall(listener, proposal));
      return;
    }
    if (this.bufferedProposals.some(item => item.event.id === proposal.id))
      return;
    this.bufferedProposals.push({
      event: proposal,
      expiresAt: proposalExpiry(proposal, Date.now()),
    });
    while (this.bufferedProposals.length > MAX_BUFFERED_PROPOSALS) {
      const dropped = this.bufferedProposals.shift();
      if (dropped) this.rejectBufferedProposal(dropped.event);
    }
  }

  private handleRequest(request: SessionRequest | undefined): void {
    if (!request || typeof request.id !== 'number') return;
    if (this.seenRequestIds.includes(request.id)) return;
    this.seenRequestIds.push(request.id);
    if (this.seenRequestIds.length > MAX_SEEN_IDS) this.seenRequestIds.shift();

    this.pruneExpired();
    if (this.requestListeners.size > 0) {
      this.requestListeners.forEach(listener => safeCall(listener, request));
      return;
    }
    this.bufferedRequests.push({
      event: request,
      expiresAt: requestExpiry(request, Date.now()),
    });
    while (this.bufferedRequests.length > MAX_BUFFERED_REQUESTS) {
      const dropped = this.bufferedRequests.shift();
      if (dropped) {
        this.rejectRequest(dropped.event.topic, dropped.event.id).catch(error =>
          logger.warn('Failed to reject overflowed request', error),
        );
      }
    }
  }

  private rejectBufferedProposal(proposal: SessionProposal): void {
    this.rejectSession(proposal).catch(error =>
      logger.warn('Failed to reject buffered proposal', error),
    );
  }

  private notifyExpired(notice: WCExpiredNotice): void {
    if (this.expiredListeners.size === 0) {
      this.pendingNotices.push(notice);
      if (this.pendingNotices.length > MAX_BUFFERED_REQUESTS)
        this.pendingNotices.shift();
      return;
    }
    this.expiredListeners.forEach(listener => safeCall(listener, notice));
  }

  /** 큐에서 만료된 제안/요청을 거절하고 만료 알림을 남긴다. */
  private pruneExpired(now: number = Date.now()): void {
    const expiredProposals = this.bufferedProposals.filter(
      item => item.expiresAt <= now,
    );
    const expiredRequests = this.bufferedRequests.filter(
      item => item.expiresAt <= now,
    );
    if (expiredProposals.length === 0 && expiredRequests.length === 0) return;
    this.bufferedProposals = this.bufferedProposals.filter(
      item => item.expiresAt > now,
    );
    this.bufferedRequests = this.bufferedRequests.filter(
      item => item.expiresAt > now,
    );
    expiredProposals.forEach(({ event }) => {
      this.rejectBufferedProposal(event);
      this.notifyExpired({
        kind: 'proposal',
        id: event.id,
        dAppName: event.params?.proposer?.metadata?.name || 'dApp',
        source: 'buffer',
      });
    });
    expiredRequests.forEach(({ event }) => {
      this.rejectRequest(event.topic, event.id, {
        code: 8000,
        message: 'Request expired',
      }).catch(error => logger.warn('Failed to reject expired request', error));
      this.notifyExpired({
        kind: 'request',
        id: event.id,
        topic: event.topic,
        method: event.params?.request?.method,
        dAppName: this.dAppNameForTopic(event.topic),
        source: 'buffer',
      });
    });
  }

  private handleSdkExpiry(kind: 'proposal' | 'request', id: number): void {
    if (kind === 'proposal') {
      const buffered = this.bufferedProposals.find(
        item => item.event.id === id,
      );
      this.bufferedProposals = this.bufferedProposals.filter(
        item => item.event.id !== id,
      );
      this.notifyExpired({
        kind,
        id,
        dAppName: buffered?.event.params?.proposer?.metadata?.name || 'dApp',
        source: buffered ? 'buffer' : 'sdk',
      });
      return;
    }
    const buffered = this.bufferedRequests.find(item => item.event.id === id);
    this.bufferedRequests = this.bufferedRequests.filter(
      item => item.event.id !== id,
    );
    this.notifyExpired({
      kind,
      id,
      topic: buffered?.event.topic,
      method: buffered?.event.params?.request?.method,
      dAppName: this.dAppNameForTopic(buffered?.event.topic),
      source: buffered ? 'buffer' : 'sdk',
    });
  }

  // ----- 구독 -----

  /** 세션 제안 구독. 대기 중이던 제안을 즉시 전달한다. */
  onSessionProposal(callback: SessionProposalCallback): () => void {
    this.proposalListeners.add(callback);
    this.pruneExpired();
    const buffered = this.bufferedProposals;
    this.bufferedProposals = [];
    buffered.forEach(item => safeCall(callback, item.event));
    return () => {
      this.proposalListeners.delete(callback);
    };
  }

  /** 세션 요청 구독. 대기 중이던 요청을 즉시 전달한다. */
  onSessionRequest(callback: SessionRequestCallback): () => void {
    this.requestListeners.add(callback);
    this.pruneExpired();
    const buffered = this.bufferedRequests;
    this.bufferedRequests = [];
    buffered.forEach(item => safeCall(callback, item.event));
    return () => {
      this.requestListeners.delete(callback);
    };
  }

  /** 만료 알림 구독. 구독자가 없던 동안 쌓인 알림을 즉시 전달한다. */
  onExpired(callback: ExpiredCallback): () => void {
    this.expiredListeners.add(callback);
    const notices = this.pendingNotices;
    this.pendingNotices = [];
    notices.forEach(notice => safeCall(callback, notice));
    return () => {
      this.expiredListeners.delete(callback);
    };
  }

  /** 세션 목록 변경(승인/해제/dApp 측 해제/업데이트) 구독 */
  onSessionsChanged(callback: SessionsChangedCallback): () => void {
    this.sessionsListeners.add(callback);
    return () => {
      this.sessionsListeners.delete(callback);
    };
  }

  private emitSessionsChanged(event: SessionsChangedEvent): void {
    this.sessionsListeners.forEach(listener => safeCall(listener, event));
  }

  /** 구독자를 기다리는 제안/요청 수 */
  getPendingCounts(): { proposals: number; requests: number } {
    this.pruneExpired();
    return {
      proposals: this.bufferedProposals.length,
      requests: this.bufferedRequests.length,
    };
  }

  /** 큐에 남은 제안/요청을 모두 거절한다 (지갑 삭제 등). */
  clearPending(): void {
    const proposals = this.bufferedProposals;
    const requests = this.bufferedRequests;
    this.bufferedProposals = [];
    this.bufferedRequests = [];
    this.pendingNotices = [];
    if (!this.walletKit) return;
    proposals.forEach(item => this.rejectBufferedProposal(item.event));
    requests.forEach(item =>
      this.rejectRequest(item.event.topic, item.event.id).catch(error =>
        logger.warn('Failed to reject pending request', error),
      ),
    );
  }

  // ----- 페어링 -----

  /**
   * WalletConnect URI로 페어링 (저수준). 초기화되지 않았으면 예외.
   */
  async pair(uri: string): Promise<void> {
    if (!this.walletKit) {
      throw new Error('WalletConnect not initialized');
    }

    try {
      await this.walletKit.pair({ uri });
    } catch (error) {
      logger.error('Failed to pair:', error);
      throw error;
    }
  }

  /**
   * 사용자 입력/QR/딥링크 URI를 검증하고 페어링한다. 실패 시 화면에 그대로
   * 보여줄 수 있는 한국어 메시지를 담은 WalletConnectError를 던진다.
   */
  async pairWithUri(input: string): Promise<void> {
    if (!this.isConfigured()) {
      this.setStatus('not_configured');
      throw new WalletConnectError('not_configured', WC_NOT_CONFIGURED_MESSAGE);
    }
    const parsed = parseWalletConnectUri(input);
    if (!parsed.ok) throw new WalletConnectError('invalid_uri', parsed.reason);
    try {
      await this.initialize();
    } catch {
      throw new WalletConnectError(
        'not_initialized',
        'WalletConnect에 연결할 수 없습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.',
      );
    }
    try {
      await this.pair(parsed.uri);
    } catch (error) {
      throw new WalletConnectError('pair_failed', describePairingError(error));
    }
  }

  // ----- 세션 제안 -----

  /**
   * 세션 제안 승인
   */
  async approveSession(
    proposal: SessionProposal,
    address: string,
    chainIds: number[] = [1], // 기본값: Ethereum Mainnet
  ): Promise<SessionTypes.Struct> {
    if (!this.walletKit) {
      throw new Error('WalletConnect not initialized');
    }

    try {
      const approvedNamespaces = buildSessionNamespaces(
        proposal,
        address,
        chainIds,
      );
      const session = await this.walletKit.approveSession({
        id: proposal.id,
        namespaces: approvedNamespaces,
      });
      this.emitSessionsChanged({
        reason: 'approved',
        topic: session?.topic,
        dAppName: proposal.params?.proposer?.metadata?.name,
      });
      return session;
    } catch (error) {
      logger.error('Failed to approve session:', error);
      throw error;
    }
  }

  /**
   * 세션 제안 거절
   */
  async rejectSession(
    proposal: Pick<SessionProposal, 'id'>,
    reason:
      | 'USER_REJECTED'
      | 'UNSUPPORTED_CHAINS'
      | 'UNSUPPORTED_NAMESPACE_KEY' = 'USER_REJECTED',
  ): Promise<void> {
    if (!this.walletKit) {
      throw new Error('WalletConnect not initialized');
    }

    try {
      await this.walletKit.rejectSession({
        id: proposal.id,
        reason: getSdkError(reason),
      });
    } catch (error) {
      logger.error('Failed to reject session:', error);
      throw error;
    }
  }

  // ----- 세션 요청 -----

  /**
   * 요청 응답 (승인)
   */
  async respondRequest(
    topic: string,
    requestId: number,
    result: unknown,
  ): Promise<void> {
    if (!this.walletKit) {
      throw new Error('WalletConnect not initialized');
    }

    try {
      await this.walletKit.respondSessionRequest({
        topic,
        response: {
          id: requestId,
          jsonrpc: '2.0',
          result,
        },
      });
    } catch (error) {
      logger.error('Failed to respond to request:', error);
      throw error;
    }
  }

  /**
   * 요청 거절 (기본: USER_REJECTED, EIP-1193 오류 코드를 직접 지정할 수 있다)
   */
  async rejectRequest(
    topic: string,
    requestId: number,
    error?: RpcErrorPayload,
  ): Promise<void> {
    if (!this.walletKit) {
      throw new Error('WalletConnect not initialized');
    }

    try {
      await this.walletKit.respondSessionRequest({
        topic,
        response: {
          id: requestId,
          jsonrpc: '2.0',
          error: error ?? getSdkError('USER_REJECTED'),
        },
      });
    } catch (reason) {
      logger.error('Failed to reject request:', reason);
      throw reason;
    }
  }

  // ----- 세션 -----

  /**
   * 활성 세션 목록 가져오기
   */
  getActiveSessions(): DAppSession[] {
    if (!this.walletKit) {
      return [];
    }

    const sessions = this.walletKit.getActiveSessions() || {};
    return Object.values(sessions).map(session => ({
      topic: session.topic,
      name: session.peer.metadata.name,
      url: session.peer.metadata.url,
      icon: session.peer.metadata.icons[0],
      chains: Object.keys(session.namespaces).flatMap(
        ns => session.namespaces[ns]?.chains || [],
      ),
      accounts: Object.keys(session.namespaces).flatMap(
        ns => session.namespaces[ns]?.accounts || [],
      ),
      expiry: session.expiry,
    }));
  }

  private getRawSession(topic: string): SessionTypes.Struct | undefined {
    if (!this.walletKit) return undefined;
    return (this.walletKit.getActiveSessions() || {})[topic];
  }

  getSessionMetadata(
    topic: string,
  ): { name: string; url: string; icon?: string } | null {
    const session = this.getRawSession(topic);
    if (!session) return null;
    return {
      name: session.peer.metadata.name,
      url: session.peer.metadata.url,
      icon: session.peer.metadata.icons?.[0],
    };
  }

  validateSessionRequest(
    topic: string,
    chainId: number,
    address: string,
    method: string,
  ): boolean {
    if (!this.walletKit) return false;
    const session = this.walletKit.getActiveSessions()[topic];
    const namespace = session?.namespaces.eip155;
    if (!namespace || !namespace.methods.includes(method)) return false;

    const caipChain = `eip155:${chainId}`;
    const caipAccount = `${caipChain}:${address}`.toLowerCase();
    const approvedChains = namespace.chains || [];
    return (
      approvedChains.includes(caipChain) &&
      namespace.accounts.some(account => account.toLowerCase() === caipAccount)
    );
  }

  /** 계정 인자가 없는 요청(네트워크 전환 등)의 세션 범위를 확인한다. */
  validateSessionMethod(
    topic: string,
    chainId: number,
    method: string,
  ): boolean {
    const namespace = this.getRawSession(topic)?.namespaces.eip155;
    if (!namespace || !namespace.methods.includes(method)) return false;
    return (namespace.chains || []).includes(`eip155:${chainId}`);
  }

  /** 세션에 승인된 체인인지 */
  sessionHasChain(topic: string, chainId: number): boolean {
    const namespace = this.getRawSession(topic)?.namespaces.eip155;
    return (namespace?.chains || []).includes(`eip155:${chainId}`);
  }

  /**
   * 세션에 승인된 계정 주소 (중복 제거, 세션에 저장된 표기 그대로).
   * 사용자가 연결을 승인한 계정만 들어 있다.
   */
  getSessionAddresses(topic: string): string[] {
    const namespace = this.getRawSession(topic)?.namespaces.eip155;
    const seen = new Map<string, string>();
    (namespace?.accounts || []).forEach(account => {
      const address = account.split(':')[2];
      if (address && !seen.has(address.toLowerCase()))
        seen.set(address.toLowerCase(), address);
    });
    return Array.from(seen.values());
  }

  /** 계정이 이 세션에 승인되어 있는지 (체인 무관) */
  sessionHasAddress(topic: string, address: string | undefined): boolean {
    if (!address) return false;
    const target = address.toLowerCase();
    return this.getSessionAddresses(topic).some(
      item => item.toLowerCase() === target,
    );
  }

  /**
   * 사용자가 승인한 네트워크 전환을 위해 세션에 체인을 추가한다.
   * 이미 포함되어 있으면 아무 것도 하지 않는다. 새 체인에는 이 세션에 이미 승인된
   * 계정만 추가한다 (앱의 다른 계정을 dApp에 노출하지 않는다).
   */
  async ensureSessionChain(topic: string, chainId: number): Promise<boolean> {
    const session = this.getRawSession(topic);
    const namespace = session?.namespaces.eip155;
    if (!this.walletKit || !session || !namespace) return false;
    const caipChain = `eip155:${chainId}`;
    if ((namespace.chains || []).includes(caipChain)) return true;
    const addresses = this.getSessionAddresses(topic);
    if (addresses.length === 0) return false;
    const kit = this.walletKit as IWalletKit & {
      updateSession?: IWalletKit['updateSession'];
    };
    if (typeof kit.updateSession !== 'function') return false;
    try {
      await kit.updateSession({
        topic,
        namespaces: {
          ...session.namespaces,
          eip155: {
            ...namespace,
            chains: [...(namespace.chains || []), caipChain],
            accounts: [
              ...namespace.accounts,
              ...addresses.map(address => `${caipChain}:${address}`),
            ],
          },
        },
      });
      this.emitSessionsChanged({ reason: 'updated', topic });
      return true;
    } catch (error) {
      logger.warn('Failed to add chain to session', error);
      return false;
    }
  }

  private async emitEvent(
    topic: string,
    chainId: number,
    name: 'chainChanged' | 'accountsChanged',
    data: unknown,
  ): Promise<boolean> {
    const kit = this.walletKit as
      | (IWalletKit & { emitSessionEvent?: IWalletKit['emitSessionEvent'] })
      | null;
    if (!kit || typeof kit.emitSessionEvent !== 'function') return false;
    const namespace = this.getRawSession(topic)?.namespaces.eip155;
    if (!namespace?.events?.includes(name)) return false;
    try {
      await kit.emitSessionEvent({
        topic,
        event: { name, data },
        chainId: `eip155:${chainId}`,
      });
      return true;
    } catch (error) {
      logger.warn(`Failed to emit ${name}`, error);
      return false;
    }
  }

  /** 한 세션에 chainChanged(및 해당 계정의 accountsChanged)를 보낸다. */
  async emitChainChangedToSession(
    topic: string,
    chainId: number,
    address?: string,
  ): Promise<boolean> {
    if (!this.sessionHasChain(topic, chainId)) return false;
    const emitted = await this.emitEvent(
      topic,
      chainId,
      'chainChanged',
      chainId,
    );
    const namespace = this.getRawSession(topic)?.namespaces.eip155;
    const caipAccount = address
      ? `eip155:${chainId}:${address}`.toLowerCase()
      : null;
    if (
      caipAccount &&
      namespace?.accounts.some(account => account.toLowerCase() === caipAccount)
    ) {
      await this.emitEvent(topic, chainId, 'accountsChanged', [address]);
    }
    return emitted;
  }

  /**
   * 앱에서 네트워크/계정을 바꿨을 때 해당 체인을 포함한 모든 세션에 알린다.
   * 반환값: chainChanged를 보낸 세션 수
   */
  async emitChainChanged(chainId: number, address?: string): Promise<number> {
    if (!this.walletKit) return 0;
    const topics = Object.keys(this.walletKit.getActiveSessions() || {});
    const results = await Promise.all(
      topics.map(topic =>
        this.emitChainChangedToSession(topic, chainId, address),
      ),
    );
    return results.filter(Boolean).length;
  }

  /**
   * 앱에서 활성 계정을 바꿨을 때, 그 계정이 승인된 세션에 accountsChanged를 보낸다.
   * (승인되지 않은 계정은 세션에 노출하지 않는다.)
   */
  async emitAccountsChanged(address: string): Promise<number> {
    if (!this.walletKit) return 0;
    const target = address.toLowerCase();
    const sessions = Object.values(this.walletKit.getActiveSessions() || {});
    const results = await Promise.all(
      sessions.map(session => {
        const account = session.namespaces.eip155?.accounts.find(
          item => item.toLowerCase().split(':')[2] === target,
        );
        const chainId = account
          ? parseCaipChainId(account.split(':').slice(0, 2).join(':'))
          : null;
        return chainId
          ? this.emitEvent(session.topic, chainId, 'accountsChanged', [address])
          : Promise.resolve(false);
      }),
    );
    return results.filter(Boolean).length;
  }

  getDAppVerification(
    context: VerifyContextLike | undefined,
  ): DAppVerification {
    return {
      validation: context?.verified?.validation || 'UNKNOWN',
      origin: context?.verified?.origin || '',
      verifyUrl: context?.verified?.verifyUrl || '',
      isScam: context?.verified?.isScam === true,
    };
  }

  isVerificationBlocked(verification: DAppVerification): boolean {
    return verification.isScam || verification.validation === 'INVALID';
  }

  /**
   * 세션 연결 해제
   */
  async disconnectSession(topic: string): Promise<void> {
    if (!this.walletKit) {
      throw new Error('WalletConnect not initialized');
    }

    try {
      await this.walletKit.disconnectSession({
        topic,
        reason: getSdkError('USER_DISCONNECTED'),
      });
      this.emitSessionsChanged({ reason: 'disconnected', topic });
    } catch (error) {
      logger.error('Failed to disconnect session:', error);
      throw error;
    }
  }

  async disconnectAllSessions(): Promise<void> {
    this.clearPending();
    if (!this.walletKit) return;
    const topics = Object.keys(this.walletKit.getActiveSessions());
    const results = await Promise.allSettled(
      topics.map(topic => this.disconnectSession(topic)),
    );
    const failed = results.filter(result => result.status === 'rejected');
    if (failed.length > 0) {
      throw new Error(`Failed to disconnect ${failed.length} session(s)`);
    }
  }
}

export const wcService = new WCService();
