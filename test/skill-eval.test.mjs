// Guards the skill's own contract and the eval suite that measures it.
//
// The evals are graded mechanically (evals/grade.mjs), so CI can keep them
// honest without an LLM in the loop: evals/reference-run.mjs reproduces what a
// correct run produces, and this suite asserts that output scores 100% while an
// untouched repository does not.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { grade, loadEvals, MANAGED_START, MANAGED_END } from '../evals/grade.mjs';
import { runReference } from '../evals/reference-run.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const SKILL_DIR = path.join(REPO, 'skills', 'dbx-readme');
const SKILL_MD = path.join(SKILL_DIR, 'SKILL.md');
const CLI = path.join(REPO, 'bin', 'dbx.mjs');

const tmpRoots = [];
function tmpDir(label) {
  const dir = mkdtempSync(path.join(os.tmpdir(), `dbx-eval-${label}-`));
  tmpRoots.push(dir);
  return dir;
}

test.after(() => {
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true });
});

const unquote = (value) => (value.length > 1 && /^["'].*["']$/.test(value) ? value.slice(1, -1) : value);

/**
 * Minimal frontmatter reader: `key: value`, `key: >-` folded blocks, and the
 * one-level `metadata:` map. Enough for SKILL.md; not a general YAML parser.
 */
function parseFrontmatter(source) {
  assert.ok(source.startsWith('---\n'), 'SKILL.md must start with a frontmatter block');
  const end = source.indexOf('\n---\n', 4);
  assert.ok(end !== -1, 'SKILL.md frontmatter must be closed with ---');
  const lines = source.slice(4, end).split('\n');
  const data = {};

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!match) throw new Error(`unparseable frontmatter line: ${JSON.stringify(line)}`);
    const [, key, rest] = match;

    // Folded / literal block scalar: collect the indented lines that follow.
    if (/^[|>][+-]?$/.test(rest)) {
      const chunks = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || !lines[i + 1].trim())) {
        chunks.push(lines[i + 1].trim());
        i += 1;
      }
      const text = chunks.filter(Boolean).join(rest.startsWith('|') ? '\n' : ' ');
      data[key] = rest.endsWith('-') ? text : `${text}\n`;
      continue;
    }

    // Nested map (metadata): one level of indented `k: v` pairs.
    if (rest === '') {
      const map = {};
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
        const nested = /^\s+([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[i + 1]);
        if (!nested) throw new Error(`unparseable nested frontmatter line: ${JSON.stringify(lines[i + 1])}`);
        map[nested[1]] = unquote(nested[2]);
        i += 1;
      }
      data[key] = map;
      continue;
    }

    data[key] = unquote(rest);
  }

  return { data, body: source.slice(end + 5) };
}

test('SKILL.md follows the Agent Skills contract', () => {
  const source = readFileSync(SKILL_MD, 'utf8');
  const { data, body } = parseFrontmatter(source);

  // name: lowercase alnum + hyphens, must equal the parent directory, ≤64 chars.
  assert.match(data.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, 'name must be lowercase-hyphenated');
  assert.ok(data.name.length <= 64, 'name must be at most 64 characters');
  assert.equal(data.name, path.basename(SKILL_DIR), 'name must match its parent directory');

  // description: what it does + when to use it, 1–1024 chars.
  assert.equal(typeof data.description, 'string');
  assert.ok(data.description.length >= 1 && data.description.length <= 1024, 'description must be 1–1024 characters');
  assert.match(data.description, /README/, 'description should carry the core trigger keyword');

  assert.ok(data.license, 'license is declared');
  assert.ok(data.compatibility && data.compatibility.length <= 500, 'compatibility is declared and ≤500 chars');
  assert.equal(data.metadata.author, 'Dianboxi 电波系');
  assert.match(data.metadata.version, /^\d+\.\d+\.\d+$/);

  // A version bump has to land here too, or the published skill metadata drifts.
  const pkg = JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  assert.equal(data.metadata.version, pkg.version, 'skill metadata version must match package.json');

  // Body is loaded whole on activation: keep it small, references one level deep.
  const bodyLines = body.trim().split('\n').length;
  assert.ok(bodyLines <= 500, `SKILL.md body should stay under 500 lines (currently ${bodyLines})`);
  assert.ok(statSync(SKILL_MD).size < 24_000, 'SKILL.md should stay well under the context budget');

  for (const link of body.matchAll(/\(<?(references\/[\w./-]+\.md)>?\)/g)) {
    assert.ok(existsSync(path.join(SKILL_DIR, link[1])), `referenced file exists: ${link[1]}`);
  }
});

test('evals.json is well-formed and every eval is runnable', () => {
  const { skill_name: skillName, evals } = loadEvals();
  assert.equal(skillName, 'dbx-readme');
  assert.ok(evals.length >= 3, 'keep at least the three core evals');

  const ids = new Set();
  const kinds = new Set(['insert', 'assets', 'vague', 'section-edit', 'create-readme']);
  for (const spec of evals) {
    assert.ok(!ids.has(spec.id), `duplicate eval id: ${spec.id}`);
    ids.add(spec.id);
    assert.ok(spec.prompt.trim().length > 10, `eval ${spec.id} needs a realistic prompt`);
    assert.ok(spec.expected_output.trim().length > 10, `eval ${spec.id} needs an expected output`);
    assert.ok(spec.expectations.length > 0, `eval ${spec.id} needs expectations`);
    assert.ok(kinds.has(spec.kind), `eval ${spec.id} has unknown kind: ${spec.kind}`);
    const fixtureDir = path.join(REPO, 'evals', 'fixtures', spec.fixture);
    assert.ok(existsSync(path.join(fixtureDir, 'package.json')),
      `eval ${spec.id} fixture exists: ${spec.fixture}`);
    if (spec.kind === 'create-readme') {
      assert.ok(!existsSync(path.join(fixtureDir, 'README.md')),
        `eval ${spec.id} fixture must have no README, otherwise it is not a create-from-scratch case`);
    } else {
      assert.ok(existsSync(path.join(fixtureDir, 'README.md')),
        `eval ${spec.id} fixture needs a README: ${spec.fixture}`);
    }
  }
});

test('grader assertions match the expectations declared in evals.json', () => {
  const { evals } = loadEvals();
  for (const spec of evals) {
    const target = tmpDir(`texts-${spec.id}`);
    cpSync(path.join(REPO, 'evals', 'fixtures', spec.fixture), target, { recursive: true });
    const verdict = grade(spec, target);
    assert.deepEqual(
      verdict.expectations.map((e) => e.text),
      spec.expectations,
      `eval ${spec.id}: grade.mjs must emit exactly the declared expectations, in order`,
    );
  }
});

test('reference runs satisfy every expectation', () => {
  const { evals } = loadEvals();
  for (const spec of evals) {
    const target = path.join(tmpDir(`ref-${spec.id}`), spec.fixture);
    runReference(spec.id, target);
    const verdict = grade(spec, target);
    const failed = verdict.expectations.filter((e) => !e.passed);
    assert.deepEqual(
      failed.map((e) => `${e.text} — ${e.evidence}`),
      [],
      `eval ${spec.id} should pass all ${spec.expectations.length} expectations`,
    );
    assert.equal(verdict.summary.pass_rate, 1);
  }
});

test('an untouched repository does not pass the evals', () => {
  const { evals } = loadEvals();
  for (const spec of evals) {
    const target = path.join(tmpDir(`empty-${spec.id}`), spec.fixture);
    cpSync(path.join(REPO, 'evals', 'fixtures', spec.fixture), target, { recursive: true });
    const verdict = grade(spec, target);
    assert.ok(verdict.summary.pass_rate < 1, `eval ${spec.id} must fail a do-nothing run`);

    // eval-2's negative assertions pass trivially on an untouched repo; the
    // assertion that separates it is "did the run actually produce anything".
    if (spec.kind === 'vague') {
      const produced = verdict.expectations.at(-1);
      assert.equal(produced.passed, false, 'a do-nothing run produces no banner assets');
    }
  }
});

test('reference output is reproducible byte for byte', () => {
  const first = path.join(tmpDir('stable-a'), 'proj-basic');
  const second = path.join(tmpDir('stable-b'), 'proj-basic');
  runReference(0, first);
  runReference(0, second);

  for (const rel of ['banner.config.json', 'assets/banner/banner.light.svg', 'assets/banner/banner.dark.svg', 'README.md']) {
    assert.deepEqual(
      readFileSync(path.join(first, rel)),
      readFileSync(path.join(second, rel)),
      `${rel} should be byte-identical across runs`,
    );
  }
  assert.ok(readFileSync(path.join(first, 'README.md'), 'utf8').includes(MANAGED_START));
  assert.ok(readFileSync(path.join(first, 'README.md'), 'utf8').includes(MANAGED_END));
});

test('a run that edits beyond the requested section is caught by eval 3', () => {
  const { evals } = loadEvals();
  const spec = evals.find((e) => e.kind === 'section-edit');
  const target = path.join(tmpDir('scope-regress'), spec.fixture);
  runReference(spec.id, target);

  const readme = path.join(target, 'README.md');
  writeFileSync(readme, readFileSync(readme, 'utf8').replace('npm install -g acme-widget', 'npm install -g acme-widget@next'));

  const verdict = grade(spec, target);
  const scopeExpectation = verdict.expectations.find((e) => e.text === 'README 的其他小节与原始文件一致');
  assert.equal(scopeExpectation.passed, false, 'grader must notice an edit outside the named section');
});

test('a run that rewrites the README uninvited is caught by eval 1', () => {
  const { evals } = loadEvals();
  const spec = evals.find((e) => e.kind === 'assets');
  const target = path.join(tmpDir('regress'), spec.fixture);
  runReference(spec.id, target);

  const cli = spawnSync(process.execPath, [CLI, 'generate', '--cwd', target, '--config', 'banner.config.json', '--readme', 'README.md'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, 'the CLI itself is allowed to insert the block');

  const verdict = grade(spec, target);
  const readmeExpectation = verdict.expectations.find((e) => e.text === 'README 字节与原始文件完全一致');
  assert.equal(readmeExpectation.passed, false, 'grader must notice the rewritten README');
});
