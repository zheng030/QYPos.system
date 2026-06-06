import { getCanonicalDraftEntries as canonicalizeDraftEntriesBase } from '@/features/pos-kernel/item-helpers'
import type { PosCatalogHelpers } from '@/features/pos-kernel/service'
import type {
  CorePosState,
  PosOrderBatch,
  PosOrderEntry,
  PosPendingBatchPreview,
  PosTableCustomer,
} from '@/features/pos-kernel/types'
import type { AttendanceRecord } from '@/shared/attendance-service'
import type { DatabaseCompat } from '@/shared/firebase-compat'
import { sanitizeFirebaseUpdatePayload } from '@/shared/firebase-payload'
import { createBatchId, createOrderId } from '@/shared/rtdb-entity-id'
import {
  createPayloadHash,
  createPersistentCacheStore,
  isRegisteredResourceDescriptor,
  type PersistentCacheStore,
  type ResourceDescriptor,
} from './rtdb-v3-cache'
import { decodeRtdbKeySegment, encodeRtdbKeySegment } from './rtdb-v3-key-codec'
import {
  createEmptyLiveTable,
  getBizDateKey,
  mapStoredBatch,
  mapStoredEntry,
  resolveStoredBatchRequestSeq,
} from './rtdb-v3-mapper'
import { createLiveTableShardDescriptor } from './rtdb-v3-resource-registry'
import { decodeLiveTableShardValue, orderBatchStorageCodec, tableSummaryStorageCodec } from './rtdb-v3-storage-codecs'
import type {
  V3BizDateKey,
  V3CatalogSegment,
  V3ClosedOrder,
  V3DailyItemStat,
  V3DailySummary,
  V3LiveTable,
  V3MonthKey,
  V3OrderBatch,
  V3RevisionValue,
  V3TableSummary,
} from './rtdb-v3-types'
import { RTDB_V3_ROOT, RTDB_V3_SCHEMA_VERSION } from './rtdb-v3-types'

export type LiveMode = 'staff' | 'customer'

export type HistoryRange = {
  start: Date
  endExclusive: Date
}

type RepositoryDeps = {
  db: DatabaseCompat
  state: CorePosState
  tables?: string[]
  cacheStore?: PersistentCacheStore
  helpers?: Pick<PosCatalogHelpers, 'getCanonicalDraftEntries' | 'normalizeEntryForDisplay'>
  onLiveStateChange?: (roots: string[]) => void
}

type AttendanceMonthMap = Record<string, AttendanceRecord>
type ResourceLoadState<TDomain = unknown> = {
  revision: number
  promise: Promise<TDomain>
}
type ResourceLoaders = Map<string, ResourceLoadState<unknown>>
type ResourceFreshness = Map<string, number>
type ResourceSyncTargets = Map<string, number>
type CatalogSegmentLoads = Map<V3CatalogSegment, Promise<unknown>>

type ManagedResourceParams<TDomain, TStored = TDomain> = {
  descriptor: ResourceDescriptor<TDomain, TStored>
  readMemory: () => TDomain | undefined
  writeMemory: (value: TDomain) => void
  clearMemory?: () => void
  readRemote: () => Promise<TDomain>
}

type ManagedResourceSyncParams<TDomain, TStored = TDomain> = Omit<
  ManagedResourceParams<TDomain, TStored>,
  'readMemory'
> & {
  readMemory?: () => TDomain | undefined
  revision?: number
}

type ManagedResourceWatchParams<TDomain, TStored = TDomain> = ManagedResourceParams<TDomain, TStored> & {
  emitInitial?: boolean
  onChange: (value: TDomain, revision: number) => void
}

function toRevValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function toBatchId(prefix: 'pending' | 'submitted') {
  return createBatchId(prefix)
}

export function toOrderId() {
  return createOrderId()
}

export function readDisplaySeqBase(summary: V3TableSummary | null | undefined) {
  return Number(summary?.displaySeqBase || 0) || 0
}

export function cloneCustomer(customer: PosTableCustomer | undefined): PosTableCustomer {
  return {
    name: customer?.name || '',
    phone: customer?.phone || '',
    orderId: customer?.orderId,
  }
}

export function sortEntries(entries: PosOrderEntry[]) {
  return [...entries].sort(
    (left, right) => left.createdAt - right.createdAt || left.entryId.localeCompare(right.entryId)
  )
}

export function sumEntries(entries: PosOrderEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.subtotal, 0)
}

export function readSplitCounter(value: unknown) {
  const counter = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : 0
  return Number.isFinite(counter) && counter > 0 ? counter : 1
}

export function readRequestSeqCounter(value: unknown) {
  const counter = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : 0
  return Number.isFinite(counter) && counter > 0 ? counter : 1
}

export function normalizeLiveTable(value: V3LiveTable | null | undefined) {
  if (!value) {
    return createEmptyLiveTable()
  }
  return {
    summary: value.summary || null,
    draft: { ...(value.draft || {}) },
    pendingBatches: { ...(value.pendingBatches || {}) },
    submittedBatches: { ...(value.submittedBatches || {}) },
  } satisfies V3LiveTable
}

export function isLiveTableEmpty(value: V3LiveTable | null | undefined) {
  return Boolean(
    !value?.summary &&
      Object.keys(value?.draft || {}).length === 0 &&
      Object.keys(value?.pendingBatches || {}).length === 0 &&
      Object.keys(value?.submittedBatches || {}).length === 0
  )
}

export function toLiveTableShardValue<K extends keyof V3LiveTable>(shard: K, value: V3LiveTable[K] | null | undefined) {
  if (shard === 'summary') {
    return (value || null) as V3LiveTable[K]
  }
  return (value && typeof value === 'object' ? { ...value } : {}) as V3LiveTable[K]
}

export function encodeTableKey(table: string) {
  return encodeRtdbKeySegment(table)
}

export function decodeTableKey(table: string) {
  return decodeRtdbKeySegment(table)
}

export function encodeCatalogKey(key: string) {
  return encodeRtdbKeySegment(key)
}

export function decodeCatalogRecord<T>(value: Record<string, T> | null | undefined) {
  return Object.fromEntries(
    Object.entries(value || {}).map(([key, entry]) => [decodeRtdbKeySegment(key), entry])
  ) as Record<string, T>
}

export function decodeItemStatsRecord(value: Record<string, V3DailyItemStat> | null | undefined) {
  return Object.fromEntries(
    Object.entries(value || {}).map(([key, entry]) => [decodeRtdbKeySegment(key), entry])
  ) as Record<string, V3DailyItemStat>
}

export function encodeBatchMapKey(id: string) {
  return encodeRtdbKeySegment(id)
}

export function encodeItemStatsRecord(value: Record<string, V3DailyItemStat> | null | undefined) {
  if (!value) return null
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [encodeRtdbKeySegment(key), entry])) as Record<
    string,
    V3DailyItemStat
  >
}

export function createRtdbV3RepositoryContext({
  db,
  state,
  tables,
  cacheStore,
  helpers,
  onLiveStateChange,
}: RepositoryDeps) {
  const ctx = {
    db,
    state,
    cacheStore: cacheStore || createPersistentCacheStore(),
    tables: [...(tables || [])],
    helpers,
    onLiveStateChange,
    unsubs: new Map<string, () => void>(),
    revisionCache: new Map<string, V3RevisionValue>(),
    resourceFreshness: new Map<string, number>() as ResourceFreshness,
    resourceSyncTargets: new Map<string, number>() as ResourceSyncTargets,
    resourceLoads: new Map<string, ResourceLoadState<unknown>>() as ResourceLoaders,
    catalogSegmentLoads: new Map<V3CatalogSegment, Promise<unknown>>() as CatalogSegmentLoads,
    liveTableCache: new Map<string, V3LiveTable>(),
    dailySummaryDayCache: new Map<V3BizDateKey, V3DailySummary>(),
    itemStatsDayCache: new Map<V3BizDateKey, Record<string, V3DailyItemStat>>(),
    historyDayCache: new Map<V3BizDateKey, Record<string, V3ClosedOrder>>(),
    attendanceMonthCache: new Map<V3MonthKey, AttendanceMonthMap>(),
    attendanceRecordLocationCache: new Map<string, V3MonthKey>(),
    activeAttendanceMonths: new Set<V3MonthKey>(),
    ownerAuthLoaded: false,
    ownerAuthLoad: null as Promise<void> | null,
    staffLiveStarted: false,
    currentTableSession: null as { table: string; mode: LiveMode } | null,
    canonicalizeDraftEntries(entries: PosOrderEntry[]) {
      if (helpers?.normalizeEntryForDisplay && helpers?.getCanonicalDraftEntries) {
        const normalizeEntryForDisplay = helpers.normalizeEntryForDisplay
        const normalized = entries.map((entry) => normalizeEntryForDisplay(entry))
        return helpers.getCanonicalDraftEntries(normalized)
      }
      return canonicalizeDraftEntriesBase(entries)
    },
    notifyLiveStateChange(roots: string[]) {
      onLiveStateChange?.(roots)
    },
    clearSubscription(key: string) {
      ctx.unsubs.get(key)?.()
      ctx.unsubs.delete(key)
    },
    setSubscription(key: string, unsubscribe: (() => void) | undefined) {
      ctx.clearSubscription(key)
      if (unsubscribe) {
        ctx.unsubs.set(key, unsubscribe)
      }
    },
    rememberRevision(path: string, revision: number) {
      const previous = ctx.revisionCache.get(path)
      if (previous === undefined || previous <= revision) {
        ctx.revisionCache.set(path, revision)
      }
    },
    watchRevision(path: string, onChange: (revision: number) => void) {
      let lastSeen: number | null = null
      return db.ref(`${RTDB_V3_ROOT}/meta/revisions/${path}`).on('value', (snapshot) => {
        const revision = toRevValue(snapshot.val())
        ctx.rememberRevision(path, revision)
        if (lastSeen === null) {
          lastSeen = revision
          onChange(revision)
          return
        }
        if (lastSeen === revision) {
          return
        }
        lastSeen = revision
        onChange(revision)
      }) as () => void
    },
    touchRevision(path: string, payload: Record<string, unknown>) {
      payload[`${RTDB_V3_ROOT}/meta/revisions/${path}`] = Date.now()
    },
    async updateRoot(payload: Record<string, unknown>) {
      if (Object.keys(payload).length === 0) return
      const sanitizedPayload = sanitizeFirebaseUpdatePayload(payload)
      await db.ref('/').update(sanitizedPayload)
      const prefix = `${RTDB_V3_ROOT}/meta/revisions/`
      Object.entries(sanitizedPayload).forEach(([path, value]) => {
        if (path.startsWith(prefix)) {
          ctx.rememberRevision(path.slice(prefix.length), toRevValue(value))
        }
      })
    },
    async readRemoteRevision(path: string) {
      const snapshot = await db.ref(`${RTDB_V3_ROOT}/meta/revisions/${path}`).once('value')
      const revision = toRevValue(snapshot.val())
      ctx.rememberRevision(path, revision)
      return revision
    },
    async readRevision(path: string) {
      return await ctx.readRemoteRevision(path)
    },
    assertDescriptorRegistered(descriptor: ResourceDescriptor<unknown, unknown>) {
      if (!descriptor.remotePath) {
        throw new Error(`Descriptor missing remote path: ${descriptor.resourceKey}`)
      }
      if (!descriptor.revision.path) {
        throw new Error(`Descriptor missing revision path: ${descriptor.resourceKey}`)
      }
      if (!isRegisteredResourceDescriptor(descriptor)) {
        throw new Error(`Descriptor not registered: ${descriptor.resourceKey}`)
      }
    },
    async loadCachedResource<TDomain, TStored = TDomain>(descriptor: ResourceDescriptor<TDomain, TStored>) {
      ctx.assertDescriptorRegistered(descriptor)
      const manifest = await ctx.cacheStore.readManifest(descriptor.resourceKey)
      if (!manifest) {
        return null
      }
      const body = await ctx.cacheStore.readBody<TStored>(descriptor.resourceKey)
      if (body === null) {
        await ctx.cacheStore.deleteManifest(descriptor.resourceKey)
        return null
      }
      if (createPayloadHash(body) !== manifest.payloadHash) {
        await ctx.cacheStore.deleteManifest(descriptor.resourceKey)
        await ctx.cacheStore.deleteBody(descriptor.resourceKey)
        return null
      }
      try {
        return {
          revision: manifest.revision,
          value: descriptor.codec.decode(body),
        }
      } catch {
        await ctx.cacheStore.deleteManifest(descriptor.resourceKey)
        await ctx.cacheStore.deleteBody(descriptor.resourceKey)
        return null
      }
    },
    async saveCachedResource<TDomain, TStored = TDomain>(
      descriptor: ResourceDescriptor<TDomain, TStored>,
      revision: number,
      value: TDomain
    ) {
      ctx.assertDescriptorRegistered(descriptor)
      const encoded = descriptor.codec.encode(value)
      const payloadSize = JSON.stringify(encoded).length
      const payloadHash = createPayloadHash(encoded)
      await ctx.cacheStore.writeBody(descriptor.resourceKey, encoded)
      await ctx.cacheStore.writeManifest({
        schemaVersion: RTDB_V3_SCHEMA_VERSION,
        resourceKey: descriptor.resourceKey,
        revision,
        updatedAt: Date.now(),
        payloadSize,
        payloadHash,
      })
      ctx.resourceFreshness.set(descriptor.resourceKey, revision)
    },
    markResourceFresh(resourceKey: string, revision: number) {
      ctx.resourceFreshness.set(resourceKey, revision)
    },
    rememberResourceSyncTarget(resourceKey: string, revision: number) {
      const previous = ctx.resourceSyncTargets.get(resourceKey)
      if (previous === undefined || previous <= revision) {
        ctx.resourceSyncTargets.set(resourceKey, revision)
      }
    },
    clearResourceFresh(resourceKey: string) {
      ctx.resourceFreshness.delete(resourceKey)
      ctx.resourceSyncTargets.delete(resourceKey)
    },
    async invalidateCachedResource(resourceKey: string) {
      await ctx.cacheStore.deleteManifest(resourceKey)
      await ctx.cacheStore.deleteBody(resourceKey)
    },
    async hydrateCachedResource<TDomain, TStored = TDomain>(params: ManagedResourceParams<TDomain, TStored>) {
      const { descriptor, writeMemory } = params
      ctx.assertDescriptorRegistered(descriptor)
      const cached = await ctx.loadCachedResource(descriptor)
      if (!cached) {
        return null
      }
      writeMemory(cached.value)
      ctx.markResourceFresh(descriptor.resourceKey, cached.revision)
      return cached
    },
    async syncResource<TDomain, TStored = TDomain>(params: ManagedResourceSyncParams<TDomain, TStored>) {
      const { descriptor, readMemory, writeMemory, readRemote, revision: knownRevision } = params
      ctx.assertDescriptorRegistered(descriptor)
      const revision = knownRevision ?? (await ctx.readRemoteRevision(descriptor.revision.path))
      ctx.rememberRevision(descriptor.revision.path, revision)
      ctx.rememberResourceSyncTarget(descriptor.resourceKey, revision)

      while (true) {
        const memoryValue = readMemory?.()
        const memoryRevision = ctx.resourceFreshness.get(descriptor.resourceKey)
        if (memoryValue !== undefined && memoryRevision !== undefined && memoryRevision >= revision) {
          return memoryValue
        }
        const cached = await ctx.loadCachedResource(descriptor)
        if (cached && cached.revision >= revision) {
          writeMemory(cached.value)
          ctx.markResourceFresh(descriptor.resourceKey, cached.revision)
          return cached.value
        }

        const existingLoad = ctx.resourceLoads.get(descriptor.resourceKey) as ResourceLoadState<TDomain> | undefined
        if (existingLoad && existingLoad.revision >= revision) {
          return await existingLoad.promise
        }

        let load: Promise<TDomain>
        load = (async () => {
          const remote = await readRemote()
          const latestTargetRevision = ctx.resourceSyncTargets.get(descriptor.resourceKey)
          const latestRevision = ctx.resourceFreshness.get(descriptor.resourceKey)
          const latestValue = readMemory?.()
          const currentLoad = ctx.resourceLoads.get(descriptor.resourceKey) as ResourceLoadState<TDomain> | undefined
          if (currentLoad && currentLoad.revision > revision) {
            return await currentLoad.promise
          }
          if (latestTargetRevision !== undefined && latestTargetRevision > revision) {
            return latestValue ?? remote
          }
          if (latestValue !== undefined && latestRevision !== undefined && latestRevision > revision) {
            return latestValue
          }
          writeMemory(remote)
          await ctx.saveCachedResource(descriptor, revision, remote)
          ctx.markResourceFresh(descriptor.resourceKey, revision)
          return remote
        })().finally(() => {
          if (ctx.resourceLoads.get(descriptor.resourceKey)?.promise === load) {
            ctx.resourceLoads.delete(descriptor.resourceKey)
          }
        })

        ctx.resourceLoads.set(descriptor.resourceKey, { revision, promise: load })
        return await load
      }
    },
    async getResource<TDomain, TStored = TDomain>(params: ManagedResourceParams<TDomain, TStored>) {
      const { descriptor, readMemory } = params
      ctx.assertDescriptorRegistered(descriptor)
      await ctx.hydrateCachedResource(params)
      const remoteRevision = await ctx.readRemoteRevision(descriptor.revision.path)
      const memoryValue = readMemory()
      if (memoryValue !== undefined && ctx.resourceFreshness.get(descriptor.resourceKey) === remoteRevision) {
        return memoryValue
      }
      return await ctx.syncResource({
        ...params,
        revision: remoteRevision,
      })
    },
    async ensureManagedResource<TDomain, TStored = TDomain>(params: ManagedResourceParams<TDomain, TStored>) {
      return await ctx.getResource(params)
    },
    async refreshManagedResource<TDomain, TStored = TDomain>(params: ManagedResourceSyncParams<TDomain, TStored>) {
      return await ctx.syncResource(params)
    },
    watchManagedResource<TDomain, TStored = TDomain>(params: ManagedResourceWatchParams<TDomain, TStored>) {
      const { descriptor, emitInitial, onChange } = params
      ctx.assertDescriptorRegistered(descriptor)
      void ctx.hydrateCachedResource(params)
      let latestRevision = 0
      let initialized = false
      return ctx.watchRevision(descriptor.revision.path, (revision) => {
        if (revision < latestRevision) {
          return
        }
        const isInitial = !initialized
        initialized = true
        const previousFreshness = ctx.resourceFreshness.get(descriptor.resourceKey)
        const shouldNotify =
          !isInitial || emitInitial || previousFreshness === undefined || previousFreshness < revision
        latestRevision = revision
        void ctx
          .syncResource({
            ...params,
            revision,
          })
          .then((value) => {
            if (revision < latestRevision) {
              return
            }
            if (!shouldNotify) {
              return
            }
            onChange(value, revision)
          })
      })
    },
    async writeManagedResourceCache<TDomain, TStored = TDomain>(
      descriptor: ResourceDescriptor<TDomain, TStored>,
      value: TDomain
    ) {
      ctx.assertDescriptorRegistered(descriptor)
      const revision =
        ctx.revisionCache.get(descriptor.revision.path) ?? (await ctx.readRemoteRevision(descriptor.revision.path))
      await ctx.saveCachedResource(descriptor, revision, value)
      ctx.markResourceFresh(descriptor.resourceKey, revision)
    },
    async invalidateManagedResource<TDomain, TStored = TDomain>(descriptor: ResourceDescriptor<TDomain, TStored>) {
      ctx.assertDescriptorRegistered(descriptor)
      ctx.clearResourceFresh(descriptor.resourceKey)
      ctx.resourceLoads.delete(descriptor.resourceKey)
      await ctx.invalidateCachedResource(descriptor.resourceKey)
    },
    liveTablePath(table: string) {
      return `${RTDB_V3_ROOT}/live/tables/${encodeTableKey(table)}`
    },
    liveTableShardPath(table: string, shard: keyof V3LiveTable) {
      return `${ctx.liveTablePath(table)}/${shard}`
    },
    liveTableShardDescriptor<K extends keyof V3LiveTable>(table: string, shard: K) {
      return createLiveTableShardDescriptor(table, shard)
    },
    toLiveTableShardValue<K extends keyof V3LiveTable>(shard: K, value: V3LiveTable[K] | null | undefined) {
      return toLiveTableShardValue(shard, value)
    },
    toLiveTableShardValueFromSnapshot<K extends keyof V3LiveTable>(shard: K, value: unknown) {
      return toLiveTableShardValue(shard, decodeLiveTableShardValue(shard, value)) as V3LiveTable[K]
    },
    setCachedLiveTable(table: string, liveTable: V3LiveTable | null | undefined) {
      const normalized = normalizeLiveTable(liveTable)
      if (isLiveTableEmpty(normalized)) {
        ctx.liveTableCache.delete(table)
        return createEmptyLiveTable()
      }
      ctx.liveTableCache.set(table, normalized)
      return normalizeLiveTable(normalized)
    },
    getCachedLiveTable(table: string) {
      return normalizeLiveTable(ctx.liveTableCache.get(table))
    },
    applyLiveTableShard<K extends keyof V3LiveTable>(
      table: string,
      shard: K,
      value: V3LiveTable[K] | null | undefined,
      mode?: LiveMode
    ) {
      const current = ctx.getCachedLiveTable(table)
      const next = normalizeLiveTable({
        ...current,
        [shard]: toLiveTableShardValue(shard, value),
      } as V3LiveTable)
      ctx.applyLiveTable(table, next, mode)
      return next
    },
    async readLiveTableSummary(table: string) {
      const descriptor = ctx.liveTableShardDescriptor(table, 'summary')
      return await ctx.ensureManagedResource({
        descriptor,
        readMemory: () => ctx.liveTableCache.get(table)?.summary,
        writeMemory: (value) => {
          ctx.setCachedLiveTable(table, {
            ...ctx.getCachedLiveTable(table),
            summary: value,
          })
        },
        readRemote: async () => {
          const snapshot = await db.ref(`${RTDB_V3_ROOT}/${descriptor.remotePath}`).once('value')
          return tableSummaryStorageCodec.decode(snapshot.val() || null)
        },
      })
    },
    async readLiveTableShard<K extends keyof V3LiveTable>(table: string, shard: K) {
      const descriptor = ctx.liveTableShardDescriptor(table, shard)
      return await ctx.ensureManagedResource({
        descriptor,
        readMemory: () => {
          const liveTable = ctx.liveTableCache.get(table)
          return liveTable ? (toLiveTableShardValue(shard, liveTable[shard]) as V3LiveTable[K]) : undefined
        },
        writeMemory: (value) => {
          ctx.setCachedLiveTable(table, {
            ...ctx.getCachedLiveTable(table),
            [shard]: value,
          } as V3LiveTable)
        },
        readRemote: async () => {
          const snapshot = await db.ref(`${RTDB_V3_ROOT}/${descriptor.remotePath}`).once('value')
          return toLiveTableShardValue(shard, decodeLiveTableShardValue(shard, snapshot.val()))
        },
      })
    },
    async refreshLiveTableShard<K extends keyof V3LiveTable>(table: string, shard: K, revision?: number) {
      const descriptor = ctx.liveTableShardDescriptor(table, shard)
      return await ctx.refreshManagedResource({
        descriptor,
        revision,
        writeMemory: (value) => {
          ctx.setCachedLiveTable(table, {
            ...ctx.getCachedLiveTable(table),
            [shard]: value,
          } as V3LiveTable)
        },
        readRemote: async () => {
          const snapshot = await db.ref(`${RTDB_V3_ROOT}/${descriptor.remotePath}`).once('value')
          return toLiveTableShardValue(shard, decodeLiveTableShardValue(shard, snapshot.val()))
        },
      })
    },
    async invalidateLiveTableShardCache<K extends keyof V3LiveTable>(table: string, shard: K) {
      const descriptor = ctx.liveTableShardDescriptor(table, shard)
      await ctx.invalidateManagedResource(descriptor)
    },
    async readLiveTable(table: string) {
      const [summary, draft, pendingBatches, submittedBatches] = await Promise.all([
        ctx.readLiveTableShard(table, 'summary'),
        ctx.readLiveTableShard(table, 'draft'),
        ctx.readLiveTableShard(table, 'pendingBatches'),
        ctx.readLiveTableShard(table, 'submittedBatches'),
      ])
      return ctx.setCachedLiveTable(table, {
        summary,
        draft,
        pendingBatches,
        submittedBatches,
      })
    },
    functionReadPendingBatchDetail: async (table: string, batchId: string): Promise<PosOrderBatch | null> => {
      const pendingBatches = await ctx.readLiveTableShard(table, 'pendingBatches')
      const raw = pendingBatches[encodeBatchMapKey(batchId)]
      if (!raw) {
        return null
      }
      const stored = orderBatchStorageCodec.decode(raw as never) as V3OrderBatch
      return stored ? mapStoredBatch(stored, helpers?.normalizeEntryForDisplay) : null
    },
    toDraftEntries(liveTable: V3LiveTable | null | undefined) {
      return Object.values(liveTable?.draft || {})
        .map((entry) => mapStoredEntry(entry, helpers?.normalizeEntryForDisplay))
        .sort((left, right) => left.createdAt - right.createdAt)
    },
    toBatchList(value: Record<string, V3OrderBatch> | undefined) {
      return Object.values(value || {})
        .map((batch) => mapStoredBatch(batch, helpers?.normalizeEntryForDisplay))
        .sort((left, right) => left.createdAt - right.createdAt)
    },
    getPendingPreviewBatch(value: Record<string, V3OrderBatch> | undefined): PosPendingBatchPreview | null {
      const firstBatch = ctx.toBatchList(value)[0]
      if (!firstBatch) return null
      return {
        batchId: firstBatch.batchId,
        requestSeq: readRequestSeqCounter(firstBatch.requestSeq),
        createdAt: firstBatch.createdAt,
        requestLabel: firstBatch.requestLabel,
        entries: firstBatch.entries.slice(0, 3).map((entry, index) => ({
          entryId: `preview_${firstBatch.batchId}_${index}`,
          title: entry.summary?.title || entry.shortName,
          quantityLabel: entry.summary?.quantityLabel || `${entry.quantity || 1} 份`,
        })),
      }
    },
    syncPendingBatchPreview(tableId: string, value: Record<string, V3OrderBatch> | undefined) {
      if (ctx.currentTableSession?.table === tableId) {
        delete state.pendingBatchPreviews[tableId]
        return
      }

      const preview = ctx.getPendingPreviewBatch(value)
      if (preview) {
        state.pendingBatchPreviews[tableId] = [preview]
        return
      }

      delete state.pendingBatchPreviews[tableId]
    },
    syncTableStatusFromSubmitted(tableId: string, value?: Record<string, V3OrderBatch>) {
      const submittedBatches = value ?? ctx.liveTableCache.get(tableId)?.submittedBatches ?? {}
      if (Object.keys(submittedBatches).length > 0) {
        state.tableStatuses[tableId] = 'yellow'
        return
      }
      delete state.tableStatuses[tableId]
    },
    readNextRequestSeq(liveTable: V3LiveTable | null | undefined) {
      const summaryValue = readRequestSeqCounter(liveTable?.summary?.nextRequestSeq)
      if (liveTable?.summary?.nextRequestSeq) {
        return summaryValue
      }
      const existing = [
        ...Object.values(liveTable?.pendingBatches || {}),
        ...Object.values(liveTable?.submittedBatches || {}),
      ].reduce((maxSeq, batch) => Math.max(maxSeq, resolveStoredBatchRequestSeq(batch)), 0)
      return Math.max(summaryValue, existing + 1, 1)
    },
    buildRequestLabel(displaySeqBase: number, requestSeq: number) {
      return `#${displaySeqBase}-${requestSeq}`
    },
    applyTableSummary(tableId: string, summary: V3TableSummary | null | undefined) {
      if (!summary) {
        delete state.tableTimers[tableId]
        delete state.tableCustomers[tableId]
        delete state.tableSplitCounters[tableId]
        return
      }
      if (summary.timerStartedAt) state.tableTimers[tableId] = summary.timerStartedAt
      else delete state.tableTimers[tableId]
      state.tableCustomers[tableId] = {
        name: summary.customer?.name || '',
        phone: summary.customer?.phone || '',
        orderId: summary.displaySeqBase ?? undefined,
      }
      if ('nextSplitCounter' in summary) {
        state.tableSplitCounters[tableId] = readSplitCounter(
          (summary as V3TableSummary & { nextSplitCounter?: unknown }).nextSplitCounter
        )
      }
    },
    applyLiveTable(tableId: string, liveTable: V3LiveTable | null | undefined, mode?: LiveMode) {
      ctx.setCachedLiveTable(tableId, liveTable)
      ctx.applyTableSummary(tableId, liveTable?.summary || null)
      const draft = ctx.toDraftEntries(liveTable)
      const pending = ctx.toBatchList(liveTable?.pendingBatches)
      const submitted = ctx.toBatchList(liveTable?.submittedBatches)

      if (draft.length > 0) state.tableDrafts[tableId] = draft
      else delete state.tableDrafts[tableId]
      if (pending.length > 0) state.pendingBatches[tableId] = pending
      else delete state.pendingBatches[tableId]
      ctx.syncPendingBatchPreview(tableId, liveTable?.pendingBatches)
      if (submitted.length > 0) state.submittedBatches[tableId] = submitted
      else delete state.submittedBatches[tableId]
      ctx.syncTableStatusFromSubmitted(tableId, liveTable?.submittedBatches)

      if (ctx.currentTableSession?.table === tableId) {
        if (mode === 'customer') {
          state.activeDraftEntries = draft
          state.activePendingBatches = pending
          state.activeSubmittedBatches = submitted
        } else {
          state.activeDraftEntries = [...(state.staffDrafts[tableId] || [])]
          state.activePendingBatches = pending
          state.activeSubmittedBatches = submitted
        }
      }
    },
    async reserveDisplaySeqBase(value = Date.now()) {
      const bizDate = getBizDateKey(value)
      const ref = db.ref(`${RTDB_V3_ROOT}/history/sequenceByDate/${bizDate}/nextDisplaySeq`)
      const tx = await ref.transaction<number>((current) => (current || 1) + 1)
      const next = Number(tx.snapshot.val()) || 2
      return {
        bizDate,
        displaySeqBase: Math.max(1, next - 1),
      }
    },
    async reserveLiveNextRequestSeq(table: string, minimumNextRequestSeq = 1) {
      const ref = db.ref(`${ctx.liveTableShardPath(table, 'summary')}/nextRequestSeq`)
      const tx = await ref.transaction<number>((current) => {
        const currentNext = readRequestSeqCounter(current)
        return Math.max(currentNext, minimumNextRequestSeq) + 1
      })
      const nextRequestSeq = readRequestSeqCounter(tx.snapshot.val())
      return {
        requestSeq: Math.max(1, nextRequestSeq - 1),
        nextRequestSeq,
      }
    },
    async reserveLiveNextSplitCounter(table: string, minimumNextSplitCounter = 1) {
      const ref = db.ref(`${ctx.liveTableShardPath(table, 'summary')}/nextSplitCounter`)
      const tx = await ref.transaction<number>((current) => {
        const currentNext = readSplitCounter(current)
        return Math.max(currentNext, minimumNextSplitCounter) + 1
      })
      const nextSplitCounter = readSplitCounter(tx.snapshot.val())
      return {
        splitCounter: Math.max(1, nextSplitCounter - 1),
        nextSplitCounter,
      }
    },
    async ensureDisplaySeqBase(table: string, customer: PosTableCustomer | undefined) {
      const candidate =
        typeof customer?.orderId === 'number'
          ? customer.orderId
          : typeof customer?.orderId === 'string'
            ? Number.parseInt(customer.orderId, 10) || 0
            : 0
      if (candidate > 0) {
        state.tableCustomers[table] = { ...cloneCustomer(customer), orderId: candidate }
        return candidate
      }

      const cached = state.tableCustomers[table]
      const cachedValue =
        typeof cached?.orderId === 'number'
          ? cached.orderId
          : typeof cached?.orderId === 'string'
            ? Number.parseInt(cached.orderId, 10) || 0
            : 0
      if (cachedValue > 0) {
        state.tableCustomers[table] = { ...cloneCustomer(customer), orderId: cachedValue }
        return cachedValue
      }

      const remote = readDisplaySeqBase(await ctx.readLiveTableSummary(table))
      if (remote > 0) {
        state.tableCustomers[table] = { ...cloneCustomer(customer), orderId: remote }
        return remote
      }

      const reserved = await ctx.reserveDisplaySeqBase()
      state.tableCustomers[table] = { ...cloneCustomer(customer), orderId: reserved.displaySeqBase }
      return reserved.displaySeqBase
    },
  }
  return ctx
}

export type RtdbV3RepositoryContext = ReturnType<typeof createRtdbV3RepositoryContext>
