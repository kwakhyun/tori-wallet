import { by, device, element, waitFor } from 'detox';

// Public BIP39 test vector. These tests never broadcast a transaction.
const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
export const TEST_PIN = '135790';
// Emulator timing includes the production-strength KDF, without crypto mocks.
export const PIN_DERIVATION_TIMEOUT = process.env.CI ? 300_000 : 180_000;
export async function importTestWallet() {
  await element(by.text('기존 지갑 가져오기')).tap();
  // Enter each field without the paste handler's automatic keyboard focus jump.
  for (const [index, word] of MNEMONIC.split(' ').entries()) {
    const input = element(by.id(`import-word-${index}`));
    if (device.getPlatform() === 'ios') {
      await waitFor(input)
        .toBeVisible()
        .whileElement(by.id('import-wallet-scroll'))
        .scroll(100, 'down', 0.5, 0.25);
    }
    await input.replaceText(word);
    if (device.getPlatform() === 'ios') {
      // Visibility assertions do not account for the separate keyboard window.
      // Tap the scroll view's empty left gutter to dismiss it before the next field.
      await element(by.id('import-wallet-scroll')).tap({ x: 4, y: 4 });
    }
  }
  await element(by.id('import-wallet-scroll')).scrollTo('bottom');
  await waitFor(element(by.id('import-wallet-confirm')))
    .toBeVisible()
    .withTimeout(10000);
  await element(by.id('import-wallet-confirm')).tap();
  await waitFor(element(by.id('set-pin-key-1')))
    .toBeVisible()
    .withTimeout(30000);
  for (const digit of TEST_PIN)
    await element(by.id(`set-pin-key-${digit}`)).tap();
  // The real KDF continuously yields through JS timers. Wait for its result
  // explicitly instead of asking Detox to find an idle interval during it.
  await device.disableSynchronization();
  for (const digit of TEST_PIN)
    await element(by.id(`set-pin-key-${digit}`)).tap();
  await waitFor(element(by.id('home-screen')))
    .toBeVisible()
    .withTimeout(PIN_DERIVATION_TIMEOUT);
  await device.enableSynchronization();
}
export async function enterUnlockPin(pin: string) {
  for (const digit of pin) await element(by.id(`unlock-key-${digit}`)).tap();
}
