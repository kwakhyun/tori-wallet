/**
 * WalletConnect 딥링크 처리
 *
 * 지원 형식
 *  - wc:<topic>@2?relay-protocol=irn&symKey=...      (dApp이 직접 여는 연결 링크)
 *  - toriwallet://wc?uri=<인코딩된 wc URI>            (유니버설/커스텀 스킴 링크)
 *  - toriwallet://wc, wc:<topic>@2?requestId=...      (요청 확인용으로 앱만 여는 링크)
 *
 * 링크 수신은 앱 시작 시(startDeepLinkCapture) 시작해, 잠금 화면이거나 메인 스택이
 * 아직 없을 때 도착한 링크도 보관한다. 보관된 링크는 useDeepLinks가 활성화되면
 * (잠금 해제 후) 순서대로 처리된다. 페어링 자체는 자동으로 시작되지만 연결 승인은
 * 제안 모달에서 사용자가 직접 해야 한다.
 */

import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { parseWalletConnectUri } from '@/services/wcService';

export type DeepLinkAction =
  | { kind: 'pair'; uri: string }
  /** 처리할 URI 없이 앱만 연 링크 (서명 요청 확인 등) */
  | { kind: 'wake' }
  | { kind: 'invalid'; reason: string };

function extractUriParam(query: string): string | null {
  const match = /(?:^|&)uri=/.exec(query);
  if (!match) return null;
  let value = query.slice(match.index + match[0].length);
  if (!/^wc:/i.test(value)) {
    // 인코딩된 URI는 다음 바깥 파라미터('&') 전까지가 값이다.
    const end = value.indexOf('&');
    if (end >= 0) value = value.slice(0, end);
    try {
      value = decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return value;
}

function queryOf(uri: string): Map<string, string> {
  const params = new Map<string, string>();
  const index = uri.indexOf('?');
  if (index < 0) return params;
  for (const pair of uri.slice(index + 1).split('&')) {
    if (!pair) continue;
    const [key, ...rest] = pair.split('=');
    params.set(key, rest.join('='));
  }
  return params;
}

/**
 * 딥링크 URL을 해석한다. 토리월렛 WalletConnect 링크가 아니면 null을 반환한다
 * (다른 기능의 딥링크는 각자 처리한다).
 */
export function parseDeepLink(
  url: string | null | undefined,
): DeepLinkAction | null {
  const raw = (url || '').trim();
  if (!raw) return null;

  let candidate: string;
  if (/^wc:/i.test(raw)) {
    if (/^wc:\/\//i.test(raw)) {
      // wc://?uri=... 또는 wc:// (앱 열기)
      const inner = extractUriParam(raw.slice(raw.indexOf('?') + 1));
      if (!inner || raw.indexOf('?') < 0) return { kind: 'wake' };
      candidate = inner;
    } else {
      candidate = raw;
    }
  } else if (/^toriwallet:/i.test(raw)) {
    const match = /^toriwallet:\/\/wc\/?(?:\?(.*))?$/i.exec(raw);
    if (!match) return null;
    const inner = extractUriParam(match[1] || '');
    if (!inner) return { kind: 'wake' };
    candidate = inner;
  } else {
    return null;
  }

  const query = queryOf(candidate);
  if (
    /^wc:[^@?]+@2(?:\?|$)/i.test(candidate) &&
    (query.has('requestId') ||
      query.has('sessionTopic') ||
      !query.has('symKey'))
  ) {
    return { kind: 'wake' };
  }

  const parsed = parseWalletConnectUri(candidate);
  return parsed.ok
    ? { kind: 'pair', uri: parsed.uri }
    : { kind: 'invalid', reason: parsed.reason };
}

// ---------------------------------------------------------------------------
// 앱 수준 수신함 (메인 스택이 없거나 잠긴 동안 도착한 링크 보관)
// ---------------------------------------------------------------------------

type LinkHandler = (url: string) => void;

const MAX_PENDING_LINKS = 5;
let captureStarted = false;
let initialUrlRequested = false;
let activeHandler: LinkHandler | null = null;
const pendingLinks: string[] = [];
/**
 * 페어링 URI는 일회용이므로 같은 링크가 두 번 전달되어도 한 번만 처리한다.
 * 진행 중이거나 성공한 페어링만 기억한다. 실패하면 지워서, dApp이 같은 링크를 다시
 * 열 때(AppKit은 만료 전까지 같은 URI를 재사용한다) 다시 시도되게 한다.
 */
const handledPairUris = new Set<string>();

function deliver(url: string | null | undefined): void {
  if (!url || !parseDeepLink(url)) return;
  if (activeHandler) {
    activeHandler(url);
    return;
  }
  pendingLinks.push(url);
  if (pendingLinks.length > MAX_PENDING_LINKS) pendingLinks.shift();
}

/** 딥링크 수신 시작 (여러 번 호출해도 한 번만 등록한다). */
export function startDeepLinkCapture(): void {
  if (captureStarted) return;
  try {
    if (typeof Linking?.addEventListener !== 'function') return;
    Linking.addEventListener('url', event => deliver(event?.url));
    captureStarted = true;
  } catch {
    // 테스트 등 Linking이 없는 환경
  }
}

function requestInitialUrl(): void {
  if (initialUrlRequested) return;
  initialUrlRequested = true;
  try {
    Promise.resolve(Linking.getInitialURL())
      .then(deliver)
      .catch(() => undefined);
  } catch {
    // ignore
  }
}

/** 보관 중인 딥링크 수 (테스트/진단용) */
export function getPendingDeepLinkCount(): number {
  return pendingLinks.length;
}

/**
 * enabled인 동안 WalletConnect 딥링크를 onLink로 전달한다. 비활성(잠금, 메인 스택 없음)
 * 동안 도착한 링크는 보관했다가 활성화되면 전달한다. 같은 페어링 URI는 한 번만 전달한다.
 * onLink가 거부되는 promise를 돌려주면(페어링 실패) 그 URI는 다시 전달될 수 있다.
 */
export function useDeepLinks(
  enabled: boolean,
  onLink: (action: DeepLinkAction, url: string) => Promise<void> | void,
): void {
  const onLinkRef = useRef(onLink);
  onLinkRef.current = onLink;

  useEffect(() => {
    startDeepLinkCapture();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const handler: LinkHandler = url => {
      const action = parseDeepLink(url);
      if (!action) return;
      if (action.kind !== 'pair') {
        onLinkRef.current(action, url);
        return;
      }
      const pairUri = action.uri;
      if (handledPairUris.has(pairUri)) return;
      handledPairUris.add(pairUri);
      const release = () => {
        handledPairUris.delete(pairUri);
      };
      try {
        const outcome = onLinkRef.current(action, url);
        if (outcome && typeof outcome.then === 'function') {
          outcome.then(undefined, release);
        }
      } catch {
        release();
      }
    };
    activeHandler = handler;
    pendingLinks.splice(0).forEach(handler);
    requestInitialUrl();
    return () => {
      if (activeHandler === handler) activeHandler = null;
    };
  }, [enabled]);
}

export default useDeepLinks;
