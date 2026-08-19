import { ThreadStore } from './thread-store'
import { Repository } from '../../models/repository'
import { GitStore } from './git-store'

export class ThreadStoreCache {
  /** ThreadStores keyed by repository hash. */
  private readonly threadStores = new Map<string, ThreadStore>()

  public constructor() {}

  public remove(repository: Repository) {
    const store = this.threadStores.get(repository.hash)
    if (store) {
      store.dispose()
      this.threadStores.delete(repository.hash)
    }
  }

  public get(repository: Repository, gitStore: GitStore): ThreadStore {
    let threadStore = this.threadStores.get(repository.hash)
    if (threadStore === undefined) {
      threadStore = new ThreadStore(repository)
      this.threadStores.set(repository.hash, threadStore)
    }

    return threadStore
  }
}
