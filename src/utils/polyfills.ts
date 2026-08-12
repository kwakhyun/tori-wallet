/**
 * React Native 환경 Polyfill 설정
 */

// WalletConnect 공식 RN 호환 레이어. @reown/* 모듈보다 먼저 로드되어야 합니다.
// crypto.getRandomValues, TextEncoder/Decoder, URL 등 필수 폴리필을 설치합니다.
import '@walletconnect/react-native-compat';

// Buffer 폴리필
import { Buffer as BufferPolyfill } from 'buffer';

// 글로벌 Buffer 설정
(globalThis as unknown as { Buffer: typeof BufferPolyfill }).Buffer =
  BufferPolyfill;

export { BufferPolyfill as Buffer };
