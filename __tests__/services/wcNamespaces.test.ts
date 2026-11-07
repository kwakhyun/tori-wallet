/**
 * 멀티체인 세션 승인: 제안 분석과 네임스페이스 생성 (실제 @walletconnect/utils 사용)
 */

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

  it('cannot approve a required non-EVM namespace but ignores optional ones', () => {
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
          { solana: { chains: ['solana:main'], methods: [], events: [] } },
        ),
        WALLET_CHAINS,
        1,
      ),
    ).toMatchObject({ canApprove: true, approvedChainIds: [1] });
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

  it('falls back to the active chain when only unsupported optional chains are requested', () => {
    const analysis = analyzeProposal(
      proposal(
        {},
        { eip155: { chains: ['eip155:56'], methods: [], events: [] } },
      ),
      WALLET_CHAINS,
      137,
    );
    expect(analysis).toMatchObject({
      canApprove: true,
      approvedChainIds: [137],
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
