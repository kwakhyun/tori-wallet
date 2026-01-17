/**
 * styled-components 테마 타입 정의
 */
import 'styled-components/native';
import { Theme } from './theme';

declare module 'styled-components/native' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface DefaultTheme extends Theme {}
}
