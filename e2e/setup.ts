/**
 * Tori Wallet - E2E Test Setup
 */

import { beforeAll, afterAll, beforeEach } from '@jest/globals';
import { device } from 'detox';

beforeAll(async () => {
  await device.launchApp({
    newInstance: true,
    permissions: {
      notifications: 'YES',
      camera: 'YES',
      faceid: 'YES',
    },
  });
});

beforeEach(async () => {
  await device.reloadReactNative();
});

afterAll(async () => {
  await device.terminateApp();
});
