/**
 * Realm 로컬 데이터베이스 스키마 정의
 */

import Realm from 'realm';

// ============================================================================
// 주소록 스키마
// ============================================================================
export const AddressBookSchema: Realm.ObjectSchema = {
  name: 'AddressBook',
  primaryKey: 'id',
  properties: {
    id: 'string', // UUID
    address: { type: 'string', indexed: true }, // 지갑 주소
    name: 'string', // 별명
    chainId: { type: 'int', default: 1 }, // 체인 ID
    isFavorite: { type: 'bool', default: false },
    notes: { type: 'string', optional: true }, // 메모
    createdAt: 'date',
    updatedAt: 'date',
  },
};

export interface AddressBookEntry {
  id: string;
  address: string;
  name: string;
  chainId: number;
  isFavorite: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// 트랜잭션 캐시 스키마
// ============================================================================
export const TransactionCacheSchema: Realm.ObjectSchema = {
  name: 'TransactionCache',
  primaryKey: 'id',
  properties: {
    id: 'string', // hash-chainId 조합
    hash: { type: 'string', indexed: true },
    chainId: { type: 'int', indexed: true },
    from: { type: 'string', indexed: true },
    to: { type: 'string', indexed: true },
    value: 'string', // ETH 단위
    valueWei: 'string',
    gasUsed: { type: 'string', optional: true },
    gasPrice: 'string',
    gasLimit: { type: 'string', optional: true },
    fee: { type: 'string', optional: true },
    nonce: { type: 'int', optional: true },
    timestamp: { type: 'int', indexed: true },
    blockNumber: { type: 'string', optional: true },
    status: { type: 'string', default: 'pending' }, // pending | confirmed | failed | cancelled
    type: 'string', // send | receive | swap | approve | contract
    method: { type: 'string', optional: true }, // 컨트랙트 메서드명
    tokenSymbol: { type: 'string', optional: true }, // 토큰 전송시
    tokenAmount: { type: 'string', optional: true },
    tokenAddress: { type: 'string', optional: true },
    errorMessage: { type: 'string', optional: true },
    isLocal: { type: 'bool', default: false }, // 로컬에서 생성된 TX
    confirmedAt: { type: 'date', optional: true },
    createdAt: 'date',
    updatedAt: 'date',
  },
};

export interface TransactionCacheEntry {
  id: string;
  hash: string;
  chainId: number;
  from: string;
  to: string;
  value: string;
  valueWei: string;
  gasUsed?: string;
  gasPrice: string;
  gasLimit?: string;
  fee?: string;
  nonce?: number;
  timestamp: number;
  blockNumber?: string;
  status: 'pending' | 'confirmed' | 'failed' | 'cancelled';
  type: 'send' | 'receive' | 'swap' | 'approve' | 'contract';
  method?: string;
  tokenSymbol?: string;
  tokenAmount?: string;
  tokenAddress?: string;
  errorMessage?: string;
  isLocal: boolean;
  confirmedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// ============================================================================
// 토큰 목록 스키마
// ============================================================================
export const TokenListSchema: Realm.ObjectSchema = {
  name: 'TokenList',
  primaryKey: 'id',
  properties: {
    id: 'string', // address-chainId 조합
    address: { type: 'string', indexed: true }, // 토큰 컨트랙트 주소 (native는 'native')
    chainId: { type: 'int', indexed: true },
    symbol: 'string',
    name: 'string',
    decimals: 'int',
    logoUrl: { type: 'string', optional: true },
    coingeckoId: { type: 'string', optional: true },
    isHidden: { type: 'bool', default: false }, // 사용자가 숨김 처리
    isSpam: { type: 'bool', default: false }, // 스팸 토큰 표시
    isCustom: { type: 'bool', default: false }, // 사용자가 추가한 토큰
    sortOrder: { type: 'int', default: 0 }, // 정렬 순서
    lastBalance: { type: 'string', optional: true }, // 마지막 잔액 (오프라인 UX)
    lastBalanceRaw: { type: 'string', optional: true },
    lastPrice: { type: 'double', optional: true }, // 마지막 가격
    lastPriceChange24h: { type: 'double', optional: true },
    lastSyncAt: { type: 'date', optional: true },
    createdAt: 'date',
    updatedAt: 'date',
  },
};

export interface TokenListEntry {
  id: string;
  address: string;
  chainId: number;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  coingeckoId?: string;
  isHidden: boolean;
  isSpam: boolean;
  isCustom: boolean;
  sortOrder: number;
  lastBalance?: string;
  lastBalanceRaw?: string;
  lastPrice?: number;
  lastPriceChange24h?: number;
  lastSyncAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// WalletConnect 세션 로그 스키마
// ============================================================================
export const WCSessionLogSchema: Realm.ObjectSchema = {
  name: 'WCSessionLog',
  primaryKey: 'id',
  properties: {
    id: 'string', // UUID
    topic: { type: 'string', indexed: true },
    dappName: 'string',
    dappUrl: 'string',
    dappIcon: { type: 'string', optional: true },
    chains: 'string[]',
    accounts: 'string[]',
    status: 'string', // active | disconnected | expired
    connectedAt: 'date',
    disconnectedAt: { type: 'date', optional: true },
    expiresAt: { type: 'date', optional: true },
    createdAt: 'date',
    updatedAt: 'date',
  },
};

export interface WCSessionLogEntry {
  id: string;
  topic: string;
  dappName: string;
  dappUrl: string;
  dappIcon?: string;
  chains: string[];
  accounts: string[];
  status: 'active' | 'disconnected' | 'expired';
  connectedAt: Date;
  disconnectedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const WCRequestLogSchema: Realm.ObjectSchema = {
  name: 'WCRequestLog',
  primaryKey: 'id',
  properties: {
    id: 'string', // UUID
    sessionTopic: { type: 'string', indexed: true },
    requestId: 'int',
    method: 'string', // eth_sendTransaction, personal_sign, etc.
    params: 'string', // JSON 문자열
    chainId: { type: 'int', optional: true },
    status: 'string',
    result: { type: 'string', optional: true }, // JSON 문자열
    errorMessage: { type: 'string', optional: true },
    dappName: { type: 'string', optional: true },
    requestedAt: 'date',
    respondedAt: { type: 'date', optional: true },
    createdAt: 'date',
  },
};

export interface WCRequestLogEntry {
  id: string;
  sessionTopic: string;
  requestId: number;
  method: string;
  params: string;
  chainId?: number;
  status: 'pending' | 'approved' | 'rejected' | 'failed';
  result?: string;
  errorMessage?: string;
  dappName?: string;
  requestedAt: Date;
  respondedAt?: Date;
  createdAt: Date;
}

// ============================================================================
// 동기화 상태 스키마
// ============================================================================
export const SyncStatusSchema: Realm.ObjectSchema = {
  name: 'SyncStatus',
  primaryKey: 'key',
  properties: {
    key: 'string', // 고유 키 (예: 'balance-0x...-1', 'tokens-0x...-137')
    type: 'string', // balance | tokens | transactions | nfts
    address: { type: 'string', indexed: true },
    chainId: 'int',
    lastSyncAt: 'date',
    status: 'string', // synced | syncing | error
    errorMessage: { type: 'string', optional: true },
    data: { type: 'string', optional: true }, // JSON 문자열
  },
};

export interface SyncStatusEntry {
  key: string;
  type: 'balance' | 'tokens' | 'transactions' | 'nfts';
  address: string;
  chainId: number;
  lastSyncAt: Date;
  status: 'synced' | 'syncing' | 'error';
  errorMessage?: string;
  data?: string;
}

// ============================================================================
// 잔액 스냅샷 스키마
// ============================================================================
export const BalanceSnapshotSchema: Realm.ObjectSchema = {
  name: 'BalanceSnapshot',
  primaryKey: 'id',
  properties: {
    id: 'string', // address-chainId
    address: { type: 'string', indexed: true },
    chainId: { type: 'int', indexed: true },
    nativeBalance: 'string', // ETH 단위
    nativeBalanceWei: 'string',
    nativePrice: { type: 'double', optional: true },
    totalValueUsd: { type: 'double', optional: true },
    lastSyncAt: 'date',
  },
};

export interface BalanceSnapshotEntry {
  id: string;
  address: string;
  chainId: number;
  nativeBalance: string;
  nativeBalanceWei: string;
  nativePrice?: number;
  totalValueUsd?: number;
  lastSyncAt: Date;
}

// ============================================================================
// 사용자 설정 스키마
// ============================================================================
export const UserPreferencesSchema: Realm.ObjectSchema = {
  name: 'UserPreferences',
  primaryKey: 'key',
  properties: {
    key: 'string',
    value: 'string', // JSON 문자열
    updatedAt: 'date',
  },
};

export interface UserPreferencesEntry {
  key: string;
  value: string;
  updatedAt: Date;
}

// ============================================================================
// 모든 스키마 내보내기
// ============================================================================
export const ALL_SCHEMAS = [
  AddressBookSchema,
  TransactionCacheSchema,
  TokenListSchema,
  WCSessionLogSchema,
  WCRequestLogSchema,
  SyncStatusSchema,
  BalanceSnapshotSchema,
  UserPreferencesSchema,
];

export const SCHEMA_VERSION = 1;
