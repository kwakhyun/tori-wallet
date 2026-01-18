/**
 * 지갑 잠금/해제 E2E 테스트 (스모크 테스트)
 *
 * 참고: 전체 잠금/해제 플로우 테스트는 지갑이 설정된 상태에서 실행해야 합니다.
 * 현재는 앱 초기 상태에서의 기본 동작만 검증합니다.
 */

import { by, element, expect } from 'detox';

describe('Wallet Lock - Smoke Test', () => {
  it('should show onboarding when no wallet exists', async () => {
    // 지갑이 없는 상태에서는 웰컴 화면 표시 (잠금 화면 아님)
    await expect(element(by.text('Tori Wallet'))).toBeVisible();
    await expect(element(by.text('새 지갑 만들기'))).toBeVisible();
    await expect(element(by.text('기존 지갑 가져오기'))).toBeVisible();
  });
});
