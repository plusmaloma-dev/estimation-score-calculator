import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

interface DeploymentOptions {
  readonly expectedSha: string;
  readonly supabaseUrl: string;
  readonly workspaceSlug: string;
  readonly publishableKey: string;
  readonly dryRun: boolean;
}

interface LaunchSpec {
  readonly command: string;
  readonly args: readonly string[];
}

interface DeploymentLibrary {
  parseDeploymentOptions(argv: readonly string[], environment: NodeJS.ProcessEnv): DeploymentOptions;
  createGameplayBuildEnv(baseEnvironment: NodeJS.ProcessEnv, options: DeploymentOptions): NodeJS.ProcessEnv;
  createBuildOutputConfig(): {
    readonly version: number;
    readonly routes: readonly Readonly<Record<string, string>>[];
  };
  stageGameplayDeployment(input: { readonly checkoutRoot: string; readonly stagingRoot: string }): void;
  validateStagedPaths(stagingRoot: string): void;
  validateGameplayBundle(input: {
    readonly stagingRoot: string;
    readonly options: DeploymentOptions;
    readonly environment: NodeJS.ProcessEnv;
  }): { readonly javascriptAssetCount: number };
  createNpxLaunch(platform: NodeJS.Platform, args: readonly string[], comspec?: string): LaunchSpec;
  createVercelDeployArgs(): readonly string[];
}

const expectedSha = '0123456789abcdef0123456789abcdef01234567';
const supabaseUrl = 'https://stedjwppoanbmhxsfhcg.supabase.co';
const workspaceSlug = 'estimation-gameplay-uat';
const publishableKey = 'sb_publishable_fixture_value';

async function loadLibrary(): Promise<DeploymentLibrary> {
  const moduleUrl = pathToFileURL(resolve('scripts/isolation/gameplay-vercel-deployment-lib.mjs')).href;
  return await import(moduleUrl) as DeploymentLibrary;
}

function validArgv(): readonly string[] {
  return [
    '--expected-sha', expectedSha,
    '--supabase-url', supabaseUrl,
    '--workspace-slug', workspaceSlug,
    '--dry-run',
  ];
}

function validEnvironment(): NodeJS.ProcessEnv {
  return { GAMEPLAY_UAT_PUBLISHABLE_KEY: publishableKey };
}

function fixture(): { readonly root: string; readonly checkout: string; readonly staging: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), 'gameplay-vercel-'));
  const checkout = join(root, 'checkout');
  const staging = join(root, 'vercel-gameplay-deploy');
  mkdirSync(join(checkout, '.vercel'), { recursive: true });
  mkdirSync(join(checkout, 'dist-gameplay', 'assets'), { recursive: true });
  mkdirSync(join(checkout, 'dist-app'), { recursive: true });
  mkdirSync(join(checkout, 'src'), { recursive: true });
  writeFileSync(join(checkout, '.vercel', 'project.json'), JSON.stringify({
    orgId: 'team_fixture',
    projectId: 'prj_fixture',
    projectName: 'estimation-gameplay-uat',
  }));
  writeFileSync(join(checkout, 'dist-gameplay', 'index.html'), '<div id="root"></div>');
  writeFileSync(
    join(checkout, 'dist-gameplay', 'assets', 'app.js'),
    `${supabaseUrl}\n${workspaceSlug}\n${publishableKey}\n`,
  );
  writeFileSync(join(checkout, 'vercel.json'), '{"buildCommand":"npm run build"}');
  writeFileSync(join(checkout, 'dist-app', 'score.js'), 'score app');
  writeFileSync(join(checkout, 'src', 'private.ts'), 'source');
  writeFileSync(join(checkout, '.env.local'), 'VERCEL_OIDC_TOKEN=fixture');
  return {
    root,
    checkout,
    staging,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function listPaths(root: string, current = root): readonly string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolute = join(current, entry.name);
    const path = relative(root, absolute).replaceAll('\\', '/');
    paths.push(path);
    if (entry.isDirectory()) paths.push(...listPaths(root, absolute));
  }
  return paths.sort();
}

test('deployment options accept only the exact gameplay UAT target and hidden key', async () => {
  const library = await loadLibrary();
  const options = library.parseDeploymentOptions(validArgv(), validEnvironment());
  assert.deepEqual(options, {
    expectedSha,
    supabaseUrl,
    workspaceSlug,
    publishableKey,
    dryRun: true,
  });

  assert.throws(() => library.parseDeploymentOptions(validArgv(), {}), /publishable/i);
  assert.throws(() => library.parseDeploymentOptions([
    '--expected-sha', 'bad',
    '--supabase-url', supabaseUrl,
    '--workspace-slug', workspaceSlug,
  ], validEnvironment()), /sha/i);
  assert.throws(() => library.parseDeploymentOptions([
    '--expected-sha', expectedSha,
    '--supabase-url', 'https://lexewcehptnmikwfizhj.supabase.co',
    '--workspace-slug', workspaceSlug,
  ], validEnvironment()), /supabase/i);
  assert.throws(() => library.parseDeploymentOptions([
    '--expected-sha', expectedSha,
    '--supabase-url', supabaseUrl,
    '--workspace-slug', 'estimation-score-calculator',
  ], validEnvironment()), /workspace/i);
  assert.throws(() => library.parseDeploymentOptions([...validArgv(), '--unknown']), /unknown/i);
});

test('gameplay build environment overrides only the three required VITE values', async () => {
  const library = await loadLibrary();
  const options = library.parseDeploymentOptions(validArgv(), validEnvironment());
  const environment = library.createGameplayBuildEnv({
    PATH: 'fixture-path',
    VITE_SUPABASE_URL: 'wrong',
    VITE_SUPABASE_ANON_KEY: 'wrong',
    VITE_UAT_WORKSPACE_SLUG: 'wrong',
  }, options);

  assert.equal(environment.PATH, 'fixture-path');
  assert.equal(environment.VITE_SUPABASE_URL, supabaseUrl);
  assert.equal(environment.VITE_SUPABASE_ANON_KEY, publishableKey);
  assert.equal(environment.VITE_UAT_WORKSPACE_SLUG, workspaceSlug);
});

test('staging copies only gameplay Build Output API files', async () => {
  const library = await loadLibrary();
  const value = fixture();
  try {
    library.stageGameplayDeployment({ checkoutRoot: value.checkout, stagingRoot: value.staging });
    library.validateStagedPaths(value.staging);

    assert.deepEqual(listPaths(value.staging), [
      '.vercel',
      '.vercel/output',
      '.vercel/output/config.json',
      '.vercel/output/static',
      '.vercel/output/static/assets',
      '.vercel/output/static/assets/app.js',
      '.vercel/output/static/index.html',
      '.vercel/project.json',
    ]);
    assert.equal(readFileSync(join(value.staging, '.vercel', 'project.json'), 'utf8').includes('estimation-gameplay-uat'), true);
    assert.equal(listPaths(value.staging).some((path) => path.includes('vercel.json')), false);
    assert.equal(listPaths(value.staging).some((path) => path.includes('dist-app')), false);
    assert.equal(listPaths(value.staging).some((path) => path.includes('.env')), false);

    writeFileSync(join(value.staging, 'vercel.json'), '{}');
    assert.throws(() => library.validateStagedPaths(value.staging), /path/i);
  } finally {
    value.cleanup();
  }
});

test('bundle validation requires expected public values and rejects exact secret values without echoing them', async () => {
  const library = await loadLibrary();
  const value = fixture();
  try {
    const options = library.parseDeploymentOptions(validArgv(), validEnvironment());
    library.stageGameplayDeployment({ checkoutRoot: value.checkout, stagingRoot: value.staging });
    const result = library.validateGameplayBundle({
      stagingRoot: value.staging,
      options,
      environment: { SUPABASE_SERVICE_ROLE_KEY: 'exact-prohibited-secret' },
    });
    assert.equal(result.javascriptAssetCount, 1);

    const assetPath = join(value.staging, '.vercel', 'output', 'static', 'assets', 'app.js');
    writeFileSync(assetPath, `${readFileSync(assetPath, 'utf8')}exact-prohibited-secret`);
    let message = '';
    try {
      library.validateGameplayBundle({
        stagingRoot: value.staging,
        options,
        environment: { SUPABASE_SERVICE_ROLE_KEY: 'exact-prohibited-secret' },
      });
      assert.fail('Expected prohibited secret rejection.');
    } catch (reason) {
      message = reason instanceof Error ? reason.message : String(reason);
    }
    assert.match(message, /forbidden|prohibited|secret/i);
    assert.doesNotMatch(message, /exact-prohibited-secret/);

    writeFileSync(assetPath, publishableKey);
    assert.throws(() => library.validateGameplayBundle({
      stagingRoot: value.staging,
      options,
      environment: {},
    }), /url|workspace/i);
  } finally {
    value.cleanup();
  }
});

test('Build Output config and Vercel deployment command are deterministic', async () => {
  const library = await loadLibrary();
  assert.deepEqual(library.createBuildOutputConfig(), {
    version: 3,
    routes: [
      { handle: 'filesystem' },
      { src: '/.*', dest: '/index.html' },
    ],
  });
  assert.deepEqual(library.createVercelDeployArgs(), [
    'vercel',
    'deploy',
    '--prebuilt',
    '--prod',
    '--scope',
    'plusmaloma-6068s-projects',
    '--logs',
  ]);
});

test('Windows command shims launch through cmd.exe', async () => {
  const library = await loadLibrary();
  assert.deepEqual(
    library.createNpxLaunch('win32', ['vercel', 'deploy'], 'C:\\Windows\\System32\\cmd.exe'),
    {
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'npx.cmd', 'vercel', 'deploy'],
    },
  );
  assert.deepEqual(library.createNpxLaunch('linux', ['vercel', 'deploy']), {
    command: 'npx',
    args: ['vercel', 'deploy'],
  });
});

test('gameplay Vite config disables env-file loading', () => {
  const source = readFileSync(resolve('vite.gameplay.config.ts'), 'utf8');
  assert.match(source, /envFile\s*:\s*false/);
  assert.match(source, /dist-gameplay/);
  assert.equal(basename(resolve('vite.gameplay.config.ts')), 'vite.gameplay.config.ts');
});
