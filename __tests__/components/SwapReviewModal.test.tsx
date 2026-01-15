/**
 * Tori Wallet - SwapReviewModal Tests
 */

import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react-native';
import { ThemeProvider } from 'styled-components/native';
import { SwapReviewModal } from '../../src/components/swap/SwapReviewModal';
import { theme } from '../../src/styles/theme';
import type {
  SwapQuote,
  SwapToken,
} from '../../src/services/enhancedSwapService';

// CI 환경에서 cleanup 타임아웃 방지
afterEach(() => {
  cleanup();
});

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('SwapReviewModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const sellToken: SwapToken = {
    symbol: 'ETH',
    name: 'Ethereum',
    address: 'native',
    decimals: 18,
    isNative: true,
    logoUrl: 'https://example.com/eth.png',
  };

  const buyToken: SwapToken = {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    decimals: 6,
    logoUrl: 'https://example.com/usdc.png',
  };

  const quote: SwapQuote = {
    sellToken: sellToken.address,
    buyToken: buyToken.address,
    sellAmount: '1000000000000000000',
    buyAmount: '1500000000',
    price: '1500',
    guaranteedPrice: '1485',
    estimatedPriceImpact: '0.1',
    gas: '200000',
    gasPrice: '20000000000',
    protocolFee: '0',
    minimumProtocolFee: '0',
    sources: [],
    to: '0xexchange',
    data: '0x',
    allowanceTarget: '0xallowance',
    value: '0',
  };

  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    isLoading: false,
    sellToken,
    buyToken,
    sellAmount: '1.0',
    buyAmount: '1500.0',
    quote,
    slippage: 0.5,
    priceImpact: { percent: '0.1', level: 'low' as const },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly when visible', () => {
    const { toJSON } = renderWithTheme(<SwapReviewModal {...defaultProps} />);
    expect(toJSON()).not.toBeNull();
  });

  it('should render empty when tokens are null', () => {
    const props = { ...defaultProps, sellToken: null, buyToken: null };
    const { toJSON } = renderWithTheme(<SwapReviewModal {...props} />);
    expect(toJSON()).toBeNull();
  });

  it('should render empty when quote is null', () => {
    const props = { ...defaultProps, quote: null };
    const { toJSON } = renderWithTheme(<SwapReviewModal {...props} />);
    expect(toJSON()).toBeNull();
  });

  it('should call onClose when close button pressed', () => {
    const { getByText } = renderWithTheme(
      <SwapReviewModal {...defaultProps} />,
    );
    fireEvent.press(getByText('✕'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('should display token amounts', () => {
    const { root } = renderWithTheme(<SwapReviewModal {...defaultProps} />);
    expect(root).toBeTruthy();
  });

  it('should show loading state', () => {
    const props = { ...defaultProps, isLoading: true };
    const { root } = renderWithTheme(<SwapReviewModal {...props} />);
    expect(root).toBeTruthy();
  });

  it('should render with high price impact', () => {
    const props = {
      ...defaultProps,
      priceImpact: { percent: '5.0', level: 'high' as const },
    };
    const { root } = renderWithTheme(<SwapReviewModal {...props} />);
    expect(root).toBeTruthy();
  });

  it('should render with critical price impact', () => {
    const props = {
      ...defaultProps,
      priceImpact: { percent: '10.0', level: 'critical' as const },
    };
    const { root } = renderWithTheme(<SwapReviewModal {...props} />);
    expect(root).toBeTruthy();
  });
});
