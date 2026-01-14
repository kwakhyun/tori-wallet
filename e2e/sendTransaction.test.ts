/**
 * Tori Wallet - Send Transaction E2E Tests
 *
 * 토큰 전송 플로우 테스트:
 * 주소 입력 → 금액 입력 → 가스 확인 → PIN 입력 → 전송 → 완료
 */

import { by, device, element, expect, waitFor } from 'detox';

describe('Send Transaction Flow', () => {
  const TEST_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f5bE91';
  const TEST_AMOUNT = '0.001';

  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    // 이미 지갑이 설정되어 있다고 가정 (온보딩 완료 상태)
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  describe('Navigation to Send Screen', () => {
    it('should navigate to send screen from home', async () => {
      // 홈 화면에서 전송 버튼 탭
      await expect(element(by.text('보내기'))).toBeVisible();
      await element(by.text('보내기')).tap();

      // 전송 화면 진입 확인
      await expect(element(by.text('토큰 전송'))).toBeVisible();
    });
  });

  describe('Address Input', () => {
    it('should show address input field', async () => {
      await element(by.text('보내기')).tap();

      await expect(element(by.id('recipient-address-input'))).toBeVisible();
      await expect(element(by.text('받는 주소'))).toBeVisible();
    });

    it('should validate invalid address', async () => {
      await element(by.text('보내기')).tap();

      // 잘못된 주소 입력
      await element(by.id('recipient-address-input')).typeText(
        'invalid-address',
      );
      await element(by.text('다음')).tap();

      // 에러 메시지 확인
      await expect(element(by.text('유효하지 않은 주소입니다'))).toBeVisible();
    });

    it('should accept valid address', async () => {
      await element(by.text('보내기')).tap();

      // 유효한 주소 입력
      await element(by.id('recipient-address-input')).clearText();
      await element(by.id('recipient-address-input')).typeText(TEST_ADDRESS);

      // 주소가 입력되었는지 확인
      await expect(element(by.id('recipient-address-input'))).toHaveText(
        TEST_ADDRESS,
      );
    });

    it('should open address book', async () => {
      await element(by.text('보내기')).tap();

      // 주소록 버튼 탭
      await element(by.id('address-book-button')).tap();

      // 주소록 화면 확인
      await expect(element(by.text('주소록'))).toBeVisible();
    });

    it('should open QR scanner', async () => {
      await element(by.text('보내기')).tap();

      // QR 스캔 버튼 탭
      await element(by.id('qr-scan-button')).tap();

      // 카메라 권한 또는 스캐너 화면 확인
      await waitFor(element(by.id('qr-scanner')))
        .toBeVisible()
        .withTimeout(3000);
    });
  });

  describe('Amount Input', () => {
    it('should show amount input after address', async () => {
      await element(by.text('보내기')).tap();
      await element(by.id('recipient-address-input')).typeText(TEST_ADDRESS);
      await element(by.text('다음')).tap();

      // 금액 입력 화면 확인
      await expect(element(by.id('amount-input'))).toBeVisible();
      await expect(element(by.text('보낼 금액'))).toBeVisible();
    });

    it('should show available balance', async () => {
      await element(by.text('보내기')).tap();
      await element(by.id('recipient-address-input')).typeText(TEST_ADDRESS);
      await element(by.text('다음')).tap();

      // 사용 가능 잔액 표시 확인
      await expect(element(by.id('available-balance'))).toBeVisible();
    });

    it('should have max button', async () => {
      await element(by.text('보내기')).tap();
      await element(by.id('recipient-address-input')).typeText(TEST_ADDRESS);
      await element(by.text('다음')).tap();

      // 최대 금액 버튼 확인
      await expect(element(by.text('최대'))).toBeVisible();
    });

    it('should validate insufficient balance', async () => {
      await element(by.text('보내기')).tap();
      await element(by.id('recipient-address-input')).typeText(TEST_ADDRESS);
      await element(by.text('다음')).tap();

      // 너무 큰 금액 입력
      await element(by.id('amount-input')).typeText('999999');
      await element(by.text('다음')).tap();

      // 잔액 부족 에러 확인
      await expect(element(by.text('잔액이 부족합니다'))).toBeVisible();
    });
  });

  describe('Gas Estimation', () => {
    it('should show gas estimation', async () => {
      await element(by.text('보내기')).tap();
      await element(by.id('recipient-address-input')).typeText(TEST_ADDRESS);
      await element(by.text('다음')).tap();
      await element(by.id('amount-input')).typeText(TEST_AMOUNT);
      await element(by.text('다음')).tap();

      // 가스 예상 표시 확인
      await expect(element(by.text('예상 가스비'))).toBeVisible();
      await expect(element(by.id('gas-estimate'))).toBeVisible();
    });

    it('should show transaction summary', async () => {
      await element(by.text('보내기')).tap();
      await element(by.id('recipient-address-input')).typeText(TEST_ADDRESS);
      await element(by.text('다음')).tap();
      await element(by.id('amount-input')).typeText(TEST_AMOUNT);
      await element(by.text('다음')).tap();

      // 거래 요약 정보 확인
      await expect(element(by.text('거래 확인'))).toBeVisible();
      await expect(element(by.text('받는 주소'))).toBeVisible();
      await expect(element(by.text('보내는 금액'))).toBeVisible();
      await expect(element(by.text('예상 가스비'))).toBeVisible();
    });
  });

  describe('PIN Confirmation', () => {
    it('should require PIN before sending', async () => {
      await element(by.text('보내기')).tap();
      await element(by.id('recipient-address-input')).typeText(TEST_ADDRESS);
      await element(by.text('다음')).tap();
      await element(by.id('amount-input')).typeText(TEST_AMOUNT);
      await element(by.text('다음')).tap();

      // 전송 버튼 탭
      await element(by.text('전송')).tap();

      // PIN 입력 화면 확인
      await expect(element(by.text('PIN 입력'))).toBeVisible();
      await expect(element(by.id('pin-input'))).toBeVisible();
    });

    it('should show error for wrong PIN', async () => {
      await element(by.text('보내기')).tap();
      await element(by.id('recipient-address-input')).typeText(TEST_ADDRESS);
      await element(by.text('다음')).tap();
      await element(by.id('amount-input')).typeText(TEST_AMOUNT);
      await element(by.text('다음')).tap();
      await element(by.text('전송')).tap();

      // 잘못된 PIN 입력
      await element(by.id('pin-input')).typeText('000000');

      // 에러 메시지 확인
      await expect(element(by.text('PIN이 올바르지 않습니다'))).toBeVisible();
    });
  });

  describe('Transaction Submission', () => {
    it('should show sending state', async () => {
      await element(by.text('보내기')).tap();
      await element(by.id('recipient-address-input')).typeText(TEST_ADDRESS);
      await element(by.text('다음')).tap();
      await element(by.id('amount-input')).typeText(TEST_AMOUNT);
      await element(by.text('다음')).tap();
      await element(by.text('전송')).tap();

      // 올바른 PIN 입력 (테스트 환경에서 설정된 PIN)
      await element(by.id('pin-input')).typeText('123456');

      // 전송 중 상태 확인
      await expect(element(by.text('전송 중...'))).toBeVisible();
    });

    // 참고: 실제 트랜잭션 전송은 테스트넷에서만 수행
    // 메인넷에서는 모킹된 응답 사용
  });

  describe('Transaction Result', () => {
    it('should show success screen after transaction', async () => {
      // 성공 화면 확인 (모킹된 환경에서)
      await waitFor(element(by.text('전송 완료')))
        .toBeVisible()
        .withTimeout(10000);

      await expect(element(by.id('transaction-hash'))).toBeVisible();
      await expect(element(by.text('확인'))).toBeVisible();
    });

    it('should navigate back to home after confirmation', async () => {
      await waitFor(element(by.text('전송 완료')))
        .toBeVisible()
        .withTimeout(10000);

      await element(by.text('확인')).tap();

      // 홈 화면으로 복귀 확인
      await expect(element(by.text('보내기'))).toBeVisible();
    });

    it('should show transaction in activity', async () => {
      // 활동 탭으로 이동
      await element(by.text('활동')).tap();

      // 방금 전송한 트랜잭션 확인
      await expect(element(by.text('보냄'))).toBeVisible();
    });
  });
});
