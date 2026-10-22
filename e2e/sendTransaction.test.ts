import { by, device, element, expect, waitFor } from 'detox';
import { importTestWallet } from './helpers/wallet';

describe('Send transaction input validation', () => {
  it('opens the configured-wallet flow and blocks an invalid recipient before signing', async () => {
    await importTestWallet();
    await element(by.id('home-send-button')).tap();
    await expect(element(by.id('send-address-input'))).toBeVisible();
    await expect(element(by.id('send-confirm-button'))).not.toExist();
    await element(by.id('send-address-input')).replaceText('invalid-address');
    await element(by.id('send-amount-input')).replaceText('1');
    if (device.getPlatform() === 'ios') {
      await element(by.id('send-scroll')).tap({ x: 4, y: 4 });
      await waitFor(element(by.id('send-continue-button')))
        .toBeVisible()
        .whileElement(by.id('send-scroll'))
        .scroll(100, 'down', 0.5, 0.25);
    }
    await element(by.id('send-continue-button')).tap();
    await expect(element(by.text('유효하지 않은 주소입니다.'))).toBeVisible();
    await element(by.text('OK')).tap();
    await expect(element(by.id('pin-confirm-container'))).not.toBeVisible();
    await expect(element(by.id('send-confirm-button'))).not.toExist();
  });
});
