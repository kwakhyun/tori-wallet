/**
 * E2E 테스트 설정
 */

import { afterAll, beforeEach } from '@jest/globals';
import { device } from 'detox';

beforeEach(async () => {
  if (device.getPlatform() === 'ios') {
    // Keychain survives uninstall. Only clear the disposable simulator created
    // by our runner, never a developer's existing simulator.
    if (process.env.TORI_E2E_SIMULATOR_UDID !== device.id) {
      throw new Error(
        'Run iOS E2E with yarn e2e:ios on an isolated simulator.',
      );
    }
    await device.clearKeychain();
  }
  await device.launchApp({
    newInstance: true,
    delete: true, // 앱 데이터 초기화 (깨끗한 상태에서 시작)
    permissions: {
      notifications: 'YES',
      camera: 'YES',
      faceid: 'YES',
    },
  });
});

afterAll(async () => {
  await device.terminateApp();
});
