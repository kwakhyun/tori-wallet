/**
 * 온보딩 E2E 테스트
 */

import { by, element, expect } from 'detox';

describe('Onboarding Flow', () => {
  it('should show welcome screen on first launch', async () => {
    await expect(element(by.text('Tori Wallet'))).toBeVisible();
    await expect(element(by.text('새 지갑 만들기'))).toBeVisible();
    await expect(element(by.text('기존 지갑 가져오기'))).toBeVisible();
  });

  it('should navigate to create wallet screen', async () => {
    await element(by.text('새 지갑 만들기')).tap();
    // CreateWallet 화면으로 이동 확인
    await expect(element(by.text('새 지갑 만들기'))).toBeVisible();
  });

  it('should navigate to import wallet screen', async () => {
    await element(by.text('기존 지갑 가져오기')).tap();
    // ImportWallet 화면의 타이틀 확인 (첫 번째 요소)
    await expect(element(by.text('지갑 가져오기')).atIndex(0)).toBeVisible();
  });
});
