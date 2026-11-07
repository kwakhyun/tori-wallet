/**
 * AppModal: 잠금 중 숨김 + onLock, iOS 형제 모달 순차 표시, 중첩 모달
 */

import React from 'react';
import { Modal, Platform, Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import {
  AppModal,
  MODAL_PRESENCE_FALLBACK_MS,
  isRootModalPresent,
} from '../../src/components/common/AppModal';
import { useWalletStore } from '../../src/store/walletStore';

type Shown = Record<string, boolean>;

/** 각 AppModal이 네이티브 Modal에 전달한 visible 값 (testID 기준) */
function nativeVisibility(view: ReturnType<typeof render>): Shown {
  const result: Shown = {};
  view.UNSAFE_getAllByType(Modal).forEach(instance => {
    result[instance.props.testID] = instance.props.visible;
  });
  return result;
}

function Sheet({
  id,
  visible,
  onLock,
  children,
}: {
  id: string;
  visible: boolean;
  onLock?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <AppModal visible={visible} onLock={onLock} testID={id}>
      <Text>{`${id}-content`}</Text>
      {children}
    </AppModal>
  );
}

const originalOS = Platform.OS;

/** 네이티브가 onShow/onDismiss를 보내지 않는 경우 (jest.setup.js의 Modal 목 동작 중지) */
function silenceNativeEvents() {
  jest
    .spyOn(
      (Modal as unknown as { prototype: { componentDidUpdate: () => void } })
        .prototype,
      'componentDidUpdate',
    )
    .mockImplementation(() => undefined);
}

beforeEach(() => {
  useWalletStore.setState({ hasWallet: true, isLocked: false });
});

afterEach(() => {
  Platform.OS = originalOS;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('lock awareness', () => {
  it('hides the native modal while the wallet is locked and calls onLock once', () => {
    const onLock = jest.fn();
    const view = render(<Sheet id="sheet" visible onLock={onLock} />);
    expect(view.getByText('sheet-content')).toBeTruthy();

    act(() => {
      useWalletStore.setState({ isLocked: true });
    });
    expect(view.queryByText('sheet-content')).toBeNull();
    expect(nativeVisibility(view).sheet).toBe(false);
    expect(onLock).toHaveBeenCalledTimes(1);

    // 잠긴 동안 다른 상태 변경으로 다시 렌더링되어도 한 번만 알린다.
    view.rerender(<Sheet id="sheet" visible onLock={onLock} />);
    act(() => {
      useWalletStore.setState({ activeWalletIndex: 0 });
    });
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('shows a modal that only hides (no onLock) again after unlock', () => {
    const view = render(<Sheet id="request" visible />);
    act(() => {
      useWalletStore.setState({ isLocked: true });
    });
    expect(view.queryByText('request-content')).toBeNull();

    act(() => {
      useWalletStore.setState({ isLocked: false });
    });
    expect(view.getByText('request-content')).toBeTruthy();
  });

  it('calls onLock when a modal is requested while the wallet is already locked', () => {
    useWalletStore.setState({ isLocked: true });
    const onLock = jest.fn();
    const view = render(<Sheet id="late" visible={false} onLock={onLock} />);
    expect(onLock).not.toHaveBeenCalled();

    view.rerender(<Sheet id="late" visible onLock={onLock} />);
    expect(view.queryByText('late-content')).toBeNull();
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('ignores the lock flag during onboarding (no wallet yet)', () => {
    useWalletStore.setState({ hasWallet: false, isLocked: true });
    const view = render(<Sheet id="onboarding" visible />);
    expect(view.getByText('onboarding-content')).toBeTruthy();
  });
});

describe('iOS presentation coordination', () => {
  beforeEach(() => {
    Platform.OS = 'ios';
  });

  it('defers a sibling root modal until the presented one reports onDismiss', () => {
    const view = render(
      <>
        <Sheet id="review" visible />
        <Sheet id="pin" visible />
      </>,
    );
    // 두 번째 모달은 첫 번째가 표시 중이라 기다린다.
    expect(nativeVisibility(view)).toEqual({ review: true, pin: false });
    expect(view.queryByText('pin-content')).toBeNull();

    // 검토 모달을 닫으면(onDismiss) PIN 모달이 새 네이티브 호스트로 표시된다.
    view.rerender(
      <>
        <Sheet id="review" visible={false} />
        <Sheet id="pin" visible />
      </>,
    );
    expect(view.getByText('pin-content')).toBeTruthy();
    expect(nativeVisibility(view)).toEqual({ review: false, pin: true });
  });

  it('presents the next modal after the fallback timer when onDismiss never arrives', () => {
    jest.useFakeTimers();
    const view = render(
      <>
        <Sheet id="scanner" visible />
        <Sheet id="proposal" visible={false} />
      </>,
    );
    expect(isRootModalPresent()).toBe(true);
    // 네이티브 present가 거부된 경우처럼 onDismiss가 오지 않게 한다.
    silenceNativeEvents();

    view.rerender(
      <>
        <Sheet id="scanner" visible={false} />
        <Sheet id="proposal" visible />
      </>,
    );
    expect(view.queryByText('proposal-content')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(MODAL_PRESENCE_FALLBACK_MS - 1);
    });
    expect(view.queryByText('proposal-content')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(view.getByText('proposal-content')).toBeTruthy();
  });

  it('waits for an unmounted presented modal to finish dismissing', () => {
    jest.useFakeTimers();
    const view = render(
      <>
        <Sheet key="picker" id="picker" visible />
        <Sheet key="other" id="other" visible={false} />
      </>,
    );
    // 표시 중인 선택기를 언마운트(예: 화면 이동)하고 다른 모달을 연다.
    view.rerender(
      <>
        <Sheet key="other" id="other" visible />
      </>,
    );
    expect(view.queryByText('other-content')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(MODAL_PRESENCE_FALLBACK_MS);
    });
    expect(view.getByText('other-content')).toBeTruthy();
  });

  it('lets a nested AppModal bypass the root gate and present from its parent', () => {
    const view = render(
      <>
        <Sheet id="parent" visible>
          <Sheet id="child" visible />
        </Sheet>
        <Sheet id="sibling" visible />
      </>,
    );
    // 중첩 모달은 부모 VC에서 표시되므로 루트 형제 모달과 무관하게 바로 열린다.
    expect(view.getByText('child-content')).toBeTruthy();
    expect(view.queryByText('sibling-content')).toBeNull();
    expect(nativeVisibility(view)).toMatchObject({
      parent: true,
      child: true,
      sibling: false,
    });
  });

  it('keeps the parent presented until its nested modal has dismissed', () => {
    const view = render(
      <Sheet id="parent" visible>
        <Sheet id="child" visible />
      </Sheet>,
    );
    const modal = (id: string) =>
      view
        .UNSAFE_getAllByType(Modal)
        .find(instance => instance.props.testID === id)!;
    // 자식의 닫힘 완료(onDismiss)를 직접 보내기 위해 자동 이벤트를 막는다.
    silenceNativeEvents();

    act(() => {
      useWalletStore.setState({ isLocked: true });
    });
    // 자식은 숨겨졌지만 아직 닫히는 중이므로 부모는 표시를 유지한다.
    expect(modal('child').props.visible).toBe(false);
    expect(modal('parent').props.visible).toBe(true);

    act(() => modal('child').props.onDismiss());
    expect(modal('parent').props.visible).toBe(false);
  });
});

describe('iOS presentation style', () => {
  it('presents fullScreen modals as overFullScreen so the app view stays in the window', () => {
    Platform.OS = 'ios';
    const view = render(
      <>
        <AppModal visible presentationStyle="fullScreen" testID="scanner">
          <Text>scanner</Text>
        </AppModal>
        <AppModal visible={false} presentationStyle="pageSheet" testID="sheet">
          <Text>sheet</Text>
        </AppModal>
      </>,
    );
    const styles: Record<string, unknown> = {};
    view.UNSAFE_getAllByType(Modal).forEach(instance => {
      styles[instance.props.testID] = instance.props.presentationStyle;
    });
    expect(styles).toEqual({ scanner: 'overFullScreen', sheet: 'pageSheet' });
  });

  it('keeps the requested style on Android', () => {
    Platform.OS = 'android';
    const view = render(
      <AppModal visible presentationStyle="fullScreen" testID="scanner">
        <Text>scanner</Text>
      </AppModal>,
    );
    expect(view.UNSAFE_getByType(Modal).props.presentationStyle).toBe(
      'fullScreen',
    );
  });
});

describe('Android', () => {
  it('does not defer sibling modals (Dialogs stack)', () => {
    Platform.OS = 'android';
    const view = render(
      <>
        <Sheet id="first" visible />
        <Sheet id="second" visible />
      </>,
    );
    expect(view.getByText('first-content')).toBeTruthy();
    expect(view.getByText('second-content')).toBeTruthy();
  });
});
