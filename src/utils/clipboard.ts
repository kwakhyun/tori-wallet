/**
 * 클립보드 접근을 한곳에 모은다.
 *
 * RN 코어 Clipboard는 deprecated 상태라, 네이티브 모듈
 * (@react-native-clipboard/clipboard)로 옮길 때 이 파일만 바꾸면 된다.
 * 화면 코드는 react-native의 Clipboard를 직접 import하지 않는다 (ESLint로 막음).
 */
// eslint-disable-next-line no-restricted-imports -- 이 파일이 유일한 진입점이다
import { Clipboard } from 'react-native';

/** 텍스트를 클립보드에 복사한다. */
export function copyToClipboard(text: string): void {
  Clipboard.setString(text);
}

/** 클립보드 내용을 읽는다. 비어 있으면 ''. 읽기 실패는 호출한 쪽으로 전달된다. */
export async function readClipboard(): Promise<string> {
  return (await Clipboard.getString()) ?? '';
}

/** 복구 구문처럼 민감한 내용을 붙여넣은 뒤 클립보드를 비운다. */
export function clearClipboard(): void {
  Clipboard.setString('');
}
