/**
 * Tori Wallet - useSwap Hook
 * 토큰 스왑 기능을 위한 커스텀 훅
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseUnits, erc20Abi } from 'viem';

import { useWalletStore } from '@/store/walletStore';
import { swapService, SwapToken, SwapQuote } from '@/services/swapService';
import { signingService } from '@/services/signingService';
import { chainClient } from '@/services/chainClient';

interface UseSwapOptions {
  onSuccess?: (txHash: string) => void;
  onError?: (error: Error) => void;
}

export function useSwap(options?: UseSwapOptions) {
  const queryClient = useQueryClient();
  const { wallets, activeWalletIndex, activeNetworkChainId } = useWalletStore();
  const activeWallet = wallets[activeWalletIndex];

  // 상태
  const [sellToken, setSellToken] = useState<SwapToken | null>(null);
  const [buyToken, setBuyToken] = useState<SwapToken | null>(null);
  const [sellAmount, setSellAmount] = useState('');
  const [slippage, setSlippage] = useState(0.5);

  // 토큰 목록
  const tokens = useMemo(() => {
    return swapService.getTokens(activeNetworkChainId);
  }, [activeNetworkChainId]);

  // 스왑 지원 여부
  const isSwapSupported = useMemo(() => {
    return swapService.isSwapSupported(activeNetworkChainId);
  }, [activeNetworkChainId]);

  // 초기 토큰 설정
  useEffect(() => {
    if (tokens.length >= 2) {
      setSellToken(tokens[0]);
      setBuyToken(tokens[1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNetworkChainId]);

  // 가격 조회
  const {
    data: priceData,
    isLoading: isLoadingPrice,
    refetch: refetchPrice,
  } = useQuery({
    queryKey: [
      'swapPrice',
      sellToken?.address,
      buyToken?.address,
      sellAmount,
      activeNetworkChainId,
    ],
    queryFn: async () => {
      if (!sellToken || !buyToken || !sellAmount || !activeWallet) {
        return null;
      }
      return swapService.getPrice(
        {
          sellToken,
          buyToken,
          sellAmount,
          takerAddress: activeWallet.address,
        },
        activeNetworkChainId,
      );
    },
    enabled:
      !!sellToken &&
      !!buyToken &&
      !!sellAmount &&
      parseFloat(sellAmount) > 0 &&
      !!activeWallet &&
      isSwapSupported,
    staleTime: 10000, // 10초
    refetchInterval: 15000, // 15초마다 갱신
  });

  // 견적 조회
  const getQuote = useCallback(async (): Promise<SwapQuote | null> => {
    if (!sellToken || !buyToken || !sellAmount || !activeWallet) {
      return null;
    }

    try {
      return await swapService.getQuote(
        {
          sellToken,
          buyToken,
          sellAmount,
          slippagePercentage: slippage,
          takerAddress: activeWallet.address,
        },
        activeNetworkChainId,
      );
    } catch (error) {
      console.error('Failed to get quote:', error);
      throw error;
    }
  }, [
    sellToken,
    buyToken,
    sellAmount,
    slippage,
    activeWallet,
    activeNetworkChainId,
  ]);

  // 토큰 승인 확인 및 실행
  const checkAndApproveToken = useCallback(
    async (quote: SwapQuote): Promise<boolean> => {
      if (!sellToken || !activeWallet) return false;

      // 네이티브 토큰은 승인 불필요
      if (!swapService.needsApproval(sellToken)) {
        return true;
      }

      try {
        const client = chainClient.getClient(activeNetworkChainId);

        // 현재 승인량 확인
        const allowance = await client.readContract({
          address: sellToken.address as `0x${string}`,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [
            activeWallet.address as `0x${string}`,
            quote.allowanceTarget as `0x${string}`,
          ],
        });

        const requiredAmount = parseUnits(sellAmount, sellToken.decimals);

        if (allowance >= requiredAmount) {
          return true;
        }

        // 승인 확인
        const approved = await new Promise<boolean>(resolve => {
          Alert.alert(
            '토큰 승인 필요',
            `${sellToken.symbol} 토큰을 스왑하려면 먼저 승인이 필요합니다.`,
            [
              { text: '취소', onPress: () => resolve(false), style: 'cancel' },
              { text: '승인', onPress: () => resolve(true) },
            ],
          );
        });

        if (!approved) return false;

        // 승인 트랜잭션 실행
        const approveTxHash = await signingService.sendTransaction(
          {
            from: activeWallet.address,
            to: sellToken.address,
            data: `0x095ea7b3${quote.allowanceTarget
              .slice(2)
              .padStart(64, '0')}${'f'.repeat(64)}`,
          },
          activeNetworkChainId,
        );

        if (approveTxHash) {
          const receipt = await client.waitForTransactionReceipt({
            hash: approveTxHash as `0x${string}`,
          });
          return receipt.status === 'success';
        }

        return false;
      } catch (error) {
        console.error('Approval error:', error);
        return false;
      }
    },
    [sellToken, sellAmount, activeWallet, activeNetworkChainId],
  );

  // 스왑 실행 뮤테이션
  const swapMutation = useMutation({
    mutationFn: async () => {
      if (!activeWallet) {
        throw new Error('지갑을 찾을 수 없습니다');
      }

      // 1. 견적 가져오기
      const quote = await getQuote();
      if (!quote) {
        throw new Error('견적을 가져올 수 없습니다');
      }

      // 2. 토큰 승인 확인
      const approved = await checkAndApproveToken(quote);
      if (!approved) {
        throw new Error('토큰 승인이 취소되었습니다');
      }

      // 3. 스왑 트랜잭션 실행
      const txHash = await signingService.sendTransaction(
        {
          from: activeWallet.address,
          to: quote.to,
          data: quote.data,
          value: quote.value,
          gas: quote.gas,
          gasPrice: quote.gasPrice,
        },
        activeNetworkChainId,
      );

      return txHash;
    },
    onSuccess: txHash => {
      // 잔액 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['tokenBalances'] });

      options?.onSuccess?.(txHash);
    },
    onError: error => {
      options?.onError?.(error as Error);
    },
  });

  // 토큰 스왑 (위치 교환)
  const swapTokenPositions = useCallback(() => {
    const temp = sellToken;
    setSellToken(buyToken);
    setBuyToken(temp);
    setSellAmount(priceData?.buyAmount || '');
  }, [sellToken, buyToken, priceData]);

  // 토큰 선택
  const selectSellToken = useCallback(
    (token: SwapToken) => {
      if (token.address === buyToken?.address) {
        setBuyToken(sellToken);
      }
      setSellToken(token);
    },
    [buyToken, sellToken],
  );

  const selectBuyToken = useCallback(
    (token: SwapToken) => {
      if (token.address === sellToken?.address) {
        setSellToken(buyToken);
      }
      setBuyToken(token);
    },
    [sellToken, buyToken],
  );

  // 스왑 가능 여부
  const canSwap = useMemo(() => {
    return (
      isSwapSupported &&
      sellToken &&
      buyToken &&
      sellAmount &&
      parseFloat(sellAmount) > 0 &&
      priceData?.buyAmount &&
      parseFloat(priceData.buyAmount) > 0 &&
      !swapMutation.isPending
    );
  }, [
    isSwapSupported,
    sellToken,
    buyToken,
    sellAmount,
    priceData,
    swapMutation.isPending,
  ]);

  // 가격 정보
  const priceInfo = useMemo(() => {
    if (!sellToken || !buyToken || !sellAmount || !priceData?.buyAmount) {
      return null;
    }
    const rate = parseFloat(priceData.buyAmount) / parseFloat(sellAmount);
    return {
      rate: `1 ${sellToken.symbol} = ${rate.toFixed(6)} ${buyToken.symbol}`,
      buyAmount: priceData.buyAmount,
    };
  }, [sellToken, buyToken, sellAmount, priceData]);

  return {
    // 토큰 관련
    tokens,
    sellToken,
    buyToken,
    setSellToken: selectSellToken,
    setBuyToken: selectBuyToken,
    swapTokenPositions,

    // 금액 관련
    sellAmount,
    setSellAmount,
    buyAmount: priceData?.buyAmount || '',

    // 슬리피지
    slippage,
    setSlippage,

    // 상태
    isSwapSupported,
    isLoadingPrice,
    isSwapping: swapMutation.isPending,
    canSwap,

    // 가격 정보
    priceInfo,
    refetchPrice,

    // 액션
    executeSwap: swapMutation.mutateAsync,
    getQuote,
  };
}
