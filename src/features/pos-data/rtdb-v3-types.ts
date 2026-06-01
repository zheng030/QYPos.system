export const RTDB_V3_ROOT = 'v3'
export const RTDB_V3_SCHEMA_VERSION = 5

export type V3CatalogKey = string
export type V3MonthKey = `${number}-${string}`
export type V3BizDateKey = `${number}-${string}-${string}`

export type V3TableCustomer = {
  name: string
  phone: string
}

export type V3OrderLine = {
  lineId: string
  groupId: string
  parentLineId?: string
  role: string
  catalogKey: string
  inventoryKey: string
  displayName: string
  shortName: string
  categoryKey: string
  station: string
  courseKind: string
  quantity: number
  unitPrice: number
  priceDelta: number
  lineTotal: number
  selections?: Record<string, string>
  selectionSummary: string
  isTreat: boolean
  sourceEntryId: string
}

export type V3OrderEntry = {
  entryId: string
  groupId: string
  itemId: string
  catalogKey: string
  inventoryKey: string
  itemName: string
  shortName: string
  categoryKey: string
  quantity: number
  status: 'draft' | 'pending' | 'accepted'
  source: 'customer' | 'staff'
  createdAt: number
  updatedAt: number
  selections: Record<string, string>
  includeSelections: Record<string, Record<string, string>>
  upgradeSelections: Record<string, string>
  lines: Record<string, V3OrderLine>
  subtotal: number
  summary: {
    title: string
    subtitle: string
    quantityLabel: string
    totalLabel: string
  }
}

export type V3OrderBatch = {
  batchId: string
  source: 'customer' | 'staff'
  status: 'pending' | 'accepted'
  table: string
  customer: V3TableCustomer
  createdAt: number
  updatedAt: number
  acceptedAt?: number
  requestSeq?: number
  requestLabel: string
  entries: Record<string, V3OrderEntry>
  subtotal: number
}

export type V3TableSummary = {
  timerStartedAt: number | null
  displaySeqBase: number | null
  draftEntryCount: number
  pendingBatchCount: number
  submittedBatchCount: number
  nextRequestSeq?: number | null
  nextSplitCounter?: number | null
  customer: V3TableCustomer
  updatedAt: number
}

export type V3PendingSummary = {
  pendingCount: number
  firstBatch: {
    batchId: string
    requestSeq: number
    createdAt: number
    requestLabel: string
    itemPreview: Array<{
      title: string
      quantityLabel: string
    }>
  } | null
}

export type V3LiveTable = {
  summary: V3TableSummary | null
  draft: Record<string, V3OrderEntry>
  pendingBatches: Record<string, V3OrderBatch>
  submittedBatches: Record<string, V3OrderBatch>
}

export type V3ClosedOrderLine = V3OrderLine & {
  unitCost: number
}

export type V3ClosedOrderEntry = Omit<V3OrderEntry, 'lines'> & {
  lines: Record<string, V3ClosedOrderLine>
}

export type V3ClosedOrder = {
  orderId: string
  bizDate: V3BizDateKey
  monthKey: V3MonthKey
  createdAt: number
  closedAt: number
  tableLabel: string
  displaySeqBase: number
  splitCounter: number | null
  displaySeqLabel: string
  customer: V3TableCustomer
  totals: {
    paid: number
    original: number
  }
  status: 'closed'
  batchIds: string[]
  entries: Record<string, V3ClosedOrderEntry>
}

export type V3DailySummary = {
  orderCount: number
  paidTotal: number
  originalTotal: number
  itemQtyTotal: number
  categoryRevenue: Record<string, number>
  categoryCost: Record<string, number>
  updatedAt: number
}

export type V3DailyItemStat = {
  displayName: string
  categoryKey: string
  qty: number
  revenue: number
  cost: number
  updatedAt: number
}

export type V3RevisionValue = number

export type V3RevisionTree = {
  catalog: {
    inventory: V3RevisionValue
    prices: V3RevisionValue
    costs: V3RevisionValue
  }
  history: {
    ordersByDay: Record<V3BizDateKey, V3RevisionValue>
  }
  reports: {
    dailyByDay: Record<V3BizDateKey, V3RevisionValue>
    itemStatsByDay: Record<V3BizDateKey, V3RevisionValue>
  }
  attendance: {
    employees: V3RevisionValue
    recordsByMonth: Record<V3MonthKey, V3RevisionValue>
  }
}

export type V3CatalogSegment = 'inventory' | 'prices' | 'costs'

export type V3CatalogRevisionEvent = {
  kind: 'catalog'
  changedSegments: V3CatalogSegment[]
}

export type V3HistoryRangeEvent = {
  kind: 'history-orders'
  changedBizDates: V3BizDateKey[]
}

export type V3DailySummaryRangeEvent = {
  kind: 'daily-summary'
  changedBizDates: V3BizDateKey[]
}

export type V3ItemStatsRangeEvent = {
  kind: 'item-stats'
  changedBizDates: V3BizDateKey[]
}

export type V3AttendanceWindowEvent = {
  kind: 'attendance-window'
  changedMonthKeys: V3MonthKey[]
  employeesChanged: boolean
}
