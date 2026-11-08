/**
 * 지갑 가져오기 스크린 테스트
 *
 * walletService는 실제 BIP39 검증(체크섬 포함)과 키 파생을 사용한다.
 */

import React from 'react';
import { Alert, AlertButton, Clipboard, StyleSheet } from 'react-native';
import { lightTheme } from '../../src/styles/theme';
import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { render, fireEvent, act, waitFor } from '../test-utils';

// 네비게이션 모킹
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
    }),
  };
});

const mockStart = jest.fn();
jest.mock('../../src/services/onboardingVault', () => ({
  onboardingVault: {
    start: (...args: unknown[]) => mockStart(...args),
  },
}));

import ImportWalletScreen from '../../src/screens/Auth/ImportWalletScreen';

const mnemonicOf = (wordCount: number) =>
  entropyToMnemonic(
    new Uint8Array((wordCount / 3) * 4).fill(1),
    wordlist,
  ).split(' ');

type View = ReturnType<typeof render>;

const fieldCount = (view: View) =>
  view.queryAllByTestId(/^import-word-\d+$/).length;

const typeWords = (view: View, words: string[]) => {
  words.forEach((word, index) =>
    fireEvent.changeText(view.getByTestId(`import-word-${index}`), word),
  );
};

describe('ImportWalletScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should render correctly', () => {
    const { toJSON } = render(<ImportWalletScreen />);
    expect(toJSON()).not.toBeNull();
  });

  it('offers every BIP39 word count', () => {
    const { getByText } = render(<ImportWalletScreen />);
    for (const count of [12, 15, 18, 21, 24]) {
      expect(getByText(`${count} 단어`)).toBeTruthy();
    }
  });

  it('should have an accessible back button', () => {
    const { getByText, getByLabelText } = render(<ImportWalletScreen />);
    expect(getByLabelText('뒤로 가기')).toBeTruthy();
    fireEvent.press(getByText('←'));
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('should display title', () => {
    const { getAllByText } = render(<ImportWalletScreen />);
    expect(getAllByText('지갑 가져오기').length).toBeGreaterThan(0);
  });

  it('renders 12 word inputs with E2E ids by default', () => {
    const view = render(<ImportWalletScreen />);
    expect(fieldCount(view)).toBe(12);
    expect(view.getByTestId('import-wallet-scroll')).toBeTruthy();
    expect(view.getByTestId('import-wallet-confirm')).toBeTruthy();
  });

  describe('단어 수 변경', () => {
    it('keeps typed words when growing the phrase', () => {
      const view = render(<ImportWalletScreen />);
      fireEvent.changeText(view.getByTestId('import-word-0'), 'absurd');

      fireEvent.press(view.getByTestId('import-word-count-15'));

      expect(fieldCount(view)).toBe(15);
      expect(view.getByTestId('import-word-0').props.value).toBe('absurd');
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('asks before dropping words when shrinking the phrase', () => {
      const view = render(<ImportWalletScreen />);
      fireEvent.press(view.getByTestId('import-word-count-24'));
      fireEvent.changeText(view.getByTestId('import-word-0'), 'absurd');
      fireEvent.changeText(view.getByTestId('import-word-20'), 'amount');

      fireEvent.press(view.getByTestId('import-word-count-12'));

      expect(Alert.alert).toHaveBeenCalledWith(
        '단어 수 변경',
        expect.stringContaining('13~24번째'),
        expect.any(Array),
      );
      expect(fieldCount(view)).toBe(24);

      const buttons = (Alert.alert as jest.Mock).mock
        .calls[0][2] as AlertButton[];
      act(() => buttons.find(b => b.text === '변경')?.onPress?.());

      expect(fieldCount(view)).toBe(12);
      expect(view.getByTestId('import-word-0').props.value).toBe('absurd');
    });
  });

  describe('붙여넣기', () => {
    it.each([15, 18, 21])(
      'selects the %i-word count when a full phrase is pasted and clears the clipboard',
      async count => {
        const words = mnemonicOf(count);
        (Clipboard.getString as jest.Mock).mockResolvedValue(words.join(' '));
        const view = render(<ImportWalletScreen />);

        await act(async () => {
          fireEvent.press(view.getByTestId('import-paste-all'));
        });

        expect(Clipboard.setString).toHaveBeenCalledWith('');
        expect(fieldCount(view)).toBe(count);
        expect(view.getByTestId(`import-word-${count - 1}`).props.value).toBe(
          words[count - 1],
        );
      },
    );

    it('expands instead of truncating when many words are pasted into one field', () => {
      const words = mnemonicOf(18);
      const view = render(<ImportWalletScreen />);

      fireEvent.changeText(view.getByTestId('import-word-0'), words.join('\n'));

      expect(fieldCount(view)).toBe(18);
      expect(view.getByTestId('import-word-17').props.value).toBe(words[17]);
    });
  });

  describe('단어 검증', () => {
    it('highlights words that are not in the BIP39 wordlist by position', () => {
      const view = render(<ImportWalletScreen />);
      const input = view.getByTestId('import-word-2');
      fireEvent(input, 'focus');
      fireEvent.changeText(input, 'abandonx');
      fireEvent(input, 'blur');

      expect(view.getByTestId('import-invalid-words').props.children).toBe(
        '3번째 단어가 BIP39 단어 목록에 없습니다. 철자를 확인해주세요.',
      );
    });

    it('does not flag a partially typed word while the field is focused', () => {
      const view = render(<ImportWalletScreen />);
      const input = view.getByTestId('import-word-0');
      fireEvent(input, 'focus');
      fireEvent.changeText(input, 'aba');

      expect(view.queryByTestId('import-invalid-words')).toBeNull();
    });

    it('suggests matching words for the focused field', () => {
      const view = render(<ImportWalletScreen />);
      const input = view.getByTestId('import-word-0');
      fireEvent(input, 'focus');
      fireEvent.changeText(input, 'aba');

      fireEvent.press(view.getByTestId('import-suggestion-abandon'));

      expect(view.getByTestId('import-word-0').props.value).toBe('abandon');
    });

    it('hides suggestions once the word is complete and unique', () => {
      const view = render(<ImportWalletScreen />);
      const input = view.getByTestId('import-word-0');
      fireEvent(input, 'focus');
      fireEvent.changeText(input, 'abandon');

      expect(view.queryByTestId('import-suggestions-0')).toBeNull();
    });
  });

  describe('가져오기', () => {
    it('reports unknown words separately from checksum failures', async () => {
      const view = render(<ImportWalletScreen />);
      const words = mnemonicOf(12);
      words[4] = 'notaword';
      typeWords(view, words);

      await act(async () => {
        fireEvent.press(view.getByTestId('import-wallet-confirm'));
      });

      expect(view.getByTestId('import-error-unknown-word')).toBeTruthy();
      expect(view.queryByTestId('import-error-checksum')).toBeNull();
      expect(
        view.getAllByText(/5번째 단어가 BIP39 단어 목록에 없습니다/).length,
      ).toBeGreaterThan(0);
      expect(mockStart).not.toHaveBeenCalled();
    });

    it('explains a checksum failure when every word is valid', async () => {
      const view = render(<ImportWalletScreen />);
      typeWords(view, Array(12).fill('abandon'));

      await act(async () => {
        fireEvent.press(view.getByTestId('import-wallet-confirm'));
      });

      expect(view.getByTestId('import-error-checksum')).toBeTruthy();
      expect(view.getByText(/체크섬/)).toBeTruthy();
      expect(mockStart).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('keeps the primary background while importing so the spinner stays visible (light theme)', async () => {
      const view = render(<ImportWalletScreen />, { theme: 'light' });
      typeWords(view, mnemonicOf(12));

      fireEvent.press(view.getByTestId('import-wallet-confirm'));

      // 키 파생 전에 로딩 상태가 먼저 그려진다.
      const button = view.getByTestId('import-wallet-confirm');
      expect(view.getByTestId('import-wallet-confirm-spinner')).toBeTruthy();
      expect(button.props.accessibilityState).toEqual({
        disabled: true,
        busy: true,
      });
      const background = StyleSheet.flatten(button.props.style).backgroundColor;
      expect(background).toBe(lightTheme.colors.primary);
      expect(background).not.toBe(lightTheme.colors.disabledBackground);

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('SetPin'), {
        timeout: 1000,
      });
    });

    it.each([15, 18, 21])(
      'imports a valid %i-word phrase without a fake progress delay',
      async count => {
        const words = mnemonicOf(count);
        const view = render(<ImportWalletScreen />);
        fireEvent.press(view.getByTestId(`import-word-count-${count}`));
        typeWords(view, words);

        fireEvent.press(view.getByTestId('import-wallet-confirm'));

        await waitFor(
          () => expect(mockNavigate).toHaveBeenCalledWith('SetPin'),
          { timeout: 1000 },
        );
        expect(mockStart).toHaveBeenCalledWith(
          words.join(' '),
          expect.stringMatching(/^0x[0-9a-fA-F]{40}$/),
          'import',
        );
        // 가져온 뒤 화면에 단어를 남기지 않는다.
        expect(view.getByTestId('import-word-0').props.value).toBe('');
      },
    );
  });
});
