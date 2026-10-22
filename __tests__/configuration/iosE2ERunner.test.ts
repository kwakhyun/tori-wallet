const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');
const {
  selectSimulator,
  runIosE2E,
  runCommand,
} = require('../../scripts/ios-e2e.cjs');

const deviceType = { name: 'iPhone 15 Pro', identifier: 'device.iphone15pro' };
const runtime = (version: string, isAvailable = true) => ({
  version,
  identifier: `com.apple.CoreSimulator.SimRuntime.iOS-${version.replace(
    '.',
    '-',
  )}`,
  isAvailable,
  supportedDeviceTypes: [deviceType],
});
const inventory = {
  devicetypes: [deviceType],
  runtimes: [runtime('18.9'), runtime('18.10'), runtime('27.0', false)],
  devices: { existing: [{ udid: 'developers-wallet-simulator' }] },
};

describe('isolated iOS E2E runner', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('cancels the entire owned test process group and waits for it to close', async () => {
    const child = new EventEmitter();
    child.pid = 654321;
    const spawn = jest.spyOn(childProcess, 'spawn').mockReturnValue(child);
    const kill = jest.spyOn(process, 'kill').mockReturnValue(true);
    const controller = new AbortController();
    const command = runCommand('node', ['detox'], {
      inherit: true,
      signal: controller.signal,
    });
    controller.abort();
    expect(spawn).toHaveBeenCalledWith(
      'node',
      ['detox'],
      expect.objectContaining({ detached: true }),
    );
    expect(kill).toHaveBeenCalledWith(-654321, 'SIGTERM');
    child.emit('close', null, 'SIGTERM');
    await expect(command).rejects.toThrow('SIGTERM');
  });

  it('does not launch a process for an already cancelled request', async () => {
    const spawn = jest.spyOn(childProcess, 'spawn');
    const controller = new AbortController();
    controller.abort();
    await expect(
      runCommand('node', [], { inherit: true, signal: controller.signal }),
    ).rejects.toThrow('cancelled');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('selects the latest available compatible runtime numerically', () => {
    const withUnsupported = {
      ...inventory,
      runtimes: [
        ...inventory.runtimes,
        { ...runtime('26.0'), supportedDeviceTypes: [] },
      ],
    };
    expect(
      selectSimulator(withUnsupported, deviceType.name).runtime.version,
    ).toBe('18.10');
  });

  it('honors an explicitly selected installed runtime', () => {
    expect(
      selectSimulator(inventory, deviceType.identifier, '18.9').runtime.version,
    ).toBe('18.9');
  });

  it('fails before creating a device when the selected runtime is unavailable', () => {
    expect(() => selectSimulator(inventory, deviceType.name, '27.0')).toThrow(
      'No installed iOS runtime',
    );
  });

  function commands(failCommand?: string) {
    return jest.fn(async (file: string, args: string[]) => {
      if (file === process.execPath) {
        if (failCommand === 'detox') throw new Error('test failed');
        return '';
      }
      if (args[1] === failCommand) throw new Error(`${failCommand} failed`);
      if (args[1] === 'list') return JSON.stringify(inventory);
      if (args[1] === 'create') return 'new-disposable-uuid\n';
      return '';
    });
  }

  it('targets only its fresh device and deletes it after successful tests', async () => {
    const run = commands();
    await runIosE2E({
      run,
      env: { DETOX_IOS_UDID: 'developers-wallet-simulator' },
    });
    expect(run).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining(['ios.sim.e2e']),
      expect.objectContaining({
        env: expect.objectContaining({
          DETOX_IOS_UDID: 'new-disposable-uuid',
          TORI_E2E_SIMULATOR_UDID: 'new-disposable-uuid',
        }),
      }),
    );
    expect(run.mock.calls.slice(-2).map(call => call[1])).toEqual([
      ['simctl', 'shutdown', 'new-disposable-uuid'],
      ['simctl', 'delete', 'new-disposable-uuid'],
    ]);
    expect(run.mock.calls.flatMap(call => call[1])).not.toContain(
      'developers-wallet-simulator',
    );
  });

  it.each(['detox', 'boot', 'bootstatus'])(
    'deletes its device when %s fails',
    async failure => {
      const run = commands(failure);
      await expect(runIosE2E({ run, env: {} })).rejects.toThrow('failed');
      expect(run).toHaveBeenLastCalledWith(
        'xcrun',
        ['simctl', 'delete', 'new-disposable-uuid'],
        {},
      );
    },
  );

  it('forwards an explicit configuration without adding a competing default', async () => {
    const run = commands();
    await runIosE2E({
      run,
      env: {},
      args: ['--configuration', 'ios.sim.release', '--headless'],
    });
    const invocation = run.mock.calls.find(
      call => call[0] === process.execPath,
    );
    expect(invocation?.[1]).toEqual(
      expect.arrayContaining([
        '--configuration',
        'ios.sim.release',
        '--headless',
      ]),
    );
    expect(invocation?.[1]).not.toContain('ios.sim.e2e');
  });

  it('attempts deletion even if shutdown fails', async () => {
    const run = commands('shutdown');
    await expect(runIosE2E({ run, env: {} })).rejects.toThrow(
      'shutdown failed',
    );
    expect(run).toHaveBeenLastCalledWith(
      'xcrun',
      ['simctl', 'delete', 'new-disposable-uuid'],
      {},
    );
  });

  it('retains the created UUID for cleanup when cancelled during creation', async () => {
    const controller = new AbortController();
    const execute = commands();
    const run = jest.fn(
      async (
        file: string,
        args: string[],
        options: { signal?: AbortSignal } = {},
      ) => {
        if (args[1] === 'create') {
          expect(options.signal).toBeUndefined();
          controller.abort();
        }
        if (options.signal?.aborted) throw new Error('cancelled');
        return execute(file, args);
      },
    );
    await expect(
      runIosE2E({ run, env: {}, signal: controller.signal }),
    ).rejects.toThrow('cancelled');
    expect(run).toHaveBeenLastCalledWith(
      'xcrun',
      ['simctl', 'delete', 'new-disposable-uuid'],
      {},
    );
  });
});
