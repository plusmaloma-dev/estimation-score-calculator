import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createGameplayBuildEnv,
  createNpxLaunch,
  createVercelDeployArgs,
  parseDeploymentOptions,
  stageGameplayDeployment,
  validateGameplayBundle,
  validateStagedPaths,
} from './gameplay-vercel-deployment-lib.mjs';

function fail(message) {
  console.error(`Gameplay Vercel deployment failed: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error !== undefined) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runNpm(args, options = {}) {
  if (process.platform === 'win32') {
    run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd', ...args], options);
    return;
  }
  run('npm', args, options);
}

function redactedDeployEnvironment(environment) {
  const value = { ...environment };
  delete value.GAMEPLAY_UAT_PUBLISHABLE_KEY;
  delete value.VITE_SUPABASE_URL;
  delete value.VITE_SUPABASE_ANON_KEY;
  delete value.VITE_UAT_WORKSPACE_SLUG;
  return value;
}

const options = (() => {
  try {
    return parseDeploymentOptions(process.argv.slice(2), process.env);
  } catch (reason) {
    fail(reason instanceof Error ? reason.message : String(reason));
  }
})();

const checkoutRoot = resolve(process.cwd());
const guard = resolve(checkoutRoot, 'scripts', 'isolation', 'gameplay-target-guard.mjs');
const stagingRoot = resolve(checkoutRoot, 'vercel-gameplay-deploy');
const projectPath = resolve(checkoutRoot, '.vercel', 'project.json');

if (!existsSync(guard)) fail('The gameplay target guard is missing.');
if (!existsSync(projectPath)) fail('The linked gameplay Vercel project metadata is missing.');

const guardArgs = [guard, 'vercel', '--expected-sha', options.expectedSha];
run(process.execPath, guardArgs, { cwd: checkoutRoot });

const buildEnvironment = createGameplayBuildEnv(process.env, options);
runNpm(['run', 'build:gameplay'], { cwd: checkoutRoot, env: buildEnvironment });

try {
  stageGameplayDeployment({ checkoutRoot, stagingRoot });
  validateStagedPaths(stagingRoot);
} catch (reason) {
  fail(reason instanceof Error ? reason.message : String(reason));
}

const bundleResult = (() => {
  try {
    return validateGameplayBundle({
      stagingRoot,
      options,
      environment: process.env,
    });
  } catch (reason) {
    fail(reason instanceof Error ? reason.message : String(reason));
  }
})();

run(process.execPath, guardArgs, { cwd: checkoutRoot });

const deployArgs = createVercelDeployArgs();
const deployLaunch = createNpxLaunch(process.platform, deployArgs, process.env.ComSpec);

console.log('Gameplay Vercel target verified: estimation-gameplay-uat');
console.log(`Checkout SHA verified: ${options.expectedSha}`);
console.log(`JavaScript assets staged: ${bundleResult.javascriptAssetCount}`);
console.log('Expected Supabase URL embedded: true');
console.log('Expected workspace slug embedded: true');
console.log('Expected publishable key embedded: true');
console.log('Prohibited secret values detected: false');

if (options.dryRun) {
  console.log(`Dry-run deployment command: npx ${deployArgs.join(' ')}`);
  console.log('Dry run complete. No Vercel deployment was started.');
  process.exit(0);
}

run(deployLaunch.command, deployLaunch.args, {
  cwd: stagingRoot,
  env: redactedDeployEnvironment(process.env),
});
