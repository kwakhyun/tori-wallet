/**
 * 토큰 전송 E2E 테스트 (스모크 테스트)
 *
 * 참고: 전체 전송 플로우 테스트는 지갑이 설정된 상태에서 실행해야 합니다.
 * 현재는 앱 초기 상태에서의 기본 동작만 검증합니다.
 */

import { by, element, expect } from 'detox';

describe('Send Transaction - Smoke Test', () => {
  it('should show welcome screen when no wallet exists', async () => {
    // 지갑이 없는 상태에서는 웰컴 화면 표시
    await expect(element(by.text('Tori Wallet'))).toBeVisible();
    await expect(element(by.text('새 지갑 만들기'))).toBeVisible();
  });
});
