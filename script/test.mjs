import { spawn } from 'child_process'
import { join, resolve } from 'path'
import { readdir, readFile, stat } from 'fs/promises'
import { parseEnv } from 'util'

function reporter(r) {
  return ['--test-reporter', r, '--test-reporter-destination', 'stdout']
}

async function findTestFilesIn(paths) {
  const files = []
  for (const path of paths) {
    const entry = await stat(path)
    if (entry.isFile()) {
      files.push(path)
      continue
    }

    for (const file of await readdir(path, { recursive: true }).then(x =>
      x
        .filter(f => /-test\.(ts|tsx|js|jsx|mts|mjs)$/.test(f))
        .map(f => join(path, f))
    )) {
      files.push(file)
    }
  }
  return files
}

const fileArgs = process.argv.slice(2).filter(a => !a.startsWith('--'))
const switchArgs = process.argv.slice(2).filter(a => a.startsWith('--'))

const projectRoot = join(import.meta.dirname, '..')
const files =
  fileArgs.length > 0
    ? await findTestFilesIn(fileArgs)
    : await findTestFilesIn([join(projectRoot, 'app', 'test', 'unit')])

// I would _looooove_ to use the `--env-file` option, but it doesn't override
// existing environment variables and we need to override some of them.
const testEnv = parseEnv(await readFile(join(projectRoot, '.test.env'), 'utf8'))
Object.entries(testEnv).forEach(([k, v]) => (process.env[k] = v))

const args = [
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
  // runners that peaks high enough to OOM (observed as a V8 "Committing semi
  // space failed" crash); capping it trades a bit of wall time for headroom.
  // Left uncapped locally so dev runs stay fast.
  ...(process.env.GITHUB_ACTIONS ? ['--test-concurrency=2'] : []),
  ...reporter('spec'),
  ...(process.env.GITHUB_ACTIONS ? reporter('node-test-github-reporter') : []),
  ...files,
]

spawn('node', args, {
  stdio: 'inherit',
  cwd: resolve(import.meta.dirname, '..'),
}).on('exit', process.exit)
