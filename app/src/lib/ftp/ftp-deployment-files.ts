import * as fs from 'fs'
import * as Path from 'path'

import { IFtpDeployment, isFtpDeployment } from '../../models/ftp-deployment'

/** The name of the per-repository configuration directory. */
const ConfigDirectoryName = '.desktop-claw'

/** The name of the directory holding FTP deployment config files. */
const FtpDeploymentsDirectoryName = 'ftp-deployments'

/**
 * The fields persisted to disk for each deployment.
 *
 * Configs are stored as JSON files (one per deployment, named by deployment
 * ID) inside `<repo>/.desktop-claw/ftp-deployments/` so they can be shared
 * and versioned with the repository. Passwords are deliberately excluded
 * from these files and remain in the OS keychain, keyed by repository ID
 * and deployment ID (see ftp-secrets.ts).
 */
const PersistedFields = [
  'id',
  'name',
  'protocol',
  'host',
  'port',
  'username',
  'remotePath',
  'ignorePatterns',
  'active',
] as const

/**
 * Returns the absolute path of the directory holding the given repository's
 * FTP deployment config files (`<repo>/.desktop-claw/ftp-deployments/`).
 */
export function getFtpDeploymentsDirectory(repositoryPath: string): string {
  return Path.join(
    repositoryPath,
    ConfigDirectoryName,
    FtpDeploymentsDirectoryName
  )
}

/**
 * Validates a parsed JSON value and returns a deployment containing only the
 * known persisted fields, stripping any unknown properties (such as a
 * password someone manually added to a config file).
 */
function sanitizeDeployment(value: unknown): IFtpDeployment | null {
  if (!isFtpDeployment(value)) {
    return null
  }

  const deployment = value as IFtpDeployment

  return {
    id: deployment.id,
    name: deployment.name,
    protocol: deployment.protocol,
    host: deployment.host,
    port: deployment.port,
    username: deployment.username,
    remotePath: deployment.remotePath,
    ignorePatterns: deployment.ignorePatterns,
    active: deployment.active,
  }
}

/**
 * Serializes a deployment to the JSON written to disk, containing only the
 * fields in {@link PersistedFields} (never credentials).
 */
function serializeDeployment(deployment: IFtpDeployment): string {
  const serialized: Record<string, unknown> = {}

  for (const field of PersistedFields) {
    serialized[field] = deployment[field]
  }

  return `${JSON.stringify(serialized, null, 2)}\n`
}

/**
 * Reads the FTP deployment configs stored as files inside the given
 * repository's `.desktop-claw/ftp-deployments/` directory.
 *
 * Returns an array with the deployments found, or `null` when the directory
 * does not exist — in which case callers should fall back to any previously
 * stored value.
 *
 * Files that can't be parsed or that don't describe a valid deployment are
 * skipped.
 */
export function readFtpDeploymentsFromFiles(
  repositoryPath: string
): ReadonlyArray<IFtpDeployment> | null {
  const dir = getFtpDeploymentsDirectory(repositoryPath)

  let entries: ReadonlyArray<string>
  try {
    // Sync read: this runs inside a Dexie transaction where awaiting a
    // non-Dexie promise would commit the transaction prematurely.
    // eslint-disable-next-line no-sync
    entries = fs.readdirSync(dir)
  } catch {
    return null
  }

  const deployments = new Array<IFtpDeployment>()

  for (const entry of entries) {
    if (!entry.endsWith('.json')) {
      continue
    }

    let parsed: unknown
    try {
      // See the note on the readdirSync call above.
      // eslint-disable-next-line no-sync
      parsed = JSON.parse(fs.readFileSync(Path.join(dir, entry), 'utf8'))
    } catch {
      continue
    }

    const deployment = sanitizeDeployment(parsed)
    if (deployment !== null) {
      deployments.push(deployment)
    }
  }

  return deployments
}

/**
 * Persists the given FTP deployment configs as JSON files (one per
 * deployment, named by deployment ID) inside the repository's
 * `.desktop-claw/ftp-deployments/` directory.
 *
 * Passwords are never written — only the fields in {@link PersistedFields}
 * are serialized; credentials continue to live in the OS keychain.
 *
 * When `ifNotExists` is true the write is skipped entirely when the
 * directory already exists, so a stale caller can never clobber configs
 * written by a newer process.
 */
export async function writeFtpDeploymentsToFiles(
  repositoryPath: string,
  deployments: ReadonlyArray<IFtpDeployment>,
  ifNotExists = false
): Promise<void> {
  const dir = getFtpDeploymentsDirectory(repositoryPath)

  // Sync check: avoids an async gap inside the Dexie transaction context
  // this is called from.
  // eslint-disable-next-line no-sync
  if (ifNotExists && fs.existsSync(dir)) {
    return
  }

  await fs.promises.mkdir(dir, { recursive: true })

  const deploymentIds = new Set(deployments.map(d => d.id))

  // Write the new configs first so a failed write never loses the previous
  // set of files.
  await Promise.all(
    deployments.map(d =>
      fs.promises.writeFile(
        Path.join(dir, `${d.id}.json`),
        serializeDeployment(d),
        'utf8'
      )
    )
  )

  // Remove stale config files (valid deployments that are no longer part of
  // the configuration). Files that don't describe a valid deployment are
  // left untouched.
  let entries: ReadonlyArray<string>
  try {
    entries = await fs.promises.readdir(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.endsWith('.json')) {
      continue
    }

    const filePath = Path.join(dir, entry)

    let parsed: unknown
    try {
      parsed = JSON.parse(await fs.promises.readFile(filePath, 'utf8'))
    } catch {
      continue
    }

    const existing = sanitizeDeployment(parsed)
    if (existing !== null && !deploymentIds.has(existing.id)) {
      await fs.promises.rm(filePath, { force: true })
    }
  }
}
