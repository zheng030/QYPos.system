import type { PosCatalogHelpers } from '@/features/pos-kernel/service'
import type {
  PosCategoryKey,
  PosCourseKind,
  PosKitchenStation,
  PosLineRole,
  PosOrder,
  PosOrderBatch,
  PosOrderEntry,
  PosOrderLine,
  PosTableCustomer,
} from '@/features/pos-kernel/types'
import type { AttendanceRecord } from '@/shared/attendance-service'
import { getBusinessDateKey, getBusinessDayRange } from '@/shared/business-day'
import { encodeRtdbKeySegment } from './rtdb-v3-key-codec'
import type {
  V3BizDateKey,
  V3ClosedOrder,
  V3ClosedOrderEntry,
  V3ClosedOrderLine,
  V3DailyItemStat,
  V3DailySummary,
  V3LiveTable,
  V3MonthKey,
  V3OrderBatch,
  V3OrderEntry,
  V3OrderLine,
  V3PendingSummary,
  V3TableSummary,
} from './rtdb-v3-types'

export function parseRequestSeqFromLabel(requestLabel: string | null | undefined) {
  const match = String(requestLabel || '').match(/-(\d+)$/)
  if (!match) return 0
  const value = Number.parseInt(match[1] || '', 10)
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function resolveStoredBatchRequestSeq(batch: Pick<V3OrderBatch, 'requestLabel' | 'requestSeq'>) {
  const direct =
    typeof batch.requestSeq === 'number' ? batch.requestSeq : Number.parseInt(String(batch.requestSeq || ''), 10)
  if (Number.isFinite(direct) && direct > 0) {
    return direct
  }
  return parseRequestSeqFromLabel(batch.requestLabel)
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function getBizDateKey(value: Date | string | number): V3BizDateKey {
  return getBusinessDateKey(value) as V3BizDateKey
}

export function getMonthKeyFromBizDate(bizDate: V3BizDateKey): V3MonthKey {
  return bizDate.slice(0, 7) as V3MonthKey
}

export function getMonthKey(value: Date | string | number): V3MonthKey {
  return getMonthKeyFromBizDate(getBizDateKey(value))
}

export function getMonthKeysBetween(start: Date, endExclusive: Date): V3MonthKey[] {
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const end = new Date(endExclusive.getFullYear(), endExclusive.getMonth(), 1)
  const keys: V3MonthKey[] = []
  while (cursor <= end) {
    keys.push(`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}` as V3MonthKey)
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return keys
}

export function getBizDateKeysBetween(start: Date, endExclusive: Date): V3BizDateKey[] {
  if (endExclusive.getTime() <= start.getTime()) return []
  const keys: V3BizDateKey[] = []
  const { start: alignedStart } = getBusinessDayRange(start)
  const cursor = new Date(alignedStart)
  while (cursor.getTime() < endExclusive.getTime()) {
    keys.push(getBizDateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

export function normalizeCustomer(customer: PosTableCustomer | undefined) {
  return {
    name: customer?.name || '',
    phone: customer?.phone || '',
  }
}

export function mapLineToStored(line: PosOrderLine): V3OrderLine {
  return { ...line }
}

export function mapStoredLine(line: V3OrderLine): PosOrderLine {
  return {
    ...line,
    role: line.role as PosLineRole,
    categoryKey: line.categoryKey as PosCategoryKey,
    station: line.station as PosKitchenStation,
    courseKind: line.courseKind as PosCourseKind,
  }
}

export function mapClosedOrderLineToStored(line: PosOrderLine, unitCost: number): V3ClosedOrderLine {
  return {
    ...line,
    unitCost,
  }
}

export function mapEntryToStored(entry: PosOrderEntry): V3OrderEntry {
  return {
    ...entry,
    lines: Object.fromEntries(entry.lines.map((line) => [encodeRtdbKeySegment(line.lineId), mapLineToStored(line)])),
  }
}

export function mapClosedEntryToStored(
  entry: PosOrderEntry,
  itemCosts: Record<string, number | undefined>
): V3ClosedOrderEntry {
  return {
    ...entry,
    lines: Object.fromEntries(
      entry.lines.map((line) => [
        encodeRtdbKeySegment(line.lineId),
        mapClosedOrderLineToStored(line, Number(itemCosts[line.inventoryKey] ?? 0)),
      ])
    ),
  }
}

export function mapStoredEntry(
  entry: V3OrderEntry,
  normalizeEntryForDisplay?: PosCatalogHelpers['normalizeEntryForDisplay']
): PosOrderEntry {
  const mapped = {
    ...entry,
    categoryKey: entry.categoryKey as PosCategoryKey,
    lines: Object.values(entry.lines || {})
      .sort((left, right) => {
        if (!left.parentLineId && right.parentLineId) return -1
        if (left.parentLineId && !right.parentLineId) return 1
        if (left.groupId !== right.groupId) return left.groupId.localeCompare(right.groupId)
        return left.lineId.localeCompare(right.lineId)
      })
      .map((line) => mapStoredLine(line)),
  }
  return normalizeEntryForDisplay ? normalizeEntryForDisplay(mapped) : mapped
}

export function mapStoredClosedEntry(
  entry: V3ClosedOrderEntry,
  normalizeEntryForDisplay?: PosCatalogHelpers['normalizeEntryForDisplay']
): PosOrderEntry {
  return mapStoredEntry(entry, normalizeEntryForDisplay)
}

export function getStoredClosedOrderLines(order: V3ClosedOrder): V3ClosedOrderLine[] {
  return Object.values(order.entries || {}).flatMap((entry) => Object.values(entry.lines || {}))
}

export function mapBatchToStored(batch: PosOrderBatch): V3OrderBatch {
  return {
    ...batch,
    requestSeq: batch.requestSeq,
    customer: normalizeCustomer(batch.customer),
    entries: Object.fromEntries(
      batch.entries.map((entry) => [encodeRtdbKeySegment(entry.entryId), mapEntryToStored(entry)])
    ),
  }
}

export function mapStoredBatch(
  batch: V3OrderBatch,
  normalizeEntryForDisplay?: PosCatalogHelpers['normalizeEntryForDisplay']
): PosOrderBatch {
  return {
    ...batch,
    requestSeq: resolveStoredBatchRequestSeq(batch),
    entries: Object.entries(batch.entries || {})
      .sort(([, left], [, right]) => left.createdAt - right.createdAt)
      .map(([, entry]) => mapStoredEntry(entry, normalizeEntryForDisplay)),
  }
}

export function buildPendingSummary(batches: Record<string, V3OrderBatch> | undefined): V3PendingSummary | null {
  const queue = Object.values(batches || {}).sort((left, right) => left.createdAt - right.createdAt)
  if (queue.length === 0) return null
  const firstBatch = queue[0]
  return {
    pendingCount: queue.length,
    firstBatch: {
      batchId: firstBatch.batchId,
      requestSeq: resolveStoredBatchRequestSeq(firstBatch),
      createdAt: firstBatch.createdAt,
      requestLabel: firstBatch.requestLabel,
      itemPreview: Object.values(firstBatch.entries || {})
        .slice(0, 3)
        .map((entry) => ({
          title: entry.summary?.title || entry.shortName,
          quantityLabel: entry.summary?.quantityLabel || `${entry.quantity || 1} 份`,
        })),
    },
  }
}

export function createEmptyLiveTable(): V3LiveTable {
  return {
    summary: null,
    draft: {},
    pendingBatches: {},
    submittedBatches: {},
  }
}

export function buildLiveTable(params: {
  draft?: PosOrderEntry[]
  pendingBatches?: PosOrderBatch[]
  submittedBatches?: PosOrderBatch[]
  timerStartedAt?: number
  draftEntryCount?: number
  pendingBatchCount?: number
  submittedBatchCount?: number
  nextRequestSeq?: number
  nextSplitCounter?: number
  customer?: PosTableCustomer
  updatedAt?: number
}) {
  const {
    draft = [],
    pendingBatches = [],
    submittedBatches = [],
    timerStartedAt,
    draftEntryCount = draft.length,
    pendingBatchCount = pendingBatches.length,
    submittedBatchCount = submittedBatches.length,
    nextRequestSeq,
    nextSplitCounter,
    customer,
    updatedAt = Date.now(),
  } = params

  const summary =
    draft.length > 0 ||
    pendingBatches.length > 0 ||
    submittedBatches.length > 0 ||
    timerStartedAt ||
    customer ||
    nextRequestSeq ||
    nextSplitCounter
      ? buildTableSummary({
          timerStartedAt,
          draftEntryCount,
          pendingBatchCount,
          submittedBatchCount,
          nextRequestSeq,
          nextSplitCounter,
          customer,
          updatedAt,
        })
      : null

  return {
    summary,
    draft: Object.fromEntries(draft.map((entry) => [encodeRtdbKeySegment(entry.entryId), mapEntryToStored(entry)])),
    pendingBatches: Object.fromEntries(
      pendingBatches.map((batch) => [encodeRtdbKeySegment(batch.batchId), mapBatchToStored(batch)])
    ),
    submittedBatches: Object.fromEntries(
      submittedBatches.map((batch) => [encodeRtdbKeySegment(batch.batchId), mapBatchToStored(batch)])
    ),
  } satisfies V3LiveTable
}

export function buildTableSummary(params: {
  timerStartedAt?: number
  draftEntryCount?: number
  pendingBatchCount?: number
  submittedBatchCount?: number
  nextRequestSeq?: number
  nextSplitCounter?: number
  customer?: PosTableCustomer
  updatedAt?: number
}) {
  const {
    timerStartedAt,
    draftEntryCount = 0,
    pendingBatchCount = 0,
    submittedBatchCount = 0,
    nextRequestSeq,
    nextSplitCounter,
    customer,
    updatedAt = Date.now(),
  } = params
  const orderId = customer?.orderId
  const displaySeqBase =
    typeof orderId === 'number' ? orderId : typeof orderId === 'string' ? parseInt(orderId, 10) || null : null

  return {
    timerStartedAt: timerStartedAt ?? null,
    displaySeqBase,
    draftEntryCount,
    pendingBatchCount,
    submittedBatchCount,
    nextRequestSeq: nextRequestSeq && nextRequestSeq > 1 ? nextRequestSeq : null,
    nextSplitCounter: nextSplitCounter && nextSplitCounter > 1 ? nextSplitCounter : null,
    customer: normalizeCustomer(customer),
    updatedAt,
  } satisfies V3TableSummary
}

export function createDailySummary(): V3DailySummary {
  return {
    orderCount: 0,
    paidTotal: 0,
    originalTotal: 0,
    itemQtyTotal: 0,
    categoryRevenue: {},
    categoryCost: {},
    updatedAt: 0,
  }
}

export function cloneItemStat(displayName: string, categoryKey: string): V3DailyItemStat {
  return {
    displayName,
    categoryKey,
    qty: 0,
    revenue: 0,
    cost: 0,
    updatedAt: 0,
  }
}

export function orderRecordToPosOrder(
  order: V3ClosedOrder,
  normalizeEntryForDisplay?: PosCatalogHelpers['normalizeEntryForDisplay']
): PosOrder {
  const entries = Object.values(order.entries || {})
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((entry) => mapStoredClosedEntry(entry, normalizeEntryForDisplay))

  const lines = entries
    .flatMap((entry) => entry.lines)
    .sort((left, right) => {
      if (!left.parentLineId && right.parentLineId) return -1
      if (left.parentLineId && !right.parentLineId) return 1
      if (left.groupId !== right.groupId) return left.groupId.localeCompare(right.groupId)
      return left.lineId.localeCompare(right.lineId)
    })

  return {
    orderId: order.orderId,
    bizDateKey: order.bizDate,
    monthKey: order.monthKey,
    table: order.tableLabel,
    seat: order.tableLabel,
    formattedSeq: order.displaySeqLabel,
    seq: order.displaySeqBase,
    splitCounter: order.splitCounter ?? undefined,
    time: new Date(order.closedAt || order.createdAt).toLocaleString('zh-TW', { hour12: false }),
    timestamp: order.closedAt || order.createdAt,
    customerName: order.customer?.name || '',
    customerPhone: order.customer?.phone || '',
    subtotal: order.totals?.original || order.totals?.paid || 0,
    total: order.totals?.paid || 0,
    originalTotal: order.totals?.original || order.totals?.paid || 0,
    batchIds: order.batchIds || [],
    entries,
    lines,
    isClosed: true,
  }
}

export function applyClosedOrderToSummary(
  summary: V3DailySummary,
  itemStats: Record<string, V3DailyItemStat>,
  order: V3ClosedOrder,
  direction: 1 | -1,
  updatedAt = Date.now()
) {
  const nextSummary = {
    ...summary,
    categoryRevenue: { ...(summary.categoryRevenue || {}) },
    categoryCost: { ...(summary.categoryCost || {}) },
  }
  const nextItemStats = { ...itemStats }

  nextSummary.orderCount += direction
  nextSummary.paidTotal += direction * (order.totals?.paid || 0)
  nextSummary.originalTotal += direction * (order.totals?.original || order.totals?.paid || 0)
  let categorizedRevenue = 0

  getStoredClosedOrderLines(order).forEach((line) => {
    const typed = line as V3ClosedOrderLine
    const statKey = typed.catalogKey
    const current = nextItemStats[statKey] || cloneItemStat(typed.shortName || typed.displayName, typed.categoryKey)
    current.qty += direction * typed.quantity
    current.revenue += direction * typed.lineTotal
    current.cost += direction * typed.unitCost * typed.quantity
    current.updatedAt = updatedAt
    if (current.qty <= 0 && current.revenue <= 0 && current.cost <= 0) {
      delete nextItemStats[statKey]
    } else {
      nextItemStats[statKey] = current
    }

    nextSummary.itemQtyTotal += direction * typed.quantity
    categorizedRevenue += typed.lineTotal
    nextSummary.categoryRevenue[typed.categoryKey] =
      Number(nextSummary.categoryRevenue[typed.categoryKey] || 0) + direction * typed.lineTotal
    nextSummary.categoryCost[typed.categoryKey] =
      Number(nextSummary.categoryCost[typed.categoryKey] || 0) + direction * typed.unitCost * typed.quantity
  })

  const extraRevenue = (order.totals?.paid || 0) - categorizedRevenue
  if (extraRevenue !== 0) {
    nextSummary.categoryRevenue.extra = Number(nextSummary.categoryRevenue.extra || 0) + direction * extraRevenue
  }

  nextSummary.updatedAt = updatedAt
  return {
    summary: nextSummary,
    itemStats: nextItemStats,
  }
}

export function buildSummaryFromClosedOrders(
  orders: Record<string, V3ClosedOrder>,
  updatedAt = Date.now()
): { summary: V3DailySummary | null; itemStats: Record<string, V3DailyItemStat> | null } {
  let summary = createDailySummary()
  let itemStats: Record<string, V3DailyItemStat> = {}

  for (const order of Object.values(orders || {})) {
    const next = applyClosedOrderToSummary(summary, itemStats, order, 1, updatedAt)
    summary = next.summary
    itemStats = next.itemStats
  }

  const hasOrders = Object.keys(orders || {}).length > 0
  return {
    summary: hasOrders ? summary : null,
    itemStats: hasOrders ? itemStats : null,
  }
}

export function toClosedOrderRecord(params: {
  orderId: string
  table: string
  displaySeqBase: number
  splitCounter: number | null
  closedAt: number
  customer: PosTableCustomer | undefined
  batchIds: string[]
  entries: PosOrderEntry[]
  itemCosts: Record<string, number | undefined>
  paidTotal?: number
  originalTotal?: number
}): V3ClosedOrder {
  const bizDate = getBizDateKey(params.closedAt)
  const monthKey = getMonthKeyFromBizDate(bizDate)
  const splitCounter = params.splitCounter && params.splitCounter > 0 ? params.splitCounter : null
  const displaySeqLabel = splitCounter ? `${params.displaySeqBase}-${splitCounter}` : String(params.displaySeqBase)

  return {
    orderId: params.orderId,
    bizDate,
    monthKey,
    createdAt: params.closedAt,
    closedAt: params.closedAt,
    tableLabel: params.table,
    displaySeqBase: params.displaySeqBase,
    splitCounter,
    displaySeqLabel,
    customer: normalizeCustomer(params.customer),
    totals: {
      paid: params.paidTotal ?? params.entries.reduce((sum, entry) => sum + entry.subtotal, 0),
      original: params.originalTotal ?? params.entries.reduce((sum, entry) => sum + entry.subtotal, 0),
    },
    status: 'closed',
    batchIds: params.batchIds,
    entries: Object.fromEntries(
      params.entries.map((entry) => [
        encodeRtdbKeySegment(entry.entryId),
        mapClosedEntryToStored(entry, params.itemCosts),
      ])
    ),
  }
}

export function buildAttendanceRecordsByMonth(records: Record<string, AttendanceRecord>) {
  const recordsByMonth: Record<V3MonthKey, Record<string, AttendanceRecord>> = {} as Record<
    V3MonthKey,
    Record<string, AttendanceRecord>
  >

  for (const [recordId, record] of Object.entries(records || {})) {
    const monthKey = getMonthKey(record.ts)
    if (!recordsByMonth[monthKey]) recordsByMonth[monthKey] = {}
    recordsByMonth[monthKey][recordId] = { ...record }
  }

  return recordsByMonth
}
