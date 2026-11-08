/**
 * 스왑 서비스 테스트
 */

// 테스트 타임아웃 5초 설정 (이 테스트는 빠르게 완료되어야 함)
jest.setTimeout(5000);

import {
  BaseError,
  EstimateGasExecutionError,
  ExecutionRevertedError,
  HttpRequestError,
  InsufficientFundsError,
  TransactionExecutionError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
  isAddress,
} from 'viem';
import {
  swapService,
  SwapToken,
  SWAP_TOKENS,
  SwapError,
  computePriceImpact,
  classifyPriceImpact,
  describeSwapError,
  isReceiptTimeoutError,
  mapZeroXError,
  nativeSwapMax,
  quoteRemainingMs,
  QUOTE_MAX_AGE_MS,
  ZERO_X_FETCH_TIMEOUT_MS,
} from '../../src/services/swapService';

const USDC_POLYGON = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
import { SWAP_TOKENS as ENHANCED_SWAP_TOKENS } from '../../src/services/enhancedSwapService';

// fetch 모킹
global.fetch = jest.fn();

describe('SwapService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  describe('getTokens', () => {
    it('should return tokens for Ethereum mainnet', () => {
      const tokens = swapService.getTokens(1);
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0].symbol).toBe('ETH');
    });

    it('should return tokens for Polygon', () => {
      const tokens = swapService.getTokens(137);
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0].symbol).toBe('MATIC');
    });

    it('should return tokens for Arbitrum', () => {
      const tokens = swapService.getTokens(42161);
      expect(tokens.length).toBeGreaterThan(0);
    });

    it('should return tokens for Optimism', () => {
      const tokens = swapService.getTokens(10);
      expect(tokens.length).toBeGreaterThan(0);
    });

    it('should return tokens for Base', () => {
      const tokens = swapService.getTokens(8453);
      expect(tokens.length).toBeGreaterThan(0);
    });

    it('should return empty array for unsupported chain', () => {
      const tokens = swapService.getTokens(999999);
      expect(tokens).toEqual([]);
    });
  });

  describe('isSwapSupported', () => {
    it('should return true for supported chains', () => {
      expect(swapService.isSwapSupported(1)).toBe(true);
      expect(swapService.isSwapSupported(137)).toBe(true);
      expect(swapService.isSwapSupported(42161)).toBe(true);
      expect(swapService.isSwapSupported(10)).toBe(true);
      expect(swapService.isSwapSupported(8453)).toBe(true);
    });

    it('should return false for unsupported chains', () => {
      expect(swapService.isSwapSupported(11155111)).toBe(false); // Sepolia
      expect(swapService.isSwapSupported(999999)).toBe(false);
    });
  });

  describe('needsApproval', () => {
    it('should return false for native tokens', () => {
      const nativeToken: SwapToken = {
        symbol: 'ETH',
        name: 'Ethereum',
        address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
        decimals: 18,
      };
      expect(swapService.needsApproval(nativeToken)).toBe(false);
    });

    it('should return true for ERC-20 tokens', () => {
      const erc20Token: SwapToken = {
        symbol: 'USDC',
        name: 'USD Coin',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
      };
      expect(swapService.needsApproval(erc20Token)).toBe(true);
    });
  });

  describe('formatBuyAmount', () => {
    const mockToken: SwapToken = {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
    };

    it('should format zero amount', () => {
      expect(swapService.formatBuyAmount('0', mockToken)).toBe('0');
    });

    it('should format very small amounts', () => {
      expect(swapService.formatBuyAmount('0.00001', mockToken)).toBe(
        '< 0.0001',
      );
    });

    it('should format small amounts with 4 decimals', () => {
      expect(swapService.formatBuyAmount('0.12345', mockToken)).toBe('0.1235');
    });

    it('should format medium amounts with 2 decimals', () => {
      expect(swapService.formatBuyAmount('123.456', mockToken)).toBe('123.46');
    });

    it('should format large amounts with locale string', () => {
      const result = swapService.formatBuyAmount('1234567.89', mockToken);
      expect(result).toContain('1,234,567');
    });
  });

  describe('calculatePriceImpact', () => {
    it('should calculate price impact percentage', () => {
      const quote = {
        estimatedPriceImpact: '0.005',
        sellToken: '',
        buyToken: '',
        sellAmount: '',
        buyAmount: '',
        price: '',
        guaranteedPrice: '',
        gas: '',
        gasPrice: '',
        protocolFee: '',
        minimumProtocolFee: '',
        sources: [],
        allowanceTarget: '',
        to: '',
        data: '',
        value: '',
      };
      expect(swapService.calculatePriceImpact(quote)).toBe('0.50');
    });

    it('should handle zero price impact', () => {
      const quote = {
        estimatedPriceImpact: '0',
        sellToken: '',
        buyToken: '',
        sellAmount: '',
        buyAmount: '',
        price: '',
        guaranteedPrice: '',
        gas: '',
        gasPrice: '',
        protocolFee: '',
        minimumProtocolFee: '',
        sources: [],
        allowanceTarget: '',
        to: '',
        data: '',
        value: '',
      };
      expect(swapService.calculatePriceImpact(quote)).toBe('0.00');
    });

    it('returns null (unknown) for an undefined price impact, never 0%', () => {
      const quote = {
        sellToken: '',
        buyToken: '',
        sellAmount: '',
        buyAmount: '',
        price: '',
        guaranteedPrice: '',
        gas: '',
        gasPrice: '',
        protocolFee: '',
        minimumProtocolFee: '',
        sources: [],
        allowanceTarget: '',
        to: '',
        data: '',
        value: '',
      } as any;
      expect(swapService.calculatePriceImpact(quote)).toBeNull();
    });
  });

  describe('computePriceImpact (USD values)', () => {
    it('is 1 - buy value / sell value', () => {
      // 1 ETH($3000) -> 2,850 USDC($1) = 5% 손실
      expect(
        computePriceImpact({
          sellAmount: '1',
          sellPriceUsd: 3000,
          buyAmount: '2850',
          buyPriceUsd: 1,
        }),
      ).toBeCloseTo(0.05, 10);
    });

    it('does not report a loss when the buy side is worth more', () => {
      expect(
        computePriceImpact({
          sellAmount: '1',
          sellPriceUsd: 1,
          buyAmount: '1.2',
          buyPriceUsd: 1,
        }),
      ).toBe(0);
    });

    it.each([
      [null, 1],
      [3000, null],
      [undefined, 1],
      [0, 1],
      [3000, 0],
    ])(
      'returns null when prices are unavailable (sell=%p, buy=%p)',
      (sellPriceUsd, buyPriceUsd) => {
        expect(
          computePriceImpact({
            sellAmount: '1',
            sellPriceUsd: sellPriceUsd as number | null | undefined,
            buyAmount: '2850',
            buyPriceUsd: buyPriceUsd as number | null | undefined,
          }),
        ).toBeNull();
      },
    );

    it('classifies 3% as a warning and 10% as critical', () => {
      expect(classifyPriceImpact('0.029').level).toBe('medium');
      expect(classifyPriceImpact('0.03').level).toBe('high');
      expect(classifyPriceImpact('0.0999').level).toBe('high');
      expect(classifyPriceImpact('0.1').level).toBe('critical');
      expect(classifyPriceImpact('')).toEqual({
        percent: null,
        level: 'unknown',
      });
    });

    it('marks a freshly normalized quote as unknown impact until priced', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({
          allowanceTarget: '0x0000000000001fF3684f28c67538d4D072C22734',
          buyAmount: '1500000',
          buyToken: SWAP_TOKENS[1][1].address,
          sellAmount: '1000000000000000000',
          sellToken: SWAP_TOKENS[1][0].address,
          minBuyAmount: '1490000',
          liquidityAvailable: true,
          transaction: {
            to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
            data: '0x12345678',
            gas: '200000',
            gasPrice: '50000000000',
            value: '1000000000000000000',
          },
        }),
      });
      const quote = await swapService.getQuote(
        {
          sellToken: SWAP_TOKENS[1][0],
          buyToken: SWAP_TOKENS[1][1],
          sellAmount: '1',
          takerAddress: '0x1234567890123456789012345678901234567890',
        },
        1,
      );
      expect(quote!.estimatedPriceImpact).toBe('');
      expect(swapService.calculatePriceImpact(quote!)).toBeNull();
    });
  });

  describe('error mapping', () => {
    it.each([
      [400, { name: 'INSUFFICIENT_LIQUIDITY' }, 'NO_LIQUIDITY'],
      [
        400,
        { reason: 'Insufficient balance for sell token' },
        'INSUFFICIENT_BALANCE',
      ],
      [
        400,
        { name: 'SWAP_VALIDATION_FAILED', message: 'Simulation reverted' },
        'SIMULATION_FAILED',
      ],
      [400, { name: 'TOKEN_NOT_SUPPORTED' }, 'TOKEN_NOT_SUPPORTED'],
      [
        400,
        {
          name: 'INPUT_INVALID',
          data: { details: [{ field: 'sellAmount', reason: 'too small' }] },
        },
        'INVALID_REQUEST',
      ],
      [429, {}, 'RATE_LIMITED'],
      [502, {}, 'SERVICE_UNAVAILABLE'],
      [418, { reason: 'teapot' }, 'UNKNOWN'],
    ])('maps HTTP %p %j to %s', (status, body, code) => {
      const error = mapZeroXError(status, body);
      expect(error).toBeInstanceOf(SwapError);
      expect(error.code).toBe(code);
      // 사용자에게는 한국어 메시지를 보여 준다.
      expect(error.message).toMatch(/[가-힣]/);
    });

    it('keeps the 0x reason in the message for unmapped errors', () => {
      expect(mapZeroXError(418, { reason: 'teapot' }).message).toContain(
        'teapot',
      );
      expect(
        mapZeroXError(400, {
          name: 'INPUT_INVALID',
          data: { details: [{ reason: 'too small' }] },
        }).message,
      ).toContain('too small');
    });
  });

  describe('describeSwapError (viem and signer errors)', () => {
    const from = '0x1234567890123456789012345678901234567890';
    const calldata = `0x095ea7b3${'00'.repeat(64)}`;

    function expectReadable(message: string) {
      expect(message).toMatch(/^[^a-zA-Z]*[가-힣]/);
      expect(message).not.toMatch(/Version:|Details:|Request Arguments/);
      expect(message).not.toContain(calldata.slice(0, 18));
      expect(message).not.toContain(from);
    }

    it('explains insufficient gas funds in Korean without the viem dump', () => {
      const error = new TransactionExecutionError(
        new InsufficientFundsError(),
        {
          account: { address: from, type: 'json-rpc' } as any,
          to: USDC_POLYGON,
          data: calldata as `0x${string}`,
        },
      );
      // viem의 원문은 요청 인자와 버전을 포함한다.
      expect(error.message).toContain('Version: viem@');

      const message = describeSwapError(error, { nativeSymbol: 'MATIC' });
      expectReadable(message);
      expect(message).toContain('MATIC');
      expect(message).toContain('가스비');
    });

    it('maps reverts, receipt timeouts and rejections', () => {
      const reverted = new EstimateGasExecutionError(
        new ExecutionRevertedError({ message: 'execution reverted' }),
        { account: { address: from } as any, data: calldata as any },
      );
      expectReadable(describeSwapError(reverted));
      expect(describeSwapError(reverted)).toMatch(/시뮬레이션/);

      const timeout = new WaitForTransactionReceiptTimeoutError({
        hash: `0x${'ab'.repeat(32)}`,
      });
      expectReadable(describeSwapError(timeout));
      expect(describeSwapError(timeout)).toMatch(/아직 확정되지 않았습니다/);
      expect(isReceiptTimeoutError(timeout)).toBe(true);
      expect(isReceiptTimeoutError(reverted)).toBe(false);

      const rejected = new UserRejectedRequestError(new Error('nope'));
      expect(describeSwapError(rejected)).toBe('요청이 취소되었습니다.');
    });

    it('never shows the full message of an unknown viem error', () => {
      const error = new BaseError('Something odd happened.', {
        metaMessages: [
          `Request Arguments:`,
          `  from: ${from}`,
          `  data: ${calldata}`,
        ],
      });
      const message = describeSwapError(error);
      expectReadable(message);
      expect(message).toContain('Something odd happened.');
    });

    it('translates signer lock errors and keeps Korean app errors', () => {
      expect(describeSwapError(new Error('Wallet is locked'))).toMatch(
        /지갑이 잠겨/,
      );
      expect(
        describeSwapError(new Error('Wallet signing session expired')),
      ).toMatch(/지갑이 잠겨/);
      expect(describeSwapError(new SwapError('NETWORK'))).toMatch(
        /연결할 수 없습니다/,
      );
      expect(describeSwapError(new Error('유효하지 않은 승인 대상'))).toBe(
        '유효하지 않은 승인 대상',
      );
      expect(describeSwapError('boom')).toBe('견적을 가져오지 못했습니다.');
    });

    it('reads app errors that viem wrapped while signing', () => {
      const wrap = (cause: Error) =>
        new TransactionExecutionError(cause as any, {
          account: { address: from, type: 'json-rpc' } as any,
          to: USDC_POLYGON,
          data: calldata as `0x${string}`,
        });
      // 계정의 signTransaction이 던진 세션 폐기 오류는 viem이 감싼다 (shortMessage 없음).
      const expired = describeSwapError(
        wrap(new Error('Wallet signing session expired')),
      );
      expectReadable(expired);
      expect(expired).toMatch(/지갑이 잠겨/);
      // signingService의 서명 승인 취소 문구는 그대로 보여 준다.
      expect(
        describeSwapError(
          wrap(new Error('서명 승인이 만료되거나 취소되었습니다.')),
        ),
      ).toBe('서명 승인이 만료되거나 취소되었습니다.');
    });

    it('reports an RPC outage during gas estimation as a network problem', () => {
      const error = new EstimateGasExecutionError(
        new HttpRequestError({
          url: 'https://polygon-rpc.example',
          status: 503,
          details: 'Service Unavailable',
        }),
        { account: { address: from } as any, data: calldata as any },
      );
      const message = describeSwapError(error);
      expectReadable(message);
      expect(message).toMatch(/네트워크\(RPC\)에 연결할 수 없습니다/);
      expect(message).not.toMatch(/시뮬레이션/);
    });
  });

  describe('allowance reset tokens', () => {
    it('requires a zero reset only for mainnet USDT', () => {
      expect(
        swapService.requiresAllowanceReset(
          1,
          '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        ),
      ).toBe(true);
      expect(
        swapService.requiresAllowanceReset(
          1,
          '0xdac17f958d2ee523a2206206994597c13d831ec7',
        ),
      ).toBe(true);
      // Polygon USDT, 메인넷 USDC는 초기화가 필요 없다.
      expect(
        swapService.requiresAllowanceReset(
          137,
          '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        ),
      ).toBe(false);
      expect(
        swapService.requiresAllowanceReset(
          1,
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        ),
      ).toBe(false);
    });
  });

  describe('0x request timeout', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it.each(['getPrice', 'getQuote'] as const)(
      '%s fails with a network error when 0x never answers',
      async method => {
        jest.useFakeTimers();
        let signal: AbortSignal | undefined;
        (global.fetch as jest.Mock).mockImplementation(
          (_url: string, init?: { signal?: AbortSignal }) => {
            signal = init?.signal;
            return new Promise(() => {});
          },
        );
        const consoleError = jest
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        const result = swapService[method](
          {
            sellToken: SWAP_TOKENS[1][0],
            buyToken: SWAP_TOKENS[1][1],
            sellAmount: '1',
            takerAddress: '0x1234567890123456789012345678901234567890',
          },
          1,
        );
        const outcome = result.catch((error: unknown) => error);
        await jest.advanceTimersByTimeAsync(ZERO_X_FETCH_TIMEOUT_MS);
        expect(await outcome).toMatchObject({ code: 'NETWORK' });
        expect(signal?.aborted).toBe(true);
        consoleError.mockRestore();
      },
    );
  });

  describe('native MAX reserve (bigint)', () => {
    it('reserves gasLimit x price x 120% without floating point', () => {
      const balance = 1_000_000_000_000_000_001n; // 1 ETH + 1 wei
      const { maxWei, reserveWei } = nativeSwapMax(
        balance,
        300_000n,
        20_000_000_000n,
      );
      expect(reserveWei).toBe(7_200_000_000_000_000n);
      expect(maxWei).toBe(balance - 7_200_000_000_000_000n);
    });

    it('never goes below zero', () => {
      expect(nativeSwapMax(1000n, 300_000n, 1n).maxWei).toBe(0n);
    });
  });

  describe('quote freshness', () => {
    it('reports the remaining time of the 90s quote window', () => {
      const quote = { security: { validatedAt: 1_000 } } as any;
      expect(quoteRemainingMs(quote, 1_000)).toBe(QUOTE_MAX_AGE_MS);
      expect(quoteRemainingMs(quote, 1_000 + QUOTE_MAX_AGE_MS + 1)).toBe(-1);
    });
  });

  describe('getPrice', () => {
    it('should return null for unsupported chain', async () => {
      const result = await swapService.getPrice(
        {
          sellToken: SWAP_TOKENS[1][0],
          buyToken: SWAP_TOKENS[1][1],
          sellAmount: '1',
          takerAddress: '0x1234567890123456789012345678901234567890',
        },
        11155111, // Sepolia - unsupported
      );
      expect(result).toBeNull();
    });

    it('should fetch price for supported chain', async () => {
      const mockResponse = {
        price: '1.5',
        buyAmount: '1500000', // 1.5 USDC in 6 decimals
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await swapService.getPrice(
        {
          sellToken: SWAP_TOKENS[1][0], // ETH
          buyToken: SWAP_TOKENS[1][1], // USDC
          sellAmount: '1',
          takerAddress: '0x1234567890123456789012345678901234567890',
        },
        1,
      );

      expect(result).not.toBeNull();
      expect(result?.price).toBe('1.5');
    });

    const priceParams = {
      sellToken: SWAP_TOKENS[1][0],
      buyToken: SWAP_TOKENS[1][1],
      sellAmount: '1',
      takerAddress: '0x1234567890123456789012345678901234567890',
    };

    it('throws a specific error instead of returning null on API failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValueOnce({ name: 'TOKEN_NOT_SUPPORTED' }),
      });

      await expect(swapService.getPrice(priceParams, 1)).rejects.toMatchObject({
        code: 'TOKEN_NOT_SUPPORTED',
      });
    });

    it('should handle network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new TypeError('Network request failed'),
      );

      await expect(swapService.getPrice(priceParams, 1)).rejects.toMatchObject({
        code: 'NETWORK',
      });
    });

    it('reports missing liquidity', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({ liquidityAvailable: false }),
      });

      await expect(swapService.getPrice(priceParams, 1)).rejects.toMatchObject({
        code: 'NO_LIQUIDITY',
      });
    });

    it('flags an insufficient taker balance reported by 0x', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({
          price: '1.5',
          buyAmount: '1500000',
          liquidityAvailable: true,
          issues: { balance: { token: 'x', actual: '0', expected: '1' } },
        }),
      });

      await expect(swapService.getPrice(priceParams, 1)).resolves.toEqual({
        price: '1.5',
        buyAmount: '1.5',
        insufficientBalance: true,
      });
    });
  });

  describe('getQuote', () => {
    const taker = '0x1234567890123456789012345678901234567890';
    const allowanceHolder = '0x0000000000001fF3684f28c67538d4D072C22734';
    const nativeQuote = () => ({
      allowanceTarget: allowanceHolder,
      buyAmount: '1500000',
      buyToken: SWAP_TOKENS[1][1].address,
      sellAmount: '1000000000000000000',
      sellToken: SWAP_TOKENS[1][0].address,
      minBuyAmount: '1490000',
      liquidityAvailable: true,
      issues: {
        allowance: null,
        balance: null,
        simulationIncomplete: false,
        invalidSourcesPassed: [],
      },
      route: { fills: [] },
      transaction: {
        to: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
        data: '0x12345678',
        gas: '200000',
        gasPrice: '50000000000',
        value: '1000000000000000000',
      },
    });

    it('should return null for unsupported chain', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await swapService.getQuote(
        {
          sellToken: SWAP_TOKENS[1][0],
          buyToken: SWAP_TOKENS[1][1],
          sellAmount: '1',
          takerAddress: '0x1234567890123456789012345678901234567890',
        },
        11155111,
      );

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should throw a mapped Korean error on API error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: jest
          .fn()
          .mockResolvedValueOnce({ reason: 'Insufficient liquidity' }),
      });
      jest.spyOn(console, 'error').mockImplementation();

      await expect(
        swapService.getQuote(
          {
            sellToken: SWAP_TOKENS[1][0],
            buyToken: SWAP_TOKENS[1][1],
            sellAmount: '1',
            takerAddress: '0x1234567890123456789012345678901234567890',
          },
          1,
        ),
      ).rejects.toMatchObject({
        code: 'NO_LIQUIDITY',
        reason: 'Insufficient liquidity',
        message: expect.stringContaining('유동성이 없습니다'),
      });
    });

    it('maps quote issues to specific reasons', async () => {
      jest.spyOn(console, 'error').mockImplementation();
      const params = {
        sellToken: SWAP_TOKENS[1][0],
        buyToken: SWAP_TOKENS[1][1],
        sellAmount: '1',
        takerAddress: taker,
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({
          ...nativeQuote(),
          issues: {
            ...nativeQuote().issues,
            balance: { token: 'x', actual: '0', expected: '1' },
          },
        }),
      });
      await expect(swapService.getQuote(params, 1)).rejects.toMatchObject({
        code: 'INSUFFICIENT_BALANCE',
      });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({
          ...nativeQuote(),
          issues: { ...nativeQuote().issues, simulationIncomplete: true },
        }),
      });
      await expect(swapService.getQuote(params, 1)).rejects.toMatchObject({
        code: 'SIMULATION_FAILED',
      });
    });

    it('treats a quote as unusable once its 90s window has passed', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(nativeQuote()),
      });
      const params = {
        sellToken: SWAP_TOKENS[1][0],
        buyToken: SWAP_TOKENS[1][1],
        sellAmount: '1',
        takerAddress: taker,
      };
      const quote = await swapService.getQuote(params, 1);
      expect(swapService.isQuoteUsable(quote!, params, 1)).toBe(true);
      // 승인 후 남은 시간이 실행 여유보다 적으면 다시 검토해야 한다.
      expect(
        swapService.isQuoteUsable(quote!, params, 1, QUOTE_MAX_AGE_MS + 1),
      ).toBe(false);
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now + QUOTE_MAX_AGE_MS + 1);
      expect(swapService.isQuoteUsable(quote!, params, 1)).toBe(false);
      expect(() =>
        swapService.assertQuoteMatchesIntent(quote!, params, 1),
      ).toThrow('만료');
    });

    it('validates and binds a v2 AllowanceHolder quote to the requested intent', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(nativeQuote()),
      });
      const params = {
        sellToken: SWAP_TOKENS[1][0],
        buyToken: SWAP_TOKENS[1][1],
        sellAmount: '1',
        takerAddress: taker,
        slippagePercentage: 0.5,
      };

      const quote = await swapService.getQuote(params, 1);

      expect(quote?.minimumReceived).toBe('1.49');
      expect(quote?.security.intentFingerprint).toMatch(/^0x[0-9a-f]{64}$/);
      expect(() =>
        swapService.assertQuoteMatchesIntent(quote!, params, 1),
      ).not.toThrow();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/swap/allowance-holder/quote?'),
        expect.objectContaining({
          headers: expect.objectContaining({ '0x-version': 'v2' }),
        }),
      );
    });

    it('blocks a quote that redirects token approval away from AllowanceHolder', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({
          ...nativeQuote(),
          allowanceTarget: '0x1111111111111111111111111111111111111111',
        }),
      });

      await expect(
        swapService.getQuote(
          {
            sellToken: SWAP_TOKENS[1][0],
            buyToken: SWAP_TOKENS[1][1],
            sellAmount: '1',
            takerAddress: taker,
          },
          1,
        ),
      ).rejects.toThrow('공식 0x AllowanceHolder가 아닌 승인 대상');
    });

    it('blocks execution data changed after the user reviewed the quote', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(nativeQuote()),
      });
      const params = {
        sellToken: SWAP_TOKENS[1][0],
        buyToken: SWAP_TOKENS[1][1],
        sellAmount: '1',
        takerAddress: taker,
      };
      const quote = await swapService.getQuote(params, 1);
      quote!.data = '0x87654321';

      expect(() =>
        swapService.assertQuoteMatchesIntent(quote!, params, 1),
      ).toThrow('검토 후 스왑 실행 데이터가 변경되어 차단했습니다.');
    });
  });

  describe('SWAP_TOKENS', () => {
    it('should have proper token structure', () => {
      Object.values(SWAP_TOKENS).forEach(tokens => {
        tokens.forEach(token => {
          expect(token).toHaveProperty('symbol');
          expect(token).toHaveProperty('name');
          expect(token).toHaveProperty('address');
          expect(token).toHaveProperty('decimals');
          expect(typeof token.symbol).toBe('string');
          expect(typeof token.decimals).toBe('number');
        });
      });
    });

    it('should have native token as first token', () => {
      // 대부분의 체인은 네이티브 토큰이 첫 번째여야 함
      expect(SWAP_TOKENS[1][0].symbol).toBe('ETH');
      expect(SWAP_TOKENS[137][0].symbol).toBe('MATIC');
    });

    it.each([
      ['swapService', SWAP_TOKENS],
      ['enhancedSwapService', ENHANCED_SWAP_TOKENS],
    ])(
      'every %s token address is a valid (checksummed) address',
      (_, lists) => {
        for (const tokens of Object.values(lists)) {
          for (const token of tokens) {
            expect({
              symbol: token.symbol,
              valid: isAddress(token.address),
            }).toEqual({ symbol: token.symbol, valid: true });
          }
        }
      },
    );

    it('uses the real mainnet DAI contract', () => {
      const dai = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
      expect(SWAP_TOKENS[1].find(t => t.symbol === 'DAI')?.address).toBe(dai);
      expect(
        ENHANCED_SWAP_TOKENS[1].find(t => t.symbol === 'DAI')?.address,
      ).toBe(dai);
    });
  });
});
