import { by, device, element, expect, waitFor } from 'detox';
import {
  enterUnlockPin,
  importTestWallet,
  PIN_DERIVATION_TIMEOUT,
  TEST_PIN,
} from './helpers/wallet';

describe('Wallet lock and PIN authentication', () => {
  it('locks after restart, rejects a wrong PIN, and unlocks with the correct PIN', async () => {
    await importTestWallet();
    await device.terminateApp();
    await device.launchApp({ newInstance: true });
    await waitFor(element(by.id('unlock-screen')))
      .toBeVisible()
      .withTimeout(15000);
    await enterUnlockPin('000000');
    await waitFor(element(by.text('PIN이 올바르지 않습니다.')))
      .toBeVisible()
      .withTimeout(PIN_DERIVATION_TIMEOUT);
    await element(by.text('OK')).tap();
    await expect(element(by.id('home-screen'))).not.toBeVisible();
    await enterUnlockPin(TEST_PIN);
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(PIN_DERIVATION_TIMEOUT);
  });
});
