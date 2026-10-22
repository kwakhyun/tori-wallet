import { erc20Abi, formatUnits, isAddress } from 'viem';
import { chainClient } from './chainClient';
import { parseTransferAmount, txService } from './txService';
import type { TransactionParams } from './signingService';

interface TransferInput {
  from: `0x${string}`;
  to: `0x${string}`;
  amount: string;
  chainId: number;
  tokenAddress?: `0x${string}`;
}

export interface TransferPlan extends TransferInput {
  transaction: TransactionParams;
  units: bigint;
  fee: string;
  symbol?: string;
  expiresAt: number;
}

export const transferService = {
  async readToken(
    address: `0x${string}`,
    token: `0x${string}`,
    chainId: number,
  ) {
    if (!isAddress(token)) throw new Error('유효하지 않은 토큰 주소입니다.');
    const client = chainClient.getClient(chainId);
    const [decimals, symbol, balance] = await Promise.all([
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'decimals',
      }),
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'symbol',
      }),
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      }),
    ]);
    return {
      decimals,
      symbol,
      wei: balance,
      formatted: formatUnits(balance, decimals),
    };
  },

  async prepare(input: TransferInput): Promise<TransferPlan> {
    if (!isAddress(input.from) || !isAddress(input.to))
      throw new Error('유효하지 않은 주소입니다.');
    if (input.from.toLowerCase() === input.to.toLowerCase())
      throw new Error('자기 자신에게 전송할 수 없습니다.');
    const client = chainClient.getClient(input.chainId);
    const [nativeBalance, token] = await Promise.all([
      client.getBalance({ address: input.from }),
      input.tokenAddress
        ? this.readToken(input.from, input.tokenAddress, input.chainId)
        : undefined,
    ]);
    const units = parseTransferAmount(input.amount, token?.decimals ?? 18);
    if (units > (token?.wei ?? nativeBalance))
      throw new Error('잔액이 부족합니다.');
    const transaction =
      input.tokenAddress && token
        ? txService.createTokenTransferRequest(
            input.from,
            input.to,
            input.tokenAddress,
            input.amount,
            token.decimals,
          )
        : { to: input.to, value: units, data: undefined };
    const estimate =
      input.tokenAddress && token
        ? await txService.estimateTokenTransfer(
            input.from,
            input.to,
            input.tokenAddress,
            input.amount,
            token.decimals,
            input.chainId,
          )
        : await txService.estimateTransaction({
            from: input.from,
            to: input.to,
            value: input.amount,
            chainId: input.chainId,
          });
    if (nativeBalance < transaction.value + estimate.estimatedFeeWei)
      throw new Error('전송 수수료를 지불할 잔액이 부족합니다.');
    return {
      ...input,
      units,
      symbol: token?.symbol,
      fee: estimate.estimatedFee,
      expiresAt: Date.now() + 90_000,
      transaction: {
        ...transaction,
        from: input.from,
        value: transaction.value.toString(),
        gas: estimate.gasLimit.toString(),
        gasPrice: estimate.gasPrice.toString(),
      },
    };
  },
};
