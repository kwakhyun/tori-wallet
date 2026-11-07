import {
  findInvalidMnemonicWords,
  isMnemonicWord,
  isMnemonicWordPrefix,
  isSupportedWordCount,
  MNEMONIC_WORD_COUNTS,
  smallestWordCountFor,
  splitMnemonicInput,
  suggestMnemonicWords,
} from '../../src/services/mnemonicWords';

describe('mnemonicWords', () => {
  it('supports every BIP39 phrase length', () => {
    expect(MNEMONIC_WORD_COUNTS).toEqual([12, 15, 18, 21, 24]);
    expect([12, 15, 18, 21, 24].every(isSupportedWordCount)).toBe(true);
    expect([0, 11, 13, 25].some(isSupportedWordCount)).toBe(false);
    expect(smallestWordCountFor(13)).toBe(15);
    expect(smallestWordCountFor(24)).toBe(24);
    expect(smallestWordCountFor(25)).toBeNull();
  });

  it('splits pasted phrases on whitespace, commas and new lines', () => {
    expect(splitMnemonicInput('  Abandon,ability\n able\tabout  ')).toEqual([
      'abandon',
      'ability',
      'able',
      'about',
    ]);
    expect(splitMnemonicInput('   ')).toEqual([]);
  });

  it('checks words and prefixes against the English wordlist', () => {
    expect(isMnemonicWord('abandon')).toBe(true);
    expect(isMnemonicWord(' Zoo ')).toBe(true);
    expect(isMnemonicWord('abandonx')).toBe(false);
    expect(isMnemonicWordPrefix('aba')).toBe(true);
    expect(isMnemonicWordPrefix('xq')).toBe(false);
  });

  it('suggests words in order and respects the limit', () => {
    expect(suggestMnemonicWords('act')).toEqual([
      'act',
      'action',
      'actor',
      'actress',
    ]);
    expect(suggestMnemonicWords('zo', 10)).toEqual(['zone', 'zoo']);
    expect(suggestMnemonicWords('')).toEqual([]);
    expect(suggestMnemonicWords('qqq')).toEqual([]);
  });

  it('reports the positions of unknown words, ignoring empty fields', () => {
    expect(
      findInvalidMnemonicWords(['abandon', '', 'abandonx', 'about', 'xyz']),
    ).toEqual([2, 4]);
  });
});
