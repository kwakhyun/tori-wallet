/**
 * 지갑 가져오기 화면 (니모닉 복원)
 */

import React, { useState, useCallback, useRef, useMemo } from 'react';
import styled from 'styled-components/native';
import { useTheme } from '@/hooks/useTheme';
import {
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  ActivityIndicator,
  Clipboard,
  Keyboard,
  TextInput,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';
import { walletService } from '@/services/walletService';
import { createLogger } from '@/utils/logger';
import { onboardingVault } from '@/services/onboardingVault';

const logger = createLogger('ImportWallet');

type NavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'ImportWallet'
>;

function ImportWalletScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const { theme, isDarkMode } = useTheme();
  const [wordCount, setWordCount] = useState<12 | 24>(12);
  const [words, setWords] = useState<string[]>(Array(12).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const wordInputStyle = useMemo(
    () =>
      StyleSheet.create({
        input: {
          flex: 1,
          color: theme.colors.textPrimary,
          fontSize: theme.typography.body.fontSize,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: 0,
        },
      }),
    [theme],
  );

  // 단어 수 변경
  const handleWordCountChange = useCallback((count: 12 | 24) => {
    setWordCount(count);
    setWords(Array(count).fill(''));
  }, []);

  // 개별 단어 변경
  const handleWordChange = useCallback(
    (index: number, text: string) => {
      // 붙여넣기 감지: 공백, 쉼표, 줄바꿈 등으로 구분된 여러 단어가 있는지 확인
      const separators = /[\s,\n\r\t]+/;
      const pastedWords = text
        .trim()
        .split(separators)
        .filter(w => w.length > 0);

      if (pastedWords.length > 1) {
        // 여러 단어가 붙여넣기됨 - 순서대로 채우기
        const newWords = [...words];
        pastedWords.forEach((word, i) => {
          if (index + i < wordCount) {
            newWords[index + i] = word.toLowerCase();
          }
        });
        setWords(newWords);

        // 마지막으로 채워진 칸 다음으로 포커스 이동
        const nextIndex = Math.min(index + pastedWords.length, wordCount - 1);
        inputRefs.current[nextIndex]?.focus();
      } else {
        // 단일 단어 입력
        const newWords = [...words];
        newWords[index] = text.toLowerCase().trim();
        setWords(newWords);

        // 단어 입력 후 자동으로 다음 칸으로 이동
        if (text.endsWith(' ') && index < wordCount - 1) {
          newWords[index] = text.trim().toLowerCase();
          setWords(newWords);
          inputRefs.current[index + 1]?.focus();
        }
      }
    },
    [words, wordCount],
  );

  // 전체 붙여넣기
  const handlePasteAll = useCallback(async () => {
    try {
      const text = await Clipboard.getString();
      Clipboard.setString('');
      if (text) {
        const separators = /[\s,\n\r\t]+/;
        const pastedWords = text
          .trim()
          .toLowerCase()
          .split(separators)
          .filter(w => w.length > 0);

        if (pastedWords.length === 12 || pastedWords.length === 24) {
          setWordCount(pastedWords.length as 12 | 24);
          setWords(pastedWords);
        } else if (pastedWords.length > 0) {
          // 단어 수가 맞지 않아도 현재 선택된 칸 수만큼 채우기
          const newWords = Array(wordCount).fill('');
          pastedWords.forEach((word, i) => {
            if (i < wordCount) {
              newWords[i] = word;
            }
          });
          setWords(newWords);
        }
      }
    } catch {
      Alert.alert('오류', '클립보드에서 붙여넣기에 실패했습니다.');
    }
  }, [wordCount]);

  // 전체 지우기
  const handleClearAll = useCallback(() => {
    setWords(Array(wordCount).fill(''));
    inputRefs.current[0]?.focus();
  }, [wordCount]);

  // 지갑 가져오기
  const handleImport = useCallback(async () => {
    Keyboard.dismiss();

    const mnemonic = words.join(' ').trim();

    // 유효성 검사
    if (!walletService.validateMnemonic(mnemonic)) {
      Alert.alert(
        '유효하지 않은 복구 구문',
        '모든 단어를 올바르게 입력했는지 확인해주세요.',
      );
      return;
    }

    setIsLoading(true);
    setLoadingProgress(0);
    setLoadingMessage('복구 구문 검증 중...');

    try {
      // 애니메이션을 위한 부드러운 진행률 업데이트 함수
      const smoothProgress = async (
        start: number,
        end: number,
        duration: number,
      ) => {
        const steps = 10;
        const stepDuration = duration / steps;
        const stepSize = (end - start) / steps;

        for (let i = 1; i <= steps; i++) {
          await new Promise(resolve => setTimeout(resolve, stepDuration));
          setLoadingProgress(start + stepSize * i);
        }
      };

      // 단계 1: 복구 구문 검증 (0% -> 20%)
      await smoothProgress(0, 20, 300);
      setLoadingMessage('니모닉 유효성 확인...');

      // 단계 2: 키 파생 준비 (20% -> 40%)
      await smoothProgress(20, 40, 300);
      setLoadingMessage('마스터 키 생성 중...');

      // 단계 3: 계정 파생 - UI 블로킹 방지를 위해 setTimeout으로 감싸기
      // 이 단계가 실제 작업이 진행되는 곳
      await smoothProgress(40, 55, 200);
      setLoadingMessage('지갑 주소 생성 중...');

      // 실제 계정 파생 (동기 작업을 비동기로 래핑)
      const account = await new Promise<
        ReturnType<typeof walletService.deriveAccount>
      >((resolve, reject) => {
        // setTimeout으로 다음 틱에서 실행하여 UI 업데이트 허용
        setTimeout(() => {
          try {
            const result = walletService.deriveAccount(mnemonic, 0);
            resolve(result);
          } catch (err) {
            reject(err);
          }
        }, 50);
      });

      // 단계 4: 마무리 (55% -> 100%)
      await smoothProgress(55, 100, 300);
      setLoadingMessage('완료!');

      await new Promise(resolve => setTimeout(resolve, 200));

      onboardingVault.start(mnemonic, account.address);
      setWords(Array(wordCount).fill(''));
      navigation.navigate('SetPin');
    } catch (error) {
      logger.error('Failed to import wallet:', error);
      Alert.alert('오류', '지갑 가져오기에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
      setLoadingProgress(0);
      setLoadingMessage('');
    }
  }, [words, wordCount, navigation]);

  // 입력 완료 여부
  const filledCount = words.filter(w => w.length > 0).length;
  const isComplete = filledCount === wordCount;

  return (
    <Container>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView keyboardShouldPersistTaps="handled">
        <Content>
          <Header>
            <BackButton onPress={() => navigation.goBack()}>
              <BackButtonText>←</BackButtonText>
            </BackButton>
          </Header>

          <Title>지갑 가져오기</Title>
          <Description>
            기존 지갑의 복구 구문을 입력하여 지갑을 복구합니다.
          </Description>

          {/* 단어 수 선택 탭 */}
          <TabContainer>
            <Tab
              $active={wordCount === 12}
              onPress={() => handleWordCountChange(12)}
            >
              <TabText $active={wordCount === 12}>12 단어</TabText>
            </Tab>
            <Tab
              $active={wordCount === 24}
              onPress={() => handleWordCountChange(24)}
            >
              <TabText $active={wordCount === 24}>24 단어</TabText>
            </Tab>
          </TabContainer>

          {/* 액션 버튼 */}
          <ActionRow>
            <ActionButton onPress={handlePasteAll}>
              <ActionButtonText>📋 전체 붙여넣기</ActionButtonText>
            </ActionButton>
            <ActionButton onPress={handleClearAll}>
              <ActionButtonText>✕ 전체 지우기</ActionButtonText>
            </ActionButton>
          </ActionRow>

          {/* 단어 입력 그리드 */}
          <WordsGrid>
            {words.map((word, index) => (
              <WordInputContainer key={index}>
                <WordNumber>{index + 1}</WordNumber>
                <TextInput
                  ref={(ref: TextInput | null) => {
                    inputRefs.current[index] = ref;
                  }}
                  value={word}
                  onChangeText={text => handleWordChange(index, text)}
                  placeholder={`${index + 1}번째`}
                  placeholderTextColor="#52525B"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  returnKeyType={index < wordCount - 1 ? 'next' : 'done'}
                  onSubmitEditing={() => {
                    if (index < wordCount - 1) {
                      inputRefs.current[index + 1]?.focus();
                    } else {
                      Keyboard.dismiss();
                    }
                  }}
                  style={wordInputStyle.input}
                />
              </WordInputContainer>
            ))}
          </WordsGrid>

          {/* 진행 상태 */}
          <ProgressContainer>
            <ProgressText>
              {filledCount} / {wordCount} 단어 입력됨
            </ProgressText>
            <ProgressBar>
              <ProgressFill
                style={{ width: `${(filledCount / wordCount) * 100}%` }}
              />
            </ProgressBar>
          </ProgressContainer>

          {/* 보안 경고 */}
          <WarningBox>
            <WarningIcon>🔒</WarningIcon>
            <WarningText>
              복구 구문은 안전하게 암호화되어 기기에만 저장됩니다.
            </WarningText>
          </WarningBox>

          {/* 가져오기 버튼 */}
          <ImportButton
            onPress={handleImport}
            disabled={!isComplete || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ImportButtonText>지갑 가져오기</ImportButtonText>
            )}
          </ImportButton>
        </Content>
      </ScrollView>

      {/* 전체 화면 로딩 오버레이 */}
      {isLoading && (
        <LoadingOverlay>
          <LoadingContainer>
            <LoadingPercentText>
              {Math.floor(loadingProgress)}%
            </LoadingPercentText>
            <LoadingBarContainer>
              <LoadingBarFill
                style={{ width: `${Math.floor(loadingProgress)}%` }}
              />
            </LoadingBarContainer>
            <LoadingText>{loadingMessage}</LoadingText>
            <LoadingSubText>잠시만 기다려주세요</LoadingSubText>
          </LoadingContainer>
        </LoadingOverlay>
      )}
    </Container>
  );
}

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Content = styled.View`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const BackButton = styled.TouchableOpacity`
  padding: ${({ theme }) => theme.spacing.sm}px;
`;

const BackButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 24px;
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

const TabContainer = styled.View`
  flex-direction: row;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const Tab = styled.TouchableOpacity<{ $active: boolean }>`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.primary : 'transparent'};
  align-items: center;
`;

const TabText = styled.Text<{ $active: boolean }>`
  color: ${({ theme, $active }) =>
    $active ? '#FFFFFF' : theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
`;

const ActionRow = styled.View`
  flex-direction: row;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const ActionButton = styled.TouchableOpacity`
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.sm}px;
`;

const ActionButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: 500;
`;

const WordsGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const WordInputContainer = styled.View`
  width: 48%;
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  padding-left: ${({ theme }) => theme.spacing.sm}px;
`;

const WordNumber = styled.Text`
  color: ${({ theme }) => theme.colors.textTertiary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  width: 24px;
`;

const ProgressContainer = styled.View`
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const ProgressText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const ProgressBar = styled.View`
  height: 4px;
  background-color: ${({ theme }) => theme.colors.border};
  border-radius: 2px;
  overflow: hidden;
`;

const ProgressFill = styled.View`
  height: 100%;
  background-color: ${({ theme }) => theme.colors.primary};
  border-radius: 2px;
`;

const WarningBox = styled.View`
  flex-direction: row;
  background-color: ${({ theme }) => theme.colors.primary}10;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const WarningIcon = styled.Text`
  font-size: 20px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const WarningText = styled.Text`
  flex: 1;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
`;

const ImportButton = styled.TouchableOpacity<{ disabled?: boolean }>`
  background-color: ${({ theme, disabled }) =>
    disabled ? theme.colors.border : theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const ImportButtonText = styled.Text`
  color: #ffffff;
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

const LoadingOverlay = styled.View`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const LoadingContainer = styled.View`
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.xl}px;
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  align-items: center;
  min-width: 250px;
`;

const LoadingPercentText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 48px;
  font-weight: 700;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const LoadingBarContainer = styled.View`
  width: 100%;
  height: 8px;
  background-color: ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  overflow: hidden;
`;

const LoadingBarFill = styled.View`
  height: 100%;
  background-color: ${({ theme }) => theme.colors.primary};
  border-radius: 4px;
`;

const LoadingText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.body.fontSize}px;
  font-weight: 600;
  margin-top: ${({ theme }) => theme.spacing.md}px;
`;

const LoadingSubText = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  margin-top: ${({ theme }) => theme.spacing.xs}px;
`;

export default ImportWalletScreen;
