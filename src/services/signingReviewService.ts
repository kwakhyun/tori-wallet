import { isAddress } from 'viem';
import { chainClient } from './chainClient';
import type { SigningRequestInput } from './signingIntentService';
import type { TransactionParams } from './signingService';

/** 표시한 수수료 상한을 그대로 서명하도록 누락된 가스 필드를 검토 전에 확정한다. */
export async function prepareSigningRequest(
  input: SigningRequestInput,
): Promise<SigningRequestInput> {
  const snapshot: SigningRequestInput = JSON.parse(JSON.stringify(input));
  if (!['eth_sendTransaction', 'eth_signTransaction'].includes(input.method))
    return snapshot;
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
  snapshot.referenceGasPrice = referenceGasPrice.toString();
  return snapshot;
}
