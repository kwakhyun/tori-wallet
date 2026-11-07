/**
 * viem 기반 체인 클라이언트 (RPC 연결 관리)
 */

import { createPublicClient, http, formatEther, parseEther } from 'viem';
import {
  mainnet,
  polygon,
  arbitrum,
  optimism,
  base,
  sepolia,
} from 'viem/chains';
import type { Chain, PublicClient } from 'viem';
import { customNetworkRegistry } from './customNetworks';

const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  137: polygon,
  42161: arbitrum,
  10: optimism,
  8453: base,
  11155111: sepolia,
};

interface ChainClientConfig {
  chainId: number;
  rpcUrl?: string;
}

// 기본 Public RPC URLs (무료, 안정적)
const DEFAULT_RPC_URLS: Record<number, string> = {
  1: 'https://eth.llamarpc.com',
  137: 'https://polygon-bor-rpc.publicnode.com',
  42161: 'https://arbitrum-one-rpc.publicnode.com',
  10: 'https://optimism-rpc.publicnode.com',
  8453: 'https://base-rpc.publicnode.com',
  11155111: 'https://ethereum-sepolia-rpc.publicnode.com',
};

// 백업 RPC URLs (주 RPC 실패 시 사용 예정)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const FALLBACK_RPC_URLS: Record<number, string[]> = {
  1: [
    'https://ethereum-rpc.publicnode.com',
    'https://rpc.ankr.com/eth',
    'https://cloudflare-eth.com',
  ],
  137: ['https://polygon-rpc.com', 'https://rpc.ankr.com/polygon'],
  42161: ['https://arb1.arbitrum.io/rpc', 'https://rpc.ankr.com/arbitrum'],
  10: ['https://mainnet.optimism.io', 'https://rpc.ankr.com/optimism'],
  8453: ['https://mainnet.base.org', 'https://base.meowrpc.com'],
  11155111: ['https://rpc.sepolia.org', 'https://rpc2.sepolia.org'],
};

const RPC_PROBE_TIMEOUT_MS = 10_000;

export type RpcChainIdCheck =
  | { ok: true }
  | { ok: false; reason: 'mismatch'; actualChainId: number }
  | { ok: false; reason: 'unreachable'; message: string };

class ChainClient {
  private clients: Map<string, PublicClient> = new Map();
  private retryCount = 3;
  private retryDelay = 1000;

  constructor() {
    // 커스텀 네트워크가 바뀌면 이전 RPC/체인 정의로 만든 클라이언트를 버린다.
    customNetworkRegistry.subscribe(() => this.clearCache());
  }

  /** 기본 체인 또는 등록된 커스텀 체인의 viem Chain 정의 */
  getChain(chainId: number): Chain | undefined {
    return CHAIN_MAP[chainId] ?? customNetworkRegistry.getChain(chainId);
  }

  /** 기본 체인 또는 등록된 커스텀 체인의 RPC URL */
  getRpcUrl(chainId: number): string | undefined {
    return (
      DEFAULT_RPC_URLS[chainId] ?? customNetworkRegistry.get(chainId)?.rpcUrl
    );
  }

  isSupportedChain(chainId: number): boolean {
    return this.getChain(chainId) !== undefined;
  }

  isCustomChain(chainId: number): boolean {
    return !CHAIN_MAP[chainId] && customNetworkRegistry.has(chainId);
  }

  getClient(chainId: number, rpcUrl?: string): PublicClient {
    const chain = this.getChain(chainId);
    if (!chain) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }

    // rpcUrl이 없으면 기본(또는 커스텀 네트워크에 저장된) RPC 사용
    const finalRpcUrl = rpcUrl || this.getRpcUrl(chainId);
    const cacheKey = `${chainId}|${finalRpcUrl ?? ''}`;

    const cached = this.clients.get(cacheKey);
    if (cached) {
      return cached;
    }

    const client = createPublicClient({
      chain,
      transport: http(finalRpcUrl, {
        retryCount: this.retryCount,
        retryDelay: this.retryDelay,
        timeout: 30000,
      }),
    });

    this.clients.set(cacheKey, client);
    return client;
  }

  async getBalance(
    address: `0x${string}`,
    config: ChainClientConfig,
  ): Promise<{ wei: bigint; formatted: string }> {
    const client = this.getClient(config.chainId, config.rpcUrl);

    try {
      const balance = await client.getBalance({ address });
      return {
        wei: balance,
        formatted: formatEther(balance),
      };
    } catch (error) {
      console.error('Failed to get balance:', error);
      throw this.handleError(error);
    }
  }

  async getGasPrice(config: ChainClientConfig): Promise<bigint> {
    const client = this.getClient(config.chainId, config.rpcUrl);

    try {
      return await client.getGasPrice();
    } catch (error) {
      console.error('Failed to get gas price:', error);
      throw this.handleError(error);
    }
  }

  async estimateGas(
    params: {
      to: `0x${string}`;
      from: `0x${string}`;
      value?: bigint;
      data?: `0x${string}`;
    },
    config: ChainClientConfig,
  ): Promise<bigint> {
    const client = this.getClient(config.chainId, config.rpcUrl);

    try {
      return await client.estimateGas({
        account: params.from,
        to: params.to,
        value: params.value,
        data: params.data,
      });
    } catch (error) {
      console.error('Failed to estimate gas:', error);
      throw this.handleError(error);
    }
  }

  async getTransactionCount(
    address: `0x${string}`,
    config: ChainClientConfig,
  ): Promise<number> {
    const client = this.getClient(config.chainId, config.rpcUrl);

    try {
      return await client.getTransactionCount({ address });
    } catch (error) {
      console.error('Failed to get transaction count:', error);
      throw this.handleError(error);
    }
  }

  async getTransactionReceipt(
    txHash: `0x${string}`,
    config: ChainClientConfig,
  ) {
    const client = this.getClient(config.chainId, config.rpcUrl);

    try {
      return await client.getTransactionReceipt({ hash: txHash });
    } catch (error) {
      console.error('Failed to get transaction receipt:', error);
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): Error {
    if (error instanceof Error) {
      // RPC 타임아웃
      if (error.message.includes('timeout')) {
        return new ChainError('RPC_TIMEOUT', 'RPC 서버 응답 시간 초과');
      }
      // 요청 제한
      if (error.message.includes('429')) {
        return new ChainError('RATE_LIMIT', 'API 요청 한도 초과');
      }
      // 잔액 부족
      if (error.message.includes('insufficient funds')) {
        return new ChainError('INSUFFICIENT_FUNDS', '잔액 부족');
      }
      return error;
    }
    return new Error('Unknown error occurred');
  }

  clearCache() {
    this.clients.clear();
  }

  /**
   * 네트워크 연결 상태 확인
   */
  async testConnection(chainId: number): Promise<{
    connected: boolean;
    blockNumber?: bigint;
    latency?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    try {
      const client = this.getClient(chainId);
      const blockNumber = await client.getBlockNumber();
      const latency = Date.now() - startTime;

      return {
        connected: true,
        blockNumber,
        latency,
      };
    } catch (error: unknown) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * RPC 엔드포인트가 보고하는 체인 ID (eth_chainId)
   */
  async fetchChainId(
    rpcUrl: string,
    timeoutMs: number = RPC_PROBE_TIMEOUT_MS,
  ): Promise<number> {
    const controller =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller?.abort();
        reject(new ChainError('RPC_TIMEOUT', 'RPC 서버 응답 시간 초과'));
      }, timeoutMs);
    });
    try {
      const response = await Promise.race([
        fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_chainId',
            params: [],
          }),
          signal: controller?.signal,
        }),
        timeout,
      ]);
      if (!response.ok) {
        throw new ChainError('RPC_ERROR', `RPC 오류 (HTTP ${response.status})`);
      }
      const body = (await Promise.race([response.json(), timeout])) as {
        result?: unknown;
      };
      const result = body?.result;
      if (typeof result !== 'string' || !/^0x[0-9a-f]+$/i.test(result)) {
        throw new ChainError(
          'RPC_ERROR',
          'RPC가 체인 ID를 반환하지 않았습니다.',
        );
      }
      const chainId = Number(BigInt(result));
      if (!Number.isSafeInteger(chainId) || chainId <= 0) {
        throw new ChainError(
          'RPC_ERROR',
          'RPC가 올바르지 않은 체인 ID를 반환했습니다.',
        );
      }
      return chainId;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * 커스텀 네트워크 추가 전 RPC가 입력한 체인 ID와 같은 체인을 가리키는지 확인한다.
   * 다른 체인의 RPC를 등록하면 서명이 다른 체인에서 재사용될 수 있으므로 일치를 요구한다.
   */
  async verifyRpcChainId(
    rpcUrl: string,
    expectedChainId: number,
  ): Promise<RpcChainIdCheck> {
    try {
      const actualChainId = await this.fetchChainId(rpcUrl);
      return actualChainId === expectedChainId
        ? { ok: true }
        : { ok: false, reason: 'mismatch', actualChainId };
    } catch (error) {
      return {
        ok: false,
        reason: 'unreachable',
        message:
          error instanceof Error ? error.message : 'RPC에 연결할 수 없습니다.',
      };
    }
  }

  /**
   * 지원하는 체인 ID 목록 (기본 + 등록된 커스텀)
   */
  getSupportedChainIds(): number[] {
    return [
      ...Object.keys(CHAIN_MAP).map(Number),
      ...customNetworkRegistry.list().map(network => network.chainId),
    ];
  }

  /**
   * 체인 정보 조회
   */
  getChainInfo(chainId: number): { name: string; isTestnet: boolean } | null {
    const chain = this.getChain(chainId);
    if (!chain) return null;

    return {
      name: chain.name,
      isTestnet: chain.testnet === true,
    };
  }
}

export class ChainError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'ChainError';
  }
}

export const chainClient = new ChainClient();
export { formatEther, parseEther };
