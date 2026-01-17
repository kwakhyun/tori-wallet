/**
 * 코인 상세 스크린 테스트
 */

import CoinDetailScreen from '../../src/screens/CoinDetail/CoinDetailScreen';

describe('CoinDetailScreen', () => {
  it('should be defined', () => {
    expect(CoinDetailScreen).toBeDefined();
  });

  it('should be a function component', () => {
    expect(typeof CoinDetailScreen).toBe('function');
  });
});
