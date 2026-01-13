/**
 * Tori Wallet - Local Database
 * 트랜잭션 히스토리 및 로컬 데이터 저장소
 *
 * 현재는 AsyncStorage 기반으로 구현
 * Realm 도입 시 이 인터페이스를 유지하며 구현체만 교체
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

// ============ 스키마 정의 ============

/**
 * 트랜잭션 레코드 스키마
 * Realm 도입 시: @realm/react의 Realm.Object로 변환
 */
export interface TransactionRecord {
  id: string; // Primary Key
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  chainId: number;
  status: 'pending' | 'confirmed' | 'failed';
  type: 'send' | 'receive' | 'swap' | 'approve' | 'contract';
  gasUsed?: string;
  gasPrice?: string;
  nonce?: number;
  blockNumber?: number;
  timestamp: number;
  error?: string;
}

/**
 * 토큰 정보 스키마
 */
export interface TokenInfo {
  address: string; // Primary Key
  chainId: number;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
  isCustom: boolean;
  addedAt: number;
}

/**
 * dApp 연결 정보 스키마
 */
export interface DAppConnection {
  topic: string; // Primary Key
  name: string;
  url: string;
  iconUrl?: string;
  chainIds: number[];
  connectedAt: number;
  lastActiveAt: number;
}

/**
 * 스왑 히스토리 스키마
 */
export interface SwapRecord {
  id: string; // Primary Key
  txHash: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  fromSymbol: string;
  toSymbol: string;
  chainId: number;
  provider: string;
  priceImpact?: number;
  slippage: number;
  status: 'pending' | 'completed' | 'failed';
  timestamp: number;
}

// ============ 저장소 키 ============

const STORAGE_KEYS = {
  TRANSACTIONS: 'tori_transactions',
  TOKENS: 'tori_custom_tokens',
  DAPP_CONNECTIONS: 'tori_dapp_connections',
  SWAPS: 'tori_swap_history',
} as const;

// ============ 데이터베이스 서비스 ============

class LocalDatabase {
  // ============ 트랜잭션 ============

  async getTransactions(
    chainId?: number,
    limit = 50,
  ): Promise<TransactionRecord[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      if (!data) return [];

      let transactions: TransactionRecord[] = JSON.parse(data);

      if (chainId !== undefined) {
        transactions = transactions.filter(tx => tx.chainId === chainId);
      }

      return transactions
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    } catch (error) {
      logger.error('Failed to get transactions', error);
      return [];
    }
  }

  async addTransaction(tx: TransactionRecord): Promise<void> {
    try {
      const transactions = await this.getTransactions();
      const existing = transactions.find(t => t.id === tx.id);

      if (existing) {
        // 업데이트
        const updated = transactions.map(t => (t.id === tx.id ? tx : t));
        await AsyncStorage.setItem(
          STORAGE_KEYS.TRANSACTIONS,
          JSON.stringify(updated),
        );
      } else {
        // 새로 추가 (최대 500개 유지)
        const updated = [tx, ...transactions].slice(0, 500);
        await AsyncStorage.setItem(
          STORAGE_KEYS.TRANSACTIONS,
          JSON.stringify(updated),
        );
      }

      logger.debug('Transaction saved', { id: tx.id });
    } catch (error) {
      logger.error('Failed to add transaction', error);
    }
  }

  async updateTransactionStatus(
    id: string,
    status: TransactionRecord['status'],
    updates?: Partial<TransactionRecord>,
  ): Promise<void> {
    try {
      const transactions = await this.getTransactions();
      const updated = transactions.map(tx =>
        tx.id === id ? { ...tx, status, ...updates } : tx,
      );
      await AsyncStorage.setItem(
        STORAGE_KEYS.TRANSACTIONS,
        JSON.stringify(updated),
      );
    } catch (error) {
      logger.error('Failed to update transaction status', error);
    }
  }

  async getTransactionByHash(hash: string): Promise<TransactionRecord | null> {
    const transactions = await this.getTransactions();
    return transactions.find(tx => tx.hash === hash) || null;
  }

  // ============ 커스텀 토큰 ============

  async getCustomTokens(chainId?: number): Promise<TokenInfo[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.TOKENS);
      if (!data) return [];

      let tokens: TokenInfo[] = JSON.parse(data);

      if (chainId !== undefined) {
        tokens = tokens.filter(t => t.chainId === chainId);
      }

      return tokens;
    } catch (error) {
      logger.error('Failed to get custom tokens', error);
      return [];
    }
  }

  async addCustomToken(token: TokenInfo): Promise<void> {
    try {
      const tokens = await this.getCustomTokens();
      const key = `${token.chainId}_${token.address.toLowerCase()}`;
      const existing = tokens.find(
        t => `${t.chainId}_${t.address.toLowerCase()}` === key,
      );

      if (existing) {
        throw new Error('Token already exists');
      }

      await AsyncStorage.setItem(
        STORAGE_KEYS.TOKENS,
        JSON.stringify([...tokens, token]),
      );

      logger.info('Custom token added', { symbol: token.symbol });
    } catch (error) {
      logger.error('Failed to add custom token', error);
      throw error;
    }
  }

  async removeCustomToken(address: string, chainId: number): Promise<void> {
    try {
      const tokens = await this.getCustomTokens();
      const filtered = tokens.filter(
        t =>
          !(
            t.address.toLowerCase() === address.toLowerCase() &&
            t.chainId === chainId
          ),
      );
      await AsyncStorage.setItem(STORAGE_KEYS.TOKENS, JSON.stringify(filtered));
    } catch (error) {
      logger.error('Failed to remove custom token', error);
    }
  }

  // ============ dApp 연결 ============

  async getDAppConnections(): Promise<DAppConnection[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.DAPP_CONNECTIONS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      logger.error('Failed to get dApp connections', error);
      return [];
    }
  }

  async saveDAppConnection(connection: DAppConnection): Promise<void> {
    try {
      const connections = await this.getDAppConnections();
      const existing = connections.find(c => c.topic === connection.topic);

      if (existing) {
        const updated = connections.map(c =>
          c.topic === connection.topic ? { ...c, lastActiveAt: Date.now() } : c,
        );
        await AsyncStorage.setItem(
          STORAGE_KEYS.DAPP_CONNECTIONS,
          JSON.stringify(updated),
        );
      } else {
        await AsyncStorage.setItem(
          STORAGE_KEYS.DAPP_CONNECTIONS,
          JSON.stringify([...connections, connection]),
        );
      }
    } catch (error) {
      logger.error('Failed to save dApp connection', error);
    }
  }

  async removeDAppConnection(topic: string): Promise<void> {
    try {
      const connections = await this.getDAppConnections();
      const filtered = connections.filter(c => c.topic !== topic);
      await AsyncStorage.setItem(
        STORAGE_KEYS.DAPP_CONNECTIONS,
        JSON.stringify(filtered),
      );
    } catch (error) {
      logger.error('Failed to remove dApp connection', error);
    }
  }

  // ============ 스왑 히스토리 ============

  async getSwapHistory(chainId?: number, limit = 50): Promise<SwapRecord[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.SWAPS);
      if (!data) return [];

      let swaps: SwapRecord[] = JSON.parse(data);

      if (chainId !== undefined) {
        swaps = swaps.filter(s => s.chainId === chainId);
      }

      return swaps.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    } catch (error) {
      logger.error('Failed to get swap history', error);
      return [];
    }
  }

  async addSwapRecord(swap: SwapRecord): Promise<void> {
    try {
      const swaps = await this.getSwapHistory();
      const updated = [swap, ...swaps].slice(0, 200); // 최대 200개 유지
      await AsyncStorage.setItem(STORAGE_KEYS.SWAPS, JSON.stringify(updated));
      logger.debug('Swap record saved', { id: swap.id });
    } catch (error) {
      logger.error('Failed to add swap record', error);
    }
  }

  async updateSwapStatus(
    id: string,
    status: SwapRecord['status'],
  ): Promise<void> {
    try {
      const swaps = await this.getSwapHistory();
      const updated = swaps.map(s => (s.id === id ? { ...s, status } : s));
      await AsyncStorage.setItem(STORAGE_KEYS.SWAPS, JSON.stringify(updated));
    } catch (error) {
      logger.error('Failed to update swap status', error);
    }
  }

  // ============ 유틸리티 ============

  async clearAllData(): Promise<void> {
    try {
      await Promise.all(
        Object.values(STORAGE_KEYS).map(key => AsyncStorage.removeItem(key)),
      );
      logger.info('All local data cleared');
    } catch (error) {
      logger.error('Failed to clear all data', error);
    }
  }

  async getStorageSize(): Promise<number> {
    try {
      let totalSize = 0;
      for (const key of Object.values(STORAGE_KEYS)) {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          totalSize += new Blob([data]).size;
        }
      }
      return totalSize;
    } catch (error) {
      logger.error('Failed to get storage size', error);
      return 0;
    }
  }
}

export const localDatabase = new LocalDatabase();
