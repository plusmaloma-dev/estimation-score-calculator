import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const wrapperPath = 'scripts/isolation/deploy-gameplay-migrations.mjs';
const wrapper = existsSync(wrapperPath) ? readFileSync(wrapperPath, 'utf8') : '';
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  readonly scripts?: Readonly<Record<string, string>>;
};

test('gameplay migration deployment wrapper is fail-closed and isolated', () => {
  assert.equal(existsSync(wrapperPath), true, 'Missing guarded gameplay migration deployment wrapper.');
  assert.match(wrapper, /gameplay-target-guard\.mjs/i);
  assert.match(wrapper, /stedjwppoanbmhxsfhcg/i);
  assert.match(wrapper, /lexewcehptnmikwfizhj/i);
  assert.match(wrapper, /--expected-sha/i);
  assert.match(wrapper, /const\s+WORKSPACE\s*=\s*['"]supabase-gameplay['"]/i);
  assert.match(wrapper, /--workdir/i);
  assert.doesNotMatch(wrapper, /db\s+push[\s\S]*--db-url/i);
  assert.match(
    wrapper,
    /runGuard\(projectRef, expectedSha, 'before migration inspection'\)[\s\S]*inspectLinkedMigrationState\(\)[\s\S]*runGuard\(projectRef, expectedSha, 'immediately before migration push'\)[\s\S]*runNpx\(\['supabase', '--workdir', WORKSPACE, 'db', 'push', '--linked'\], true,[\s\S]*inspectLinkedMigrationState\(\)/,
  );
});

test('package and isolation CI expose the guarded migration wrapper tests', () => {
  assert.match(packageJson.scripts?.['deploy:gameplay-migrations'] ?? '', /deploy-gameplay-migrations\.mjs/i);
  assert.match(packageJson.scripts?.['test:isolation-static'] ?? '', /gameplayMigrationDeploymentWorkspace\.test\.js/i);
});
