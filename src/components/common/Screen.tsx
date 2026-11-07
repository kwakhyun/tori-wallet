/**
 * 화면 컨테이너
 *
 * react-native의 SafeAreaView는 Android에서 아무 여백도 적용하지 않으므로
 * react-native-safe-area-context 기반으로 통일한다.
 *  - 스택 화면: 기본값(모든 가장자리)
 *  - 탭 화면: 하단은 탭바가 처리하므로 TAB_SCREEN_EDGES 사용
 */

import styled from 'styled-components/native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

export const TAB_SCREEN_EDGES: Edge[] = ['top', 'left', 'right'];
export const STACK_SCREEN_EDGES: Edge[] = ['top', 'bottom', 'left', 'right'];

export const Screen = styled(SafeAreaView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

export const TabScreen = styled(SafeAreaView).attrs({
  edges: TAB_SCREEN_EDGES,
})`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

export default Screen;
