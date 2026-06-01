import type { AttendanceEmployee, AttendanceRecord } from '@/shared/attendance-service'
import {
  createIdentityCodec,
  createResourceRegistry,
  type RegisteredResourceDescriptor,
  type ResourceDescriptor,
  registerResourceDescriptor,
} from './rtdb-v3-cache'
import {
  closedOrderMapStorageCodec,
  dailySummaryStorageCodec,
  itemStatsStorageCodec,
  orderBatchMapStorageCodec,
  orderEntryMapStorageCodec,
  tableSummaryStorageCodec,
  type V3StoredClosedOrder,
  type V3StoredDailyItemStat,
  type V3StoredDailySummary,
  type V3StoredOrderBatch,
  type V3StoredOrderEntry,
  type V3StoredTableSummary,
} from './rtdb-v3-storage-codecs'
import type {
  V3BizDateKey,
  V3ClosedOrder,
  V3DailyItemStat,
  V3DailySummary,
  V3LiveTable,
  V3MonthKey,
  V3TableSummary,
} from './rtdb-v3-types'

function liveTableResourceKey(table: string, shard: keyof V3LiveTable) {
  return `live:${table}:${shard}`
}

function historyDayResourceKey(bizDate: V3BizDateKey) {
  return `history:orders:${bizDate}`
}

function dailySummaryResourceKey(bizDate: V3BizDateKey) {
  return `reports:daily:${bizDate}`
}

function itemStatsResourceKey(bizDate: V3BizDateKey) {
  return `reports:item-stats:${bizDate}`
}

function attendanceMonthResourceKey(monthKey: V3MonthKey) {
  return `attendance:records:${monthKey}`
}

export const RTDB_V3_RESOURCE_KEYS = {
  catalogInventory: 'catalog:inventory',
  catalogPrices: 'catalog:prices',
  catalogCosts: 'catalog:costs',
  attendanceEmployees: 'attendance:employees',
  attendanceMonthIndex: 'attendance:month-index',
  liveTableSummary: (table: string) => liveTableResourceKey(table, 'summary'),
  liveTableDraft: (table: string) => liveTableResourceKey(table, 'draft'),
  liveTablePending: (table: string) => liveTableResourceKey(table, 'pendingBatches'),
  liveTableSubmitted: (table: string) => liveTableResourceKey(table, 'submittedBatches'),
  historyOrdersByDay: (bizDate: V3BizDateKey) => historyDayResourceKey(bizDate),
  dailySummaryByDay: (bizDate: V3BizDateKey) => dailySummaryResourceKey(bizDate),
  itemStatsByDay: (bizDate: V3BizDateKey) => itemStatsResourceKey(bizDate),
  attendanceRecordsByMonth: (monthKey: V3MonthKey) => attendanceMonthResourceKey(monthKey),
} as const

const staticDescriptors = [
  registerResourceDescriptor({
    resourceKey: RTDB_V3_RESOURCE_KEYS.catalogInventory,
    remotePath: 'catalog/inventory',
    revision: { path: 'catalog/inventory' },
    codec: createIdentityCodec<Record<string, boolean>>(),
  }),
  registerResourceDescriptor({
    resourceKey: RTDB_V3_RESOURCE_KEYS.catalogPrices,
    remotePath: 'catalog/prices',
    revision: { path: 'catalog/prices' },
    codec: createIdentityCodec<Record<string, number | string>>(),
  }),
  registerResourceDescriptor({
    resourceKey: RTDB_V3_RESOURCE_KEYS.catalogCosts,
    remotePath: 'catalog/costs',
    revision: { path: 'catalog/costs' },
    codec: createIdentityCodec<Record<string, number>>(),
  }),
  registerResourceDescriptor({
    resourceKey: RTDB_V3_RESOURCE_KEYS.attendanceEmployees,
    remotePath: 'attendance/employees',
    revision: { path: 'attendance/employees' },
    codec: createIdentityCodec<Record<string, AttendanceEmployee>>(),
  }),
  registerResourceDescriptor({
    resourceKey: RTDB_V3_RESOURCE_KEYS.attendanceMonthIndex,
    remotePath: 'attendance/monthIndex',
    revision: { path: 'attendance/monthIndex' },
    codec: createIdentityCodec<Record<string, true>>(),
  }),
] satisfies ResourceDescriptor<unknown, unknown>[]

export const rtdbV3StaticResourceRegistry = createResourceRegistry(staticDescriptors)

export function createLiveTableShardDescriptor<K extends keyof V3LiveTable>(table: string, shard: K) {
  if (shard === 'summary') {
    return registerResourceDescriptor({
      resourceKey: liveTableResourceKey(table, shard),
      remotePath: `live/tables/${table}/${shard}`,
      revision: { path: `live/tables/${table}/${shard}` },
      codec: tableSummaryStorageCodec,
    }) as RegisteredResourceDescriptor<V3LiveTable[K], V3StoredTableSummary | null>
  }

  if (shard === 'draft') {
    return registerResourceDescriptor({
      resourceKey: liveTableResourceKey(table, shard),
      remotePath: `live/tables/${table}/${shard}`,
      revision: { path: `live/tables/${table}/${shard}` },
      codec: orderEntryMapStorageCodec,
    }) as RegisteredResourceDescriptor<V3LiveTable[K], Record<string, V3StoredOrderEntry>>
  }

  return registerResourceDescriptor({
    resourceKey: liveTableResourceKey(table, shard),
    remotePath: `live/tables/${table}/${shard}`,
    revision: { path: `live/tables/${table}/${shard}` },
    codec: orderBatchMapStorageCodec,
  }) as RegisteredResourceDescriptor<V3LiveTable[K], Record<string, V3StoredOrderBatch>>
}

export function createHistoryOrdersByDayDescriptor(bizDate: V3BizDateKey) {
  return registerResourceDescriptor({
    resourceKey: historyDayResourceKey(bizDate),
    remotePath: `history/ordersByMonth/${String(bizDate).slice(0, 7)}/${bizDate}`,
    revision: { path: `history/ordersByDay/${bizDate}` },
    codec: closedOrderMapStorageCodec,
  }) satisfies RegisteredResourceDescriptor<Record<string, V3ClosedOrder>, Record<string, V3StoredClosedOrder>>
}

export function createDailySummaryDescriptor(bizDate: V3BizDateKey) {
  return registerResourceDescriptor({
    resourceKey: dailySummaryResourceKey(bizDate),
    remotePath: `reports/dailyByMonth/${String(bizDate).slice(0, 7)}/${bizDate}`,
    revision: { path: `reports/dailyByDay/${bizDate}` },
    codec: dailySummaryStorageCodec,
  }) satisfies RegisteredResourceDescriptor<V3DailySummary | null, V3StoredDailySummary | null>
}

export function createItemStatsDescriptor(bizDate: V3BizDateKey) {
  return registerResourceDescriptor({
    resourceKey: itemStatsResourceKey(bizDate),
    remotePath: `reports/itemStatsByMonth/${String(bizDate).slice(0, 7)}/${bizDate}`,
    revision: { path: `reports/itemStatsByDay/${bizDate}` },
    codec: itemStatsStorageCodec,
  }) satisfies RegisteredResourceDescriptor<Record<string, V3DailyItemStat>, Record<string, V3StoredDailyItemStat>>
}

export function createAttendanceMonthDescriptor(monthKey: V3MonthKey) {
  return registerResourceDescriptor({
    resourceKey: attendanceMonthResourceKey(monthKey),
    remotePath: `attendance/recordsByMonth/${monthKey}`,
    revision: { path: `attendance/recordsByMonth/${monthKey}` },
    codec: createIdentityCodec<Record<string, AttendanceRecord>>(),
  }) satisfies RegisteredResourceDescriptor<Record<string, AttendanceRecord>>
}

export function getStaticDescriptorOrThrow<TDomain>(resourceKey: string) {
  const descriptor = rtdbV3StaticResourceRegistry.getByKey<TDomain>(resourceKey)
  if (!descriptor) {
    throw new Error(`Missing resource descriptor: ${resourceKey}`)
  }
  return descriptor
}

export function getLiveSummaryDescriptor(table: string) {
  return createLiveTableShardDescriptor(table, 'summary') as ResourceDescriptor<V3TableSummary | null>
}
