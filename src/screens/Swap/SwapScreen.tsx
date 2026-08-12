/**
 * 토큰 스왑 화면
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  StatusBar,
  ScrollView,
  Alert,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import styled from 'styled-components/native';
import { useTheme } from '@/hooks/useTheme';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  isAddress,
  parseUnits,
} from 'viem';

import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useWalletStore } from '@/store/walletStore';
import { useSwapStore } from '@/store/swapStore';
import { useSecurityStore } from '@/store/securityStore';
import { useBalance, useTokenBalance } from '@/hooks/useBalance';
import { swapService, SwapToken, SwapQuote } from '@/services/swapService';
import { enhancedSwapService } from '@/services/enhancedSwapService';
import { signingService } from '@/services/signingService';
import { chainClient } from '@/services/chainClient';
import { transactionCacheService } from '@/realm/services';
import { SwapReviewModal, SwapSettingsModal } from '@/components/swap';
import PinConfirmModal from '@/components/common/PinConfirmModal';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function SwapScreen(): React.JSX.Element {
  const { isDarkMode } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { wallets, activeWalletIndex, activeNetworkChainId, networks } =
    useWalletStore();

  const activeWallet = wallets[activeWalletIndex];
  const activeNetwork = networks.find(n => n.chainId === activeNetworkChainId);

  // 토큰 목록
  const tokens = useMemo(() => {
    return swapService.getTokens(activeNetworkChainId);
  }, [activeNetworkChainId]);

  // 스왑 지원 여부
  const isSwapSupported = swapService.isSwapSupported(activeNetworkChainId);

  // 상태
  const [sellToken, setSellToken] = useState<SwapToken | null>(
    tokens[0] || null,
  );
  const [buyToken, setBuyToken] = useState<SwapToken | null>(tokens[1] || null);
  const [sellAmount, setSellAmount] = useState('');
  const [buyAmount, setBuyAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [slippage, setSlippage] = useState(0.5);
  const [showTokenSelector, setShowTokenSelector] = useState<
    'sell' | 'buy' | null
  >(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showPinConfirmModal, setShowPinConfirmModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [priceImpact, setPriceImpact] = useState<{
    percent: string;
    level: 'low' | 'medium' | 'high' | 'critical';
  }>({ percent: '0', level: 'low' });

  // 스왑 스토어
  const { addHistoryItem, updateHistoryStatus, addFavoritePair, getTopPairs } =
    useSwapStore();
  const { requiresTransactionPin } = useSecurityStore();

  // 잔액 조회 (네이티브 토큰)
  const { data: nativeBalance } = useBalance(
    activeWallet?.address,
    activeNetworkChainId,
  );

  // ERC-20 토큰 잔액 조회
  const sellTokenIsNative =
    sellToken?.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
  const { data: sellTokenBalance } = useTokenBalance(
    !sellTokenIsNative ? activeWallet?.address : undefined,
    sellToken?.address || '',
    sellToken?.decimals || 18,
    activeNetworkChainId,
  );

  // 토큰 변경시 초기화
  useEffect(() => {
    if (tokens.length >= 2) {
      setSellToken(tokens[0]);
      setBuyToken(tokens[1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNetworkChainId]);

  // 가격 조회 함수
  const fetchPrice = useCallback(async () => {
    if (!sellToken || !buyToken || !sellAmount || !activeWallet) return;

    setIsLoadingQuote(true);
    try {
      const priceData = await swapService.getPrice(
        {
          sellToken,
          buyToken,
          sellAmount,
          takerAddress: activeWallet.address,
        },
        activeNetworkChainId,
      );

      if (priceData) {
        setBuyAmount(priceData.buyAmount);
      }
    } catch (error) {
      console.error('Price fetch error:', error);
    } finally {
      setIsLoadingQuote(false);
    }
  }, [sellToken, buyToken, sellAmount, activeWallet, activeNetworkChainId]);

  // 가격 조회 (디바운스)
  useEffect(() => {
    if (
      !sellToken ||
      !buyToken ||
      !sellAmount ||
      parseFloat(sellAmount) === 0
    ) {
      setBuyAmount('');
      setQuote(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      await fetchPrice();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [sellToken, buyToken, sellAmount, fetchPrice]);

  const fetchQuote = async (): Promise<SwapQuote | null> => {
    if (!sellToken || !buyToken || !sellAmount || !activeWallet) return null;

    try {
      const quoteData = await swapService.getQuote(
        {
          sellToken,
          buyToken,
          sellAmount,
          slippagePercentage: slippage,
          takerAddress: activeWallet.address,
        },
        activeNetworkChainId,
      );

      setQuote(quoteData);
      if (quoteData) {
        setBuyAmount(
          formatUnits(BigInt(quoteData.buyAmount), buyToken.decimals),
        );
      }
      return quoteData;
    } catch (error) {
      console.error('Quote fetch error:', error);
      Alert.alert('오류', '견적을 가져오는데 실패했습니다.');
      return null;
    }
  };

  // 토큰 위치 스왑
  const handleSwapTokens = useCallback(() => {
    const temp = sellToken;
    setSellToken(buyToken);
    setBuyToken(temp);
    setSellAmount(buyAmount);
    setBuyAmount(sellAmount);
  }, [sellToken, buyToken, sellAmount, buyAmount]);

  // 토큰 선택
  const handleSelectToken = useCallback(
    (token: SwapToken) => {
      if (showTokenSelector === 'sell') {
        if (token.address === buyToken?.address) {
          // 같은 토큰 선택시 스왑
          setBuyToken(sellToken);
        }
        setSellToken(token);
      } else if (showTokenSelector === 'buy') {
        if (token.address === sellToken?.address) {
          // 같은 토큰 선택시 스왑
          setSellToken(buyToken);
        }
        setBuyToken(token);
      }
      setShowTokenSelector(null);
    },
    [showTokenSelector, sellToken, buyToken],
  );

  // 최대값 설정
  const handleSetMax = useCallback(() => {
    if (sellToken) {
      if (sellTokenIsNative && nativeBalance?.formatted) {
        // 네이티브 토큰: 가스비를 위해 약간 남김
        const maxAmount = Math.max(
          0,
          parseFloat(nativeBalance.formatted) - 0.01,
        );
        setSellAmount(maxAmount.toString());
      } else if (!sellTokenIsNative && sellTokenBalance?.formatted) {
        // ERC-20 토큰: 전체 잔액 사용 가능
        setSellAmount(sellTokenBalance.formatted);
      }
    }
  }, [sellToken, sellTokenIsNative, nativeBalance, sellTokenBalance]);

  // 스왑 실행 (리뷰 모달에서 확인 후 호출)
  const handleSwap = async () => {
    if (!sellToken || !buyToken || !sellAmount || !activeWallet) return;

    setIsLoadingQuote(true);
    try {
      const latestQuote = await fetchQuote();
      if (!latestQuote) return;

      const impact = enhancedSwapService.calculatePriceImpact(latestQuote);
      setPriceImpact(impact);
      setShowReviewModal(true);
    } finally {
      setIsLoadingQuote(false);
    }
  };

  // 리뷰 모달에서 확인 후 실행
  const handleConfirmSwap = () => {
    setShowReviewModal(false);
    if (requiresTransactionPin()) {
      setShowPinConfirmModal(true);
      return;
    }
    executeSwapTransaction();
  };

  const handlePinConfirmed = () => {
    setShowPinConfirmModal(false);
    executeSwapTransaction();
  };

  // 실제 스왑 트랜잭션 실행
  const executeSwapTransaction = async () => {
    if (!sellToken || !buyToken || !sellAmount || !activeWallet || !quote) {
      return;
    }

    setIsSwapping(true);
    try {
      // 사용자가 검토한 견적과 현재 의도를 다시 바인딩한다. 승인 후 새 견적을
      // 조용히 받아 실행하지 않으며, 변경/만료 시 처음부터 다시 검토한다.
      const swapQuote = quote;
      const currentIntent = {
        sellToken,
        buyToken,
        sellAmount,
        slippagePercentage: slippage,
        takerAddress: activeWallet.address,
      };
      swapService.assertQuoteMatchesIntent(
        swapQuote,
        currentIntent,
        activeNetworkChainId,
      );

      // 2. ERC-20 토큰인 경우 승인 필요 여부 확인
      if (swapService.needsApproval(sellToken)) {
        const approved = await checkAndApproveToken(swapQuote);
        if (!approved) {
          setIsSwapping(false);
          return;
        }
      }

      // 3. 스왑 트랜잭션 실행
      swapService.assertQuoteMatchesIntent(
        swapQuote,
        currentIntent,
        activeNetworkChainId,
      );
      const txHash = await executeSwap(swapQuote);

      if (txHash) {
        const confirmedBuyAmount = formatUnits(
          BigInt(swapQuote.buyAmount),
          buyToken.decimals,
        );
        const rate = (
          parseFloat(confirmedBuyAmount) / parseFloat(sellAmount)
        ).toFixed(6);
        const historyId = addHistoryItem({
          timestamp: Date.now(),
          chainId: activeNetworkChainId,
          sellToken: {
            symbol: sellToken.symbol,
            address: sellToken.address,
            amount: sellAmount,
          },
          buyToken: {
            symbol: buyToken.symbol,
            address: buyToken.address,
            amount: confirmedBuyAmount,
          },
          txHash,
          status: 'pending',
          rate,
        });

        try {
          await transactionCacheService.createLocalTransaction({
            hash: txHash,
            chainId: activeNetworkChainId,
            from: activeWallet.address,
            to: swapQuote.to,
            value: swapQuote.value,
            valueWei: swapQuote.value,
            gasPrice: swapQuote.gasPrice,
            gasLimit: swapQuote.gas,
            type: 'swap',
            tokenSymbol: sellToken.symbol,
            tokenAmount: sellAmount,
          });
        } catch (cacheError) {
          console.warn('Failed to cache pending swap:', cacheError);
        }

        const client = chainClient.getClient(activeNetworkChainId);
        client
          .waitForTransactionReceipt({ hash: txHash as `0x${string}` })
          .then(async receipt => {
            const succeeded = receipt.status === 'success';
            updateHistoryStatus(historyId, succeeded ? 'success' : 'failed');
            await transactionCacheService.updateStatus(
              txHash,
              activeNetworkChainId,
              succeeded
                ? {
                    status: 'confirmed',
                    blockNumber: receipt.blockNumber.toString(),
                    gasUsed: receipt.gasUsed.toString(),
                    confirmedAt: new Date(),
                  }
                : { status: 'failed' },
            );

            if (succeeded) {
              addFavoritePair({
                chainId: activeNetworkChainId,
                sellTokenAddress: sellToken.address,
                sellTokenSymbol: sellToken.symbol,
                buyTokenAddress: buyToken.address,
                buyTokenSymbol: buyToken.symbol,
              });
            }
          })
          .catch(async error => {
            updateHistoryStatus(historyId, 'failed');
            await transactionCacheService.updateStatus(
              txHash,
              activeNetworkChainId,
              {
                status: 'failed',
                errorMessage:
                  error instanceof Error ? error.message : 'Receipt failed',
              },
            );
          });

        Alert.alert(
          '스왑 제출 완료',
          `트랜잭션이 네트워크에 제출되었습니다. 체인 확정 전까지는 대기 상태로 표시됩니다.\n\n트랜잭션: ${txHash.slice(
            0,
            10,
          )}...`,
          [
            {
              text: '확인',
              onPress: () => {
                setSellAmount('');
                setBuyAmount('');
                setQuote(null);
              },
            },
          ],
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : '스왑 중 오류가 발생했습니다.';
      Alert.alert('스왑 실패', errorMessage);
    } finally {
      setIsSwapping(false);
    }
  };

  // 토큰 승인 확인 및 실행
  const checkAndApproveToken = async (
    swapQuote: SwapQuote,
  ): Promise<boolean> => {
    if (!sellToken || !activeWallet) return false;

    try {
      const client = chainClient.getClient(activeNetworkChainId);

      if (!isAddress(swapQuote.allowanceTarget)) {
        throw new Error('유효하지 않은 승인 대상 주소입니다.');
      }

      // 현재 승인량 확인
      const allowance = await client.readContract({
        address: sellToken.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [
          activeWallet.address as `0x${string}`,
          swapQuote.allowanceTarget as `0x${string}`,
        ],
      });

      const requiredAmount = parseUnits(sellAmount, sellToken.decimals);

      if (allowance >= requiredAmount) {
        // 이미 충분히 승인됨
        return true;
      }

      // 승인 필요
      const approveConfirmed = await new Promise<boolean>(resolve => {
        Alert.alert(
          '토큰 승인 필요',
          `${sellAmount} ${sellToken.symbol}만 승인합니다.\n\n승인 대상:\n${swapQuote.allowanceTarget}`,
          [
            { text: '취소', onPress: () => resolve(false), style: 'cancel' },
            { text: '승인', onPress: () => resolve(true) },
          ],
        );
      });

      if (!approveConfirmed) return false;

      const approvalData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [swapQuote.allowanceTarget as `0x${string}`, requiredAmount],
      });
      const approveTxHash = await signingService.sendTransaction(
        {
          from: activeWallet.address,
          to: sellToken.address,
          data: approvalData,
        },
        activeNetworkChainId,
      );

      if (approveTxHash) {
        await transactionCacheService.createLocalTransaction({
          hash: approveTxHash,
          chainId: activeNetworkChainId,
          from: activeWallet.address,
          to: sellToken.address,
          value: '0',
          valueWei: '0',
          gasPrice: '0',
          type: 'approve',
          tokenSymbol: sellToken.symbol,
          tokenAmount: sellAmount,
          tokenAddress: sellToken.address,
          method: 'approve',
        });

        const receipt = await client.waitForTransactionReceipt({
          hash: approveTxHash as `0x${string}`,
        });
        await transactionCacheService.updateStatus(
          approveTxHash,
          activeNetworkChainId,
          receipt.status === 'success'
            ? {
                status: 'confirmed',
                blockNumber: receipt.blockNumber.toString(),
                gasUsed: receipt.gasUsed.toString(),
                confirmedAt: new Date(),
              }
            : { status: 'failed' },
        );
        return receipt.status === 'success';
      }

      return false;
    } catch (error) {
      console.error('Approval error:', error);
      Alert.alert('승인 실패', '토큰 승인 중 오류가 발생했습니다.');
      return false;
    }
  };

  // 스왑 트랜잭션 실행
  const executeSwap = async (swapQuote: SwapQuote): Promise<string | null> => {
    if (!activeWallet) return null;

    try {
      if (!isAddress(swapQuote.to) || !swapQuote.data.startsWith('0x')) {
        throw new Error('스왑 견적에 유효하지 않은 트랜잭션이 포함되었습니다.');
      }

      const client = chainClient.getClient(activeNetworkChainId);
      await client.estimateGas({
        account: activeWallet.address as `0x${string}`,
        to: swapQuote.to as `0x${string}`,
        data: swapQuote.data as `0x${string}`,
        value: BigInt(swapQuote.value || '0'),
      });

      const txHash = await signingService.sendTransaction(
        {
          from: activeWallet.address,
          to: swapQuote.to,
          data: swapQuote.data,
          value: swapQuote.value,
          gas: swapQuote.gas,
          gasPrice: swapQuote.gasPrice,
        },
        activeNetworkChainId,
      );

      return txHash;
    } catch (error) {
      console.error('Execute swap error:', error);
      throw error;
    }
  };

  // 스왑 가능 여부
  const canSwap = useMemo(() => {
    return (
      isSwapSupported &&
      sellToken &&
      buyToken &&
      sellAmount &&
      parseFloat(sellAmount) > 0 &&
      buyAmount &&
      parseFloat(buyAmount) > 0 &&
      !isLoadingQuote &&
      !isSwapping
    );
  }, [
    isSwapSupported,
    sellToken,
    buyToken,
    sellAmount,
    buyAmount,
    isLoadingQuote,
    isSwapping,
  ]);

  // 가격 정보 표시
  const priceInfo = useMemo(() => {
    if (!sellToken || !buyToken || !sellAmount || !buyAmount) return null;
    const rate = parseFloat(buyAmount) / parseFloat(sellAmount);
    return `1 ${sellToken.symbol} = ${rate.toFixed(6)} ${buyToken.symbol}`;
  }, [sellToken, buyToken, sellAmount, buyAmount]);

  // 토큰 선택 모달
  const renderTokenSelector = () => (
    <Modal
      visible={showTokenSelector !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowTokenSelector(null)}
    >
      <ModalContainer>
        <ModalHeader>
          <ModalTitle>토큰 선택</ModalTitle>
          <CloseButton onPress={() => setShowTokenSelector(null)}>
            <CloseButtonText>✕</CloseButtonText>
          </CloseButton>
        </ModalHeader>

        <FlatList
          data={tokens}
          keyExtractor={item => item.address}
          renderItem={({ item }) => (
            <TokenItem onPress={() => handleSelectToken(item)}>
              {item.logoUrl && <TokenLogo source={{ uri: item.logoUrl }} />}
              <TokenInfo>
                <TokenSymbol>{item.symbol}</TokenSymbol>
                <TokenName>{item.name}</TokenName>
              </TokenInfo>
            </TokenItem>
          )}
        />
      </ModalContainer>
    </Modal>
  );

  // 스왑 미지원 네트워크
  if (!isSwapSupported) {
    return (
      <Container>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <SafeContainer>
          <Header>
            <BackButton onPress={() => navigation.goBack()}>
              <BackButtonText>←</BackButtonText>
            </BackButton>
            <HeaderTitle>토큰 스왑</HeaderTitle>
            <HeaderSpacer />
          </Header>

          <UnsupportedContainer>
            <UnsupportedIcon>🔄</UnsupportedIcon>
            <UnsupportedTitle>스왑 미지원 네트워크</UnsupportedTitle>
            <UnsupportedText>
              {activeNetwork?.name || '현재 네트워크'}에서는 스왑 기능을 사용할
              수 없습니다.
            </UnsupportedText>
            <UnsupportedText>
              Ethereum, Polygon, Arbitrum, Optimism, Base에서 사용 가능합니다.
            </UnsupportedText>
          </UnsupportedContainer>
        </SafeContainer>
      </Container>
    );
  }

  return (
    <Container>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <SafeContainer>
        <Header>
          <BackButton onPress={() => navigation.goBack()}>
            <BackButtonText>←</BackButtonText>
          </BackButton>
          <HeaderTitle>토큰 스왑</HeaderTitle>
          <HeaderButtons>
            <HeaderIconButton
              onPress={() => navigation.navigate('SwapHistory' as never)}
            >
              <HeaderIconText>📋</HeaderIconText>
            </HeaderIconButton>
            <HeaderIconButton onPress={() => setShowSettingsModal(true)}>
              <HeaderIconText>⚙️</HeaderIconText>
            </HeaderIconButton>
          </HeaderButtons>
        </Header>

        {/* 즐겨찾기 토큰 페어 */}
        {getTopPairs(activeNetworkChainId, 3).length > 0 && (
          <FavoritePairsContainer>
            <FavoritePairsLabel>자주 사용하는 페어</FavoritePairsLabel>
            <FavoritePairsRow>
              {getTopPairs(activeNetworkChainId, 3).map(pair => (
                <FavoritePairChip
                  key={pair.id}
                  onPress={() => {
                    const sell = tokens.find(
                      t =>
                        t.address.toLowerCase() ===
                        pair.sellTokenAddress.toLowerCase(),
                    );
                    const buy = tokens.find(
                      t =>
                        t.address.toLowerCase() ===
                        pair.buyTokenAddress.toLowerCase(),
                    );
                    if (sell) setSellToken(sell);
                    if (buy) setBuyToken(buy);
                  }}
                >
                  <FavoritePairText>
                    {pair.sellTokenSymbol} → {pair.buyTokenSymbol}
                  </FavoritePairText>
                </FavoritePairChip>
              ))}
            </FavoritePairsRow>
          </FavoritePairsContainer>
        )}

        <ScrollView>
          <Content>
            {/* 네트워크 정보 */}
            <NetworkBadge>
              <NetworkDot $isMainnet={!activeNetwork?.isTestnet} />
              <NetworkText>{activeNetwork?.name}</NetworkText>
            </NetworkBadge>

            {/* 메인넷 경고 */}
            {!activeNetwork?.isTestnet && (
              <MainnetWarningBox>
                <WarningIcon>⚠️</WarningIcon>
                <WarningText>
                  실제 자산이 사용됩니다. 거래 전 신중히 확인하세요.
                </WarningText>
              </MainnetWarningBox>
            )}

            {/* Sell Token */}
            <SwapCard>
              <CardLabel>보내는 토큰</CardLabel>
              <TokenRow>
                <TokenSelector onPress={() => setShowTokenSelector('sell')}>
                  {sellToken?.logoUrl && (
                    <SmallTokenLogo source={{ uri: sellToken.logoUrl }} />
                  )}
                  <TokenSelectorText>
                    {sellToken?.symbol || '선택'}
                  </TokenSelectorText>
                  <TokenSelectorArrow>▼</TokenSelectorArrow>
                </TokenSelector>
                <AmountInput
                  value={sellAmount}
                  onChangeText={setSellAmount}
                  placeholder="0.0"
                  placeholderTextColor="#666"
                  keyboardType="decimal-pad"
                />
              </TokenRow>
              <BalanceRow>
                <BalanceText>
                  잔액:{' '}
                  {nativeBalance?.formatted
                    ? parseFloat(nativeBalance.formatted).toFixed(4)
                    : '0'}{' '}
                  {sellToken?.symbol}
                </BalanceText>
                <MaxButton onPress={handleSetMax}>
                  <MaxButtonText>MAX</MaxButtonText>
                </MaxButton>
              </BalanceRow>
            </SwapCard>

            {/* Swap Button */}
            <SwapArrowButton onPress={handleSwapTokens}>
              <SwapArrowText>⇅</SwapArrowText>
            </SwapArrowButton>

            {/* Buy Token */}
            <SwapCard>
              <CardLabel>받는 토큰</CardLabel>
              <TokenRow>
                <TokenSelector onPress={() => setShowTokenSelector('buy')}>
                  {buyToken?.logoUrl && (
                    <SmallTokenLogo source={{ uri: buyToken.logoUrl }} />
                  )}
                  <TokenSelectorText>
                    {buyToken?.symbol || '선택'}
                  </TokenSelectorText>
                  <TokenSelectorArrow>▼</TokenSelectorArrow>
                </TokenSelector>
                <AmountDisplay>
                  {isLoadingQuote ? (
                    <ActivityIndicator color="#6366F1" size="small" />
                  ) : (
                    buyAmount || '0.0'
                  )}
                </AmountDisplay>
              </TokenRow>
            </SwapCard>

            {/* 슬리피지 설정 */}
            <SlippageSection>
              <SlippageLabel>슬리피지 허용치</SlippageLabel>
              <SlippageOptions>
                {[0.1, 0.5, 1.0, 3.0].map(value => (
                  <SlippageOption
                    key={value}
                    $isSelected={slippage === value}
                    onPress={() => setSlippage(value)}
                  >
                    <SlippageOptionText $isSelected={slippage === value}>
                      {value}%
                    </SlippageOptionText>
                  </SlippageOption>
                ))}
              </SlippageOptions>
            </SlippageSection>

            {/* 가격 정보 */}
            {priceInfo && (
              <PriceInfoCard>
                <PriceInfoRow>
                  <PriceInfoLabel>환율</PriceInfoLabel>
                  <PriceInfoValue>{priceInfo}</PriceInfoValue>
                </PriceInfoRow>
                {quote && (
                  <>
                    <PriceInfoRow>
                      <PriceInfoLabel>가격 영향</PriceInfoLabel>
                      <PriceInfoValue>
                        {swapService.calculatePriceImpact(quote)}%
                      </PriceInfoValue>
                    </PriceInfoRow>
                    <PriceInfoRow>
                      <PriceInfoLabel>예상 가스비</PriceInfoLabel>
                      <PriceInfoValue>
                        {formatUnits(
                          BigInt(quote.gas || 0) * BigInt(quote.gasPrice || 0),
                          18,
                        ).slice(0, 8)}{' '}
                        ETH
                      </PriceInfoValue>
                    </PriceInfoRow>
                  </>
                )}
              </PriceInfoCard>
            )}

            {/* 스왑 버튼 */}
            <SwapButton
              onPress={handleSwap}
              disabled={!canSwap}
              $disabled={!canSwap}
            >
              {isSwapping ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <SwapButtonText>
                  {!sellAmount
                    ? '금액을 입력하세요'
                    : !buyAmount
                    ? '견적 조회 중...'
                    : '스왑하기'}
                </SwapButtonText>
              )}
            </SwapButton>

            {/* 안내 문구 */}
            <DisclaimerText>
              스왑은 0x Protocol을 통해 처리됩니다.{'\n'}
              가격은 실시간으로 변동될 수 있습니다.
            </DisclaimerText>
          </Content>
        </ScrollView>

        {renderTokenSelector()}

        {/* 리뷰 모달 */}
        <SwapReviewModal
          visible={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          onConfirm={handleConfirmSwap}
          isLoading={isSwapping}
          sellToken={sellToken}
          buyToken={buyToken}
          sellAmount={sellAmount}
          buyAmount={buyAmount}
          quote={quote}
          slippage={slippage}
          priceImpact={priceImpact}
        />

        {/* 설정 모달 */}
        <SwapSettingsModal
          visible={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
        />

        <PinConfirmModal
          visible={showPinConfirmModal}
          onConfirm={handlePinConfirmed}
          onCancel={() => setShowPinConfirmModal(false)}
          title="스왑 PIN 확인"
          message="토큰 승인과 스왑을 실행하려면 PIN을 입력하세요."
        />
      </SafeContainer>
    </Container>
  );
}

// Styled Components
const Container = styled.View`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const SafeContainer = styled.SafeAreaView`
  flex: 1;
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const BackButton = styled.TouchableOpacity`
  padding: ${({ theme }) => theme.spacing.sm}px;
`;

const BackButtonText = styled.Text`
  font-size: 24px;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const HeaderTitle = styled.Text`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const HeaderSpacer = styled.View`
  width: 40px;
`;

const HeaderButtons = styled.View`
  flex-direction: row;
  gap: 8px;
`;

const HeaderIconButton = styled.TouchableOpacity`
  width: 36px;
  height: 36px;
  border-radius: 18px;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  align-items: center;
  justify-content: center;
`;

const HeaderIconText = styled.Text`
  font-size: 16px;
`;

const FavoritePairsContainer = styled.View`
  padding: 0 ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const FavoritePairsLabel = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.xs}px;
`;

const FavoritePairsRow = styled.View`
  flex-direction: row;
  gap: 8px;
`;

const FavoritePairChip = styled.TouchableOpacity`
  background-color: ${({ theme }) => theme.colors.surface};
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

const FavoritePairText = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 500;
`;

const Content = styled.View`
  padding: ${({ theme }) => theme.spacing.lg}px;
`;

const NetworkBadge = styled.View`
  flex-direction: row;
  align-items: center;
  align-self: center;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const NetworkDot = styled.View<{ $isMainnet?: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background-color: ${({ theme, $isMainnet }) =>
    $isMainnet ? theme.colors.error : theme.colors.success};
  margin-right: ${({ theme }) => theme.spacing.xs}px;
`;

const NetworkText = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const MainnetWarningBox = styled.View`
  flex-direction: row;
  align-items: center;
  background-color: rgba(239, 68, 68, 0.1);
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
  border-left-width: 3px;
  border-left-color: ${({ theme }) => theme.colors.error};
`;

const WarningIcon = styled.Text`
  font-size: 16px;
  margin-right: ${({ theme }) => theme.spacing.sm}px;
`;

const WarningText = styled.Text`
  flex: 1;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  line-height: 18px;
`;

const SwapCard = styled.View`
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  padding: ${({ theme }) => theme.spacing.md}px;
`;

const CardLabel = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const TokenRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const TokenSelector = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.backgroundTertiary};
  padding: ${({ theme }) => theme.spacing.sm}px
    ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.full}px;
`;

const SmallTokenLogo = styled.Image`
  width: 24px;
  height: 24px;
  border-radius: 12px;
  margin-right: ${({ theme }) => theme.spacing.xs}px;
`;

const TokenSelectorText = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TokenSelectorArrow = styled.Text`
  font-size: 10px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-left: ${({ theme }) => theme.spacing.xs}px;
`;

const AmountInput = styled.TextInput`
  flex: 1;
  font-size: 28px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  text-align: right;
  padding: ${({ theme }) => theme.spacing.sm}px;
`;

const AmountDisplay = styled.Text`
  flex: 1;
  font-size: 28px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: right;
  padding: ${({ theme }) => theme.spacing.sm}px;
`;

const BalanceRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.sm}px;
  padding-top: ${({ theme }) => theme.spacing.sm}px;
  border-top-width: 1px;
  border-top-color: ${({ theme }) => theme.colors.border};
`;

const BalanceText = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const MaxButton = styled.TouchableOpacity`
  background-color: ${({ theme }) => theme.colors.primaryLight};
  padding: ${({ theme }) => theme.spacing.xs}px
    ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
`;

const MaxButtonText = styled.Text`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.primary};
`;

const SwapArrowButton = styled.TouchableOpacity`
  align-self: center;
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  width: 44px;
  height: 44px;
  border-radius: 22px;
  align-items: center;
  justify-content: center;
  margin: -10px 0;
  z-index: 1;
  border: 3px solid ${({ theme }) => theme.colors.background};
`;

const SwapArrowText = styled.Text`
  font-size: 20px;
  color: ${({ theme }) => theme.colors.primary};
`;

const SlippageSection = styled.View`
  margin-top: ${({ theme }) => theme.spacing.lg}px;
`;

const SlippageLabel = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

const SlippageOptions = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.sm}px;
`;

const SlippageOption = styled.TouchableOpacity<{ $isSelected: boolean }>`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.sm}px;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  background-color: ${({ theme, $isSelected }) =>
    $isSelected ? theme.colors.primary : theme.colors.backgroundSecondary};
  align-items: center;
`;

const SlippageOptionText = styled.Text<{ $isSelected: boolean }>`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme, $isSelected }) =>
    $isSelected ? '#fff' : theme.colors.textSecondary};
`;

const PriceInfoCard = styled.View`
  background-color: ${({ theme }) => theme.colors.backgroundSecondary};
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  padding: ${({ theme }) => theme.spacing.md}px;
  margin-top: ${({ theme }) => theme.spacing.lg}px;
`;

const PriceInfoRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.xs}px 0;
`;

const PriceInfoLabel = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const PriceInfoValue = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textPrimary};
  font-weight: 500;
`;

const SwapButton = styled.TouchableOpacity<{ $disabled: boolean }>`
  background-color: ${({ theme, $disabled }) =>
    $disabled ? theme.colors.backgroundTertiary : theme.colors.primary};
  padding: ${({ theme }) => theme.spacing.md}px;
  border-radius: ${({ theme }) => theme.borderRadius.lg}px;
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.xl}px;
`;

const SwapButtonText = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: #fff;
`;

const DisclaimerText = styled.Text`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: center;
  margin-top: ${({ theme }) => theme.spacing.md}px;
  line-height: 18px;
`;

// Modal Styles
const ModalContainer = styled.SafeAreaView`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const ModalHeader = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const ModalTitle = styled.Text`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const CloseButton = styled.TouchableOpacity`
  padding: ${({ theme }) => theme.spacing.sm}px;
`;

const CloseButtonText = styled.Text`
  font-size: 20px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const TokenItem = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.md}px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.border};
`;

const TokenLogo = styled.Image`
  width: 40px;
  height: 40px;
  border-radius: 20px;
  margin-right: ${({ theme }) => theme.spacing.md}px;
`;

const TokenInfo = styled.View`
  flex: 1;
`;

const TokenSymbol = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const TokenName = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 2px;
`;

// Unsupported Network Styles
const UnsupportedContainer = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.xl}px;
`;

const UnsupportedIcon = styled.Text`
  font-size: 64px;
  margin-bottom: ${({ theme }) => theme.spacing.lg}px;
`;

const UnsupportedTitle = styled.Text`
  font-size: 20px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textPrimary};
  margin-bottom: ${({ theme }) => theme.spacing.md}px;
`;

const UnsupportedText = styled.Text`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm}px;
`;

export default SwapScreen;
