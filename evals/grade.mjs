#!/usr/bin/env node
// Mechanical grader for the dbx-readme skill evals.
//
// Every expectation in evals.json is decided by inspecting the run directory —
// files on disk, the managed markers in README.md, and the exit code of
// `dbx generate --check`. No model judges anything, so the same directory always
// scores the same, and CI can grade a known-good run without an LLM.
//
// Usage:
//   node evals/grade.mjs <eval-id> <run-dir> [--json] [--out <grading.json>]
//
// Exit code is 1 when any expectation fails.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = path.resolve(import.meta.dirname, '..');
const CLI = path.join(REPO, 'bin', 'dbx.mjs');
const START = '<!-- readme-banner:start -->';
const END = '<!-- readme-banner:end -->';
export const MANAGED_START = START;
export const MANAGED_END = END;

const md5 = (file) => createHash('md5').update(readFileSync(file)).digest('hex');
const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null);

export function loadEvals(file = path.join(import.meta.dirname, 'evals.json')) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function fixturePath(name) {
  return path.join(import.meta.dirname, 'fixtures', name);
}

function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(full, base, out);
    } else if (entry.isFile()) {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out;
}

/** Files the run added to or changed in the fixture. */
export function deliverableFiles(target, fixture) {
  const changed = [];
  for (const rel of walk(target)) {
    const base = path.join(fixture, rel);
    if (!existsSync(base)) changed.push(rel);
    else if (md5(path.join(target, rel)) !== md5(base)) changed.push(rel);
  }
  return changed;
}

/** README with the managed block cut out, or null when the markers are missing. */
function stripManagedBlock(text) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(0, start) + text.slice(end + END.length);
}

function runCheck(target) {
  const config = path.join(target, 'banner.config.json');
  if (!existsSync(config)) return { ok: false, detail: '没有 banner.config.json，无法运行 --check' };
  const res = spawnSync(
    process.execPath,
    [CLI, 'generate', '--cwd', target, '--config', 'banner.config.json', '--check'],
    { encoding: 'utf8' },
  );
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim().split('\n').slice(-2).join(' ');
  return { ok: res.status === 0, detail: `exit ${res.status}${output ? ` — ${output}` : ''}` };
}

/** Any light/dark SVG pair the run produced, wherever it put the assets dir. */
function svgPairs(target) {
  const files = walk(target).filter((rel) => /\.svg$/i.test(rel));
  const lights = files.filter((rel) => /(^|[/.-])light\.svg$/i.test(rel));
  const darks = files.filter((rel) => /(^|[/.-])dark\.svg$/i.test(rel));
  return { files, lights, darks, paired: lights.length > 0 && lights.length === darks.length };
}

function count(haystack, needle) {
  let n = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    n += 1;
    i += needle.length;
  }
  return n;
}

/**
 * Score one run directory. `spec` is an entry from evals.json; `target` is the
 * repository copy the run worked on.
 */
export function grade(spec, target) {
  const fixture = fixturePath(spec.fixture);
  const readmePath = path.join(target, 'README.md');
  const fixtureReadmePath = path.join(fixture, 'README.md');
  const readme = read(readmePath);
  const fixtureReadme = read(fixtureReadmePath);
  const configRaw = read(path.join(target, 'banner.config.json'));
  let config = null;
  try {
    config = configRaw ? JSON.parse(configRaw) : null;
  } catch {
    config = null;
  }
  const inserted = ['assets/banner/banner.light.svg', 'assets/banner/banner.dark.svg']
    .filter((rel) => existsSync(path.join(target, rel)));
  const assets = walk(target).filter((rel) => rel.startsWith('assets/'));
  const check = runCheck(target);
  const readmeUnchanged = readme !== null && fixtureReadme !== null && md5(readmePath) === md5(fixtureReadmePath);

  const exp = [];
  const add = (text, passed, evidence) => exp.push({ text, passed: !!passed, evidence });

  if (spec.kind === 'insert' || spec.kind === 'assets') {
    add('生成了 banner.config.json 并能解析为 JSON',
      !!config,
      config
        ? `解析成功：preset=${config.preset} theme=${config.theme} title=${JSON.stringify(config.title)} outputDir=${JSON.stringify(config.outputDir)}`
        : (configRaw ? '文件存在但不是合法 JSON' : '文件不存在'));
  }

  if (spec.kind === 'insert') {
    add('配置里 preset 为 ascii、theme 为 terminal',
      config?.preset === 'ascii' && config?.theme === 'terminal',
      `preset=${JSON.stringify(config?.preset)} theme=${JSON.stringify(config?.theme)}`);
    add('assets/banner/banner.light.svg 与 banner.dark.svg 都存在',
      inserted.length === 2,
      inserted.length === 2 ? `两个文件均在：${inserted.join(', ')}` : `实际存在 ${inserted.length} 个：${inserted.join(', ') || '无'}`);
    const starts = readme ? count(readme, START) : 0;
    const ends = readme ? count(readme, END) : 0;
    add('README 里恰好有一对受管标记（start/end 各出现一次）',
      starts === 1 && ends === 1,
      `start=${starts} end=${ends}`);
    const stripped = readme ? stripManagedBlock(readme) : null;
    const sameBody = stripped !== null && fixtureReadme !== null && stripped.trim() === fixtureReadme.trim();
    add('README 在受管区块之外的正文与原始文件一致',
      sameBody,
      stripped === null
        ? '缺少受管标记，无法比对'
        : (sameBody ? '受管区块之外的正文与原始 README 完全一致（仅块前后的空行差异）' : '受管区块之外的正文被改动'));
    add('generate --check 退出码为 0', check.ok, check.detail);
  }

  if (spec.kind === 'assets') {
    const pair = svgPairs(target);
    add('assets 下存在一对浅色/深色 SVG 资源',
      pair.paired,
      pair.paired
        ? `浅色：${pair.lights.join(', ')}；深色：${pair.darks.join(', ')}`
        : `未找到成对 SVG；实际 SVG：${pair.files.join(', ') || '无'}；assets 下文件：${assets.join(', ') || '无'}`);
    const placedIn = pair.lights[0] ? path.posix.dirname(pair.lights[0]) : null;
    add('输出目录遵循用户点名的位置（“放 assets 里”→ assets，不再多套一层）',
      placedIn === 'assets',
      pair.lights[0] ? `浅色横幅实际落在 ${placedIn}/ 下（${pair.lights[0]}）` : '没有可比对的浅色 SVG');
    add('README 字节与原始文件完全一致',
      readmeUnchanged,
      readme === null ? 'README 不存在' : `md5 ${md5(readmePath)} vs 原始 ${md5(fixtureReadmePath)}`);
    add('generate --check 退出码为 0', check.ok, check.detail);
  }

  if (spec.kind === 'vague') {
    add('README 字节与原始文件完全一致（未被擅自改写）',
      readmeUnchanged,
      readme === null
        ? 'README 不存在'
        : (readmeUnchanged ? `md5 ${md5(readmePath)} 与原始一致` : `md5 ${md5(readmePath)} 已偏离原始 ${md5(fixtureReadmePath)}`));
    const markers = readme ? count(readme, START) + count(readme, END) : 0;
    add('README 里没有被插入受管横幅标记', markers === 0, readme ? `start=${count(readme, START)} end=${count(readme, END)}` : 'README 不存在');
    const touched = ['package.json', 'src/index.js'].filter((rel) => {
      const a = path.join(target, rel);
      const b = path.join(fixture, rel);
      return existsSync(a) && existsSync(b) && md5(a) !== md5(b);
    });
    add('package.json 与 src/index.js 等源码文件未被改动',
      touched.length === 0,
      touched.length === 0 ? '两个文件 md5 与原始一致' : `被改动：${touched.join(', ')}`);
    add('至少产出了横幅资源（配置或 SVG），而不是空手而归',
      !!config || assets.length > 0,
      `config=${config ? '有' : '无'}，assets 下文件：${assets.join(', ') || '无'}`);
  }

  const passed = exp.filter((e) => e.passed).length;
  return {
    eval_id: spec.id,
    slug: spec.slug,
    fixture: spec.fixture,
    expectations: exp,
    summary: {
      passed,
      failed: exp.length - passed,
      total: exp.length,
      pass_rate: Number((passed / exp.length).toFixed(4)),
    },
  };
}

function main(argv) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const outIdx = argv.indexOf('--out');
  const outFile = outIdx === -1 ? null : argv[outIdx + 1];

  const [evalArg, targetArg] = positional;
  const { evals } = loadEvals();
  const spec = evals.find((e) => String(e.id) === String(evalArg) || e.slug === evalArg);
  if (!spec) {
    console.error(`unknown eval: ${evalArg ?? '(missing)'}. Available: ${evals.map((e) => e.id).join(', ')}`);
    return 2;
  }
  if (!targetArg) {
    console.error('usage: node evals/grade.mjs <eval-id> <run-dir> [--json] [--out <grading.json>]');
    return 2;
  }

  const verdict = grade(spec, path.resolve(targetArg));
  if (outFile) {
    mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    writeFileSync(path.resolve(outFile), `${JSON.stringify(verdict, null, 2)}\n`);
  }

  if (flags.has('--json')) {
    console.log(JSON.stringify(verdict, null, 2));
  } else {
    for (const e of verdict.expectations) {
      console.log(`${e.passed ? 'PASS' : 'FAIL'}  ${e.text}`);
      if (!e.passed) console.log(`      ${e.evidence}`);
    }
    const { passed, total, pass_rate: rate } = verdict.summary;
    console.log(`\n${passed}/${total} passed (${Math.round(rate * 100)}%) — ${spec.slug}`);
  }
  return verdict.summary.failed === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
