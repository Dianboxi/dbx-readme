import { spawn } from 'node:child_process';

/**
 * GitHub repository metadata ("repository presentation") is a separate write
 * surface from README assets: it needs admin rights, it is public immediately,
 * and it is not stored in the repository. Everything about it therefore lives
 * here rather than in the banner pipeline.
 */

export const PRESENTATION_CONFIG = 'presentation.config.json';
export const MAX_TOPICS = 20;
export const MAX_TOPIC_LENGTH = 50;
export const MAX_DESCRIPTION = 350;

export interface RepoMetadata {
  readonly repository: string;
  readonly description: string;
  readonly topics: readonly string[];
}

export interface PresentationConfig {
  readonly schemaVersion: 1;
  readonly description?: string;
  readonly topics?: readonly string[];
  readonly remove?: readonly string[];
}

export interface TopicsPlan {
  readonly repository: string;
  readonly description: { readonly current: string; readonly desired: string | null };
  readonly topics: { readonly current: readonly string[]; readonly desired: readonly string[] };
  readonly add: readonly string[];
  readonly remove: readonly string[];
  readonly unchanged: boolean;
}

/** Runs `gh` and resolves with stdout; rejects with a readable message. */
export type GhRunner = (args: readonly string[]) => Promise<string>;

const TOPIC_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateTopic(path: string, value: unknown): string {
  if (typeof value !== 'string') fail(path, 'topic must be a string');
  if (value.length === 0) fail(path, 'topic must not be empty');
  if (value.length > MAX_TOPIC_LENGTH) fail(path, `topic ${JSON.stringify(value)} is longer than ${MAX_TOPIC_LENGTH} characters`);
  if (!TOPIC_PATTERN.test(value)) {
    fail(path, `topic ${JSON.stringify(value)} must be lowercase letters, digits, and inner hyphens (GitHub's own format)`);
  }
  return value;
}

function validateTopicList(path: string, value: unknown): readonly string[] {
  if (!Array.isArray(value)) fail(path, 'must be an array of topic names');
  if (value.length > MAX_TOPICS) fail(path, `at most ${MAX_TOPICS} topics are allowed`);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const [index, entry] of value.entries()) {
    const topic = validateTopic(`${path}[${index}]`, entry);
    if (seen.has(topic)) fail(`${path}[${index}]`, `duplicate topic ${JSON.stringify(topic)}`);
    seen.add(topic);
    out.push(topic);
  }
  return out;
}

/**
 * Parse `presentation.config.json`. `topics` is the authoritative set (an empty
 * array clears every topic); `remove` subtracts without touching anything else.
 * Absent keys never delete anything — that is the whole point of separating
 * "not mentioned" from "explicitly emptied".
 */
export function parsePresentationConfig(input: unknown, file: string = PRESENTATION_CONFIG): PresentationConfig {
  if (!isRecord(input)) fail(file, 'must be a JSON object');
  const known = new Set(['schemaVersion', 'description', 'topics', 'remove']);
  for (const key of Object.keys(input)) {
    if (!known.has(key)) fail(file, `unknown key ${JSON.stringify(key)} (allowed: ${[...known].join(', ')})`);
  }
  if (input.schemaVersion !== 1) fail(file, 'schemaVersion must be 1');

  const result: { schemaVersion: 1; description?: string; topics?: readonly string[]; remove?: readonly string[] } = { schemaVersion: 1 };

  if (input.description !== undefined) {
    const description = input.description;
    if (typeof description !== 'string') fail(file, 'description must be a string');
    if (description.trim().length === 0) fail(file, 'description must not be blank');
    if (description.length > MAX_DESCRIPTION) fail(file, `description must be at most ${MAX_DESCRIPTION} characters`);
    if (/[\u0000-\u001f\u007f]/u.test(description)) fail(file, 'description must be a single line without control characters');
    result.description = description;
  }

  if (input.topics !== undefined) result.topics = validateTopicList(`${file}: topics`, input.topics);
  if (input.remove !== undefined) result.remove = validateTopicList(`${file}: remove`, input.remove);

  if (result.topics !== undefined && result.remove !== undefined) {
    const wanted = result.topics;
    const clash = result.remove.filter((topic) => wanted.includes(topic));
    if (clash.length > 0) fail(file, `topics and remove overlap: ${clash.join(', ')}`);
  }
  return result;
}

function unique(items: readonly string[]): string[] {
  return [...new Set(items)];
}

/** Diff the desired presentation against what the repository currently has. */
export function planTopics(current: RepoMetadata, config: PresentationConfig): TopicsPlan {
  const removals = config.remove ?? [];
  const desiredTopics = config.topics === undefined
    ? unique(current.topics.filter((topic) => !removals.includes(topic)))
    : unique([...config.topics]);
  const desiredDescription = config.description ?? null;

  const add = desiredTopics.filter((topic) => !current.topics.includes(topic));
  const remove = current.topics.filter((topic) => !desiredTopics.includes(topic));
  if (desiredTopics.length > MAX_TOPICS) {
    throw new Error(`${PRESENTATION_CONFIG}: the resulting set has ${desiredTopics.length} topics; GitHub allows ${MAX_TOPICS}`);
  }

  return {
    repository: current.repository,
    description: { current: current.description, desired: desiredDescription },
    topics: { current: current.topics, desired: desiredTopics },
    add,
    remove,
    unchanged: add.length === 0 && remove.length === 0 && (desiredDescription === null || desiredDescription === current.description),
  };
}

/** Parse `gh repo view --json …` output into metadata. */
export function parseRepoMetadata(repository: string, raw: string): RepoMetadata {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`gh returned invalid JSON for ${repository}`);
  }
  if (!isRecord(data)) throw new Error(`gh returned an unexpected payload for ${repository}`);
  const description = typeof data.description === 'string' ? data.description : '';
  const rawTopics = Array.isArray(data.repositoryTopics) ? data.repositoryTopics : [];
  const topics = rawTopics.map((entry) => {
    if (typeof entry === 'string') return entry;
    if (isRecord(entry) && typeof entry.name === 'string') return entry.name;
    throw new Error(`gh returned an unexpected topic entry for ${repository}`);
  });
  return { repository, description, topics };
}

export async function readMetadata(repository: string, run: GhRunner): Promise<RepoMetadata> {
  const raw = await run(['repo', 'view', repository, '--json', 'description,repositoryTopics,nameWithOwner']);
  return parseRepoMetadata(repository, raw);
}

/** Resolve OWNER/NAME for the repository in the runner's cwd (no `--repo`). */
export async function detectRepository(run: GhRunner): Promise<string> {
  const raw = await run(['repo', 'view', '--json', 'nameWithOwner']);
  const parsed = JSON.parse(raw) as { nameWithOwner?: unknown };
  if (typeof parsed.nameWithOwner !== 'string' || parsed.nameWithOwner.length === 0) {
    throw new Error('could not determine the repository; pass --repo OWNER/NAME');
  }
  return parsed.nameWithOwner;
}

/**
 * Apply a plan through `gh`. Description first, then removals, then additions,
 * so a failure leaves a state the user can reason about and re-run.
 */
export async function applyTopics(plan: TopicsPlan, run: GhRunner): Promise<string[]> {
  if (plan.unchanged) return [];
  const steps: string[] = [];
  const desiredDescription = plan.description.desired;
  if (desiredDescription !== null && desiredDescription !== plan.description.current) {
    await run(['repo', 'edit', plan.repository, '--description', desiredDescription]);
    steps.push(`description → ${JSON.stringify(desiredDescription)}`);
  }
  if (plan.remove.length > 0) {
    await run(['repo', 'edit', plan.repository, ...plan.remove.flatMap((topic) => ['--remove-topic', topic])]);
    steps.push(`removed topics: ${plan.remove.join(', ')}`);
  }
  if (plan.add.length > 0) {
    await run(['repo', 'edit', plan.repository, ...plan.add.flatMap((topic) => ['--add-topic', topic])]);
    steps.push(`added topics: ${plan.add.join(', ')}`);
  }
  return steps;
}

export interface GhRunnerOptions {
  readonly bin?: string;
  readonly cwd?: string;
}

/** Spawn the GitHub CLI. Kept thin so tests can inject a plain function. */
export function createGhRunner(options: GhRunnerOptions = {}): GhRunner {
  const bin = options.bin ?? 'gh';
  return (args) => new Promise<string>((resolve, reject) => {
    const child = spawn(bin, [...args], { cwd: options.cwd, shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        reject(new Error('GitHub CLI not found: install gh (https://cli.github.com) and run "gh auth login"'));
        return;
      }
      reject(error);
    });
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`gh ${args.join(' ')} failed (exit ${code ?? 'unknown'}): ${stderr.trim() || stdout.trim() || 'no output'}`));
    });
  });
}

/** Human-readable plan, one line per change. */
export function formatPlan(plan: TopicsPlan): string {
  const lines = [`repository: ${plan.repository}`];
  lines.push(plan.description.desired === null
    ? `description: unchanged (${JSON.stringify(plan.description.current)})`
    : `description: ${JSON.stringify(plan.description.current)} → ${JSON.stringify(plan.description.desired)}`);
  lines.push(`topics: ${plan.topics.current.length} current, ${plan.topics.desired.length} desired`);
  for (const topic of plan.remove) lines.push(`  - ${topic}`);
  for (const topic of plan.add) lines.push(`  + ${topic}`);
  if (plan.unchanged) lines.push('nothing to change');
  return lines.join('\n');
}
