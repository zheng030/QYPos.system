import { getMergedItems, stripHiddenTag } from '@/features/pos-kernel/item-helpers'

import type { PosCartItem, PosIncomingOrder, PosOrder, PosTableCustomer } from '@/features/pos-kernel/types'
import type { AttendanceRecord } from '@/shared/attendance-service'

import type {
  V3BizDateKey,
  V3CartLine,
  V3CatalogKey,
  V3ClosedOrder,
  V3ClosedOrderItem,
  V3DailyItemStat,
  V3DailySummary,
  V3IncomingOrder,
  V3IncomingOrderHead,
  V3IncomingPreviewItem,
  V3LiveTable,
  V3MonthKey,
  V3PendingSummary,
  V3TableSummary,
} from './rtdb-v3-types'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function getBizDateKey(value: Date | string | number): V3BizDateKey {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${String(value)}`)
  }
  if (date.getHours() < 5) {
    date.setDate(date.getDate() - 1)
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
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
  const cursor = new Date(start)
  cursor.setHours(5, 0, 0, 0)
  const end = new Date(endExclusive)
  while (cursor.getTime() < end.getTime()) {
    keys.push(getBizDateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

export function getCatalogKey(name: string, variant?: string): V3CatalogKey {
  const baseName = stripHiddenTag(
    String(name || '')
      .replace(/\s*\(招待\)$/, '')
      .trim()
  )
  if (!baseName) return ''
  return variant ? `${baseName}::${variant}` : baseName
}

export function normalizeCustomer(customer: PosTableCustomer | undefined) {
  return {
    name: customer?.name || '',
    phone: customer?.phone || '',
  }
}

export function buildCartLines(items: PosCartItem[]): Record<string, V3CartLine> {
  const lines: Record<string, V3CartLine> = {}
  items.forEach((item, index) => {
    lines[`line_${index + 1}`] = {
      position: index,
      displayName: item.name,
      catalogKey: getCatalogKey(item.name, item.variant),
      type: item.type || 'unknown',
      variant: item.variant,
      flavor: item.flavor ?? null,
      unitPrice: item.price,
      isTreat: Boolean(item.isTreat),
      batchId: item.batchId,
      batchIdx: item.batchIdx,
      sentAt: item.sentAt,
      incomingIdx: item.incomingIdx,
      isSent: item.isSent,
    }
  })
  return lines
}

export function mapCartLinesToItems(lines: Record<string, V3CartLine> | undefined): PosCartItem[] {
  return Object.values(lines || {})
    .sort((left, right) => (left.position || 0) - (right.position || 0))
    .map((line) => ({
      name: line.displayName,
      price: line.unitPrice,
      type: line.type,
      variant: line.variant,
      flavor: line.flavor ?? null,
      isTreat: Boolean(line.isTreat),
      batchId: line.batchId,
      batchIdx: line.batchIdx,
      sentAt: line.sentAt,
      incomingIdx: line.incomingIdx,
      isSent: line.isSent,
    }))
}

export function buildIncomingOrderHead(requestId: string, entry: PosIncomingOrder): V3IncomingOrderHead {
  return {
    requestId,
    createdAt: entry.timestamp || Date.now(),
    batchId: Number(entry.batchId) || 1,
    customer: normalizeCustomer(entry.customer),
    previewItems: buildIncomingPreviewItems(Array.isArray(entry.items) ? entry.items : []),
  }
}

export function buildIncomingOrderRecord(requestId: string, entry: PosIncomingOrder): V3IncomingOrder {
  return {
    requestId,
    createdAt: entry.timestamp || Date.now(),
    batchId: Number(entry.batchId) || 1,
    customer: normalizeCustomer(entry.customer),
    items: buildCartLines(Array.isArray(entry.items) ? entry.items : []),
  }
}

export function incomingOrderRecordToHead(order: V3IncomingOrder): V3IncomingOrderHead {
  return {
    requestId: order.requestId,
    createdAt: order.createdAt,
    batchId: order.batchId,
    customer: normalizeCustomer(order.customer),
    previewItems: buildIncomingPreviewItems(mapCartLinesToItems(order.items)),
  }
}

export function buildPendingSummary(orders: Record<string, V3IncomingOrder> | undefined): V3PendingSummary | null {
  const queue = Object.values(orders || {}).sort((left, right) => left.createdAt - right.createdAt)
  if (queue.length === 0) {
    return null
  }
  return {
    pendingCount: queue.length,
    firstOrder: incomingOrderRecordToHead(queue[0]),
  }
}

export function createEmptyLiveTable(): V3LiveTable {
  return {
    summary: null,
    cart: {},
    incomingOrders: {},
  }
}

export function buildLiveTable(params: {
  cart?: PosCartItem[]
  incomingOrders?: PosIncomingOrder[]
  status?: string
  timerStartedAt?: number
  splitCounter?: number
  batchCount?: number
  customer?: PosTableCustomer
  updatedAt?: number
}) {
  const {
    cart = [],
    incomingOrders = [],
    status,
    timerStartedAt,
    splitCounter,
    batchCount,
    customer,
    updatedAt = Date.now(),
  } = params

  const summary =
    cart.length > 0 ||
    status ||
    timerStartedAt ||
    (customer?.orderId ?? null) !== null ||
    batchCount ||
    incomingOrders.length > 0
      ? buildTableSummary({
          cart,
          status,
          timerStartedAt,
          splitCounter,
          batchCount,
          customer,
          updatedAt,
        })
      : null

  const incomingMap: Record<string, V3IncomingOrder> = {}
  incomingOrders.forEach((entry, index) => {
    const requestId = String(entry.requestId || `req_${entry.timestamp || updatedAt}_${index + 1}`)
    incomingMap[requestId] = buildIncomingOrderRecord(requestId, entry)
  })

  return {
    summary,
    cart: buildCartLines(cart),
    incomingOrders: incomingMap,
  } satisfies V3LiveTable
}

export function buildIncomingPreviewItems(items: PosCartItem[]): Record<string, V3IncomingPreviewItem> {
  const preview: Record<string, V3IncomingPreviewItem> = {}
  items.forEach((item, index) => {
    preview[`item_${index + 1}`] = {
      position: index,
      displayName: item.name,
      unitPrice: item.price,
    }
  })
  return preview
}

export function incomingHeadToPreviewOrder(head: V3IncomingOrderHead): PosIncomingOrder {
  const items = Object.values(head.previewItems || {})
    .sort((left, right) => (left.position || 0) - (right.position || 0))
    .map((item) => ({
      name: item.displayName,
      price: item.unitPrice,
    }))

  return {
    requestId: head.requestId,
    items,
    customer: {
      name: head.customer?.name || '',
      phone: head.customer?.phone || '',
    },
    batchId: head.batchId,
    timestamp: head.createdAt,
  } as PosIncomingOrder
}

export function buildTableSummary(params: {
  cart: PosCartItem[]
  status?: string
  timerStartedAt?: number
  splitCounter?: number
  batchCount?: number
  customer?: PosTableCustomer
  updatedAt?: number
}) {
  const { status, timerStartedAt, splitCounter, batchCount, customer, updatedAt = Date.now() } = params
  const orderId = customer?.orderId
  const displaySeqBase =
    typeof orderId === 'number' ? orderId : typeof orderId === 'string' ? parseInt(orderId, 10) || null : null

  return {
    status: status || null,
    timerStartedAt: timerStartedAt ?? null,
    displaySeqBase,
    splitCounter: splitCounter ?? 1,
    batchCount: batchCount ?? 0,
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
    barRevenue: 0,
    bbqRevenue: 0,
    unknownRevenue: 0,
    extraRevenue: 0,
    barCost: 0,
    bbqCost: 0,
    unknownCost: 0,
    updatedAt: 0,
  }
}

export function cloneItemStat(displayName: string, type: string): V3DailyItemStat {
  return {
    displayName,
    type,
    qty: 0,
    treatQty: 0,
    revenue: 0,
    cost: 0,
    updatedAt: 0,
  }
}

export function getItemCost(costs: Record<string, number | undefined>, item: PosCartItem) {
  const variantKey = getCatalogKey(item.name, item.variant)
  const baseKey = getCatalogKey(item.name)
  return Number(costs[variantKey] ?? costs[baseKey] ?? 0)
}

export function buildClosedOrderItem(
  item: PosCartItem,
  index: number,
  qty: number,
  unitCost: number,
  displayName: string,
  type: string
): V3ClosedOrderItem {
  const unitPrice = typeof item.price === 'number' ? item.price : Number(item.price) || 0
  const paidQty = item.isTreat ? 0 : qty
  return {
    position: index,
    displayName,
    catalogKey: getCatalogKey(displayName, item.variant),
    type,
    variant: item.variant,
    flavor: item.flavor ?? null,
    qty,
    unitPrice,
    unitCost,
    lineTotal: unitPrice * paidQty,
    isTreat: Boolean(item.isTreat),
  }
}

export function orderRecordToPosOrder(order: V3ClosedOrder): PosOrder {
  return {
    orderId: order.orderId,
    bizDateKey: order.bizDate,
    monthKey: order.monthKey,
    seat: order.tableLabel,
    table: order.tableLabel,
    formattedSeq: order.displaySeqLabel,
    seq: order.displaySeqBase,
    splitCounter: order.splitCounter ?? undefined,
    time: new Date(order.closedAt || order.createdAt).toLocaleString('zh-TW', { hour12: false }),
    timestamp: order.closedAt || order.createdAt,
    items: Object.values(order.items || {})
      .sort((left, right) => (left.position || 0) - (right.position || 0))
      .map((item) => ({
        name: item.displayName,
        price: item.unitPrice,
        type: item.type,
        variant: item.variant,
        flavor: item.flavor ?? null,
        isTreat: Boolean(item.isTreat),
        count: item.qty,
      })),
    total: order.totals?.paid || 0,
    originalTotal: order.totals?.original || order.totals?.paid || 0,
    customerName: order.customer?.name || '',
    customerPhone: order.customer?.phone || '',
    isClosed: true,
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

export function flattenOrdersByRange(
  ordersByMonth: Record<V3MonthKey, Record<V3BizDateKey, Record<string, V3ClosedOrder>>>,
  start: Date,
  endExclusive: Date
) {
  const startTs = start.getTime()
  const endTs = endExclusive.getTime()
  const orders: PosOrder[] = []
  for (const month of Object.values(ordersByMonth || {})) {
    for (const day of Object.values(month || {})) {
      for (const order of Object.values(day || {})) {
        const closedOrder = order as V3ClosedOrder
        const closedAt = closedOrder.closedAt || closedOrder.createdAt
        if (closedAt < startTs || closedAt >= endTs) continue
        orders.push(orderRecordToPosOrder(closedOrder))
      }
    }
  }
  return orders.sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())
}

export function applyClosedOrderToSummary(
  summary: V3DailySummary,
  itemStats: Record<string, V3DailyItemStat>,
  order: V3ClosedOrder,
  direction: 1 | -1,
  updatedAt = Date.now()
) {
  const nextSummary = { ...summary }
  const nextItemStats = { ...itemStats }
  nextSummary.orderCount += direction
  nextSummary.paidTotal += direction * (order.totals?.paid || 0)
  nextSummary.originalTotal += direction * (order.totals?.original || order.totals?.paid || 0)

  let categorizedRevenue = 0
  for (const item of Object.values(order.items || {})) {
    const typed = item as V3ClosedOrderItem
    const statKey = typed.catalogKey
    const current = nextItemStats[statKey] || cloneItemStat(typed.displayName, typed.type)
    current.qty += direction * typed.qty
    current.treatQty += direction * (typed.isTreat ? typed.qty : 0)
    current.revenue += direction * typed.lineTotal
    current.cost += direction * typed.unitCost * typed.qty
    current.updatedAt = updatedAt
    if (current.qty <= 0 && current.revenue <= 0 && current.cost <= 0) {
      delete nextItemStats[statKey]
    } else {
      nextItemStats[statKey] = current
    }

    nextSummary.itemQtyTotal += direction * typed.qty
    const lineCost = typed.unitCost * typed.qty
    categorizedRevenue += typed.lineTotal
    if (typed.type === 'bar') {
      nextSummary.barRevenue += direction * typed.lineTotal
      nextSummary.barCost += direction * lineCost
    } else if (typed.type === 'bbq') {
      nextSummary.bbqRevenue += direction * typed.lineTotal
      nextSummary.bbqCost += direction * lineCost
    } else {
      nextSummary.unknownRevenue += direction * typed.lineTotal
      nextSummary.unknownCost += direction * lineCost
    }
  }

  nextSummary.extraRevenue += direction * ((order.totals?.paid || 0) - categorizedRevenue)
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
  items: PosCartItem[]
  paidTotal: number
  originalTotal: number
  customer: PosTableCustomer | undefined
  itemCosts: Record<string, number | undefined>
}) {
  const bizDate = getBizDateKey(params.closedAt)
  const monthKey = getMonthKeyFromBizDate(bizDate)
  const mergedItems = getMergedItems(params.items || [])
  const splitCounter = params.splitCounter && params.splitCounter > 1 ? params.splitCounter : null
  const displaySeqLabel = splitCounter ? `${params.displaySeqBase}-${splitCounter}` : String(params.displaySeqBase)
  const items: Record<string, V3ClosedOrderItem> = {}

  mergedItems.forEach((item, index) => {
    const qty = item.count || 1
    const displayName = stripHiddenTag(item.name)
    const type = item.type || 'unknown'
    const unitCost = getItemCost(params.itemCosts, item)
    items[`item_${index + 1}`] = buildClosedOrderItem(item, index, qty, unitCost, displayName, type)
  })

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
      paid: params.paidTotal,
      original: params.originalTotal,
    },
    status: 'closed',
    items,
  } satisfies V3ClosedOrder
}
