// Tori Wallet - Styled Components Theme Type Declaration
import 'styled-components/native';
import { Theme } from './theme';

declare module 'styled-components/native' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface DefaultTheme extends Theme {}
}
