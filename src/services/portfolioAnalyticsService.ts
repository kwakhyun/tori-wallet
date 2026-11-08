/**
 * 포트폴리오 분석 및 통계 서비스
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Token } from './tokenService';
import { isSnapshotReliable, tokenUsdValue } from './tokenValuation';

// 합산 규칙은 홈/포트폴리오와 같은 tokenValuation 모듈을 쓴다 (기존 import 경로 호환).
export {
  isSnapshotReliable,
  snapshotBlocker,
  tokenUsdValue,
} from './tokenValuation';
export type { SnapshotBlocker } from './tokenValuation';

// 포트폴리오 스냅샷
export interface PortfolioSnapshot {
  timestamp: number;
  totalValue: number;
  tokens: { symbol: string; value: number; balance: string }[];
}

// 자산 배분 데이터
export interface AssetAllocation {
  symbol: string;
  name: string;
  value: number;
  percentage: number;
  color: string;
  logoUrl?: string;
}

// 포트폴리오 통계
// 비교할 스냅샷이 기간 안에 없으면 변동 값은 null('—' 표시)이다.
export interface PortfolioStats {
  totalValue: number;
  change24h: number | null;
  changePercent24h: number | null;
  change7d: number | null;
  changePercent7d: number | null;
  change30d: number | null;
  changePercent30d: number | null;
  /**
   * 기록된 총 자산액 중 최고/최저/평균 (토큰 가격이 아님).
   * 기록도 없고 지금 총액도 믿을 수 없으면 null('—', 요약 카드 숨김)이다.
   */
  highestValue: number | null;
  lowestValue: number | null;
  averageValue: number | null;
}

// 성과 지표
export interface PerformanceMetrics {
  totalReturn: number;
  totalReturnPercent: number;
  /** 가격을 아는 보유 자산이 2개 이상일 때만 계산 */
  bestPerformer: { symbol: string; change: number } | null;
  worstPerformer: { symbol: string; change: number } | null;
  /** 보유 자산 간 24시간 변동률의 표준편차(%p). 자산이 2개 미만이면 null */
  volatility: number | null;
}

export type TokenLike = Pick<Token, 'symbol' | 'value' | 'balance'> &
  Partial<
    Pick<
      Token,
      | 'name'
      | 'usdValue'
      | 'priceAvailable'
      | 'balanceError'
      | 'balanceRaw'
      | 'isTestnet'
      | 'priceChange24h'
      | 'logoUrl'
      | 'coingeckoId'
      | 'hasPriceSource'
    >
  >;

const DAY_MS = 24 * 60 * 60 * 1000;

// 차트용 색상 팔레트
const CHART_COLORS = [
  '#6366F1', // Primary (Indigo)
  '#22C55E', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#14B8A6', // Teal
  '#F97316', // Orange
  '#3B82F6', // Blue
  '#84CC16', // Lime
];

const STORAGE_KEY = 'tori_portfolio_history';
const MAX_SNAPSHOTS = 365; // 최대 1년치 데이터

export class PortfolioAnalyticsService {
  private historyCache = new Map<string, PortfolioSnapshot[]>();
  private writes = new Map<string, Promise<void>>();
  private generation = 0;
  private clearing: Promise<void> | null = null;

  private key(address: string, chainId: number) {
    return `${STORAGE_KEY}_${address.toLowerCase()}_${chainId}`;
  }
  private copy(history: PortfolioSnapshot[]) {
    return history.map(snapshot => ({
      ...snapshot,
      tokens: snapshot.tokens.map(token => ({ ...token })),
    }));
  }

  /**
   * 포트폴리오 스냅샷 저장
   */
  async saveSnapshot(
    address: string,
    chainId: number,
    tokens: TokenLike[],
  ): Promise<boolean> {
    if (this.clearing) return false;
    // 조회 실패/가격 미확인/테스트넷 데이터는 기록하지 않는다.
    if (!isSnapshotReliable(tokens)) return false;
    const key = this.key(address, chainId);
    const generation = this.generation;
    const task = (this.writes.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => {
        if (generation !== this.generation) return;
        return this.writeSnapshot(address, chainId, tokens);
      });
    this.writes.set(key, task);
    try {
      await task;
    } finally {
      if (this.writes.get(key) === task) this.writes.delete(key);
    }
    return true;
  }

  private async writeSnapshot(
    address: string,
    chainId: number,
    tokens: TokenLike[],
  ) {
    const key = this.key(address, chainId);
    const generation = this.generation;
    const history = await this.readHistory(address, chainId);
    if (generation !== this.generation) return;

    const totalValue = tokens.reduce(
      (sum, t) => sum + (tokenUsdValue(t) ?? 0),
      0,
    );

    const snapshot: PortfolioSnapshot = {
      timestamp: Date.now(),
      totalValue,
      tokens: tokens.map(t => ({
        symbol: t.symbol,
        value: tokenUsdValue(t) ?? 0,
        balance: t.balance,
      })),
    };

    // 같은 날 데이터가 있으면 업데이트
    const today = new Date().toDateString();
    const existingIndex = history.findIndex(
      s => new Date(s.timestamp).toDateString() === today,
    );

    if (existingIndex >= 0) {
      history[existingIndex] = snapshot;
    } else {
      history.push(snapshot);
    }

    // 최대 개수 유지
    while (history.length > MAX_SNAPSHOTS) {
      history.shift();
    }

    await AsyncStorage.setItem(key, JSON.stringify(history));
    if (generation === this.generation)
      this.historyCache.set(key, this.copy(history));
  }

  /**
   * 포트폴리오 히스토리 조회
   */
  async getHistory(
    address: string,
    chainId: number,
  ): Promise<PortfolioSnapshot[]> {
    await this.writes.get(this.key(address, chainId));
    return this.readHistory(address, chainId);
  }

  private async readHistory(
    address: string,
    chainId: number,
  ): Promise<PortfolioSnapshot[]> {
    const key = this.key(address, chainId);
    const cached = this.historyCache.get(key);
    if (cached) return this.copy(cached);
    const generation = this.generation;
    try {
      const data =
        (await AsyncStorage.getItem(key)) ??
        (address !== address.toLowerCase()
          ? await AsyncStorage.getItem(`${STORAGE_KEY}_${address}_${chainId}`)
          : null);
      const history: PortfolioSnapshot[] = data ? JSON.parse(data) : [];
      if (!Array.isArray(history)) return [];
      if (generation === this.generation)
        this.historyCache.set(key, this.copy(history));
      return this.copy(history);
    } catch {
      return [];
    }
  }

  clearHistory(): Promise<void> {
    if (this.clearing) return this.clearing;
    this.clearCache();
    const task = (async () => {
      await Promise.allSettled(this.writes.values());
      const keys = await AsyncStorage.getAllKeys();
      await Promise.all(
        keys
          .filter(key => key.startsWith(`${STORAGE_KEY}_`))
          .map(key => AsyncStorage.removeItem(key)),
      );
    })().finally(() => {
      this.clearCache();
      this.clearing = null;
    });
    this.clearing = task;
    return task;
  }

  /**
   * 자산 배분 계산
   */
  calculateAllocation(tokens: TokenLike[]): AssetAllocation[] {
    const priced = tokens
      .map(token => ({ token, value: tokenUsdValue(token) ?? 0 }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
    const totalValue = priced.reduce((sum, item) => sum + item.value, 0);

    if (totalValue === 0) return [];

    // 정렬 후 색을 배정해 큰 자산이 항상 같은 색을 갖게 한다.
    return priced.map(({ token, value }, index) => ({
      symbol: token.symbol,
      name: token.name ?? token.symbol,
      value,
      percentage: (value / totalValue) * 100,
      color: CHART_COLORS[index % CHART_COLORS.length],
      logoUrl: token.logoUrl,
    }));
  }

  /**
   * 포트폴리오 통계 계산
   * 기간 비교는 해당 시점 근처(허용 오차 안)의 스냅샷이 있을 때만 계산한다.
   * 오래된 스냅샷으로 대체하지 않는다.
   */
  async calculateStats(
    address: string,
    chainId: number,
    currentTokens: TokenLike[],
  ): Promise<PortfolioStats> {
    const history = await this.getHistory(address, chainId);
    const currentReliable = isSnapshotReliable(currentTokens);
    const currentValue = currentTokens.reduce(
      (sum, t) => sum + (tokenUsdValue(t) ?? 0),
      0,
    );

    const now = Date.now();
    const compare = (periodMs: number, toleranceMs: number) => {
      if (!currentReliable) return { change: null, percent: null };
      const past = this.findSnapshotNear(history, now - periodMs, toleranceMs);
      if (!past) return { change: null, percent: null };
      const change = currentValue - past.totalValue;
      const percent =
        past.totalValue > 0 ? (change / past.totalValue) * 100 : null;
      return { change, percent };
    };

    const d1 = compare(DAY_MS, DAY_MS / 2);
    const d7 = compare(7 * DAY_MS, 1.5 * DAY_MS);
    const d30 = compare(30 * DAY_MS, 4 * DAY_MS);

    // 기록된 총 자산액의 최고/최저/평균 (믿을 수 없는 현재 값/부분합으로 채우지 않는다)
    const values = history.map(s => s.totalValue).filter(Number.isFinite);
    if (currentReliable) values.push(currentValue);

    const highestValue = values.length ? Math.max(...values) : null;
    const lowestValue = values.length ? Math.min(...values) : null;
    const averageValue = values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null;

    return {
      totalValue: currentValue,
      change24h: d1.change,
      changePercent24h: d1.percent,
      change7d: d7.change,
      changePercent7d: d7.percent,
      change30d: d30.change,
      changePercent30d: d30.percent,
      highestValue,
      lowestValue,
      averageValue,
    };
  }

  /**
   * 성과 지표 계산 (가격을 아는 보유 자산만 대상)
   */
  calculatePerformance(tokens: TokenLike[]): PerformanceMetrics {
    const held = tokens
      .map(token => ({
        symbol: token.symbol,
        value: tokenUsdValue(token) ?? 0,
        change: token.priceChange24h ?? 0,
      }))
      .filter(item => item.value > 0);

    const sorted = [...held].sort((a, b) => b.change - a.change);
    const comparable = sorted.length >= 2;

    const bestPerformer = comparable
      ? { symbol: sorted[0].symbol, change: sorted[0].change }
      : null;
    const worstPerformer = comparable
      ? {
          symbol: sorted[sorted.length - 1].symbol,
          change: sorted[sorted.length - 1].change,
        }
      : null;

    // 가중평균 수익률
    const totalValue = held.reduce((sum, t) => sum + t.value, 0);
    const weightedReturn =
      totalValue > 0
        ? held.reduce((sum, t) => sum + (t.value / totalValue) * t.change, 0)
        : 0;

    // 보유 자산 간 24시간 변동률의 표준편차
    let volatility: number | null = null;
    if (comparable) {
      const changes = held.map(t => t.change);
      const avg = changes.reduce((a, b) => a + b, 0) / changes.length;
      const variance =
        changes.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) /
        changes.length;
      volatility = Math.sqrt(variance);
    }

    return {
      totalReturn: weightedReturn,
      totalReturnPercent: weightedReturn,
      bestPerformer,
      worstPerformer,
      volatility,
    };
  }

  /**
   * 차트 데이터 생성 (최근 N일)
   */
  async getChartData(
    address: string,
    chainId: number,
    days: number = 30,
  ): Promise<{ labels: string[]; values: number[] }> {
    const history = await this.getHistory(address, chainId);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const filtered = history
      .filter(s => s.timestamp >= cutoff)
      .sort((a, b) => a.timestamp - b.timestamp);

    const labels = filtered.map(s => {
      const date = new Date(s.timestamp);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    });

    const values = filtered.map(s => s.totalValue);

    return { labels, values };
  }

  /**
   * 목표 시점 ± 허용 오차 안에서 가장 가까운 스냅샷 (없으면 null)
   */
  private findSnapshotNear(
    history: PortfolioSnapshot[],
    timestamp: number,
    toleranceMs: number,
  ): PortfolioSnapshot | null {
    let closest: PortfolioSnapshot | null = null;
    let closestDiff = Infinity;
    for (const snapshot of history) {
      if (!Number.isFinite(snapshot.totalValue)) continue;
      const diff = Math.abs(snapshot.timestamp - timestamp);
      if (diff <= toleranceMs && diff < closestDiff) {
        closest = snapshot;
        closestDiff = diff;
      }
    }
    return closest;
  }

  /**
   * 히스토리 캐시 클리어
   */
  clearCache() {
    this.generation += 1;
    this.historyCache.clear();
  }
}

export const portfolioAnalyticsService = new PortfolioAnalyticsService();
