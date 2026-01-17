/**
 * MSW 서버 설정
 * React Native 테스트용 MSW 서버 설정
 *
 * 참고: MSW 2.x에서 React Native는 msw/native를 사용해야 하지만,
 * Jest 테스트 환경에서는 fetch mock을 직접 사용하는 것이 더 안정적입니다.
 * 이 파일은 향후 MSW React Native 지원이 안정화되면 활성화할 수 있습니다.
 */

import { handlers } from './handlers';

// MSW 서버 모킹 (React Native 환경에서는 직접 fetch mock 사용)
export const server = {
  listen: () => {},
  close: () => {},
  resetHandlers: () => {},
  use: (..._handlers: unknown[]) => {},
};

// 테스트 유틸리티 함수들
export function setupMSW() {
  // React Native에서는 fetch를 직접 모킹하는 것을 권장
  beforeAll(() => {
    // server.listen({ onUnhandledRequest: 'warn' })
  });

  afterEach(() => {
    // server.resetHandlers()
  });

  afterAll(() => {
    // server.close()
  });
}

// 특정 테스트에서 핸들러 오버라이드
export function overrideHandlers(...customHandlers: unknown[]) {
  server.use(...customHandlers);
}

// handlers를 export하여 다른 곳에서 참조 가능하게 함
export { handlers };

// 에러 시나리오 테스트를 위한 헬퍼
export { errorHandlers, slowHandlers } from './handlers';
