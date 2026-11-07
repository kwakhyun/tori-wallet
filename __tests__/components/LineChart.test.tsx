/**
 * 라인 차트 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '../test-utils';
import { usePreferencesStore } from '../../src/store/preferencesStore';
import { lightTheme } from '../../src/styles/theme';

jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const make = (name: string) => (props: any) =>
    ReactLib.createElement(name, props, props.children);
  return {
    __esModule: true,
    default: make('Svg'),
    Svg: make('Svg'),
    Path: make('Path'),
    Line: make('Line'),
    Text: make('SvgText'),
    Defs: make('Defs'),
    LinearGradient: make('LinearGradient'),
    Stop: make('Stop'),
    Circle: make('Circle'),
  };
});

import {
  LineChart,
  formatDistinctLabels,
} from '../../src/components/charts/LineChart';

describe('LineChart', () => {
  beforeEach(() => {
    usePreferencesStore.setState({ currency: 'USD', hideBalances: false });
  });

  it('uses theme tokens instead of hardcoded dark colours', () => {
    const { UNSAFE_queryAllByType } = render(
      <LineChart labels={['1/1', '1/2', '1/3']} values={[100, 120, 110]} />,
      { theme: 'light' },
    );
    const lines = UNSAFE_queryAllByType('Line' as any);
    expect(lines.length).toBeGreaterThan(0);
    lines.forEach(line =>
      expect(line.props.stroke).toBe(lightTheme.colors.chartGrid),
    );
    const labels = UNSAFE_queryAllByType('SvgText' as any);
    labels.forEach(label => {
      expect(label.props.fill).not.toBe('#888');
      expect(label.props.fill).not.toBe('#FFF');
    });
  });

  it('formats y-axis labels so they are distinct (no "$0 $0 $1")', () => {
    const { UNSAFE_queryAllByType } = render(
      <LineChart labels={['a', 'b']} values={[0.3, 0.6]} />,
    );
    const yLabels = UNSAFE_queryAllByType('SvgText' as any)
      .filter(node => node.props.textAnchor === 'end' && node.props.x === 50)
      .map(node => String(node.props.children));
    expect(yLabels).toHaveLength(3);
    expect(new Set(yLabels).size).toBe(3);
    yLabels.forEach(label => expect(label).toMatch(/^\$/));
  });

  it('provides an accessibility summary with min and max', () => {
    render(
      <LineChart
        title="포트폴리오 추이"
        labels={['1/1', '1/2', '1/3']}
        values={[100, 300, 200]}
      />,
    );
    const chart = screen.getByTestId('line-chart');
    expect(chart.props.accessibilityLabel).toContain('포트폴리오 추이');
    expect(chart.props.accessibilityLabel).toContain('최저 $100');
    expect(chart.props.accessibilityLabel).toContain('최고 $300');
  });

  it('shows honest empty-state copy', () => {
    render(<LineChart labels={[]} values={[]} />);
    expect(screen.getByText('아직 기록이 없어요')).toBeTruthy();
    expect(
      screen.getByText('포트폴리오 탭을 열 때마다 하루 한 번 기록됩니다.'),
    ).toBeTruthy();
  });

  it('shows a single recorded value without a fake change', () => {
    render(<LineChart labels={['1/1']} values={[1234]} />);
    expect(screen.getByTestId('line-chart-single')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('formatDistinctLabels', () => {
  it('adds fraction digits until labels differ', () => {
    const format = (value: number, digits: number) => value.toFixed(digits);
    expect(formatDistinctLabels([0.1, 0.15, 0.2], format)).toEqual([
      '0.10',
      '0.15',
      '0.20',
    ]);
    expect(formatDistinctLabels([1, 2, 3], format)).toEqual(['1', '2', '3']);
  });
});
