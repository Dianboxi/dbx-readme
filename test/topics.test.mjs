// Unit and CLI coverage for `dbx topics`: config parsing, plan semantics, the
// gh call sequence, and the failure messages a user actually sees.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  applyTopics,
  parsePresentationConfig,
  parseRepoMetadata,
  planTopics,
} from '../dist/index.js';

const REPO = path.resolve(import.meta.dirname, '..');
const CLI = path.join(REPO, 'bin', 'dbx.mjs');

function current(overrides = {}) {
  return { repository: 'acme/widget', description: 'old description', topics: ['cli', 'node'], ...overrides };
}

test('presentation.config.json accepts the documented shape and rejects the rest', () => {
  const parsed = parsePresentationConfig({ schemaVersion: 1, description: 'A widget', topics: ['cli', 'readme-banner'] });
  assert.deepEqual(parsed, { schemaVersion: 1, description: 'A widget', topics: ['cli', 'readme-banner'] });

  // Absent keys mean "leave it alone", so an empty object is legal.
  assert.deepEqual(parsePresentationConfig({ schemaVersion: 1 }), { schemaVersion: 1 });

  const rejects = [
    [{}, /schemaVersion/],
    [{ schemaVersion: 2 }, /schemaVersion/],
    [{ schemaVersion: 1, extra: true }, /unknown/i],
    [{ schemaVersion: 1, description: '' }, /description/],
    [{ schemaVersion: 1, description: 'line\nbreak' }, /description/],
    [{ schemaVersion: 1, description: 'x'.repeat(351) }, /description/],
    [{ schemaVersion: 1, topics: ['Readme'] }, /topic/i],
    [{ schemaVersion: 1, topics: ['ok', 'ok'] }, /duplicate/i],
    [{ schemaVersion: 1, topics: ['--bad'] }, /topic/i],
    [{ schemaVersion: 1, topics: Array.from({ length: 21 }, (_, i) => `t${i}`) }, /20/],
    [{ schemaVersion: 1, topics: ['keep'], remove: ['keep'] }, /overlap/i],
  ];
  for (const [input, pattern] of rejects) {
    assert.throws(() => parsePresentationConfig(input), pattern, JSON.stringify(input).slice(0, 80));
  }
});

test('plan keeps topics unless the config is explicit about them', () => {
  const keep = planTopics(current(), parsePresentationConfig({ schemaVersion: 1 }));
  assert.deepEqual(keep.topics.desired, ['cli', 'node']);
  assert.deepEqual(keep.add, []);
  assert.deepEqual(keep.remove, []);

  const trimmed = planTopics(current(), parsePresentationConfig({ schemaVersion: 1, remove: ['node'] }));
  assert.deepEqual(trimmed.topics.desired, ['cli']);
  assert.deepEqual(trimmed.remove, ['node']);

  const replaced = planTopics(current(), parsePresentationConfig({ schemaVersion: 1, topics: ['node', 'svg'] }));
  assert.deepEqual(replaced.add, ['svg']);
  assert.deepEqual(replaced.remove, ['cli']);
  assert.equal(replaced.unchanged, false);

  const cleared = planTopics(current(), parsePresentationConfig({ schemaVersion: 1, topics: [] }));
  assert.deepEqual(cleared.topics.desired, []);
  assert.deepEqual(cleared.remove, ['cli', 'node']);
});

test('plan leaves the description alone unless it is set', () => {
  assert.equal(planTopics(current(), parsePresentationConfig({ schemaVersion: 1 })).description.desired, null);
  const planned = planTopics(current(), parsePresentationConfig({ schemaVersion: 1, description: 'new text' }));
  assert.deepEqual(planned.description, { current: 'old description', desired: 'new text' });
});

test('gh metadata parses both topic shapes', () => {
  const objects = parseRepoMetadata('acme/widget', JSON.stringify({
    description: 'A widget', nameWithOwner: 'acme/widget', repositoryTopics: [{ name: 'cli' }, { name: 'svg' }],
  }));
  assert.deepEqual(objects, { repository: 'acme/widget', description: 'A widget', topics: ['cli', 'svg'] });

  const strings = parseRepoMetadata('acme/widget', JSON.stringify({ nameWithOwner: 'acme/widget', repositoryTopics: ['cli'] }));
  assert.deepEqual(strings, { repository: 'acme/widget', description: '', topics: ['cli'] });
});

test('apply writes the description, then removals, then additions', async () => {
  const plan = planTopics(current(), parsePresentationConfig({ schemaVersion: 1, description: 'new text', topics: ['node', 'svg'] }));
  const calls = [];
  const steps = await applyTopics(plan, async (args) => {
    calls.push([...args]);
    return '';
  });

  assert.deepEqual(calls, [
    ['repo', 'edit', 'acme/widget', '--description', 'new text'],
    ['repo', 'edit', 'acme/widget', '--remove-topic', 'cli'],
    ['repo', 'edit', 'acme/widget', '--add-topic', 'svg'],
  ]);
  assert.equal(steps.length, 3);
  assert.ok(!calls.flat().includes(''), 'gh arguments must not contain empty values');
});

test('a no-op plan calls gh zero times', async () => {
  const calls = [];
  const steps = await applyTopics(planTopics(current(), parsePresentationConfig({ schemaVersion: 1 })), async (args) => {
    calls.push([...args]);
    return '';
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(steps, []);
});

test('dbx topics fails loudly instead of guessing', () => {
  const noSub = spawnSync(process.execPath, [CLI, 'topics'], { encoding: 'utf8' });
  assert.equal(noSub.status, 1);
  assert.match(noSub.stderr, /needs a subcommand: get, plan, or apply/);

  const badSub = spawnSync(process.execPath, [CLI, 'topics', 'publish'], { encoding: 'utf8' });
  assert.equal(badSub.status, 1);
  assert.match(badSub.stderr, /needs a subcommand/);

  // A directory that is not a git checkout cannot resolve a repository; the
  // command must report that rather than silently acting on something else.
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'dbx-topics-'));
  const noRepo = spawnSync(process.execPath, [CLI, 'topics', 'get', '--cwd', scratch], { encoding: 'utf8' });
  assert.equal(noRepo.status, 1);
  assert.match(noRepo.stderr, /dbx:/);
});
