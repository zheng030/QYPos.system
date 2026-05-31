import type { PosOrderBatch, PosOrderEntry, PosTableCustomer } from '@/features/pos-kernel/types'
import {
  buildLiveTable,
  buildPendingSummary,
  mapBatchToStored,
  mapStoredBatch,
  orderRecordToPosOrder,
  toClosedOrderRecord,
} from './rtdb-v3-mapper'
import {
  cloneCustomer,
  decodeTableKey,
  encodeBatchMapKey,
  encodeTableKey,
  type LiveMode,
  normalizeLiveTable,
  type RtdbV3RepositoryContext,
  readSplitCounter,
  sortEntries,
  sumEntries,
  toBatchId,
  toOrderId,
} from './rtdb-v3-repository-context'
import type { V3BizDateKey, V3LiveTable, V3PendingSummary, V3TableSummary } from './rtdb-v3-types'
import { RTDB_V3_ROOT } from './rtdb-v3-types'

export function createRtdbV3RepositoryLiveModule(
  ctx: RtdbV3RepositoryContext,
  deps: { rebuildDayReports: (bizDate: V3BizDateKey) => Promise<void> }
) {
  async function saveCustomerDraft(table: string, entries: PosOrderEntry[], customerInput: PosTableCustomer) {
    const displaySeqBase = await ctx.ensureDisplaySeqBase(table, customerInput)
    const customer = cloneCustomer(customerInput)
    customer.orderId = displaySeqBase
    ctx.state.tableCustomers[table] = customer
    ctx.state.tableTimers[table] ||= Date.now()
    const updatedAt = Date.now()
    const nextDraft = ctx.canonicalizeDraftEntries(
      entries.map((entry) => ({ ...entry, status: 'draft', source: 'customer', updatedAt }))
    )
    await ctx.transactLiveTable(table, (liveTable) =>
      buildLiveTable({
        draft: nextDraft,
        pendingBatches: ctx.toBatchList(liveTable.pendingBatches),
        submittedBatches: ctx.toBatchList(liveTable.submittedBatches),
        status:
          entries.length > 0 ||
          Object.keys(liveTable.pendingBatches).length > 0 ||
          Object.keys(liveTable.submittedBatches).length > 0
            ? 'yellow'
            : undefined,
        timerStartedAt: ctx.state.tableTimers[table],
        batchCount: Object.keys(liveTable.submittedBatches).length,
        nextRequestSeq: ctx.readNextRequestSeq(liveTable),
        nextSplitCounter: readSplitCounter(liveTable.summary?.nextSplitCounter),
        customer,
        updatedAt,
      })
    )
    return { displaySeqBase }
  }

  async function discardCustomerDraft(table: string) {
    const updatedAt = Date.now()
    await ctx.transactLiveTable(table, (liveTable) =>
      buildLiveTable({
        draft: [],
        pendingBatches: ctx.toBatchList(liveTable.pendingBatches),
        submittedBatches: ctx.toBatchList(liveTable.submittedBatches),
        status:
          Object.keys(liveTable.pendingBatches).length > 0 || Object.keys(liveTable.submittedBatches).length > 0
            ? 'yellow'
            : undefined,
        timerStartedAt: ctx.state.tableTimers[table],
        batchCount: Object.keys(liveTable.submittedBatches).length,
        nextRequestSeq: ctx.readNextRequestSeq(liveTable),
        nextSplitCounter: readSplitCounter(liveTable.summary?.nextSplitCounter),
        customer: ctx.state.tableCustomers[table],
        updatedAt,
      })
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
    const createdAt = Date.now()
    let batch: PosOrderBatch | null = null
    await ctx.transactLiveTable(table, (liveTable) => {
      const requestSeq = ctx.readNextRequestSeq(liveTable)
      batch = {
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
      }
      const nextPending = ctx.toBatchList(liveTable.pendingBatches)
      nextPending.push(batch)
      return buildLiveTable({
        draft: [],
        pendingBatches: nextPending,
        submittedBatches: ctx.toBatchList(liveTable.submittedBatches),
        status: 'yellow',
        timerStartedAt: ctx.state.tableTimers[table] || createdAt,
        batchCount: Object.keys(liveTable.submittedBatches).length,
        nextRequestSeq: requestSeq + 1,
        nextSplitCounter: readSplitCounter(liveTable.summary?.nextSplitCounter),
        customer,
        updatedAt: createdAt,
      })
    })
    if (!batch) {
      throw new Error('Failed to create pending batch')
    }
    return batch as PosOrderBatch
  }

  async function readPendingBatchDetail(table: string, batchId: string) {
    return ctx.functionReadPendingBatchDetail(table, batchId)
  }

  async function acceptPendingBatch(table: string, batchId: string): Promise<PosOrderBatch | null> {
    let accepted: PosOrderBatch | null = null
    await ctx.transactLiveTable(table, (liveTable) => {
      const target = liveTable.pendingBatches[encodeBatchMapKey(batchId)]
      if (!target) {
        return liveTable
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
      accepted = acceptedBatch
      const nextPending = ctx.toBatchList(
        Object.fromEntries(Object.entries(liveTable.pendingBatches).filter(([id]) => id !== batchId))
      )
      const nextSubmitted = ctx.toBatchList(liveTable.submittedBatches)
      nextSubmitted.push(acceptedBatch)
      return buildLiveTable({
        draft: ctx.toDraftEntries(liveTable),
        pendingBatches: nextPending,
        submittedBatches: nextSubmitted,
        status: 'yellow',
        timerStartedAt: ctx.state.tableTimers[table],
        batchCount: nextSubmitted.length,
        nextRequestSeq: ctx.readNextRequestSeq(liveTable),
        nextSplitCounter: readSplitCounter(liveTable.summary?.nextSplitCounter),
        customer: ctx.state.tableCustomers[table],
        updatedAt: acceptedBatch.updatedAt,
      })
    })
    return accepted
  }

  async function rejectPendingBatch(table: string, batchId: string) {
    await ctx.transactLiveTable(table, (liveTable) => {
      const target = liveTable.pendingBatches[encodeBatchMapKey(batchId)]
      if (!target) {
        return liveTable
      }
      const rejected = mapStoredBatch(target, ctx.helpers?.normalizeEntryForDisplay)
      const currentDraft = ctx.toDraftEntries(liveTable)
      const returnedEntries = rejected.entries.map((entry) => ({
        ...entry,
        status: 'draft' as const,
        updatedAt: Date.now(),
      }))
      const nextDraft = ctx.canonicalizeDraftEntries([...currentDraft, ...returnedEntries])
      const nextPending = ctx.toBatchList(
        Object.fromEntries(Object.entries(liveTable.pendingBatches).filter(([id]) => id !== batchId))
      )
      return buildLiveTable({
        draft: nextDraft,
        pendingBatches: nextPending,
        submittedBatches: ctx.toBatchList(liveTable.submittedBatches),
        status: 'yellow',
        timerStartedAt: ctx.state.tableTimers[table],
        batchCount: Object.keys(liveTable.submittedBatches).length,
        nextRequestSeq: ctx.readNextRequestSeq(liveTable),
        nextSplitCounter: readSplitCounter(liveTable.summary?.nextSplitCounter),
        customer: ctx.state.tableCustomers[table],
        updatedAt: Date.now(),
      })
    })
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
    let batch: PosOrderBatch | null = null
    await ctx.transactLiveTable(table, (liveTable) => {
      const requestSeq = ctx.readNextRequestSeq(liveTable)
      const nextSplitCounter = readSplitCounter(liveTable.summary?.nextSplitCounter)
      batch = {
        batchId: toBatchId('submitted'),
        source: 'staff',
        status: 'accepted',
        table,
        customer: { ...cloneCustomer(customer || ctx.state.tableCustomers[table]), orderId: displaySeqBase },
        createdAt,
        updatedAt: createdAt,
        acceptedAt: createdAt,
        requestSeq,
        requestLabel: ctx.buildRequestLabel(displaySeqBase, requestSeq),
        entries: sortEntries(
          entries.map((entry) => ({ ...entry, source: 'staff', status: 'accepted', updatedAt: createdAt }))
        ),
        subtotal: sumEntries(entries),
      }
      const nextSubmitted = ctx.toBatchList(liveTable.submittedBatches)
      nextSubmitted.push(batch)
      ctx.state.staffDrafts[table] = []
      return buildLiveTable({
        draft: ctx.toDraftEntries(liveTable),
        pendingBatches: ctx.toBatchList(liveTable.pendingBatches),
        submittedBatches: nextSubmitted,
        status: 'yellow',
        timerStartedAt: ctx.state.tableTimers[table] || createdAt,
        batchCount: nextSubmitted.length,
        nextRequestSeq: requestSeq + 1,
        nextSplitCounter,
        customer: batch.customer,
        updatedAt: createdAt,
      })
    })
    if (!batch) {
      throw new Error('Failed to create submitted batch')
    }
    return batch as PosOrderBatch
  }

  async function updateSubmittedBatch(
    table: string,
    batchId: string,
    entries: PosOrderEntry[]
  ): Promise<PosOrderBatch | null> {
    let nextBatch: PosOrderBatch | null = null
    await ctx.transactLiveTable(table, (liveTable) => {
      const stored = liveTable.submittedBatches[encodeBatchMapKey(batchId)]
      if (!stored) {
        return liveTable
      }
      const current = mapStoredBatch(stored, ctx.helpers?.normalizeEntryForDisplay)
      const updatedAt = Date.now()
      const nextSplitCounter = readSplitCounter(liveTable.summary?.nextSplitCounter)
      if (entries.length === 0) {
        const nextSubmitted = ctx.toBatchList(
          Object.fromEntries(
            Object.entries(liveTable.submittedBatches).filter(([id]) => id !== encodeBatchMapKey(batchId))
          )
        )
        return buildLiveTable({
          draft: ctx.toDraftEntries(liveTable),
          pendingBatches: ctx.toBatchList(liveTable.pendingBatches),
          submittedBatches: nextSubmitted,
          status: 'yellow',
          timerStartedAt: ctx.state.tableTimers[table],
          batchCount: nextSubmitted.length,
          nextRequestSeq: ctx.readNextRequestSeq(liveTable),
          nextSplitCounter,
          customer: ctx.state.tableCustomers[table],
          updatedAt,
        })
      }
      nextBatch = {
        ...current,
        updatedAt,
        entries: sortEntries(entries.map((entry) => ({ ...entry, status: 'accepted', updatedAt }))),
        subtotal: sumEntries(entries),
      }
      const nextSubmitted = ctx.toBatchList({
        ...liveTable.submittedBatches,
        [batchId]: mapBatchToStored(nextBatch),
      })
      return buildLiveTable({
        draft: ctx.toDraftEntries(liveTable),
        pendingBatches: ctx.toBatchList(liveTable.pendingBatches),
        submittedBatches: nextSubmitted,
        status: 'yellow',
        timerStartedAt: ctx.state.tableTimers[table],
        batchCount: nextSubmitted.length,
        nextRequestSeq: ctx.readNextRequestSeq(liveTable),
        nextSplitCounter,
        customer: ctx.state.tableCustomers[table],
        updatedAt,
      })
    })
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
    const liveTable = await ctx.readLiveTable(payload.table)
    const displaySeqBase = await ctx.ensureDisplaySeqBase(payload.table, payload.customer)
    const closedAt = Date.now()
    const orderId = toOrderId()
    const submittedBatches = ctx.toBatchList(liveTable.submittedBatches)
    const requestedEntryIds = new Set(payload.entryIds || [])
    const fallbackEntries = payload.entries || []
    const selectedEntries =
      requestedEntryIds.size > 0
        ? submittedBatches.flatMap((batch) => batch.entries.filter((entry) => requestedEntryIds.has(entry.entryId)))
        : fallbackEntries
    if (selectedEntries.length === 0) {
      throw new Error('No submitted entries selected for checkout')
    }

    const selectedEntryIds = new Set(selectedEntries.map((entry) => entry.entryId))
    const selectedBatchIds = submittedBatches
      .filter((batch) => batch.entries.some((entry) => selectedEntryIds.has(entry.entryId)))
      .map((batch) => batch.batchId)
    const splitCounter =
      selectedEntries.length === submittedBatches.flatMap((batch) => batch.entries).length
        ? null
        : readSplitCounter(liveTable.summary?.nextSplitCounter)
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
    const monthKey = orderRecord.monthKey
    const remainingSubmitted = submittedBatches
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
    const payloadUpdate: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/history/ordersByMonth/${monthKey}/${bizDate}/${orderId}`]: orderRecord,
    }
    if (isFullCheckout) {
      payloadUpdate[`${RTDB_V3_ROOT}/live/tables/${payload.table}`] = null
      payloadUpdate[`${RTDB_V3_ROOT}/live/tableSummaries/${payload.table}`] = null
      payloadUpdate[`${RTDB_V3_ROOT}/live/pendingSummaries/${payload.table}`] = null
    } else {
      const nextLive = buildLiveTable({
        draft: [],
        pendingBatches: [],
        submittedBatches: remainingSubmitted,
        status: 'yellow',
        timerStartedAt: ctx.state.tableTimers[payload.table],
        batchCount: remainingSubmitted.length,
        nextRequestSeq: ctx.readNextRequestSeq(liveTable),
        nextSplitCounter: readSplitCounter(liveTable.summary?.nextSplitCounter) + 1,
        customer: ctx.state.tableCustomers[payload.table] || payload.customer,
        updatedAt: closedAt,
      })
      payloadUpdate[`${RTDB_V3_ROOT}/live/tables/${payload.table}`] = nextLive
      payloadUpdate[`${RTDB_V3_ROOT}/live/tableSummaries/${payload.table}`] = nextLive.summary
      payloadUpdate[`${RTDB_V3_ROOT}/live/pendingSummaries/${payload.table}`] =
        buildPendingSummary(nextLive.pendingBatches) || null
    }

    ctx.touchRevision(`history/ordersByDay/${bizDate}`, payloadUpdate)
    await ctx.updateRoot(payloadUpdate)
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
      delete ctx.state.tableBatchCounts[payload.table]
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
      ctx.state.tableBatchCounts[payload.table] = remainingSubmitted.length
      ctx.state.tableSplitCounters[payload.table] = readSplitCounter(liveTable.summary?.nextSplitCounter) + 1
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
    const summariesPath = `${RTDB_V3_ROOT}/live/tableSummaries`
    const pendingPath = `${RTDB_V3_ROOT}/live/pendingSummaries`
    ctx.setSubscription(
      'staff-table-added',
      ctx.db.ref(summariesPath).on('child_added', (child) => {
        const tableId = child.key()
        if (!tableId) return
        ctx.applyTableSummary(decodeTableKey(tableId), (child.val() || null) as V3TableSummary | null)
        ctx.notifyLiveStateChange(['tableSummaries'])
      }) as () => void
    )
    ctx.setSubscription(
      'staff-table-changed',
      ctx.db.ref(summariesPath).on('child_changed', (child) => {
        const tableId = child.key()
        if (!tableId) return
        ctx.applyTableSummary(decodeTableKey(tableId), (child.val() || null) as V3TableSummary | null)
        ctx.notifyLiveStateChange(['tableSummaries'])
      }) as () => void
    )
    ctx.setSubscription(
      'staff-table-removed',
      ctx.db.ref(summariesPath).on('child_removed', (child) => {
        const tableId = child.key()
        if (!tableId) return
        const decodedTableId = decodeTableKey(tableId)
        ctx.applyTableSummary(decodedTableId, null)
        delete ctx.state.tableDrafts[decodedTableId]
        delete ctx.state.pendingBatchPreviews[decodedTableId]
        delete ctx.state.pendingBatches[decodedTableId]
        delete ctx.state.submittedBatches[decodedTableId]
        ctx.notifyLiveStateChange(['tableSummaries'])
      }) as () => void
    )
    ctx.setSubscription(
      'staff-pending-added',
      ctx.db.ref(pendingPath).on('child_added', (child) => {
        const tableId = child.key()
        if (!tableId) return
        ctx.applyPendingSummary(decodeTableKey(tableId), (child.val() || null) as V3PendingSummary | null)
        ctx.notifyLiveStateChange(['pendingBatches'])
      }) as () => void
    )
    ctx.setSubscription(
      'staff-pending-changed',
      ctx.db.ref(pendingPath).on('child_changed', (child) => {
        const tableId = child.key()
        if (!tableId) return
        ctx.applyPendingSummary(decodeTableKey(tableId), (child.val() || null) as V3PendingSummary | null)
        ctx.notifyLiveStateChange(['pendingBatches'])
      }) as () => void
    )
    ctx.setSubscription(
      'staff-pending-removed',
      ctx.db.ref(pendingPath).on('child_removed', (child) => {
        const tableId = child.key()
        if (!tableId) return
        ctx.applyPendingSummary(decodeTableKey(tableId), null)
        ctx.notifyLiveStateChange(['pendingBatches'])
      }) as () => void
    )
  }

  async function startTableLiveSession(mode: LiveMode, table: string) {
    stopTableLiveSession()
    ctx.currentTableSession = { table, mode }
    ctx.state.selectedTable = table
    ctx.state.currentMode = mode
    const liveTable = await ctx.readLiveTable(table)
    ctx.applyLiveTable(table, liveTable, mode)
    ctx.setSubscription(
      `table-live-${table}`,
      ctx.db.ref(`${RTDB_V3_ROOT}/live/tables/${encodeTableKey(table)}`).on('value', (snapshot) => {
        const next = normalizeLiveTable(snapshot.val() as V3LiveTable | null | undefined)
        ctx.applyLiveTable(table, next, mode)
        ctx.notifyLiveStateChange(['tableDrafts', 'pendingBatches', 'submittedBatches'])
      }) as () => void
    )
  }

  function stopTableLiveSession() {
    if (ctx.currentTableSession) {
      ctx.clearSubscription(`table-live-${ctx.currentTableSession.table}`)
    }
    ctx.currentTableSession = null
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
