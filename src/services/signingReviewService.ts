import { isAddress } from 'viem';
import { chainClient } from './chainClient';
import {
  collectTokenAddresses,
  getKnownToken,
  type SigningRequestInput,
  type TokenMetadata,
} from './signingIntentService';
import type { TransactionParams } from './signingService';

const TOKEN_METADATA_TIMEOUT_MS = 5000;

const ERC20_METADATA_ABI = [
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function sanitizeSymbol(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[^\x20-\x7E]/g, '').trim();
  return cleaned ? cleaned.slice(0, 12) : undefined;
}

/**
 * 승인/전송/Permit 수량을 소수점 단위로 보여주기 위해 토큰 decimals/symbol을 읽는다.
 * 내장 신뢰 목록에 있는 토큰은 조회하지 않는다. 조회에 실패하면 원시 단위로 표시된다.
 */
export async function resolveTokenMetadata(
  input: SigningRequestInput,
): Promise<Record<string, TokenMetadata> | undefined> {
  const addresses = collectTokenAddresses(input).filter(
    address => !getKnownToken(input.chainId, address),
  );
  if (addresses.length === 0) return undefined;
  const result: Record<string, TokenMetadata> = {};
  await Promise.all(
    addresses.slice(0, 6).map(async address => {
      try {
        const client = chainClient.getClient(input.chainId);
        const contract = { address: address as `0x${string}` };
        const [decimals, symbol] = await withTimeout(
          Promise.all([
            client.readContract({
              ...contract,
              abi: ERC20_METADATA_ABI,
              functionName: 'decimals',
            }),
            client
              .readContract({
                ...contract,
                abi: ERC20_METADATA_ABI,
                functionName: 'symbol',
              })
              .catch(() => undefined),
          ]),
          TOKEN_METADATA_TIMEOUT_MS,
        );
        const value = Number(decimals);
        if (!Number.isInteger(value) || value < 0 || value > 36) return;
        result[address] = { decimals: value, symbol: sanitizeSymbol(symbol) };
      } catch {
        // NFT 등 decimals가 없는 컨트랙트는 원시 단위로 표시한다.
      }
    }),
  );
  return Object.keys(result).length > 0 ? result : undefined;
}

/** 표시한 수수료 상한을 그대로 서명하도록 누락된 가스 필드를 검토 전에 확정한다. */
export async function prepareSigningRequest(
  input: SigningRequestInput,
): Promise<SigningRequestInput> {
  const snapshot: SigningRequestInput = JSON.parse(JSON.stringify(input));
  if (!['eth_sendTransaction', 'eth_signTransaction'].includes(input.method)) {
    if (input.method.startsWith('eth_signTypedData')) {
      const tokenMetadata = await resolveTokenMetadata(snapshot);
      if (tokenMetadata) snapshot.tokenMetadata = tokenMetadata;
    }
    return snapshot;
  }
  const tx = snapshot.params[0] as TransactionParams;
  if (!tx?.from || !isAddress(tx.from) || !tx.to || !isAddress(tx.to)) {
    throw new Error('트랜잭션 주소가 올바르지 않습니다.');
  }
  if (
    tx.gasPrice !== undefined &&
    (tx.maxFeePerGas !== undefined || tx.maxPriorityFeePerGas !== undefined)
  ) {
    throw new Error('서로 다른 수수료 형식을 함께 지정할 수 없습니다.');
  }
  const client = chainClient.getClient(input.chainId);
  const referenceGasPrice = await client.getGasPrice();
  if (referenceGasPrice <= 0n)
    throw new Error('네트워크 수수료를 확인할 수 없습니다.');
  if (!tx.gas) {
    const gas = await client.estimateGas({
      account: tx.from as `0x${string}`,
      to: tx.to as `0x${string}`,
      value: BigInt(tx.value || '0'),
      data: tx.data as `0x${string}` | undefined,
    });
    tx.gas = ((gas * 120n) / 100n).toString();
  }
  if (tx.gasPrice === undefined && tx.maxFeePerGas === undefined) {
    const fees = await client.estimateFeesPerGas();
    tx.maxFeePerGas = fees.maxFeePerGas.toString();
    tx.maxPriorityFeePerGas =
      tx.maxPriorityFeePerGas ?? fees.maxPriorityFeePerGas.toString();
  }
  if (snapshot.method === 'eth_signTransaction' && tx.nonce === undefined) {
    tx.nonce = (
      await client.getTransactionCount({
        address: tx.from as `0x${string}`,
        blockTag: 'pending',
      })
    ).toString();
  }
  const tokenMetadata = await resolveTokenMetadata(snapshot);
  if (tokenMetadata) snapshot.tokenMetadata = tokenMetadata;
  snapshot.referenceGasPrice = referenceGasPrice.toString();
  return snapshot;
}
