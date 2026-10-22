import React from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { darkTheme } from '../../src/styles/theme';
import PinConfirmModal from '../../src/components/common/PinConfirmModal';
import { signerVault } from '../../src/services/signerVault';
import { walletService } from '../../src/services/walletService';
import { PinLockedError } from '../../src/services/pinAttemptService';

jest.mock('../../src/services/walletService', () => ({
  walletService: {
    retrieveMnemonicWithPin: jest.fn(),
    validateMnemonic: jest.fn(() => true),
  },
}));
const mnemonic =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const retrieve = walletService.retrieveMnemonicWithPin as jest.Mock;
const props = { visible: true, onConfirm: jest.fn(), onCancel: jest.fn() };
const element = (visible = true) => (
  <ThemeProvider theme={darkTheme}>
    <PinConfirmModal {...props} visible={visible} />
  </ThemeProvider>
);
beforeEach(() => {
  jest.clearAllMocks();
  signerVault.lock();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());

it.each(['cancel', 'unmount', 'hidden', 'background'])(
  'discards pending authentication after %s',
  async action => {
    let resolve!: (value: string) => void;
    retrieve.mockReturnValue(
      new Promise(r => {
        resolve = r;
      }),
    );
    let onState: (state: AppStateStatus) => void = () => {};
    const listener = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, cb) => {
        onState = cb;
        return { remove: jest.fn() };
      });
    const view = render(element());
    for (const digit of '123456')
      fireEvent.press(view.getByTestId(`pin-key-${digit}`));
    expect(retrieve).toHaveBeenCalledTimes(1);
    if (action === 'cancel')
      fireEvent.press(view.getByTestId('pin-confirm-cancel'));
    if (action === 'unmount') view.unmount();
    if (action === 'hidden') view.rerender(element(false));
    if (action === 'background') act(() => onState('background'));
    await act(async () => {
      resolve(mnemonic);
    });
    expect(signerVault.isUnlocked()).toBe(false);
    expect(props.onConfirm).not.toHaveBeenCalled();
    view.unmount();
    listener.mockRestore();
  },
);

it('unlocks and confirms once for successful PIN verification', async () => {
  retrieve.mockResolvedValue(mnemonic);
  const view = render(element());
  for (const digit of '123456')
    fireEvent.press(view.getByTestId(`pin-key-${digit}`));
  await act(async () => {});
  expect(retrieve).toHaveBeenCalledWith('123456');
  expect(signerVault.isUnlocked()).toBe(true);
  expect(props.onConfirm).toHaveBeenCalledTimes(1);
});

it('shows the shared persistent lock error without confirming', async () => {
  retrieve.mockRejectedValue(new PinLockedError(Date.now() + 30_000));
  const view = render(element());
  for (const digit of '123456')
    fireEvent.press(view.getByTestId(`pin-key-${digit}`));
  await act(async () => {});
  expect(view.getByTestId('pin-confirm-error').props.children).toContain(
    'PIN 입력이 제한',
  );
  expect(props.onConfirm).not.toHaveBeenCalled();
  expect(signerVault.isUnlocked()).toBe(false);
});
