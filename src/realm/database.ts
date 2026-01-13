/**
 * Tori Wallet - Realm Database Configuration
 * Realm 데이터베이스 초기화 및 관리
 */

import Realm from 'realm';
import { ALL_SCHEMAS, SCHEMA_VERSION } from './schemas';
import { createLogger } from '@/utils/logger';

const logger = createLogger('RealmDB');

class RealmDatabase {
  private static instance: RealmDatabase;
  private realm: Realm | null = null;
  private isInitializing = false;
  private initPromise: Promise<Realm> | null = null;

  private constructor() {}

  /**
   * 싱글톤 인스턴스 반환
   */
  static getInstance(): RealmDatabase {
    if (!RealmDatabase.instance) {
      RealmDatabase.instance = new RealmDatabase();
    }
    return RealmDatabase.instance;
  }

  /**
   * Realm 데이터베이스 초기화
   */
  async initialize(): Promise<Realm> {
    // 이미 초기화됨
    if (this.realm && !this.realm.isClosed) {
      return this.realm;
    }

    // 초기화 진행 중이면 기존 Promise 반환
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    this.isInitializing = true;

    this.initPromise = new Promise(async (resolve, reject) => {
      try {
        logger.info('Initializing Realm database...');

        const config: Realm.Configuration = {
          schema: ALL_SCHEMAS,
          schemaVersion: SCHEMA_VERSION,
          // 스키마 마이그레이션 처리
          onMigration: (oldRealm, newRealm) => {
            this.handleMigration(oldRealm, newRealm);
          },
        };

        this.realm = await Realm.open(config);
        logger.info(
          `Realm database initialized. Schema version: ${SCHEMA_VERSION}`,
        );
        this.isInitializing = false;
        resolve(this.realm);
      } catch (error) {
        logger.error('Failed to initialize Realm:', error);
        this.isInitializing = false;
        reject(error);
      }
    });

    return this.initPromise;
  }

  /**
   * 스키마 마이그레이션 처리
   */
  private handleMigration(oldRealm: Realm, _newRealm: Realm): void {
    const oldVersion = oldRealm.schemaVersion;
    logger.info(`Migrating from version ${oldVersion} to ${SCHEMA_VERSION}`);

    // 향후 마이그레이션 로직 추가
    // if (oldVersion < 2) {
    //   // Version 1 -> 2 마이그레이션
    // }
  }

  /**
   * Realm 인스턴스 반환
   */
  async getRealm(): Promise<Realm> {
    if (!this.realm || this.realm.isClosed) {
      return this.initialize();
    }
    return this.realm;
  }

  /**
   * 동기적으로 Realm 인스턴스 반환 (초기화 후에만 사용)
   */
  getRealmSync(): Realm {
    if (!this.realm || this.realm.isClosed) {
      throw new Error('Realm is not initialized. Call initialize() first.');
    }
    return this.realm;
  }

  /**
   * 초기화 여부 확인
   */
  isInitialized(): boolean {
    return this.realm !== null && !this.realm.isClosed;
  }

  /**
   * 트랜잭션 내에서 쓰기 작업 수행
   */
  async write<T>(callback: () => T): Promise<T> {
    const realm = await this.getRealm();
    return new Promise((resolve, reject) => {
      try {
        let result: T;
        realm.write(() => {
          result = callback();
        });
        resolve(result!);
      } catch (error) {
        logger.error('Realm write error:', error);
        reject(error);
      }
    });
  }

  /**
   * 데이터베이스 닫기
   */
  close(): void {
    if (this.realm && !this.realm.isClosed) {
      this.realm.close();
      this.realm = null;
      logger.info('Realm database closed');
    }
  }

  /**
   * 모든 데이터 삭제 (개발/테스트용)
   */
  async deleteAll(): Promise<void> {
    const realm = await this.getRealm();
    realm.write(() => {
      realm.deleteAll();
    });
    logger.warn('All Realm data deleted');
  }

  /**
   * 특정 스키마의 모든 데이터 삭제
   */
  async deleteAllOf(schemaName: string): Promise<void> {
    const realm = await this.getRealm();
    realm.write(() => {
      const objects = realm.objects(schemaName);
      realm.delete(objects);
    });
    logger.info(`All ${schemaName} data deleted`);
  }

  /**
   * 데이터베이스 경로 반환
   */
  getPath(): string | null {
    return this.realm?.path ?? null;
  }

  /**
   * 데이터베이스 크기 반환 (바이트)
   */
  async getSize(): Promise<number> {
    await this.getRealm();
    // Realm은 직접적인 크기 API가 없으므로 파일 시스템 사용
    // 여기서는 대략적인 메서드만 제공
    return 0;
  }

  /**
   * 컴팩션 수행 (파일 크기 최적화)
   */
  async compact(): Promise<boolean> {
    const realm = await this.getRealm();
    return realm.compact();
  }
}

// 싱글톤 인스턴스 내보내기
export const realmDB = RealmDatabase.getInstance();

// 편의 함수들
export async function initializeRealm(): Promise<Realm> {
  return realmDB.initialize();
}

export async function getRealm(): Promise<Realm> {
  return realmDB.getRealm();
}

export function closeRealm(): void {
  realmDB.close();
}
