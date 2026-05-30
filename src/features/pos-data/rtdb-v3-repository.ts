import type {
  CorePosState,
  PosCartItem,
  PosOrder,
  PosOwnerAuthMap,
  PosOwnerAuthRecord,
  PosTableCustomer,
} from '@/features/pos-kernel/types'
import type { AttendanceEmployee, AttendanceRecord } from '@/shared/attendance-service'
import { type DatabaseCompat, dbIncrement } from '@/shared/firebase-compat'
import {
  buildLiveTable,
  buildPendingSummary,
  buildSummaryFromClosedOrders,
  createDailySummary,
  createEmptyLiveTable,
  getBizDateKey,
  getBizDateKeysBetween,
  getMonthKey,
  getMonthKeyFromBizDate,
  incomingHeadToPreviewOrder,
  incomingOrderRecordToHead,
  mapCartLinesToItems,
  orderRecordToPosOrder,
  toClosedOrderRecord,
} from './rtdb-v3-mapper'
import type {
  V3IncomingOrder as StoredIncomingOrder,
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
  V3OwnerAuthRecord,
  V3OwnerAuthRevisionEvent,
  V3PendingSummary,
  V3RevisionValue,
  V3TableSummary,
} from './rtdb-v3-types'
import { RTDB_V3_ROOT } from './rtdb-v3-types'

type LiveMode = 'staff' | 'customer'

type CheckoutPayload = {
  table: string
  cart: PosCartItem[]
  customer: PosTableCustomer | undefined
  paidTotal: number
  originalTotal: number
  splitCounter: number | null
  clearTable: boolean
  remainingCart?: PosCartItem[]
  nextSplitCounter?: number
}

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
type WritableIncomingOrder = {
  requestId: string
  items: PosCartItem[]
  customer: { name: string; phone: string }
  batchId: number
  timestamp: number
}

function toOrderId() {
  const random = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10)
  return `ord_${Date.now()}_${random}`
}

function toRequestId() {
  const random = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10)
  return `req_${Date.now()}_${random}`
}

function toRevValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
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
  let staffLiveLoad: Promise<void> | null = null
  let currentTableSession: { table: string; mode: LiveMode } | null = null
  let tableSessionLoad: Promise<void> | null = null
  let tableSessionLoadKey = ''

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

  function notifyLiveStateChange(roots: string[]) {
    onLiveStateChange?.(roots)
  }

  function touchRevision(path: string, payload: Record<string, unknown>) {
    payload[`${RTDB_V3_ROOT}/meta/revisions/${path}`] = Date.now()
  }

  function syncWrittenRevisionBaselines(payload: Record<string, unknown>) {
    const prefix = `${RTDB_V3_ROOT}/meta/revisions/`
    Object.entries(payload).forEach(([path, value]) => {
      if (path.startsWith(prefix)) {
        revisionCache.set(path.slice(prefix.length), toRevValue(value))
      }
    })
  }

  async function updateRoot(payload: Record<string, unknown>) {
    await db.ref('/').update(payload)
    syncWrittenRevisionBaselines(payload)
  }

  async function syncRevisionBaselines(paths: string[], shouldRefreshCachedPath: (path: string) => boolean) {
    const changedPaths: string[] = []
    await Promise.all(
      [...new Set(paths)].map(async (path) => {
        const snapshot = await db.ref(`${RTDB_V3_ROOT}/meta/revisions/${path}`).once('value')
        const next = toRevValue(snapshot.val())
        const previous = revisionCache.get(path)
        revisionCache.set(path, next)
        if (
          (previous !== undefined && previous !== next) ||
          (previous === undefined && shouldRefreshCachedPath(path))
        ) {
          changedPaths.push(path)
        }
      })
    )
    return changedPaths
  }

  function watchRevision(path: string, onInvalidate: () => void) {
    const unsubscribe = db.ref(`${RTDB_V3_ROOT}/meta/revisions/${path}`).on('value', (snapshot) => {
      const next = toRevValue(snapshot.val())
      const previous = revisionCache.get(path)
      revisionCache.set(path, next)
      if (previous !== undefined && previous !== next) {
        onInvalidate()
      }
    }) as () => void
    return unsubscribe
  }

  function watchMappedRevisions(paths: string[], onInvalidate: (path: string) => void) {
    const stops = [...new Set(paths)].map((path) => watchRevision(path, () => onInvalidate(path)))
    return () => {
      stops.forEach((stop) => {
        stop()
      })
    }
  }

  function getBizDateFromRevisionPath(path: string) {
    return path.split('/').at(-1) as V3BizDateKey | undefined
  }

  async function syncHistoryRevisionBaselines(bizDateKeys: V3BizDateKey[]) {
    const changedPaths = await syncRevisionBaselines(
      bizDateKeys.map((bizDate) => `history/ordersByDay/${bizDate}`),
      (path) => {
        const bizDate = getBizDateFromRevisionPath(path)
        return Boolean(bizDate && historyDayCache.has(bizDate))
      }
    )
    changedPaths.forEach((path) => {
      const bizDate = getBizDateFromRevisionPath(path)
      if (bizDate) historyDayCache.delete(bizDate)
    })
  }

  async function syncDailySummaryRevisionBaselines(bizDateKeys: V3BizDateKey[]) {
    const changedPaths = await syncRevisionBaselines(
      bizDateKeys.map((bizDate) => `reports/dailyByDay/${bizDate}`),
      (path) => {
        const bizDate = getBizDateFromRevisionPath(path)
        return Boolean(bizDate && dailySummaryDayCache.has(bizDate))
      }
    )
    changedPaths.forEach((path) => {
      const bizDate = getBizDateFromRevisionPath(path)
      if (bizDate) dailySummaryDayCache.delete(bizDate)
    })
  }

  async function syncItemStatsRevisionBaselines(bizDateKeys: V3BizDateKey[]) {
    const changedPaths = await syncRevisionBaselines(
      bizDateKeys.map((bizDate) => `reports/itemStatsByDay/${bizDate}`),
      (path) => {
        const bizDate = getBizDateFromRevisionPath(path)
        return Boolean(bizDate && itemStatsDayCache.has(bizDate))
      }
    )
    changedPaths.forEach((path) => {
      const bizDate = getBizDateFromRevisionPath(path)
      if (bizDate) itemStatsDayCache.delete(bizDate)
    })
  }

  async function refreshHistoryBizDates(bizDateKeys: V3BizDateKey[]) {
    await Promise.all(
      bizDateKeys.map(async (bizDate) => {
        historyDayCache.delete(bizDate)
        await ensureHistoryBizDate(bizDate)
      })
    )
  }

  async function refreshDailySummaryBizDates(bizDateKeys: V3BizDateKey[]) {
    await Promise.all(
      bizDateKeys.map(async (bizDate) => {
        dailySummaryDayCache.delete(bizDate)
        await ensureDailySummaryDay(bizDate)
      })
    )
  }

  async function refreshItemStatsBizDates(bizDateKeys: V3BizDateKey[]) {
    await Promise.all(
      bizDateKeys.map(async (bizDate) => {
        itemStatsDayCache.delete(bizDate)
        await ensureItemStatsDay(bizDate)
      })
    )
  }

  function applyTableSummary(tableId: string, summary: V3TableSummary | null | undefined) {
    if (!summary) {
      delete state.tableTimers[tableId]
      delete state.tableStatuses[tableId]
      delete state.tableCustomers[tableId]
      delete state.tableSplitCounters[tableId]
      delete state.tableBatchCounts[tableId]
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
    state.tableSplitCounters[tableId] = summary.splitCounter ?? 1
    state.tableBatchCounts[tableId] = summary.batchCount ?? 0
  }

  function toIncomingOrderQueue(liveTable: V3LiveTable | null | undefined) {
    return Object.values(liveTable?.incomingOrders || {})
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((order) => incomingHeadToPreviewOrder(incomingOrderRecordToHead(order)))
  }

  function toPendingQueue(summary: V3PendingSummary | null | undefined) {
    if (!summary?.firstOrder) {
      return []
    }
    return [incomingHeadToPreviewOrder(summary.firstOrder)]
  }

  function applyLiveTable(tableId: string, liveTable: V3LiveTable | null | undefined, mode?: LiveMode) {
    const summary = liveTable?.summary || null
    applyTableSummary(tableId, summary)

    const cart = mapCartLinesToItems(liveTable?.cart || {})
    if (cart.length > 0) state.tableCarts[tableId] = cart
    else delete state.tableCarts[tableId]

    const incomingQueue = toIncomingOrderQueue(liveTable)
    if (incomingQueue.length > 0) state.incomingOrders[tableId] = incomingQueue
    else delete state.incomingOrders[tableId]

    if (state.selectedTable === tableId && mode === 'staff') {
      state.cart = [...cart]
    }
    if (state.selectedTable === tableId && mode === 'customer') {
      state.sentItems = cart.map((item) => ({ ...item, isSent: true }))
    }
  }

  function applyPendingSummary(tableId: string, summary: V3PendingSummary | null | undefined) {
    pendingSummaryCache.set(tableId, summary || null)
    if (currentTableSession?.table === tableId) {
      return
    }
    const incomingQueue = toPendingQueue(summary)
    if (incomingQueue.length > 0) state.incomingOrders[tableId] = incomingQueue
    else delete state.incomingOrders[tableId]
  }

  function replaceAllLiveSummaries(value: Record<string, V3TableSummary> | undefined) {
    state.tableTimers = {}
    state.tableStatuses = {}
    state.tableCustomers = {}
    state.tableSplitCounters = {}
    state.tableBatchCounts = {}
    state.tableCarts = {}
    for (const [tableId, summary] of Object.entries(value || {})) {
      applyTableSummary(tableId, summary || null)
    }
  }

  function replaceAllPendingSummaries(value: Record<string, V3PendingSummary> | undefined) {
    pendingSummaryCache.clear()
    state.incomingOrders = {}
    for (const [tableId, summary] of Object.entries(value || {})) {
      applyPendingSummary(tableId, summary || null)
    }
  }

  function applyAuthorityState(tableId: string, liveTable: V3LiveTable | null | undefined) {
    const mode = currentTableSession?.table === tableId ? currentTableSession.mode : undefined
    if (mode) {
      applyLiveTable(tableId, liveTable, mode)
      return
    }
    applyTableSummary(tableId, liveTable?.summary || null)
    delete state.tableCarts[tableId]
    applyPendingSummary(tableId, buildPendingSummary(liveTable?.incomingOrders) || null)
  }

  function writeLiveTableAuthority(
    table: string,
    liveTable: V3LiveTable | null,
    payload: Record<string, unknown>,
    options: { writeAuthority?: boolean; writeSummaryIndex?: boolean; writePendingSummaryIndex?: boolean } = {}
  ) {
    const summary = liveTable?.summary || null
    const pendingSummary = buildPendingSummary(liveTable?.incomingOrders)

    if (options.writeAuthority !== false) {
      payload[`${RTDB_V3_ROOT}/live/tables/${table}`] = liveTable
    }
    if (options.writeSummaryIndex !== false) {
      payload[`${RTDB_V3_ROOT}/live/tableSummaries/${table}`] = summary
    }
    if (options.writePendingSummaryIndex !== false) {
      payload[`${RTDB_V3_ROOT}/live/pendingSummaries/${table}`] = pendingSummary
    }
  }

  function mapStoredIncomingOrders(value: Record<string, StoredIncomingOrder> | undefined) {
    return Object.values(value || {})
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((entry) => ({
        requestId: entry.requestId,
        items: mapCartLinesToItems(entry.items),
        customer: {
          name: entry.customer?.name || '',
          phone: entry.customer?.phone || '',
        },
        batchId: entry.batchId,
        timestamp: entry.createdAt,
      }))
  }

  function getLiveSummaryCustomer(summary: V3TableSummary | null | undefined): PosTableCustomer {
    return {
      name: summary?.customer?.name || '',
      phone: summary?.customer?.phone || '',
      orderId: summary?.displaySeqBase ?? undefined,
    }
  }

  function normalizeLiveTable(value: V3LiveTable | null | undefined) {
    if (!value) return createEmptyLiveTable()
    return {
      summary: value.summary || null,
      cart: { ...(value.cart || {}) },
      incomingOrders: { ...(value.incomingOrders || {}) },
    } satisfies V3LiveTable
  }

  async function persistDerivedLiveIndexes(table: string, liveTable: V3LiveTable | null) {
    const payload: Record<string, unknown> = {}
    writeLiveTableAuthority(table, liveTable, payload, { writeAuthority: false })
    await updateRoot(payload)
  }

  async function replaceLiveTable(table: string, liveTable: V3LiveTable | null) {
    const payload: Record<string, unknown> = {}
    writeLiveTableAuthority(table, liveTable, payload)
    await updateRoot(payload)
    return liveTable
  }

  async function transactLiveTable(
    table: string,
    updater: (current: V3LiveTable) => V3LiveTable | null,
    options: { persistDerivedIndexes?: boolean } = {}
  ): Promise<V3LiveTable | null> {
    const tx = await db
      .ref(`${RTDB_V3_ROOT}/live/tables/${table}`)
      .transaction<V3LiveTable | null>((current) => updater(normalizeLiveTable(current || null)))
    const next = tx.snapshot.val() ? (tx.snapshot.val() as V3LiveTable) : null
    if (options.persistDerivedIndexes !== false) {
      await persistDerivedLiveIndexes(table, next)
    }
    return next
  }

  async function fetchCatalogSegment(segment: V3CatalogSegment) {
    const snapshot = await db.ref(`${RTDB_V3_ROOT}/catalog/${segment}`).once('value')
    const value = snapshot.val() || {}
    if (segment === 'inventory') {
      state.inventory = { ...(value as Record<string, boolean>) }
    } else if (segment === 'prices') {
      state.itemPrices = { ...(value as Record<string, number | string>) }
    } else {
      state.itemCosts = { ...(value as Record<string, number>) }
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
    if (ownerAuthLoaded) {
      return
    }
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
      watchRevision('attendance/employees', () => {
        void fetchAttendanceEmployees().then(() => {
          attendanceEmployeesRev = Date.now()
          onInvalidate({
            kind: 'attendance-window',
            changedMonthKeys: [],
            employeesChanged: true,
          })
        })
      }),
      ...normalized.map((monthKey) =>
        watchRevision(`attendance/recordsByMonth/${monthKey}`, () => {
          void db
            .ref(`${RTDB_V3_ROOT}/attendance/recordsByMonth/${monthKey}`)
            .once('value')
            .then((snapshot) => {
              replaceAttendanceMonth(monthKey, { ...((snapshot.val() || {}) as AttendanceMonthMap) })
              revisionCache.set(`attendance/recordsByMonth/${monthKey}`, Date.now())
            })
            .then(() => {
              rebuildAttendanceState()
              onInvalidate({
                kind: 'attendance-window',
                changedMonthKeys: [monthKey],
                employeesChanged: false,
              })
            })
        })
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
    const recordStateUpdates = new Map<string, AttendanceRecord | null>()
    let touchedEmployees = false
    const touchedMonths = new Set<V3MonthKey>()

    for (const [path, value] of Object.entries(updates)) {
      const [root, key] = path.split('/')
      if (!key) continue

      if (root === 'attendanceEmployees') {
        payload[`${RTDB_V3_ROOT}/attendance/employees/${key}`] = value
        employeeUpdates.set(key, value === null ? null : (value as AttendanceEmployee))
        touchedEmployees = true
        continue
      }

      if (root === 'attendanceRecords') {
        const existing = state.attendanceRecords[key]
        const oldMonthKey = attendanceRecordLocationCache.get(key) || (existing ? getMonthKey(existing.ts) : null)

        if (value === null) {
          if (!oldMonthKey) continue
          payload[`${RTDB_V3_ROOT}/attendance/recordsByMonth/${oldMonthKey}/${key}`] = null
          const monthRecords = { ...(monthUpdates.get(oldMonthKey) || attendanceMonthCache.get(oldMonthKey) || {}) }
          delete monthRecords[key]
          monthUpdates.set(oldMonthKey, monthRecords)
          recordStateUpdates.set(key, null)
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
        recordStateUpdates.set(key, record)
        touchedMonths.add(newMonthKey)
      }
    }

    if (Object.keys(payload).length === 0) return
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
    if (touchedEmployees) {
      attendanceEmployeesRev = Date.now()
    }
    touchedMonths.forEach((monthKey) => {
      revisionCache.set(`attendance/recordsByMonth/${monthKey}`, Date.now())
    })
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
    const localCurrent = customer?.orderId
    const localParsed =
      typeof localCurrent === 'number'
        ? localCurrent
        : typeof localCurrent === 'string'
          ? parseInt(localCurrent, 10) || 0
          : 0
    if (localParsed > 0) {
      const nextCustomer = customer || {}
      nextCustomer.orderId = localParsed
      state.tableCustomers[table] = nextCustomer
      return localParsed
    }

    const cachedSummary = state.tableCustomers[table]
    const cachedParsed =
      typeof cachedSummary?.orderId === 'number'
        ? cachedSummary.orderId
        : typeof cachedSummary?.orderId === 'string'
          ? parseInt(cachedSummary.orderId, 10) || 0
          : 0
    if (cachedParsed > 0) {
      const nextCustomer = customer || {}
      nextCustomer.orderId = cachedParsed
      state.tableCustomers[table] = nextCustomer
      return cachedParsed
    }

    const remoteTable = await readLiveTable(table)
    const remoteParsed = Number(remoteTable?.summary?.displaySeqBase || 0)
    if (remoteParsed > 0) {
      const nextCustomer = customer || {}
      nextCustomer.orderId = remoteParsed
      state.tableCustomers[table] = nextCustomer
      return remoteParsed
    }

    const reserved = await reserveDisplaySeqBase()
    const nextCustomer = customer || {}
    nextCustomer.orderId = reserved.displaySeqBase
    state.tableCustomers[table] = nextCustomer
    return reserved.displaySeqBase
  }

  async function readLiveTable(table: string) {
    const snapshot = await db.ref(`${RTDB_V3_ROOT}/live/tables/${table}`).once('value')
    const value = snapshot.val()
    return value ? (value as V3LiveTable) : null
  }

  async function subscribeLiveTables() {
    const summariesPath = `${RTDB_V3_ROOT}/live/tableSummaries`
    const pendingPath = `${RTDB_V3_ROOT}/live/pendingSummaries`
    replaceAllLiveSummaries({})
    replaceAllPendingSummaries({})

    const stopSummaryAdded = db.ref(summariesPath).on('child_added', (child) => {
      const tableId = child.key()
      if (!tableId) return
      applyTableSummary(tableId, (child.val() || null) as V3TableSummary | null)
      notifyLiveStateChange(['live'])
    }) as () => void
    const stopSummaryChanged = db.ref(summariesPath).on('child_changed', (child) => {
      const tableId = child.key()
      if (!tableId) return
      applyTableSummary(tableId, (child.val() || null) as V3TableSummary | null)
      notifyLiveStateChange(['live'])
    }) as () => void
    const stopSummaryRemoved = db.ref(summariesPath).on('child_removed', (child) => {
      const tableId = child.key()
      if (!tableId) return
      applyTableSummary(tableId, null)
      delete state.tableCarts[tableId]
      if (currentTableSession?.table !== tableId) {
        delete state.incomingOrders[tableId]
      }
      notifyLiveStateChange(['live'])
    }) as () => void

    const stopPendingAdded = db.ref(pendingPath).on('child_added', (child) => {
      const tableId = child.key()
      if (!tableId) return
      applyPendingSummary(tableId, (child.val() || null) as V3PendingSummary | null)
      notifyLiveStateChange(['incomingOrders'])
    }) as () => void
    const stopPendingChanged = db.ref(pendingPath).on('child_changed', (child) => {
      const tableId = child.key()
      if (!tableId) return
      applyPendingSummary(tableId, (child.val() || null) as V3PendingSummary | null)
      notifyLiveStateChange(['incomingOrders'])
    }) as () => void
    const stopPendingRemoved = db.ref(pendingPath).on('child_removed', (child) => {
      const tableId = child.key()
      if (!tableId) return
      applyPendingSummary(tableId, null)
      notifyLiveStateChange(['incomingOrders'])
    }) as () => void

    setSubscription('live-tables', () => {
      stopSummaryAdded()
      stopSummaryChanged()
      stopSummaryRemoved()
      stopPendingAdded()
      stopPendingChanged()
      stopPendingRemoved()
    })
  }

  async function subscribeTableSession(table: string, mode: LiveMode) {
    if (currentTableSession?.table === table && currentTableSession.mode === mode) {
      return
    }
    clearSubscription('table-session-live')

    const seededLiveTable = await readLiveTable(table)
    applyLiveTable(table, seededLiveTable, mode)

    const liveUnsub = db.ref(`${RTDB_V3_ROOT}/live/tables/${table}`).on('value', (snapshot) => {
      applyLiveTable(table, (snapshot.val() || null) as V3LiveTable | null, mode)
      notifyLiveStateChange(['live', 'tableCarts', 'incomingOrders'])
    }) as () => void
    setSubscription('table-session-live', liveUnsub)
    currentTableSession = { table, mode }
  }

  async function startStaffLive() {
    await ensureCatalog()
    if (staffLiveStarted) {
      return
    }
    staffLiveLoad ||= subscribeLiveTables()
      .then(() => {
        staffLiveStarted = true
      })
      .finally(() => {
        staffLiveLoad = null
      })
    await staffLiveLoad
  }

  async function startTableLiveSession(mode: LiveMode, table: string) {
    const loadKey = `${mode}:${table}`
    if (currentTableSession?.table === table && currentTableSession.mode === mode) {
      return
    }
    if (tableSessionLoad && tableSessionLoadKey === loadKey) {
      await tableSessionLoad
      return
    }
    tableSessionLoadKey = loadKey
    tableSessionLoad = ensureCatalog()
      .then(() => subscribeTableSession(table, mode))
      .finally(() => {
        tableSessionLoad = null
        if (tableSessionLoadKey === loadKey) {
          tableSessionLoadKey = ''
        }
      })
    await tableSessionLoad
  }

  function stopTableLiveSession() {
    if (currentTableSession?.table) {
      const table = currentTableSession.table
      clearSubscription('table-session-live')
      currentTableSession = null
      delete state.tableCarts[table]
      applyPendingSummary(table, pendingSummaryCache.get(table) || null)
      return
    }
    clearSubscription('table-session-live')
    currentTableSession = null
  }

  async function ensureHistoryBizDate(bizDate: V3BizDateKey) {
    if (historyDayCache.has(bizDate)) {
      return historyDayCache.get(bizDate) || {}
    }
    return fetchHistoryBizDate(bizDate)
  }

  async function fetchHistoryBizDate(bizDate: V3BizDateKey) {
    const monthKey = getMonthKeyFromBizDate(bizDate)
    const snapshot = await db.ref(`${RTDB_V3_ROOT}/history/ordersByMonth/${monthKey}/${bizDate}`).once('value')
    const dayOrders = ((snapshot.val() || {}) as Record<string, V3ClosedOrder>) || {}
    historyDayCache.set(bizDate, dayOrders)
    return dayOrders
  }

  async function listClosedOrdersByRange(range: HistoryRange) {
    const bizDateKeys = getBizDateKeysBetween(range.start, range.endExclusive)
    await syncHistoryRevisionBaselines(bizDateKeys)
    await Promise.all(bizDateKeys.map((bizDate) => ensureHistoryBizDate(bizDate)))

    const orders: PosOrder[] = []
    for (const bizDate of bizDateKeys) {
      for (const order of Object.values(historyDayCache.get(bizDate) || {})) {
        const closedAt = order.closedAt || order.createdAt
        if (closedAt < range.start.getTime() || closedAt >= range.endExclusive.getTime()) {
          continue
        }
        orders.push(orderRecordToPosOrder(order))
      }
    }
    return orders.sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0))
  }

  async function listClosedOrdersByDay(targetDate: Date) {
    const start = new Date(targetDate)
    start.setHours(5, 0, 0, 0)
    const endExclusive = new Date(start)
    endExclusive.setDate(endExclusive.getDate() + 1)
    return listClosedOrdersByRange({ start, endExclusive })
  }

  async function ensureDailySummaryDay(bizDate: V3BizDateKey) {
    if (dailySummaryDayCache.has(bizDate)) {
      return dailySummaryDayCache.get(bizDate) || createDailySummary()
    }
    const monthKey = getMonthKeyFromBizDate(bizDate)
    const snapshot = await db.ref(`${RTDB_V3_ROOT}/reports/dailyByMonth/${monthKey}/${bizDate}`).once('value')
    const summary = ((snapshot.val() || createDailySummary()) as V3DailySummary) || createDailySummary()
    dailySummaryDayCache.set(bizDate, summary)
    return summary
  }

  async function ensureItemStatsDay(bizDate: V3BizDateKey) {
    if (itemStatsDayCache.has(bizDate)) {
      return itemStatsDayCache.get(bizDate) || {}
    }
    const monthKey = getMonthKeyFromBizDate(bizDate)
    const snapshot = await db.ref(`${RTDB_V3_ROOT}/reports/itemStatsByMonth/${monthKey}/${bizDate}`).once('value')
    const stats = ((snapshot.val() || {}) as Record<string, V3DailyItemStat>) || {}
    itemStatsDayCache.set(bizDate, stats)
    return stats
  }

  async function loadDailySummariesRange(start: Date, endExclusive: Date) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    await syncDailySummaryRevisionBaselines(bizDateKeys)
    await Promise.all(bizDateKeys.map((bizDate) => ensureDailySummaryDay(bizDate)))
    return readDailySummariesRange(start, endExclusive)
  }

  async function loadItemStatsRange(start: Date, endExclusive: Date) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    await syncItemStatsRevisionBaselines(bizDateKeys)
    await Promise.all(bizDateKeys.map((bizDate) => ensureItemStatsDay(bizDate)))
    return readItemStatsRange(start, endExclusive)
  }

  function readDailySummariesRange(start: Date, endExclusive: Date) {
    const result: Record<string, V3DailySummary> = {}
    for (const bizDate of getBizDateKeysBetween(start, endExclusive)) {
      const summary = dailySummaryDayCache.get(bizDate)
      if (summary) {
        result[bizDate] = summary
      }
    }
    return result
  }

  function readItemStatsRange(start: Date, endExclusive: Date) {
    const result: Record<string, Record<string, V3DailyItemStat>> = {}
    for (const bizDate of getBizDateKeysBetween(start, endExclusive)) {
      const stats = itemStatsDayCache.get(bizDate)
      if (stats) {
        result[bizDate] = stats
      }
    }
    return result
  }

  function watchCatalogRevision(onInvalidate: (event: V3CatalogRevisionEvent) => void) {
    const segments: V3CatalogSegment[] = ['inventory', 'prices', 'costs']
    const stops = segments.map((segment) =>
      watchRevision(`catalog/${segment}`, () => {
        loadedCatalogSegments.delete(segment)
        void ensureCatalogSegment(segment).then(() => {
          onInvalidate({
            kind: 'catalog',
            changedSegments: [segment],
          })
        })
      })
    )
    return () => {
      stops.forEach((stop) => {
        stop()
      })
    }
  }

  function watchOwnerAuthRevision(onInvalidate: (event: V3OwnerAuthRevisionEvent) => void) {
    return watchRevision('auth/owners', () => {
      state.ownerPasswords = {}
      ownerAuthLoaded = false
      void ensureOwnerAuth().then(() => {
        onInvalidate({ kind: 'owner-auth' })
      })
    })
  }

  function watchClosedOrdersRange(start: Date, endExclusive: Date, onInvalidate: (event: V3HistoryRangeEvent) => void) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    return watchMappedRevisions(
      bizDateKeys.map((bizDate) => `history/ordersByDay/${bizDate}`),
      (path) => {
        const bizDate = path.split('/').at(-1) as V3BizDateKey | undefined
        if (!bizDate) return
        void refreshHistoryBizDates([bizDate]).then(() => {
          onInvalidate({
            kind: 'history-orders',
            changedBizDates: [bizDate],
          })
        })
      }
    )
  }

  function watchDailySummariesRange(
    start: Date,
    endExclusive: Date,
    onInvalidate: (event: V3DailySummaryRangeEvent) => void
  ) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    return watchMappedRevisions(
      bizDateKeys.map((bizDate) => `reports/dailyByDay/${bizDate}`),
      (path) => {
        const bizDate = path.split('/').at(-1) as V3BizDateKey | undefined
        if (!bizDate) return
        void refreshDailySummaryBizDates([bizDate]).then(() => {
          onInvalidate({
            kind: 'daily-summary',
            changedBizDates: [bizDate],
          })
        })
      }
    )
  }

  function watchItemStatsRange(start: Date, endExclusive: Date, onInvalidate: (event: V3ItemStatsRangeEvent) => void) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    return watchMappedRevisions(
      bizDateKeys.map((bizDate) => `reports/itemStatsByDay/${bizDate}`),
      (path) => {
        const bizDate = path.split('/').at(-1) as V3BizDateKey | undefined
        if (!bizDate) return
        void refreshItemStatsBizDates([bizDate]).then(() => {
          onInvalidate({
            kind: 'item-stats',
            changedBizDates: [bizDate],
          })
        })
      }
    )
  }

  async function saveTableDraft(table: string, cart: PosCartItem[], customerInput: PosTableCustomer) {
    const customer = state.tableCustomers[table] || {}
    customer.name = customerInput.name || ''
    customer.phone = customerInput.phone || ''

    let timerStartedAt = state.tableTimers[table]
    if (!timerStartedAt) {
      timerStartedAt = Date.now()
      state.tableTimers[table] = timerStartedAt
    }
    state.tableSplitCounters[table] = state.tableSplitCounters[table] || 1
    customer.orderId = await ensureDisplaySeqBase(table, customer)

    const itemsToSave = cart.map((item) => {
      const nextItem = { ...item }
      delete nextItem.isNew
      return nextItem
    })

    const liveTable = await transactLiveTable(table, (current) =>
      buildLiveTable({
        cart: itemsToSave,
        incomingOrders: mapStoredIncomingOrders(current.incomingOrders),
        status: 'yellow',
        timerStartedAt,
        splitCounter: state.tableSplitCounters[table],
        batchCount: Math.max(state.tableBatchCounts[table] || 0, current.summary?.batchCount || 0),
        customer: {
          ...getLiveSummaryCustomer(current.summary),
          ...customer,
        },
        updatedAt: Date.now(),
      })
    )

    applyLiveTable(table, liveTable, currentTableSession?.table === table ? currentTableSession.mode : undefined)
    return {
      displaySeqBase: Number(customer.orderId) || 1,
    }
  }

  async function submitIncomingOrder(table: string, cart: PosCartItem[], customerInput: PosTableCustomer) {
    const requestId = toRequestId()
    const timestamp = Date.now()
    const next = await transactLiveTable(table, (current) => {
      const currentCart = mapCartLinesToItems(current.cart)
      const summaryCustomer = getLiveSummaryCustomer(current.summary)
      const batchId = (current.summary?.batchCount || 0) + 1
      const batchIdx = (batchId - 1) % 3
      const itemsToSend = cart.map((item, index) => ({
        ...item,
        isNew: true,
        batchIdx,
        incomingIdx: index,
      }))
      const incomingOrder: WritableIncomingOrder = {
        requestId,
        items: itemsToSend,
        customer: { name: customerInput.name || '', phone: customerInput.phone || '' },
        batchId,
        timestamp,
      }

      const queue = mapStoredIncomingOrders(current.incomingOrders) as WritableIncomingOrder[]
      queue.push(incomingOrder)
      return buildLiveTable({
        cart: currentCart,
        incomingOrders: queue,
        status: current.summary?.status || undefined,
        timerStartedAt: current.summary?.timerStartedAt || undefined,
        splitCounter: current.summary?.splitCounter || undefined,
        batchCount: batchId,
        customer: {
          ...summaryCustomer,
          name: customerInput.name || summaryCustomer.name || '',
          phone: customerInput.phone || summaryCustomer.phone || '',
        },
        updatedAt: timestamp,
      })
    })

    applyAuthorityState(table, next)
  }

  async function acceptIncomingOrder(table: string, requestId: string) {
    let accepted: StoredIncomingOrder | null = null
    const next = await transactLiveTable(table, (current) => {
      const stored = current.incomingOrders[requestId]
      if (!stored) return current
      accepted = stored

      const currentCart = mapCartLinesToItems(current.cart)
      const items = mapCartLinesToItems(stored.items).map((item, index) => ({
        ...item,
        batchId: stored.batchId,
        sentAt: stored.createdAt,
        incomingIdx: item.incomingIdx !== undefined ? item.incomingIdx : index,
      }))
      const customer = getLiveSummaryCustomer(current.summary)
      if (stored.customer?.name) customer.name = stored.customer.name
      if (stored.customer?.phone) customer.phone = stored.customer.phone
      customer.orderId = customer.orderId || current.summary?.displaySeqBase || undefined

      const remainingQueue = mapStoredIncomingOrders(
        Object.fromEntries(
          Object.entries(current.incomingOrders).filter(([queuedRequestId]) => queuedRequestId !== requestId)
        )
      )
      return buildLiveTable({
        cart: currentCart.concat(items),
        incomingOrders: remainingQueue,
        status: 'yellow',
        timerStartedAt: current.summary?.timerStartedAt || Date.now(),
        splitCounter: current.summary?.splitCounter || 1,
        batchCount: Math.max(current.summary?.batchCount || 0, stored.batchId || 0),
        customer,
        updatedAt: Date.now(),
      })
    })

    const acceptedOrder: StoredIncomingOrder | null = accepted
    if (!acceptedOrder || !next) return null
    const resolvedAcceptedOrder: StoredIncomingOrder = acceptedOrder
    if (!(next.summary?.displaySeqBase && next.summary.displaySeqBase > 0)) {
      const customer = getLiveSummaryCustomer(next.summary)
      customer.orderId = await ensureDisplaySeqBase(table, customer)
      const fixedLiveTable = buildLiveTable({
        cart: mapCartLinesToItems(next.cart),
        incomingOrders: mapStoredIncomingOrders(next.incomingOrders),
        status: next.summary?.status || undefined,
        timerStartedAt: next.summary?.timerStartedAt || undefined,
        splitCounter: next.summary?.splitCounter || undefined,
        batchCount: next.summary?.batchCount || undefined,
        customer,
        updatedAt: Date.now(),
      })
      await replaceLiveTable(table, fixedLiveTable)
      applyAuthorityState(table, fixedLiveTable)
      const acceptedItems = mapCartLinesToItems(resolvedAcceptedOrder.items).map((item, index) => ({
        ...item,
        batchId: resolvedAcceptedOrder.batchId,
        sentAt: resolvedAcceptedOrder.createdAt,
        incomingIdx: item.incomingIdx !== undefined ? item.incomingIdx : index,
      }))
      return {
        customer,
        items: acceptedItems,
        sentAt: resolvedAcceptedOrder.createdAt,
        displaySeqBase: Number(customer.orderId) || 1,
      }
    }

    applyAuthorityState(table, next)
    const customer = getLiveSummaryCustomer(next.summary)
    const items = mapCartLinesToItems(resolvedAcceptedOrder.items).map((item, index) => ({
      ...item,
      batchId: resolvedAcceptedOrder.batchId,
      sentAt: resolvedAcceptedOrder.createdAt,
      incomingIdx: item.incomingIdx !== undefined ? item.incomingIdx : index,
    }))
    return {
      customer,
      items,
      sentAt: resolvedAcceptedOrder.createdAt,
      displaySeqBase: Number(customer.orderId) || 1,
    }
  }

  async function rejectIncomingOrder(table: string, requestId: string) {
    const next = await transactLiveTable(table, (current) => {
      if (!current.incomingOrders[requestId]) return current
      return buildLiveTable({
        cart: mapCartLinesToItems(current.cart),
        incomingOrders: mapStoredIncomingOrders(
          Object.fromEntries(
            Object.entries(current.incomingOrders).filter(([queuedRequestId]) => queuedRequestId !== requestId)
          )
        ),
        status: current.summary?.status || undefined,
        timerStartedAt: current.summary?.timerStartedAt || undefined,
        splitCounter: current.summary?.splitCounter || undefined,
        batchCount: current.summary?.batchCount || undefined,
        customer: getLiveSummaryCustomer(current.summary),
        updatedAt: Date.now(),
      })
    })
    applyAuthorityState(table, next)
  }

  function createReportDeltaPayload(order: V3ClosedOrder, direction: 1 | -1) {
    const payload: Record<string, unknown> = {}
    const summaryRef = `${RTDB_V3_ROOT}/reports/dailyByMonth/${order.monthKey}/${order.bizDate}`
    payload[`${summaryRef}/orderCount`] = dbIncrement(direction)
    payload[`${summaryRef}/paidTotal`] = dbIncrement(direction * (order.totals?.paid || 0))
    payload[`${summaryRef}/originalTotal`] = dbIncrement(
      direction * (order.totals?.original || order.totals?.paid || 0)
    )
    payload[`${summaryRef}/updatedAt`] = Date.now()

    let categorizedRevenue = 0
    let itemQtyDelta = 0
    let barRevenueDelta = 0
    let barCostDelta = 0
    let bbqRevenueDelta = 0
    let bbqCostDelta = 0
    let unknownRevenueDelta = 0
    let unknownCostDelta = 0
    const itemStatDeltas = new Map<
      string,
      Pick<V3DailyItemStat, 'displayName' | 'type' | 'qty' | 'treatQty' | 'revenue' | 'cost'>
    >()

    for (const item of Object.values(order.items || {})) {
      itemQtyDelta += direction * item.qty
      categorizedRevenue += item.lineTotal
      if (item.type === 'bar') {
        barRevenueDelta += direction * item.lineTotal
        barCostDelta += direction * item.unitCost * item.qty
      } else if (item.type === 'bbq') {
        bbqRevenueDelta += direction * item.lineTotal
        bbqCostDelta += direction * item.unitCost * item.qty
      } else {
        unknownRevenueDelta += direction * item.lineTotal
        unknownCostDelta += direction * item.unitCost * item.qty
      }

      const current = itemStatDeltas.get(item.catalogKey) || {
        displayName: item.displayName,
        type: item.type,
        qty: 0,
        treatQty: 0,
        revenue: 0,
        cost: 0,
      }
      current.qty += direction * item.qty
      current.treatQty += direction * (item.isTreat ? item.qty : 0)
      current.revenue += direction * item.lineTotal
      current.cost += direction * item.unitCost * item.qty
      itemStatDeltas.set(item.catalogKey, current)
    }

    itemStatDeltas.forEach((delta, catalogKey) => {
      const statRef = `${RTDB_V3_ROOT}/reports/itemStatsByMonth/${order.monthKey}/${order.bizDate}/${catalogKey}`
      payload[`${statRef}/displayName`] = delta.displayName
      payload[`${statRef}/type`] = delta.type
      payload[`${statRef}/qty`] = dbIncrement(delta.qty)
      payload[`${statRef}/treatQty`] = dbIncrement(delta.treatQty)
      payload[`${statRef}/revenue`] = dbIncrement(delta.revenue)
      payload[`${statRef}/cost`] = dbIncrement(delta.cost)
      payload[`${statRef}/updatedAt`] = Date.now()
    })

    payload[`${summaryRef}/itemQtyTotal`] = dbIncrement(itemQtyDelta)
    payload[`${summaryRef}/barRevenue`] = dbIncrement(barRevenueDelta)
    payload[`${summaryRef}/barCost`] = dbIncrement(barCostDelta)
    payload[`${summaryRef}/bbqRevenue`] = dbIncrement(bbqRevenueDelta)
    payload[`${summaryRef}/bbqCost`] = dbIncrement(bbqCostDelta)
    payload[`${summaryRef}/unknownRevenue`] = dbIncrement(unknownRevenueDelta)
    payload[`${summaryRef}/unknownCost`] = dbIncrement(unknownCostDelta)
    payload[`${summaryRef}/extraRevenue`] = dbIncrement(direction * ((order.totals?.paid || 0) - categorizedRevenue))
    touchRevision(`reports/dailyByDay/${order.bizDate}`, payload)
    touchRevision(`reports/itemStatsByDay/${order.bizDate}`, payload)
    return payload
  }

  function updateLocalReportCaches(order: V3ClosedOrder, direction: 1 | -1) {
    const currentDayOrders = { ...(historyDayCache.get(order.bizDate) || {}) }
    if (direction > 0) currentDayOrders[order.orderId] = order
    else delete currentDayOrders[order.orderId]
    const rebuilt = buildSummaryFromClosedOrders(currentDayOrders, Date.now())
    historyDayCache.set(order.bizDate, currentDayOrders)
    dailySummaryDayCache.set(order.bizDate, rebuilt.summary || createDailySummary())
    itemStatsDayCache.set(order.bizDate, rebuilt.itemStats || {})
  }

  async function finalizeCheckout(payload: CheckoutPayload) {
    const customer = state.tableCustomers[payload.table] || payload.customer || {}
    const displaySeqBase = await ensureDisplaySeqBase(payload.table, customer)
    const order = toClosedOrderRecord({
      orderId: toOrderId(),
      table: payload.splitCounter && payload.splitCounter > 1 ? `${payload.table} (拆單)` : payload.table,
      displaySeqBase,
      splitCounter: payload.splitCounter,
      closedAt: Date.now(),
      items: payload.cart,
      paidTotal: payload.paidTotal,
      originalTotal: payload.originalTotal,
      customer,
      itemCosts: state.itemCosts,
    })

    const nextCart = payload.remainingCart || []
    let nextLiveTable: V3LiveTable | null = null

    await transactLiveTable(
      payload.table,
      (current) => {
        const incomingOrders = mapStoredIncomingOrders(current.incomingOrders)
        nextLiveTable =
          payload.clearTable && incomingOrders.length === 0
            ? null
            : buildLiveTable({
                cart: nextCart,
                incomingOrders,
                status: nextCart.length > 0 ? 'yellow' : current.summary?.status || undefined,
                timerStartedAt:
                  nextCart.length > 0 ? current.summary?.timerStartedAt || state.tableTimers[payload.table] : undefined,
                splitCounter: nextCart.length > 0 ? payload.nextSplitCounter : 1,
                batchCount: current.summary?.batchCount || state.tableBatchCounts[payload.table] || 0,
                customer: nextCart.length > 0 ? customer : incomingOrders.length > 0 ? customer : undefined,
                updatedAt: Date.now(),
              })
        return nextLiveTable
      },
      { persistDerivedIndexes: false }
    )

    const dbPayload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/history/ordersByMonth/${order.monthKey}/${order.bizDate}/${order.orderId}`]: order,
      ...createReportDeltaPayload(order, 1),
    }
    writeLiveTableAuthority(payload.table, nextLiveTable, dbPayload, { writeAuthority: false })
    touchRevision(`history/ordersByDay/${order.bizDate}`, dbPayload)

    await updateRoot(dbPayload)
    const cachedDay = historyDayCache.get(order.bizDate) || {}
    historyDayCache.set(order.bizDate, {
      ...cachedDay,
      [order.orderId]: order,
    })
    updateLocalReportCaches(order, 1)
    applyAuthorityState(payload.table, nextLiveTable)

    return orderRecordToPosOrder(order)
  }

  async function checkoutTable(payload: Omit<CheckoutPayload, 'clearTable'>) {
    return finalizeCheckout({ ...payload, clearTable: true, remainingCart: [], nextSplitCounter: 1 })
  }

  async function checkoutSplit(payload: Omit<CheckoutPayload, 'clearTable'>) {
    return finalizeCheckout({
      ...payload,
      clearTable: (payload.remainingCart || []).length === 0,
    })
  }

  async function deleteClosedOrder(order: PosOrder) {
    const orderId = String(order.orderId || '')
    const monthKey = String(order.monthKey || '') as V3MonthKey
    const bizDate = String(order.bizDateKey || '') as V3BizDateKey
    if (!orderId || !monthKey || !bizDate) {
      throw new Error('Order metadata missing')
    }

    const snapshot = await db
      .ref(`${RTDB_V3_ROOT}/history/ordersByMonth/${monthKey}/${bizDate}/${orderId}`)
      .once('value')
    const stored = snapshot.val() as V3ClosedOrder | null
    if (!stored) return

    const currentDayOrders = { ...(await fetchHistoryBizDate(bizDate)) }
    delete currentDayOrders[orderId]
    const rebuilt = buildSummaryFromClosedOrders(currentDayOrders, Date.now())
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/history/ordersByMonth/${monthKey}/${bizDate}/${orderId}`]: null,
      [`${RTDB_V3_ROOT}/reports/dailyByMonth/${monthKey}/${bizDate}`]: rebuilt.summary,
      [`${RTDB_V3_ROOT}/reports/itemStatsByMonth/${monthKey}/${bizDate}`]: rebuilt.itemStats,
    }
    touchRevision(`history/ordersByDay/${bizDate}`, payload)
    touchRevision(`reports/dailyByDay/${bizDate}`, payload)
    touchRevision(`reports/itemStatsByDay/${bizDate}`, payload)
    await updateRoot(payload)

    historyDayCache.set(bizDate, currentDayOrders)
    dailySummaryDayCache.set(bizDate, rebuilt.summary || createDailySummary())
    itemStatsDayCache.set(bizDate, rebuilt.itemStats || {})
  }

  async function setOwnerPassword(ownerName: string, record: PosOwnerAuthRecord) {
    state.ownerPasswords[ownerName] = record
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/auth/owners/${ownerName}`]: record as V3OwnerAuthRecord,
    }
    touchRevision('auth/owners', payload)
    await updateRoot(payload)
  }

  async function updateCatalogValue(segment: V3CatalogSegment, path: string, value: unknown) {
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/catalog/${segment}/${path}`]: value,
    }
    touchRevision(`catalog/${segment}`, payload)
    await updateRoot(payload)
  }

  async function updateInventory(name: string, isAvailable: boolean) {
    state.inventory[name] = isAvailable
    await updateCatalogValue('inventory', name, isAvailable)
  }

  async function updateInventoryBatch(entries: Record<string, boolean>) {
    const payload: Record<string, unknown> = {}
    for (const [name, isAvailable] of Object.entries(entries)) {
      state.inventory[name] = isAvailable
      payload[`${RTDB_V3_ROOT}/catalog/inventory/${name}`] = isAvailable
    }
    touchRevision('catalog/inventory', payload)
    await updateRoot(payload)
  }

  async function updateItemPrice(name: string, value: number | string) {
    state.itemPrices[name] = value
    await updateCatalogValue('prices', name, value)
  }

  async function updateItemCost(name: string, value: number) {
    state.itemCosts[name] = value
    await updateCatalogValue('costs', name, value)
  }

  return {
    acceptIncomingOrder,
    checkoutSplit,
    checkoutTable,
    deleteClosedOrder,
    ensureCatalog,
    ensureOwnerAuth,
    ensureAttendanceFullHistory,
    ensureAttendanceWindow,
    listClosedOrdersByDay,
    listClosedOrdersByRange,
    loadDailySummariesRange,
    loadItemStatsRange,
    readDailySummariesRange,
    readItemStatsRange,
    rejectIncomingOrder,
    saveAttendanceUpdates,
    saveTableDraft,
    setOwnerPassword,
    startStaffLive,
    startTableLiveSession,
    stopTableLiveSession,
    submitIncomingOrder,
    updateInventory,
    updateInventoryBatch,
    updateItemCost,
    updateItemPrice,
    watchAttendanceWindow,
    watchCatalogRevision,
    watchClosedOrdersRange,
    watchDailySummariesRange,
    watchItemStatsRange,
    watchOwnerAuthRevision,
  }
}
