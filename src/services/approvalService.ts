/**
 * ERC-20 토큰 승인(allowance) 조회 및 취소 서비스
 *
 * 전체 온체인 승인 내역을 찾으려면 인덱서가 필요하다. 여기서는 알려진 토큰
 * (기본 토큰, 스왑 토큰, 사용자 추가 토큰, 로컬 승인 기록의 토큰)과 알려진
 * 지출 주소(0x AllowanceHolder, 로컬 승인 기록에서 디코딩한 spender)만 확인한다.
 */

import {
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  formatEther,
  formatUnits,
  getAddress,
  isAddress,
  type Hex,
} from 'viem';
import { chainClient } from './chainClient';
import { signingService, type TransactionParams } from './signingService';
import { transactionTracker } from './transactionTracker';
import { SWAP_TOKENS, ZERO_X_ALLOWANCE_HOLDER } from './swapService';
import { DEFAULT_TOKENS } from './tokenService';
import { transactionCacheService } from '@/realm/services/transactionCacheService';
import { tokenListService } from '@/realm/services/tokenListService';

/** 이 값 이상이면 사실상 무제한 승인으로 표시한다. */
export const UNLIMITED_ALLOWANCE_THRESHOLD = 2n ** 255n;
export const UNLIMITED_LABEL = '무제한';
const REVOKE_PLAN_TTL_MS = 90_000;
const MAX_LOCAL_APPROVALS = 30;
const READ_CONCURRENCY = 6;

export const KNOWN_SPENDER_LABELS: Record<string, string> = {
  [ZERO_X_ALLOWANCE_HOLDER.toLowerCase()]: '0x AllowanceHolder',
};

export interface ApprovalToken {
  address: `0x${string}`;
  symbol: string;
  decimals?: number;
}

export interface ApprovalSpender {
  address: `0x${string}`;
  label?: string;
}

export interface TokenApproval {
  id: string;
  chainId: number;
  owner: `0x${string}`;
  token: ApprovalToken;
  spender: ApprovalSpender;
  allowance: bigint;
  isUnlimited: boolean;
  /** "무제한" 또는 decimals를 적용한 수량 (decimals를 모르면 원시 단위) */
  formattedAmount: string;
}

export interface ApprovalScanResult {
  approvals: TokenApproval[];
  tokensChecked: number;
  spendersChecked: number;
  failedChecks: number;
}

export interface RevokePlan {
  owner: `0x${string}`;
  chainId: number;
  token: ApprovalToken;
  spender: ApprovalSpender;
  data: Hex;
  feeWei: bigint;
  transaction: TransactionParams;
  expiresAt: number;
}

export function formatAllowance(
  allowance: bigint,
  decimals?: number,
): { isUnlimited: boolean; formatted: string } {
  if (allowance >= UNLIMITED_ALLOWANCE_THRESHOLD)
    return { isUnlimited: true, formatted: UNLIMITED_LABEL };
  if (decimals === undefined)
    return {
      isUnlimited: false,
      formatted: `${allowance.toString()} (원시 단위)`,
    };
  return { isUnlimited: false, formatted: formatUnits(allowance, decimals) };
}

/** approve(spender, amount) 호출 데이터를 디코딩한다. 아니면 null. */
export function decodeApproveCalldata(
  data: string | null | undefined,
): { spender: `0x${string}`; amount: bigint } | null {
  if (!data || !data.toLowerCase().startsWith('0x095ea7b3')) return null;
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: data as Hex });
    if (decoded.functionName !== 'approve') return null;
    const [spender, amount] = decoded.args as readonly [`0x${string}`, bigint];
    return { spender: getAddress(spender), amount };
  } catch {
    return null;
  }
}

export function encodeRevokeCalldata(spender: `0x${string}`): Hex {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender, 0n],
  });
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += limit) {
    results.push(
      ...(await Promise.allSettled(items.slice(i, i + limit).map(fn))),
    );
  }
  return results;
}

class ApprovalService {
  /** 로컬 기록 해시 → 디코딩된 승인 (불변이므로 캐시) */
  private decodedCache = new Map<
    string,
    { token: `0x${string}`; spender: `0x${string}` } | null
  >();

  /** 확인할 ERC-20 토큰 목록 (주소 기준 중복 제거) */
  async getCandidateTokens(
    chainId: number,
    extra: ApprovalToken[] = [],
  ): Promise<ApprovalToken[]> {
    const tokens = new Map<string, ApprovalToken>();
    const add = (token: {
      address: string;
      symbol?: string;
      decimals?: number;
    }) => {
      if (!isAddress(token.address)) return;
      const address = getAddress(token.address);
      if (
        address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      )
        return;
      const key = address.toLowerCase();
      const existing = tokens.get(key);
      if (existing && existing.decimals !== undefined) return;
      tokens.set(key, {
        address,
        symbol: token.symbol || existing?.symbol || `${address.slice(0, 6)}…`,
        decimals: token.decimals ?? existing?.decimals,
      });
    };
    for (const config of DEFAULT_TOKENS[chainId] ?? [])
      if (config.address !== 'native') add(config);
    for (const token of SWAP_TOKENS[chainId] ?? []) add(token);
    try {
      for (const token of await tokenListService.getCustomTokens(chainId))
        add(token);
    } catch {
      // 사용자 토큰 목록을 읽지 못해도 기본 토큰은 확인한다.
    }
    for (const token of extra) add(token);
    return [...tokens.values()];
  }

  /** 로컬 승인 기록의 호출 데이터를 RPC에서 읽어 (토큰, spender)를 찾는다. */
  async getLocalApprovals(
    owner: `0x${string}`,
    chainId: number,
  ): Promise<{ token: ApprovalToken; spender: `0x${string}` }[]> {
    let records: {
      hash: string;
      tokenAddress?: string;
      tokenSymbol?: string;
      to: string;
    }[] = [];
    try {
      const entries = await transactionCacheService.getByAddress(
        owner,
        chainId,
        {
          type: 'approve',
          limit: MAX_LOCAL_APPROVALS,
        },
      );
      // Realm 객체는 비동기 작업 전에 복사한다.
      records = entries
        .filter(entry => entry.from?.toLowerCase() === owner.toLowerCase())
        .map(entry => ({
          hash: entry.hash,
          tokenAddress: entry.tokenAddress,
          tokenSymbol: entry.tokenSymbol,
          to: entry.to,
        }));
    } catch {
      return [];
    }
    const client = chainClient.getClient(chainId);
    const results = await mapLimit(records, READ_CONCURRENCY, async record => {
      const cacheKey = `${chainId}:${record.hash.toLowerCase()}`;
      let decoded = this.decodedCache.get(cacheKey);
      if (decoded === undefined) {
        const tx = await client.getTransaction({
          hash: record.hash as `0x${string}`,
        });
        const approve = decodeApproveCalldata(tx.input);
        decoded =
          approve && tx.to
            ? { token: getAddress(tx.to), spender: approve.spender }
            : null;
        this.decodedCache.set(cacheKey, decoded);
      }
      if (!decoded) return null;
      const symbol =
        record.tokenAddress?.toLowerCase() === decoded.token.toLowerCase()
          ? record.tokenSymbol
          : undefined;
      return {
        token: { address: decoded.token, symbol: symbol ?? '' },
        spender: decoded.spender,
      };
    });
    return results.flatMap(result =>
      result.status === 'fulfilled' && result.value ? [result.value] : [],
    );
  }

  /** 알려진 토큰 × 알려진 spender 조합의 0이 아닌 allowance를 반환한다. */
  async listAllowances(
    owner: `0x${string}`,
    chainId: number,
  ): Promise<ApprovalScanResult> {
    const local = await this.getLocalApprovals(owner, chainId);
    const tokens = await this.getCandidateTokens(
      chainId,
      local.map(item => item.token),
    );
    const spenders = new Map<string, ApprovalSpender>();
    spenders.set(ZERO_X_ALLOWANCE_HOLDER.toLowerCase(), {
      address: getAddress(ZERO_X_ALLOWANCE_HOLDER),
      label: KNOWN_SPENDER_LABELS[ZERO_X_ALLOWANCE_HOLDER.toLowerCase()],
    });
    for (const item of local) {
      const key = item.spender.toLowerCase();
      if (!spenders.has(key))
        spenders.set(key, {
          address: item.spender,
          label: KNOWN_SPENDER_LABELS[key],
        });
    }

    const client = chainClient.getClient(chainId);
    const pairs = tokens.flatMap(token =>
      [...spenders.values()].map(spender => ({ token, spender })),
    );
    const results = await mapLimit(
      pairs,
      READ_CONCURRENCY,
      ({ token, spender }) =>
        client.readContract({
          address: token.address,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [owner, spender.address],
        }),
    );
    const failedChecks = results.filter(r => r.status === 'rejected').length;
    if (pairs.length > 0 && failedChecks === pairs.length)
      throw new Error('토큰 승인 정보를 불러오지 못했습니다.');

    const found = pairs.flatMap((pair, index) => {
      const result = results[index];
      return result.status === 'fulfilled' && result.value > 0n
        ? [{ ...pair, allowance: result.value }]
        : [];
    });
    // 로컬 기록에서만 알게 된 토큰은 decimals/symbol을 읽는다.
    await mapLimit(
      [...new Set(found.map(item => item.token))].filter(
        token => token.decimals === undefined || !token.symbol,
      ),
      READ_CONCURRENCY,
      async token => {
        const [decimals, symbol] = await Promise.allSettled([
          client.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: 'decimals',
          }),
          client.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: 'symbol',
          }),
        ]);
        if (decimals.status === 'fulfilled') token.decimals = decimals.value;
        if (symbol.status === 'fulfilled' && symbol.value)
          token.symbol = symbol.value;
        if (!token.symbol) token.symbol = `${token.address.slice(0, 6)}…`;
      },
    );

    const approvals = found.map(({ token, spender, allowance }) => {
      const { isUnlimited, formatted } = formatAllowance(
        allowance,
        token.decimals,
      );
      return {
        id: `${chainId}:${token.address.toLowerCase()}:${spender.address.toLowerCase()}`,
        chainId,
        owner,
        token,
        spender,
        allowance,
        isUnlimited,
        formattedAmount: formatted,
      };
    });
    return {
      approvals,
      tokensChecked: tokens.length,
      spendersChecked: spenders.size,
      failedChecks,
    };
  }

  /** approve(spender, 0) 거래를 준비한다. 서명은 하지 않는다. */
  async prepareRevoke(input: {
    owner: `0x${string}`;
    chainId: number;
    token: ApprovalToken;
    spender: ApprovalSpender;
  }): Promise<RevokePlan> {
    if (
      !isAddress(input.owner) ||
      !isAddress(input.token.address) ||
      !isAddress(input.spender.address)
    )
      throw new Error('유효하지 않은 주소입니다.');
    const data = encodeRevokeCalldata(input.spender.address);
    const client = chainClient.getClient(input.chainId);
    const [estimate, gasPrice, balance] = await Promise.all([
      chainClient.estimateGas(
        { from: input.owner, to: input.token.address, data },
        { chainId: input.chainId },
      ),
      chainClient.getGasPrice({ chainId: input.chainId }),
      client.getBalance({ address: input.owner }),
    ]);
    const gas = (estimate * 120n) / 100n;
    const feeWei = gas * gasPrice;
    if (balance < feeWei)
      throw new Error(
        `승인 취소 수수료를 지불할 잔액이 부족합니다. (필요: 최대 ${formatEther(
          feeWei,
        )})`,
      );
    return {
      ...input,
      data,
      feeWei,
      expiresAt: Date.now() + REVOKE_PLAN_TTL_MS,
      transaction: {
        from: input.owner,
        to: input.token.address,
        value: '0',
        data,
        gas: gas.toString(),
        gasPrice: gasPrice.toString(),
      },
    };
  }

  /**
   * 사용자가 검토하고 승인(PIN 등)한 취소 거래를 서명/전파한다.
   * isAuthorized는 화면이 살아 있고 계정/네트워크가 그대로인지 확인한다.
   */
  async submitRevoke(
    plan: RevokePlan,
    isAuthorized: () => boolean,
  ): Promise<string> {
    if (!isAuthorized() || Date.now() >= plan.expiresAt)
      throw new Error(
        '승인이 만료되었거나 계정/네트워크가 변경되었습니다. 다시 확인해주세요.',
      );
    const hash = await signingService.sendTransaction(
      plan.transaction,
      plan.chainId,
      isAuthorized,
    );
    try {
      await transactionCacheService.createLocalTransaction({
        hash,
        chainId: plan.chainId,
        from: plan.owner,
        to: plan.token.address,
        value: '0',
        valueWei: '0',
        gasPrice: plan.transaction.gasPrice ?? '0',
        gasLimit: plan.transaction.gas,
        type: 'approve',
        method: 'approve',
        tokenSymbol: plan.token.symbol,
        tokenAmount: '0',
        tokenAddress: plan.token.address,
      });
    } catch (error) {
      console.warn('Failed to cache revoke transaction:', error);
    }
    transactionTracker.reconcile();
    return hash;
  }
}

export const approvalService = new ApprovalService();
