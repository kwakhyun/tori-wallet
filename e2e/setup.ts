/**
 * E2E 테스트 설정
 */

import { beforeAll, afterAll, beforeEach } from '@jest/globals';
import { device } from 'detox';

beforeAll(async () => {
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

beforeEach(async () => {
  // 앱 크래시 후 복구를 위해 try-catch 사용
  try {
    await device.reloadReactNative();
  } catch {
    // 앱이 크래시된 경우 새로 시작
    await device.launchApp({ newInstance: true });
  }
});

afterAll(async () => {
  await device.terminateApp();
});
