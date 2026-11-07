/**
 * WalletConnect 딥링크 해석과 잠금 중 보관/해제 후 처리
 */

import { Linking } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import {
  getPendingDeepLinkCount,
  parseDeepLink,
  startDeepLinkCapture,
  useDeepLinks,
} from '../../src/hooks/useDeepLinks';

const SYM_KEY = 'c'.repeat(64);
const uri = (topic: string) =>
  `wc:${topic}@2?relay-protocol=irn&symKey=${SYM_KEY}`;
const flush = () => new Promise(resolve => setImmediate(resolve));

describe('parseDeepLink', () => {
  it('accepts wc: pairing URIs', () => {
    expect(parseDeepLink(uri('aa'))).toEqual({ kind: 'pair', uri: uri('aa') });
  });

  it('accepts toriwallet://wc?uri=<encoded>', () => {
    expect(
      parseDeepLink(`toriwallet://wc?uri=${encodeURIComponent(uri('bb'))}`),
    ).toEqual({ kind: 'pair', uri: uri('bb') });
  });

  it('accepts an unencoded uri parameter that contains its own query', () => {
    expect(parseDeepLink(`toriwallet://wc?uri=${uri('cc')}`)).toEqual({
      kind: 'pair',
      uri: uri('cc'),
    });
  });

  it('treats links without a pairing URI as a wake-up', () => {
    expect(parseDeepLink('toriwallet://wc')).toEqual({ kind: 'wake' });
    expect(parseDeepLink('wc:abcd@2?requestId=1&sessionTopic=xyz')).toEqual({
      kind: 'wake',
    });
    expect(parseDeepLink('wc:abcd@2')).toEqual({ kind: 'wake' });
  });

  it('explains v1 and malformed links', () => {
    const v1 = parseDeepLink('wc:abcd@1?bridge=https%3A%2F%2Fb.example&key=1');
    expect(v1).toMatchObject({ kind: 'invalid' });
    expect(v1 && 'reason' in v1 ? v1.reason : '').toContain('v1');
    expect(parseDeepLink('toriwallet://wc?uri=not-a-uri')).toMatchObject({
      kind: 'invalid',
    });
  });

  it('ignores links that are not WalletConnect links', () => {
    expect(parseDeepLink('https://example.com')).toBeNull();
    expect(parseDeepLink('toriwallet://send?to=0x1')).toBeNull();
    expect(parseDeepLink('')).toBeNull();
  });
});

describe('useDeepLinks', () => {
  startDeepLinkCapture();
  const urlListener = (Linking.addEventListener as jest.Mock).mock.calls.find(
    call => call[0] === 'url',
  )?.[1] as (event: { url: string }) => void;

  it('processes the cold-start URL once enabled', async () => {
    (Linking.getInitialURL as jest.Mock).mockResolvedValueOnce(
      `toriwallet://wc?uri=${encodeURIComponent(uri('d1'))}`,
    );
    const onLink = jest.fn();
    const hook = renderHook(
      ({ enabled }: { enabled: boolean }) => useDeepLinks(enabled, onLink),
      {
        initialProps: { enabled: false },
      },
    );
    await act(flush);
    expect(onLink).not.toHaveBeenCalled();

    hook.rerender({ enabled: true });
    await act(flush);
    expect(onLink).toHaveBeenCalledWith(
      { kind: 'pair', uri: uri('d1') },
      expect.any(String),
    );
    hook.unmount();
  });

  it('keeps links that arrive while disabled (locked) and delivers them after enabling', async () => {
    expect(urlListener).toBeDefined();
    const onLink = jest.fn();
    const hook = renderHook(
      ({ enabled }: { enabled: boolean }) => useDeepLinks(enabled, onLink),
      {
        initialProps: { enabled: false },
      },
    );
    act(() => urlListener({ url: uri('e1') }));
    act(() => urlListener({ url: 'https://not-ours.example' }));
    expect(onLink).not.toHaveBeenCalled();
    expect(getPendingDeepLinkCount()).toBe(1);

    hook.rerender({ enabled: true });
    expect(onLink).toHaveBeenCalledTimes(1);
    expect(onLink).toHaveBeenCalledWith(
      { kind: 'pair', uri: uri('e1') },
      uri('e1'),
    );
    expect(getPendingDeepLinkCount()).toBe(0);

    // 같은 페어링 URI는 다시 처리하지 않는다.
    act(() => urlListener({ url: uri('e1') }));
    expect(onLink).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
});
