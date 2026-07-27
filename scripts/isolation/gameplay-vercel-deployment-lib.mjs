import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const EXPECTED_SUPABASE_URL = 'https://stedjwppoanbmhxsfhcg.supabase.co';
const EXPECTED_WORKSPACE_SLUG = 'estimation-gameplay-uat';
const EXPECTED_VERCEL_PROJECT = 'estimation-gameplay-uat';
const EXPECTED_VERCEL_SCOPE = 'plusmaloma-6068s-projects';
const PROHIBITED_SUPABASE_REF = 'lexewcehptnmikwfizhj';
const REQUIRED_ARGUMENTS = new Set([
  '--expected-sha',
  '--supabase-url',
  '--workspace-slug',
]);
const PROHIBITED_SECRET_ENV_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_DB_PASSWORD',
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
  'VERCEL_OIDC_TOKEN',
  'VERCEL_TOKEN',
  'OPENAI_API_KEY',
];

function fail(message) {
  throw new Error(message);
}

function normalizeRelative(root, path) {
  return relative(root, path).replaceAll('\\', '/');
}

function walk(root, current = root) {
  const paths = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolute = join(current, entry.name);
    paths.push(absolute);
    if (entry.isDirectory()) paths.push(...walk(root, absolute));
  }
  return paths;
}

function javascriptAssets(root) {
  if (!existsSync(root)) return [];
  return walk(root)
    .filter((path) => lstatSync(path).isFile() && path.toLowerCase().endsWith('.js'));
}

export function parseDeploymentOptions(argv, environment) {
  const values = new Map();
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      if (dryRun) fail('Duplicate --dry-run argument.');
      dryRun = true;
      continue;
    }
    if (!REQUIRED_ARGUMENTS.has(argument)) {
      fail(`Unknown deployment argument: ${argument}`);
    }
    if (values.has(argument)) fail(`Duplicate deployment argument: ${argument}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      fail(`Missing value for ${argument}.`);
    }
    values.set(argument, value.trim());
    index += 1;
  }

  for (const argument of REQUIRED_ARGUMENTS) {
    if (!values.has(argument) || values.get(argument).length === 0) {
      fail(`Missing required deployment argument ${argument}.`);
    }
  }

  const expectedSha = values.get('--expected-sha');
  const supabaseUrl = values.get('--supabase-url');
  const workspaceSlug = values.get('--workspace-slug');
  const publishableKey = environment.GAMEPLAY_UAT_PUBLISHABLE_KEY?.trim();

  if (!/^[0-9a-f]{40}$/i.test(expectedSha)) {
    fail('The tested commit SHA must contain exactly 40 hexadecimal characters.');
  }
  if (supabaseUrl !== EXPECTED_SUPABASE_URL || supabaseUrl.includes(PROHIBITED_SUPABASE_REF)) {
    fail('The Supabase URL must target the isolated gameplay UAT project.');
  }
  if (workspaceSlug !== EXPECTED_WORKSPACE_SLUG || workspaceSlug.includes('score-calculator')) {
    fail('The workspace slug must be estimation-gameplay-uat.');
  }
  if (publishableKey === undefined || publishableKey.length < 20) {
    fail('A browser-safe publishable key is required through GAMEPLAY_UAT_PUBLISHABLE_KEY.');
  }
  if (publishableKey.startsWith('sb_secret_') || publishableKey.toLowerCase().includes('service_role')) {
    fail('GAMEPLAY_UAT_PUBLISHABLE_KEY must not contain a secret or service-role credential.');
  }

  return {
    expectedSha,
    supabaseUrl,
    workspaceSlug,
    publishableKey,
    dryRun,
  };
}

export function createGameplayBuildEnv(baseEnvironment, options) {
  return {
    ...baseEnvironment,
    VITE_SUPABASE_URL: options.supabaseUrl,
    VITE_SUPABASE_ANON_KEY: options.publishableKey,
    VITE_UAT_WORKSPACE_SLUG: options.workspaceSlug,
  };
}

export function createBuildOutputConfig() {
  return {
    version: 3,
    routes: [
      { handle: 'filesystem' },
      { src: '/.*', dest: '/index.html' },
    ],
  };
}

export function stageGameplayDeployment({ checkoutRoot, stagingRoot }) {
  const resolvedCheckout = resolve(checkoutRoot);
  const resolvedStaging = resolve(stagingRoot);
  const sourceProject = join(resolvedCheckout, '.vercel', 'project.json');
  const sourceArtifact = join(resolvedCheckout, 'dist-gameplay');
  const sourceIndex = join(sourceArtifact, 'index.html');

  if (!existsSync(sourceProject)) fail('The verified Vercel project metadata is missing.');
  if (!existsSync(sourceIndex)) fail('dist-gameplay/index.html is missing.');

  let project;
  try {
    project = JSON.parse(readFileSync(sourceProject, 'utf8'));
  } catch {
    fail('The verified Vercel project metadata is not valid JSON.');
  }
  if (project?.projectName !== EXPECTED_VERCEL_PROJECT) {
    fail('The linked Vercel project is not estimation-gameplay-uat.');
  }
  if (typeof project.projectId !== 'string' || typeof project.orgId !== 'string') {
    fail('The linked Vercel project metadata is incomplete.');
  }

  rmSync(resolvedStaging, { recursive: true, force: true });
  const outputRoot = join(resolvedStaging, '.vercel', 'output');
  const staticRoot = join(outputRoot, 'static');
  mkdirSync(dirname(join(resolvedStaging, '.vercel', 'project.json')), { recursive: true });
  mkdirSync(staticRoot, { recursive: true });

  cpSync(sourceProject, join(resolvedStaging, '.vercel', 'project.json'));
  cpSync(sourceArtifact, staticRoot, { recursive: true });
  writeFileSync(
    join(outputRoot, 'config.json'),
    `${JSON.stringify(createBuildOutputConfig(), null, 2)}\n`,
    'utf8',
  );
}

export function validateStagedPaths(stagingRoot) {
  const resolvedRoot = resolve(stagingRoot);
  if (!existsSync(resolvedRoot)) fail('The Vercel gameplay deployment workspace is missing.');

  for (const absolute of walk(resolvedRoot)) {
    const relativePath = normalizeRelative(resolvedRoot, absolute);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) fail('A symbolic link is not allowed in the staged workspace.');

    const isAllowedDirectory = stat.isDirectory() && (
      relativePath === '.vercel'
      || relativePath === '.vercel/output'
      || relativePath === '.vercel/output/static'
      || relativePath.startsWith('.vercel/output/static/')
    );
    const isAllowedFile = stat.isFile() && (
      relativePath === '.vercel/project.json'
      || relativePath === '.vercel/output/config.json'
      || relativePath.startsWith('.vercel/output/static/')
    );
    if (!isAllowedDirectory && !isAllowedFile) {
      fail('A path outside the gameplay deployment allow-list was detected.');
    }
  }

  const projectPath = join(resolvedRoot, '.vercel', 'project.json');
  const configPath = join(resolvedRoot, '.vercel', 'output', 'config.json');
  if (!existsSync(projectPath) || !existsSync(configPath)) {
    fail('The staged workspace is incomplete.');
  }

  const project = JSON.parse(readFileSync(projectPath, 'utf8'));
  if (project?.projectName !== EXPECTED_VERCEL_PROJECT) {
    fail('The staged Vercel project is not estimation-gameplay-uat.');
  }

  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  if (JSON.stringify(config) !== JSON.stringify(createBuildOutputConfig())) {
    fail('The staged Build Output API configuration is invalid.');
  }
}

export function validateGameplayBundle({ stagingRoot, options, environment }) {
  const staticRoot = join(resolve(stagingRoot), '.vercel', 'output', 'static');
  const indexPath = join(staticRoot, 'index.html');
  if (!existsSync(indexPath)) fail('The staged gameplay index.html is missing.');

  const assets = javascriptAssets(staticRoot);
  if (assets.length === 0) fail('The staged gameplay bundle has no JavaScript assets.');
  const bundleText = assets.map((path) => readFileSync(path, 'utf8')).join('\n');

  if (!bundleText.includes(options.supabaseUrl)) {
    fail('The expected gameplay Supabase URL is missing from the bundle.');
  }
  if (!bundleText.includes(options.workspaceSlug)) {
    fail('The expected gameplay workspace slug is missing from the bundle.');
  }
  if (!bundleText.includes(options.publishableKey)) {
    fail('The expected browser publishable key is missing from the bundle.');
  }

  for (const name of PROHIBITED_SECRET_ENV_NAMES) {
    const secretValue = environment[name]?.trim();
    if (secretValue !== undefined && secretValue.length > 0 && bundleText.includes(secretValue)) {
      fail('A prohibited secret value was detected in the gameplay bundle.');
    }
  }

  return { javascriptAssetCount: assets.length };
}

export function createNpxLaunch(platform, args, comspec) {
  if (platform === 'win32') {
    return {
      command: comspec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', 'npx.cmd', ...args],
    };
  }
  return { command: 'npx', args: [...args] };
}

export function createVercelDeployArgs() {
  return [
    'vercel',
    'deploy',
    '--prebuilt',
    '--prod',
    '--scope',
    EXPECTED_VERCEL_SCOPE,
    '--logs',
  ];
}
