/**
 * 트랜잭션 히스토리 서비스 테스트
 * - txlist + tokentx 병합 (ERC-20 전송, 스왑, 승인 구분)
 * - 조회 실패는 빈 목록이 아니라 오류
 */

import {
  transactionHistoryService,
  TransactionHistoryError,
  type Transaction,
} from '../../src/services/transactionHistory';

const ME = '0x1234567890123456789012345678901234567890';
const OTHER = '0x0987654321098765432109876543210987654321';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

const ok = (result: unknown[]) => ({
  ok: true,
  json: () => Promise.resolve({ status: '1', message: 'OK', result }),
});
const empty = (message = 'No transactions found') => ({
  ok: true,
  json: () => Promise.resolve({ status: '0', message, result: [] }),
});

/** action=txlist / action=tokentx 별로 응답 지정 */
function mockExplorer(txlist: unknown, tokentx: unknown = empty()) {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    const response = url.includes('action=tokentx') ? tokentx : txlist;
    return response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response);
  });
}

const baseTx = {
  hash: '0xabc123',
  from: ME,
  to: OTHER,
  value: '1000000000000000000',
  gasUsed: '21000',
  gasPrice: '50000000000',
  timeStamp: '1700000000',
  blockNumber: '12345678',
  isError: '0',
  input: '0x',
};

describe('TransactionHistoryService', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    transactionHistoryService.clearCache();
  });

  it('returns an empty list for unsupported chains', async () => {
    await expect(
      transactionHistoryService.getTransactions(ME, 999999),
    ).resolves.toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('treats "No transactions found" as a genuine empty result', async () => {
    mockExplorer(empty(), empty('No token transfers found'));
    await expect(
      transactionHistoryService.getTransactions(ME, 1),
    ).resolves.toEqual([]);
  });

  it('requests both txlist and tokentx', async () => {
    mockExplorer(empty());
    await transactionHistoryService.getHistoryPage(ME, 1, 2, 20);
    const urls = (global.fetch as jest.Mock).mock.calls.map(c => c[0]);
    expect(urls.some((u: string) => u.includes('action=txlist'))).toBe(true);
    expect(urls.some((u: string) => u.includes('action=tokentx'))).toBe(true);
    expect(urls.every((u: string) => u.includes('page=2'))).toBe(true);
  });

  it('maps native sends with full-precision value and fee', async () => {
    mockExplorer(ok([baseTx]));
    const [tx] = await transactionHistoryService.getTransactions(ME, 1);
    expect(tx).toMatchObject({
      hash: '0xabc123',
      type: 'send',
      status: 'success',
      value: '1',
      fee: '0.00105',
    });
  });

  it('identifies receives (no fee charged to me)', async () => {
    mockExplorer(ok([{ ...baseTx, from: OTHER, to: ME }]));
    const [tx] = await transactionHistoryService.getTransactions(ME, 1);
    expect(tx.type).toBe('receive');
    expect(tx.fee).toBe('0');
  });

  it('marks failed transactions', async () => {
    mockExplorer(ok([{ ...baseTx, isError: '1' }]));
    const [tx] = await transactionHistoryService.getTransactions(ME, 1);
    expect(tx.status).toBe('failed');
    expect(tx.isError).toBe(true);
  });

  it('keeps tiny amounts as numeric strings (no "< 0.000001" text)', async () => {
    mockExplorer(ok([{ ...baseTx, value: '1000' }]));
    const [tx] = await transactionHistoryService.getTransactions(ME, 1);
    expect(tx.value).toBe('0.000000000000001');
    expect(Number.isNaN(Number(tx.value))).toBe(false);
  });

  it('includes ERC-20 transfers that only appear in tokentx', async () => {
    mockExplorer(
      empty(),
      ok([
        {
          hash: '0xtoken-in',
          from: OTHER,
          to: ME,
          value: '2500000',
          contractAddress: USDC,
          tokenSymbol: 'USDC',
          tokenName: 'USD Coin',
          tokenDecimal: '6',
          timeStamp: '1700000100',
          blockNumber: '12345679',
        },
      ]),
    );
    const [tx] = await transactionHistoryService.getTransactions(ME, 1);
    expect(tx).toMatchObject({
      hash: '0xtoken-in',
      type: 'receive',
      value: '2.5',
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
      tokenAddress: USDC,
      fee: '0',
    });
  });

  it('merges my token send with its txlist entry (fee + real recipient)', async () => {
    mockExplorer(
      ok([{ ...baseTx, hash: '0xsend-usdc', to: USDC, value: '0' }]),
      ok([
        {
          hash: '0xsend-usdc',
          from: ME,
          to: OTHER,
          value: '1000000',
          contractAddress: USDC,
          tokenSymbol: 'USDC',
          tokenDecimal: '6',
          timeStamp: '1700000000',
          blockNumber: '12345678',
        },
      ]),
    );
    const txs = await transactionHistoryService.getTransactions(ME, 1);
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({
      type: 'send',
      to: OTHER,
      value: '1',
      tokenSymbol: 'USDC',
      fee: '0.00105',
    });
  });

  it('labels swaps (token out + token in) instead of send/receive', async () => {
    mockExplorer(
      ok([{ ...baseTx, hash: '0xswap', to: ROUTER, value: '0' }]),
      ok([
        {
          hash: '0xswap',
          from: ME,
          to: ROUTER,
          value: '1000000',
          contractAddress: USDC,
          tokenSymbol: 'USDC',
          tokenDecimal: '6',
          timeStamp: '1700000000',
          blockNumber: '1',
        },
        {
          hash: '0xswap',
          from: ROUTER,
          to: ME,
          value: '500000000000000000',
          contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          tokenSymbol: 'WETH',
          tokenDecimal: '18',
          timeStamp: '1700000000',
          blockNumber: '1',
        },
      ]),
    );
    const [tx] = await transactionHistoryService.getTransactions(ME, 1);
    expect(tx).toMatchObject({
      type: 'swap',
      value: '1',
      tokenSymbol: 'USDC',
      receivedValue: '0.5',
      receivedSymbol: 'WETH',
    });
  });

  it('labels approvals from the method selector', async () => {
    mockExplorer(
      ok([
        {
          ...baseTx,
          hash: '0xapprove',
          to: USDC,
          value: '0',
          input: '0x095ea7b3' + '0'.repeat(128),
        },
      ]),
    );
    const [tx] = await transactionHistoryService.getTransactions(ME, 1);
    expect(tx.type).toBe('approve');
  });

  it('labels value-less contract calls as contract interactions', async () => {
    mockExplorer(
      ok([{ ...baseTx, hash: '0xcall', value: '0', input: '0xa9059cbb00' }]),
    );
    const [tx] = await transactionHistoryService.getTransactions(ME, 1);
    expect(tx.type).toBe('contract');
  });

  it('sorts merged results newest first and reports more pages', async () => {
    mockExplorer(
      ok([
        { ...baseTx, hash: '0xold', timeStamp: '1600000000' },
        { ...baseTx, hash: '0xnew', timeStamp: '1700000000' },
      ]),
    );
    const page = await transactionHistoryService.getHistoryPage(ME, 1, 1, 2);
    expect(page.transactions.map(t => t.hash)).toEqual(['0xnew', '0xold']);
    expect(page.hasMore).toBe(true);
  });

  it('throws on network errors instead of returning an empty list', async () => {
    mockExplorer(new Error('Network error'));
    await expect(
      transactionHistoryService.getTransactions(ME, 1),
    ).rejects.toBeInstanceOf(TransactionHistoryError);
  });

  it('throws on API error responses', async () => {
    mockExplorer({
      ok: true,
      json: () =>
        Promise.resolve({
          status: '0',
          message: 'NOTOK',
          result: 'Error! Invalid address format',
        }),
    });
    await expect(
      transactionHistoryService.getTransactions('invalid-address', 1),
    ).rejects.toThrow();
  });

  it('still returns normal history when only the token transfer request fails', async () => {
    mockExplorer(ok([baseTx]), new Error('tokentx down'));
    const txs = await transactionHistoryService.getTransactions(ME, 1);
    expect(txs).toHaveLength(1);
  });

  it('uses the cache on repeated calls and bypasses it on forceRefresh', async () => {
    mockExplorer(ok([baseTx]));
    await transactionHistoryService.getTransactions(ME, 1);
    await transactionHistoryService.getTransactions(ME, 1);
    expect(global.fetch).toHaveBeenCalledTimes(2); // txlist + tokentx 1회

    await transactionHistoryService.getTransactions(ME, 1, 1, 20, true);
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  describe('combinePages (txlist and tokentx are paged independently)', () => {
    const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
    const spam = (i: number) => ({
      hash: `0xspam${i}`,
      from: OTHER,
      to: ME,
      value: '1',
      contractAddress: '0x9999999999999999999999999999999999999999',
      tokenSymbol: 'SPAM',
      tokenDecimal: '0',
      timeStamp: String(1700000100 + i),
      blockNumber: '2',
    });
    const swapLegs = [
      {
        hash: '0xswap',
        from: ME,
        to: ROUTER,
        value: '1000000',
        contractAddress: USDC,
        tokenSymbol: 'USDC',
        tokenDecimal: '6',
        timeStamp: '1600000000',
        blockNumber: '1',
      },
      {
        hash: '0xswap',
        from: ROUTER,
        to: ME,
        value: '500000000000000000',
        contractAddress: WETH,
        tokenSymbol: 'WETH',
        tokenDecimal: '18',
        timeStamp: '1600000000',
        blockNumber: '1',
      },
    ];
    /** page 1: txlist에 스왑, tokentx는 더 최근 스팸으로 가득 / page 2: 스왑의 토큰 전송 */
    function mockPages() {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        const page2 = url.includes('page=2');
        if (url.includes('action=tokentx'))
          return Promise.resolve(page2 ? ok(swapLegs) : ok([spam(1), spam(2)]));
        return Promise.resolve(
          page2
            ? empty()
            : ok([
                {
                  ...baseTx,
                  hash: '0xswap',
                  to: ROUTER,
                  value: '0',
                  timeStamp: '1600000000',
                  input: '0x12345678',
                },
              ]),
        );
      });
    }

    it('re-labels a swap once its transfers arrive on a later tokentx page', async () => {
      mockPages();
      const page1 = await transactionHistoryService.getHistoryPage(ME, 1, 1, 2);
      expect(
        transactionHistoryService
          .combinePages([page1])
          .find(tx => tx.hash === '0xswap')?.type,
      ).toBe('contract');

      const page2 = await transactionHistoryService.getHistoryPage(ME, 1, 2, 2);
      const combined = transactionHistoryService.combinePages([page1, page2]);
      expect(combined.filter(tx => tx.hash === '0xswap')).toEqual([
        expect.objectContaining({
          type: 'swap',
          value: '1',
          tokenSymbol: 'USDC',
          receivedValue: '0.5',
          receivedSymbol: 'WETH',
        }),
      ]);
      expect(combined.map(tx => tx.hash)).toEqual([
        '0xspam2',
        '0xspam1',
        '0xswap',
      ]);
    });

    it('does not double-count a transfer repeated across pages', async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) =>
        Promise.resolve(
          url.includes('action=tokentx') ? ok([spam(1)]) : empty(),
        ),
      );
      const page1 = await transactionHistoryService.getHistoryPage(ME, 1, 1, 1);
      const page2 = await transactionHistoryService.getHistoryPage(ME, 1, 2, 1);
      const combined = transactionHistoryService.combinePages([page1, page2]);
      expect(combined).toHaveLength(1);
      expect(combined[0]).toMatchObject({ type: 'receive', value: '1' });
    });

    it('falls back to concatenating pages without raw data', () => {
      const tx = (hash: string) =>
        ({ hash, timestamp: 1 } as unknown as Transaction);
      expect(
        transactionHistoryService
          .combinePages([
            { transactions: [tx('0xa'), tx('0xb')], hasMore: true },
            { transactions: [tx('0xB'), tx('0xc')], hasMore: false },
          ])
          .map(t => t.hash),
      ).toEqual(['0xa', '0xb', '0xc']);
    });
  });

  it('clears only the cached pages of one address and chain', async () => {
    mockExplorer(ok([baseTx]));
    await transactionHistoryService.getTransactions(ME, 1);
    await transactionHistoryService.getTransactions(ME, 137);
    expect(global.fetch).toHaveBeenCalledTimes(4);
    transactionHistoryService.clearCache(
      ME.toUpperCase().replace('0X', '0x'),
      1,
    );
    await transactionHistoryService.getTransactions(ME, 137); // cached
    expect(global.fetch).toHaveBeenCalledTimes(4);
    await transactionHistoryService.getTransactions(ME, 1); // refetched
    expect(global.fetch).toHaveBeenCalledTimes(6);
  });

  it('does not cache failures', async () => {
    mockExplorer(new Error('offline'));
    await expect(
      transactionHistoryService.getTransactions(ME, 1),
    ).rejects.toThrow();
    mockExplorer(ok([baseTx]));
    await expect(
      transactionHistoryService.getTransactions(ME, 1),
    ).resolves.toHaveLength(1);
  });
});
