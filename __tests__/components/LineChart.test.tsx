/**
 * 라인 차트 컴포넌트 테스트
 */

import { LineChart } from '../../src/components/charts/LineChart';

describe('LineChart', () => {
  it('should be defined', () => {
    expect(LineChart).toBeDefined();
  });

  it('should be a function component', () => {
    expect(typeof LineChart).toBe('function');
  });
});
