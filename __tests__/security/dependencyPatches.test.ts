import { spawnSync } from 'node:child_process';

it('executes the installed dependency security regressions without hanging', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/verify-dependency-patches.cjs'],
    { cwd: process.cwd(), timeout: 30000, encoding: 'utf8' },
  );
  expect({
    error: result.error,
    status: result.status,
    stderr: result.stderr,
  }).toEqual({ error: undefined, status: 0, stderr: '' });
  expect(result.stdout).toContain('Dependency patch regressions passed.');
}, 35000);
