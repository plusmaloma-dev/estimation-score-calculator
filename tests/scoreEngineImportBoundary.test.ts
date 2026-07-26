import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';
import { join } from 'node:path';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  readonly scripts?: Readonly<Record<string, string>>;
};

const scoreConfigPath = 'tsconfig.score-engine.json';
const forbiddenImportTokens = ['/gameplay/', '/online/', '/app/', '@supabase/', 'react', 'vercel'];

function collectTypeScriptFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return path.endsWith('.ts') ? [path] : [];
  return readdirSync(path).flatMap((entry) => collectTypeScriptFiles(join(path, entry)));
}

function importsIn(source: string): readonly string[] {
  const imports: string[] = [];
  const pattern = /(?:from\s+|import\s*\()(['"])([^'"]+)\1/g;
  for (const match of source.matchAll(pattern)) {
    if (match[2] !== undefined) imports.push(match[2]);
  }
  return imports;
}

test('package exposes independent score-engine commands', () => {
  assert.equal(typeof packageJson.scripts?.['typecheck:score-engine'], 'string');
  assert.equal(typeof packageJson.scripts?.['test:score-engine'], 'string');
  assert.equal(typeof packageJson.scripts?.['ci:score-engine'], 'string');
});

test('score-engine TypeScript project excludes gameplay and delivery layers', () => {
  assert.equal(existsSync(scoreConfigPath), true, `Missing ${scoreConfigPath}.`);
  const config = readFileSync(scoreConfigPath, 'utf8');
  for (const excluded of ['src/gameplay/**/*', 'src/online/**/*', 'src/app/**/*']) {
    assert.match(config, new RegExp(excluded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('score-engine source does not import gameplay or deployment code', () => {
  const files = [
    ...collectTypeScriptFiles('src/domain'),
    ...collectTypeScriptFiles('src/scoring'),
    'src/services/BidValidationService.ts',
    'src/services/LeaderboardService.ts',
    'src/services/EstimationMvpService.ts',
  ];

  for (const file of files) {
    const imports = importsIn(readFileSync(file, 'utf8'));
    for (const imported of imports) {
      const normalized = imported.replaceAll('\\', '/').toLowerCase();
      assert.equal(
        forbiddenImportTokens.some((token) => normalized.includes(token)),
        false,
        `Forbidden score-engine import in ${file}: ${imported}`,
      );
    }
  }
});
