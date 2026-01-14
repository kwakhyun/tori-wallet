/**
 * Tori Wallet - PieChart Component Tests
 */

import { PieChart } from '../../src/components/charts/PieChart';

describe('PieChart', () => {
  it('should be defined', () => {
    expect(PieChart).toBeDefined();
  });

  it('should be a function component', () => {
    expect(typeof PieChart).toBe('function');
  });
});
