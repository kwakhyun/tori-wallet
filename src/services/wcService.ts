/**
 * WalletConnect dApp 연결 관리 서비스
 */

import { Core } from '@walletconnect/core';
import { Web3Wallet, IWeb3Wallet } from '@walletconnect/web3wallet';
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils';
import type { SessionTypes, SignClientTypes } from '@walletconnect/types';
import Config from 'react-native-config';
import { createLogger } from '@/utils/logger';

const logger = createLogger('WalletConnect');

// WalletConnect Project ID (환경 변수에서 로드 - 필수)
const PROJECT_ID = Config.WALLETCONNECT_PROJECT_ID || '';

const METADATA = {
  name: 'Tori Wallet',
  description: '안전하고 편리한 Web3 지갑',
  url: 'https://tori.wallet',
  icons: ['https://tori.wallet/icon.png'],
};

export interface DAppSession {
  topic: string;
  name: string;
  url: string;
  icon?: string;
  chains: string[];
  accounts: string[];
  expiry: number;
}

type SessionProposalCallback = (
  proposal: SignClientTypes.EventArguments['session_proposal'],
) => void;
type SessionRequestCallback = (
  request: SignClientTypes.EventArguments['session_request'],
) => void;

class WCService {
  private web3wallet: IWeb3Wallet | null = null;
  private sessionProposalCallback: SessionProposalCallback | null = null;
  private sessionRequestCallback: SessionRequestCallback | null = null;

  /**
   * WalletConnect 초기화
   */
  async initialize(): Promise<void> {
    if (!PROJECT_ID) {
      console.warn(
        'WalletConnect Project ID is not set. WalletConnect features will be disabled.',
      );
      return;
    }

    try {
      const core = new Core({
        projectId: PROJECT_ID,
      });

      this.web3wallet = await Web3Wallet.init({
        // WalletConnect Core 버전 간 타입 불일치로 인한 타입 무시
        // @ts-expect-error - WalletConnect Core type mismatch between versions
        core: core,
        metadata: METADATA,
      });

      this.setupEventListeners();
      logger.info('WalletConnect initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize WalletConnect:', error);
      throw error;
    }
  }

  /**
   * 이벤트 리스너 설정
   */
  private setupEventListeners(): void {
    if (!this.web3wallet) return;

    // 세션 제안 이벤트
    this.web3wallet.on('session_proposal', async proposal => {
      if (this.sessionProposalCallback) {
        this.sessionProposalCallback(proposal);
      }
    });

    // 세션 요청 이벤트 (서명, 트랜잭션 등)
    this.web3wallet.on('session_request', async request => {
      if (this.sessionRequestCallback) {
        this.sessionRequestCallback(request);
      }
    });

    // 세션 삭제 이벤트
    this.web3wallet.on('session_delete', ({ topic }) => {
      logger.info('Session deleted:', topic);
    });
  }

  /**
   * 세션 제안 콜백 설정
   */
  onSessionProposal(callback: SessionProposalCallback): void {
    this.sessionProposalCallback = callback;
  }

  /**
   * 세션 요청 콜백 설정
   */
  onSessionRequest(callback: SessionRequestCallback): void {
    this.sessionRequestCallback = callback;
  }

  /**
   * WalletConnect URI로 페어링
   */
  async pair(uri: string): Promise<void> {
    if (!this.web3wallet) {
      throw new Error('WalletConnect not initialized');
    }

    try {
      await this.web3wallet.pair({ uri });
    } catch (error) {
      logger.error('Failed to pair:', error);
      throw error;
    }
  }

  /**
   * 세션 제안 승인
   */
  async approveSession(
    proposal: SignClientTypes.EventArguments['session_proposal'],
    address: string,
    chainIds: number[] = [1], // 기본값: Ethereum Mainnet
  ): Promise<SessionTypes.Struct> {
    if (!this.web3wallet) {
      throw new Error('WalletConnect not initialized');
    }

    try {
      const { id, params } = proposal;

      // EIP155 계정 형식 변환
      const accounts = chainIds.map(chainId => `eip155:${chainId}:${address}`);
      const chains = chainIds.map(chainId => `eip155:${chainId}`);

      const approvedNamespaces = buildApprovedNamespaces({
        proposal: params,
        supportedNamespaces: {
          eip155: {
            chains,
            methods: [
              'eth_sendTransaction',
              'eth_signTransaction',
              'eth_sign',
              'personal_sign',
              'eth_signTypedData',
              'eth_signTypedData_v3',
              'eth_signTypedData_v4',
            ],
            events: ['chainChanged', 'accountsChanged'],
            accounts,
          },
        },
      });

      const session = await this.web3wallet.approveSession({
        id,
        namespaces: approvedNamespaces,
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
    proposal: SignClientTypes.EventArguments['session_proposal'],
  ): Promise<void> {
    if (!this.web3wallet) {
      throw new Error('WalletConnect not initialized');
    }

    try {
      await this.web3wallet.rejectSession({
        id: proposal.id,
        reason: getSdkError('USER_REJECTED'),
      });
    } catch (error) {
      logger.error('Failed to reject session:', error);
      throw error;
    }
  }

  /**
   * 요청 응답 (승인)
   */
  async respondRequest(
    topic: string,
    requestId: number,
    result: unknown,
  ): Promise<void> {
    if (!this.web3wallet) {
      throw new Error('WalletConnect not initialized');
    }

    try {
      await this.web3wallet.respondSessionRequest({
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
   * 요청 거절
   */
  async rejectRequest(topic: string, requestId: number): Promise<void> {
    if (!this.web3wallet) {
      throw new Error('WalletConnect not initialized');
    }

    try {
      await this.web3wallet.respondSessionRequest({
        topic,
        response: {
          id: requestId,
          jsonrpc: '2.0',
          error: getSdkError('USER_REJECTED'),
        },
      });
    } catch (error) {
      logger.error('Failed to reject request:', error);
      throw error;
    }
  }

  /**
   * 활성 세션 목록 가져오기
   */
  getActiveSessions(): DAppSession[] {
    if (!this.web3wallet) {
      return [];
    }

    const sessions = this.web3wallet.getActiveSessions();
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

  /**
   * 세션 연결 해제
   */
  async disconnectSession(topic: string): Promise<void> {
    if (!this.web3wallet) {
      throw new Error('WalletConnect not initialized');
    }

    try {
      await this.web3wallet.disconnectSession({
        topic,
        reason: getSdkError('USER_DISCONNECTED'),
      });
    } catch (error) {
      logger.error('Failed to disconnect session:', error);
      throw error;
    }
  }
}

export const wcService = new WCService();
