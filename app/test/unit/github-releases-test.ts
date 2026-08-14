import { describe, it } from 'node:test'
import assert from 'node:assert'
import { isUpdateAvailable } from '../../src/lib/github-releases'

describe('github-releases', () => {
  describe('isUpdateAvailable', () => {
    it('returns true when the latest tag is newer than the current version', () => {
      assert.equal(isUpdateAvailable('26.225.1942', 'v26.226.1000'), true)
    })

    it('returns false when the latest tag matches the current version', () => {
      assert.equal(isUpdateAvailable('26.225.1942', 'v26.225.1942'), false)
    })

    it('returns false when the latest tag is older than the current version', () => {
      assert.equal(isUpdateAvailable('26.225.1942', 'v26.224.1000'), false)
    })

    it('handles tags without a leading v', () => {
      assert.equal(isUpdateAvailable('26.225.1942', '26.226.1000'), true)
    })

    it('handles pre-release style versions', () => {
      assert.equal(isUpdateAvailable('26.225.1942', 'v26.226.1000-beta1'), true)
    })

    it('returns false when the current version is not valid semver', () => {
      assert.equal(isUpdateAvailable('not-a-version', 'v26.226.1000'), false)
    })

    it('returns false when the latest tag is not valid semver', () => {
      assert.equal(isUpdateAvailable('26.225.1942', 'not-a-version'), false)
    })
  })
})
