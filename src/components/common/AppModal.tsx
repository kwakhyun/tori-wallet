/**
 * 잠금 인식 공용 모달 (React Native Modal 대체)
 *
 * 앱의 모든 모달은 RN Modal 대신 이 컴포넌트를 사용한다. 같은 props를 받고
 * onShow/onDismiss/onRequestClose 등은 그대로 전달한다.
 *
 * 1) 잠금: 지갑이 잠기면(hasWallet && isLocked) 네이티브 모달을 숨긴다. 열려 있던
 *    중에 잠기거나 잠긴 동안 열려고 하면 onLock을 한 번 호출하므로, 호출부는 PIN
 *    프롬프트를 취소하고 시트/선택기를 닫을 수 있다. onLock이 없으면 숨기기만 하고
 *    잠금 해제 후 다시 표시한다 (WalletConnect 요청 모달처럼 대기열을 유지할 때).
 *
 * 2) iOS 표시 조정: Fabric의 RCTModalHostViewComponentView는 가장 가까운 뷰 컨트롤러
 *    (화면 모달은 결국 루트 VC)에서 present하며, 성공 여부와 상관없이 _isPresented를
 *    먼저 YES로 바꾸고 다시 시도하지 않는다. 루트 VC가 다른 모달을 표시 중이거나 닫는
 *    애니메이션 중이면 UIKit이 present를 거부하므로 모달이 영영 나타나지 않는다.
 *    그래서 같은 VC에서 표시되는 형제 모달은 한 번에 하나만 띄운다. 표시 중이거나 닫히는
 *    중인 모달이 있으면 새 모달은 그 모달의 onDismiss(또는 onDismiss가 오지 않을 때의
 *    대체 타이머)까지 기다렸다가 새 key로 다시 마운트해 표시한다.
 *    다른 AppModal 안에 렌더링된 AppModal은 부모 모달의 VC가 present하므로 부모 범위에서
 *    따로 조정한다. 부모는 자식 모달이 모두 닫힌 뒤에 닫힌다 (UIKit은 다른 모달을 표시
 *    중인 VC를 닫으면 자식만 닫고 자신은 남긴다).
 *    Android의 Modal은 Dialog라서 겹쳐 표시되므로 조정하지 않는다.
 *
 * 3) iOS fullScreen 금지: fullScreen 표시는 표시가 끝나면 루트 VC의 뷰(앱 화면 전체)를
 *    창에서 떼어 냈다가 닫을 때 다시 붙인다. 그 사이 앱 창에 직접 올린 잠금 오버레이
 *    (FullWindowOverlay)의 위치가 흔들리지 않도록 같은 모양의 overFullScreen으로 표시한다.
 *
 * 규칙: RN Modal을 직접 쓰지 말고, 형제 루트 모달 두 개를 동시에 띄우지 않는다
 * (닫고 여는 순차 전환은 자동으로 이어진다).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Modal, Platform, type ModalProps } from 'react-native';
import { useWalletLocked } from '@/hooks/useWalletLocked';
import {
  createModalPresenceRegistry,
  MODAL_PRESENCE_FALLBACK_MS,
  rootModalPresence,
  type ModalPresenceRegistry,
  type PresenceToken,
} from './modalPresence';

export {
  isRootModalPresent,
  MODAL_PRESENCE_FALLBACK_MS,
  resetModalPresence,
} from './modalPresence';

interface ModalScope {
  presence: ModalPresenceRegistry;
  /** 이 범위에서 모달을 띄워도 되는지 (부모 모달이 표시를 마쳤고 닫히는 중이 아님) */
  open: boolean;
}

const ROOT_SCOPE: ModalScope = { presence: rootModalPresence, open: true };
const ModalScopeContext = createContext<ModalScope>(ROOT_SCOPE);

export interface AppModalProps extends ModalProps {
  /**
   * 모달이 열려 있는 동안 지갑이 잠기거나, 잠긴 동안 모달을 열려고 하면 한 번 호출된다.
   * PIN 프롬프트는 취소하고 시트/선택기는 닫는다. 생략하면 잠긴 동안 숨기기만 한다.
   */
  onLock?: () => void;
}

interface HeldPresence {
  token: PresenceToken;
  presence: ModalPresenceRegistry;
}

export function AppModal({
  visible = true,
  onLock,
  onShow,
  onDismiss,
  children,
  ...modalProps
}: AppModalProps): React.JSX.Element {
  const scope = useContext(ModalScopeContext);
  const locked = useWalletLocked();
  const requested = visible !== false;
  const wantVisible = requested && !locked && scope.open;
  const coordinate = Platform.OS === 'ios';

  const onLockRef = useRef(onLock);
  const onShowRef = useRef(onShow);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onLockRef.current = onLock;
    onShowRef.current = onShow;
    onDismissRef.current = onDismiss;
  }, [onLock, onShow, onDismiss]);

  // ── 잠금 알림: 열기 요청마다, 잠금마다 한 번 ───────────────────
  const lockNotified = useRef(false);
  useEffect(() => {
    if (!locked || !requested) {
      lockNotified.current = false;
      return;
    }
    if (lockNotified.current) return;
    lockNotified.current = true;
    onLockRef.current?.();
  }, [locked, requested]);

  // ── iOS 표시 조정 ─────────────────────────────────────────────
  const [presentation, setPresentation] = useState({ key: 0, shown: false });
  const [ackedKey, setAckedKey] = useState(-1);
  const [childPresence] = useState(createModalPresenceRegistry);
  const held = useRef<HeldPresence | null>(null);
  const scopeIdle = useSyncExternalStore(
    scope.presence.subscribe,
    scope.presence.isIdle,
  );
  const childrenIdle = useSyncExternalStore(
    childPresence.subscribe,
    childPresence.isIdle,
  );

  useLayoutEffect(() => {
    if (!coordinate) return;
    if (wantVisible && !presentation.shown) {
      // 이미 표시를 예약했거나 이 모달의 이전 표시가 아직 닫히는 중이다.
      const current = held.current;
      if (current && current.presence.isActive(current.token)) return;
      held.current = null;
      // 같은 VC의 다른 모달이 닫힐 때까지 기다린다.
      if (!scope.presence.isIdle()) return;
      held.current = {
        token: scope.presence.acquire(),
        presence: scope.presence,
      };
      // 새 key로 다시 마운트해 이전 네이티브 호스트의 _isPresented가 남지 않게 한다.
      setPresentation(previous => ({ key: previous.key + 1, shown: true }));
      return;
    }
    if (!wantVisible && presentation.shown && childrenIdle) {
      setPresentation(previous => ({ ...previous, shown: false }));
      const current = held.current;
      if (current) current.presence.releaseLater(current.token);
    }
  }, [
    coordinate,
    wantVisible,
    presentation.shown,
    scopeIdle,
    childrenIdle,
    scope.presence,
  ]);

  // onShow가 오지 않아도(거부된 present 등) 자식 모달이 영영 막히지 않게 한다.
  useEffect(() => {
    if (!coordinate || !presentation.shown) return;
    const key = presentation.key;
    const timer = setTimeout(
      () => setAckedKey(key),
      MODAL_PRESENCE_FALLBACK_MS,
    );
    return () => clearTimeout(timer);
  }, [coordinate, presentation.key, presentation.shown]);

  // 표시 중에 언마운트되면 네이티브 호스트가 닫히는 애니메이션을 기다린다.
  useEffect(
    () => () => {
      const current = held.current;
      held.current = null;
      if (current) current.presence.releaseLater(current.token);
    },
    [],
  );

  const presentedKey = presentation.key;
  const handleShow = useCallback<NonNullable<ModalProps['onShow']>>(
    event => {
      setAckedKey(presentedKey);
      onShowRef.current?.(event);
    },
    [presentedKey],
  );

  const handleDismiss = useCallback(() => {
    const current = held.current;
    if (current) {
      held.current = null;
      current.presence.release(current.token);
    }
    onDismissRef.current?.();
  }, []);

  const nativeVisible = coordinate ? presentation.shown : wantVisible;
  // iOS: fullScreen(불투명 기본값 포함)은 같은 모양의 overFullScreen으로 표시한다.
  const presentationStyle =
    coordinate &&
    !modalProps.transparent &&
    (modalProps.presentationStyle ?? 'fullScreen') === 'fullScreen'
      ? 'overFullScreen'
      : modalProps.presentationStyle;
  const acked = presentation.shown && ackedKey === presentation.key;
  const childOpen = coordinate
    ? presentation.shown && wantVisible && acked
    : wantVisible;
  const childScope = useMemo<ModalScope>(
    () => ({ presence: childPresence, open: childOpen }),
    [childPresence, childOpen],
  );

  return (
    <Modal
      key={coordinate ? presentation.key : 'modal'}
      {...modalProps}
      presentationStyle={presentationStyle}
      visible={nativeVisible}
      onShow={handleShow}
      onDismiss={handleDismiss}
    >
      <ModalScopeContext.Provider value={childScope}>
        {children}
      </ModalScopeContext.Provider>
    </Modal>
  );
}

export default AppModal;
