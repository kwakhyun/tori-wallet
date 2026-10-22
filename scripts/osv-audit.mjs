#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';
const LOCKFILE = new URL('../yarn.lock', import.meta.url);
const CONFIG_FILE = new URL('../osv-scanner.toml', import.meta.url);
const BATCH_SIZE = 1000;

export async function parseActiveIgnores(
  config,
  today = new Date().toISOString().slice(0, 10),
) {
  config ??= await readFile(CONFIG_FILE, 'utf8');
  const ignores = new Map();
  const blocks = config.matchAll(/\[\[IgnoredVulns\]\]([\s\S]*?)(?=\n\[\[|$)/g);

  for (const [, block] of blocks) {
    for (const [, key] of block.matchAll(/^([\w.]+)\s*=/gm)) {
      if (!['id', 'reason', 'ignoreUntil'].includes(key))
        throw new Error(`Unsupported native OSV configuration key: ${key}`);
    }
    const id = block.match(/^id\s*=\s*"([^"]+)"\s*$/m)?.[1];
    const reason = block.match(/^reason\s*=\s*"([^"]+)"\s*$/m)?.[1];
    const ignoreUntil = block.match(
      /^ignoreUntil\s*=\s*"?(\d{4}-\d{2}-\d{2})"?\s*$/m,
    )?.[1];

    if (!id || !reason || !ignoreUntil || ignoreUntil < today) continue;
    const field = name =>
      block.match(
        new RegExp(`^#\\s*audit\\.${name}\\s*=\\s*"([^"\\n]+)"\\s*$`, 'm'),
      )?.[1];
    const packageName = field('package');
    const version = field('version');
    const patch = field('patch');
    const hash = field('patchSha256');
    if (!packageName || !version || !patch || !hash)
      throw new Error(`Unscoped security exception: ${id}`);
    const contents = await readFile(new URL(`../${patch}`, import.meta.url));
    if (createHash('sha256').update(contents).digest('hex') !== hash)
      throw new Error(`Security patch hash changed: ${patch}`);
    ignores.set(`${id}:${packageName}:${version}`, { reason, ignoreUntil });
  }

  return ignores;
}

function parseNpmPackages(lockfile) {
  const packages = [];
  const seen = new Set();
  const resolutionPattern = /^\s+resolution: "(.+)@npm:([^"#]+)"\s*$/gm;

  for (const match of lockfile.matchAll(resolutionPattern)) {
    const [, name, version] = match;
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    packages.push({ name, version });
  }

  return packages;
}

async function queryBatch(packages) {
  const response = await fetch(OSV_BATCH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      queries: packages.map(({ name, version }) => ({
        package: { ecosystem: 'npm', name },
        version,
      })),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `OSV API failed: ${response.status} ${response.statusText}`,
    );
  }

  const body = await response.json();
  if (!Array.isArray(body.results) || body.results.length !== packages.length) {
    throw new Error('OSV API returned an unexpected result set');
  }

  return body.results;
}

async function main() {
  execFileSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('./verify-dependency-patches.cjs', import.meta.url),
      ),
    ],
    {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      timeout: 30000,
      stdio: 'inherit',
    },
  );
  const lockfile = await readFile(LOCKFILE, 'utf8');
  const activeIgnores = await parseActiveIgnores();
  const packages = parseNpmPackages(lockfile);

  if (packages.length === 0) {
    throw new Error('No npm packages were found in yarn.lock');
  }

  const findings = [];
  for (let offset = 0; offset < packages.length; offset += BATCH_SIZE) {
    const batch = packages.slice(offset, offset + BATCH_SIZE);
    const results = await queryBatch(batch);

    results.forEach((result, index) => {
      for (const vulnerability of result.vulns || []) {
        findings.push({
          id: vulnerability.id,
          package: batch[index].name,
          version: batch[index].version,
        });
      }
    });
  }

  const mitigated = findings.filter(finding =>
    activeIgnores.has(`${finding.id}:${finding.package}:${finding.version}`),
  );
  const actionable = findings.filter(
    finding =>
      !activeIgnores.has(`${finding.id}:${finding.package}:${finding.version}`),
  );

  if (actionable.length === 0) {
    console.log(
      `OSV audit passed: ${packages.length} locked npm packages, 0 actionable known vulnerabilities.`,
    );
    mitigated.forEach(finding => {
      const exception = activeIgnores.get(
        `${finding.id}:${finding.package}:${finding.version}`,
      );
      console.log(
        `- mitigated until ${exception.ignoreUntil}: ${finding.id} on ${finding.package}@${finding.version}`,
      );
    });
    return;
  }

  console.error(
    `OSV audit found ${actionable.length} actionable package/version pair(s):`,
  );
  actionable
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach(finding => {
      console.error(
        `- ${finding.id}: ${finding.package}@${finding.version} (https://osv.dev/vulnerability/${finding.id})`,
      );
    });
  process.exitCode = 1;
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main().catch(error => {
    console.error(`OSV audit could not complete: ${error.message}`);
    process.exitCode = 2;
  });
}
