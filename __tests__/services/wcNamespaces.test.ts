/**
 * 멀티체인 세션 승인: 제안 분석과 네임스페이스 생성 (실제 @walletconnect/utils 사용)
 */

import { isConformingNamespaces, isValidNamespaces } from '@walletconnect/utils';
import {
  analyzeProposal,
  buildSessionNamespaces,
} from '../../src/services/wcService';

const ADDRESS = '0x1234567890123456789012345678901234567890';
const WALLET_CHAINS = [1, 137, 42161, 10, 8453, 11155111];

function proposal(
  requiredNamespaces: Record<string, unknown>,
  optionalNamespaces: Record<string, unknown> = {},
) {
  return {
    params: {
      id: 1,
      expiryTimestamp: 0,
      relays: [],
      pairingTopic: 'pairing',
      proposer: {
        publicKey: 'pk',
        metadata: {
          name: 'dApp',
          description: '',
          url: 'https://d.app',
          icons: [],
        },
      },
      requiredNamespaces,
      optionalNamespaces,
    },
  } as any;
}

describe('analyzeProposal', () => {
  it('approves the intersection of required and optional chains with the wallet networks, active chain first', () => {
    const analysis = analyzeProposal(
      proposal(
        {
          eip155: {
            chains: ['eip155:1'],
            methods: ['personal_sign'],
            events: ['chainChanged'],
          },
        },
        {
          eip155: {
            chains: ['eip155:137', 'eip155:8453', 'eip155:999'],
            methods: ['eth_sendTransaction', 'eth_sign'],
            events: [],
          },
        },
      ),
      WALLET_CHAINS,
      8453,
    );
    expect(analysis.canApprove).toBe(true);
    expect(analysis.requiredChainIds).toEqual([1]);
    expect(analysis.approvedChainIds).toEqual([8453, 1, 137]);
    expect(analysis.unsupportedRequiredChains).toEqual([]);
    // eth_sign은 지원하지 않는다.
    expect(analysis.methods).toEqual(['eth_sendTransaction', 'personal_sign']);
  });

  it('cannot approve when a required chain is not a wallet network', () => {
    const analysis = analyzeProposal(
      proposal({
        eip155: { chains: ['eip155:1', 'eip155:56'], methods: [], events: [] },
      }),
      WALLET_CHAINS,
      1,
    );
    expect(analysis.canApprove).toBe(false);
    expect(analysis.unsupportedRequiredChains).toEqual(['eip155:56']);
  });

  it('cannot approve a required non-EVM namespace and ignores optional ones next to EVM chains', () => {
    expect(
      analyzeProposal(
        proposal({
          solana: { chains: ['solana:main'], methods: [], events: [] },
        }),
        WALLET_CHAINS,
        1,
      ),
    ).toMatchObject({ canApprove: false, unsupportedNamespaces: ['solana'] });
    expect(
      analyzeProposal(
        proposal(
          {},
          {
            eip155: { chains: ['eip155:137'], methods: [], events: [] },
            solana: { chains: ['solana:main'], methods: [], events: [] },
          },
        ),
        WALLET_CHAINS,
        1,
      ),
    ).toMatchObject({
      canApprove: true,
      approvedChainIds: [137],
      unsupportedOptionalNamespaces: [],
    });
  });

  it('cannot approve a proposal that only asks for non-EVM namespaces', () => {
    // WalletConnect는 요청에 없는 eip155 네임스페이스를 만들어 주지 않는다.
    expect(
      analyzeProposal(
        proposal(
          {},
          { solana: { chains: ['solana:main'], methods: [], events: [] } },
        ),
        WALLET_CHAINS,
        1,
      ),
    ).toMatchObject({
      canApprove: false,
      approvedChainIds: [],
      unsupportedOptionalNamespaces: ['solana'],
    });
  });

  it('reports required methods the wallet refuses (eth_sign) instead of failing approval later', () => {
    const analysis = analyzeProposal(
      proposal({
        eip155: {
          chains: ['eip155:1'],
          methods: ['personal_sign', 'eth_sign'],
          events: ['chainChanged'],
        },
      }),
      WALLET_CHAINS,
      1,
    );
    expect(analysis.canApprove).toBe(false);
    expect(analysis.unsupportedRequiredMethods).toEqual(['eth_sign']);
  });

  it('accepts CAIP-keyed namespaces such as "eip155:10"', () => {
    const analysis = analyzeProposal(
      proposal({ 'eip155:10': { methods: ['personal_sign'], events: [] } }),
      WALLET_CHAINS,
      1,
    );
    expect(analysis.approvedChainIds).toEqual([10]);
  });

  it('cannot approve when every requested optional chain is unsupported', () => {
    // 활성 체인으로 대신 연결하면 WalletConnect가 빈 네임스페이스로 승인을 거부한다.
    const analysis = analyzeProposal(
      proposal(
        {},
        {
          eip155: {
            chains: ['eip155:56', 'eip155:250'],
            methods: [],
            events: [],
          },
        },
      ),
      WALLET_CHAINS,
      137,
    );
    expect(analysis).toMatchObject({
      canApprove: false,
      approvedChainIds: [],
      unsupportedRequiredChains: [],
      unsupportedOptionalChains: ['eip155:56', 'eip155:250'],
    });
  });

  it('reports unsupported optional chains next to approved ones', () => {
    const analysis = analyzeProposal(
      proposal(
        {},
        { eip155: { chains: ['eip155:1', 'eip155:56'], methods: [] } },
      ),
      WALLET_CHAINS,
      1,
    );
    expect(analysis).toMatchObject({
      canApprove: true,
      approvedChainIds: [1],
      unsupportedOptionalChains: ['eip155:56'],
    });
  });

  it('connects on the active chain only when the proposal names no EVM chain', () => {
    expect(analyzeProposal(proposal({}, {}), WALLET_CHAINS, 137)).toMatchObject(
      { canApprove: true, approvedChainIds: [137] },
    );
    expect(
      analyzeProposal(
        proposal({}, { eip155: { methods: ['personal_sign'], events: [] } }),
        WALLET_CHAINS,
        137,
      ),
    ).toMatchObject({ canApprove: true, approvedChainIds: [137] });
  });
});

describe('approvable proposals produce a namespace WalletConnect accepts', () => {
  const cases: [string, any][] = [
    [
      'required + optional chains',
      proposal(
        {
          eip155: {
            chains: ['eip155:1'],
            methods: ['personal_sign'],
            events: ['chainChanged'],
          },
        },
        {
          eip155: {
            chains: ['eip155:137', 'eip155:56'],
            methods: ['eth_sendTransaction'],
            events: [],
          },
        },
      ),
    ],
    [
      'optional-only supported chains (AppKit)',
      proposal(
        {},
        {
          eip155: {
            chains: ['eip155:56', 'eip155:8453'],
            methods: ['personal_sign', 'eth_sendTransaction'],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      ),
    ],
    ['no namespaces at all', proposal({}, {})],
    [
      'optional eip155 without a chain list',
      proposal(
        {},
        {
          eip155: {
            methods: ['personal_sign'],
            events: ['accountsChanged'],
          },
        },
      ),
    ],
    [
      'required eip155 without a chain list',
      proposal({
        eip155: { methods: ['personal_sign'], events: ['chainChanged'] },
      }),
    ],
    [
      'CAIP-keyed namespace',
      proposal({ 'eip155:10': { methods: ['personal_sign'], events: [] } }),
    ],
  ];

  test.each(cases)('%s', (_label, input) => {
    const analysis = analyzeProposal(input, WALLET_CHAINS, 11155111);
    expect(analysis.canApprove).toBe(true);
    const namespaces = buildSessionNamespaces(
      input,
      ADDRESS,
      analysis.approvedChainIds,
    );
    expect(namespaces.eip155?.accounts?.length).toBeGreaterThan(0);
    // sign-client의 approve()가 하는 검증과 같다.
    expect(isValidNamespaces(namespaces, 'approve()')).toBeNull();
    expect(
      isConformingNamespaces(
        input.params.requiredNamespaces,
        namespaces,
        'approve()',
      ),
    ).toBeNull();
  });

  it('only grants requested methods when it builds the namespace itself', () => {
    const input = proposal(
      {},
      { eip155: { methods: ['personal_sign', 'eth_sign'], events: [] } },
    );
    const namespaces = buildSessionNamespaces(input, ADDRESS, [1]);
    expect(namespaces.eip155).toEqual({
      chains: ['eip155:1'],
      methods: ['personal_sign'],
      events: [],
      accounts: [`eip155:1:${ADDRESS}`],
    });
  });
});

describe('buildSessionNamespaces', () => {
  it('builds accounts for every approved chain', () => {
    const input = proposal(
      {
        eip155: {
          chains: ['eip155:1'],
          methods: ['personal_sign'],
          events: ['chainChanged'],
        },
      },
      {
        eip155: {
          chains: ['eip155:137'],
          methods: ['wallet_switchEthereumChain'],
          events: ['accountsChanged'],
        },
      },
    );
    const namespaces = buildSessionNamespaces(input, ADDRESS, [1, 137]);
    expect(namespaces.eip155.chains).toEqual(['eip155:1', 'eip155:137']);
    expect(namespaces.eip155.accounts).toEqual([
      `eip155:1:${ADDRESS}`,
      `eip155:137:${ADDRESS}`,
    ]);
    expect(namespaces.eip155.methods).toEqual(
      expect.arrayContaining(['personal_sign', 'wallet_switchEthereumChain']),
    );
  });

  it('throws when the approved chains do not satisfy a required chain', () => {
    const input = proposal({
      eip155: { chains: ['eip155:56'], methods: ['personal_sign'], events: [] },
    });
    expect(() => buildSessionNamespaces(input, ADDRESS, [1])).toThrow();
  });
});
