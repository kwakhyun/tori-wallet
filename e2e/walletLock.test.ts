import { by, device, element, expect, waitFor } from 'detox';
import {
  enterUnlockPin,
  importTestWallet,
  PIN_DERIVATION_TIMEOUT,
  TEST_PIN,
} from './helpers/wallet';

// 기본 자동 잠금 1분보다 충분히 길게 백그라운드에 둔다.
const AUTO_LOCK_WAIT_MS = 65_000;

describe('Wallet lock and PIN authentication', () => {
  it('locks after restart, rejects a wrong PIN, and unlocks with the correct PIN', async () => {
    await importTestWallet();
    await device.terminateApp();
    await device.launchApp({ newInstance: true });
    await waitFor(element(by.id('unlock-screen')))
      .toBeVisible()
      .withTimeout(15000);
    // KDF timers stay busy until authentication finishes; assert the actual
    // result with a bounded wait instead of waiting for global app idleness.
    await device.disableSynchronization();
    await enterUnlockPin('000000');
    await waitFor(element(by.text('PIN이 올바르지 않습니다.')))
      .toBeVisible()
      .withTimeout(PIN_DERIVATION_TIMEOUT);
    await device.enableSynchronization();
    // The wrong-PIN feedback is inline (no blocking alert to dismiss).
    await expect(element(by.id('home-screen'))).not.toBeVisible();
    await device.disableSynchronization();
    await enterUnlockPin(TEST_PIN);
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(PIN_DERIVATION_TIMEOUT);
    await device.enableSynchronization();
  });

  it('covers an open sheet with the lock overlay after backgrounding past the auto-lock timeout', async () => {
    await importTestWallet();
    // 기본 자동 잠금(1분) 상태에서 홈의 네트워크 선택 시트를 연다.
    await element(by.id('home-network-badge')).tap();
    await waitFor(element(by.id('network-selector')))
      .toBeVisible()
      .withTimeout(10000);

    // 시트를 연 채로 자동 잠금 시간보다 오래 백그라운드에 둔다.
    await device.sendToHome();
    await new Promise(resolve => setTimeout(resolve, AUTO_LOCK_WAIT_MS));
    await device.launchApp({ newInstance: false });

    // 다른 모달이 열려 있어도 잠금 오버레이가 보이고, 시트는 닫혀 있다.
    await waitFor(element(by.id('lock-overlay')))
      .toBeVisible()
      .withTimeout(15000);
    await expect(element(by.id('network-selector'))).not.toBeVisible();

    // 잠금 해제 후에도 시트는 다시 열리지 않고 홈 화면이 보인다.
    await device.disableSynchronization();
    await enterUnlockPin(TEST_PIN);
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(PIN_DERIVATION_TIMEOUT);
    await device.enableSynchronization();
    await expect(element(by.id('lock-overlay'))).not.toExist();
    await expect(element(by.id('network-selector'))).not.toBeVisible();
  });
});
