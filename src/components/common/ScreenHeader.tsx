/**
 * 공용 화면 헤더
 *
 * 모든 스택 화면이 같은 뒤로 가기/닫기 동작, 접근성 라벨, 터치 영역을 갖도록 한다.
 */

import React from 'react';
import styled from 'styled-components/native';
import { useNavigation } from '@react-navigation/native';
import { IconButton } from './IconButton';

export interface ScreenHeaderProps {
  title?: string;
  /** 'back'(←) 또는 'close'(✕). null이면 왼쪽 버튼을 숨긴다. */
  leftIcon?: 'back' | 'close' | null;
  /** 기본값: navigation.goBack() */
  onBack?: () => void;
  backDisabled?: boolean;
  right?: React.ReactNode;
  subtitle?: string;
  testID?: string;
  backTestID?: string;
}

export function ScreenHeader({
  title,
  leftIcon = 'back',
  onBack,
  backDisabled,
  right,
  subtitle,
  testID,
  backTestID,
}: ScreenHeaderProps): React.JSX.Element {
  const navigation = useNavigation();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (navigation.canGoBack()) navigation.goBack();
  };

  return (
    <Container testID={testID}>
      <Side>
        {leftIcon ? (
          <IconButton
            icon={leftIcon === 'close' ? '✕' : '←'}
            accessibilityLabel={leftIcon === 'close' ? '닫기' : '뒤로 가기'}
            onPress={handleBack}
            disabled={backDisabled}
            testID={backTestID ?? (testID ? `${testID}-back` : undefined)}
          />
        ) : null}
      </Side>
      <Center>
        {title ? (
          <Title accessibilityRole="header" numberOfLines={1}>
            {title}
          </Title>
        ) : null}
        {subtitle ? <Subtitle numberOfLines={1}>{subtitle}</Subtitle> : null}
      </Center>
      <Side $alignEnd>{right}</Side>
    </Container>
  );
}

const Container = styled.View`
  flex-direction: row;
  align-items: center;
  min-height: 56px;
  padding: 0 ${({ theme }) => theme.spacing.sm}px;
`;

const Side = styled.View<{ $alignEnd?: boolean }>`
  min-width: 52px;
  flex-direction: row;
  align-items: center;
  justify-content: ${({ $alignEnd }) =>
    $alignEnd ? 'flex-end' : 'flex-start'};
`;

const Center = styled.View`
  flex: 1;
  align-items: center;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 18px;
  font-weight: 600;
`;

const Subtitle = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 12px;
  margin-top: 2px;
`;

export default ScreenHeader;
