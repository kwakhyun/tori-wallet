/**
 * 앱 정보 (버전 표시용)
 *
 * 버전은 package.json 하나에서만 관리한다.
 */

import packageJson from '../../package.json';

export const APP_VERSION: string = packageJson.version;
export const APP_NAME = 'Tori Wallet';
