import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const deployScript = resolve('scripts/isolation/deploy-gameplay-vercel.mjs');
const libraryScript = resolve('scripts/isolation/gameplay-vercel-deployment-lib.mjs');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  readonly scripts?: Readonly<Record<string, string>>;
};

test('gameplay Vercel deployment entry point is guarded and canonical-UAT explicit', () => {
  assert.equal(existsSync(deployScript), true, 'Missing gameplay Vercel deployment wrapper.');
  assert.equal(existsSync(libraryScript), true, 'Missing gameplay Vercel deployment helper.');

  const wrapper = readFileSync(deployScript, 'utf8');
  const library = readFileSync(libraryScript, 'utf8');
  const combined = `${wrapper}\n${library}`;

  assert.match(wrapper, /gameplay-target-guard\.mjs/i);
  assert.match(combined, /GAMEPLAY_UAT_PUBLISHABLE_KEY/);
  assert.match(wrapper, /build:gameplay/);
  assert.match(wrapper, /vercel-gameplay-deploy/);
  assert.match(library, /--prebuilt/);
  assert.match(library, /--prod/);
  assert.match(library, /--archive=tgz/);
  assert.match(library, /plusmaloma-6068s-projects/);
  assert.doesNotMatch(combined, /--target[=\s]+preview/i);
  assert.doesNotMatch(combined, /vercel\s+env\s+run/i);
});

test('package scripts and ignore rules expose only the guarded deployment entry point', () => {
  assert.match(readFileSync('.gitignore', 'utf8'), /^vercel-gameplay-deploy\/$/m);
  assert.match(packageJson.scripts?.['deploy:gameplay-vercel'] ?? '', /deploy-gameplay-vercel\.mjs/);
  assert.match(packageJson.scripts?.['test:gameplay-vercel-deploy'] ?? '', /gameplayVercelDeployment\.test\.mjs/);
  assert.match(packageJson.scripts?.['test:isolation-static'] ?? '', /gameplayVercelDeploymentWorkspace\.test\.js/);
});

test('gameplay Vite build refuses implicit env-file loading', () => {
  const source = readFileSync('vite.gameplay.config.ts', 'utf8');
  assert.match(source, /envDir\s*:\s*false/);
  assert.doesNotMatch(source, /envFile\s*:/);
});
