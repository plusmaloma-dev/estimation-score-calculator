import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const sourceSupabase = resolve('supabase-gameplay', 'supabase');
const sourceCode = resolve('src');
const stagingRoot = resolve('supabase-gameplay-deploy');
const stagingSupabase = join(stagingRoot, 'supabase');
const stagingCode = join(stagingRoot, 'edge-src');
const functionNames = ['gameplay-start', 'gameplay-round-command'];

function fail(message) {
  throw new Error(`Gameplay Function preparation failed: ${message}`);
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

function explicitTypeScriptImports(content) {
  return content
    .replace(/(['"])(\.{1,2}\/[^'"]+)\.jsx\1/g, '$1$2.tsx$1')
    .replace(/(['"])(\.{1,2}\/[^'"]+)\.js\1/g, '$1$2.ts$1');
}

function copySourceTree(sourceDirectory, targetDirectory) {
  for (const name of readdirSync(sourceDirectory)) {
    const sourcePath = join(sourceDirectory, name);
    const targetPath = join(targetDirectory, name);
    const details = statSync(sourcePath);

    if (details.isDirectory()) {
      copySourceTree(sourcePath, targetPath);
      continue;
    }

    const extension = name.endsWith('.tsx') ? '.tsx' : name.endsWith('.ts') ? '.ts' : undefined;
    if (extension === undefined) continue;

    write(targetPath, explicitTypeScriptImports(readFileSync(sourcePath, 'utf8')));
  }
}

function copyFunction(functionName) {
  const sourceDirectory = join(sourceSupabase, 'functions', functionName);
  const targetDirectory = join(stagingSupabase, 'functions', functionName);
  const sourceEntry = join(sourceDirectory, 'index.ts');
  const sourceDeno = join(sourceDirectory, 'deno.json');

  if (!existsSync(sourceEntry)) fail(`Missing source entry for ${functionName}.`);
  if (!existsSync(sourceDeno)) fail(`Missing deno.json for ${functionName}.`);

  const original = readFileSync(sourceEntry, 'utf8');
  const staged = original.replaceAll('../../../../src/', '../../../edge-src/');
  if (staged === original) {
    fail(`${functionName} does not import the repository source from the expected path.`);
  }

  write(join(targetDirectory, 'index.ts'), staged);
  write(join(targetDirectory, 'deno.json'), readFileSync(sourceDeno, 'utf8'));
}

function verifyNoSloppyImports(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const details = statSync(path);
    if (details.isDirectory()) {
      verifyNoSloppyImports(path);
      continue;
    }
    if (!name.endsWith('.ts') && !name.endsWith('.tsx')) continue;

    const source = readFileSync(path, 'utf8');
    const sloppy = source.match(/(?:from\s+|import\s*\(\s*)['"]\.{1,2}\/[^'"]+\.jsx?['"]/i);
    if (sloppy !== null) {
      fail(`Generated module still contains a JavaScript-relative import: ${relative(stagingRoot, path)}.`);
    }
  }
}

if (!existsSync(join(sourceSupabase, 'config.toml'))) {
  fail('Missing isolated gameplay Supabase config.');
}
if (!existsSync(sourceCode)) fail('Missing repository source directory.');

rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(stagingRoot, { recursive: true });

write(
  join(stagingSupabase, 'config.toml'),
  readFileSync(join(sourceSupabase, 'config.toml'), 'utf8'),
);
copySourceTree(sourceCode, stagingCode);
for (const functionName of functionNames) copyFunction(functionName);
verifyNoSloppyImports(stagingCode);

console.log(`Prepared gameplay Function deployment workspace: ${stagingRoot}`);
