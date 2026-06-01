import type { PosOrderBatch, PosOrderEntry, PosTableCustomer } from '@/features/pos-kernel/types'
import {
  buildLiveTable,
  buildTableSummary,
  mapBatchToStored,
  mapStoredBatch,
  orderRecordToPosOrder,
  toClosedOrderRecord,
} from './rtdb-v3-mapper'
import {
  cloneCustomer,
  encodeBatchMapKey,
  type LiveMode,
  type RtdbV3RepositoryContext,
  readSplitCounter,
  sortEntries,
  sumEntries,
  toBatchId,
  toOrderId,
} from './rtdb-v3-repository-context'
import { createHistoryOrdersByDayDescriptor } from './rtdb-v3-resource-registry'
import {
  closedOrderStorageCodec,
  encodeLiveTableShardValue,
  encodeStoredTableSummaryField,
  getStoredTableSummaryFieldKey,
} from './rtdb-v3-storage-codecs'
import type { V3BizDateKey, V3LiveTable, V3TableSummary } from './rtdb-v3-types'
import { RTDB_V3_ROOT } from './rtdb-v3-types'

export function createRtdbV3RepositoryLiveModule(
  ctx: RtdbV3RepositoryContext,
  deps: { rebuildDayReports: (bizDate: V3BizDateKey) => Promise<void> }
) {
  type LiveShard = keyof V3LiveTable
  type LiveShardPatch = Partial<Pick<V3LiveTable, LiveShard>>
  const summaryCounterKeys = new Set<keyof V3TableSummary>(['nextRequestSeq', 'nextSplitCounter'])

  function hasShard(patch: LiveShardPatch, shard: LiveShard) {
    return Object.hasOwn(patch, shard)
  }

  function normalizeShardValue<K extends LiveShard>(shard: K, value: V3LiveTable[K] | null | undefined) {
    if (shard === 'summary') {
      return (value || null) as V3LiveTable[K]
    }
    return (value && typeof value === 'object' ? { ...value } : {}) as V3LiveTable[K]
  }

  function queueSummaryObjectPatch(
    payload: Record<string, unknown>,
    basePath: string,
    previous: V3TableSummary | null,
    next: V3TableSummary | null
  ) {
    if (!next) {
      if (previous) {
        payload[basePath] = null
        return true
      }
      return false
    }

    let changed = false
    const previousValue = previous || null
    const keys = new Set<keyof V3TableSummary>([...Object.keys(previousValue || {}), ...Object.keys(next)] as Array<
      keyof V3TableSummary
    >)

    keys.forEach((key) => {
      if (summaryCounterKeys.has(key)) {
        return
      }

      const prevEntry = previousValue?.[key] ?? null
      const nextEntry = next[key] ?? null
      if (JSON.stringify(prevEntry) === JSON.stringify(nextEntry)) {
        return
      }

      payload[`${basePath}/${getStoredTableSummaryFieldKey(key)}`] = encodeStoredTableSummaryField(key, nextEntry)
      changed = true
    })

    return changed
  }

  function mergeCachedShards(table: string, patch: LiveShardPatch) {
    ctx.setCachedLiveTable(table, {
      ...ctx.getCachedLiveTable(table),
      ...patch,
    } as V3LiveTable)
  }

  async function readShard<K extends LiveShard>(table: string, shard: K): Promise<V3LiveTable[K]> {
    const value = await ctx.readLiveTableShard(table, shard)
    mergeCachedShards(table, { [shard]: value } as LiveShardPatch)
    return value
  }

  function getCurrentCustomer(table: string, summary: V3TableSummary | null | undefined, fallback?: PosTableCustomer) {
    if (fallback) {
      return cloneCustomer(fallback)
    }
    if (ctx.state.tableCustomers[table]) {
      return cloneCustomer(ctx.state.tableCustomers[table])
    }
    return {
      name: summary?.customer?.name || '',
      phone: summary?.customer?.phone || '',
      orderId: summary?.displaySeqBase ?? undefined,
    }
  }

  function getCurrentTimer(table: string, summary: V3TableSummary | null | undefined, fallback?: number) {
    return ctx.state.tableTimers[table] ?? summary?.timerStartedAt ?? fallback
  }

  function applyLocalLivePatch(table: string, patch: LiveShardPatch) {
    const sessionMode = ctx.currentTableSession?.table === table ? ctx.currentTableSession.mode : null

    if (hasShard(patch, 'summary')) {
      ctx.applyTableSummary(table, patch.summary || null)
    }

    if (hasShard(patch, 'draft')) {
      const draftEntries = ctx.toDraftEntries({
        summary: null,
        draft: patch.draft || {},
        pendingBatches: {},
        submittedBatches: {},
      })
      if (draftEntries.length > 0) {
        ctx.state.tableDrafts[table] = draftEntries
      } else {
        delete ctx.state.tableDrafts[table]
      }
      if (sessionMode === 'customer') {
        ctx.state.activeDraftEntries = draftEntries
      } else if (sessionMode === 'staff') {
        ctx.state.activeDraftEntries = [...(ctx.state.staffDrafts[table] || [])]
      }
    }

    if (hasShard(patch, 'pendingBatches')) {
      const pendingBatches = ctx.toBatchList(patch.pendingBatches || {})
      if (pendingBatches.length > 0) {
        ctx.state.pendingBatches[table] = pendingBatches
      } else {
        delete ctx.state.pendingBatches[table]
      }
      ctx.syncPendingBatchPreview(table, patch.pendingBatches || {})
      if (sessionMode) {
        ctx.state.activePendingBatches = pendingBatches
      }
    }

    if (hasShard(patch, 'submittedBatches')) {
      const submittedBatches = ctx.toBatchList(patch.submittedBatches || {})
      if (submittedBatches.length > 0) {
        ctx.state.submittedBatches[table] = submittedBatches
      } else {
        delete ctx.state.submittedBatches[table]
      }
      if (sessionMode) {
        ctx.state.activeSubmittedBatches = submittedBatches
      }
    }
  }

  async function commitLivePatch(
    table: string,
    previous: LiveShardPatch,
    next: LiveShardPatch,
    options?: { forceShards?: LiveShard[] }
  ) {
    const patch = buildLivePatch(table, previous, next, options)
    if (Object.keys(patch.payload).length === 0) {
      return
    }

    await ctx.updateRoot(patch.payload)
    await persistLocalLivePatch(table, patch)
  }

  function buildLivePatch(
    table: string,
    previous: LiveShardPatch,
    next: LiveShardPatch,
    options?: { forceShards?: LiveShard[] }
  ) {
    const payload: Record<string, unknown> = {}
    const changedShards = new Set<LiveShard>()
    const forceShards = new Set(options?.forceShards || [])
    const normalizedNext: LiveShardPatch = {}

    function queueMapShard<K extends 'draft' | 'pendingBatches' | 'submittedBatches'>(shard: K) {
      const prevValue = normalizeShardValue(shard, previous[shard] as V3LiveTable[K] | null | undefined)
      const nextValue = normalizeShardValue(shard, next[shard] as V3LiveTable[K] | null | undefined)
      normalizedNext[shard] = nextValue

      const prevKeys = new Set(Object.keys((prevValue || {}) as Record<string, unknown>))
      const nextEntries = Object.entries((nextValue || {}) as Record<string, unknown>)
      const basePath = ctx.liveTableShardPath(table, shard)
      let shardChanged = false

      nextEntries.forEach(([key, value]) => {
        prevKeys.delete(key)
        const prevEntry = prevValue?.[key as keyof typeof prevValue]
        if (!forceShards.has(shard) && JSON.stringify(prevEntry ?? null) === JSON.stringify(value ?? null)) {
          return
        }
        const encodedValueMap: Record<string, unknown> =
          shard === 'draft'
            ? (encodeLiveTableShardValue('draft', { [key]: value } as V3LiveTable['draft']) as Record<string, unknown>)
            : shard === 'pendingBatches'
              ? (encodeLiveTableShardValue('pendingBatches', {
                  [key]: value,
                } as V3LiveTable['pendingBatches']) as Record<string, unknown>)
              : (encodeLiveTableShardValue('submittedBatches', {
                  [key]: value,
                } as V3LiveTable['submittedBatches']) as Record<string, unknown>)
        const encodedValue = encodedValueMap[key]
        payload[`${basePath}/${key}`] = encodedValue
        shardChanged = true
      })

      prevKeys.forEach((key) => {
        payload[`${basePath}/${key}`] = null
        shardChanged = true
      })

      if (
        forceShards.has(shard) &&
        nextEntries.length === 0 &&
        Object.keys(payload).every((path) => !path.startsWith(`${basePath}/`))
      ) {
        payload[basePath] = null
        shardChanged = true
      }

      if (!shardChanged) {
        return
      }

      ctx.touchRevision(`live/tables/${table}/${shard}`, payload)
      changedShards.add(shard)
    }

    function queueShard<K extends LiveShard>(shard: K) {
      if (!hasShard(next, shard)) {
        return
      }
      const prevValue = normalizeShardValue(shard, previous[shard] as V3LiveTable[K] | null | undefined)
      const nextValue = normalizeShardValue(shard, next[shard] as V3LiveTable[K] | null | undefined)
      normalizedNext[shard] = nextValue

      if (!forceShards.has(shard) && JSON.stringify(prevValue ?? null) === JSON.stringify(nextValue ?? null)) {
        return
      }

      if (shard === 'summary') {
        const summaryChanged = queueSummaryObjectPatch(
          payload,
          ctx.liveTableShardPath(table, shard),
          (prevValue as V3LiveTable['summary']) || null,
          (nextValue as V3LiveTable['summary']) || null
        )

        if (!summaryChanged) {
          return
        }

        ctx.touchRevision(`live/tables/${table}/${shard}`, payload)
        changedShards.add(shard)
        return
      }

      queueMapShard(shard as 'draft' | 'pendingBatches' | 'submittedBatches')
    }

    queueShard('summary')
    queueShard('draft')
    queueShard('pendingBatches')
    queueShard('submittedBatches')

    return {
      payload,
      changedShards,
      normalizedNext,
    }
  }

  async function persistLocalLivePatch(
    table: string,
    patch: {
      changedShards: Set<LiveShard>
      normalizedNext: LiveShardPatch
    }
  ) {
    await Promise.all(
      [...patch.changedShards].map((shard) => {
        if (shard === 'summary') {
          return ctx.saveLiveTableShardCache(
            table,
            'summary',
            (patch.normalizedNext.summary || null) as V3LiveTable['summary']
          )
        }
        if (shard === 'draft') {
          return ctx.saveLiveTableShardCache(table, 'draft', (patch.normalizedNext.draft || {}) as V3LiveTable['draft'])
        }
        if (shard === 'pendingBatches') {
          return ctx.saveLiveTableShardCache(
            table,
            'pendingBatches',
            (patch.normalizedNext.pendingBatches || {}) as V3LiveTable['pendingBatches']
          )
        }
        return ctx.saveLiveTableShardCache(
          table,
          'submittedBatches',
          (patch.normalizedNext.submittedBatches || {}) as V3LiveTable['submittedBatches']
        )
      })
    )
    mergeCachedShards(table, patch.normalizedNext)
    applyLocalLivePatch(table, patch.normalizedNext)
  }

  async function saveCustomerDraft(table: string, entries: PosOrderEntry[], customerInput: PosTableCustomer) {
    const displaySeqBase = await ctx.ensureDisplaySeqBase(table, customerInput)
    const customer = cloneCustomer(customerInput)
    customer.orderId = displaySeqBase
    ctx.state.tableCustomers[table] = customer
    ctx.state.tableTimers[table] ||= Date.now()
    const [summary, draft, pendingBatches, submittedBatches] = await Promise.all([
      readShard(table, 'summary'),
      readShard(table, 'draft'),
      readShard(table, 'pendingBatches'),
      readShard(table, 'submittedBatches'),
    ])
    const updatedAt = Date.now()
    const nextDraft = ctx.canonicalizeDraftEntries(
      entries.map((entry) => ({ ...entry, status: 'draft', source: 'customer', updatedAt }))
    )
    const nextDraftMap = buildLiveTable({ draft: nextDraft }).draft
    const nextSummary = buildTableSummary({
      timerStartedAt: getCurrentTimer(table, summary),
      draftEntryCount: nextDraft.length,
      pendingBatchCount: Object.keys(pendingBatches).length,
      submittedBatchCount: Object.keys(submittedBatches).length,
      nextRequestSeq: ctx.readNextRequestSeq({
        summary,
        draft,
        pendingBatches,
        submittedBatches,
      }),
      nextSplitCounter: readSplitCounter(summary?.nextSplitCounter),
      customer,
      updatedAt,
    })
    await commitLivePatch(
      table,
      {
        summary,
        draft,
        pendingBatches,
        submittedBatches,
      },
      {
        summary: nextSummary,
        draft: nextDraftMap,
      },
      {
        forceShards: ['draft'],
      }
    )
    return { displaySeqBase }
  }

  async function discardCustomerDraft(table: string) {
    const [summary, draft, pendingBatches, submittedBatches] = await Promise.all([
      readShard(table, 'summary'),
      readShard(table, 'draft'),
      readShard(table, 'pendingBatches'),
      readShard(table, 'submittedBatches'),
    ])
    const updatedAt = Date.now()
    const nextSummary = buildTableSummary({
      timerStartedAt: getCurrentTimer(table, summary),
      draftEntryCount: 0,
      pendingBatchCount: Object.keys(pendingBatches).length,
      submittedBatchCount: Object.keys(submittedBatches).length,
      nextRequestSeq: ctx.readNextRequestSeq({
        summary,
        draft,
        pendingBatches,
        submittedBatches,
      }),
      nextSplitCounter: readSplitCounter(summary?.nextSplitCounter),
      customer: getCurrentCustomer(table, summary),
      updatedAt,
    })
    await commitLivePatch(
      table,
      {
        summary,
        draft,
        pendingBatches,
        submittedBatches,
      },
      {
        summary: nextSummary,
        draft: {},
      },
      {
        forceShards: ['draft'],
      }
    )
  }

  async function submitCustomerDraft(
    table: string,
    entries: PosOrderEntry[],
    customerInput: PosTableCustomer
  ): Promise<PosOrderBatch> {
    const displaySeqBase = await ctx.ensureDisplaySeqBase(table, customerInput)
    const customer = cloneCustomer(customerInput)
    customer.orderId = displaySeqBase
    const [summary, pendingBatches, submittedBatches] = await Promise.all([
      readShard(table, 'summary'),
      readShard(table, 'pendingBatches'),
      readShard(table, 'submittedBatches'),
    ])
    const createdAt = Date.now()
    const minimumNextRequestSeq = ctx.readNextRequestSeq({
      summary,
      draft: {},
      pendingBatches,
      submittedBatches,
    })
    const { requestSeq, nextRequestSeq } = await ctx.reserveLiveNextRequestSeq(table, minimumNextRequestSeq)
    const batch = {
      batchId: toBatchId('pending'),
      source: 'customer',
      status: 'pending',
      table,
      customer,
      createdAt,
      updatedAt: createdAt,
      requestSeq,
      requestLabel: ctx.buildRequestLabel(displaySeqBase, requestSeq),
      entries: sortEntries(
        entries.map((entry) => ({ ...entry, status: 'pending', source: 'customer', updatedAt: createdAt }))
      ),
      subtotal: sumEntries(entries),
    } satisfies PosOrderBatch
    const nextPendingBatches = {
      ...pendingBatches,
      [encodeBatchMapKey(batch.batchId)]: mapBatchToStored(batch),
    }
    const nextSummary = buildTableSummary({
      timerStartedAt: getCurrentTimer(table, summary, createdAt),
      draftEntryCount: 0,
      pendingBatchCount: Object.keys(nextPendingBatches).length,
      submittedBatchCount: Object.keys(submittedBatches).length,
      nextRequestSeq,
      nextSplitCounter: readSplitCounter(summary?.nextSplitCounter),
      customer,
      updatedAt: createdAt,
    })
    await commitLivePatch(
      table,
      {
        summary,
        pendingBatches,
        submittedBatches,
      },
      {
        summary: nextSummary,
        draft: {},
        pendingBatches: nextPendingBatches,
      },
      {
        forceShards: ['draft'],
      }
    )
    return batch
  }

  async function readPendingBatchDetail(table: string, batchId: string) {
    return ctx.functionReadPendingBatchDetail(table, batchId)
  }

  async function acceptPendingBatch(table: string, batchId: string): Promise<PosOrderBatch | null> {
    const [summary, pendingBatches, submittedBatches] = await Promise.all([
      readShard(table, 'summary'),
      readShard(table, 'pendingBatches'),
      readShard(table, 'submittedBatches'),
    ])
    const batchKey = encodeBatchMapKey(batchId)
    const target = pendingBatches[batchKey]
    if (!target) {
      return null
    }
    const acceptedBatch = mapStoredBatch(target, ctx.helpers?.normalizeEntryForDisplay)
    acceptedBatch.status = 'accepted'
    acceptedBatch.acceptedAt = Date.now()
    acceptedBatch.updatedAt = acceptedBatch.acceptedAt
    acceptedBatch.entries = acceptedBatch.entries.map((entry) => ({
      ...entry,
      status: 'accepted',
      updatedAt: acceptedBatch.updatedAt,
    }))
    const nextPendingBatches = { ...pendingBatches }
    delete nextPendingBatches[batchKey]
    const nextSubmittedBatches = {
      ...submittedBatches,
      [encodeBatchMapKey(acceptedBatch.batchId)]: mapBatchToStored(acceptedBatch),
    }
    const nextSummary = buildTableSummary({
      timerStartedAt: getCurrentTimer(table, summary),
      draftEntryCount: 0,
      pendingBatchCount: Object.keys(nextPendingBatches).length,
      submittedBatchCount: Object.keys(nextSubmittedBatches).length,
      nextRequestSeq: ctx.readNextRequestSeq({
        summary,
        draft: {},
        pendingBatches,
        submittedBatches,
      }),
      nextSplitCounter: readSplitCounter(summary?.nextSplitCounter),
      customer: getCurrentCustomer(table, summary),
      updatedAt: acceptedBatch.updatedAt,
    })
    await commitLivePatch(
      table,
      {
        summary,
        pendingBatches,
        submittedBatches,
      },
      {
        summary: nextSummary,
        pendingBatches: nextPendingBatches,
        submittedBatches: nextSubmittedBatches,
      }
    )
    const accepted = acceptedBatch
    return accepted
  }

  async function rejectPendingBatch(table: string, batchId: string) {
    const [summary, draft, pendingBatches, submittedBatches] = await Promise.all([
      readShard(table, 'summary'),
      readShard(table, 'draft'),
      readShard(table, 'pendingBatches'),
      readShard(table, 'submittedBatches'),
    ])
    const batchKey = encodeBatchMapKey(batchId)
    const target = pendingBatches[batchKey]
    if (!target) {
      return
    }
    const rejected = mapStoredBatch(target, ctx.helpers?.normalizeEntryForDisplay)
    const currentDraft = ctx.toDraftEntries({
      summary: null,
      draft,
      pendingBatches: {},
      submittedBatches: {},
    })
    const updatedAt = Date.now()
    const returnedEntries = rejected.entries.map((entry) => ({
      ...entry,
      status: 'draft' as const,
      updatedAt,
    }))
    const nextDraftEntries = ctx.canonicalizeDraftEntries([...currentDraft, ...returnedEntries])
    const nextPendingBatches = { ...pendingBatches }
    delete nextPendingBatches[batchKey]
    const nextSummary = buildTableSummary({
      timerStartedAt: getCurrentTimer(table, summary),
      draftEntryCount: nextDraftEntries.length,
      pendingBatchCount: Object.keys(nextPendingBatches).length,
      submittedBatchCount: Object.keys(submittedBatches).length,
      nextRequestSeq: ctx.readNextRequestSeq({
        summary,
        draft,
        pendingBatches,
        submittedBatches,
      }),
      nextSplitCounter: readSplitCounter(summary?.nextSplitCounter),
      customer: getCurrentCustomer(table, summary),
      updatedAt,
    })
    await commitLivePatch(
      table,
      {
        summary,
        draft,
        pendingBatches,
        submittedBatches,
      },
      {
        summary: nextSummary,
        draft: buildLiveTable({ draft: nextDraftEntries }).draft,
        pendingBatches: nextPendingBatches,
      }
    )
  }

  async function saveStaffDraft(table: string, entries: PosOrderEntry[]) {
    const next = ctx.canonicalizeDraftEntries(entries.map((entry) => ({ ...entry, source: 'staff', status: 'draft' })))
    ctx.state.staffDrafts[table] = next
    if (ctx.currentTableSession?.table === table && ctx.currentTableSession.mode === 'staff') {
      ctx.state.activeDraftEntries = next
    }
  }

  async function createStaffBatch(
    table: string,
    entries: PosOrderEntry[],
    customer?: PosTableCustomer
  ): Promise<PosOrderBatch> {
    const displaySeqBase = await ctx.ensureDisplaySeqBase(table, customer || ctx.state.tableCustomers[table])
    const createdAt = Date.now()
    const [summary, pendingBatches, submittedBatches] = await Promise.all([
      readShard(table, 'summary'),
      readShard(table, 'pendingBatches'),
      readShard(table, 'submittedBatches'),
    ])
    const minimumNextRequestSeq = ctx.readNextRequestSeq({
      summary,
      draft: {},
      pendingBatches,
      submittedBatches,
    })
    const { requestSeq, nextRequestSeq } = await ctx.reserveLiveNextRequestSeq(table, minimumNextRequestSeq)
    const batch = {
      batchId: toBatchId('submitted'),
      source: 'staff',
      status: 'accepted',
      table,
      customer: {
        ...getCurrentCustomer(table, summary, customer || ctx.state.tableCustomers[table]),
        orderId: displaySeqBase,
      },
      createdAt,
      updatedAt: createdAt,
      acceptedAt: createdAt,
      requestSeq,
      requestLabel: ctx.buildRequestLabel(displaySeqBase, requestSeq),
      entries: sortEntries(
        entries.map((entry) => ({ ...entry, source: 'staff', status: 'accepted', updatedAt: createdAt }))
      ),
      subtotal: sumEntries(entries),
    } satisfies PosOrderBatch
    const nextSubmittedBatches = {
      ...submittedBatches,
      [encodeBatchMapKey(batch.batchId)]: mapBatchToStored(batch),
    }
    ctx.state.staffDrafts[table] = []
    const nextSummary = buildTableSummary({
      timerStartedAt: getCurrentTimer(table, summary, createdAt),
      draftEntryCount: 0,
      pendingBatchCount: Object.keys(pendingBatches).length,
      submittedBatchCount: Object.keys(nextSubmittedBatches).length,
      nextRequestSeq,
      nextSplitCounter: readSplitCounter(summary?.nextSplitCounter),
      customer: batch.customer,
      updatedAt: createdAt,
    })
    await commitLivePatch(
      table,
      {
        summary,
        pendingBatches,
        submittedBatches,
      },
      {
        summary: nextSummary,
        submittedBatches: nextSubmittedBatches,
      }
    )
    if (ctx.currentTableSession?.table === table && ctx.currentTableSession.mode === 'staff') {
      ctx.state.activeDraftEntries = []
    }
    return batch
  }

  async function updateSubmittedBatch(
    table: string,
    batchId: string,
    entries: PosOrderEntry[]
  ): Promise<PosOrderBatch | null> {
    const [summary, pendingBatches, submittedBatches] = await Promise.all([
      readShard(table, 'summary'),
      readShard(table, 'pendingBatches'),
      readShard(table, 'submittedBatches'),
    ])
    const batchKey = encodeBatchMapKey(batchId)
    const stored = submittedBatches[batchKey]
    if (!stored) {
      return null
    }
    const current = mapStoredBatch(stored, ctx.helpers?.normalizeEntryForDisplay)
    const updatedAt = Date.now()
    const nextSubmittedBatches = { ...submittedBatches }
    let nextBatch: PosOrderBatch | null = null
    if (entries.length === 0) {
      delete nextSubmittedBatches[batchKey]
    } else {
      nextBatch = {
        ...current,
        updatedAt,
        entries: sortEntries(entries.map((entry) => ({ ...entry, status: 'accepted', updatedAt }))),
        subtotal: sumEntries(entries),
      }
      nextSubmittedBatches[batchKey] = mapBatchToStored(nextBatch)
    }
    const nextSummary = buildTableSummary({
      timerStartedAt: getCurrentTimer(table, summary),
      draftEntryCount: 0,
      pendingBatchCount: Object.keys(pendingBatches).length,
      submittedBatchCount: Object.keys(nextSubmittedBatches).length,
      nextRequestSeq: ctx.readNextRequestSeq({
        summary,
        draft: {},
        pendingBatches,
        submittedBatches,
      }),
      nextSplitCounter: readSplitCounter(summary?.nextSplitCounter),
      customer: getCurrentCustomer(table, summary),
      updatedAt,
    })
    await commitLivePatch(
      table,
      {
        summary,
        pendingBatches,
        submittedBatches,
      },
      {
        summary: nextSummary,
        submittedBatches: nextSubmittedBatches,
      }
    )
    return nextBatch
  }

  async function checkoutSubmittedBatches(payload: {
    table: string
    entryIds?: string[]
    entries?: PosOrderEntry[]
    customer: PosTableCustomer | undefined
    paidTotal: number
    originalTotal: number
  }) {
    const [summary, pendingBatches, submittedBatches] = await Promise.all([
      readShard(payload.table, 'summary'),
      readShard(payload.table, 'pendingBatches'),
      readShard(payload.table, 'submittedBatches'),
    ])
    const displaySeqBase = await ctx.ensureDisplaySeqBase(payload.table, payload.customer)
    const closedAt = Date.now()
    const orderId = toOrderId()
    const submittedBatchList = ctx.toBatchList(submittedBatches)
    const requestedEntryIds = new Set(payload.entryIds || [])
    const fallbackEntries = payload.entries || []
    const selectedEntries =
      requestedEntryIds.size > 0
        ? submittedBatchList.flatMap((batch) => batch.entries.filter((entry) => requestedEntryIds.has(entry.entryId)))
        : fallbackEntries
    if (selectedEntries.length === 0) {
      throw new Error('No submitted entries selected for checkout')
    }

    const selectedEntryIds = new Set(selectedEntries.map((entry) => entry.entryId))
    const selectedBatchIds = submittedBatchList
      .filter((batch) => batch.entries.some((entry) => selectedEntryIds.has(entry.entryId)))
      .map((batch) => batch.batchId)
    const minimumNextSplitCounter = readSplitCounter(summary?.nextSplitCounter)
    const splitReservation =
      selectedEntries.length === submittedBatchList.flatMap((batch) => batch.entries).length
        ? null
        : await ctx.reserveLiveNextSplitCounter(payload.table, minimumNextSplitCounter)
    const splitCounter =
      selectedEntries.length === submittedBatchList.flatMap((batch) => batch.entries).length
        ? null
        : splitReservation?.splitCounter || minimumNextSplitCounter
    const orderRecord = toClosedOrderRecord({
      orderId,
      table: payload.table,
      displaySeqBase,
      splitCounter,
      closedAt,
      customer: payload.customer,
      batchIds: selectedBatchIds,
      entries: selectedEntries,
      itemCosts: ctx.state.itemCosts,
      paidTotal: payload.paidTotal,
      originalTotal: payload.originalTotal,
    })
    const bizDate = orderRecord.bizDate
    const remainingSubmitted = submittedBatchList
      .map((batch) => {
        const remainingEntries = batch.entries.filter((entry) => !selectedEntryIds.has(entry.entryId))
        if (remainingEntries.length === 0) {
          return null
        }
        return {
          ...batch,
          entries: remainingEntries,
          subtotal: sumEntries(remainingEntries),
          updatedAt: closedAt,
        } satisfies PosOrderBatch
      })
      .filter((batch): batch is PosOrderBatch => Boolean(batch))

    const isFullCheckout = remainingSubmitted.length === 0
    const historyDescriptor = createHistoryOrdersByDayDescriptor(bizDate)
    const payloadUpdate: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/${historyDescriptor.remotePath}/${orderId}`]: closedOrderStorageCodec.encode(orderRecord),
    }
    const nextSubmittedBatches = Object.fromEntries(
      remainingSubmitted.map((batch) => [encodeBatchMapKey(batch.batchId), mapBatchToStored(batch)])
    )
    const nextSummary = isFullCheckout
      ? null
      : buildTableSummary({
          timerStartedAt: getCurrentTimer(payload.table, summary),
          draftEntryCount: 0,
          pendingBatchCount: 0,
          submittedBatchCount: remainingSubmitted.length,
          nextRequestSeq: ctx.readNextRequestSeq({
            summary,
            draft: {},
            pendingBatches,
            submittedBatches,
          }),
          nextSplitCounter: splitReservation?.nextSplitCounter || minimumNextSplitCounter + 1,
          customer: getCurrentCustomer(
            payload.table,
            summary,
            ctx.state.tableCustomers[payload.table] || payload.customer
          ),
          updatedAt: closedAt,
        })
    const livePatch = buildLivePatch(
      payload.table,
      {
        summary,
        draft: {},
        pendingBatches,
        submittedBatches,
      },
      {
        summary: nextSummary,
        draft: {},
        pendingBatches: {},
        submittedBatches: nextSubmittedBatches,
      },
      {
        forceShards: ['draft', 'pendingBatches'],
      }
    )
    Object.assign(payloadUpdate, livePatch.payload)
    ctx.touchRevision(`history/ordersByDay/${bizDate}`, payloadUpdate)
    await ctx.updateRoot(payloadUpdate)
    await persistLocalLivePatch(payload.table, livePatch)
    const byDay = { ...(ctx.historyDayCache.get(bizDate) || {}) }
    byDay[orderId] = orderRecord
    ctx.historyDayCache.set(bizDate, byDay)
    await deps.rebuildDayReports(bizDate)

    if (isFullCheckout) {
      delete ctx.state.tableDrafts[payload.table]
      delete ctx.state.pendingBatches[payload.table]
      delete ctx.state.submittedBatches[payload.table]
      delete ctx.state.staffDrafts[payload.table]
      delete ctx.state.tableTimers[payload.table]
      delete ctx.state.tableStatuses[payload.table]
      delete ctx.state.tableCustomers[payload.table]
      delete ctx.state.tableSplitCounters[payload.table]
      if (ctx.currentTableSession?.table === payload.table) {
        ctx.state.activeDraftEntries = []
        ctx.state.activePendingBatches = []
        ctx.state.activeSubmittedBatches = []
      }
    } else {
      ctx.state.tableDrafts[payload.table] = []
      delete ctx.state.pendingBatches[payload.table]
      ctx.state.submittedBatches[payload.table] = remainingSubmitted
      ctx.state.tableStatuses[payload.table] = 'yellow'
      ctx.state.tableSplitCounters[payload.table] = splitReservation?.nextSplitCounter || minimumNextSplitCounter + 1
      if (ctx.currentTableSession?.table === payload.table) {
        ctx.state.activeDraftEntries =
          ctx.currentTableSession.mode === 'staff' ? [...(ctx.state.staffDrafts[payload.table] || [])] : []
        ctx.state.activePendingBatches = []
        ctx.state.activeSubmittedBatches = remainingSubmitted
      }
    }

    return orderRecordToPosOrder(orderRecord, ctx.helpers?.normalizeEntryForDisplay)
  }

  async function startStaffLive() {
    if (ctx.staffLiveStarted) return
    ctx.staffLiveStarted = true
    const shardSubscriptionLoads = new Map<string, Promise<void>>()

    function subscribeShard<K extends 'summary' | 'pendingBatches'>(table: string, shard: K, roots: string[]) {
      const key = `staff-${shard}-revision-${table}`
      const loadKey = `${table}:${shard}`
      const existingLoad = shardSubscriptionLoads.get(loadKey)
      if (existingLoad) {
        return existingLoad
      }

      let initialized = false
      let resolveInitial!: () => void
      const initialLoad = new Promise<void>((resolve) => {
        resolveInitial = resolve
      })
      shardSubscriptionLoads.set(loadKey, initialLoad)

      const descriptor = ctx.liveTableShardDescriptor(table, shard)
      ctx.setSubscription(
        key,
        ctx.watchRevision(descriptor.revision.path, () => {
          void ctx.readLiveTableShard(table, shard).then((value) => {
            ctx.applyLiveTableShard(table, shard, value, ctx.currentTableSession?.mode)
            ctx.notifyLiveStateChange(roots)
            if (!initialized) {
              initialized = true
              resolveInitial()
            }
          })
        })
      )

      return initialLoad
    }

    await Promise.all(
      ctx.tables.flatMap((table) => [
        subscribeShard(table, 'summary', ['tableSummaries']),
        subscribeShard(table, 'pendingBatches', ['pendingBatches']),
      ])
    )
  }

  async function startTableLiveSession(mode: LiveMode, table: string) {
    stopTableLiveSession()
    ctx.currentTableSession = { table, mode }
    ctx.state.selectedTable = table
    ctx.state.currentMode = mode
    const liveTable = await ctx.readLiveTable(table)
    ctx.applyLiveTable(table, liveTable, mode)

    function subscribeShardRevision<K extends LiveShard>(
      shard: K,
      roots: string[],
      apply: (value: V3LiveTable[K]) => void
    ) {
      const descriptor = ctx.liveTableShardDescriptor(table, shard)
      return ctx.watchRevision(descriptor.revision.path, () => {
        void ctx.readLiveTableShard(table, shard).then((value) => {
          apply(value)
          ctx.notifyLiveStateChange(roots)
        })
      })
    }

    ctx.setSubscription(
      `table-live-summary-${table}`,
      subscribeShardRevision('summary', ['tableSummaries'], (value) => {
        ctx.applyLiveTableShard(table, 'summary', value, mode)
      })
    )
    ctx.setSubscription(
      `table-live-draft-${table}`,
      subscribeShardRevision('draft', ['tableDrafts'], (value) => {
        ctx.applyLiveTableShard(table, 'draft', value, mode)
      })
    )
    ctx.setSubscription(
      `table-live-pending-${table}`,
      subscribeShardRevision('pendingBatches', ['pendingBatches'], (value) => {
        ctx.applyLiveTableShard(table, 'pendingBatches', value, mode)
      })
    )
    ctx.setSubscription(
      `table-live-submitted-${table}`,
      subscribeShardRevision('submittedBatches', ['submittedBatches'], (value) => {
        ctx.applyLiveTableShard(table, 'submittedBatches', value, mode)
      })
    )
  }

  function stopTableLiveSession() {
    const previousSession = ctx.currentTableSession
    if (ctx.currentTableSession) {
      ctx.clearSubscription(`table-live-summary-${ctx.currentTableSession.table}`)
      ctx.clearSubscription(`table-live-draft-${ctx.currentTableSession.table}`)
      ctx.clearSubscription(`table-live-pending-${ctx.currentTableSession.table}`)
      ctx.clearSubscription(`table-live-submitted-${ctx.currentTableSession.table}`)
    }
    ctx.currentTableSession = null
    if (previousSession?.mode === 'staff') {
      ctx.syncPendingBatchPreview(previousSession.table, ctx.getCachedLiveTable(previousSession.table).pendingBatches)
    }
    ctx.state.selectedTable = null
    ctx.state.activeDraftEntries = []
    ctx.state.activePendingBatches = []
    ctx.state.activeSubmittedBatches = []
  }

  return {
    readPendingBatchDetail,
    saveCustomerDraft,
    discardCustomerDraft,
    submitCustomerDraft,
    acceptPendingBatch,
    rejectPendingBatch,
    saveStaffDraft,
    createStaffBatch,
    updateSubmittedBatch,
    checkoutSubmittedBatches,
    startStaffLive,
    startTableLiveSession,
    stopTableLiveSession,
  }
}
