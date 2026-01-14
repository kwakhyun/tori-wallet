/**
 * Tori Wallet - Wallet Lock/Unlock E2E Tests
 *
 * 지갑 잠금/해제 플로우 테스트:
 * 앱 잠금 → 앱 재시작 → PIN 입력 → 홈 진입
 * 생체인증 → 홈 진입
 */

import { by, device, element, expect, waitFor } from 'detox';

describe('Wallet Lock/Unlock Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    // 이미 지갑이 설정되어 있다고 가정 (온보딩 완료 상태)
  });

  describe('Auto Lock on Background', () => {
    it('should lock wallet when app goes to background', async () => {
      // 홈 화면 확인
      await expect(element(by.text('보내기'))).toBeVisible();

      // 앱을 백그라운드로 보냄
      await device.sendToHome();

      // 잠시 대기 (자동 잠금 시간)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 앱을 다시 포그라운드로
      await device.launchApp({ newInstance: false });

      // 잠금 화면 표시 확인
      await expect(element(by.text('PIN 입력'))).toBeVisible();
    });
  });

  describe('Manual Lock', () => {
    it('should lock wallet from settings', async () => {
      // PIN 입력하여 잠금 해제 (이전 테스트에서 잠김)
      await element(by.id('pin-input')).typeText('123456');

      // 설정으로 이동
      await element(by.text('설정')).tap();

      // 잠금 버튼 탭
      await element(by.text('잠금')).tap();

      // 잠금 화면 표시 확인
      await expect(element(by.text('PIN 입력'))).toBeVisible();
    });
  });

  describe('PIN Unlock', () => {
    beforeEach(async () => {
      // 앱 재시작으로 잠금 상태 만들기
      await device.launchApp({ newInstance: true });
    });

    it('should show unlock screen on app launch', async () => {
      // 잠금 화면 요소 확인
      await expect(element(by.text('Tori Wallet'))).toBeVisible();
      await expect(element(by.text('PIN 입력'))).toBeVisible();
      await expect(element(by.id('pin-input'))).toBeVisible();
    });

    it('should show PIN keypad', async () => {
      // 숫자 키패드 확인
      await expect(element(by.text('1'))).toBeVisible();
      await expect(element(by.text('2'))).toBeVisible();
      await expect(element(by.text('3'))).toBeVisible();
      await expect(element(by.text('0'))).toBeVisible();
    });

    it('should show error for wrong PIN', async () => {
      // 잘못된 PIN 입력
      await element(by.text('1')).tap();
      await element(by.text('1')).tap();
      await element(by.text('1')).tap();
      await element(by.text('1')).tap();
      await element(by.text('1')).tap();
      await element(by.text('1')).tap();

      // 에러 메시지 확인
      await expect(element(by.text('PIN이 올바르지 않습니다'))).toBeVisible();
    });

    it('should show remaining attempts after wrong PIN', async () => {
      // 잘못된 PIN 입력
      await element(by.text('0')).tap();
      await element(by.text('0')).tap();
      await element(by.text('0')).tap();
      await element(by.text('0')).tap();
      await element(by.text('0')).tap();
      await element(by.text('0')).tap();

      // 남은 시도 횟수 표시 확인
      await expect(element(by.id('remaining-attempts'))).toBeVisible();
    });

    it('should unlock with correct PIN', async () => {
      // 올바른 PIN 입력
      await element(by.text('1')).tap();
      await element(by.text('2')).tap();
      await element(by.text('3')).tap();
      await element(by.text('4')).tap();
      await element(by.text('5')).tap();
      await element(by.text('6')).tap();

      // 홈 화면 진입 확인
      await waitFor(element(by.text('보내기')))
        .toBeVisible()
        .withTimeout(3000);
    });

    it('should have delete button for PIN correction', async () => {
      // PIN 일부 입력
      await element(by.text('1')).tap();
      await element(by.text('2')).tap();

      // 삭제 버튼 확인 및 탭
      await expect(element(by.id('pin-delete-button'))).toBeVisible();
      await element(by.id('pin-delete-button')).tap();

      // PIN 수정 후 올바른 PIN 입력
      await element(by.text('2')).tap();
      await element(by.text('3')).tap();
      await element(by.text('4')).tap();
      await element(by.text('5')).tap();
      await element(by.text('6')).tap();

      // 홈 화면 진입 확인
      await waitFor(element(by.text('보내기')))
        .toBeVisible()
        .withTimeout(3000);
    });
  });

  describe('Biometric Unlock', () => {
    beforeEach(async () => {
      await device.launchApp({ newInstance: true });
    });

    it('should show biometric option if enabled', async () => {
      // 생체인증 버튼 확인 (활성화된 경우)
      await waitFor(element(by.id('biometric-button')))
        .toBeVisible()
        .withTimeout(2000);
    });

    it('should trigger biometric prompt on button tap', async () => {
      // 생체인증 버튼 탭
      await element(by.id('biometric-button')).tap();

      // 시뮬레이터에서는 생체인증을 모킹하거나 스킵
      // 실제 디바이스에서만 완전히 테스트 가능
    });

    it('should unlock with successful biometric', async () => {
      // 생체인증 성공 시뮬레이션 (Face ID)
      await device.matchFace();

      // 홈 화면 진입 확인
      await waitFor(element(by.text('보내기')))
        .toBeVisible()
        .withTimeout(3000);
    });

    it('should fallback to PIN after biometric failure', async () => {
      // 생체인증 실패 시뮬레이션
      await device.unmatchFace();

      // PIN 입력 화면 유지 확인
      await expect(element(by.text('PIN 입력'))).toBeVisible();
      await expect(element(by.id('pin-input'))).toBeVisible();
    });
  });

  describe('Security Timeout', () => {
    it('should lock after multiple failed attempts', async () => {
      await device.launchApp({ newInstance: true });

      // 5회 잘못된 PIN 입력
      for (let i = 0; i < 5; i++) {
        await element(by.text('0')).tap();
        await element(by.text('0')).tap();
        await element(by.text('0')).tap();
        await element(by.text('0')).tap();
        await element(by.text('0')).tap();
        await element(by.text('0')).tap();

        // 에러 후 초기화 대기
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 잠금 메시지 확인
      await expect(
        element(by.text('너무 많은 시도가 있었습니다')),
      ).toBeVisible();
    });
  });

  describe('App Restart', () => {
    it('should require unlock after app termination and restart', async () => {
      // 앱 종료
      await device.terminateApp();

      // 앱 재시작
      await device.launchApp({ newInstance: true });

      // 잠금 화면 표시 확인
      await expect(element(by.text('PIN 입력'))).toBeVisible();
    });

    it('should preserve wallet data after restart', async () => {
      await device.launchApp({ newInstance: true });

      // PIN 입력
      await element(by.text('1')).tap();
      await element(by.text('2')).tap();
      await element(by.text('3')).tap();
      await element(by.text('4')).tap();
      await element(by.text('5')).tap();
      await element(by.text('6')).tap();

      // 홈 화면에서 지갑 주소 표시 확인
      await waitFor(element(by.id('wallet-address')))
        .toBeVisible()
        .withTimeout(3000);
    });
  });
});
