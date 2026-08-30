/**
 * MSW 서버 설정
 * Jest의 Node 테스트 환경에서 사용하는 MSW 서버 설정
 */

import { setupServer } from 'msw/node';
import type { RequestHandler } from 'msw';
import { handlers } from './handlers';

export const server = setupServer(...handlers);

// 테스트 유틸리티 함수들
export function setupMSW() {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });
}

// 특정 테스트에서 핸들러 오버라이드
export function overrideHandlers(...customHandlers: RequestHandler[]) {
  server.use(...customHandlers);
}

// handlers를 export하여 다른 곳에서 참조 가능하게 함
export { handlers };

// 에러 시나리오 테스트를 위한 헬퍼
export { errorHandlers, slowHandlers } from './handlers';
