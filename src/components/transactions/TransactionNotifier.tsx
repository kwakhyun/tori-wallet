/**
 * 거래 상태 알림 (인앱 토스트)
 *
 * transactionTracker가 감지한 완료/실패/대체됨을 토스트로 알린다.
 * 푸시 알림 라이브러리가 없으므로 앱이 열려 있을 때만 표시된다.
 */

import { useEffect } from 'react';
import {
  transactionTracker,
  type TransactionStatusEvent,
} from '@/services/transactionTracker';
import { formatDisplayAmount } from '@/utils/format';
import { showToast, type ToastType } from '@/store/toastStore';

const TOAST_DURATION = 4000;

/** "0.1 ETH 전송" 같은 짧은 설명. 정보가 없으면 빈 문자열. */
export function describeTransaction(event: TransactionStatusEvent): string {
  if (event.replacement?.kind === 'cancel') return '거래 취소';
  const { type, amount, symbol } = event.summary ?? {};
  const hasAmount =
    amount !== undefined && amount !== '' && Number.isFinite(Number(amount));
  const quantity =
    hasAmount && symbol
      ? `${formatDisplayAmount(amount)} ${symbol}`
      : symbol ?? '';
  switch (type) {
    case 'approve':
      if (!symbol) return '토큰 승인';
      return Number(amount) === 0 ? `${symbol} 승인 취소` : `${symbol} 승인`;
    case 'swap':
      return quantity ? `${quantity} 스왑` : '스왑';
    case 'send':
      return quantity && Number(amount) > 0 ? `${quantity} 전송` : '';
    default:
      return quantity && Number(amount) > 0 ? quantity : '';
  }
}

/**
 * 이벤트에 대한 토스트 내용. 같은 결과를 두 번 알리지 않도록
 * 가속/취소 쌍에서는 한쪽 이벤트만 알린다.
 */
export function notificationFor(
  event: TransactionStatusEvent,
): { message: string; type: ToastType } | null {
  const withDescription = (title: string) => {
    const description = describeTransaction(event);
    return description ? `${title} · ${description}` : title;
  };
  switch (event.status) {
    case 'confirmed':
      // 취소 거래 완료는 원래 거래의 '대체됨' 알림이 대신한다.
      if (event.replacement?.kind === 'cancel') return null;
      return {
        message: withDescription('거래가 완료되었습니다'),
        type: 'success',
      };
    case 'failed':
      return { message: withDescription('거래가 실패했습니다'), type: 'error' };
    case 'replaced': {
      // 경쟁에서 진 가속/취소 거래 자체는 원래 거래 결과로 충분하다.
      if (event.replacement) return null;
      // 가속 거래의 결과는 새 거래의 완료/실패 알림이 대신한다.
      if (event.replacedBy?.kind === 'speedUp') return null;
      const message = withDescription('거래가 대체되었습니다');
      return {
        message:
          event.replacedBy?.kind === 'cancel' ? `${message} (취소됨)` : message,
        type: 'info',
      };
    }
    default:
      return null;
  }
}

export function TransactionNotifier(): null {
  useEffect(
    () =>
      transactionTracker.subscribe(event => {
        const notification = notificationFor(event);
        if (notification)
          showToast(notification.message, notification.type, TOAST_DURATION);
      }),
    [],
  );
  return null;
}

export default TransactionNotifier;
