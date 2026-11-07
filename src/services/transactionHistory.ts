/**
 * Blockscout API 기반 트랜잭션 내역 조회 서비스
 *
 * 일반 트랜잭션(txlist)과 ERC-20 전송(tokentx)을 함께 조회해 해시 기준으로 합친다.
 * 조회 실패는 빈 목록이 아니라 오류로 던진다 (화면에서 다시 시도 제공).
 */

import { formatUnits } from 'viem';

export type TransactionKind =
  | 'send'
  | 'receive'
  | 'swap'
  | 'approve'
  | 'contract';

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  /** 표시 수량 (소수 단위 전체 정밀도). 토큰 전송이면 토큰 수량 */
  value: string;
  valueWei: string;
  gasUsed: string;
  gasPrice: string;
  /** 내가 낸 수수료 (네이티브 단위, 소수 문자열). 받은 거래는 '0' */
  fee: string;
  timestamp: number;
  blockNumber: string;
  isError: boolean;
  type: TransactionKind;
  status: 'success' | 'failed' | 'pending';
  /** 토큰 전송이면 토큰 심볼 (없으면 네이티브) */
  tokenSymbol?: string;
  tokenDecimals?: number;
  tokenAddress?: string;
  tokenName?: string;
  /** 스왑에서 받은 쪽 */
  receivedValue?: string;
  receivedSymbol?: string;
  /** 이 기기에서 제출한 거래 */
  isLocal?: boolean;
}

export interface TransactionPage {
  transactions: Transaction[];
  hasMore: boolean;
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
  confirmations?: string;
  input?: string;
  methodId?: string;
  functionName?: string;
  txreceipt_status?: string;
}

interface EtherscanTokenTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  contractAddress: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
  gasUsed?: string;
  gasPrice?: string;
  timeStamp: string;
  blockNumber: string;
}

interface ExplorerResponse<T> {
  status: string;
  message: string;
  result: T[] | string;
}

export class TransactionHistoryError extends Error {
  constructor(message = '거래 내역을 불러오지 못했습니다.') {
    super(message);
    this.name = 'TransactionHistoryError';
  }
}

// Blockscout API 엔드포인트 (무료, API 키 불필요, Etherscan 호환)
const EXPLORER_APIS: Record<number, string> = {
  1: 'https://eth.blockscout.com/api',
  11155111: 'https://eth-sepolia.blockscout.com/api',
  137: 'https://polygon.blockscout.com/api',
  42161: 'https://arbitrum.blockscout.com/api',
  10: 'https://optimism.blockscout.com/api',
  8453: 'https://base.blockscout.com/api',
};

const APPROVE_SELECTOR = '0x095ea7b3';
const NATIVE_DECIMALS = 18;

function lower(value: string | undefined | null): string {
  return (value || '').toLowerCase();
}

function safeBigInt(value: string | undefined | null): bigint {
  try {
    if (!value || value === 'undefined' || value === 'null') return 0n;
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function toUnits(raw: bigint, decimals: number): string {
  try {
    return formatUnits(raw, decimals);
  } catch {
    return '0';
  }
}

function isEmptyResult(message: string | undefined): boolean {
  return /no (transactions|token transfers) found/i.test(message || '');
}

class TransactionHistoryService {
  private cache: Map<string, { data: TransactionPage; timestamp: number }> =
    new Map();
  private cacheDuration = 10000; // 10초 캐시

  isSupported(chainId: number): boolean {
    return !!EXPLORER_APIS[chainId];
  }

  /**
   * 트랜잭션 내역 한 페이지 조회 (일반 + ERC-20)
   * 네트워크/API 오류는 TransactionHistoryError로 던진다.
   */
  async getHistoryPage(
    address: string,
    chainId: number,
    page = 1,
    limit = 20,
    forceRefresh = false,
  ): Promise<TransactionPage> {
    const apiUrl = EXPLORER_APIS[chainId];
    if (!apiUrl) {
      return { transactions: [], hasMore: false };
    }

    const cacheKey = `${lower(address)}-${chainId}-${page}-${limit}`;
    const cached = this.cache.get(cacheKey);
    if (
      !forceRefresh &&
      cached &&
      Date.now() - cached.timestamp < this.cacheDuration
    ) {
      return cached.data;
    }

    const query = `&address=${address}&startblock=0&endblock=99999999&page=${page}&offset=${limit}&sort=desc`;
    const [txs, tokenTxs] = await Promise.all([
      this.fetchList<EtherscanTx>(
        `${apiUrl}?module=account&action=txlist${query}`,
      ),
      // 토큰 전송 조회 실패는 일반 내역을 막지 않는다.
      this.fetchList<EtherscanTokenTx>(
        `${apiUrl}?module=account&action=tokentx${query}`,
      ).catch(error => {
        console.warn('Token transfer history unavailable:', error);
        return [] as EtherscanTokenTx[];
      }),
    ]);

    const transactions = this.merge(txs, tokenTxs, address);
    const result: TransactionPage = {
      transactions,
      hasMore: txs.length >= limit || tokenTxs.length >= limit,
    };

    this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }

  /**
   * 트랜잭션 내역 조회 (첫 페이지 호환 API)
   * 조회 실패 시 오류를 던진다.
   */
  async getTransactions(
    address: string,
    chainId: number,
    page = 1,
    limit = 20,
    forceRefresh = false,
  ): Promise<Transaction[]> {
    const result = await this.getHistoryPage(
      address,
      chainId,
      page,
      limit,
      forceRefresh,
    );
    return result.transactions;
  }

  private async fetchList<T>(url: string): Promise<T[]> {
    let data: ExplorerResponse<T>;
    try {
      const response = await fetch(url);
      if (response && response.ok === false) {
        throw new Error(`HTTP ${response.status}`);
      }
      data = (await response.json()) as ExplorerResponse<T>;
    } catch (error) {
      console.warn('Explorer request failed:', error);
      throw new TransactionHistoryError();
    }

    if (data?.status === '1' && Array.isArray(data.result)) {
      return data.result;
    }
    // "No transactions found" / "No token transfers found" 는 정상 빈 결과
    if (isEmptyResult(data?.message) || isEmptyResult(String(data?.result))) {
      return [];
    }
    console.warn('Explorer API error:', data?.message);
    throw new TransactionHistoryError();
  }

  /**
   * 일반 트랜잭션과 토큰 전송을 해시 기준으로 합친다.
   */
  private merge(
    txs: EtherscanTx[],
    tokenTxs: EtherscanTokenTx[],
    userAddress: string,
  ): Transaction[] {
    const me = lower(userAddress);
    const transfersByHash = new Map<string, EtherscanTokenTx[]>();
    for (const transfer of tokenTxs) {
      if (lower(transfer.from) !== me && lower(transfer.to) !== me) continue;
      const key = lower(transfer.hash);
      const list = transfersByHash.get(key) ?? [];
      list.push(transfer);
      transfersByHash.set(key, list);
    }

    const result = new Map<string, Transaction>();

    for (const tx of txs) {
      const key = lower(tx.hash);
      if (result.has(key)) continue;
      result.set(
        key,
        this.mapTransaction(tx, me, transfersByHash.get(key) ?? []),
      );
    }

    // 내가 보내지 않은 토큰 전송(받은 토큰 등)은 txlist에 없다.
    for (const [key, transfers] of transfersByHash) {
      if (result.has(key)) continue;
      result.set(key, this.mapTokenOnly(transfers, me));
    }

    return [...result.values()].sort((a, b) => b.timestamp - a.timestamp);
  }

  private mapTransaction(
    tx: EtherscanTx,
    me: string,
    transfers: EtherscanTokenTx[],
  ): Transaction {
    const valueWei = safeBigInt(tx.value);
    const feeWei = safeBigInt(tx.gasUsed) * safeBigInt(tx.gasPrice);
    const isSender = lower(tx.from) === me;
    const failed = tx.isError === '1' || tx.txreceipt_status === '0';
    const selector = lower(tx.methodId || (tx.input || '').slice(0, 10));
    const functionName = lower(tx.functionName);

    const base: Transaction = {
      hash: tx.hash,
      from: tx.from,
      to: tx.to || '',
      value: toUnits(valueWei, NATIVE_DECIMALS),
      valueWei: tx.value || '0',
      gasUsed: tx.gasUsed || '0',
      gasPrice: tx.gasPrice || '0',
      // 받은 트랜잭션은 수수료를 내 지갑에서 내지 않음
      fee: isSender ? toUnits(feeWei, NATIVE_DECIMALS) : '0',
      timestamp: parseInt(tx.timeStamp, 10) * 1000,
      blockNumber: tx.blockNumber,
      isError: failed,
      type: isSender ? 'send' : 'receive',
      status: failed ? 'failed' : 'success',
    };

    if (selector === APPROVE_SELECTOR || functionName.startsWith('approve')) {
      return { ...base, type: 'approve', value: '0', tokenAddress: tx.to };
    }

    const outgoing = transfers.filter(t => lower(t.from) === me);
    const incoming = transfers.filter(t => lower(t.to) === me);

    // 보낸 자산(토큰 또는 네이티브)과 받은 자산(토큰)이 함께 있으면 스왑
    if (
      incoming.length > 0 &&
      (outgoing.length > 0 || (isSender && valueWei > 0n))
    ) {
      const received = this.describeTransfer(incoming[0]);
      const sent =
        outgoing.length > 0 ? this.describeTransfer(outgoing[0]) : null;
      return {
        ...base,
        type: 'swap',
        value: sent ? sent.amount : base.value,
        tokenSymbol: sent?.symbol,
        tokenDecimals: sent?.decimals,
        tokenAddress: sent?.address,
        receivedValue: received.amount,
        receivedSymbol: received.symbol,
      };
    }

    const transfer = outgoing[0] ?? incoming[0];
    if (transfer) {
      const info = this.describeTransfer(transfer);
      return {
        ...base,
        type: lower(transfer.from) === me ? 'send' : 'receive',
        // 토큰 전송의 상대방은 토큰 컨트랙트가 아니라 실제 수신/발신자
        from: transfer.from,
        to: transfer.to,
        value: info.amount,
        tokenSymbol: info.symbol,
        tokenDecimals: info.decimals,
        tokenAddress: info.address,
        tokenName: transfer.tokenName,
      };
    }

    // 값 없는 컨트랙트 호출
    if (isSender && valueWei === 0n && selector && selector !== '0x') {
      return { ...base, type: 'contract' };
    }

    return base;
  }

  private mapTokenOnly(transfers: EtherscanTokenTx[], me: string): Transaction {
    const outgoing = transfers.filter(t => lower(t.from) === me);
    const incoming = transfers.filter(t => lower(t.to) === me);
    const first = transfers[0];
    const isSender = outgoing.length > 0;
    const feeWei = isSender
      ? safeBigInt(first.gasUsed) * safeBigInt(first.gasPrice)
      : 0n;

    const base: Transaction = {
      hash: first.hash,
      from: first.from,
      to: first.to,
      value: '0',
      valueWei: '0',
      gasUsed: first.gasUsed || '0',
      gasPrice: first.gasPrice || '0',
      fee: isSender ? toUnits(feeWei, NATIVE_DECIMALS) : '0',
      timestamp: parseInt(first.timeStamp, 10) * 1000,
      blockNumber: first.blockNumber,
      isError: false,
      type: isSender ? 'send' : 'receive',
      status: 'success',
    };

    if (outgoing.length > 0 && incoming.length > 0) {
      const sent = this.describeTransfer(outgoing[0]);
      const received = this.describeTransfer(incoming[0]);
      return {
        ...base,
        type: 'swap',
        value: sent.amount,
        tokenSymbol: sent.symbol,
        tokenDecimals: sent.decimals,
        tokenAddress: sent.address,
        receivedValue: received.amount,
        receivedSymbol: received.symbol,
      };
    }

    const transfer = outgoing[0] ?? incoming[0];
    const info = this.describeTransfer(transfer);
    return {
      ...base,
      from: transfer.from,
      to: transfer.to,
      value: info.amount,
      tokenSymbol: info.symbol,
      tokenDecimals: info.decimals,
      tokenAddress: info.address,
      tokenName: transfer.tokenName,
    };
  }

  private describeTransfer(transfer: EtherscanTokenTx) {
    const decimals = Number.parseInt(transfer.tokenDecimal ?? '', 10);
    const safeDecimals =
      Number.isInteger(decimals) && decimals >= 0 && decimals <= 36
        ? decimals
        : 18;
    return {
      amount: toUnits(safeBigInt(transfer.value), safeDecimals),
      symbol: (transfer.tokenSymbol || '').trim() || '토큰',
      decimals: safeDecimals,
      address: transfer.contractAddress,
    };
  }

  /**
   * 캐시 클리어
   */
  clearCache() {
    this.cache.clear();
  }
}

export const transactionHistoryService = new TransactionHistoryService();
