/**
 * React Native 환경 Polyfill 설정
 */

// crypto.getRandomValues polyfill (니모닉 생성 등에 필요)
import 'react-native-get-random-values';

// TextEncoder/TextDecoder polyfill (WalletConnect 등에 필요)
import { TextEncoder, TextDecoder } from 'text-encoding';

if (typeof globalThis.TextEncoder === 'undefined') {
  (globalThis as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder =
    TextEncoder;
}

if (typeof globalThis.TextDecoder === 'undefined') {
  (globalThis as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder =
    TextDecoder;
}

// Buffer 폴리필
import { Buffer as BufferPolyfill } from 'buffer';

// 글로벌 Buffer 설정
(globalThis as unknown as { Buffer: typeof BufferPolyfill }).Buffer =
  BufferPolyfill;

export { BufferPolyfill as Buffer };
