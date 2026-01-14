/**
 * Tori Wallet - LineChart Component Tests
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
