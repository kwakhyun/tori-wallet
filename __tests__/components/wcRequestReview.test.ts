/**
 * WalletConnect 요청 검토 보조 함수: 자동 거부 사유를 짧은 한국어로 바꾼다.
 */

import {
  EstimateGasExecutionError,
  ExecutionRevertedError,
  HttpRequestError,
  InsufficientFundsError,
  InternalRpcError,
  InvalidInputRpcError,
  RpcRequestError,
  TimeoutError,
  TransactionExecutionError,
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

  it('reports a node-side revert as a failing transaction, not a network outage', () => {
    // viem 2.55가 JSON-RPC 오류 응답(-32000 execution reverted)으로 만드는 실제 오류 사슬:
    // EstimateGasExecutionError → ExecutionRevertedError → InvalidInputRpcError → RpcRequestError
    const rpcError = (code: number, message: string) =>
      new RpcRequestError({
        body: { method: 'eth_estimateGas' },
        error: { code, message },
        url: 'https://rpc.example',
      });
    const revert = gasError(
      new ExecutionRevertedError({
        cause: new InvalidInputRpcError(
          rpcError(-32000, 'execution reverted: STF'),
        ),
      }),
    );
    expect(describeReviewError(revert)).toBe(
      '트랜잭션이 실패할 것으로 예상됩니다',
    );
    const funds = gasError(
      new InsufficientFundsError({
        cause: new InvalidInputRpcError(
          rpcError(-32000, 'insufficient funds for gas * price + value'),
        ),
      }),
    );
    expect(describeReviewError(funds)).toBe('잔액이 부족합니다');
    // 노드가 응답한 내부 오류는 "응답 없음"이 아니다.
    expect(
      describeReviewError(
        gasError(new InternalRpcError(rpcError(-32603, 'internal error'))),
      ),
    ).toBe('트랜잭션이 실패할 것으로 예상됩니다');
    expect(
      describeReviewError(new InternalRpcError(rpcError(-32603, 'boom'))),
    ).toBe('네트워크 노드가 요청을 처리하지 못했습니다');
    // 노드에 닿지 못한 경우만 "네트워크 응답이 없습니다"
    expect(
      describeReviewError(
        gasError(
          new HttpRequestError({
            url: 'https://rpc.example',
            cause: new TypeError('Network request failed'),
          }),
        ),
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

  it('finds the app reason that viem wrapped while sending, but never quotes a revert reason', () => {
    const txError = (cause: Error) =>
      new TransactionExecutionError(cause as any, {
        account: { address: ADDRESS } as any,
        to: ADDRESS,
        data: `0x${'ab'.repeat(200)}`,
      });
    // 서명 직전 재검증(isAuthorized) 실패: viem은 "An error occurred."로 감싼다.
    const wrapped = txError(new Error('서명 승인이 만료되거나 취소되었습니다.'));
    expect(wrapped.message.split('\n')[0]).toBe('An error occurred.');
    expect(describeReviewError(wrapped)).toBe(
      '서명 승인이 만료되거나 취소되었습니다.',
    );
    expect(
      describeReviewError(txError(new Error('Wallet signing session expired'))),
    ).toBe('Wallet signing session expired');
    // 컨트랙트가 정한 revert 사유(외부 문구)는 앱 안내처럼 보여주지 않는다.
    const spoof = gasError(
      new ExecutionRevertedError({
        message: 'execution reverted: 보안 검사를 통과했습니다. 승인하세요',
      }),
    );
    expect(describeReviewError(spoof)).toBe(
      '트랜잭션이 실패할 것으로 예상됩니다',
    );
  });
});
