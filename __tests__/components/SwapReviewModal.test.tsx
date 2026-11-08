/**
 * 스왑 확인 모달 테스트
 */

import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, fireEvent, cleanup, act } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { SwapReviewModal } from '../../src/components/swap/SwapReviewModal';
import { theme } from '../../src/styles/theme';
import { useWalletStore } from '../../src/store/walletStore';
import type {
  SwapQuote,
  SwapToken,
} from '../../src/services/enhancedSwapService';

jest.mock('../../src/hooks/useFiat', () => ({
  useFiat: () => ({
    formatFiat: (value: number | null | undefined) =>
      value === null || value === undefined ? '—' : `$${value.toFixed(2)}`,
  }),
}));

afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('SwapReviewModal', () => {
  const sellToken: SwapToken = {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    decimals: 6,
  };

  const buyToken: SwapToken = {
    symbol: 'MATIC',
    name: 'Polygon',
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    decimals: 18,
    isNative: true,
  };

  const makeQuote = (overrides: Partial<SwapQuote> = {}): SwapQuote => ({
    sellToken: sellToken.address,
    buyToken: buyToken.address,
    sellAmount: '100000000',
    buyAmount: '200000000000000000000',
    price: '2',
    guaranteedPrice: '1.99',
    estimatedPriceImpact: '0.001',
    gas: '200000',
    gasPrice: '100000000000', // 100 gwei → 0.02 MATIC
    protocolFee: '0',
    minimumProtocolFee: '0',
    sources: [],
    to: '0x0000000000001fF3684f28c67538d4D072C22734',
    data: '0x12345678',
    allowanceTarget: '0x0000000000001fF3684f28c67538d4D072C22734',
    value: '0',
    minBuyAmount: '199000000000000000000',
    minimumReceived: '199',
    estimatedGasUsd: '0.01',
    liquidityAvailable: true,
    issues: {
      allowance: null,
      balance: null,
      simulationIncomplete: false,
      invalidSourcesPassed: [],
    },
    security: {
      intentFingerprint: `0x${'11'.repeat(32)}`,
      quoteFingerprint: `0x${'22'.repeat(32)}`,
      validatedAt: Date.now(),
      chainId: 137,
      taker: '0x1234567890123456789012345678901234567890',
    },
    ...overrides,
  });

  const baseProps = () => ({
    visible: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    onRefreshQuote: jest.fn(),
    isLoading: false,
    sellToken,
    buyToken,
    sellAmount: '100',
    buyAmount: '200',
    quote: makeQuote(),
    slippage: 0.5,
    priceImpact: { percent: '0.10', level: 'low' as const },
    nativeSymbol: 'MATIC',
  });

  it('renders nothing without tokens', () => {
    expect(
      renderWithTheme(
        <SwapReviewModal {...baseProps()} sellToken={null} buyToken={null} />,
      ).toJSON(),
    ).toBeNull();
  });

  it('renders nothing without a quote', () => {
    expect(
      renderWithTheme(
        <SwapReviewModal {...baseProps()} quote={null} />,
      ).toJSON(),
    ).toBeNull();
  });

  describe('auto-lock', () => {
    beforeEach(() => {
      useWalletStore.setState({ hasWallet: true, isLocked: false });
    });
    afterEach(() => {
      cleanup();
      useWalletStore.setState({ hasWallet: false, isLocked: true });
    });

    it('closes when the wallet auto-locks so it never stays over the lock screen', () => {
      const props = baseProps();
      const view = renderWithTheme(<SwapReviewModal {...props} />);
      expect(view.getByTestId('swap-review-modal')).toBeTruthy();
      act(() => {
        useWalletStore.getState().lock();
      });
      expect(view.queryByTestId('swap-review-modal')).toBeNull();
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('lets the caller handle the lock instead of closing', () => {
      const props = baseProps();
      const onLock = jest.fn();
      const view = renderWithTheme(
        <SwapReviewModal {...props} onLock={onLock} />,
      );
      act(() => {
        useWalletStore.getState().lock();
      });
      expect(view.queryByTestId('swap-review-modal')).toBeNull();
      expect(onLock).toHaveBeenCalledTimes(1);
      expect(props.onClose).not.toHaveBeenCalled();
    });
  });

  it('closes from the labelled header button', () => {
    const props = baseProps();
    const view = renderWithTheme(<SwapReviewModal {...props} />);
    fireEvent.press(view.getByLabelText('닫기'));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('states the exact approval (token, amount, AllowanceHolder) before PIN', () => {
    const view = renderWithTheme(
      <SwapReviewModal
        {...baseProps()}
        approval={{
          tokenSymbol: 'USDC',
          tokenAddress: sellToken.address,
          amount: '100',
          spender: '0x0000000000001fF3684f28c67538d4D072C22734',
        }}
      />,
    );
    expect(view.getByText('먼저 토큰 승인이 필요합니다')).toBeTruthy();
    expect(view.getByTestId('swap-review-approval-amount')).toHaveTextContent(
      '100 USDC',
    );
    expect(
      view.getAllByText('0x0000000000001fF3684f28c67538d4D072C22734').length,
    ).toBeGreaterThan(0);
    expect(view.getByText('승인 후 스왑하기')).toBeTruthy();
  });

  it('shows the gas cost in the network native symbol with fiat', () => {
    const view = renderWithTheme(<SwapReviewModal {...baseProps()} />);
    expect(view.getByTestId('swap-review-gas')).toHaveTextContent(
      '0.02 MATIC (≈ $0.01)',
    );
    expect(view.queryByText(/ETH/)).toBeNull();
  });

  it('counts down the quote validity and blocks confirmation once expired', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const props = baseProps();
    props.quote = makeQuote({
      security: { ...makeQuote().security, validatedAt: Date.now() },
    });
    const view = renderWithTheme(<SwapReviewModal {...props} />);
    expect(view.getByTestId('swap-quote-timer')).toHaveTextContent(
      /견적 유효 시간 90초/,
    );

    act(() => {
      jest.advanceTimersByTime(91_000);
    });
    expect(view.getByTestId('swap-quote-timer')).toHaveTextContent(
      /견적이 만료되었습니다/,
    );
    expect(view.getByTestId('swap-review-confirm')).toBeDisabled();
    fireEvent.press(view.getByTestId('swap-review-confirm'));
    expect(props.onConfirm).not.toHaveBeenCalled();

    fireEvent.press(view.getByTestId('swap-quote-refresh'));
    expect(props.onRefreshQuote).toHaveBeenCalled();
  });

  it('shows a warning when the price impact cannot be calculated (never 0%)', () => {
    const view = renderWithTheme(
      <SwapReviewModal
        {...baseProps()}
        priceImpact={{ percent: null, level: 'unknown' }}
      />,
    );
    expect(view.getByTestId('swap-review-price-impact')).toHaveTextContent(
      '계산할 수 없음',
    );
    expect(view.getByTestId('swap-review-impact-warning')).toHaveTextContent(
      /가격 영향을 계산할 수 없습니다/,
    );
    expect(view.queryByText('0.00%')).toBeNull();
  });

  it('warns at ≥3% impact without extra confirmation', () => {
    const props = baseProps();
    const view = renderWithTheme(
      <SwapReviewModal
        {...props}
        priceImpact={{ percent: '4.20', level: 'high' }}
      />,
    );
    expect(view.getByTestId('swap-review-impact-warning')).toHaveTextContent(
      /4.20%/,
    );
    fireEvent.press(view.getByTestId('swap-review-confirm'));
    expect(props.onConfirm).toHaveBeenCalled();
  });

  it('requires an explicit acknowledgement at ≥10% impact', () => {
    const props = baseProps();
    const view = renderWithTheme(
      <SwapReviewModal
        {...props}
        priceImpact={{ percent: '12.00', level: 'critical' }}
      />,
    );
    expect(view.getByText('그래도 스왑하기')).toBeTruthy();
    expect(view.getByTestId('swap-review-confirm')).toBeDisabled();
    fireEvent.press(view.getByTestId('swap-review-confirm'));
    expect(props.onConfirm).not.toHaveBeenCalled();

    fireEvent.press(view.getByTestId('swap-review-acknowledge'));
    expect(view.getByTestId('swap-review-confirm')).toBeEnabled();
    fireEvent.press(view.getByTestId('swap-review-confirm'));
    expect(props.onConfirm).toHaveBeenCalled();
  });

  it('announces the countdown only at thresholds, not every second', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    announce.mockClear();
    const props = baseProps();
    props.quote = makeQuote({
      security: { ...makeQuote().security, validatedAt: Date.now() },
    });
    const view = renderWithTheme(<SwapReviewModal {...props} />);
    // 매초 바뀌는 문구는 라이브 영역이 아니다 (TalkBack이 매초 읽지 않게).
    expect(
      view.getByTestId('swap-quote-timer-text').props.accessibilityLiveRegion,
    ).toBeUndefined();

    // 1초마다 화면이 갱신되는 실제 흐름처럼 한 초씩 진행한다.
    const tick = (seconds: number) => {
      for (let i = 0; i < seconds; i += 1) {
        act(() => {
          jest.advanceTimersByTime(1000);
        });
      }
    };
    tick(25);
    expect(view.getByTestId('swap-quote-timer-text')).toHaveTextContent(
      '견적 유효 시간 65초',
    );
    expect(announce).not.toHaveBeenCalled();

    tick(66);
    expect(announce.mock.calls.map(([message]) => message)).toEqual([
      '견적 유효 시간이 1분 남았습니다.',
      '견적 유효 시간이 30초 남았습니다.',
      '견적 유효 시간이 10초 남았습니다.',
      '견적이 만료되었습니다. 새로고침 후 다시 확인해주세요.',
    ]);
    announce.mockRestore();
  });

  it('keeps the confirm button colored while the swap is processing', () => {
    const view = renderWithTheme(
      <SwapReviewModal {...baseProps()} isLoading />,
    );
    const confirm = view.getByTestId('swap-review-confirm');
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveStyle({ backgroundColor: theme.colors.primary });
    expect(view.getByTestId('swap-review-confirm-spinner').props.color).toBe(
      theme.colors.onPrimary,
    );
  });

  it('greys out the confirm button when it is disabled for other reasons', () => {
    const view = renderWithTheme(
      <SwapReviewModal
        {...baseProps()}
        priceImpact={{ percent: '12.00', level: 'critical' }}
      />,
    );
    expect(view.getByTestId('swap-review-confirm')).toHaveStyle({
      backgroundColor: theme.colors.disabledBackground,
    });
  });

  it('explains the extra reset transaction for tokens such as USDT', () => {
    const view = renderWithTheme(
      <SwapReviewModal
        {...baseProps()}
        approval={{
          tokenSymbol: 'USDT',
          tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          amount: '120',
          spender: '0x0000000000001fF3684f28c67538d4D072C22734',
          resetRequired: true,
        }}
      />,
    );
    expect(view.getByTestId('swap-review-approval-reset')).toHaveTextContent(
      /기존 승인을 0으로 초기화/,
    );
    expect(view.getByText(/세 번의 네트워크 수수료/)).toBeTruthy();
  });

  it('shows a re-review notice', () => {
    const view = renderWithTheme(
      <SwapReviewModal {...baseProps()} notice="견적이 갱신되었습니다." />,
    );
    expect(view.getByTestId('swap-review-notice')).toHaveTextContent(
      '견적이 갱신되었습니다.',
    );
  });
});
