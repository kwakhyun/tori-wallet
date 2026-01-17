/**
 * 파이 차트 컴포넌트 테스트
 */

// Set timeout to prevent hangs
jest.setTimeout(10000);

// Mock react-native-svg
jest.mock('react-native-svg', () => {
  const React = require('react');
  return {
    Svg: (props: any) => React.createElement('Svg', props, props.children),
    Circle: (props: any) => React.createElement('Circle', props),
    G: (props: any) => React.createElement('G', props, props.children),
    Path: (props: any) => React.createElement('Path', props),
    Text: (props: any) => React.createElement('Text', props, props.children),
    TSpan: (props: any) => React.createElement('TSpan', props, props.children),
  };
});

import { PieChart } from '../../src/components/charts/PieChart';

describe('PieChart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(PieChart).toBeDefined();
  });

  it('should be a function component', () => {
    expect(typeof PieChart).toBe('function');
  });
});
