/**
 * 토큰 잔액 조회 훅
 */

import { useQuery } from '@tanstack/react-query';
import { chainClient } from '../services/chainClient';
import { formatEther } from 'viem';
import { logger } from '../utils/logger';

interface BalanceData {
  wei: bigint;
  formatted: string;
  symbol: string;
}

/**
 * 체인별 네이티브 토큰 심볼 매핑
 */
const NATIVE_TOKEN_SYMBOLS: Record<number, string> = {
  1: 'ETH', // Ethereum 메인넷
  11155111: 'ETH', // Sepolia 테스트넷
  137: 'MATIC', // Polygon
  42161: 'ETH', // Arbitrum One
  10: 'ETH', // Optimism
  8453: 'ETH', // Base
  56: 'BNB', // BNB 체인
  43114: 'AVAX', // Avalanche
};

/**
 * 체인 ID로 네이티브 토큰 심볼 조회
 */
function getNativeTokenSymbol(chainId: number): string {
  return NATIVE_TOKEN_SYMBOLS[chainId] || 'ETH';
}

/**
 * 네이티브 토큰 잔액 조회
 */
export function useBalance(address: string | undefined, chainId: number = 1) {
  return useQuery<BalanceData>({
    queryKey: ['balance', address, chainId],
    queryFn: async () => {
      if (!address) {
        throw new Error('Address is required');
      }

      const client = chainClient.getClient(chainId);
      const balance = await client.getBalance({
        address: address as `0x${string}`,
      });

      return {
        wei: balance,
        formatted: formatEther(balance),
        symbol: getNativeTokenSymbol(chainId),
      };
    },
    enabled: !!address,
    staleTime: 30 * 1000, // 30초 동안 fresh 상태 유지
    refetchInterval: 60 * 1000, // 60초마다 백그라운드 갱신
    refetchIntervalInBackground: false, // 백그라운드에서는 갱신 안함
  });
}

/**
 * ERC20 토큰 잔액 조회
 */
export function useTokenBalance(
  address: string | undefined,
  tokenAddress: string,
  decimals: number = 18,
  chainId: number = 1,
) {
  return useQuery<BalanceData>({
    queryKey: ['tokenBalance', address, tokenAddress, chainId],
    queryFn: async () => {
      if (!address) {
        throw new Error('Address is required');
      }

      const client = chainClient.getClient(chainId);

      const balance = await client.readContract({
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            name: 'balanceOf',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'account', type: 'address' }],
            outputs: [{ name: '', type: 'uint256' }],
          },
        ] as const,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      });

      const formatted = (Number(balance) / Math.pow(10, decimals)).toString();

      return {
        wei: balance,
        formatted,
        symbol: '', // 토큰 심볼은 별도로 조회 필요
      };
    },
    enabled: !!address && !!tokenAddress,
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000,
  });
}

/**
 * 여러 토큰 잔액 일괄 조회
 */
export function useMultipleBalances(
  address: string | undefined,
  tokens: Array<{ address: string; decimals: number; symbol: string }>,
  chainId: number = 1,
) {
  return useQuery<Array<BalanceData & { tokenAddress: string }>>({
    queryKey: ['multipleBalances', address, tokens, chainId],
    queryFn: async () => {
      if (!address) {
        throw new Error('Address is required');
      }

      const client = chainClient.getClient(chainId);

      const balances = await Promise.all(
        tokens.map(async token => {
          try {
            const balance = await client.readContract({
              address: token.address as `0x${string}`,
              abi: [
                {
                  name: 'balanceOf',
                  type: 'function',
                  stateMutability: 'view',
                  inputs: [{ name: 'account', type: 'address' }],
                  outputs: [{ name: '', type: 'uint256' }],
                },
              ] as const,
              functionName: 'balanceOf',
              args: [address as `0x${string}`],
            });

            const formatted = (
              Number(balance) / Math.pow(10, token.decimals)
            ).toString();

            return {
              tokenAddress: token.address,
              wei: balance,
              formatted,
              symbol: token.symbol,
            };
          } catch (error) {
            logger.warn(`Failed to fetch balance for ${token.address}:`, error);
            return {
              tokenAddress: token.address,
              wei: BigInt(0),
              formatted: '0',
              symbol: token.symbol,
            };
          }
        }),
      );

      return balances;
    },
    enabled: !!address && tokens.length > 0,
    staleTime: 10 * 1000,
    refetchInterval: 60 * 1000,
  });
}
