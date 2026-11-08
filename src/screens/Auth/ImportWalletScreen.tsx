/**
 * 지갑 가져오기 화면 (복구 구문으로 복원)
 *
 * - BIP39 표준 길이(12/15/18/21/24 단어)를 모두 지원한다.
 * - 단어마다 BIP39 영어 단어 목록과 대조해 틀린 위치를 바로 표시하고,
 *   입력 중인 칸에는 자동 완성 후보를 보여준다.
 * - 단어 목록에 없는 단어와 체크섬 실패를 구분해서 안내한다.
 * - 클립보드에서 붙여넣은 뒤에는 클립보드를 비운다.
 */

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import styled from 'styled-components/native';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Keyboard,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AuthNavigator';
import { useTheme } from '@/hooks/useTheme';
import { walletService } from '@/services/walletService';
import {
  findInvalidMnemonicWords,
  isMnemonicWordPrefix,
  isSupportedWordCount,
  MNEMONIC_WORD_COUNTS,
  type MnemonicWordCount,
  normalizeMnemonicWord,
  smallestWordCountFor,
  splitMnemonicInput,
  suggestMnemonicWords,
} from '@/services/mnemonicWords';
import { onboardingVault } from '@/services/onboardingVault';
import { ScreenHeader } from '@/components/common/ScreenHeader';
import { showToast } from '@/store/toastStore';
import { errorFeedback } from '@/utils/haptics';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ImportWallet');

type NavigationProp = NativeStackNavigationProp<
  AuthStackParamList,
  'ImportWallet'
>;

type ImportErrorKind = 'unknown-word' | 'checksum' | 'failed';

interface ImportError {
  kind: ImportErrorKind;
  message: string;
}

const MAX_WORD_COUNT = MNEMONIC_WORD_COUNTS[MNEMONIC_WORD_COUNTS.length - 1];
const SUPPORTED_COUNTS_TEXT = MNEMONIC_WORD_COUNTS.join(', ');

function resizeWords(words: readonly string[], count: number): string[] {
  return Array.from({ length: count }, (_, index) => words[index] ?? '');
}

function formatWordPositions(indices: readonly number[]): string {
  return indices.map(index => `${index + 1}번째`).join(', ');
}

export function describeUnknownWords(indices: readonly number[]): string {
  return `${formatWordPositions(
    indices,
  )} 단어가 BIP39 단어 목록에 없습니다. 철자를 확인해주세요.`;
}

export const CHECKSUM_ERROR_MESSAGE =
  '모든 단어가 단어 목록에 있지만 복구 구문 검증(체크섬)에 실패했습니다. 단어 순서가 맞는지, 빠지거나 바뀐 단어가 없는지 확인해주세요.';

function ImportWalletScreen(): React.JSX.Element {
  const navigation = useNavigation<NavigationProp>();
  const { theme, isDarkMode } = useTheme();
  const [wordCount, setWordCount] = useState<MnemonicWordCount>(12);
  const [words, setWords] = useState<string[]>(() => Array(12).fill(''));
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [importError, setImportError] = useState<ImportError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const wordInputStyle = useMemo(
    () =>
      StyleSheet.create({
        input: {
          flex: 1,
          minHeight: theme.touchTarget,
          color: theme.colors.textPrimary,
          fontSize: theme.typography.body.fontSize,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: 0,
        },
      }),
    [theme],
  );

  /** 칸이 포커스된 상태에서 단어 목록의 접두어라면 아직 입력 중인 것으로 본다. */
  const invalidIndices = useMemo(
    () =>
      findInvalidMnemonicWords(words).filter(
        index => index !== focusedIndex || !isMnemonicWordPrefix(words[index]),
      ),
    [words, focusedIndex],
  );

  const suggestions = useMemo(() => {
    if (focusedIndex === null) return [];
    const current = normalizeMnemonicWord(words[focusedIndex] ?? '');
    if (!current) return [];
    const candidates = suggestMnemonicWords(current, 4);
    // 이미 완성된 유일한 단어라면 후보를 보여줄 필요가 없다.
    if (candidates.length === 1 && candidates[0] === current) return [];
    return candidates;
  }, [focusedIndex, words]);

  const focusField = useCallback((index: number) => {
    inputRefs.current[index]?.focus();
  }, []);

  /** startIndex부터 여러 단어를 채운다. 지원 길이를 넘으면 단어 수를 늘린다. */
  const applyWords = useCallback(
    (startIndex: number, incoming: string[]) => {
      const needed = startIndex + incoming.length;
      let targetCount: MnemonicWordCount = wordCount;
      if (startIndex === 0 && isSupportedWordCount(incoming.length)) {
        targetCount = incoming.length;
      } else if (needed > wordCount) {
        targetCount = smallestWordCountFor(needed) ?? MAX_WORD_COUNT;
      }

      const base =
        startIndex === 0 && isSupportedWordCount(incoming.length)
          ? Array(targetCount).fill('')
          : resizeWords(words, targetCount);
      incoming.forEach((word, offset) => {
        if (startIndex + offset < targetCount) {
          base[startIndex + offset] = word;
        }
      });

      setWordCount(targetCount);
      setWords(base);
      setImportError(null);

      if (needed > MAX_WORD_COUNT) {
        showToast(
          `복구 구문은 최대 ${MAX_WORD_COUNT}개 단어입니다. 넘는 단어는 입력하지 않았습니다.`,
          'warning',
        );
      } else if (targetCount !== wordCount) {
        showToast(`${targetCount}단어 복구 구문으로 전환했습니다.`, 'info');
      }

      const nextEmpty = base.findIndex(word => word.length === 0);
      if (nextEmpty >= 0) focusField(nextEmpty);
      else Keyboard.dismiss();
    },
    [focusField, wordCount, words],
  );

  const handleWordCountChange = useCallback(
    (count: MnemonicWordCount) => {
      if (count === wordCount) return;
      const apply = () => {
        setWordCount(count);
        setWords(previous => resizeWords(previous, count));
        setImportError(null);
      };
      const wouldLose = words.slice(count).some(word => word.length > 0);
      if (!wouldLose) {
        apply();
        return;
      }
      Alert.alert(
        '단어 수 변경',
        `${count + 1}~${wordCount}번째에 입력한 단어가 삭제됩니다. 계속할까요?`,
        [
          { text: '취소', style: 'cancel' },
          { text: '변경', style: 'destructive', onPress: apply },
        ],
      );
    },
    [wordCount, words],
  );

  const handleWordChange = useCallback(
    (index: number, text: string) => {
      const incoming = splitMnemonicInput(text);

      // 공백, 쉼표, 줄바꿈으로 구분된 여러 단어 붙여넣기
      if (incoming.length > 1) {
        applyWords(index, incoming);
        return;
      }

      const value = normalizeMnemonicWord(text);
      setWords(previous => {
        const next = [...previous];
        next[index] = value;
        return next;
      });
      setImportError(null);

      // 단어 뒤에 공백을 입력하면 다음 칸으로 이동
      if (/\s$/.test(text) && value && index < wordCount - 1) {
        focusField(index + 1);
      }
    },
    [applyWords, focusField, wordCount],
  );

  const handleSuggestion = useCallback(
    (index: number, word: string) => {
      setWords(previous => {
        const next = [...previous];
        next[index] = word;
        return next;
      });
      setImportError(null);
      if (index < wordCount - 1) focusField(index + 1);
      else Keyboard.dismiss();
    },
    [focusField, wordCount],
  );

  // 전체 붙여넣기
  const handlePasteAll = useCallback(async () => {
    let text = '';
    try {
      text = await Clipboard.getString();
    } catch {
      showToast('클립보드에서 붙여넣기에 실패했습니다.', 'error');
      return;
    }
    // 복구 구문이 클립보드에 남아 다른 앱에 노출되지 않도록 바로 비운다.
    Clipboard.setString('');
    const incoming = splitMnemonicInput(text);
    if (incoming.length === 0) {
      showToast('클립보드가 비어 있습니다.', 'info');
      return;
    }
    if (incoming.length > MAX_WORD_COUNT) {
      showToast(
        `붙여넣은 단어가 ${incoming.length}개입니다. 복구 구문은 ${SUPPORTED_COUNTS_TEXT}개 단어여야 합니다.`,
        'error',
      );
      return;
    }
    if (!isSupportedWordCount(incoming.length)) {
      const targetCount = smallestWordCountFor(incoming.length) ?? 12;
      setWordCount(targetCount);
      setWords(resizeWords(incoming, targetCount));
      setImportError(null);
      showToast(
        `붙여넣은 단어가 ${incoming.length}개입니다. 복구 구문은 ${SUPPORTED_COUNTS_TEXT}개 단어여야 하니 빠진 단어를 확인해주세요.`,
        'warning',
      );
      return;
    }
    applyWords(0, incoming);
  }, [applyWords]);

  // 전체 지우기
  const handleClearAll = useCallback(() => {
    setWords(Array(wordCount).fill(''));
    setImportError(null);
    focusField(0);
  }, [focusField, wordCount]);

  // 지갑 가져오기
  const handleImport = useCallback(async () => {
    Keyboard.dismiss();
    setImportError(null);

    const normalized = words.map(normalizeMnemonicWord);
    const unknown = findInvalidMnemonicWords(normalized);
    if (unknown.length > 0) {
      errorFeedback();
      setImportError({
        kind: 'unknown-word',
        message: describeUnknownWords(unknown),
      });
      return;
    }

    const mnemonic = normalized.join(' ');
    if (!walletService.validateMnemonic(mnemonic)) {
      errorFeedback();
      setImportError({ kind: 'checksum', message: CHECKSUM_ERROR_MESSAGE });
      return;
    }

    setIsLoading(true);
    try {
      // 키 파생은 동기 작업이므로 로딩 표시가 먼저 그려지도록 한 틱 양보한다.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      const account = walletService.deriveAccount(mnemonic, 0);
      onboardingVault.start(mnemonic, account.address, 'import');
      setWords(Array(wordCount).fill(''));
      navigation.navigate('SetPin');
    } catch (error) {
      logger.error('Failed to import wallet:', error);
      setImportError({
        kind: 'failed',
        message: '지갑을 가져오지 못했습니다. 다시 시도해주세요.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [words, wordCount, navigation]);

  // 입력 완료 여부
  const filledCount = words.filter(w => w.length > 0).length;
  const isComplete = filledCount === wordCount;
  const canImport = isComplete && !isLoading;

  const renderSuggestions = (index: number) => (
    <SuggestionBar
      key="suggestions"
      testID={`import-suggestions-${index}`}
      accessibilityLabel={`${index + 1}번째 단어 추천`}
    >
      {suggestions.map(suggestion => (
        <SuggestionChip
          key={suggestion}
          testID={`import-suggestion-${suggestion}`}
          onPress={() => handleSuggestion(index, suggestion)}
          accessibilityRole="button"
          accessibilityLabel={`${suggestion} 입력`}
        >
          <SuggestionText>{suggestion}</SuggestionText>
        </SuggestionChip>
      ))}
    </SuggestionBar>
  );

  const renderWordCells = () => {
    const cells: React.ReactNode[] = [];
    words.forEach((word, index) => {
      const invalid = invalidIndices.includes(index);
      cells.push(
        <WordInputContainer
          key={`word-${index}`}
          $invalid={invalid}
          $focused={focusedIndex === index}
        >
          <WordNumber $invalid={invalid}>{index + 1}</WordNumber>
          <TextInput
            testID={`import-word-${index}`}
            ref={(ref: TextInput | null) => {
              inputRefs.current[index] = ref;
            }}
            value={word}
            onChangeText={text => handleWordChange(index, text)}
            onFocus={() => setFocusedIndex(index)}
            onBlur={() =>
              setFocusedIndex(current => (current === index ? null : current))
            }
            placeholder={`${index + 1}번째`}
            placeholderTextColor={theme.colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            importantForAutofill="no"
            spellCheck={false}
            returnKeyType={index < wordCount - 1 ? 'next' : 'done'}
            submitBehavior={index < wordCount - 1 ? 'submit' : 'blurAndSubmit'}
            onSubmitEditing={() => {
              if (index < wordCount - 1) focusField(index + 1);
              else Keyboard.dismiss();
            }}
            accessibilityLabel={`${index + 1}번째 단어${
              invalid ? ', 단어 목록에 없는 단어' : ''
            }`}
            style={wordInputStyle.input}
          />
        </WordInputContainer>,
      );
      const isRowEnd = index % 2 === 1 || index === words.length - 1;
      if (
        isRowEnd &&
        focusedIndex !== null &&
        Math.floor(focusedIndex / 2) === Math.floor(index / 2) &&
        suggestions.length > 0
      ) {
        cells.push(renderSuggestions(focusedIndex));
      }
    });
    return cells;
  };

  return (
    <Container>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        onBack={() => navigation.goBack()}
        backTestID="import-back"
      />
      <ScrollView
        testID="import-wallet-scroll"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : undefined}
      >
        <Content>
          <Title accessibilityRole="header">지갑 가져오기</Title>
          <Description>
            기존 지갑의 복구 구문을 입력하여 지갑을 복구합니다.
          </Description>

          {/* 단어 수 선택 */}
          <SectionLabel nativeID="import-word-count-label">
            단어 수
          </SectionLabel>
          <TabContainer accessibilityRole="radiogroup">
            {MNEMONIC_WORD_COUNTS.map(count => (
              <Tab
                key={count}
                testID={`import-word-count-${count}`}
                $active={wordCount === count}
                onPress={() => handleWordCountChange(count)}
                accessibilityRole="radio"
                accessibilityState={{ selected: wordCount === count }}
                accessibilityLabel={`${count} 단어`}
              >
                <TabText
                  $active={wordCount === count}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {`${count} 단어`}
                </TabText>
              </Tab>
            ))}
          </TabContainer>

          {/* 액션 버튼 */}
          <ActionRow>
            <ActionButton
              testID="import-paste-all"
              onPress={handlePasteAll}
              accessibilityRole="button"
              accessibilityLabel="클립보드의 복구 구문 전체 붙여넣기"
            >
              <ActionButtonText>📋 전체 붙여넣기</ActionButtonText>
            </ActionButton>
            <ActionButton
              testID="import-clear-all"
              onPress={handleClearAll}
              accessibilityRole="button"
              accessibilityLabel="입력한 단어 모두 지우기"
            >
              <ActionButtonText>✕ 전체 지우기</ActionButtonText>
            </ActionButton>
          </ActionRow>

          {/* 단어 입력 그리드 */}
          <WordsGrid>{renderWordCells()}</WordsGrid>

          {invalidIndices.length > 0 ? (
            <InlineError
              testID="import-invalid-words"
              accessibilityRole="alert"
            >
              {describeUnknownWords(invalidIndices)}
            </InlineError>
          ) : null}

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

          {importError ? (
            <ErrorBox
              testID={`import-error-${importError.kind}`}
              accessibilityRole="alert"
            >
              <ErrorTitle>
                {importError.kind === 'checksum'
                  ? '유효하지 않은 복구 구문'
                  : importError.kind === 'unknown-word'
                  ? '단어를 확인해주세요'
                  : '가져오기 실패'}
              </ErrorTitle>
              <ErrorMessage>{importError.message}</ErrorMessage>
            </ErrorBox>
          ) : null}

          {/* 보안 안내 */}
          <InfoBox>
            <InfoIcon importantForAccessibility="no">🔒</InfoIcon>
            <InfoText>
              복구 구문은 안전하게 암호화되어 기기에만 저장됩니다.
            </InfoText>
          </InfoBox>

          {/* 가져오기 버튼 */}
          <ImportButton
            testID="import-wallet-confirm"
            onPress={handleImport}
            disabled={!canImport}
            // 가져오는 중에는 누를 수 없지만 활성 배경을 유지해 흰 스피너가 보이게 한다.
            $enabled={canImport || isLoading}
            accessibilityRole="button"
            accessibilityLabel="지갑 가져오기"
            accessibilityState={{ disabled: !canImport, busy: isLoading }}
          >
            {isLoading ? (
              <ActivityIndicator
                color={theme.colors.onPrimary}
                testID="import-wallet-confirm-spinner"
              />
            ) : (
              <ImportButtonText $enabled={canImport}>
                지갑 가져오기
              </ImportButtonText>
            )}
          </ImportButton>
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
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.lg}px ${({ theme }) => theme.spacing.lg}px;
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

const SectionLabel = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
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
  min-height: ${({ theme }) => theme.touchTarget}px;
  padding: 0 2px;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  border-width: 1px;
  border-color: ${({ theme, $active }) =>
    $active ? theme.colors.primary : 'transparent'};
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.primarySubtle : 'transparent'};
  align-items: center;
  justify-content: center;
`;

const TabText = styled.Text<{ $active: boolean }>`
  color: ${({ theme, $active }) =>
    $active ? theme.colors.textPrimary : theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
`;

const ActionRow = styled.View`
  flex-direction: row;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.sm}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const ActionButton = styled.TouchableOpacity`
  min-height: ${({ theme }) => theme.touchTarget}px;
  justify-content: center;
  padding: 0 ${({ theme }) => theme.spacing.sm}px;
`;

const ActionButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: 600;
`;

const WordsGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const WordInputContainer = styled.View<{
  $invalid: boolean;
  $focused: boolean;
}>`
  width: 48%;
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  border-width: ${({ $invalid, $focused }) => ($invalid || $focused ? 2 : 1)}px;
  border-color: ${({ theme, $invalid, $focused }) =>
    $invalid
      ? theme.colors.error
      : $focused
      ? theme.colors.primary
      : theme.colors.border};
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  padding-left: ${({ theme }) => theme.spacing.sm}px;
`;

const WordNumber = styled.Text<{ $invalid: boolean }>`
  color: ${({ theme, $invalid }) =>
    $invalid ? theme.colors.error : theme.colors.textTertiary};
  font-size: ${({ theme }) => theme.typography.caption.fontSize}px;
  width: 24px;
`;

const SuggestionBar = styled.View`
  width: 100%;
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.xs}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const SuggestionChip = styled.TouchableOpacity`
  min-height: ${({ theme }) => theme.touchTarget}px;
  justify-content: center;
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
  border: 1px solid ${({ theme }) => theme.colors.primary};
  background-color: ${({ theme }) => theme.colors.primarySubtle};
`;

const SuggestionText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: 600;
`;

const InlineError = styled.Text`
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
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

const ErrorBox = styled.View`
  background-color: ${({ theme }) => theme.colors.errorSubtle};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const ErrorTitle = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  font-weight: 700;
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const ErrorMessage = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
`;

const InfoBox = styled.View`
  flex-direction: row;
  background-color: ${({ theme }) => theme.colors.primarySubtle};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const InfoIcon = styled.Text`
  font-size: 20px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const InfoText = styled.Text`
  flex: 1;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.bodySmall.fontSize}px;
  line-height: 20px;
`;

const ImportButton = styled.TouchableOpacity<{ $enabled: boolean }>`
  background-color: ${({ theme, $enabled }) =>
    $enabled ? theme.colors.primary : theme.colors.disabledBackground};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  min-height: ${({ theme }) => theme.touchTarget + 8}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  align-items: center;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.xl}px;
`;

const ImportButtonText = styled.Text<{ $enabled: boolean }>`
  color: ${({ theme, $enabled }) =>
    $enabled ? theme.colors.onPrimary : theme.colors.disabledText};
  font-size: ${({ theme }) => theme.typography.button.fontSize}px;
  font-weight: ${({ theme }) => theme.typography.button.fontWeight};
`;

export default ImportWalletScreen;
