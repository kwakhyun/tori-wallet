/**
 * 복구 구문 보기
 *
 * - 경고 헤더 → PIN 확인 → 단어 목록 (복사 버튼은 의도적으로 두지 않는다)
 * - 지갑이 잠기거나 앱이 백그라운드/비활성으로 바뀌면 구문을 지우고 닫는다.
 *   (자동 잠금 후에도 화면은 오버레이 아래 마운트되어 있으므로 직접 지워야 한다)
 */

import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components/native';
import { Button } from '@/components/common/Button';
import { PinPrompt } from './PinPrompt';
import { InfoBox, InfoText, InfoTitle, SheetModal } from './SettingsUI';
import { useSecretAutoClear } from '../hooks/useSecretAutoClear';

export function RecoveryPhraseWarning(): React.JSX.Element {
  return (
    <InfoBox $tone="error" testID="recovery-phrase-warning">
      <InfoTitle accessibilityRole="header">
        ⚠️ 복구 구문은 지갑의 마스터 키입니다
      </InfoTitle>
      <InfoText>
        {
          '• 이 구문을 아는 사람은 모든 자산을 가져갈 수 있습니다.\n• Tori 팀을 포함해 누구도 복구 구문을 묻지 않습니다.\n• 스크린샷, 메신저, 클라우드에 저장하지 말고 종이에 적어 보관하세요.'
        }
      </InfoText>
    </InfoBox>
  );
}

interface RecoveryPhraseContentProps {
  /** 단어 표시 후 확인 버튼 */
  onDone: () => void;
  doneLabel?: string;
  /** 비밀값을 지워야 하는 시점(잠금/백그라운드)에 호출 */
  onAutoClear: () => void;
  testIDPrefix?: string;
}

/** 모달 없이 다른 흐름(지갑 삭제 전 백업 확인)에 끼워 넣을 수 있는 본문 */
export function RecoveryPhraseContent({
  onDone,
  doneLabel = '확인했습니다',
  onAutoClear,
  testIDPrefix = 'recovery-phrase',
}: RecoveryPhraseContentProps): React.JSX.Element {
  const [mnemonic, setMnemonic] = useState<string | null>(null);

  const clear = useCallback(() => {
    setMnemonic(null);
    onAutoClear();
  }, [onAutoClear]);
  useSecretAutoClear(true, clear);

  // 언마운트 시 상태에 남은 구문 참조를 끊는다.
  useEffect(() => () => setMnemonic(null), []);

  const handleVerified = useCallback((value: string) => setMnemonic(value), []);

  const handleDone = useCallback(() => {
    setMnemonic(null);
    onDone();
  }, [onDone]);

  return (
    <>
      <RecoveryPhraseWarning />
      {mnemonic ? (
        <>
          <WordGrid testID={`${testIDPrefix}-words`}>
            {mnemonic.split(' ').map((word, index) => (
              <Word
                key={`${index}-${word}`}
                accessible
                accessibilityLabel={`${index + 1}번째 단어 ${word}`}
              >
                <WordIndex>{index + 1}</WordIndex>
                <WordText>{word}</WordText>
              </Word>
            ))}
          </WordGrid>
          <Button
            title={doneLabel}
            onPress={handleDone}
            fullWidth
            testID={`${testIDPrefix}-done`}
          />
        </>
      ) : (
        <PinPrompt
          description="복구 구문을 보려면 PIN을 입력하세요."
          onVerified={handleVerified}
          testIDPrefix={`${testIDPrefix}-pin`}
        />
      )}
    </>
  );
}

interface RecoveryPhraseModalProps {
  visible: boolean;
  onClose: () => void;
}

export function RecoveryPhraseModal({
  visible,
  onClose,
}: RecoveryPhraseModalProps): React.JSX.Element {
  return (
    <SheetModal
      visible={visible}
      title="복구 구문"
      onClose={onClose}
      testID="recovery-phrase-modal"
    >
      {/* 닫히면 본문을 언마운트해 구문 상태를 즉시 버린다 */}
      {visible ? (
        <RecoveryPhraseContent onDone={onClose} onAutoClear={onClose} />
      ) : null}
    </SheetModal>
  );
}

const WordGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const Word = styled.View`
  width: 48%;
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
  min-height: 44px;
`;

const WordIndex = styled.Text`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 13px;
  width: 26px;
`;

const WordText = styled.Text`
  color: ${({ theme }) => theme.colors.textPrimary};
  font-size: 16px;
  font-family: monospace;
`;
