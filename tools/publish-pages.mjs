// Pushes dist/ to the gh-pages branch, which is what GitHub Pages serves.
//
// This exists instead of a GitHub Actions workflow because the token this repo
// was created with has no `workflow` scope, so a workflow file cannot be
// pushed. When that changes, this is replaceable by an Action that runs the
// tests and publishes — the deploy script already runs the tests first either
// way, so nothing reaches the van that has not gone green.
import { execFileSync } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';

const WORKTREE = '.gh-pages';
const BRANCH = 'gh-pages';
const git = (...args) => execFileSync('git', args, { stdio: 'inherit' });
const quiet = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

if (!existsSync('dist/index.html')) {
  console.error('dist/ is not built — run node build.mjs first');
  process.exit(1);
}

rmSync(WORKTREE, { recursive: true, force: true });
try { git('worktree', 'prune'); } catch {}

const remoteHas = quiet('ls-remote', '--heads', 'origin', BRANCH);
if (remoteHas) {
  git('fetch', 'origin', BRANCH);
  git('worktree', 'add', WORKTREE, BRANCH);
} else {
  git('worktree', 'add', '--detach', WORKTREE);
  execFileSync('git', ['checkout', '--orphan', BRANCH], { cwd: WORKTREE, stdio: 'inherit' });
}

execFileSync('git', ['rm', '-rf', '--quiet', '.'], { cwd: WORKTREE, stdio: 'inherit' });
execFileSync('cp', ['-R', 'dist/.', WORKTREE], { stdio: 'inherit' });
// Jekyll would otherwise swallow anything beginning with an underscore.
execFileSync('touch', [`${WORKTREE}/.nojekyll`], { stdio: 'inherit' });

const sha = quiet('rev-parse', '--short', 'HEAD');
execFileSync('git', ['add', '-A'], { cwd: WORKTREE, stdio: 'inherit' });
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: WORKTREE, encoding: 'utf8' }).trim();
if (!dirty) {
  console.log('nothing changed since the last deploy');
} else {
  execFileSync('git', ['commit', '-m', `deploy ${sha}`], { cwd: WORKTREE, stdio: 'inherit' });
  execFileSync('git', ['push', 'origin', BRANCH], { cwd: WORKTREE, stdio: 'inherit' });
  console.log(`deployed ${sha}`);
}

rmSync(WORKTREE, { recursive: true, force: true });
git('worktree', 'prune');
