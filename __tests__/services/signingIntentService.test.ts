import { encodeFunctionData, parseAbi } from 'viem';
import {
  analyzeSigningRequest,
  assertSigningIntentUnchanged,
  fingerprintSigningRequest,
} from '../../src/services/signingIntentService';

const ACCOUNT = '0x1234567890123456789012345678901234567890';
const TARGET = '0x0987654321098765432109876543210987654321';
const SPENDER = '0x111111125421ca6dc452d289314280a0f8842a65';
const MAX_UINT256 = 2n ** 256n - 1n;

const approveAbi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
]);
const transferAbi = parseAbi([
  'function transfer(address recipient, uint256 amount) returns (bool)',
]);
const approvalForAllAbi = parseAbi([
  'function setApprovalForAll(address operator, bool approved)',
]);

function transactionInput(data: `0x${string}` = '0x') {
  return {
    method: 'eth_sendTransaction',
    params: [{ from: ACCOUNT, to: TARGET, value: '0x0', data }],
    chainId: 1,
    account: ACCOUNT,
  };
}

describe('signingIntentService', () => {
  it('decodes unlimited token approval and requires explicit acknowledgement', () => {
    const data = encodeFunctionData({
      abi: approveAbi,
      functionName: 'approve',
      args: [SPENDER, MAX_UINT256],
    });

    const intent = analyzeSigningRequest(transactionInput(data));

    expect(intent.summary).toBe('토큰 무제한 사용 승인');
    expect(intent.details).toContainEqual({
      label: '권한 대상',
      value: expect.stringMatching(/^0x/i),
    });
    expect(intent.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ level: 'critical' })]),
    );
    expect(intent.requiresRiskAcknowledgement).toBe(true);
    expect(intent.rawPayload).toBe(data);
  });

  it('shows full transaction addresses without abbreviation', () => {
    const intent = analyzeSigningRequest(transactionInput());

    expect(intent.details).toContainEqual({
      label: '보내는 계정',
      value: ACCOUNT,
    });
    expect(intent.details).toContainEqual({
      label: '대상 주소',
      value: TARGET,
    });
  });

  it('decodes bounded token transfers and NFT permission revocation', () => {
    const transfer = encodeFunctionData({
      abi: transferAbi,
      functionName: 'transfer',
      args: [SPENDER, 42n],
    });
    const revoke = encodeFunctionData({
      abi: approvalForAllAbi,
      functionName: 'setApprovalForAll',
      args: [SPENDER, false],
    });

    expect(analyzeSigningRequest(transactionInput(transfer))).toMatchObject({
      summary: '토큰 전송',
      requiresRiskAcknowledgement: false,
    });
    expect(analyzeSigningRequest(transactionInput(revoke))).toMatchObject({
      summary: 'NFT 전체 권한 해제',
      requiresRiskAcknowledgement: false,
      warnings: [],
    });
  });

  it('blocks contract creation and malformed destination requests', () => {
    const intent = analyzeSigningRequest({
      ...transactionInput(),
      params: [{ from: ACCOUNT, data: '0x12345678' }],
    });

    expect(intent.blocked).toBe(true);
    expect(intent.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ level: 'critical' })]),
    );
  });

  it('fingerprints equivalent objects deterministically and detects changes', () => {
    const first = transactionInput();
    const reordered = {
      ...first,
      params: [{ data: '0x', value: '0x0', to: TARGET, from: ACCOUNT }],
    };
    const changed = {
      ...first,
      params: [{ from: ACCOUNT, to: TARGET, value: '0x1', data: '0x' }],
    };

    expect(fingerprintSigningRequest(first)).toBe(
      fingerprintSigningRequest(reordered),
    );
    expect(fingerprintSigningRequest(first)).not.toBe(
      fingerprintSigningRequest(changed),
    );
    expect(() =>
      assertSigningIntentUnchanged(fingerprintSigningRequest(first), changed),
    ).toThrow('확인 후 서명 요청 내용이 변경되어 요청을 차단했습니다.');
  });

  it('blocks typed data when the EIP-712 domain chain differs', () => {
    const input = {
      method: 'eth_signTypedData_v4',
      params: [
        ACCOUNT,
        JSON.stringify({
          domain: { name: 'Test', chainId: 137, verifyingContract: TARGET },
          types: { EIP712Domain: [], Mail: [] },
          primaryType: 'Mail',
          message: {},
        }),
      ],
      chainId: 1,
      account: ACCOUNT,
    };

    const intent = analyzeSigningRequest(input);
    expect(intent.blocked).toBe(true);
    expect(() =>
      assertSigningIntentUnchanged(intent.fingerprint, input),
    ).toThrow('보안 정책에 의해 차단된 서명 요청입니다.');
  });

  it('requires acknowledgement for unreadable personal_sign bytes', () => {
    const intent = analyzeSigningRequest({
      method: 'personal_sign',
      params: ['0x000102ff', ACCOUNT],
      chainId: 1,
      account: ACCOUNT,
    });

    expect(intent.rawPayload).toBe('0x000102ff');
    expect(intent.requiresRiskAcknowledgement).toBe(true);
    expect(intent.warnings[0]?.level).toBe('critical');
  });
});
