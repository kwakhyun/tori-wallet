/**
 * 포트폴리오 분석 및 통계 서비스
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Token } from './tokenService';

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
export interface PortfolioStats {
  totalValue: number;
  change24h: number;
  changePercent24h: number;
  change7d: number;
  changePercent7d: number;
  change30d: number;
  changePercent30d: number;
  highestValue: number;
  lowestValue: number;
  averageValue: number;
}

// 성과 지표
export interface PerformanceMetrics {
  totalReturn: number;
  totalReturnPercent: number;
  bestPerformer: { symbol: string; change: number } | null;
  worstPerformer: { symbol: string; change: number } | null;
  volatility: number;
}

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

class PortfolioAnalyticsService {
  private historyCache: PortfolioSnapshot[] | null = null;

  /**
   * 포트폴리오 스냅샷 저장
   */
  async saveSnapshot(
    address: string,
    chainId: number,
    tokens: Token[],
  ): Promise<void> {
    const key = `${STORAGE_KEY}_${address}_${chainId}`;
    const history = await this.getHistory(address, chainId);

    const totalValue = tokens.reduce((sum, t) => sum + t.value, 0);

    const snapshot: PortfolioSnapshot = {
      timestamp: Date.now(),
      totalValue,
      tokens: tokens.map(t => ({
        symbol: t.symbol,
        value: t.value,
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
    this.historyCache = history;
  }

  /**
   * 포트폴리오 히스토리 조회
   */
  async getHistory(
    address: string,
    chainId: number,
  ): Promise<PortfolioSnapshot[]> {
    if (this.historyCache) return this.historyCache;

    const key = `${STORAGE_KEY}_${address}_${chainId}`;
    try {
      const data = await AsyncStorage.getItem(key);
      const history = data ? JSON.parse(data) : [];
      this.historyCache = history;
      return history;
    } catch {
      return [];
    }
  }

  /**
   * 자산 배분 계산
   */
  calculateAllocation(tokens: Token[]): AssetAllocation[] {
    const totalValue = tokens.reduce((sum, t) => sum + t.value, 0);

    if (totalValue === 0) return [];

    return tokens
      .filter(t => t.value > 0)
      .map((token, index) => ({
        symbol: token.symbol,
        name: token.name,
        value: token.value,
        percentage: (token.value / totalValue) * 100,
        color: CHART_COLORS[index % CHART_COLORS.length],
        logoUrl: token.logoUrl,
      }))
      .sort((a, b) => b.value - a.value);
  }

  /**
   * 포트폴리오 통계 계산
   */
  async calculateStats(
    address: string,
    chainId: number,
    currentTokens: Token[],
  ): Promise<PortfolioStats> {
    const history = await this.getHistory(address, chainId);
    const currentValue = currentTokens.reduce((sum, t) => sum + t.value, 0);

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    // 24시간 전 값 찾기
    const value24hAgo = this.findValueAt(history, now - day);
    const change24h = currentValue - value24hAgo;
    const changePercent24h =
      value24hAgo > 0 ? (change24h / value24hAgo) * 100 : 0;

    // 7일 전 값 찾기
    const value7dAgo = this.findValueAt(history, now - 7 * day);
    const change7d = currentValue - value7dAgo;
    const changePercent7d = value7dAgo > 0 ? (change7d / value7dAgo) * 100 : 0;

    // 30일 전 값 찾기
    const value30dAgo = this.findValueAt(history, now - 30 * day);
    const change30d = currentValue - value30dAgo;
    const changePercent30d =
      value30dAgo > 0 ? (change30d / value30dAgo) * 100 : 0;

    // 최고/최저/평균값
    const values = history.map(s => s.totalValue);
    values.push(currentValue);

    const highestValue = Math.max(...values);
    const lowestValue = Math.min(...values);
    const averageValue = values.reduce((a, b) => a + b, 0) / values.length;

    return {
      totalValue: currentValue,
      change24h,
      changePercent24h,
      change7d,
      changePercent7d,
      change30d,
      changePercent30d,
      highestValue,
      lowestValue,
      averageValue,
    };
  }

  /**
   * 성과 지표 계산
   */
  calculatePerformance(tokens: Token[]): PerformanceMetrics {
    // 24시간 변동률 기준 정렬
    const sorted = [...tokens]
      .filter(t => t.value > 0)
      .sort((a, b) => b.priceChange24h - a.priceChange24h);

    const bestPerformer =
      sorted.length > 0
        ? { symbol: sorted[0].symbol, change: sorted[0].priceChange24h }
        : null;

    const worstPerformer =
      sorted.length > 0
        ? {
            symbol: sorted[sorted.length - 1].symbol,
            change: sorted[sorted.length - 1].priceChange24h,
          }
        : null;

    // 가중평균 수익률
    const totalValue = tokens.reduce((sum, t) => sum + t.value, 0);
    const weightedReturn =
      totalValue > 0
        ? tokens.reduce(
            (sum, t) => sum + (t.value / totalValue) * t.priceChange24h,
            0,
          )
        : 0;

    // 변동성 (표준편차)
    const changes = tokens.map(t => t.priceChange24h);
    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length || 0;
    const variance =
      changes.reduce((sum, c) => sum + Math.pow(c - avgChange, 2), 0) /
        changes.length || 0;
    const volatility = Math.sqrt(variance);

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
   * 특정 시점의 포트폴리오 값 찾기
   */
  private findValueAt(history: PortfolioSnapshot[], timestamp: number): number {
    if (history.length === 0) return 0;

    // 가장 가까운 스냅샷 찾기
    let closest = history[0];
    let closestDiff = Math.abs(history[0].timestamp - timestamp);

    for (const snapshot of history) {
      const diff = Math.abs(snapshot.timestamp - timestamp);
      if (diff < closestDiff && snapshot.timestamp <= timestamp) {
        closest = snapshot;
        closestDiff = diff;
      }
    }

    return closest.totalValue;
  }

  /**
   * 히스토리 캐시 클리어
   */
  clearCache() {
    this.historyCache = null;
  }
}

export const portfolioAnalyticsService = new PortfolioAnalyticsService();
