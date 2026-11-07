/**
 * 파이 차트 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '../test-utils';
import { usePreferencesStore } from '../../src/store/preferencesStore';

// Mock react-native-svg (요소와 props를 그대로 노출)
jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const make = (name: string) => (props: any) =>
    ReactLib.createElement(name, props, props.children);
  return {
    __esModule: true,
    default: make('Svg'),
    Svg: make('Svg'),
    Circle: make('Circle'),
    G: make('G'),
    Path: make('Path'),
    Text: make('SvgText'),
    TSpan: make('TSpan'),
  };
});

import { PieChart } from '../../src/components/charts/PieChart';

const slice = (symbol: string, value: number, percentage: number) => ({
  symbol,
  name: symbol,
  value,
  percentage,
  color: '#6366F1',
});

describe('PieChart', () => {
  beforeEach(() => {
    usePreferencesStore.setState({ currency: 'USD', hideBalances: false });
  });

  it('draws a full ring when a single asset is 100%', () => {
    const { UNSAFE_queryAllByType } = render(
      <PieChart data={[slice('ETH', 3000, 100)]} />,
    );

    // 0°→360° 호는 그려지지 않으므로 고리(Circle)로 그린다.
    const ring = screen.getByTestId('pie-chart-full-ring');
    expect(ring.props.stroke).toBe('#6366F1');
    expect(ring.props.strokeWidth).toBeGreaterThan(0);
    expect(UNSAFE_queryAllByType('Path' as any)).toHaveLength(0);
  });

  it('draws one arc per asset when there are several', () => {
    const { UNSAFE_queryAllByType } = render(
      <PieChart data={[slice('ETH', 600, 60), slice('USDC', 400, 40)]} />,
    );
    expect(UNSAFE_queryAllByType('Path' as any)).toHaveLength(2);
    expect(screen.queryByTestId('pie-chart-full-ring')).toBeNull();
  });

  it('summarises the allocation for screen readers', () => {
    render(<PieChart data={[slice('ETH', 600, 60), slice('USDC', 400, 40)]} />);
    const chart = screen.getByTestId('pie-chart');
    expect(chart.props.accessibilityLabel).toContain('자산 배분');
    expect(chart.props.accessibilityLabel).toContain('ETH 60.0%');
    expect(chart.props.accessibilityLabel).toContain('USDC 40.0%');
    expect(chart.props.accessibilityLabel).toContain('$1,000.00');
  });

  it('shows an honest empty state', () => {
    render(<PieChart data={[]} />);
    expect(screen.getByTestId('pie-chart-empty')).toBeTruthy();
    expect(screen.getByText('자산 없음')).toBeTruthy();
  });

  it('masks the centre total when balances are hidden', () => {
    usePreferencesStore.setState({ hideBalances: true });
    render(<PieChart data={[slice('ETH', 3000, 100)]} />);
    expect(screen.getByText('••••')).toBeTruthy();
  });
});
