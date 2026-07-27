import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import test from 'node:test';

const prepareScript = resolve('scripts/isolation/prepare-gameplay-functions.mjs');
const deployScript = resolve('scripts/isolation/deploy-gameplay-function.mjs');
const stagingRoot = resolve('supabase-gameplay-deploy');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  readonly scripts?: Readonly<Record<string, string>>;
};

function localImports(source: string): readonly string[] {
  const imports: string[] = [];
  for (const match of source.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]|import\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
    imports.push(match[1] ?? match[2]);
  }
  return imports;
}

function verifyGraph(entry: string): void {
  const pending = [resolve(entry)];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);

    assert.equal(existsSync(file), true, `Missing staged module: ${file}`);
    assert.equal(file.startsWith(stagingRoot), true, `Staged graph escaped its workspace: ${file}`);

    const source = readFileSync(file, 'utf8');
    for (const specifier of localImports(source)) {
      assert.doesNotMatch(specifier, /\.jsx?$/i, `Staged import must be explicit TypeScript: ${specifier}`);
      const imported = resolve(dirname(file), specifier);
      assert.equal(existsSync(imported), true, `${file} imports missing module ${specifier}`);
      if (['.ts', '.tsx'].includes(extname(imported))) pending.push(imported);
    }
  }
}

test('gameplay Function preparation creates an explicit Deno module graph', () => {
  assert.equal(existsSync(prepareScript), true, 'Missing gameplay Function preparation script.');
  execFileSync(process.execPath, [prepareScript], { encoding: 'utf8' });

  for (const functionName of ['gameplay-start', 'gameplay-round-command']) {
    const functionDirectory = resolve(stagingRoot, 'supabase', 'functions', functionName);
    const entry = resolve(functionDirectory, 'index.ts');
    const denoPath = resolve(functionDirectory, 'deno.json');
    assert.equal(existsSync(denoPath), true, `Missing staged deno.json for ${functionName}.`);
    verifyGraph(entry);
  }

  const config = readFileSync(resolve(stagingRoot, 'supabase', 'config.toml'), 'utf8');
  assert.match(config, /\[functions\.gameplay-start\][\s\S]*verify_jwt\s*=\s*true/i);
  assert.match(config, /\[functions\.gameplay-round-command\][\s\S]*verify_jwt\s*=\s*true/i);
});

test('gameplay Function deployment wrapper is fail-closed and API based', () => {
  assert.equal(existsSync(deployScript), true, 'Missing gameplay Function deployment wrapper.');
  const source = readFileSync(deployScript, 'utf8');
  assert.match(source, /gameplay-target-guard\.mjs/i);
  assert.match(source, /prepare-gameplay-functions\.mjs/i);
  assert.match(source, /--project-ref/i);
  assert.match(source, /--use-api/i);
  assert.doesNotMatch(source, /--no-verify-jwt/i);
  assert.match(source, /lexewcehptnmikwfizhj/i);
});

test('gameplay Function deployment launches Windows command shims through cmd.exe', () => {
  const source = readFileSync(deployScript, 'utf8');
  assert.match(source, /process\.env\.ComSpec\s*\?\?\s*['"]cmd\.exe['"]/i);
  assert.match(source, /['"]\/d['"]/i);
  assert.match(source, /['"]\/s['"]/i);
  assert.match(source, /['"]\/c['"]/i);
  assert.doesNotMatch(
    source,
    /process\.platform\s*===\s*['"]win32['"]\s*\?\s*['"]npx\.cmd['"]/i,
  );
});

test('package scripts and ignore rules expose only the generated deployment workspace', () => {
  assert.match(packageJson.scripts?.['prepare:gameplay-functions'] ?? '', /prepare-gameplay-functions\.mjs/i);
  assert.match(packageJson.scripts?.['deploy:gameplay-function'] ?? '', /deploy-gameplay-function\.mjs/i);

  const ignore = readFileSync('.gitignore', 'utf8');
  assert.match(ignore, /^supabase-gameplay-deploy\/$/m);
});
