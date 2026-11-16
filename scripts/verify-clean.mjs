// Checks the last commit before it is pushed, in two fresh checkouts of it:
//
// 1. As GitHub's deploy does: no ROMs beside it (so the tests that need one
//    skip, as they do there), then lint, every unit test, the browser tests and
//    the build. A test that reads a ROM while its file is collected, rather
//    than when it runs, fails here as it does on GitHub.
// 2. With this computer's ROMs: the unit and browser tests again, now with the
//    ROMs in the folder above this one and the ROMs tests/local.json names, so
//    that the tests GitHub has to skip run too. Skipped where there are none,
//    or with `npm run verify -- --no-roms`.
//
// Run with `npm run verify` after committing, before pushing. Each checkout
// borrows this folder's node_modules (a link, not a copy) and is removed
// afterwards. The first goes in the system's temporary folder; the second in
// the ROM folder, since the tests look for the ROMs beside the project. Tests
// run on one worker, as elsewhere in this project, to keep the machine (and
// its fan) quiet.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, rmdirSync, rmSync, symlinkSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const here = resolve(import.meta.dirname, '..')
const romFolder = dirname(here)
const windows = process.platform === 'win32'
const withRoms = !process.argv.includes('--no-roms') && existsSync(join(romFolder, 'nhl94.bin'))

const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: 'inherit', shell: windows })

const lint = ['lint', ['npm', ['run', 'lint']]]
const unit = ['unit tests', ['npx', ['vitest', 'run', '--maxWorkers=1']]]
const browser = ['browser tests', ['npx', ['playwright', 'test', '--workers=1']]]
const build = ['build', ['npm', ['run', 'build']]]

// Runs `steps` in a fresh checkout of HEAD at `checkout`, inside the folder `where`, which is removed after.
// Returns the name of the step that failed, or null.
function inCheckout(where, checkout, label, steps, prepare = () => {}) {
  let failed = null
  try {
    run('git', ['worktree', 'add', '--detach', checkout, 'HEAD'], here)
    if (!existsSync(join(here, 'node_modules'))) throw new Error('Run npm ci here first.')
    symlinkSync(join(here, 'node_modules'), join(checkout, 'node_modules'), windows ? 'junction' : 'dir')
    prepare(checkout)
    for (const [name, [command, args]] of steps) {
      console.log(`\n=== ${name} (${label}) ===`)
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
  return failed
}

const clean = mkdtempSync(join(tmpdir(), 'nose4web-verify-'))
const cleanFailed = inCheckout(clean, join(clean, 'nose-web'), 'clean checkout, no ROMs', [lint, unit, browser, build])
if (cleanFailed) {
  console.error(`\nThe ${cleanFailed} failed in a clean checkout: GitHub's deploy would fail too.`)
  process.exit(1)
}
console.log('\nThe last commit passes in a clean checkout, as GitHub will check it.')

if (!withRoms) {
  console.log(
    process.argv.includes('--no-roms')
      ? 'The tests with this computer\'s ROMs were left out (--no-roms).'
      : `No nhl94.bin in ${romFolder}, so the tests that need ROMs were not run.`,
  )
  process.exit(0)
}

// Its parent is the ROM folder, where the tests look for the ROMs; the dot keeps it apart from them.
const beside = mkdtempSync(join(romFolder, '.nose4web-verify-'))
const romsFailed = inCheckout(beside, beside, "with this computer's ROMs", [unit, browser], (checkout) => {
  const local = join(here, 'tests', 'local.json')
  if (existsSync(local)) copyFileSync(local, join(checkout, 'tests', 'local.json'))
})
if (romsFailed) {
  console.error(`\nThe ${romsFailed} failed with this computer's ROMs. GitHub cannot see this, but the editor is wrong for those ROMs.`)
  process.exit(1)
}
console.log("\nThe last commit also passes with this computer's ROMs.")
