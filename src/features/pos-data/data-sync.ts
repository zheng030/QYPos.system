type SyncSnapshot = {
  val(): unknown
}

type SyncDb = {
  ref(path: string): {
    once(eventName: 'value'): Promise<SyncSnapshot>
    on(eventName: 'value', listener: (snapshot: SyncSnapshot) => void): unknown
    update(payload: Record<string, unknown>): Promise<void>
  }
}

type CreateDataSyncDeps = {
  attendanceRoots: string[]
  cloneValue: (value: unknown) => unknown
  db: SyncDb
  getRootValue: (root: string) => unknown
  incomingOrdersRoot: string
  localDataPrefix: string
  localRevisionKey: string
  pushSyncRecord: (record: Record<string, unknown>) => void
  refreshUiAfterDataChange: () => Promise<void>
  rootKeys: string[]
  serializeRoot: (root: string) => unknown
  shouldRefreshUiForRoot: (root: string) => boolean
  shouldProcessIncomingOrders: () => boolean
  applyRootValue: (root: string, value: unknown) => void
  onIncomingOrdersChanged: () => void
}

export function createDataSync({
  cloneValue,
  db,
  getRootValue,
  incomingOrdersRoot,
  localDataPrefix,
  localRevisionKey,
  pushSyncRecord,
  refreshUiAfterDataChange,
  rootKeys,
  serializeRoot,
  shouldRefreshUiForRoot,
  shouldProcessIncomingOrders,
  applyRootValue,
  onIncomingOrdersChanged,
}: Omit<CreateDataSyncDeps, 'attendanceRoots'>) {
  return {
    db,
    localRevisions: {} as Record<string, number>,
    remoteRevisions: {} as Record<string, number>,
    subscribedRoots: new Set<string>(),
    initLocal(roots?: string[]) {
      this.loadLocalRevisions(roots)
      this.loadLocalData(roots)
    },
    setRemoteRevisions(revisions?: Record<string, number> | null) {
      this.remoteRevisions = revisions || {}
    },
    async refreshRevisions() {
      const snapshot = await db
        .ref('revisions')
        .once('value')
        .catch(() => null)
      const revisions = snapshot ? snapshot.val() : {}
      this.setRemoteRevisions((revisions || {}) as Record<string, number>)
    },
    loadLocalRevisions(roots?: string[]) {
      try {
        const raw = localStorage.getItem(localRevisionKey)
        this.localRevisions = raw ? JSON.parse(raw) : {}
      } catch {
        this.localRevisions = {}
      }

      ;(roots || rootKeys).forEach((key) => {
        if (typeof this.localRevisions[key] !== 'number') {
          this.localRevisions[key] = 0
        }
      })
    },
    saveLocalRevisions() {
      localStorage.setItem(localRevisionKey, JSON.stringify(this.localRevisions))
    },
    saveLocalDataForRoots(roots: string[]) {
      roots.forEach((root) => {
        localStorage.setItem(`${localDataPrefix}${root}`, JSON.stringify(serializeRoot(root)))
      })
    },
    loadLocalData(roots?: string[]) {
      ;(roots || rootKeys).forEach((root) => {
        const raw = localStorage.getItem(`${localDataPrefix}${root}`)
        if (!raw) return

        try {
          applyRootValue(root, JSON.parse(raw))
        } catch {
          // Ignore invalid local cache
        }
      })
    },
    getRootKey(path: string) {
      if (!path || typeof path !== 'string') return ''
      return path.split('/')[0]
    },
    hasLocalCache(root: string) {
      return localStorage.getItem(`${localDataPrefix}${root}`) !== null
    },
    shouldApplyRemote(root: string) {
      const remoteRevision = this.remoteRevisions[root]
      const localRevision = this.localRevisions[root] || 0
      if (typeof remoteRevision === 'number') return remoteRevision > localRevision
      return !this.hasLocalCache(root)
    },
    async applyRemoteValue(root: string, value: unknown) {
      const beforeValue = cloneValue(getRootValue(root))
      const beforeRevision = typeof this.localRevisions[root] === 'number' ? this.localRevisions[root] : null

      applyRootValue(root, value)

      if (typeof this.remoteRevisions[root] === 'number') {
        this.localRevisions[root] = this.remoteRevisions[root]
        this.saveLocalRevisions()
      }
      this.saveLocalDataForRoots([root])

      if (root === incomingOrdersRoot && shouldProcessIncomingOrders()) {
        onIncomingOrdersChanged()
      }

      if (shouldRefreshUiForRoot(root)) {
        await refreshUiAfterDataChange()
      }

      const afterValue = cloneValue(getRootValue(root))
      const afterRevision = typeof this.localRevisions[root] === 'number' ? this.localRevisions[root] : null

      pushSyncRecord({
        ts: Date.now(),
        type: 'applyRemoteValue',
        root,
        beforeValue,
        afterValue,
        beforeRev: beforeRevision,
        afterRev: afterRevision,
      })
    },
    bumpRevisionsForPayload(payload: Record<string, unknown>, roots: string[]) {
      roots.forEach((root) => {
        this.localRevisions[root] = (this.localRevisions[root] || 0) + 1
        payload[`revisions/${root}`] = this.localRevisions[root]
      })

      if (roots.length > 0) {
        this.saveLocalRevisions()
        this.saveLocalDataForRoots(roots)
      }
    },
    async ensureRoots(roots?: string[]) {
      await this.refreshRevisions()

      for (const root of roots || []) {
        if (this.subscribedRoots.has(root)) continue
        this.subscribedRoots.add(root)

        if (this.shouldApplyRemote(root)) {
          await db
            .ref(root)
            .once('value')
            .then((snapshot) => this.applyRemoteValue(root, snapshot.val()))
            .catch(() => {})
        }
      }
    },
    async subscribeRoots(roots?: string[]) {
      await this.ensureRoots(roots)
    },
  }
}
