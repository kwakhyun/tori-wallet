/**
 * styled-components 테마 타입 정의
 */
import 'styled-components/native';
import { Theme } from './theme';

declare module 'styled-components/native' {
  // DefaultTheme를 Theme로 확장하여 타입 안전성 제공
  export interface DefaultTheme extends Theme {}
}
