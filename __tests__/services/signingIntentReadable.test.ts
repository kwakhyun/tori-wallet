/**
 * 사람이 읽을 수 있는 서명 표시: approve 수량, EIP-2612 Permit, Permit2, 주문
 */

import { encodeFunctionData, parseAbi } from 'viem';
import {
  analyzeSigningRequest,
  assertSigningIntentUnchanged,
  collectTokenAddresses,
  fingerprintSigningRequest,
  formatDeadline,
  formatTokenAmount,
  nativeSymbol,
  PERMIT2_ADDRESS,
} from '../../src/services/signingIntentService';
import { customNetworkRegistry } from '../../src/services/customNetworks';

const ACCOUNT = '0x1234567890123456789012345678901234567890';
const SPENDER = '0x111111125421ca6dc452d289314280a0f8842a65';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const UNKNOWN_TOKEN = '0x00000000000000000000000000000000000000aa';
const MAX_UINT256 = 2n ** 256n - 1n;
const MAX_UINT160 = (2n ** 160n - 1n).toString();
const approveAbi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
]);

const detail = (
  intent: { details: { label: string; value: string }[] },
  label: string,
) => intent.details.find(item => item.label === label)?.value;

function approveTx(token: string, amount: bigint, tokenMetadata?: any) {
  return {
    method: 'eth_sendTransaction',
    params: [
      {
        from: ACCOUNT,
        to: token,
        value: '0x0',
        data: encodeFunctionData({
          abi: approveAbi,
          functionName: 'approve',
          args: [SPENDER, amount],
        }),
        gas: '60000',
        gasPrice: '1000000000',
      },
    ],
    chainId: 1,
    account: ACCOUNT,
    tokenMetadata,
  };
}

function typedData(
  message: Record<string, unknown>,
  primaryType: string,
  domain: Record<string, unknown>,
) {
  return {
    method: 'eth_signTypedData_v4',
    params: [
      ACCOUNT,
      JSON.stringify({
        domain,
        types: { EIP712Domain: [] },
        primaryType,
        message,
      }),
    ],
    chainId: 1,
    account: ACCOUNT,
  };
}

// 반올림 경계에서 흔들리지 않도록 1분 여유를 둔다.
const inThirtyDays = () => Math.floor(Date.now() / 1000) + 30 * 86400 + 60;

describe('approve amounts', () => {
  it('formats a bounded approval of a known token with its decimals', () => {
    const intent = analyzeSigningRequest(approveTx(USDC, 1_500_000n));
    expect(intent.summary).toBe('토큰 사용 승인');
    expect(detail(intent, '승인 수량')).toBe('1.5 USDC');
    expect(detail(intent, '토큰')).toContain('USDC');
    expect(intent.warnings[0].message).toContain('토큰 사용 권한을 부여합니다');
  });

  it('flags unlimited approvals', () => {
    const intent = analyzeSigningRequest(approveTx(USDC, MAX_UINT256));
    expect(intent.summary).toBe('토큰 무제한 사용 승인');
    expect(detail(intent, '승인 수량')).toBe('무제한 (uint256 최대값)');
    expect(intent.warnings[0]).toMatchObject({ level: 'critical' });
  });

  it('uses resolved on-chain metadata for unknown tokens and marks them unverified', () => {
    const metadata = {
      [UNKNOWN_TOKEN]: { decimals: 18, symbol: 'FOO' },
    };
    const intent = analyzeSigningRequest(
      approveTx(UNKNOWN_TOKEN, 2n * 10n ** 18n, metadata),
    );
    expect(detail(intent, '승인 수량')).toBe('2 FOO');
    expect(detail(intent, '토큰')).toContain('미확인 토큰');
  });

  it('falls back to raw units when the token is unknown', () => {
    const intent = analyzeSigningRequest(approveTx(UNKNOWN_TOKEN, 42n));
    expect(detail(intent, '승인 수량(원시 단위)')).toBe('42');
  });

  it('treats approve(spender, 0) as a revocation', () => {
    const intent = analyzeSigningRequest(approveTx(USDC, 0n));
    expect(intent.summary).toBe('토큰 사용 권한 해제');
    expect(intent.requiresRiskAcknowledgement).toBe(false);
  });

  it('binds token metadata into the fingerprint', () => {
    const input = approveTx(UNKNOWN_TOKEN, 10n, {
      [UNKNOWN_TOKEN]: { decimals: 18, symbol: 'FOO' },
    });
    const intent = analyzeSigningRequest(input);
    expect(() =>
      assertSigningIntentUnchanged(intent.fingerprint, {
        ...input,
        tokenMetadata: { [UNKNOWN_TOKEN]: { decimals: 6, symbol: 'FOO' } },
      }),
    ).toThrow('변경');
    // 메타데이터가 없으면 기존 지문과 동일하다.
    const withoutMetadata = { ...input };
    delete withoutMetadata.tokenMetadata;
    expect(fingerprintSigningRequest(withoutMetadata)).toBe(
      fingerprintSigningRequest({
        ...withoutMetadata,
        tokenMetadata: undefined,
      }),
    );
  });
});

describe('EIP-2612 Permit', () => {
  it('shows spender, token, amount, deadline and a permission warning', () => {
    const deadline = inThirtyDays();
    const intent = analyzeSigningRequest(
      typedData(
        {
          owner: ACCOUNT,
          spender: SPENDER,
          value: '2500000',
          nonce: 0,
          deadline,
        },
        'Permit',
        { name: 'USD Coin', version: '2', chainId: 1, verifyingContract: USDC },
      ),
    );
    expect(intent.title).toBe('토큰 사용 권한 서명');
    expect(intent.summary).toBe('USDC 사용 권한을 부여합니다 (Permit)');
    expect(detail(intent, '권한 대상(spender)')).toBe(SPENDER);
    expect(detail(intent, '승인 수량')).toBe('2.5 USDC');
    expect(detail(intent, '서명 유효기한')).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} \(30일 후\)$/,
    );
    expect(intent.warnings).toContainEqual(
      expect.objectContaining({
        level: 'critical',
        message: expect.stringContaining('토큰 사용 권한을 부여합니다'),
      }),
    );
    expect(intent.requiresRiskAcknowledgement).toBe(true);
    expect(intent.rawPayload).toContain('"spender"');
  });

  it('flags unlimited permits and an owner mismatch', () => {
    const intent = analyzeSigningRequest(
      typedData(
        {
          owner: SPENDER,
          spender: SPENDER,
          value: MAX_UINT256.toString(),
          nonce: 0,
          deadline: MAX_UINT256.toString(),
        },
        'Permit',
        { name: 'USD Coin', chainId: 1, verifyingContract: USDC },
      ),
    );
    expect(intent.summary).toContain('무제한');
    expect(detail(intent, '서명 유효기한')).toBe('만료 없음 (무기한)');
    const messages = intent.warnings.map(warning => warning.message).join('\n');
    expect(messages).toContain('무제한 수량');
    expect(messages).toContain('권한 소유자');
  });

  it('reads amounts sent as large JSON numbers the way viem signs them (1e77 is unlimited)', () => {
    // JSON.parse('{"value":1e77}')와 같은 값. viem은 BigInt(1e77)로 서명한다.
    const intent = analyzeSigningRequest(
      typedData(
        {
          owner: ACCOUNT,
          spender: SPENDER,
          value: 1e77,
          nonce: 0,
          deadline: inThirtyDays(),
        },
        'Permit',
        { name: 'USD Coin', chainId: 1, verifyingContract: USDC },
      ),
    );
    expect(intent.summary).toBe('USDC 무제한 사용 권한을 부여합니다 (Permit)');
    expect(detail(intent, '승인 수량')).toBe('사실상 무제한 (매우 큰 수량)');
    expect(intent.warnings).toContainEqual(
      expect.objectContaining({
        level: 'critical',
        message: expect.stringContaining('무제한 수량'),
      }),
    );
  });

  it('treats an amount it cannot read exactly as unlimited', () => {
    const intent = analyzeSigningRequest(
      typedData(
        {
          owner: ACCOUNT,
          spender: SPENDER,
          value: 1.5e3 + 0.5,
          nonce: 0,
          deadline: inThirtyDays(),
        },
        'Permit',
        { name: 'USD Coin', chainId: 1, verifyingContract: USDC },
      ),
    );
    expect(detail(intent, '승인 수량')).toBe('알 수 없음 (무제한으로 간주)');
    expect(intent.summary).toContain('무제한');
    expect(intent.warnings.map(warning => warning.message).join('\n')).toContain(
      '무제한 수량',
    );
  });

  it('decodes DAI-style permits (allowed=true is unlimited)', () => {
    const intent = analyzeSigningRequest(
      typedData(
        {
          holder: ACCOUNT,
          spender: SPENDER,
          nonce: 1,
          expiry: inThirtyDays(),
          allowed: true,
        },
        'Permit',
        {
          name: 'Dai Stablecoin',
          chainId: 1,
          verifyingContract: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        },
      ),
    );
    expect(detail(intent, '승인 수량')).toBe('무제한 (uint256 최대값)');
  });
});

describe('Permit2', () => {
  const domain = {
    name: 'Permit2',
    chainId: 1,
    verifyingContract: PERMIT2_ADDRESS,
  };

  it('decodes PermitSingle with expiration and signature deadline', () => {
    const intent = analyzeSigningRequest(
      typedData(
        {
          details: {
            token: USDC,
            amount: MAX_UINT160,
            expiration: inThirtyDays() + 86400 * 60,
            nonce: 0,
          },
          spender: SPENDER,
          sigDeadline: Math.floor(Date.now() / 1000) + 1800 + 30,
        },
        'PermitSingle',
        domain,
      ),
    );
    expect(intent.summary).toBe('USDC 무제한 사용 권한을 부여합니다 (Permit2)');
    expect(detail(intent, '승인 수량')).toBe('무제한 (uint160 최대값)');
    expect(detail(intent, '권한 만료')).toContain('90일 후');
    expect(detail(intent, '서명 유효기한')).toContain('30분 후');
    const messages = intent.warnings.map(warning => warning.message).join('\n');
    expect(messages).toContain('30일 넘게');
  });

  it('decodes PermitBatch entries', () => {
    const intent = analyzeSigningRequest(
      typedData(
        {
          details: [
            {
              token: USDC,
              amount: '1000000',
              expiration: inThirtyDays(),
              nonce: 0,
            },
            {
              token: UNKNOWN_TOKEN,
              amount: '5',
              expiration: inThirtyDays(),
              nonce: 0,
            },
          ],
          spender: SPENDER,
          sigDeadline: inThirtyDays(),
        },
        'PermitBatch',
        domain,
      ),
    );
    expect(detail(intent, '승인 수량 1')).toBe('1 USDC');
    expect(detail(intent, '승인 수량 2')).toBe('5 (원시 단위)');
  });

  it('decodes PermitTransferFrom (signature transfer)', () => {
    const intent = analyzeSigningRequest(
      typedData(
        {
          permitted: { token: USDC, amount: '3000000' },
          spender: SPENDER,
          nonce: '1',
          deadline: inThirtyDays(),
        },
        'PermitTransferFrom',
        domain,
      ),
    );
    expect(detail(intent, '권한 유형')).toContain('PermitTransferFrom');
    expect(detail(intent, '승인 수량')).toBe('3 USDC');
    expect(detail(intent, '권한 대상(spender)')).toBe(SPENDER);
  });
});

describe('orders', () => {
  it('warns when a Seaport order pays nothing to the signer', () => {
    const intent = analyzeSigningRequest(
      typedData(
        {
          offerer: ACCOUNT,
          offer: [
            {
              itemType: 2,
              token: UNKNOWN_TOKEN,
              identifierOrCriteria: '1',
              startAmount: '1',
              endAmount: '1',
            },
          ],
          consideration: [
            {
              itemType: 0,
              token: '0x0000000000000000000000000000000000000000',
              startAmount: '1',
              endAmount: '1',
              recipient: SPENDER,
            },
          ],
          startTime: 0,
          endTime: inThirtyDays(),
        },
        'OrderComponents',
        {
          name: 'Seaport',
          version: '1.5',
          chainId: 1,
          verifyingContract: SPENDER,
        },
      ),
    );
    expect(intent.title).toBe('거래 주문 서명');
    expect(detail(intent, '내가 제공하는 자산 1')).toContain('ERC-721');
    expect(intent.warnings).toContainEqual(
      expect.objectContaining({
        level: 'critical',
        message: expect.stringContaining('받는 자산이 없습니다'),
      }),
    );
  });

  const seaport = (offer: unknown[], consideration: unknown[]) =>
    analyzeSigningRequest(
      typedData(
        {
          offerer: ACCOUNT,
          offer,
          consideration,
          startTime: Math.floor(Date.now() / 1000) - 86400,
          endTime: Math.floor(Date.now() / 1000) + 120,
        },
        'OrderComponents',
        {
          name: 'Seaport',
          version: '1.5',
          chainId: 1,
          verifyingContract: SPENDER,
        },
      ),
    );
  const nft = {
    itemType: 2,
    token: UNKNOWN_TOKEN,
    identifierOrCriteria: '1',
    startAmount: '1',
    endAmount: '1',
  };

  it('shows the worst case of a consideration that decays over time (10 ETH → 0)', () => {
    const intent = seaport(
      [nft],
      [
        {
          itemType: 0,
          token: '0x0000000000000000000000000000000000000000',
          identifierOrCriteria: '0',
          startAmount: '10000000000000000000',
          endAmount: '0',
          recipient: ACCOUNT,
        },
      ],
    );
    const received = detail(intent, '내가 받는 자산 1');
    expect(received).toMatch(/^최소 0 ETH/);
    expect(received).toContain('10 ETH → 0 ETH');
    expect(received).toContain('주문 기간 동안 변동');
    expect(detail(intent, '주문 시작')).toContain('이미 시작됨');
    expect(intent.warnings).toContainEqual(
      expect.objectContaining({
        level: 'critical',
        message: expect.stringContaining('시간에 따라 금액이 바뀌는 주문'),
      }),
    );
  });

  it('shows the maximum of an offer that grows over time', () => {
    const intent = seaport(
      [
        {
          itemType: 1,
          token: USDC,
          identifierOrCriteria: '0',
          startAmount: '1000000',
          endAmount: '500000000',
        },
      ],
      [{ ...nft, recipient: ACCOUNT }],
    );
    const offered = detail(intent, '내가 제공하는 자산 1');
    expect(offered).toMatch(/^최대 500 USDC/);
    expect(offered).toContain('1 USDC → 500 USDC');
    expect(intent.warnings.map(warning => warning.message).join('\n')).toContain(
      '시간에 따라 금액이 바뀌는 주문',
    );
  });

  it('does not flag fixed-price Seaport orders as changing', () => {
    const intent = seaport(
      [nft],
      [
        {
          itemType: 0,
          token: '0x0000000000000000000000000000000000000000',
          startAmount: '2000000000000000000',
          endAmount: '2000000000000000000',
          recipient: ACCOUNT,
        },
      ],
    );
    expect(detail(intent, '내가 받는 자산 1')).toBe('2 ETH');
    expect(intent.warnings.map(warning => warning.message).join('\n')).not.toContain(
      '시간에 따라',
    );
  });

  it('shows sell/buy tokens for CoW-style orders', () => {
    const intent = analyzeSigningRequest(
      typedData(
        {
          sellToken: USDC,
          buyToken: UNKNOWN_TOKEN,
          receiver: SPENDER,
          sellAmount: '10000000',
          buyAmount: '1',
          validTo: inThirtyDays(),
        },
        'Order',
        {
          name: 'Gnosis Protocol',
          version: 'v2',
          chainId: 1,
          verifyingContract: SPENDER,
        },
      ),
    );
    expect(detail(intent, '판매 자산')).toContain('10 USDC');
    expect(intent.warnings).toContainEqual(
      expect.objectContaining({
        level: 'critical',
        message: expect.stringContaining('받는 주소'),
      }),
    );
  });
});

describe('native asset symbol', () => {
  afterEach(() => customNetworkRegistry.set([]));

  const nativeTransfer = (chainId: number) =>
    analyzeSigningRequest({
      method: 'eth_sendTransaction',
      params: [
        {
          from: ACCOUNT,
          to: SPENDER,
          value: '2000000000000000000',
          gas: '21000',
          gasPrice: '1000000000',
        },
      ],
      chainId,
      account: ACCOUNT,
    });

  it('uses the symbol of a user-added network', () => {
    customNetworkRegistry.set([
      {
        chainId: 56,
        name: 'BNB Smart Chain',
        rpcUrl: 'https://bsc.example',
        symbol: 'BNB',
      },
    ]);
    expect(nativeSymbol(56)).toBe('BNB');
    const intent = nativeTransfer(56);
    expect(detail(intent, '네이티브 자산')).toBe('2 BNB');
    expect(detail(intent, '최대 네트워크 수수료')).toMatch(/ BNB$/);
    expect(detail(intent, '최대 총지출액')).toMatch(/^2\.0+21 BNB$/);
  });

  it('keeps POL/ETH for built-in networks', () => {
    expect(nativeSymbol(137)).toBe('POL');
    expect(nativeSymbol(1)).toBe('ETH');
    expect(detail(nativeTransfer(137), '네이티브 자산')).toBe('2 POL');
  });
});

describe('helpers', () => {
  it('collects token addresses that need metadata', () => {
    expect(collectTokenAddresses(approveTx(UNKNOWN_TOKEN, 1n))).toEqual([
      UNKNOWN_TOKEN,
    ]);
    expect(
      collectTokenAddresses(
        typedData(
          {
            details: {
              token: UNKNOWN_TOKEN,
              amount: '1',
              expiration: 1,
              nonce: 0,
            },
            spender: SPENDER,
            sigDeadline: 1,
          },
          'PermitSingle',
          { name: 'Permit2', verifyingContract: PERMIT2_ADDRESS },
        ),
      ),
    ).toEqual([UNKNOWN_TOKEN]);
  });

  it('formats amounts, unlimited values and deadlines', () => {
    expect(
      formatTokenAmount(1234500n, {
        decimals: 6,
        symbol: 'USDC',
        verified: true,
      }),
    ).toBe('1.2345 USDC');
    expect(formatTokenAmount(2n ** 200n, null)).toBe(
      '사실상 무제한 (매우 큰 수량)',
    );
    const now = Date.UTC(2026, 0, 1);
    expect(formatDeadline(BigInt(now / 1000 - 3600), now)).toContain(
      '1시간 전 만료됨',
    );
  });
});
