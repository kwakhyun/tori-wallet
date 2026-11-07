/**
 * 복구 구문 백업 화면
 *
 * - 헤더 뒤로 가기와 Android 하드웨어 뒤로 가기 모두 복구 구문 폐기를 확인한다.
 * - 복구 구문은 확인 후 다시 숨길 수 있다.
 * - Android는 FLAG_SECURE로 스크린샷을 막지만 iOS는 막을 수 없으므로 경고한다.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import styled from 'styled-components/native';
import {
  Alert,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';
import { useTheme } from '@/hooks/useTheme';
import { onboardingVault } from '@/services/onboardingVault';
import { ScreenHeader } from '@/components/common/ScreenHeader';

type NavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'BackupMnemonic'
>;
const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
});

const IOS_SCREENSHOT_WARNING =
  'iPhone에서는 앱이 스크린샷을 막을 수 없습니다. 스크린샷은 사진 앱과 iCloud에 저장·동기화되어 유출될 수 있으니 반드시 종이에 적어 보관하세요.';

function BackupMnemonicScreen(): React.JSX.Element {
  const { isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const mnemonic = onboardingVault.getSnapshot()?.mnemonic || '';

  useEffect(() => {
    if (!mnemonic) navigation.navigate('Welcome');
  }, [mnemonic, navigation]);

  const [isRevealed, setIsRevealed] = useState(false);
  const [hasRevealed, setHasRevealed] = useState(false);
  const [hasConfirmedBackup, setHasConfirmedBackup] = useState(false);

  const words = useMemo(
    () => (mnemonic ? mnemonic.split(' ') : []),
    [mnemonic],
  );

  const allowLeave = useRef(false);

  const confirmDiscard = useCallback((leave: () => void) => {
    Alert.alert(
      '백업을 중단할까요?',
      '지금 나가면 이 복구 구문은 폐기됩니다. 다시 시작하면 새로운 복구 구문이 만들어집니다.',
      [
        { text: '계속 백업하기', style: 'cancel' },
        { text: '중단', style: 'destructive', onPress: leave },
      ],
    );
  }, []);

  // 헤더 뒤로 가기와 Android 하드웨어 뒤로 가기 모두 이 화면을 제거하려 할 때
  // 같은 확인을 거친다. (iOS 스와이프 뒤로 가기는 AuthNavigator에서 막는다)
  useEffect(
    () =>
      navigation.addListener('beforeRemove', event => {
        if (allowLeave.current || !onboardingVault.getSnapshot()) return;
        event.preventDefault();
        confirmDiscard(() => {
          allowLeave.current = true;
          // 폐기하면 AuthNavigator가 시작 화면으로 다시 그린다.
          onboardingVault.clear('cancelled');
        });
      }),
    [confirmDiscard, navigation],
  );

  const handleReveal = () => {
    Alert.alert(
      '주의',
      `복구 구문을 다른 사람에게 보여주거나 공유하지 마세요.\n주변에 카메라나 다른 사람이 없는지 확인하세요.${
        Platform.OS === 'ios' ? '\n\n스크린샷을 찍지 마세요.' : ''
      }`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '확인',
          onPress: () => {
            setIsRevealed(true);
            setHasRevealed(true);
          },
        },
      ],
    );
  };

  const handleHide = () => setIsRevealed(false);

  const goToVerify = () => {
    // 다음 화면에서 돌아왔을 때 복구 구문이 그대로 노출되지 않게 한다.
    setIsRevealed(false);
    navigation.navigate('VerifyMnemonic');
  };

  const handleContinue = () => {
    if (!hasRevealed) return;
    if (hasConfirmedBackup) {
      goToVerify();
      return;
    }
    Alert.alert('백업 확인', '복구 구문을 안전한 곳에 적어두셨나요?', [
      { text: '아니요', style: 'cancel' },
      {
        text: '네, 적어뒀습니다',
        onPress: () => {
          setHasConfirmedBackup(true);
          goToVerify();
        },
      },
    ]);
  };

  return (
    <Container>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        onBack={() => navigation.goBack()}
        backTestID="backup-back"
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Content>
          <Title accessibilityRole="header">복구 구문 백업</Title>
          <Description>
            아래 {words.length}개의 단어를 순서대로 안전한 곳에 적어두세요.
            {'\n'}이 구문은 지갑을 복구하는 유일한 방법입니다.
          </Description>

          <MnemonicContainer>
            {!isRevealed ? (
              <BlurOverlay>
                <RevealButton
                  testID="backup-reveal"
                  onPress={handleReveal}
                  accessibilityRole="button"
                  accessibilityLabel="복구 구문 보기"
                >
                  <RevealIcon importantForAccessibility="no">👁️</RevealIcon>
                  <RevealText>탭하여 복구 구문 보기</RevealText>
                </RevealButton>
              </BlurOverlay>
            ) : (
              <>
                <WordsGrid testID="backup-words">
                  {words.map((word, index) => (
                    <WordItem
                      key={index}
                      accessible
                      accessibilityLabel={`${index + 1}번째 단어 ${word}`}
                    >
                      <WordNumber>{index + 1}</WordNumber>
                      <WordText>{word}</WordText>
                    </WordItem>
                  ))}
                </WordsGrid>
                <HideButton
                  testID="backup-hide"
                  onPress={handleHide}
                  accessibilityRole="button"
                  accessibilityLabel="복구 구문 다시 숨기기"
                >
                  <HideButtonText>다시 숨기기</HideButtonText>
                </HideButton>
              </>
            )}
          </MnemonicContainer>

          {hasRevealed && (
            <WarningBox>
              <WarningIcon importantForAccessibility="no">⚠️</WarningIcon>
              <WarningText>
                • 종이에 적어서 안전한 곳에 보관하세요{'\n'}• 스크린샷이나
                사진으로 저장하지 마세요{'\n'}• 누구에게도 공유하지 마세요
              </WarningText>
            </WarningBox>
          )}

          {Platform.OS === 'ios' ? (
            <CautionBox testID="backup-ios-screenshot-warning">
              <CautionText>{IOS_SCREENSHOT_WARNING}</CautionText>
            </CautionBox>
          ) : null}

          <Spacer />

          <ContinueButton
            testID="backup-continue"
            onPress={handleContinue}
            disabled={!hasRevealed}
            $enabled={hasRevealed}
            accessibilityRole="button"
            accessibilityState={{ disabled: !hasRevealed }}
          >
            <ContinueButtonText $enabled={hasRevealed}>
              {hasRevealed ? '다음 단계로' : '복구 구문을 먼저 확인하세요'}
            </ContinueButtonText>
          </ContinueButton>
        </Content>
      </ScrollView>
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Content = styled.View`
  flex: 1;
  padding: 0 ${({ theme }) => theme.spacing.lg}px
    ${({ theme }) => theme.spacing.lg}px;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.h1.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.h1.fontWeight};
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const Description = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  line-height: 24px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const MnemonicContainer = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  min-height: 200px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const BlurOverlay = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
  min-height: 180px;
`;

const RevealButton = styled.TouchableOpacity`
  align-items: center;
  justify-content: center;
  min-height: ${({ theme }) => theme.touchTarget}px;
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const RevealIcon = styled.Text`
  font-size: 48px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const RevealText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
`;

const WordsGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
`;

const WordItem = styled.View`
  width: 48%;
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.backgroundTertiary};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const WordNumber = styled.Text`
  color: ${({ theme }) => theme.colors.textTertiary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  width: 24px;
`;

const WordText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 500;
`;

const HideButton = styled.TouchableOpacity`
  min-height: ${({ theme }) => theme.touchTarget}px;
  align-self: center;
  justify-content: center;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

const HideButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: 600;
`;

const WarningBox = styled.View`
  flex-direction: row;
  background-color: ${({ theme }) => theme.colors.errorSubtle};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  border: 1px solid ${({ theme }) => theme.colors.error};
`;

const WarningIcon = styled.Text`
  font-size: 20px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const WarningText = styled.Text`
  flex: 1;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
`;

const CautionBox = styled.View`
  background-color: ${({ theme }) => theme.colors.warningSubtle};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const CautionText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
`;

const Spacer = styled.View`
  flex: 1;
  min-height: 20px;
`;

const ContinueButton = styled.TouchableOpacity<{ $enabled: boolean }>`
  background-color: ${({ theme, $enabled }) =>
    $enabled ? theme.colors.primary : theme.colors.disabledBackground};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  min-height: ${({ theme }) => theme.touchTarget + 8}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  justify-content: center;
  margin-top: ${({ theme }) => theme.spacing.lg}px;
`;

const ContinueButtonText = styled.Text<{ $enabled: boolean }>`
  color: ${({ theme, $enabled }) =>
    $enabled ? theme.colors.onPrimary : theme.colors.disabledText};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

export default BackupMnemonicScreen;
