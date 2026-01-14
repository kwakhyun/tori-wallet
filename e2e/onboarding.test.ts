/**
 * Tori Wallet - Onboarding E2E Tests
 */

import { by, device, element, expect } from 'detox';

describe('Onboarding Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should show welcome screen on first launch', async () => {
    await expect(element(by.text('Tori Wallet'))).toBeVisible();
    await expect(element(by.text('새 지갑 만들기'))).toBeVisible();
    await expect(element(by.text('지갑 복구하기'))).toBeVisible();
  });

  it('should navigate to create wallet screen', async () => {
    await element(by.text('새 지갑 만들기')).tap();
    await expect(element(by.text('새 지갑 만들기'))).toBeVisible();
  });

  it('should navigate to import wallet screen', async () => {
    await element(by.text('지갑 복구하기')).tap();
    await expect(element(by.text('지갑 복구'))).toBeVisible();
  });

  it('should show mnemonic backup screen after wallet creation', async () => {
    await element(by.text('새 지갑 만들기')).tap();
    await element(by.text('지갑 생성')).tap();
    await expect(element(by.text('복구 구문 백업'))).toBeVisible();
  });

  it('should require mnemonic verification', async () => {
    await element(by.text('새 지갑 만들기')).tap();
    await element(by.text('지갑 생성')).tap();
    await element(by.text('백업 완료')).tap();
    await expect(element(by.text('복구 구문 확인'))).toBeVisible();
  });
});

describe('PIN Setup', () => {
  it('should require PIN setup after verification', async () => {
    // 이전 테스트에서 이어서 진행
    await expect(element(by.text('PIN 설정'))).toBeVisible();
  });

  it('should require PIN confirmation', async () => {
    // PIN 입력 후 확인 화면
    await expect(element(by.text('PIN 확인'))).toBeVisible();
  });
});
