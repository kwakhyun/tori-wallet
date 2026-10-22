import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const config = readFileSync('osv-scanner.toml', 'utf8');
const evaluate = (input: string, today = '2026-10-22') =>
  spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { parseActiveIgnores } from './scripts/osv-audit.mjs';
       import { readFileSync } from 'node:fs';
       const ignores = await parseActiveIgnores(readFileSync(0, 'utf8'), process.argv[1]);
       console.log(JSON.stringify([...ignores.keys()]));`,
      today,
    ],
    { input, encoding: 'utf8', timeout: 5000 },
  );

it('uses native OSV keys while retaining exact package and version scopes', () => {
  const result = evaluate(config);
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  const scopes = JSON.parse(result.stdout);
  expect(scopes).toHaveLength(8);
  expect(scopes).toContain('GHSA-vfj7-8cjw-p6xm:braces:3.0.3');
  expect(scopes).not.toContain('GHSA-vfj7-8cjw-p6xm:braces:3.0.2');
});

it('rejects custom TOML keys that make the native scanner discard its config', () => {
  const result = evaluate(config.replace('# audit.package =', 'package ='));
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Unsupported native OSV configuration key');
});

it('fails closed when scoped metadata is missing', () => {
  const result = evaluate(config.replace(/^# audit\.version =.*\n/m, ''));
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Unscoped security exception');
});

it('fails closed when a patch hash no longer matches', () => {
  const result = evaluate(
    config.replace(/(# audit\.patchSha256 = ")[^"]+/, '$1' + '0'.repeat(64)),
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Security patch hash changed');
});

it('stops applying exceptions after their expiry', () => {
  const result = evaluate(config, '2027-01-21');
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual([]);
});
