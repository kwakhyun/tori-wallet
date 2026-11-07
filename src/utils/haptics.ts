/**
 * 햅틱 피드백 유틸리티
 *
 * iOS의 Vibration API는 지속 시간을 무시하고 약 400ms 진동을 발생시키므로
 * 키 입력처럼 잦은 피드백에는 사용하지 않는다. 오류처럼 드문 이벤트에만 진동한다.
 */

import { Platform, Vibration } from 'react-native';

/** 키패드 입력 등 가벼운 탭 피드백 (Android 전용) */
export function tapFeedback(): void {
  if (Platform.OS === 'android') {
    Vibration.vibrate(10);
  }
}

/** PIN 불일치, 검증 실패 등 오류 피드백 */
export function errorFeedback(): void {
  if (Platform.OS === 'android') {
    Vibration.vibrate([0, 40, 60, 40]);
  } else {
    Vibration.vibrate();
  }
}

/** 성공 피드백 (Android 전용, iOS는 시각 피드백으로 충분) */
export function successFeedback(): void {
  if (Platform.OS === 'android') {
    Vibration.vibrate(20);
  }
}
