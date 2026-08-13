import assert from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import * as Fs from 'fs/promises'
import * as Os from 'os'
import * as Path from 'path'

import { IFtpDeployment } from '../../src/models/ftp-deployment'
import {
  getFtpDeploymentsDirectory,
  readFtpDeploymentsFromFiles,
  writeFtpDeploymentsToFiles,
} from '../../src/lib/ftp/ftp-deployment-files'

/** Creates a temporary repository directory. The caller must clean it up. */
async function makeTempRepoDir(): Promise<string> {
  return await Fs.mkdtemp(Path.join(Os.tmpdir(), 'ftp-deployment-files-test-'))
}

function makeDeployment(
  overrides: Partial<IFtpDeployment> = {}
): IFtpDeployment {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Production',
    protocol: 'ftp',
    host: 'ftp.example.com',
    port: 21,
    username: 'deploy-user',
    remotePath: '/public_html',
    ignorePatterns: ['node_modules', '.env'],
    active: true,
    ...overrides,
  }
}

describe('ftp-deployment-files', () => {
  let repoPath: string

  afterEach(async () => {
    if (repoPath !== undefined) {
      await Fs.rm(repoPath, { recursive: true, force: true })
    }
  })

  it('returns null when the config directory does not exist', async () => {
    repoPath = await makeTempRepoDir()

    assert.strictEqual(readFtpDeploymentsFromFiles(repoPath), null)
  })

  it('round-trips deployments to and from files', async () => {
    repoPath = await makeTempRepoDir()
    const first = makeDeployment()
    const second = makeDeployment({
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Staging',
      host: 'staging.example.com',
      port: 990,
      protocol: 'ftps',
      active: false,
    })

    await writeFtpDeploymentsToFiles(repoPath, [first, second])

    assert.deepStrictEqual(readFtpDeploymentsFromFiles(repoPath), [
      first,
      second,
    ])
  })

  it('writes one JSON file per deployment named by deployment ID', async () => {
    repoPath = await makeTempRepoDir()
    const first = makeDeployment()

    await writeFtpDeploymentsToFiles(repoPath, [first])

    const entries = await Fs.readdir(getFtpDeploymentsDirectory(repoPath))
    assert.deepStrictEqual(entries, [`${first.id}.json`])
  })

  it('never writes credential material to disk', async () => {
    repoPath = await makeTempRepoDir()
    const deployment = makeDeployment()

    await writeFtpDeploymentsToFiles(repoPath, [deployment])

    const content = await Fs.readFile(
      Path.join(getFtpDeploymentsDirectory(repoPath), `${deployment.id}.json`),
      'utf8'
    )

    assert.ok(!content.includes('password'))
    assert.ok(!content.includes('pass'))
    const keys = Object.keys(JSON.parse(content))
    assert.deepStrictEqual(keys, [
      'id',
      'name',
      'protocol',
      'host',
      'port',
      'username',
      'remotePath',
      'ignorePatterns',
      'active',
    ])
  })

  it('strips unknown fields (e.g. manually added passwords) when reading', async () => {
    repoPath = await makeTempRepoDir()
    const dir = getFtpDeploymentsDirectory(repoPath)
    await Fs.mkdir(dir, { recursive: true })

    const deployment = makeDeployment()
    await Fs.writeFile(
      Path.join(dir, `${deployment.id}.json`),
      JSON.stringify({ ...deployment, password: 'hunter2' }),
      'utf8'
    )

    const deployments = readFtpDeploymentsFromFiles(repoPath)
    assert.notStrictEqual(deployments, null)
    assert.strictEqual(deployments!.length, 1)
    assert.ok(!('password' in deployments![0]))
    assert.deepStrictEqual(deployments![0], deployment)
  })

  it('skips invalid files when reading', async () => {
    repoPath = await makeTempRepoDir()
    const dir = getFtpDeploymentsDirectory(repoPath)
    await Fs.mkdir(dir, { recursive: true })

    const deployment = makeDeployment()
    await Fs.writeFile(
      Path.join(dir, `${deployment.id}.json`),
      JSON.stringify(deployment)
    )
    await Fs.writeFile(Path.join(dir, 'broken.json'), '{ not json')
    await Fs.writeFile(
      Path.join(dir, 'invalid.json'),
      JSON.stringify({ id: 'nope', name: 42 })
    )
    await Fs.writeFile(Path.join(dir, 'readme.txt'), 'not a config')

    assert.deepStrictEqual(readFtpDeploymentsFromFiles(repoPath), [deployment])
  })

  it('removes stale deployment files and leaves foreign files untouched', async () => {
    repoPath = await makeTempRepoDir()
    const dir = getFtpDeploymentsDirectory(repoPath)

    const first = makeDeployment()
    const second = makeDeployment({
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Staging',
    })

    await writeFtpDeploymentsToFiles(repoPath, [first, second])
    await Fs.writeFile(Path.join(dir, 'notes.json'), '{"note": "keep me"}')

    await writeFtpDeploymentsToFiles(repoPath, [first])

    const entries = (await Fs.readdir(dir)).sort()
    assert.deepStrictEqual(entries, [`${first.id}.json`, 'notes.json'])
    assert.deepStrictEqual(readFtpDeploymentsFromFiles(repoPath), [first])
  })

  it('replaces an existing file for the same deployment ID', async () => {
    repoPath = await makeTempRepoDir()

    await writeFtpDeploymentsToFiles(repoPath, [
      makeDeployment({ name: 'Old name' }),
    ])
    await writeFtpDeploymentsToFiles(repoPath, [
      makeDeployment({ name: 'New name' }),
    ])

    const deployments = readFtpDeploymentsFromFiles(repoPath)
    assert.notStrictEqual(deployments, null)
    assert.strictEqual(deployments!.length, 1)
    assert.strictEqual(deployments![0].name, 'New name')
  })

  it('writes an empty deployment set by removing all files', async () => {
    repoPath = await makeTempRepoDir()

    await writeFtpDeploymentsToFiles(repoPath, [makeDeployment()])
    await writeFtpDeploymentsToFiles(repoPath, [])

    assert.deepStrictEqual(readFtpDeploymentsFromFiles(repoPath), [])
  })

  it('skips the write when ifNotExists is set and the directory exists', async () => {
    repoPath = await makeTempRepoDir()

    const original = makeDeployment({ name: 'Original' })
    await writeFtpDeploymentsToFiles(repoPath, [original])

    await writeFtpDeploymentsToFiles(
      repoPath,
      [makeDeployment({ name: 'Newer' })],
      true
    )

    assert.deepStrictEqual(readFtpDeploymentsFromFiles(repoPath), [original])
  })
})
