import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAllowedWorkspaceEntries,
  collectProhibitedSecretValues,
  createBuildEnvironment,
  createDeploymentConfig,
  createVercelDeployCommand,
  validateBundle,
  validateInputs,
} from '../../scripts/isolation/gameplay-vercel-deployment-lib.mjs';

const validInput = {
  expectedSha: '0123456789abcdef0123456789abcdef01234567',
  supabaseUrl: 'https://stedjwppoanbmhxsfhcg.supabase.co',
  workspaceSlug: 'estimation-gameplay-uat',
  publishableKey: 'sb_publishable_test_value_12345',
};

test('input validation rejects missing, malformed, or score-UAT values', () => {
  assert.deepEqual(validateInputs(validInput), validInput);
  assert.throws(() => validateInputs({ ...validInput, expectedSha: 'bad' }), /sha/i);
  assert.throws(
    () => validateInputs({ ...validInput, supabaseUrl: 'https://lexewcehptnmikwfizhj.supabase.co' }),
    /prohibited/i,
  );
  assert.throws(() => validateInputs({ ...validInput, workspaceSlug: 'wrong-workspace' }), /workspace/i);
  assert.throws(() => validateInputs({ ...validInput, publishableKey: '' }), /publishable/i);
  assert.throws(() => validateInputs({ ...validInput, publishableKey: 'sb_secret_not_browser_safe' }), /browser-safe/i);
});

test('build environment explicitly overwrites all three VITE values', () => {
  const environment = createBuildEnvironment(
    {
      PATH: 'fixture-path',
      VITE_SUPABASE_URL: 'trap-url',
      VITE_SUPABASE_ANON_KEY: 'trap-key',
      VITE_UAT_WORKSPACE_SLUG: 'trap-slug',
    },
    validInput,
  );
  assert.equal(environment.PATH, 'fixture-path');
  assert.equal(environment.VITE_SUPABASE_URL, validInput.supabaseUrl);
  assert.equal(environment.VITE_SUPABASE_ANON_KEY, validInput.publishableKey);
  assert.equal(environment.VITE_UAT_WORKSPACE_SLUG, validInput.workspaceSlug);
});

test('bundle validation requires expected public values and rejects exact prohibited values', () => {
  const goodBundle = `${validInput.supabaseUrl}|${validInput.workspaceSlug}|${validInput.publishableKey}`;
  assert.doesNotThrow(() => validateBundle(goodBundle, validInput, []));
  assert.throws(() => validateBundle('missing', validInput, []), /Supabase URL/i);

  const prohibitedValue = 'exact-secret-value';
  let message = '';
  try {
    validateBundle(`${goodBundle}|${prohibitedValue}`, validInput, [
      { name: 'VERCEL_OIDC_TOKEN', value: prohibitedValue },
    ]);
    assert.fail('Expected exact prohibited value rejection.');
  } catch (reason) {
    message = reason instanceof Error ? reason.message : String(reason);
  }
  assert.match(message, /VERCEL_OIDC_TOKEN/);
  assert.doesNotMatch(message, new RegExp(prohibitedValue));
});

test('prohibited secret collection ignores empty values and the allowed publishable key', () => {
  const values = collectProhibitedSecretValues({
    GAMEPLAY_UAT_PUBLISHABLE_KEY: validInput.publishableKey,
    VERCEL_OIDC_TOKEN: 'oidc-secret',
    SUPABASE_SERVICE_ROLE_KEY: '',
    DATABASE_URL: 'postgresql://secret',
  });
  assert.deepEqual(
    values.map((value) => value.name).sort(),
    ['DATABASE_URL', 'VERCEL_OIDC_TOKEN'],
  );
  assert.equal(values.some((value) => value.value === validInput.publishableKey), false);
});

test('staging allow-list rejects repository, env, source-map, and score output names at any depth', () => {
  assert.doesNotThrow(() => assertAllowedWorkspaceEntries([
    '.vercel/project.json',
    '.vercel/output/config.json',
    '.vercel/output/static/index.html',
    '.vercel/output/static/assets/app.js',
  ]));
  for (const forbidden of [
    'vercel.json',
    'dist-app/index.html',
    '.env.local',
    'src/index.ts',
    '.vercel/output/static/.env.local',
    '.vercel/output/static/vercel.json',
    '.vercel/output/static/assets/source.ts',
    '.vercel/output/static/assets/app.js.map',
    '.vercel/output/static/../outside.txt',
  ]) {
    assert.throws(() => assertAllowedWorkspaceEntries([forbidden]), /not allowed/i);
  }
});

test('deployment config and command are deterministic', () => {
  assert.deepEqual(createDeploymentConfig(), {
    version: 3,
    routes: [
      { handle: 'filesystem' },
      { src: '/.*', dest: '/index.html' },
    ],
  });
  assert.deepEqual(createVercelDeployCommand(), [
    'vercel',
    'deploy',
    '--prebuilt',
    '--prod',
    '--archive=tgz',
    '--scope',
    'plusmaloma-6068s-projects',
    '--logs',
  ]);
});
