import type { AttendanceEmployee, AttendanceRecord } from '@/shared/attendance-service'
import type { FlavorSelection } from '@/shared/flavor'

export const RTDB_V3_ROOT = 'v3'
export const RTDB_V3_SCHEMA_VERSION = 3
export const BUSINESS_DAY_SHIFT_HOURS = 5

export type V3CatalogKey = string
export type V3MonthKey = `${number}-${string}`
export type V3BizDateKey = `${number}-${string}-${string}`

export type V3OwnerAuthRecord = {
  passwordHash: string
  passwordSalt: string
  updatedAt?: number
}

export type V3TableCustomer = {
  name: string
  phone: string
}

export type V3TableSummary = {
  status: string | null
  timerStartedAt: number | null
  displaySeqBase: number | null
  splitCounter: number
  batchCount: number
  customer: V3TableCustomer
  updatedAt: number
}

export type V3CartLine = {
  position: number
  displayName: string
  catalogKey: V3CatalogKey
  type: string
  variant?: string
  flavor?: FlavorSelection | null
  unitPrice: number | string
  isTreat: boolean
  batchId?: number | string
  batchIdx?: number
  sentAt?: number
  incomingIdx?: number
  isSent?: boolean
}

export type V3IncomingOrderHead = {
  requestId: string
  createdAt: number
  batchId: number
  customer: V3TableCustomer
  previewItems: Record<string, V3IncomingPreviewItem>
}

export type V3PendingSummary = {
  pendingCount: number
  firstOrder: V3IncomingOrderHead | null
}

export type V3IncomingOrder = {
  requestId: string
  createdAt: number
  batchId: number
  customer: V3TableCustomer
  items: Record<string, V3CartLine>
}

export type V3LiveTable = {
  summary: V3TableSummary | null
  cart: Record<string, V3CartLine>
  incomingOrders: Record<string, V3IncomingOrder>
}

export type V3IncomingPreviewItem = {
  position: number
  displayName: string
  unitPrice: number | string
}

export type V3ClosedOrderItem = {
  position: number
  displayName: string
  catalogKey: V3CatalogKey
  type: string
  variant?: string
  flavor?: FlavorSelection | null
  qty: number
  unitPrice: number
  unitCost: number
  lineTotal: number
  isTreat: boolean
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
  items: Record<string, V3ClosedOrderItem>
}

export type V3DailySummary = {
  orderCount: number
  paidTotal: number
  originalTotal: number
  itemQtyTotal: number
  barRevenue: number
  bbqRevenue: number
  unknownRevenue: number
  extraRevenue: number
  barCost: number
  bbqCost: number
  unknownCost: number
  updatedAt: number
}

export type V3DailyItemStat = {
  displayName: string
  type: string
  qty: number
  treatQty: number
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
  auth: {
    owners: V3RevisionValue
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

export type V3Meta = {
  schemaVersion: 3
  cutoverState: 'active' | 'migrating'
  migratedAt: number
  migrationId: string
  revisions: V3RevisionTree
}

export type V3Dataset = {
  meta: V3Meta
  live: {
    tables: Record<string, V3LiveTable>
    tableSummaries: Record<string, V3TableSummary>
    pendingSummaries: Record<string, V3PendingSummary>
  }
  history: {
    ordersByMonth: Record<V3MonthKey, Record<V3BizDateKey, Record<string, V3ClosedOrder>>>
    sequenceByDate: Record<V3BizDateKey, { nextDisplaySeq: number }>
  }
  reports: {
    dailyByMonth: Record<V3MonthKey, Record<V3BizDateKey, V3DailySummary>>
    itemStatsByMonth: Record<V3MonthKey, Record<V3BizDateKey, Record<V3CatalogKey, V3DailyItemStat>>>
  }
  catalog: {
    inventory: Record<string, boolean>
    prices: Record<string, number | string>
    costs: Record<string, number>
  }
  attendance: {
    employees: Record<string, AttendanceEmployee>
    recordsByMonth: Record<V3MonthKey, Record<string, AttendanceRecord>>
  }
  auth: {
    owners: Record<string, V3OwnerAuthRecord>
  }
}

export type V3CatalogSegment = 'inventory' | 'prices' | 'costs'

export type V3CatalogRevisionEvent = {
  kind: 'catalog'
  changedSegments: V3CatalogSegment[]
}

export type V3OwnerAuthRevisionEvent = {
  kind: 'owner-auth'
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
