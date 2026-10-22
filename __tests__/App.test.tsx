import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import { transactionTracker } from '../src/services/transactionTracker';

test('starts recovery with the app and removes its polling timer on unmount', async () => {
  jest.useFakeTimers();
  const reconcile = jest
    .spyOn(transactionTracker, 'reconcile')
    .mockResolvedValue(undefined);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    expect(reconcile).toHaveBeenCalled();
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
    const calls = reconcile.mock.calls.length;
    await ReactTestRenderer.act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    expect(reconcile).toHaveBeenCalledTimes(calls);
  } finally {
    transactionTracker.stop();
    reconcile.mockRestore();
    jest.useRealTimers();
  }
});
