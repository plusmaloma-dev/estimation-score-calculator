import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, extname, normalize, resolve } from 'node:path';

const rootEntry = resolve('src/app/gameplay/main.tsx');
const forbiddenPaths = [
  normalize('src/app/AppContext.tsx'),
  normalize('src/app/screens/NewGameScreen.tsx'),
  normalize('src/app/screens/ScoreSheetScreen.tsx'),
  normalize('src/app/services/createBrowserServices.ts'),
  `${normalize('src/online/games')}/`,
  `${normalize('src/online/players')}/`,
  `${normalize('src/repositories')}/`,
];

function importsIn(source: string): readonly string[] {
  const imports: string[] = [];
  const pattern = /(?:from\s+|import\s*\()(['"])([^'"]+)\1/g;
  for (const match of source.matchAll(pattern)) {
    if (match[2] !== undefined) imports.push(match[2]);
  }
  return imports;
}

function resolveRelative(importer: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const requested = resolve(dirname(importer), specifier);
  const withoutJs = requested.endsWith('.js') ? requested.slice(0, -3) : requested;
  const candidates = extname(requested) === ''
    ? [`${requested}.ts`, `${requested}.tsx`, resolve(requested, 'index.ts'), resolve(requested, 'index.tsx')]
    : [requested, `${withoutJs}.ts`, `${withoutJs}.tsx`];
  return candidates.find((candidate) => existsSync(candidate));
}

function repositoryRelative(path: string): string {
  return normalize(path.slice(resolve('.').length + 1));
}

test('gameplay frontend entry exists and cannot reach score-sheet application modules', () => {
  assert.equal(existsSync(rootEntry), true, 'Missing gameplay-only browser entry.');

  const pending = [rootEntry];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);

    const relative = repositoryRelative(file);
    for (const forbidden of forbiddenPaths) {
      assert.equal(
        relative === forbidden || relative.startsWith(forbidden),
        false,
        `Gameplay artifact reaches forbidden score-sheet module: ${relative}`,
      );
    }

    const source = readFileSync(file, 'utf8');
    for (const specifier of importsIn(source)) {
      assert.equal(
        specifier.includes('/online/games/')
          || specifier.includes('/online/players/')
          || specifier.includes('/repositories/')
          || specifier.includes('AppContext'),
        false,
        `Gameplay artifact imports forbidden dependency from ${relative}: ${specifier}`,
      );
      const resolved = resolveRelative(file, specifier);
      if (resolved !== undefined) pending.push(resolved);
    }
  }

  assert.ok(visited.size > 5, 'Gameplay import graph was unexpectedly small.');
});
