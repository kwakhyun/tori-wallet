/**
 * 화면 컨테이너
 *
 * react-native의 SafeAreaView는 Android에서 아무 여백도 적용하지 않으므로
 * react-native-safe-area-context 기반으로 통일한다.
 *  - 스택 화면: 기본값(모든 가장자리)
 *  - 탭 화면: 하단은 탭바가 처리하므로 TAB_SCREEN_EDGES 사용
 *
 * 오프라인일 때는 상단 안전 영역 바로 아래에 OfflineBanner를 레이아웃 흐름 안에 그려
 * ScreenHeader와 내용을 아래로 민다. (화면 위에 겹쳐 헤더를 가리지 않는다)
 */

import React from 'react';
import styled from 'styled-components/native';
import {
  SafeAreaView,
  type Edge,
  type SafeAreaViewProps,
} from 'react-native-safe-area-context';
import { OfflineBanner } from './OfflineBanner';

export const TAB_SCREEN_EDGES: Edge[] = ['top', 'left', 'right'];
export const STACK_SCREEN_EDGES: Edge[] = ['top', 'bottom', 'left', 'right'];

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

export interface ScreenProps extends SafeAreaViewProps {
  /** 오프라인 배너 표시 여부 (기본값 true). 네트워크와 무관한 PIN 입력 시트 등에서 끈다. */
  offlineBanner?: boolean;
}

export function Screen({
  children,
  offlineBanner = true,
  ...props
}: ScreenProps): React.JSX.Element {
  return (
    <Container {...props}>
      {offlineBanner ? <OfflineBanner /> : null}
      {children}
    </Container>
  );
}

export function TabScreen({
  edges = TAB_SCREEN_EDGES,
  ...props
}: ScreenProps): React.JSX.Element {
  return <Screen edges={edges} {...props} />;
}

export default Screen;
