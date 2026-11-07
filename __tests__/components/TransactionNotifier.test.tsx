import React from 'react';
import { act, render } from '@testing-library/react-native';
import {
  TransactionNotifier,
  describeTransaction,
  notificationFor,
} from '../../src/components/transactions/TransactionNotifier';
import { useToastStore } from '../../src/store/toastStore';
import {
  transactionTracker,
  type TransactionStatusEvent,
} from '../../src/services/transactionTracker';

const hash = `0x${'a'.repeat(64)}`;
const other = `0x${'b'.repeat(64)}`;

const event = (
  overrides: Partial<TransactionStatusEvent>,
): TransactionStatusEvent => ({
  hash,
  chainId: 1,
  status: 'confirmed',
  summary: { type: 'send', amount: '0.5', symbol: 'ETH' },
  ...overrides,
});

beforeEach(() => useToastStore.getState().reset());

describe('notificationFor', () => {
  it('uses the three status messages with a short description', () => {
    expect(notificationFor(event({}))).toEqual({
      message: '거래가 완료되었습니다 · 0.5 ETH 전송',
      type: 'success',
    });
    expect(notificationFor(event({ status: 'failed' }))?.message).toBe(
      '거래가 실패했습니다 · 0.5 ETH 전송',
    );
    expect(
      notificationFor(event({ status: 'replaced', replacedBy: {} }))?.message,
    ).toBe('거래가 대체되었습니다 · 0.5 ETH 전송');
  });

  it('describes swaps, approvals and revokes and omits unknown details', () => {
    expect(
      describeTransaction(
        event({ summary: { type: 'swap', amount: '10', symbol: 'USDC' } }),
      ),
    ).toBe('10 USDC 스왑');
    expect(
      describeTransaction(
        event({ summary: { type: 'approve', amount: '0', symbol: 'USDC' } }),
      ),
    ).toBe('USDC 승인 취소');
    expect(
      describeTransaction(
        event({ summary: { type: 'approve', amount: '5', symbol: 'USDC' } }),
      ),
    ).toBe('USDC 승인');
    expect(notificationFor(event({ summary: undefined }))?.message).toBe(
      '거래가 완료되었습니다',
    );
  });

  it('announces each speed-up/cancel outcome exactly once', () => {
    // 가속 성공: 새 거래의 완료만 알리고 원래 거래의 대체는 생략
    expect(
      notificationFor(
        event({
          hash: other,
          replacement: { kind: 'speedUp', originalHash: hash },
        }),
      )?.message,
    ).toBe('거래가 완료되었습니다 · 0.5 ETH 전송');
    expect(
      notificationFor(
        event({
          status: 'replaced',
          replacedBy: { hash: other, kind: 'speedUp' },
        }),
      ),
    ).toBeNull();
    // 취소 성공: 원래 거래의 대체(취소됨)만 알림
    expect(
      notificationFor(
        event({
          hash: other,
          replacement: { kind: 'cancel', originalHash: hash },
        }),
      ),
    ).toBeNull();
    expect(
      notificationFor(
        event({
          status: 'replaced',
          replacedBy: { hash: other, kind: 'cancel' },
        }),
      )?.message,
    ).toBe('거래가 대체되었습니다 · 0.5 ETH 전송 (취소됨)');
    // 경쟁에서 진 대체 거래 자체는 알리지 않음
    expect(
      notificationFor(
        event({
          hash: other,
          status: 'replaced',
          replacement: { kind: 'speedUp', originalHash: hash },
          replacedBy: {},
        }),
      ),
    ).toBeNull();
  });
});

describe('TransactionNotifier', () => {
  it('shows tracker events as toasts while mounted and unsubscribes on unmount', () => {
    let listener: ((e: TransactionStatusEvent) => void) | undefined;
    const unsubscribe = jest.fn();
    const subscribe = jest
      .spyOn(transactionTracker, 'subscribe')
      .mockImplementation(next => {
        listener = next;
        return unsubscribe;
      });
    const view = render(<TransactionNotifier />);
    expect(subscribe).toHaveBeenCalledTimes(1);
    act(() => listener?.(event({ status: 'failed' })));
    expect(useToastStore.getState().current).toMatchObject({
      message: '거래가 실패했습니다 · 0.5 ETH 전송',
      type: 'error',
    });
    view.unmount();
    expect(unsubscribe).toHaveBeenCalled();
    subscribe.mockRestore();
  });
});
