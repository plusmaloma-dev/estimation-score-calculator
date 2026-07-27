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
const VERCEL_SCOPE = 'plusmaloma-6068s-projects';
const PROHIBITED_SUPABASE_REF = 'lexewcehptnmikwfizhj';
const REQUIRED_ARGUMENTS = new Set([
  '--expected-sha',
  '--supabase-url',
  '--workspace-slug',
]);
const PROHIBITED_SECRET_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_DB_PASSWORD',
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
  'VERCEL_OIDC_TOKEN',
  'VERCEL_TOKEN',
  'GITHUB_TOKEN',
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

function legacyJwtRole(value) {
  const parts = value.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.role === 'string' ? payload.role : undefined;
  } catch {
    return undefined;
  }
}

function isBrowserSafePublishableKey(value) {
  if (value.startsWith('sb_publishable_')) return true;
  return legacyJwtRole(value) === 'anon';
}

export function validateInputs(input) {
  const expectedSha = input.expectedSha?.trim();
  const supabaseUrl = input.supabaseUrl?.trim();
  const workspaceSlug = input.workspaceSlug?.trim();
  const publishableKey = input.publishableKey?.trim();

  if (!/^[0-9a-f]{40}$/i.test(expectedSha ?? '')) {
    fail('A tested 40-hex SHA is required.');
  }
  if (supabaseUrl !== EXPECTED_SUPABASE_URL) {
    if ((supabaseUrl ?? '').includes(PROHIBITED_SUPABASE_REF)) {
      fail('The score-UAT Supabase ref is prohibited.');
    }
    fail(`Supabase URL must target ${EXPECTED_SUPABASE_URL}.`);
  }
  if (workspaceSlug !== EXPECTED_WORKSPACE_SLUG) {
    fail(`Workspace slug must be ${EXPECTED_WORKSPACE_SLUG}.`);
  }
  if (typeof publishableKey !== 'string' || publishableKey.length < 20) {
    fail('GAMEPLAY_UAT_PUBLISHABLE_KEY is required and must be a browser-safe publishable key.');
  }
  if (!isBrowserSafePublishableKey(publishableKey)) {
    fail('The supplied key is not browser-safe. Use an sb_publishable_ key or a legacy anon JWT.');
  }

  return Object.freeze({
    expectedSha: expectedSha.toLowerCase(),
    supabaseUrl,
    workspaceSlug,
    publishableKey,
  });
}

export function createBuildEnvironment(baseEnvironment, input) {
  const environment = {};
  for (const [name, value] of Object.entries(baseEnvironment)) {
    const normalizedName = name.toUpperCase();
    if (normalizedName.startsWith('VITE_')) continue;
    if (normalizedName === 'GAMEPLAY_UAT_PUBLISHABLE_KEY') continue;
    if (PROHIBITED_SECRET_NAMES.includes(normalizedName)) continue;
    environment[name] = value;
  }

  return {
    ...environment,
    VITE_SUPABASE_URL: input.supabaseUrl,
    VITE_SUPABASE_ANON_KEY: input.publishableKey,
    VITE_UAT_WORKSPACE_SLUG: input.workspaceSlug,
  };
}

export function collectProhibitedSecretValues(environment) {
  return PROHIBITED_SECRET_NAMES.flatMap((name) => {
    const value = environment[name]?.trim();
    return typeof value === 'string' && value.length > 0 ? [{ name, value }] : [];
  });
}

export function validateBundle(bundleText, input, prohibitedSecrets) {
  if (!bundleText.includes(input.supabaseUrl)) {
    fail('Expected gameplay Supabase URL is missing from the bundle.');
  }
  if (!bundleText.includes(input.workspaceSlug)) {
    fail('Expected gameplay workspace slug is missing from the bundle.');
  }
  if (!bundleText.includes(input.publishableKey)) {
    fail('Expected browser-safe publishable key is missing from the bundle.');
  }
  for (const secret of prohibitedSecrets) {
    if (bundleText.includes(secret.value)) {
      fail(`Bundle contains prohibited value from ${secret.name}.`);
    }
  }
}

export function assertAllowedWorkspaceEntries(relativePaths) {
  const allowed = [
    /^\.vercel\/project\.json$/,
    /^\.vercel\/output\/config\.json$/,
    /^\.vercel\/output\/static\/.+/,
  ];
  for (const value of relativePaths) {
    const path = value.replaceAll('\\', '/');
    const segments = path.split('/');
    const fileName = segments.at(-1)?.toLowerCase() ?? '';
    const forbiddenName = fileName === 'vercel.json'
      || fileName === '.env'
      || fileName.startsWith('.env.')
      || /\.(?:ts|tsx|jsx|map)$/i.test(fileName);
    const forbiddenPath = segments.includes('..')
      || /(^|\/)dist-app(\/|$)/i.test(path);

    if (forbiddenName || forbiddenPath || !allowed.some((pattern) => pattern.test(path))) {
      fail(`Staged path is not allowed: ${path}`);
    }
  }
}

export function createDeploymentConfig() {
  return {
    version: 3,
    routes: [
      { handle: 'filesystem' },
      { src: '/.*', dest: '/index.html' },
    ],
  };
}

export function createVercelDeployCommand() {
  return [
    'vercel',
    'deploy',
    '--prebuilt',
    '--prod',
    '--archive=tgz',
    '--scope',
    VERCEL_SCOPE,
    '--logs',
  ];
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

  const validated = validateInputs({
    expectedSha: values.get('--expected-sha'),
    supabaseUrl: values.get('--supabase-url'),
    workspaceSlug: values.get('--workspace-slug'),
    publishableKey: environment.GAMEPLAY_UAT_PUBLISHABLE_KEY,
  });

  return { ...validated, dryRun };
}

export function createGameplayBuildEnv(baseEnvironment, options) {
  return createBuildEnvironment(baseEnvironment, options);
}

export function createBuildOutputConfig() {
  return createDeploymentConfig();
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
    `${JSON.stringify(createDeploymentConfig(), null, 2)}\n`,
    'utf8',
  );
}

export function validateStagedPaths(stagingRoot) {
  const resolvedRoot = resolve(stagingRoot);
  if (!existsSync(resolvedRoot)) fail('The Vercel gameplay deployment workspace is missing.');

  const relativeFiles = [];
  for (const absolute of walk(resolvedRoot)) {
    const relativePath = normalizeRelative(resolvedRoot, absolute);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) fail('A symbolic link is not allowed in the staged workspace.');

    if (stat.isDirectory()) {
      const allowedDirectory = relativePath === '.vercel'
        || relativePath === '.vercel/output'
        || relativePath === '.vercel/output/static'
        || relativePath.startsWith('.vercel/output/static/');
      if (!allowedDirectory) fail(`Staged path is not allowed: ${relativePath}`);
    } else if (stat.isFile()) {
      relativeFiles.push(relativePath);
    } else {
      fail(`Staged path is not allowed: ${relativePath}`);
    }
  }
  assertAllowedWorkspaceEntries(relativeFiles);

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
  if (JSON.stringify(config) !== JSON.stringify(createDeploymentConfig())) {
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
  validateBundle(bundleText, options, collectProhibitedSecretValues(environment));

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
  return createVercelDeployCommand();
}
