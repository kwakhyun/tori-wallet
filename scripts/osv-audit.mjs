#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';
const LOCKFILE = new URL('../yarn.lock', import.meta.url);
const CONFIG_FILE = new URL('../osv-scanner.toml', import.meta.url);
const BATCH_SIZE = 1000;

async function parseActiveIgnores() {
  let config;
  try {
    config = await readFile(CONFIG_FILE, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return new Map();
    throw error;
  }

  const today = new Date().toISOString().slice(0, 10);
  const ignores = new Map();
  const blocks = config.matchAll(
    /\[\[IgnoredVulns\]\]([\s\S]*?)(?=\n\[\[|$)/g,
  );

  for (const [, block] of blocks) {
    const id = block.match(/^id\s*=\s*"([^"]+)"\s*$/m)?.[1];
    const reason = block.match(/^reason\s*=\s*"([^"]+)"\s*$/m)?.[1];
    const ignoreUntil = block.match(
      /^ignoreUntil\s*=\s*"?(\d{4}-\d{2}-\d{2})"?\s*$/m,
    )?.[1];

    if (!id || !reason || !ignoreUntil || ignoreUntil < today) continue;
    ignores.set(id, { reason, ignoreUntil });
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
    throw new Error(`OSV API failed: ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
  if (!Array.isArray(body.results) || body.results.length !== packages.length) {
    throw new Error('OSV API returned an unexpected result set');
  }

  return body.results;
}

async function main() {
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

  const mitigated = findings.filter(finding => activeIgnores.has(finding.id));
  const actionable = findings.filter(
    finding => !activeIgnores.has(finding.id),
  );

  if (actionable.length === 0) {
    console.log(
      `OSV audit passed: ${packages.length} locked npm packages, 0 actionable known vulnerabilities.`,
    );
    mitigated.forEach(finding => {
      const exception = activeIgnores.get(finding.id);
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

main().catch(error => {
  console.error(`OSV audit could not complete: ${error.message}`);
  process.exitCode = 2;
});
