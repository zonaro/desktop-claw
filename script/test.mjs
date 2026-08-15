import { spawn } from 'child_process'
import { join, resolve } from 'path'
import { readdir, readFile, stat } from 'fs/promises'
import { parseEnv } from 'util'

function reporter(r) {
  return ['--test-reporter', r, '--test-reporter-destination', 'stdout']
}

const isTestFile = f => /-test\.(ts|tsx|js|jsx|mts|mjs)$/.test(f)

async function findTestFilesIn(paths) {
  const files = []
  for (const path of paths) {
    const entry = await stat(path)
    if (entry.isFile()) {
      files.push(path)
      continue
    }

    for (const file of await readdir(path, { recursive: true }).then(x =>
      x.filter(isTestFile).map(f => join(path, f))
    )) {
      files.push(file)
    }
  }
  return files
}

// Groups the default (no explicit path argument) run into one batch per
// top-level entry under `root`, instead of one flat list of every test file
// in the tree. Each batch becomes its own `node --test` process later, so a
// long CI run is a sequence of short-lived orchestrators rather than one
// process whose own bookkeeping (buffered results, reporter formatting) grows
// for the full ~600s of a 200+ file run — that accumulation, not any single
// test file, is what was still driving CI out of memory serially by the time
// the run reached the ui/ suites (see script/test.mjs history / commit
// message for the full incident writeup).
async function findTestFileBatchesIn(root) {
  const entries = await readdir(root, { withFileTypes: true })
  const looseFiles = entries
    .filter(e => e.isFile() && isTestFile(e.name))
    .map(e => join(root, e.name))
  const subdirs = entries.filter(e => e.isDirectory()).map(e => e.name)

  const batches = []
  if (looseFiles.length > 0) {
    batches.push(looseFiles)
  }
  for (const dir of subdirs) {
    const files = await findTestFilesIn([join(root, dir)])
    if (files.length > 0) {
      batches.push(files)
    }
  }
  return batches
}

const fileArgs = process.argv.slice(2).filter(a => !a.startsWith('--'))
const switchArgs = process.argv.slice(2).filter(a => a.startsWith('--'))

const projectRoot = join(import.meta.dirname, '..')

// I would _looooove_ to use the `--env-file` option, but it doesn't override
// existing environment variables and we need to override some of them.
const testEnv = parseEnv(await readFile(join(projectRoot, '.test.env'), 'utf8'))
Object.entries(testEnv).forEach(([k, v]) => (process.env[k] = v))

const baseArgs = [
  '--disable-warning=ExperimentalWarning',
  '--experimental-test-module-mocks',
  // Allow CJS resolution to find ESM-only packages (e.g. @github/copilot-sdk)
  // whose "exports" only declare an "import" condition with no "require" fallback.
  '--conditions=import',
  ...['--import', 'tsx'],
  ...['--import', './app/test/globals.mts'],
  ...switchArgs,
  '--test',
  // Node's default test-file concurrency (CPU cores - 1) runs every heavy
  // React/jsdom suite in its own process at once. On memory-constrained CI
  // runners that peaked high enough to OOM (a V8 "Committing semi space
  // failed" crash). Capping it trades a bit of wall time for headroom. Left
  // uncapped locally so dev runs stay fast.
  ...(process.env.GITHUB_ACTIONS ? ['--test-concurrency=2'] : []),
  // Without this a hung test reports only as an opaque file-level "test
  // failed" once the whole file's process is torn down. A per-test bound
  // turns that into a normal, attributable timeout failure naming the actual
  // test, and caps how long any single stuck test can occupy its process.
  '--test-timeout=30000',
  ...reporter('spec'),
  ...(process.env.GITHUB_ACTIONS ? reporter('node-test-github-reporter') : []),
]

function runBatch(files) {
  return new Promise(resolvePromise => {
    spawn('node', [...baseArgs, ...files], {
      stdio: 'inherit',
      cwd: resolve(import.meta.dirname, '..'),
    }).on('exit', code => resolvePromise(code ?? 1))
  })
}

if (fileArgs.length > 0) {
  process.exit(await runBatch(await findTestFilesIn(fileArgs)))
}

const defaultRoot = join(projectRoot, 'app', 'test', 'unit')

if (!process.env.GITHUB_ACTIONS) {
  // Local dev: one invocation, exactly as before — batching only exists to
  // bound a single long-lived CI process's own memory growth.
  process.exit(await runBatch(await findTestFilesIn([defaultRoot])))
}

const batches = await findTestFileBatchesIn(defaultRoot)
let exitCode = 0
for (const files of batches) {
  const code = await runBatch(files)
  exitCode = exitCode || code
}
process.exit(exitCode)
