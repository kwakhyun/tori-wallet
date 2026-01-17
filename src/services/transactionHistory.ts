/**
 * Blockscout API 기반 트랜잭션 내역 조회 서비스
 */

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string; // ETH 단위
  valueWei: string;
  gasUsed: string;
  gasPrice: string;
  fee: string; // ETH 단위
  timestamp: number;
  blockNumber: string;
  isError: boolean;
  type: 'send' | 'receive';
  status: 'success' | 'failed' | 'pending';
}

interface EtherscanTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  timeStamp: string;
  blockNumber: string;
  isError: string;
  confirmations: string;
}

// Blockscout API 엔드포인트 (무료, API 키 불필요)
const EXPLORER_APIS: Record<number, string> = {
  1: 'https://eth.blockscout.com/api',
  11155111: 'https://eth-sepolia.blockscout.com/api',
  137: 'https://polygon.blockscout.com/api',
  42161: 'https://arbitrum.blockscout.com/api',
  10: 'https://optimism.blockscout.com/api',
  8453: 'https://base.blockscout.com/api',
};

class TransactionHistoryService {
  private cache: Map<string, { data: Transaction[]; timestamp: number }> =
    new Map();
  private cacheDuration = 10000; // 10초 캐시

  constructor() {
    // 시작 시 캐시 클리어
    this.cache.clear();
  }

  /**
   * 트랜잭션 내역 조회
   */
  async getTransactions(
    address: string,
    chainId: number,
    page = 1,
    limit = 20,
    forceRefresh = false,
  ): Promise<Transaction[]> {
    const cacheKey = `${address}-${chainId}-${page}`;
    const cached = this.cache.get(cacheKey);

    // forceRefresh가 true이면 캐시 무시
    if (
      !forceRefresh &&
      cached &&
      Date.now() - cached.timestamp < this.cacheDuration
    ) {
      return cached.data;
    }

    const apiUrl = EXPLORER_APIS[chainId];
    if (!apiUrl) {
      console.warn(`No explorer API for chain ${chainId}`);
      return [];
    }

    try {
      const url = `${apiUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=${page}&offset=${limit}&sort=desc`;

      const response = await fetch(url);
      const data = (await response.json()) as {
        status: string;
        message: string;
        result: EtherscanTx[] | string;
      };

      if (data.status !== '1' || !Array.isArray(data.result)) {
        // "No transactions found" 도 정상 케이스
        if (data.message === 'No transactions found') {
          return [];
        }
        console.warn('Etherscan API error:', data.message);
        return [];
      }

      const transactions = data.result.map((tx: EtherscanTx) =>
        this.mapTransaction(tx, address),
      );

      this.cache.set(cacheKey, {
        data: transactions,
        timestamp: Date.now(),
      });

      return transactions;
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
      return [];
    }
  }

  /**
   * API 응답을 Transaction 형식으로 변환
   */
  private mapTransaction(tx: EtherscanTx, userAddress: string): Transaction {
    const valueWei = this.safeBigInt(tx.value);
    const gasUsed = this.safeBigInt(tx.gasUsed);
    const gasPrice = this.safeBigInt(tx.gasPrice);
    const feeWei = gasUsed * gasPrice;

    const isSend = tx.from.toLowerCase() === userAddress.toLowerCase();

    // 받은 트랜잭션은 수수료를 내 지갑에서 내지 않음
    const displayFee = isSend ? this.formatEther(feeWei) : '0';
    const displayValue = this.formatEther(valueWei);

    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to || '',
      value: displayValue,
      valueWei: tx.value,
      gasUsed: tx.gasUsed || '0',
      gasPrice: tx.gasPrice || '0',
      fee: displayFee,
      timestamp: parseInt(tx.timeStamp, 10) * 1000,
      blockNumber: tx.blockNumber,
      isError: tx.isError === '1',
      type: isSend ? 'send' : 'receive',
      status: tx.isError === '1' ? 'failed' : 'success',
    };
  }

  /**
   * Wei를 ETH로 변환
   */
  private formatEther(wei: bigint): string {
    try {
      const weiStr = wei.toString();
      const eth = parseFloat(weiStr) / 1e18;

      if (isNaN(eth) || eth === 0) return '0';
      if (eth < 0.000001) return '< 0.000001';
      return eth.toFixed(6);
    } catch {
      return '0';
    }
  }

  /**
   * 안전하게 BigInt 변환
   */
  private safeBigInt(value: string | undefined | null): bigint {
    try {
      if (!value || value === '' || value === 'undefined' || value === 'null') {
        return 0n;
      }
      return BigInt(value);
    } catch {
      return 0n;
    }
  }

  /**
   * 캐시 클리어
   */
  clearCache() {
    this.cache.clear();
  }
}

export const transactionHistoryService = new TransactionHistoryService();
