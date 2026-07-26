import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

const script = resolve('scripts/isolation/score-uat-baseline.mjs');
const sha = '0123456789abcdef0123456789abcdef01234567';

function run(cwd: string, phase: 'before' | 'after', countsJson: string) {
  return spawnSync(process.execPath, [
    script,
    phase,
    '--uat-branch-sha', sha,
    '--vercel-project', 'estimation-score-calculator-uat',
    '--uat-url', 'https://score-uat.example.invalid',
    '--sign-in', 'pass',
    '--open-score-sheet', 'pass',
    '--counts-json', countsJson,
  ], {
    cwd,
    encoding: 'utf8',
  });
}

test('baseline recorder writes non-secret before evidence with safe counts', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'score-uat-baseline-'));
  try {
    const result = run(cwd, 'before', '{"games":4,"rounds":21}');
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const output = join(cwd, 'deployment-evidence', 'score-uat-before.json');
    assert.equal(existsSync(output), true);
    const evidence = JSON.parse(readFileSync(output, 'utf8')) as Record<string, unknown>;
    assert.equal(evidence.phase, 'before');
    assert.deepEqual(evidence.counts, { games: 4, rounds: 21 });
    assert.equal('nonSecretCounts' in evidence, false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('baseline recorder rejects prohibited evidence keys supplied through counts', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'score-uat-baseline-'));
  try {
    const result = run(cwd, 'after', '{"accessToken":"forbidden"}');
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /prohibited/i);
    assert.equal(existsSync(join(cwd, 'deployment-evidence', 'score-uat-after.json')), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
