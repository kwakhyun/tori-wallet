const childProcess = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');

const exec = promisify(childProcess.execFile);
const projectRoot = path.resolve(__dirname, '..');

function selectSimulator(inventory, deviceName, runtimeVersion) {
  const deviceType = inventory.devicetypes.find(
    type => type.name === deviceName || type.identifier === deviceName,
  );
  if (!deviceType)
    throw new Error(`Unknown simulator device type: ${deviceName}`);

  const runtime = inventory.runtimes
    .filter(
      item =>
        item.isAvailable &&
        item.identifier.startsWith('com.apple.CoreSimulator.SimRuntime.iOS-') &&
        (!runtimeVersion ||
          item.version === runtimeVersion ||
          item.identifier === runtimeVersion) &&
        item.supportedDeviceTypes?.some(
          type => type.identifier === deviceType.identifier,
        ),
    )
    .sort((a, b) =>
      b.version.localeCompare(a.version, 'en', { numeric: true }),
    )[0];
  if (!runtime) {
    throw new Error(
      `No installed iOS runtime supports ${deviceName}${
        runtimeVersion ? ` (${runtimeVersion})` : ''
      }. Install one in Xcode Settings > Components.`,
    );
  }
  return { deviceType, runtime };
}

async function runCommand(file, args, options = {}) {
  if (!options.inherit) {
    return (await exec(file, args, { timeout: 60000, ...options })).stdout;
  }
  await new Promise((resolve, reject) => {
    const { signal, ...spawnOptions } = options;
    delete spawnOptions.inherit;
    if (signal?.aborted) {
      reject(new Error('Command cancelled before launch'));
      return;
    }
    // Give Detox and its Jest children their own process group. Cancelling only
    // the CLI would leave Jest running against a simulator being deleted.
    const child = childProcess.spawn(file, args, {
      ...spawnOptions,
      detached: true,
      stdio: 'inherit',
    });
    const abort = () => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') reject(error);
      }
    };
    const cleanup = () => signal?.removeEventListener('abort', abort);
    child.once('error', error => {
      cleanup();
      reject(error);
    });
    child.once('close', (code, exitSignal) => {
      cleanup();
      if (code === 0) resolve();
      else
        reject(
          new Error(`${path.basename(file)} failed (${exitSignal || code})`),
        );
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

async function runIosE2E({
  run = runCommand,
  env = process.env,
  args = [],
  signal,
} = {}) {
  const simctl = (args_, options = {}) =>
    run('xcrun', ['simctl', ...args_], options);
  const inventory = JSON.parse(await simctl(['list', '--json'], { signal }));
  const { deviceType, runtime } = selectSimulator(
    inventory,
    env.DETOX_IOS_DEVICE || 'iPhone 15 Pro',
    env.DETOX_IOS_RUNTIME,
  );
  const configurationArgs = args.some(
    arg =>
      arg === '-c' ||
      arg === '--configuration' ||
      arg.startsWith('--configuration='),
  )
    ? []
    : ['--configuration', 'ios.sim.e2e'];
  // Always create a disposable device: tests clear its entire Keychain.
  const udid =
    // Receive the UUID even if cancellation arrives during creation, so the
    // following aborted boot still reaches the cleanup block below.
    (
      await simctl([
        'create',
        `ToriWallet E2E ${process.pid}`,
        deviceType.identifier,
        runtime.identifier,
      ])
    ).trim();
  console.log(`iOS E2E: ${deviceType.name}, iOS ${runtime.version}, ${udid}`);
  try {
    await simctl(['boot', udid], { signal });
    await simctl(['bootstatus', udid, '-b'], { timeout: 180000, signal });
    await run(
      process.execPath,
      [
        require.resolve('detox/local-cli/cli.js'),
        'test',
        ...configurationArgs,
        ...args,
      ],
      {
        cwd: projectRoot,
        inherit: true,
        signal,
        env: { ...env, DETOX_IOS_UDID: udid, TORI_E2E_SIMULATOR_UDID: udid },
      },
    );
  } finally {
    // Cleanup still runs after test failures, failed boots, and interruptions.
    // Only the UUID returned by this invocation's create command is touched.
    try {
      await simctl(['shutdown', udid]);
    } finally {
      await simctl(['delete', udid]);
    }
  }
}

module.exports = { selectSimulator, runIosE2E, runCommand };

if (require.main === module) {
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  runIosE2E({ args: process.argv.slice(2), signal: controller.signal })
    .catch(error => {
      console.error(error.message);
      process.exitCode = controller.signal.aborted ? 130 : 1;
    })
    .finally(() => {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    });
}
