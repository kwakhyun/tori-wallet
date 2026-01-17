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

class ChainClient {
  private clients: Map<number, PublicClient> = new Map();
  private retryCount = 3;
  private retryDelay = 1000;

  getClient(chainId: number, rpcUrl?: string): PublicClient {
    const cacheKey = chainId;

    if (this.clients.has(cacheKey)) {
      return this.clients.get(cacheKey)!;
    }

    const chain = CHAIN_MAP[chainId];
    if (!chain) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }

    // rpcUrl이 없으면 기본 RPC 사용
    const finalRpcUrl = rpcUrl || DEFAULT_RPC_URLS[chainId];

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
   * 지원하는 체인 ID 목록
   */
  getSupportedChainIds(): number[] {
    return Object.keys(CHAIN_MAP).map(Number);
  }

  /**
   * 체인 정보 조회
   */
  getChainInfo(chainId: number): { name: string; isTestnet: boolean } | null {
    const chain = CHAIN_MAP[chainId];
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
