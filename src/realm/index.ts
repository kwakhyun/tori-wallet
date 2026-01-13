/**
 * Tori Wallet - Realm Module Index
 *
 * Realm은 복잡한 로컬 데이터를 효율적으로 관리합니다:
 * - 주소록 (Address Book)
 * - 트랜잭션 캐시 (Transaction Cache)
 * - 토큰 목록 (Token List with hidden/spam flags)
 * - WalletConnect 로그 (Session & Request logs)
 * - 동기화 상태 (Sync Status for offline UX)
 * - 사용자 설정 (User Preferences)
 *
 * React Query (REST/RPC)는 서버 상태를,
 * Realm은 로컬 상태를 관리합니다.
 */

// Database
export { realmDB, initializeRealm, getRealm, closeRealm } from './database';

// Schemas
export * from './schemas';

// Services
export * from './services';

// Hooks
export * from './hooks';
