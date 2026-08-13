import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const forbiddenKeyFragments = [
  'password',
  'token',
  'secret',
  'key',
  'hand',
  'seed',
  'nonce',
  'deck',
];

function fail(message) {
  console.error(`Score UAT baseline failed: ${message}`);
  process.exit(1);
}

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function assertSafeKeys(value, path = 'root') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeKeys(entry, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (forbiddenKeyFragments.some((fragment) => normalized.includes(fragment))) {
      fail(`Evidence key ${path}.${key} is prohibited.`);
    }
    assertSafeKeys(entry, `${path}.${key}`);
  }
}

const phase = process.argv[2];
if (phase !== 'before' && phase !== 'after') {
  fail('Usage: score-uat-baseline.mjs <before|after> --uat-branch-sha <sha> --vercel-project <name> --uat-url <url> --sign-in <pass|fail> --open-score-sheet <pass|fail> [--counts-json <json>].');
}

const uatBranchSha = option('uat-branch-sha');
const vercelProjectName = option('vercel-project');
const uatUrl = option('uat-url');
const signInSmoke = option('sign-in');
const openScoreSheetSmoke = option('open-score-sheet');
if (uatBranchSha === undefined || !/^[0-9a-f]{40}$/i.test(uatBranchSha)) {
  fail('A full non-secret UAT branch SHA is required.');
}
if (vercelProjectName === undefined || vercelProjectName.trim().length === 0) {
  fail('The existing Vercel project name is required.');
}
if (uatUrl === undefined || !/^https:\/\//i.test(uatUrl)) {
  fail('The existing HTTPS UAT URL is required.');
}
if (!['pass', 'fail'].includes(signInSmoke ?? '')) {
  fail('Sign-in smoke result must be pass or fail.');
}
if (!['pass', 'fail'].includes(openScoreSheetSmoke ?? '')) {
  fail('Open-score-sheet smoke result must be pass or fail.');
}

let counts = {};
const countsJson = option('counts-json', '{}');
try {
  counts = JSON.parse(countsJson);
} catch {
  fail('The counts JSON is invalid.');
}

const evidence = {
  phase,
  recordedAtUtc: new Date().toISOString(),
  uatBranchSha,
  supabaseProjectName: 'estimation-score-calculator-uat',
  supabaseProjectRef: 'lexewcehptnmikwfizhj',
  vercelProjectName: vercelProjectName.trim(),
  uatUrl,
  signInSmoke,
  openScoreSheetSmoke,
  counts,
};
assertSafeKeys(evidence);

const directory = resolve('deployment-evidence');
mkdirSync(directory, { recursive: true });
const output = resolve(directory, `score-uat-${phase}.json`);
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
console.log(`Non-secret score UAT ${phase} baseline written to ${output}`);
