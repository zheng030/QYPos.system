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
import { decodeRtdbKeySegment, encodeRtdbKeySegment } from './rtdb-v3-key-codec'
import {
  buildPendingSummary,
  createEmptyLiveTable,
  getBizDateKey,
  mapStoredBatch,
  mapStoredEntry,
  resolveStoredBatchRequestSeq,
} from './rtdb-v3-mapper'
import type {
  V3BizDateKey,
  V3CatalogSegment,
  V3ClosedOrder,
  V3DailyItemStat,
  V3DailySummary,
  V3LiveTable,
  V3MonthKey,
  V3OrderBatch,
  V3PendingSummary,
  V3RevisionValue,
  V3TableSummary,
} from './rtdb-v3-types'
import { RTDB_V3_ROOT } from './rtdb-v3-types'

export type LiveMode = 'staff' | 'customer'

export type HistoryRange = {
  start: Date
  endExclusive: Date
}

type RepositoryDeps = {
  db: DatabaseCompat
  state: CorePosState
  helpers?: Pick<PosCatalogHelpers, 'getCanonicalDraftEntries' | 'normalizeEntryForDisplay'>
  onLiveStateChange?: (roots: string[]) => void
}

type AttendanceMonthMap = Record<string, AttendanceRecord>

function toRevValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function toBatchId(prefix: 'pending' | 'submitted') {
  const random = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now()}_${random}`
}

export function toOrderId() {
  const random = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10)
  return `ord_${Date.now()}_${random}`
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

export function createRtdbV3RepositoryContext({ db, state, helpers, onLiveStateChange }: RepositoryDeps) {
  const ctx = {
    db,
    state,
    helpers,
    onLiveStateChange,
    unsubs: new Map<string, () => void>(),
    revisionCache: new Map<string, V3RevisionValue>(),
    dailySummaryDayCache: new Map<V3BizDateKey, V3DailySummary>(),
    itemStatsDayCache: new Map<V3BizDateKey, Record<string, V3DailyItemStat>>(),
    historyDayCache: new Map<V3BizDateKey, Record<string, V3ClosedOrder>>(),
    attendanceMonthCache: new Map<V3MonthKey, AttendanceMonthMap>(),
    pendingSummaryCache: new Map<string, V3PendingSummary | null>(),
    attendanceRecordLocationCache: new Map<string, V3MonthKey>(),
    loadedCatalogSegments: new Set<V3CatalogSegment>(),
    catalogSegmentLoads: new Map<V3CatalogSegment, Promise<void>>(),
    attendanceEmployeesRev: -1,
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
    touchRevision(path: string, payload: Record<string, unknown>) {
      payload[`${RTDB_V3_ROOT}/meta/revisions/${path}`] = Date.now()
    },
    async updateRoot(payload: Record<string, unknown>) {
      if (Object.keys(payload).length === 0) return
      await db.ref('/').update(payload)
      const prefix = `${RTDB_V3_ROOT}/meta/revisions/`
      Object.entries(payload).forEach(([path, value]) => {
        if (path.startsWith(prefix)) {
          ctx.revisionCache.set(path.slice(prefix.length), toRevValue(value))
        }
      })
    },
    async readLiveTable(table: string) {
      const snapshot = await db.ref(`${RTDB_V3_ROOT}/live/tables/${encodeTableKey(table)}`).once('value')
      return normalizeLiveTable(snapshot.val() as V3LiveTable | null | undefined)
    },
    functionReadPendingBatchDetail: async (table: string, batchId: string): Promise<PosOrderBatch | null> => {
      const snapshot = await db
        .ref(`${RTDB_V3_ROOT}/live/tables/${encodeTableKey(table)}/pendingBatches/${encodeBatchMapKey(batchId)}`)
        .once('value')
      const stored = snapshot.val() as V3OrderBatch | null | undefined
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
    getPreviewBatch(summary: V3PendingSummary | null | undefined): PosPendingBatchPreview | null {
      if (!summary?.firstBatch) return null
      const firstBatch = summary.firstBatch
      return {
        batchId: firstBatch.batchId,
        requestSeq: readRequestSeqCounter(firstBatch.requestSeq),
        createdAt: firstBatch.createdAt,
        requestLabel: firstBatch.requestLabel,
        entries: firstBatch.itemPreview.map((item, index) => ({
          entryId: `preview_${firstBatch.batchId}_${index}`,
          title: typeof item === 'string' ? item : item.title,
          quantityLabel: typeof item === 'string' ? '1 份' : item.quantityLabel || '1 份',
        })),
      }
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
        delete state.tableStatuses[tableId]
        delete state.tableCustomers[tableId]
        delete state.tableBatchCounts[tableId]
        delete state.tableSplitCounters[tableId]
        return
      }
      if (summary.timerStartedAt) state.tableTimers[tableId] = summary.timerStartedAt
      else delete state.tableTimers[tableId]
      if (summary.status) state.tableStatuses[tableId] = summary.status
      else delete state.tableStatuses[tableId]
      state.tableCustomers[tableId] = {
        name: summary.customer?.name || '',
        phone: summary.customer?.phone || '',
        orderId: summary.displaySeqBase ?? undefined,
      }
      state.tableBatchCounts[tableId] = summary.batchCount ?? 0
      state.tableSplitCounters[tableId] = readSplitCounter(
        (summary as V3TableSummary & { nextSplitCounter?: unknown }).nextSplitCounter
      )
    },
    applyLiveTable(tableId: string, liveTable: V3LiveTable | null | undefined, mode?: LiveMode) {
      ctx.applyTableSummary(tableId, liveTable?.summary || null)
      const draft = ctx.toDraftEntries(liveTable)
      const pending = ctx.toBatchList(liveTable?.pendingBatches)
      const submitted = ctx.toBatchList(liveTable?.submittedBatches)

      if (draft.length > 0) state.tableDrafts[tableId] = draft
      else delete state.tableDrafts[tableId]
      if (pending.length > 0) state.pendingBatches[tableId] = pending
      else delete state.pendingBatches[tableId]
      if (submitted.length > 0) state.submittedBatches[tableId] = submitted
      else delete state.submittedBatches[tableId]

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
    applyPendingSummary(tableId: string, summary: V3PendingSummary | null | undefined) {
      ctx.pendingSummaryCache.set(tableId, summary || null)
      if (ctx.currentTableSession?.table === tableId) {
        return
      }
      const preview = ctx.getPreviewBatch(summary)
      if (preview) state.pendingBatchPreviews[tableId] = [preview]
      else if (!state.submittedBatches[tableId]) delete state.pendingBatchPreviews[tableId]
    },
    async persistLiveTable(table: string, liveTable: V3LiveTable | null) {
      const encodedTable = encodeTableKey(table)
      const payload: Record<string, unknown> = {
        [`${RTDB_V3_ROOT}/live/tables/${encodedTable}`]: liveTable,
        [`${RTDB_V3_ROOT}/live/tableSummaries/${encodedTable}`]: liveTable?.summary || null,
        [`${RTDB_V3_ROOT}/live/pendingSummaries/${encodedTable}`]:
          buildPendingSummary(liveTable?.pendingBatches) || null,
      }
      await ctx.updateRoot(payload)
      ctx.applyLiveTable(
        table,
        liveTable,
        ctx.currentTableSession?.table === table ? ctx.currentTableSession.mode : undefined
      )
    },
    async syncLiveTableDerivedState(table: string) {
      const liveTable = await ctx.readLiveTable(table)
      const encodedTable = encodeTableKey(table)
      const payload: Record<string, unknown> = {
        [`${RTDB_V3_ROOT}/live/tableSummaries/${encodedTable}`]: liveTable.summary || null,
        [`${RTDB_V3_ROOT}/live/pendingSummaries/${encodedTable}`]:
          buildPendingSummary(liveTable.pendingBatches) || null,
      }
      await ctx.updateRoot(payload)
      ctx.applyLiveTable(
        table,
        liveTable,
        ctx.currentTableSession?.table === table ? ctx.currentTableSession.mode : undefined
      )
      return liveTable
    },
    async transactLiveTable(table: string, updater: (current: V3LiveTable) => V3LiveTable) {
      await db
        .ref(`${RTDB_V3_ROOT}/live/tables/${encodeTableKey(table)}`)
        .transaction<V3LiveTable>((currentValue) =>
          updater(normalizeLiveTable(currentValue as V3LiveTable | null | undefined))
        )
      return ctx.syncLiveTableDerivedState(table)
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

      const liveTable = await ctx.readLiveTable(table)
      const remote = readDisplaySeqBase(liveTable.summary)
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
