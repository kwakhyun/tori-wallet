import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

it('creates the braces depth guard on a clean install', () => {
  const { parsePatchFile } = require('patch-package/dist/patch/parse');
  const { executeEffects } = require('patch-package/dist/patch/apply');
  const patch = readFileSync('patches/braces+3.0.3.patch', 'utf8');
  const firstFile = 'diff --git ' + patch.split(/^diff --git /m)[1];
  const directory = mkdtempSync(path.join(tmpdir(), 'tori-patch-install-'));
  try {
    executeEffects(parsePatchFile(firstFile), {
      dryRun: false,
      cwd: directory,
    });
    const guard = readFileSync(
      path.join(directory, 'node_modules/braces/lib/depth-guard.js'),
      'utf8',
    );
    expect(guard).toBe(
      readFileSync('node_modules/braces/lib/depth-guard.js', 'utf8'),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

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
