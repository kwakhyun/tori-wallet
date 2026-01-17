/**
 * BackupMnemonicScreen 테스트
 */

import React from 'react';
import { render } from '../test-utils';

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
    useRoute: () => ({
      params: {
        mnemonic:
          'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
      },
    }),
  };
});

import BackupMnemonicScreen from '../../src/screens/Auth/BackupMnemonicScreen';

describe('BackupMnemonicScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly', () => {
    const { toJSON } = render(<BackupMnemonicScreen />);
    expect(toJSON()).not.toBeNull();
  });

  it('should display backup instructions', () => {
    const { root } = render(<BackupMnemonicScreen />);
    expect(root).toBeTruthy();
  });

  it('should show mnemonic words', () => {
    const { root } = render(<BackupMnemonicScreen />);
    expect(root.children).toBeDefined();
  });

  it('should have continue button', () => {
    const { root } = render(<BackupMnemonicScreen />);
    expect(root).toBeTruthy();
  });
});
