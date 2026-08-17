import { TokenStore } from '../stores/token-store'

const FtpTokenStoreKey = `${
  __DEV__ ? 'Desktop Claw Dev' : 'Desktop Claw'
} - FTP Deployments`

/**
 * Returns the FTP password stored in the OS keychain for the given repository
 * and deployment, or null if none has been stored.
 *
 * @param repositoryId  The numeric repository ID.
 * @param deploymentId   The UUID of the FTP deployment.
 */
export function getFtpSecret(
  repositoryId: number,
  deploymentId: string
): Promise<string | null> {
  return TokenStore.getItem(FtpTokenStoreKey, `${repositoryId}:${deploymentId}`)
}

/**
 * Stores the given FTP password in the OS keychain. The password is never
 * logged, stored in localStorage, or persisted in the database.
 *
 * @param repositoryId  The numeric repository ID.
 * @param deploymentId   The UUID of the FTP deployment.
 * @param password       The FTP password to store.
 */
export function setFtpSecret(
  repositoryId: number,
  deploymentId: string,
  password: string
): Promise<void> {
  return TokenStore.setItem(
    FtpTokenStoreKey,
    `${repositoryId}:${deploymentId}`,
    password
  )
}

/**
 * Removes the FTP password from the OS keychain for the given repository and
 * deployment.
 *
 * @param repositoryId  The numeric repository ID.
 * @param deploymentId   The UUID of the FTP deployment.
 * @returns true if a password was found and removed, false otherwise.
 */
export function deleteFtpSecret(
  repositoryId: number,
  deploymentId: string
): Promise<boolean> {
  return TokenStore.deleteItem(
    FtpTokenStoreKey,
    `${repositoryId}:${deploymentId}`
  )
}
