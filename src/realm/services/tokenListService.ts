/**
 * Tori Wallet - Token List Service (Realm)
 * 토큰 목록 관리 (숨김/스팸/사용자 정의)
 */

import { realmDB } from '../database';
import type { TokenListEntry } from '../schemas';
import { createLogger } from '@/utils/logger';

const logger = createLogger('TokenList');

export interface CreateTokenInput {
  address: string;
  chainId: number;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  coingeckoId?: string;
  isCustom?: boolean;
}

export interface UpdateTokenInput {
  isHidden?: boolean;
  isSpam?: boolean;
  sortOrder?: number;
  lastBalance?: string;
  lastBalanceRaw?: string;
  lastPrice?: number;
  lastPriceChange24h?: number;
  lastSyncAt?: Date;
}

class TokenListService {
  private static instance: TokenListService;

  private constructor() {}

  static getInstance(): TokenListService {
    if (!TokenListService.instance) {
      TokenListService.instance = new TokenListService();
    }
    return TokenListService.instance;
  }

  /**
   * 토큰 ID 생성
   */
  private generateId(address: string, chainId: number): string {
    return `${address.toLowerCase()}-${chainId}`;
  }

  /**
   * 토큰 추가
   */
  async addToken(input: CreateTokenInput): Promise<TokenListEntry> {
    const realm = await realmDB.getRealm();
    const now = new Date();
    const id = this.generateId(input.address, input.chainId);

    // 이미 존재하는지 확인
    const existing = realm.objectForPrimaryKey<TokenListEntry>('TokenList', id);
    if (existing) {
      logger.info(`Token already exists: ${id}`);
      return existing;
    }

    const entry: TokenListEntry = {
      id,
      address: input.address.toLowerCase(),
      chainId: input.chainId,
      symbol: input.symbol,
      name: input.name,
      decimals: input.decimals,
      logoUrl: input.logoUrl,
      coingeckoId: input.coingeckoId,
      isHidden: false,
      isSpam: false,
      isCustom: input.isCustom ?? false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    let created: TokenListEntry | null = null;

    realm.write(() => {
      created = realm.create<TokenListEntry>('TokenList', entry);
    });

    logger.info(`Token added: ${input.symbol} (${input.address})`);
    return created!;
  }

  /**
   * 여러 토큰 일괄 추가 (기본 토큰 초기화용)
   */
  async addTokensBatch(tokens: CreateTokenInput[]): Promise<number> {
    const realm = await realmDB.getRealm();
    const now = new Date();
    let addedCount = 0;

    realm.write(() => {
      for (const token of tokens) {
        const id = this.generateId(token.address, token.chainId);
        const existing = realm.objectForPrimaryKey<TokenListEntry>(
          'TokenList',
          id,
        );

        if (!existing) {
          realm.create<TokenListEntry>('TokenList', {
            id,
            address: token.address.toLowerCase(),
            chainId: token.chainId,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            logoUrl: token.logoUrl,
            coingeckoId: token.coingeckoId,
            isHidden: false,
            isSpam: false,
            isCustom: token.isCustom ?? false,
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
          });
          addedCount++;
        }
      }
    });

    logger.info(`Added ${addedCount} tokens in batch`);
    return addedCount;
  }

  /**
   * 토큰 업데이트
   */
  async updateToken(
    address: string,
    chainId: number,
    input: UpdateTokenInput,
  ): Promise<TokenListEntry | null> {
    const realm = await realmDB.getRealm();
    const id = this.generateId(address, chainId);
    const entry = realm.objectForPrimaryKey<TokenListEntry>('TokenList', id);

    if (!entry) {
      logger.warn(`Token not found: ${id}`);
      return null;
    }

    realm.write(() => {
      if (input.isHidden !== undefined) entry.isHidden = input.isHidden;
      if (input.isSpam !== undefined) entry.isSpam = input.isSpam;
      if (input.sortOrder !== undefined) entry.sortOrder = input.sortOrder;
      if (input.lastBalance !== undefined)
        entry.lastBalance = input.lastBalance;
      if (input.lastBalanceRaw !== undefined)
        entry.lastBalanceRaw = input.lastBalanceRaw;
      if (input.lastPrice !== undefined) entry.lastPrice = input.lastPrice;
      if (input.lastPriceChange24h !== undefined)
        entry.lastPriceChange24h = input.lastPriceChange24h;
      if (input.lastSyncAt !== undefined) entry.lastSyncAt = input.lastSyncAt;
      entry.updatedAt = new Date();
    });

    return entry;
  }

  /**
   * 잔액 스냅샷 업데이트 (오프라인 UX용)
   */
  async updateBalanceSnapshot(
    address: string,
    chainId: number,
    balance: string,
    balanceRaw: string,
    price?: number,
    priceChange24h?: number,
  ): Promise<void> {
    await this.updateToken(address, chainId, {
      lastBalance: balance,
      lastBalanceRaw: balanceRaw,
      lastPrice: price,
      lastPriceChange24h: priceChange24h,
      lastSyncAt: new Date(),
    });
  }

  /**
   * 토큰 숨기기
   */
  async hideToken(address: string, chainId: number): Promise<boolean> {
    const result = await this.updateToken(address, chainId, { isHidden: true });
    return result !== null;
  }

  /**
   * 토큰 표시하기
   */
  async showToken(address: string, chainId: number): Promise<boolean> {
    const result = await this.updateToken(address, chainId, {
      isHidden: false,
    });
    return result !== null;
  }

  /**
   * 스팸 토큰 표시
   */
  async markAsSpam(address: string, chainId: number): Promise<boolean> {
    const result = await this.updateToken(address, chainId, {
      isSpam: true,
      isHidden: true,
    });
    return result !== null;
  }

  /**
   * 스팸 해제
   */
  async unmarkSpam(address: string, chainId: number): Promise<boolean> {
    const result = await this.updateToken(address, chainId, {
      isSpam: false,
      isHidden: false,
    });
    return result !== null;
  }

  /**
   * 토큰 조회
   */
  async getToken(
    address: string,
    chainId: number,
  ): Promise<TokenListEntry | null> {
    const realm = await realmDB.getRealm();
    const id = this.generateId(address, chainId);
    return realm.objectForPrimaryKey<TokenListEntry>('TokenList', id) ?? null;
  }

  /**
   * 체인별 토큰 목록 조회 (숨김/스팸 제외)
   */
  async getVisibleTokens(chainId: number): Promise<TokenListEntry[]> {
    const realm = await realmDB.getRealm();
    const results = realm
      .objects<TokenListEntry>('TokenList')
      .filtered(
        'chainId == $0 AND isHidden == false AND isSpam == false',
        chainId,
      )
      .sorted([
        ['sortOrder', false],
        ['symbol', false],
      ]);

    return Array.from(results);
  }

  /**
   * 체인별 모든 토큰 목록 조회 (숨김 포함)
   */
  async getAllTokens(chainId: number): Promise<TokenListEntry[]> {
    const realm = await realmDB.getRealm();
    const results = realm
      .objects<TokenListEntry>('TokenList')
      .filtered('chainId == $0', chainId)
      .sorted([
        ['isHidden', false],
        ['sortOrder', false],
        ['symbol', false],
      ]);

    return Array.from(results);
  }

  /**
   * 숨긴 토큰 목록
   */
  async getHiddenTokens(chainId?: number): Promise<TokenListEntry[]> {
    const realm = await realmDB.getRealm();
    let query = 'isHidden == true';

    if (chainId !== undefined) {
      query += ` AND chainId == ${chainId}`;
    }

    const results = realm
      .objects<TokenListEntry>('TokenList')
      .filtered(query)
      .sorted('symbol');

    return Array.from(results);
  }

  /**
   * 스팸 토큰 목록
   */
  async getSpamTokens(chainId?: number): Promise<TokenListEntry[]> {
    const realm = await realmDB.getRealm();
    let query = 'isSpam == true';

    if (chainId !== undefined) {
      query += ` AND chainId == ${chainId}`;
    }

    const results = realm
      .objects<TokenListEntry>('TokenList')
      .filtered(query)
      .sorted('symbol');

    return Array.from(results);
  }

  /**
   * 사용자 정의 토큰 목록
   */
  async getCustomTokens(chainId?: number): Promise<TokenListEntry[]> {
    const realm = await realmDB.getRealm();
    let query = 'isCustom == true';

    if (chainId !== undefined) {
      query += ` AND chainId == ${chainId}`;
    }

    const results = realm
      .objects<TokenListEntry>('TokenList')
      .filtered(query)
      .sorted('symbol');

    return Array.from(results);
  }

  /**
   * 토큰 검색
   */
  async searchTokens(
    query: string,
    chainId?: number,
  ): Promise<TokenListEntry[]> {
    const realm = await realmDB.getRealm();
    let filter =
      'symbol CONTAINS[c] $0 OR name CONTAINS[c] $0 OR address CONTAINS[c] $0';
    const params: (string | number)[] = [query];

    if (chainId !== undefined) {
      filter += ' AND chainId == $1';
      params.push(chainId);
    }

    const results = realm
      .objects<TokenListEntry>('TokenList')
      .filtered(filter, ...params)
      .sorted('symbol');

    return Array.from(results);
  }

  /**
   * 토큰 삭제 (사용자 정의 토큰만)
   */
  async deleteToken(address: string, chainId: number): Promise<boolean> {
    const realm = await realmDB.getRealm();
    const id = this.generateId(address, chainId);
    const entry = realm.objectForPrimaryKey<TokenListEntry>('TokenList', id);

    if (!entry) {
      return false;
    }

    if (!entry.isCustom) {
      logger.warn('Cannot delete non-custom token');
      return false;
    }

    realm.write(() => {
      realm.delete(entry);
    });

    logger.info(`Token deleted: ${address}`);
    return true;
  }

  /**
   * 정렬 순서 업데이트
   */
  async updateSortOrder(tokenIds: string[], chainId: number): Promise<void> {
    const realm = await realmDB.getRealm();

    realm.write(() => {
      tokenIds.forEach((tokenId, index) => {
        const id = this.generateId(tokenId, chainId);
        const entry = realm.objectForPrimaryKey<TokenListEntry>(
          'TokenList',
          id,
        );
        if (entry) {
          entry.sortOrder = index;
          entry.updatedAt = new Date();
        }
      });
    });

    logger.info(`Updated sort order for ${tokenIds.length} tokens`);
  }

  /**
   * 마지막 동기화된 잔액 가져오기 (오프라인 UX)
   */
  async getLastKnownBalances(
    chainId: number,
  ): Promise<Map<string, { balance: string; price?: number }>> {
    const realm = await realmDB.getRealm();
    const results = realm
      .objects<TokenListEntry>('TokenList')
      .filtered('chainId == $0 AND lastBalance != null', chainId);

    const balances = new Map<string, { balance: string; price?: number }>();

    for (const token of results) {
      if (token.lastBalance) {
        balances.set(token.address, {
          balance: token.lastBalance,
          price: token.lastPrice,
        });
      }
    }

    return balances;
  }

  /**
   * 전체 토큰 수
   */
  async count(chainId?: number): Promise<number> {
    const realm = await realmDB.getRealm();

    if (chainId !== undefined) {
      return realm
        .objects<TokenListEntry>('TokenList')
        .filtered('chainId == $0', chainId).length;
    }

    return realm.objects<TokenListEntry>('TokenList').length;
  }

  /**
   * 모든 토큰 삭제
   */
  async deleteAll(): Promise<void> {
    await realmDB.deleteAllOf('TokenList');
    logger.info('All tokens deleted');
  }
}

export const tokenListService = TokenListService.getInstance();
