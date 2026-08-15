/* eslint-disable no-sync */

import * as cp from 'child_process'
import { join, resolve } from 'path'
import { mkdirp, remove, copy, writeFile, chmod, pathExists } from 'fs-extra'

import { getVersion } from '../app/package-info'
import {
  getArchitectureForFileName,
  getDistPath,
  getDistRoot,
} from './dist-info'

const projectRoot = resolve(__dirname, '..')

// Named "gh-desktop-claw" rather than "desktop-claw" to avoid the freedesktop
// dash-stripping fallback ('desktop' exists in many icon themes, so that icon
// would be picked instead of ours). Must match the installer's ICON_NAME.
const LINUX_ICON_NAME = 'gh-desktop-claw'

// Kept in sync with the sizes shipped in app/static/linux/logos.
const ICON_SIZES = [
  '32x32',
  '64x64',
  '128x128',
  '256x256',
  '512x512',
  '1024x1024',
]

/**
 * Builds the distro-agnostic tarball: the packaged Electron payload plus the
 * icons, and the very same installer that the website serves, so that an
 * extracted release can install itself without reaching for the network.
 */
export async function packageTarball(): Promise<string> {
  const version = getVersion()
  const arch = getArchitectureForFileName()
  const distRoot = getDistRoot()

  const rootName = `desktop-claw-v${version}-linux-${arch}`
  const stagingRoot = join(distRoot, 'tarball-staging')
  const stagingDir = join(stagingRoot, rootName)

  await remove(stagingRoot)
  await mkdirp(stagingDir)

  // `cp -a` rather than a Node copy so that the setuid bit on chrome-sandbox,
  // the executable bits and the symlinks inside the payload all survive.
  await mkdirp(join(stagingDir, 'app'))
  run('cp', ['-a', `${getDistPath()}/.`, join(stagingDir, 'app')])

  for (const size of ICON_SIZES) {
    const source = join(
      projectRoot,
      'app',
      'static',
      'linux',
      'logos',
      `${size}.png`
    )
    if (!(await pathExists(source))) {
      continue
    }
    const target = join(stagingDir, 'share', 'icons', 'hicolor', size, 'apps')
    await mkdirp(target)
    await copy(source, join(target, `${LINUX_ICON_NAME}.png`))
  }

  const installer = join(stagingDir, 'install.sh')
  await copy(join(projectRoot, 'docs', 'install.sh'), installer)
  await chmod(installer, 0o755)

  await writeFile(join(stagingDir, 'VERSION'), `${version}\n`)

  const tarballName = `DesktopClaw-v${version}-linux-${arch}.tar.gz`
  const tarballPath = join(distRoot, tarballName)
  await remove(tarballPath)

  run('tar', ['-czf', tarballPath, '-C', stagingRoot, rootName])

  await remove(stagingRoot)

  return tarballPath
}

function run(command: string, args: ReadonlyArray<string>) {
  const { error, status, stderr } = cp.spawnSync(command, [...args], {
    stdio: ['inherit', 'inherit', 'pipe'],
    encoding: 'utf8',
  })

  if (error) {
    throw error
  }

  if (status !== 0) {
    throw new Error(`${command} exited with ${status}: ${stderr}`)
  }
}
