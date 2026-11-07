/**
 * 잠금 오버레이 ↔ 잠금 화면 하드웨어 뒤로 가기 연결
 *
 * Android 잠금 오버레이(RN Modal)가 떠 있으면 뒤로 가기는 BackHandler가 아니라 Modal의
 * onRequestClose로 전달된다. 오버레이가 이 ref를 제공하면 UnlockScreen이 PIN 분실
 * 안내를 닫는 처리기를 등록하고, 오버레이는 onRequestClose에서 그 처리기를 호출한다.
 */

import { createContext } from 'react';

/** 하드웨어 뒤로 가기 처리기. 처리했으면 true */
export type UnlockBackHandler = () => boolean;

export interface UnlockBackHandlerRef {
  current: UnlockBackHandler | null;
}

export const UnlockBackHandlerContext =
  createContext<UnlockBackHandlerRef | null>(null);
