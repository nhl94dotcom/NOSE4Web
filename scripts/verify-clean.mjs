// Checks the last commit as GitHub's deploy does: a fresh checkout with no
// ROMs beside it (so the tests that need one skip, as they do there), then
// lint, every unit test, the browser tests and the build. A test that reads a
// ROM while its file is collected, rather than when it runs, fails here as it
// does on GitHub. Run with `npm run verify` after committing, before pushing.
//
// The checkout goes in the system's temporary folder and borrows this
// folder's node_modules (a link, not a copy). Tests run on two workers, as
// elsewhere in this project, to keep the machine quiet.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmdirSync, rmSync, symlinkSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const here = resolve(import.meta.dirname, '..')
const where = mkdtempSync(join(tmpdir(), 'nose4web-verify-'))
const checkout = join(where, 'nose-web')
const windows = process.platform === 'win32'

const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'inherit', shell: windows })

const steps = [
  ['lint', ['npm', ['run', 'lint']]],
  ['unit tests', ['npx', ['vitest', 'run', '--maxWorkers=2']]],
  ['browser tests', ['npx', ['playwright', 'test', '--workers=2']]],
  ['build', ['npm', ['run', 'build']]],
]

let failed = null
try {
  run('git', ['worktree', 'add', '--detach', checkout, 'HEAD'], here)
  if (!existsSync(join(here, 'node_modules'))) throw new Error('Run npm ci here first.')
  symlinkSync(join(here, 'node_modules'), join(checkout, 'node_modules'), windows ? 'junction' : 'dir')
  for (const [name, [command, args]] of steps) {
    console.log(`\n=== ${name} (clean checkout, no ROMs) ===`)
    try {
      run(command, args, checkout)
    } catch {
      failed = name
      break
    }
  }
} finally {
  // The link first, so that removing the checkout never reaches this folder's node_modules.
  const link = join(checkout, 'node_modules')
  if (existsSync(link)) {
    try {
      unlinkSync(link)
    } catch {
      rmdirSync(link) // a Windows junction: removes the link only
    }
  }
  try {
    run('git', ['worktree', 'remove', '--force', checkout], here)
  } catch {
    // Already gone, or never made.
  }
  rmSync(where, { force: true, recursive: true })
}

if (failed) {
  console.error(`\nThe ${failed} failed in a clean checkout: GitHub's deploy would fail too.`)
  process.exit(1)
}
console.log('\nThe last commit passes in a clean checkout, as GitHub will check it.')
