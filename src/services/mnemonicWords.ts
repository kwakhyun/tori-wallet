/**
 * BIP39 영어 단어 목록 기반 복구 구문 입력 도우미
 *
 * 화면에서 단어별 오류 표시와 자동 완성을 하기 위한 순수 함수만 둔다.
 * 최종 유효성(체크섬 포함)은 walletService.validateMnemonic이 판단한다.
 */

import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english';

/** BIP39가 정의한 복구 구문 길이 (128~256비트 엔트로피) */
export const MNEMONIC_WORD_COUNTS = [12, 15, 18, 21, 24] as const;
export type MnemonicWordCount = (typeof MNEMONIC_WORD_COUNTS)[number];

const WORD_SET = new Set(englishWordlist);

export function isSupportedWordCount(
  count: number,
): count is MnemonicWordCount {
  return (MNEMONIC_WORD_COUNTS as readonly number[]).includes(count);
}

/** count개 단어를 담을 수 있는 가장 작은 지원 길이. 24개를 넘으면 null */
export function smallestWordCountFor(count: number): MnemonicWordCount | null {
  return MNEMONIC_WORD_COUNTS.find(supported => supported >= count) ?? null;
}

export function normalizeMnemonicWord(word: string): string {
  return word.trim().toLowerCase();
}

/** 공백, 쉼표, 줄바꿈 등으로 구분된 입력을 단어 배열로 나눈다. */
export function splitMnemonicInput(text: string): string[] {
  return text
    .trim()
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(word => word.length > 0);
}

export function isMnemonicWord(word: string): boolean {
  return WORD_SET.has(normalizeMnemonicWord(word));
}

/** 접두어로 시작하는 단어가 하나라도 있는지 (입력 중인 단어 판단용) */
export function isMnemonicWordPrefix(prefix: string): boolean {
  return suggestMnemonicWords(prefix, 1).length > 0;
}

/** 접두어로 시작하는 단어를 사전순으로 최대 limit개 반환한다. */
export function suggestMnemonicWords(prefix: string, limit = 4): string[] {
  const normalized = normalizeMnemonicWord(prefix);
  if (!normalized) return [];
  // 단어 목록은 정렬되어 있으므로 이진 탐색으로 시작 위치를 찾는다.
  let low = 0;
  let high = englishWordlist.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (englishWordlist[mid] < normalized) low = mid + 1;
    else high = mid;
  }
  const result: string[] = [];
  for (
    let index = low;
    index < englishWordlist.length && result.length < limit;
    index += 1
  ) {
    const word = englishWordlist[index];
    if (!word.startsWith(normalized)) break;
    result.push(word);
  }
  return result;
}

/** 비어 있지 않으면서 단어 목록에 없는 단어의 위치(0부터) */
export function findInvalidMnemonicWords(words: readonly string[]): number[] {
  return words.reduce<number[]>((invalid, word, index) => {
    if (normalizeMnemonicWord(word) && !isMnemonicWord(word)) {
      invalid.push(index);
    }
    return invalid;
  }, []);
}
