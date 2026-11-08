/**
 * WalletConnect 요청 검토 보조 함수: 자동 거부 사유를 짧은 한국어로 바꾼다.
 */

import {
  EstimateGasExecutionError,
  ExecutionRevertedError,
  HttpRequestError,
  InsufficientFundsError,
  TimeoutError,
} from 'viem';
import { describeReviewError } from '../../src/components/walletconnect/requestReview';

const ADDRESS = '0x1234567890123456789012345678901234567890';
const gasError = (cause: Error) =>
  new EstimateGasExecutionError(cause as any, {
    account: { address: ADDRESS } as any,
    to: ADDRESS,
    data: `0x${'ab'.repeat(200)}`,
  });

describe('describeReviewError', () => {
  it('maps viem failures to short Korean reasons without calldata dumps', () => {
    const insufficient = gasError(new InsufficientFundsError({}));
    // viem 메시지는 여러 줄에 호출 인자와 calldata를 담는다.
    expect(insufficient.message.split('\n').length).toBeGreaterThan(5);
    expect(describeReviewError(insufficient)).toBe('잔액이 부족합니다');
    expect(
      describeReviewError(
        gasError(new ExecutionRevertedError({ message: 'reverted: STF' })),
      ),
    ).toBe('트랜잭션이 실패할 것으로 예상됩니다');
    expect(
      describeReviewError(
        new HttpRequestError({ url: 'https://rpc.example', status: 500 }),
      ),
    ).toBe('네트워크 응답이 없습니다');
    expect(
      describeReviewError(
        new TimeoutError({ body: {}, url: 'https://rpc.example' }),
      ),
    ).toBe('네트워크 응답이 없습니다');
  });

  it("passes through the app's own Korean messages and shortens anything else", () => {
    expect(describeReviewError(new Error('승인되지 않은 세션 요청입니다.'))).toBe(
      '승인되지 않은 세션 요청입니다.',
    );
    const long = describeReviewError(
      new Error(`Something unexpected ${'x'.repeat(200)}\nsecond line`),
    );
    expect(long?.length).toBeLessThanOrEqual(80);
    expect(long).not.toContain('second line');
    expect(describeReviewError('not an error')).toBeNull();
  });
});
