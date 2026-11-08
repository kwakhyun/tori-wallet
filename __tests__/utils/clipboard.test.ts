import { Clipboard } from 'react-native';
import {
  clearClipboard,
  copyToClipboard,
  readClipboard,
} from '../../src/utils/clipboard';

describe('clipboard utils', () => {
  afterEach(() => jest.restoreAllMocks());

  it('copies and clears through the RN clipboard', () => {
    const setString = jest
      .spyOn(Clipboard, 'setString')
      .mockImplementation(() => undefined);
    copyToClipboard('0xabc');
    clearClipboard();
    expect(setString).toHaveBeenNthCalledWith(1, '0xabc');
    expect(setString).toHaveBeenNthCalledWith(2, '');
  });

  it('reads an empty string when the clipboard has nothing', async () => {
    jest
      .spyOn(Clipboard, 'getString')
      .mockResolvedValue(undefined as unknown as string);
    await expect(readClipboard()).resolves.toBe('');
  });

  it('passes read failures to the caller', async () => {
    jest.spyOn(Clipboard, 'getString').mockRejectedValue(new Error('denied'));
    await expect(readClipboard()).rejects.toThrow('denied');
  });
});
