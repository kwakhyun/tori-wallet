/**
 * 사용자 정의(커스텀) EVM 네트워크
 *
 * - 입력 검증(https RPC/탐색기, 체인 ID, 기본 네트워크 중복 금지)
 * - viem Chain 정의 생성
 * - 런타임 레지스트리: walletStore가 저장된 커스텀 네트워크를 등록하고,
 *   chainClient/signingService가 기본 체인 목록에 없는 체인 ID를 여기서 찾는다.
 *
 * 스토어나 다른 서비스에 의존하지 않는 순수 모듈이라 어느 쪽에서든 가져와도
 * 순환 의존이 생기지 않는다.
 */

import type { Chain } from 'viem';

export interface CustomNetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  symbol: string;
  blockExplorerUrl?: string;
  isTestnet?: boolean;
}

export interface CustomNetworkInput {
  name: string;
  rpcUrl: string;
  chainId: string;
  symbol: string;
  blockExplorerUrl?: string;
  isTestnet?: boolean;
}

export type CustomNetworkField =
  | 'name'
  | 'rpcUrl'
  | 'chainId'
  | 'symbol'
  | 'blockExplorerUrl';

export type CustomNetworkValidation =
  | { ok: true; network: CustomNetworkConfig }
  | { ok: false; errors: Partial<Record<CustomNetworkField, string>> };

/** 스킴은 https만, 호스트에는 사용자 정보(user:pass@)나 공백을 허용하지 않는다. */
const HTTPS_URL_PATTERN =
  /^https:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?::\d{1,5})?(?:[/?#]\S*)?$/i;

export function isHttpsUrl(value: string): boolean {
  return HTTPS_URL_PATTERN.test(value.trim());
}

const MAX_CHAIN_ID = 2 ** 53 - 1;

/**
 * 커스텀 네트워크 입력을 검증한다.
 * @param builtInChainIds 앱에 내장된 네트워크 체인 ID (덮어쓰기 금지)
 * @param existingChainIds 이미 추가된 모든 네트워크 체인 ID
 */
export function validateCustomNetworkInput(
  input: CustomNetworkInput,
  builtInChainIds: readonly number[],
  existingChainIds: readonly number[],
): CustomNetworkValidation {
  const errors: Partial<Record<CustomNetworkField, string>> = {};
  const name = input.name.trim();
  const rpcUrl = input.rpcUrl.trim();
  const symbol = input.symbol.trim().toUpperCase();
  const explorer = (input.blockExplorerUrl ?? '').trim().replace(/\/+$/, '');
  const chainIdText = input.chainId.trim();

  if (!name) errors.name = '네트워크 이름을 입력해주세요.';
  else if (name.length > 40) errors.name = '이름은 40자 이하로 입력해주세요.';

  if (!rpcUrl) errors.rpcUrl = 'RPC URL을 입력해주세요.';
  else if (!isHttpsUrl(rpcUrl))
    errors.rpcUrl = 'https://로 시작하는 올바른 RPC URL을 입력해주세요.';

  let chainId = NaN;
  if (!chainIdText) {
    errors.chainId = '체인 ID를 입력해주세요.';
  } else if (!/^\d+$/.test(chainIdText)) {
    errors.chainId = '체인 ID는 10진수 숫자로 입력해주세요.';
  } else {
    chainId = Number(chainIdText);
    if (
      !Number.isSafeInteger(chainId) ||
      chainId <= 0 ||
      chainId > MAX_CHAIN_ID
    )
      errors.chainId = '올바른 체인 ID가 아닙니다.';
    else if (builtInChainIds.includes(chainId))
      errors.chainId = '이미 기본으로 제공되는 네트워크입니다.';
    else if (existingChainIds.includes(chainId))
      errors.chainId = '이미 추가된 네트워크입니다.';
  }

  if (!symbol) errors.symbol = '통화 기호를 입력해주세요.';
  else if (!/^[A-Z0-9.]{1,10}$/.test(symbol))
    errors.symbol = '통화 기호는 영문/숫자 10자 이하로 입력해주세요.';

  if (explorer && !isHttpsUrl(explorer))
    errors.blockExplorerUrl = 'https://로 시작하는 올바른 URL을 입력해주세요.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    network: {
      chainId,
      name,
      rpcUrl,
      symbol,
      blockExplorerUrl: explorer || undefined,
      isTestnet: !!input.isTestnet,
    },
  };
}

/** 커스텀 네트워크용 viem Chain 정의 (defineChain과 같은 형태) */
export function toViemChain(config: CustomNetworkConfig): Chain {
  return {
    id: config.chainId,
    name: config.name,
    nativeCurrency: {
      name: config.symbol,
      symbol: config.symbol,
      decimals: 18,
    },
    rpcUrls: { default: { http: [config.rpcUrl] } },
    blockExplorers: config.blockExplorerUrl
      ? { default: { name: config.name, url: config.blockExplorerUrl } }
      : undefined,
    testnet: !!config.isTestnet,
  };
}

type Listener = () => void;

class CustomNetworkRegistry {
  private configs = new Map<number, CustomNetworkConfig>();
  private chains = new Map<number, Chain>();
  private listeners = new Set<Listener>();

  /** 등록된 커스텀 네트워크 전체를 교체한다. */
  set(networks: readonly CustomNetworkConfig[]): void {
    const next = new Map(networks.map(network => [network.chainId, network]));
    const unchanged =
      next.size === this.configs.size &&
      [...next].every(([chainId, network]) => {
        const current = this.configs.get(chainId);
        return (
          !!current &&
          current.rpcUrl === network.rpcUrl &&
          current.name === network.name &&
          current.symbol === network.symbol &&
          current.blockExplorerUrl === network.blockExplorerUrl &&
          !!current.isTestnet === !!network.isTestnet
        );
      });
    if (unchanged) return;
    this.configs = next;
    this.chains = new Map(
      [...next].map(([chainId, network]) => [chainId, toViemChain(network)]),
    );
    this.listeners.forEach(listener => listener());
  }

  get(chainId: number): CustomNetworkConfig | undefined {
    return this.configs.get(chainId);
  }

  getChain(chainId: number): Chain | undefined {
    return this.chains.get(chainId);
  }

  has(chainId: number): boolean {
    return this.configs.has(chainId);
  }

  list(): CustomNetworkConfig[] {
    return [...this.configs.values()];
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const customNetworkRegistry = new CustomNetworkRegistry();

/** 스왑/시세/구매 등 외부 API가 커스텀 네트워크를 지원하지 않을 때 쓰는 공통 문구 */
export const UNSUPPORTED_ON_NETWORK_MESSAGE =
  '이 네트워크에서는 지원되지 않습니다';
