#!/usr/bin/env node
// Reproduces what a correct, skill-following run produces for each eval.
//
// This is not an agent. It is the same walkthrough SKILL.md prescribes — init,
// (optionally) point outputDir at the directory the user named, generate, and
// insert the managed block only when the request authorized a README edit — run
// by script so CI has a known-good output to grade. Agent behaviour still needs
// a real run; see evals/README.md.
//
// Usage: node evals/reference-run.mjs <eval-id> <empty-dir>

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixturePath, loadEvals } from './grade.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const CLI = path.join(REPO, 'bin', 'dbx.mjs');

/** The choices a careful run makes for each eval, including the user's own words. */
const RUNS = {
  insert: {
    args: ['--preset', 'ascii', '--theme', 'terminal', '--title', 'ACME WIDGET CLI', '--tagline', 'A tiny CLI that prints widgets in your terminal'],
    readme: 'README.md',
  },
  assets: {
    args: ['--preset', 'ascii', '--theme', 'ocean', '--title', 'LEDGER-SYNC', '--tagline', '批量同步本地账本，断点续传，可回滚'],
    // 用户说"放 assets 里" → outputDir 就是 assets，不是默认的 assets/banner。
    outputDir: 'assets',
    readme: null,
  },
  vague: {
    args: ['--preset', 'ascii', '--theme', 'minimal', '--title', 'ACME WIDGET CLI'],
    readme: null,
  },
};

function dbx(cwd, args) {
  const res = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`dbx ${args.join(' ')} failed (exit ${res.status}):\n${res.stdout ?? ''}${res.stderr ?? ''}`);
  }
  return res.stdout ?? '';
}

/**
 * Build the reference output for one eval inside `target` (created from the
 * fixture; it must not exist yet). Returns the target path.
 */
export function runReference(evalIdOrSlug, target) {
  const { evals } = loadEvals();
  const spec = evals.find((e) => String(e.id) === String(evalIdOrSlug) || e.slug === evalIdOrSlug);
  if (!spec) throw new Error(`unknown eval: ${evalIdOrSlug}`);
  const plan = RUNS[spec.kind];
  if (!plan) throw new Error(`no reference plan for kind: ${spec.kind}`);

  if (existsSync(target)) throw new Error(`target already exists: ${target}`);
  cpSync(fixturePath(spec.fixture), target, { recursive: true });

  dbx(target, ['init', '--cwd', target, '--config', 'banner.config.json', ...plan.args]);

  if (plan.outputDir) {
    const file = path.join(target, 'banner.config.json');
    const config = JSON.parse(readFileSync(file, 'utf8'));
    config.outputDir = plan.outputDir;
    writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  }

  dbx(target, ['generate', '--cwd', target, '--config', 'banner.config.json']);
  if (plan.readme) {
    dbx(target, ['generate', '--cwd', target, '--config', 'banner.config.json', '--readme', plan.readme]);
  }

  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [evalArg, targetArg] = process.argv.slice(2);
  if (!evalArg || !targetArg) {
    console.error('usage: node evals/reference-run.mjs <eval-id> <empty-dir>');
    process.exitCode = 2;
  } else {
    try {
      console.log(`reference output for eval ${evalArg} → ${runReference(evalArg, path.resolve(targetArg))}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
