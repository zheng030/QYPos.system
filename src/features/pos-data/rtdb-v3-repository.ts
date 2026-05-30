import type {
  CorePosState,
  PosOrder,
  PosOrderBatch,
  PosOrderEntry,
  PosOwnerAuthMap,
  PosOwnerAuthRecord,
  PosTableCustomer,
} from '@/features/pos-kernel/types'
import type { AttendanceEmployee, AttendanceRecord } from '@/shared/attendance-service'
import type { DatabaseCompat } from '@/shared/firebase-compat'
import { decodeRtdbKeySegment, encodeRtdbKeySegment } from './rtdb-v3-key-codec'
import {
  buildLiveTable,
  buildPendingSummary,
  buildSummaryFromClosedOrders,
  createEmptyLiveTable,
  getBizDateKey,
  getBizDateKeysBetween,
  getMonthKey,
  getMonthKeyFromBizDate,
  mapBatchToStored,
  mapStoredBatch,
  mapStoredEntry,
  orderRecordToPosOrder,
  toClosedOrderRecord,
} from './rtdb-v3-mapper'
import type {
  V3AttendanceWindowEvent,
  V3BizDateKey,
  V3CatalogRevisionEvent,
  V3CatalogSegment,
  V3ClosedOrder,
  V3DailyItemStat,
  V3DailySummary,
  V3DailySummaryRangeEvent,
  V3HistoryRangeEvent,
  V3ItemStatsRangeEvent,
  V3LiveTable,
  V3MonthKey,
  V3OrderBatch,
  V3OwnerAuthRevisionEvent,
  V3PendingSummary,
  V3RevisionValue,
  V3TableSummary,
} from './rtdb-v3-types'
import { RTDB_V3_ROOT } from './rtdb-v3-types'

type LiveMode = 'staff' | 'customer'

type HistoryRange = {
  start: Date
  endExclusive: Date
}

type RepositoryDeps = {
  db: DatabaseCompat
  state: CorePosState
  onLiveStateChange?: (roots: string[]) => void
}

type AttendanceMonthMap = Record<string, AttendanceRecord>

function toRevValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function toBatchId(prefix: 'pending' | 'submitted') {
  const random = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now()}_${random}`
}

function toOrderId() {
  const random = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10)
  return `ord_${Date.now()}_${random}`
}

function readDisplaySeqBase(summary: V3TableSummary | null | undefined) {
  return Number(summary?.displaySeqBase || 0) || 0
}

function cloneCustomer(customer: PosTableCustomer | undefined): PosTableCustomer {
  return {
    name: customer?.name || '',
    phone: customer?.phone || '',
    orderId: customer?.orderId,
  }
}

function sortEntries(entries: PosOrderEntry[]) {
  return [...entries].sort(
    (left, right) => left.createdAt - right.createdAt || left.entryId.localeCompare(right.entryId)
  )
}

function sumEntries(entries: PosOrderEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.subtotal, 0)
}

function readSplitCounter(value: unknown) {
  const counter = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : 0
  return Number.isFinite(counter) && counter > 0 ? counter : 1
}

function normalizeLiveTable(value: V3LiveTable | null | undefined) {
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

function encodeTableKey(table: string) {
  return encodeRtdbKeySegment(table)
}

function decodeTableKey(table: string) {
  return decodeRtdbKeySegment(table)
}

function encodeCatalogKey(key: string) {
  return encodeRtdbKeySegment(key)
}

function decodeCatalogRecord<T>(value: Record<string, T> | null | undefined) {
  return Object.fromEntries(
    Object.entries(value || {}).map(([key, entry]) => [decodeRtdbKeySegment(key), entry])
  ) as Record<string, T>
}

function decodeItemStatsRecord(value: Record<string, V3DailyItemStat> | null | undefined) {
  return Object.fromEntries(
    Object.entries(value || {}).map(([key, entry]) => [decodeRtdbKeySegment(key), entry])
  ) as Record<string, V3DailyItemStat>
}

function encodeBatchMapKey(id: string) {
  return encodeRtdbKeySegment(id)
}

function encodeItemStatsRecord(value: Record<string, V3DailyItemStat> | null | undefined) {
  if (!value) return null
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [encodeRtdbKeySegment(key), entry])) as Record<
    string,
    V3DailyItemStat
  >
}

export function createRtdbV3Repository({ db, state, onLiveStateChange }: RepositoryDeps) {
  const unsubs = new Map<string, () => void>()
  const revisionCache = new Map<string, V3RevisionValue>()
  const dailySummaryDayCache = new Map<V3BizDateKey, V3DailySummary>()
  const itemStatsDayCache = new Map<V3BizDateKey, Record<string, V3DailyItemStat>>()
  const historyDayCache = new Map<V3BizDateKey, Record<string, V3ClosedOrder>>()
  const attendanceMonthCache = new Map<V3MonthKey, AttendanceMonthMap>()
  const pendingSummaryCache = new Map<string, V3PendingSummary | null>()
  const attendanceRecordLocationCache = new Map<string, V3MonthKey>()
  const loadedCatalogSegments = new Set<V3CatalogSegment>()
  const catalogSegmentLoads = new Map<V3CatalogSegment, Promise<void>>()
  let attendanceEmployeesRev = -1
  let activeAttendanceMonths = new Set<V3MonthKey>()
  let ownerAuthLoaded = false
  let ownerAuthLoad: Promise<void> | null = null
  let staffLiveStarted = false
  let currentTableSession: { table: string; mode: LiveMode } | null = null

  function notifyLiveStateChange(roots: string[]) {
    onLiveStateChange?.(roots)
  }

  function clearSubscription(key: string) {
    unsubs.get(key)?.()
    unsubs.delete(key)
  }

  function setSubscription(key: string, unsubscribe: (() => void) | undefined) {
    clearSubscription(key)
    if (unsubscribe) {
      unsubs.set(key, unsubscribe)
    }
  }

  function touchRevision(path: string, payload: Record<string, unknown>) {
    payload[`${RTDB_V3_ROOT}/meta/revisions/${path}`] = Date.now()
  }

  async function updateRoot(payload: Record<string, unknown>) {
    if (Object.keys(payload).length === 0) return
    await db.ref('/').update(payload)
    const prefix = `${RTDB_V3_ROOT}/meta/revisions/`
    Object.entries(payload).forEach(([path, value]) => {
      if (path.startsWith(prefix)) {
        revisionCache.set(path.slice(prefix.length), toRevValue(value))
      }
    })
  }

  async function readLiveTable(table: string) {
    const snapshot = await db.ref(`${RTDB_V3_ROOT}/live/tables/${encodeTableKey(table)}`).once('value')
    return normalizeLiveTable(snapshot.val() as V3LiveTable | null | undefined)
  }

  function toDraftEntries(liveTable: V3LiveTable | null | undefined) {
    return Object.values(liveTable?.draft || {})
      .map((entry) => mapStoredEntry(entry))
      .sort((left, right) => left.createdAt - right.createdAt)
  }

  function toBatchList(value: Record<string, V3OrderBatch> | undefined) {
    return Object.values(value || {})
      .map((batch) => mapStoredBatch(batch))
      .sort((left, right) => left.createdAt - right.createdAt)
  }

  function getPreviewBatch(summary: V3PendingSummary | null | undefined): PosOrderBatch | null {
    if (!summary?.firstBatch) return null
    const firstBatch = summary.firstBatch
    return {
      batchId: firstBatch.batchId,
      source: 'customer',
      status: 'pending',
      table: '',
      customer: {},
      createdAt: firstBatch.createdAt,
      updatedAt: firstBatch.createdAt,
      requestLabel: firstBatch.requestLabel,
      entries: firstBatch.itemPreview.map((name, index) => ({
        entryId: `preview_${firstBatch.batchId}_${index}`,
        groupId: `preview_${firstBatch.batchId}_${index}`,
        itemId: `preview_${index}`,
        catalogKey: `preview_${index}`,
        inventoryKey: `preview_${index}`,
        itemName: name,
        shortName: name,
        categoryKey: 'a_la_carte',
        quantity: 1,
        status: 'pending',
        source: 'customer',
        createdAt: firstBatch.createdAt,
        updatedAt: firstBatch.createdAt,
        selections: {},
        includeSelections: {},
        upgradeSelections: {},
        lines: [],
        subtotal: 0,
        summary: {
          title: name,
          subtitle: '',
          quantityLabel: '1 份',
          totalLabel: '$0',
        },
      })),
      subtotal: 0,
    }
  }

  function applyTableSummary(tableId: string, summary: V3TableSummary | null | undefined) {
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
  }

  function applyLiveTable(tableId: string, liveTable: V3LiveTable | null | undefined, mode?: LiveMode) {
    applyTableSummary(tableId, liveTable?.summary || null)

    const draft = toDraftEntries(liveTable)
    const pending = toBatchList(liveTable?.pendingBatches)
    const submitted = toBatchList(liveTable?.submittedBatches)

    if (draft.length > 0) state.tableDrafts[tableId] = draft
    else delete state.tableDrafts[tableId]
    if (pending.length > 0) state.pendingBatches[tableId] = pending
    else delete state.pendingBatches[tableId]
    if (submitted.length > 0) state.submittedBatches[tableId] = submitted
    else delete state.submittedBatches[tableId]

    if (currentTableSession?.table === tableId) {
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
  }

  function applyPendingSummary(tableId: string, summary: V3PendingSummary | null | undefined) {
    pendingSummaryCache.set(tableId, summary || null)
    if (currentTableSession?.table === tableId) {
      return
    }
    const preview = getPreviewBatch(summary)
    if (preview) state.pendingBatches[tableId] = [preview]
    else if (!state.submittedBatches[tableId]) delete state.pendingBatches[tableId]
  }

  async function _persistLiveTable(table: string, liveTable: V3LiveTable | null) {
    const encodedTable = encodeTableKey(table)
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/live/tables/${encodedTable}`]: liveTable,
      [`${RTDB_V3_ROOT}/live/tableSummaries/${encodedTable}`]: liveTable?.summary || null,
      [`${RTDB_V3_ROOT}/live/pendingSummaries/${encodedTable}`]: buildPendingSummary(liveTable?.pendingBatches) || null,
    }
    await updateRoot(payload)
    applyLiveTable(table, liveTable, currentTableSession?.table === table ? currentTableSession.mode : undefined)
  }

  async function syncLiveTableDerivedState(table: string) {
    const liveTable = await readLiveTable(table)
    const encodedTable = encodeTableKey(table)
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/live/tableSummaries/${encodedTable}`]: liveTable.summary || null,
      [`${RTDB_V3_ROOT}/live/pendingSummaries/${encodedTable}`]: buildPendingSummary(liveTable.pendingBatches) || null,
    }
    await updateRoot(payload)
    applyLiveTable(table, liveTable, currentTableSession?.table === table ? currentTableSession.mode : undefined)
    return liveTable
  }

  async function transactLiveTable(table: string, updater: (current: V3LiveTable) => V3LiveTable) {
    await db
      .ref(`${RTDB_V3_ROOT}/live/tables/${encodeTableKey(table)}`)
      .transaction<V3LiveTable>((currentValue) =>
        updater(normalizeLiveTable(currentValue as V3LiveTable | null | undefined))
      )
    return syncLiveTableDerivedState(table)
  }

  async function reserveDisplaySeqBase(value = Date.now()) {
    const bizDate = getBizDateKey(value)
    const ref = db.ref(`${RTDB_V3_ROOT}/history/sequenceByDate/${bizDate}/nextDisplaySeq`)
    const tx = await ref.transaction<number>((current) => (current || 1) + 1)
    const next = Number(tx.snapshot.val()) || 2
    return {
      bizDate,
      displaySeqBase: Math.max(1, next - 1),
    }
  }

  async function ensureDisplaySeqBase(table: string, customer: PosTableCustomer | undefined) {
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

    const liveTable = await readLiveTable(table)
    const remote = readDisplaySeqBase(liveTable.summary)
    if (remote > 0) {
      state.tableCustomers[table] = { ...cloneCustomer(customer), orderId: remote }
      return remote
    }

    const reserved = await reserveDisplaySeqBase()
    state.tableCustomers[table] = { ...cloneCustomer(customer), orderId: reserved.displaySeqBase }
    return reserved.displaySeqBase
  }

  async function fetchCatalogSegment(segment: V3CatalogSegment) {
    const snapshot = await db.ref(`${RTDB_V3_ROOT}/catalog/${segment}`).once('value')
    const value = snapshot.val() || {}
    if (segment === 'inventory') {
      state.inventory = decodeCatalogRecord(value as Record<string, boolean>)
    } else if (segment === 'prices') {
      state.itemPrices = Object.fromEntries(
        Object.entries(decodeCatalogRecord(value as Record<string, number | string>)).map(([key, entry]) => [
          key,
          Number(entry),
        ])
      )
    } else {
      state.itemCosts = decodeCatalogRecord(value as Record<string, number>)
    }
    loadedCatalogSegments.add(segment)
  }

  async function ensureCatalogSegment(segment: V3CatalogSegment) {
    if (loadedCatalogSegments.has(segment)) {
      return
    }
    const existingLoad = catalogSegmentLoads.get(segment)
    if (existingLoad) {
      await existingLoad
      return
    }
    const load = fetchCatalogSegment(segment).finally(() => {
      catalogSegmentLoads.delete(segment)
    })
    catalogSegmentLoads.set(segment, load)
    await load
  }

  async function ensureCatalog() {
    await Promise.all([
      ensureCatalogSegment('inventory'),
      ensureCatalogSegment('prices'),
      ensureCatalogSegment('costs'),
    ])
  }

  async function fetchOwnerAuth() {
    const snapshot = await db.ref(`${RTDB_V3_ROOT}/auth/owners`).once('value')
    state.ownerPasswords = { ...((snapshot.val() || {}) as PosOwnerAuthMap) }
    ownerAuthLoaded = true
  }

  async function ensureOwnerAuth() {
    if (ownerAuthLoaded) return
    ownerAuthLoad ||= fetchOwnerAuth().finally(() => {
      ownerAuthLoad = null
    })
    await ownerAuthLoad
  }

  async function fetchAttendanceEmployees() {
    const snapshot = await db.ref(`${RTDB_V3_ROOT}/attendance/employees`).once('value')
    state.attendanceEmployees = { ...((snapshot.val() || {}) as Record<string, AttendanceEmployee>) }
  }

  function replaceAttendanceMonth(monthKey: V3MonthKey, records: AttendanceMonthMap) {
    const previous = attendanceMonthCache.get(monthKey) || {}
    for (const recordId of Object.keys(previous)) {
      if (!(recordId in records)) {
        attendanceRecordLocationCache.delete(recordId)
      }
    }
    for (const recordId of Object.keys(records)) {
      attendanceRecordLocationCache.set(recordId, monthKey)
    }
    attendanceMonthCache.set(monthKey, records)
  }

  function rebuildAttendanceState() {
    state.attendanceRecords = {}
    for (const monthKey of activeAttendanceMonths) {
      Object.assign(state.attendanceRecords, attendanceMonthCache.get(monthKey) || {})
    }
  }

  async function ensureAttendanceEmployees() {
    if (attendanceEmployeesRev >= 0 || Object.keys(state.attendanceEmployees).length > 0) {
      return
    }
    await fetchAttendanceEmployees()
    attendanceEmployeesRev = Date.now()
  }

  async function ensureAttendanceMonth(monthKey: V3MonthKey) {
    if (attendanceMonthCache.has(monthKey)) {
      return
    }
    const snapshot = await db.ref(`${RTDB_V3_ROOT}/attendance/recordsByMonth/${monthKey}`).once('value')
    replaceAttendanceMonth(monthKey, { ...((snapshot.val() || {}) as AttendanceMonthMap) })
  }

  async function ensureAttendanceWindow(monthKeys: string[]) {
    await ensureAttendanceEmployees()
    const normalized = [...new Set(monthKeys.filter(Boolean))] as V3MonthKey[]
    await Promise.all(normalized.map((monthKey) => ensureAttendanceMonth(monthKey)))
    activeAttendanceMonths = new Set(normalized)
    rebuildAttendanceState()
  }

  async function ensureAttendanceFullHistory() {
    await ensureAttendanceEmployees()
    const revisionSnapshot = await db.ref(`${RTDB_V3_ROOT}/meta/revisions/attendance/recordsByMonth`).once('value')
    const monthKeys = Object.keys((revisionSnapshot.val() || {}) as Record<string, unknown>) as V3MonthKey[]
    await Promise.all(monthKeys.map((monthKey) => ensureAttendanceMonth(monthKey)))
    activeAttendanceMonths = new Set(monthKeys)
    rebuildAttendanceState()
  }

  function watchAttendanceWindow(monthKeys: string[], onInvalidate: (event: V3AttendanceWindowEvent) => void) {
    const normalized = [...new Set(monthKeys.filter(Boolean))] as V3MonthKey[]
    activeAttendanceMonths = new Set(normalized)
    rebuildAttendanceState()
    const stops = [
      db.ref(`${RTDB_V3_ROOT}/meta/revisions/attendance/employees`).on('value', () => {
        void fetchAttendanceEmployees().then(() => {
          attendanceEmployeesRev = Date.now()
          onInvalidate({
            kind: 'attendance-window',
            changedMonthKeys: [],
            employeesChanged: true,
          })
        })
      }) as () => void,
      ...normalized.map(
        (monthKey) =>
          db.ref(`${RTDB_V3_ROOT}/meta/revisions/attendance/recordsByMonth/${monthKey}`).on('value', () => {
            void db
              .ref(`${RTDB_V3_ROOT}/attendance/recordsByMonth/${monthKey}`)
              .once('value')
              .then((snapshot) => {
                replaceAttendanceMonth(monthKey, { ...((snapshot.val() || {}) as AttendanceMonthMap) })
              })
              .then(() => {
                rebuildAttendanceState()
                onInvalidate({
                  kind: 'attendance-window',
                  changedMonthKeys: [monthKey],
                  employeesChanged: false,
                })
              })
          }) as () => void
      ),
    ]
    return () => {
      stops.forEach((stop) => {
        stop()
      })
    }
  }

  async function saveAttendanceUpdates(updates: Record<string, unknown>) {
    const payload: Record<string, unknown> = {}
    const employeeUpdates = new Map<string, AttendanceEmployee | null>()
    const monthUpdates = new Map<V3MonthKey, AttendanceMonthMap>()
    const touchedMonths = new Set<V3MonthKey>()
    let touchedEmployees = false

    for (const [path, value] of Object.entries(updates)) {
      const [root, key] = path.split('/')
      if (!key) continue

      if (root === 'attendanceEmployees') {
        payload[`${RTDB_V3_ROOT}/attendance/employees/${key}`] = value
        employeeUpdates.set(key, value === null ? null : (value as AttendanceEmployee))
        touchedEmployees = true
        continue
      }

      if (root !== 'attendanceRecords') continue
      const existing = state.attendanceRecords[key]
      const oldMonthKey = attendanceRecordLocationCache.get(key) || (existing ? getMonthKey(existing.ts) : null)

      if (value === null) {
        if (!oldMonthKey) continue
        payload[`${RTDB_V3_ROOT}/attendance/recordsByMonth/${oldMonthKey}/${key}`] = null
        const monthRecords = { ...(monthUpdates.get(oldMonthKey) || attendanceMonthCache.get(oldMonthKey) || {}) }
        delete monthRecords[key]
        monthUpdates.set(oldMonthKey, monthRecords)
        touchedMonths.add(oldMonthKey)
        continue
      }

      const record = value as AttendanceRecord
      const newMonthKey = getMonthKey(record.ts)
      if (oldMonthKey && oldMonthKey !== newMonthKey) {
        payload[`${RTDB_V3_ROOT}/attendance/recordsByMonth/${oldMonthKey}/${key}`] = null
        const oldMonthRecords = { ...(monthUpdates.get(oldMonthKey) || attendanceMonthCache.get(oldMonthKey) || {}) }
        delete oldMonthRecords[key]
        monthUpdates.set(oldMonthKey, oldMonthRecords)
        touchedMonths.add(oldMonthKey)
      }

      payload[`${RTDB_V3_ROOT}/attendance/recordsByMonth/${newMonthKey}/${key}`] = record
      const newMonthRecords = { ...(monthUpdates.get(newMonthKey) || attendanceMonthCache.get(newMonthKey) || {}) }
      newMonthRecords[key] = record
      monthUpdates.set(newMonthKey, newMonthRecords)
      touchedMonths.add(newMonthKey)
    }

    if (touchedEmployees) {
      touchRevision('attendance/employees', payload)
    }
    touchedMonths.forEach((monthKey) => {
      touchRevision(`attendance/recordsByMonth/${monthKey}`, payload)
    })
    await updateRoot(payload)

    employeeUpdates.forEach((employee, key) => {
      if (employee === null) delete state.attendanceEmployees[key]
      else state.attendanceEmployees[key] = employee
    })
    monthUpdates.forEach((records, monthKey) => {
      replaceAttendanceMonth(monthKey, records)
    })
    rebuildAttendanceState()
  }

  async function ensureHistoryBizDate(bizDate: V3BizDateKey) {
    if (historyDayCache.has(bizDate)) {
      return historyDayCache.get(bizDate) || {}
    }
    const monthKey = getMonthKeyFromBizDate(bizDate)
    const snapshot = await db.ref(`${RTDB_V3_ROOT}/history/ordersByMonth/${monthKey}/${bizDate}`).once('value')
    const value = (snapshot.val() || {}) as Record<string, V3ClosedOrder>
    historyDayCache.set(bizDate, value)
    return value
  }

  async function ensureDailySummaryDay(bizDate: V3BizDateKey) {
    if (dailySummaryDayCache.has(bizDate)) {
      return dailySummaryDayCache.get(bizDate) || null
    }
    const monthKey = getMonthKeyFromBizDate(bizDate)
    const snapshot = await db.ref(`${RTDB_V3_ROOT}/reports/dailyByMonth/${monthKey}/${bizDate}`).once('value')
    const value = (snapshot.val() || null) as V3DailySummary | null
    if (value) {
      dailySummaryDayCache.set(bizDate, value)
    }
    return value
  }

  async function ensureItemStatsDay(bizDate: V3BizDateKey) {
    if (itemStatsDayCache.has(bizDate)) {
      return itemStatsDayCache.get(bizDate) || {}
    }
    const monthKey = getMonthKeyFromBizDate(bizDate)
    const snapshot = await db.ref(`${RTDB_V3_ROOT}/reports/itemStatsByMonth/${monthKey}/${bizDate}`).once('value')
    const value = decodeItemStatsRecord((snapshot.val() || {}) as Record<string, V3DailyItemStat>)
    itemStatsDayCache.set(bizDate, value)
    return value
  }

  async function listClosedOrdersByRange(range: HistoryRange) {
    const bizDateKeys = getBizDateKeysBetween(range.start, range.endExclusive)
    const orders = await Promise.all(
      bizDateKeys.map(async (bizDate) => {
        const byDay = await ensureHistoryBizDate(bizDate)
        return Object.values(byDay || {})
          .sort((left, right) => left.closedAt - right.closedAt)
          .map((order) => orderRecordToPosOrder(order))
      })
    )
    return orders.flat()
  }

  async function listClosedOrdersByDay(targetDate: Date) {
    const start = new Date(targetDate)
    start.setHours(5, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return listClosedOrdersByRange({ start, endExclusive: end })
  }

  async function loadDailySummariesRange(start: Date, endExclusive: Date) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    const result: Record<string, V3DailySummary> = {}
    await Promise.all(
      bizDateKeys.map(async (bizDate) => {
        const summary = await ensureDailySummaryDay(bizDate)
        if (summary) result[bizDate] = summary
      })
    )
    return result
  }

  async function loadItemStatsRange(start: Date, endExclusive: Date) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    const result: Record<string, Record<string, V3DailyItemStat>> = {}
    await Promise.all(
      bizDateKeys.map(async (bizDate) => {
        const stats = await ensureItemStatsDay(bizDate)
        result[bizDate] = stats
      })
    )
    return result
  }

  function readDailySummariesRange(start: Date, endExclusive: Date) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    const summaries: Record<string, V3DailySummary> = {}
    bizDateKeys.forEach((bizDate) => {
      const summary = dailySummaryDayCache.get(bizDate)
      if (summary) {
        summaries[bizDate] = summary
      }
    })
    return summaries
  }

  function readItemStatsRange(start: Date, endExclusive: Date) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    return Object.fromEntries(bizDateKeys.map((bizDate) => [bizDate, itemStatsDayCache.get(bizDate) || {}]))
  }

  function watchCatalogRevision(listener: (event: V3CatalogRevisionEvent) => void) {
    const stops = [
      db.ref(`${RTDB_V3_ROOT}/meta/revisions/catalog/inventory`).on('value', () => {
        loadedCatalogSegments.delete('inventory')
        void ensureCatalogSegment('inventory').then(() => {
          listener({ kind: 'catalog', changedSegments: ['inventory'] })
        })
      }) as () => void,
      db.ref(`${RTDB_V3_ROOT}/meta/revisions/catalog/prices`).on('value', () => {
        loadedCatalogSegments.delete('prices')
        void ensureCatalogSegment('prices').then(() => {
          listener({ kind: 'catalog', changedSegments: ['prices'] })
        })
      }) as () => void,
      db.ref(`${RTDB_V3_ROOT}/meta/revisions/catalog/costs`).on('value', () => {
        loadedCatalogSegments.delete('costs')
        void ensureCatalogSegment('costs').then(() => {
          listener({ kind: 'catalog', changedSegments: ['costs'] })
        })
      }) as () => void,
    ]
    return () => {
      stops.forEach((stop) => {
        stop()
      })
    }
  }

  function watchOwnerAuthRevision(listener: (event: V3OwnerAuthRevisionEvent) => void) {
    return db.ref(`${RTDB_V3_ROOT}/meta/revisions/auth/owners`).on('value', () => {
      ownerAuthLoaded = false
      void ensureOwnerAuth().then(() => {
        listener({ kind: 'owner-auth' })
      })
    }) as () => void
  }

  function watchClosedOrdersRange(start: Date, endExclusive: Date, onInvalidate: (event: V3HistoryRangeEvent) => void) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    const stops = bizDateKeys.map(
      (bizDate) =>
        db.ref(`${RTDB_V3_ROOT}/meta/revisions/history/ordersByDay/${bizDate}`).on('value', () => {
          historyDayCache.delete(bizDate)
          void ensureHistoryBizDate(bizDate).then(() => {
            onInvalidate({ kind: 'history-orders', changedBizDates: [bizDate] })
          })
        }) as () => void
    )
    return () => {
      stops.forEach((stop) => {
        stop()
      })
    }
  }

  function watchDailySummariesRange(
    start: Date,
    endExclusive: Date,
    onInvalidate: (event: V3DailySummaryRangeEvent) => void
  ) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    const stops = bizDateKeys.map(
      (bizDate) =>
        db.ref(`${RTDB_V3_ROOT}/meta/revisions/reports/dailyByDay/${bizDate}`).on('value', () => {
          dailySummaryDayCache.delete(bizDate)
          void ensureDailySummaryDay(bizDate).then(() => {
            onInvalidate({ kind: 'daily-summary', changedBizDates: [bizDate] })
          })
        }) as () => void
    )
    return () => {
      stops.forEach((stop) => {
        stop()
      })
    }
  }

  function watchItemStatsRange(start: Date, endExclusive: Date, onInvalidate: (event: V3ItemStatsRangeEvent) => void) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    const stops = bizDateKeys.map(
      (bizDate) =>
        db.ref(`${RTDB_V3_ROOT}/meta/revisions/reports/itemStatsByDay/${bizDate}`).on('value', () => {
          itemStatsDayCache.delete(bizDate)
          void ensureItemStatsDay(bizDate).then(() => {
            onInvalidate({ kind: 'item-stats', changedBizDates: [bizDate] })
          })
        }) as () => void
    )
    return () => {
      stops.forEach((stop) => {
        stop()
      })
    }
  }

  async function rebuildDayReports(bizDate: V3BizDateKey) {
    const monthKey = getMonthKeyFromBizDate(bizDate)
    const orders = await ensureHistoryBizDate(bizDate)
    const rebuilt = buildSummaryFromClosedOrders(orders)
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/reports/dailyByMonth/${monthKey}/${bizDate}`]: rebuilt.summary,
      [`${RTDB_V3_ROOT}/reports/itemStatsByMonth/${monthKey}/${bizDate}`]: encodeItemStatsRecord(rebuilt.itemStats),
    }
    touchRevision(`reports/dailyByDay/${bizDate}`, payload)
    touchRevision(`reports/itemStatsByDay/${bizDate}`, payload)
    await updateRoot(payload)
    if (rebuilt.summary) dailySummaryDayCache.set(bizDate, rebuilt.summary)
    else dailySummaryDayCache.delete(bizDate)
    if (rebuilt.itemStats) itemStatsDayCache.set(bizDate, rebuilt.itemStats)
    else itemStatsDayCache.delete(bizDate)
  }

  async function saveCustomerDraft(table: string, entries: PosOrderEntry[], customerInput: PosTableCustomer) {
    const displaySeqBase = await ensureDisplaySeqBase(table, customerInput)
    const customer = cloneCustomer(customerInput)
    customer.orderId = displaySeqBase
    state.tableCustomers[table] = customer
    state.tableTimers[table] ||= Date.now()
    const updatedAt = Date.now()
    await transactLiveTable(table, (liveTable) =>
      buildLiveTable({
        draft: sortEntries(entries.map((entry) => ({ ...entry, status: 'draft', source: 'customer', updatedAt }))),
        pendingBatches: toBatchList(liveTable.pendingBatches),
        submittedBatches: toBatchList(liveTable.submittedBatches),
        status:
          entries.length > 0 ||
          Object.keys(liveTable.pendingBatches).length > 0 ||
          Object.keys(liveTable.submittedBatches).length > 0
            ? 'yellow'
            : undefined,
        timerStartedAt: state.tableTimers[table],
        batchCount: Object.keys(liveTable.submittedBatches).length,
        nextSplitCounter: readSplitCounter(liveTable.summary?.nextSplitCounter),
        customer,
        updatedAt,
      })
    )
    return { displaySeqBase }
  }

  async function discardCustomerDraft(table: string) {
    const updatedAt = Date.now()
    await transactLiveTable(table, (liveTable) =>
      buildLiveTable({
        draft: [],
        pendingBatches: toBatchList(liveTable.pendingBatches),
        submittedBatches: toBatchList(liveTable.submittedBatches),
        status:
          Object.keys(liveTable.pendingBatches).length > 0 || Object.keys(liveTable.submittedBatches).length > 0
            ? 'yellow'
            : undefined,
        timerStartedAt: state.tableTimers[table],
        batchCount: Object.keys(liveTable.submittedBatches).length,
        nextSplitCounter: readSplitCounter(liveTable.summary?.nextSplitCounter),
        customer: state.tableCustomers[table],
        updatedAt,
      })
    )
  }

  async function submitCustomerDraft(
    table: string,
    entries: PosOrderEntry[],
    customerInput: PosTableCustomer
  ): Promise<PosOrderBatch> {
    const displaySeqBase = await ensureDisplaySeqBase(table, customerInput)
    const customer = cloneCustomer(customerInput)
    customer.orderId = displaySeqBase
    const createdAt = Date.now()
    let batch: PosOrderBatch | null = null
    await transactLiveTable(table, (liveTable) => {
      batch = {
        batchId: toBatchId('pending'),
        source: 'customer',
        status: 'pending',
        table,
        customer,
        createdAt,
        updatedAt: createdAt,
        requestLabel: `#${displaySeqBase}-${Object.keys(liveTable.pendingBatches).length + 1}`,
        entries: sortEntries(
          entries.map((entry) => ({ ...entry, status: 'pending', source: 'customer', updatedAt: createdAt }))
        ),
        subtotal: sumEntries(entries),
      }
      const nextPending = toBatchList(liveTable.pendingBatches)
      nextPending.push(batch)
      return buildLiveTable({
        draft: [],
        pendingBatches: nextPending,
        submittedBatches: toBatchList(liveTable.submittedBatches),
        status: 'yellow',
        timerStartedAt: state.tableTimers[table] || createdAt,
        batchCount: Object.keys(liveTable.submittedBatches).length,
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

  async function acceptPendingBatch(table: string, batchId: string): Promise<PosOrderBatch | null> {
    let accepted: PosOrderBatch | null = null
    await transactLiveTable(table, (liveTable) => {
      const target = liveTable.pendingBatches[encodeBatchMapKey(batchId)]
      if (!target) {
        return liveTable
      }
      const acceptedBatch = mapStoredBatch(target)
      acceptedBatch.status = 'accepted'
      acceptedBatch.acceptedAt = Date.now()
      acceptedBatch.updatedAt = acceptedBatch.acceptedAt
      acceptedBatch.entries = acceptedBatch.entries.map((entry) => ({
        ...entry,
        status: 'accepted',
        updatedAt: acceptedBatch.updatedAt,
      }))
      accepted = acceptedBatch
      const nextPending = toBatchList(
        Object.fromEntries(Object.entries(liveTable.pendingBatches).filter(([id]) => id !== batchId))
      )
      const nextSubmitted = toBatchList(liveTable.submittedBatches)
      nextSubmitted.push(acceptedBatch)
      return buildLiveTable({
        draft: toDraftEntries(liveTable),
        pendingBatches: nextPending,
        submittedBatches: nextSubmitted,
        status: 'yellow',
        timerStartedAt: state.tableTimers[table],
        batchCount: nextSubmitted.length,
        nextSplitCounter: readSplitCounter(liveTable.summary?.nextSplitCounter),
        customer: state.tableCustomers[table],
        updatedAt: acceptedBatch.updatedAt,
      })
    })
    return accepted
  }

  async function rejectPendingBatch(table: string, batchId: string) {
    await transactLiveTable(table, (liveTable) => {
      const target = liveTable.pendingBatches[encodeBatchMapKey(batchId)]
      if (!target) {
        return liveTable
      }
      const rejected = mapStoredBatch(target)
      const currentDraft = toDraftEntries(liveTable)
      const returnedEntries = rejected.entries.map((entry) => ({
        ...entry,
        status: 'draft' as const,
        updatedAt: Date.now(),
      }))
      const nextPending = toBatchList(
        Object.fromEntries(Object.entries(liveTable.pendingBatches).filter(([id]) => id !== batchId))
      )
      return buildLiveTable({
        draft: [...currentDraft, ...returnedEntries],
        pendingBatches: nextPending,
        submittedBatches: toBatchList(liveTable.submittedBatches),
        status: 'yellow',
        timerStartedAt: state.tableTimers[table],
        batchCount: Object.keys(liveTable.submittedBatches).length,
        nextSplitCounter: readSplitCounter(liveTable.summary?.nextSplitCounter),
        customer: state.tableCustomers[table],
        updatedAt: Date.now(),
      })
    })
  }

  async function saveStaffDraft(table: string, entries: PosOrderEntry[]) {
    const next = sortEntries(entries.map((entry) => ({ ...entry, source: 'staff', status: 'draft' })))
    state.staffDrafts[table] = next
    if (currentTableSession?.table === table && currentTableSession.mode === 'staff') {
      state.activeDraftEntries = next
    }
  }

  async function createStaffBatch(
    table: string,
    entries: PosOrderEntry[],
    customer?: PosTableCustomer
  ): Promise<PosOrderBatch> {
    const displaySeqBase = await ensureDisplaySeqBase(table, customer || state.tableCustomers[table])
    const createdAt = Date.now()
    let batch: PosOrderBatch | null = null
    await transactLiveTable(table, (liveTable) => {
      const nextSplitCounter = readSplitCounter(liveTable.summary?.nextSplitCounter)
      batch = {
        batchId: toBatchId('submitted'),
        source: 'staff',
        status: 'accepted',
        table,
        customer: { ...cloneCustomer(customer || state.tableCustomers[table]), orderId: displaySeqBase },
        createdAt,
        updatedAt: createdAt,
        acceptedAt: createdAt,
        requestLabel: `#${displaySeqBase}-${Object.keys(liveTable.submittedBatches).length + 1}`,
        entries: sortEntries(
          entries.map((entry) => ({ ...entry, source: 'staff', status: 'accepted', updatedAt: createdAt }))
        ),
        subtotal: sumEntries(entries),
      }
      const nextSubmitted = toBatchList(liveTable.submittedBatches)
      nextSubmitted.push(batch)
      state.staffDrafts[table] = []
      return buildLiveTable({
        draft: toDraftEntries(liveTable),
        pendingBatches: toBatchList(liveTable.pendingBatches),
        submittedBatches: nextSubmitted,
        status: 'yellow',
        timerStartedAt: state.tableTimers[table] || createdAt,
        batchCount: nextSubmitted.length,
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
    await transactLiveTable(table, (liveTable) => {
      const stored = liveTable.submittedBatches[encodeBatchMapKey(batchId)]
      if (!stored) {
        return liveTable
      }
      const current = mapStoredBatch(stored)
      const updatedAt = Date.now()
      const nextSplitCounter = readSplitCounter(liveTable.summary?.nextSplitCounter)
      nextBatch = {
        ...current,
        updatedAt,
        entries: sortEntries(entries.map((entry) => ({ ...entry, status: 'accepted', updatedAt }))),
        subtotal: sumEntries(entries),
      }
      const nextSubmitted = toBatchList({
        ...liveTable.submittedBatches,
        [batchId]: mapBatchToStored(nextBatch),
      })
      return buildLiveTable({
        draft: toDraftEntries(liveTable),
        pendingBatches: toBatchList(liveTable.pendingBatches),
        submittedBatches: nextSubmitted,
        status: 'yellow',
        timerStartedAt: state.tableTimers[table],
        batchCount: nextSubmitted.length,
        nextSplitCounter,
        customer: state.tableCustomers[table],
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
    const liveTable = await readLiveTable(payload.table)
    const displaySeqBase = await ensureDisplaySeqBase(payload.table, payload.customer)
    const closedAt = Date.now()
    const orderId = toOrderId()
    const submittedBatches = toBatchList(liveTable.submittedBatches)
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
      itemCosts: state.itemCosts,
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
        timerStartedAt: state.tableTimers[payload.table],
        batchCount: remainingSubmitted.length,
        nextSplitCounter: readSplitCounter(liveTable.summary?.nextSplitCounter) + 1,
        customer: state.tableCustomers[payload.table] || payload.customer,
        updatedAt: closedAt,
      })
      payloadUpdate[`${RTDB_V3_ROOT}/live/tables/${payload.table}`] = nextLive
      payloadUpdate[`${RTDB_V3_ROOT}/live/tableSummaries/${payload.table}`] = nextLive.summary
      payloadUpdate[`${RTDB_V3_ROOT}/live/pendingSummaries/${payload.table}`] =
        buildPendingSummary(nextLive.pendingBatches) || null
    }

    touchRevision(`history/ordersByDay/${bizDate}`, payloadUpdate)
    await updateRoot(payloadUpdate)

    const byDay = { ...(historyDayCache.get(bizDate) || {}) }
    byDay[orderId] = orderRecord
    historyDayCache.set(bizDate, byDay)
    await rebuildDayReports(bizDate)

    if (isFullCheckout) {
      delete state.tableDrafts[payload.table]
      delete state.pendingBatches[payload.table]
      delete state.submittedBatches[payload.table]
      delete state.staffDrafts[payload.table]
      delete state.tableTimers[payload.table]
      delete state.tableStatuses[payload.table]
      delete state.tableBatchCounts[payload.table]
      delete state.tableCustomers[payload.table]
      delete state.tableSplitCounters[payload.table]
      if (currentTableSession?.table === payload.table) {
        state.activeDraftEntries = []
        state.activePendingBatches = []
        state.activeSubmittedBatches = []
      }
    } else {
      state.tableDrafts[payload.table] = []
      delete state.pendingBatches[payload.table]
      state.submittedBatches[payload.table] = remainingSubmitted
      state.tableStatuses[payload.table] = 'yellow'
      state.tableBatchCounts[payload.table] = remainingSubmitted.length
      state.tableSplitCounters[payload.table] = readSplitCounter(liveTable.summary?.nextSplitCounter) + 1
      if (currentTableSession?.table === payload.table) {
        state.activeDraftEntries =
          currentTableSession.mode === 'staff' ? [...(state.staffDrafts[payload.table] || [])] : []
        state.activePendingBatches = []
        state.activeSubmittedBatches = remainingSubmitted
      }
    }

    return orderRecordToPosOrder(orderRecord)
  }

  async function deleteClosedOrder(order: PosOrder) {
    const bizDate = String(order.bizDateKey || '')
    const monthKey = String(order.monthKey || getMonthKeyFromBizDate(bizDate as V3BizDateKey))
    const orderId = String(order.orderId || '')
    if (!bizDate || !monthKey || !orderId) {
      return
    }
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/history/ordersByMonth/${monthKey}/${bizDate}/${orderId}`]: null,
    }
    touchRevision(`history/ordersByDay/${bizDate}`, payload)
    await updateRoot(payload)

    const current = { ...(await ensureHistoryBizDate(bizDate as V3BizDateKey)) }
    delete current[orderId]
    historyDayCache.set(bizDate as V3BizDateKey, current)
    await rebuildDayReports(bizDate as V3BizDateKey)
  }

  async function setOwnerPassword(ownerName: string, record: PosOwnerAuthRecord) {
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/auth/owners/${ownerName}`]: record,
    }
    touchRevision('auth/owners', payload)
    await updateRoot(payload)
    state.ownerPasswords[ownerName] = record
  }

  async function updateInventory(itemId: string, checked: boolean) {
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/catalog/inventory/${encodeCatalogKey(itemId)}`]: checked,
    }
    touchRevision('catalog/inventory', payload)
    await updateRoot(payload)
    state.inventory[itemId] = checked
  }

  async function updateInventoryBatch(batch: Record<string, boolean>) {
    const payload: Record<string, unknown> = {}
    Object.entries(batch).forEach(([itemId, checked]) => {
      payload[`${RTDB_V3_ROOT}/catalog/inventory/${encodeCatalogKey(itemId)}`] = checked
      state.inventory[itemId] = checked
    })
    touchRevision('catalog/inventory', payload)
    await updateRoot(payload)
  }

  async function updateItemPrice(itemId: string, value: number) {
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/catalog/prices/${encodeCatalogKey(itemId)}`]: value,
    }
    touchRevision('catalog/prices', payload)
    await updateRoot(payload)
    state.itemPrices[itemId] = value
  }

  async function updateItemCost(itemId: string, value: number) {
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/catalog/costs/${encodeCatalogKey(itemId)}`]: value,
    }
    touchRevision('catalog/costs', payload)
    await updateRoot(payload)
    state.itemCosts[itemId] = value
  }

  async function startStaffLive() {
    if (staffLiveStarted) return
    staffLiveStarted = true

    const summariesPath = `${RTDB_V3_ROOT}/live/tableSummaries`
    const pendingPath = `${RTDB_V3_ROOT}/live/pendingSummaries`
    setSubscription(
      'staff-table-added',
      db.ref(summariesPath).on('child_added', (child) => {
        const tableId = child.key()
        if (!tableId) return
        applyTableSummary(decodeTableKey(tableId), (child.val() || null) as V3TableSummary | null)
        notifyLiveStateChange(['tableSummaries'])
      }) as () => void
    )
    setSubscription(
      'staff-table-changed',
      db.ref(summariesPath).on('child_changed', (child) => {
        const tableId = child.key()
        if (!tableId) return
        applyTableSummary(decodeTableKey(tableId), (child.val() || null) as V3TableSummary | null)
        notifyLiveStateChange(['tableSummaries'])
      }) as () => void
    )
    setSubscription(
      'staff-table-removed',
      db.ref(summariesPath).on('child_removed', (child) => {
        const tableId = child.key()
        if (!tableId) return
        const decodedTableId = decodeTableKey(tableId)
        applyTableSummary(decodedTableId, null)
        delete state.tableDrafts[decodedTableId]
        delete state.pendingBatches[decodedTableId]
        delete state.submittedBatches[decodedTableId]
        notifyLiveStateChange(['tableSummaries'])
      }) as () => void
    )
    setSubscription(
      'staff-pending-added',
      db.ref(pendingPath).on('child_added', (child) => {
        const tableId = child.key()
        if (!tableId) return
        applyPendingSummary(decodeTableKey(tableId), (child.val() || null) as V3PendingSummary | null)
        notifyLiveStateChange(['pendingBatches'])
      }) as () => void
    )
    setSubscription(
      'staff-pending-changed',
      db.ref(pendingPath).on('child_changed', (child) => {
        const tableId = child.key()
        if (!tableId) return
        applyPendingSummary(decodeTableKey(tableId), (child.val() || null) as V3PendingSummary | null)
        notifyLiveStateChange(['pendingBatches'])
      }) as () => void
    )
    setSubscription(
      'staff-pending-removed',
      db.ref(pendingPath).on('child_removed', (child) => {
        const tableId = child.key()
        if (!tableId) return
        applyPendingSummary(decodeTableKey(tableId), null)
        notifyLiveStateChange(['pendingBatches'])
      }) as () => void
    )
  }

  async function startTableLiveSession(mode: LiveMode, table: string) {
    stopTableLiveSession()
    currentTableSession = { table, mode }
    state.selectedTable = table
    state.currentMode = mode
    const liveTable = await readLiveTable(table)
    applyLiveTable(table, liveTable, mode)
    setSubscription(
      `table-live-${table}`,
      db.ref(`${RTDB_V3_ROOT}/live/tables/${encodeTableKey(table)}`).on('value', (snapshot) => {
        const next = normalizeLiveTable(snapshot.val() as V3LiveTable | null | undefined)
        applyLiveTable(table, next, mode)
        notifyLiveStateChange(['tableDrafts', 'pendingBatches', 'submittedBatches'])
      }) as () => void
    )
  }

  function stopTableLiveSession() {
    if (currentTableSession) {
      clearSubscription(`table-live-${currentTableSession.table}`)
    }
    currentTableSession = null
    state.selectedTable = null
    state.activeDraftEntries = []
    state.activePendingBatches = []
    state.activeSubmittedBatches = []
  }

  return {
    acceptPendingBatch,
    createStaffBatch,
    deleteClosedOrder,
    discardCustomerDraft,
    ensureAttendanceFullHistory,
    ensureAttendanceWindow,
    ensureCatalog,
    ensureOwnerAuth,
    listClosedOrdersByDay,
    listClosedOrdersByRange,
    loadDailySummariesRange,
    loadItemStatsRange,
    readDailySummariesRange,
    readItemStatsRange,
    rejectPendingBatch,
    saveAttendanceUpdates,
    saveCustomerDraft,
    saveStaffDraft,
    setOwnerPassword,
    startStaffLive,
    startTableLiveSession,
    stopTableLiveSession,
    submitCustomerDraft,
    updateInventory,
    updateInventoryBatch,
    updateItemCost,
    updateItemPrice,
    updateSubmittedBatch,
    watchAttendanceWindow,
    watchCatalogRevision,
    watchClosedOrdersRange,
    watchDailySummariesRange,
    watchItemStatsRange,
    watchOwnerAuthRevision,
    checkoutSubmittedBatches,
  }
}
