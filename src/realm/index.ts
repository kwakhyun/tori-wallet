/**
 * Realm 모듈 내보내기
 *
 * Realm은 복잡한 로컬 데이터를 효율적으로 관리합니다:
 * - 주소록
 * - 트랜잭션 캐시
 * - 토큰 목록 (숨김/스팸 플래그)
 * - WalletConnect 로그
 * - 동기화 상태 (오프라인 UX)
 * - 사용자 설정
 */

// Database
export { realmDB, initializeRealm, getRealm, closeRealm } from './database';

// Schemas
export * from './schemas';

// Services
export * from './services';

// Hooks
export * from './hooks';
