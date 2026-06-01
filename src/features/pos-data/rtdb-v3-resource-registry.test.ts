import { describe, expect, it } from 'vitest'

import {
  createAttendanceMonthDescriptor,
  createDailySummaryDescriptor,
  createHistoryOrdersByDayDescriptor,
  createItemStatsDescriptor,
  createLiveTableShardDescriptor,
  getStaticDescriptorOrThrow,
  RTDB_V3_RESOURCE_KEYS,
  rtdbV3StaticResourceRegistry,
} from './rtdb-v3-resource-registry'

describe('rtdb-v3 resource registry', () => {
  it('maps static resources to remote paths, revision paths, and resource keys', () => {
    const inventory = getStaticDescriptorOrThrow<Record<string, boolean>>(RTDB_V3_RESOURCE_KEYS.catalogInventory)
    const attendanceEmployees = getStaticDescriptorOrThrow(RTDB_V3_RESOURCE_KEYS.attendanceEmployees)
    const attendanceMonthIndex = getStaticDescriptorOrThrow(RTDB_V3_RESOURCE_KEYS.attendanceMonthIndex)

    expect(inventory.resourceKey).toBe('catalog:inventory')
    expect(inventory.remotePath).toBe('catalog/inventory')
    expect(inventory.revision.path).toBe('catalog/inventory')
    expect(attendanceEmployees.resourceKey).toBe('attendance:employees')
    expect(attendanceEmployees.remotePath).toBe('attendance/employees')
    expect(attendanceMonthIndex.resourceKey).toBe('attendance:month-index')
    expect(attendanceMonthIndex.remotePath).toBe('attendance/monthIndex')
    expect(attendanceMonthIndex.revision.path).toBe('attendance/monthIndex')
    expect(rtdbV3StaticResourceRegistry.getByRemotePath('catalog/inventory')?.resourceKey).toBe('catalog:inventory')
  })

  it('maps dynamic live/history/report/attendance descriptors to exact remote paths', () => {
    expect(createLiveTableShardDescriptor('A1', 'summary')).toMatchObject({
      resourceKey: 'live:A1:summary',
      remotePath: 'live/tables/A1/summary',
      revision: { path: 'live/tables/A1/summary' },
    })
    expect(createLiveTableShardDescriptor('A1', 'pendingBatches')).toMatchObject({
      resourceKey: 'live:A1:pendingBatches',
      remotePath: 'live/tables/A1/pendingBatches',
      revision: { path: 'live/tables/A1/pendingBatches' },
    })
    expect(createHistoryOrdersByDayDescriptor('2026-05-30')).toMatchObject({
      resourceKey: 'history:orders:2026-05-30',
      remotePath: 'history/ordersByMonth/2026-05/2026-05-30',
      revision: { path: 'history/ordersByDay/2026-05-30' },
    })
    expect(createDailySummaryDescriptor('2026-05-30')).toMatchObject({
      resourceKey: 'reports:daily:2026-05-30',
      remotePath: 'reports/dailyByMonth/2026-05/2026-05-30',
      revision: { path: 'reports/dailyByDay/2026-05-30' },
    })
    expect(createItemStatsDescriptor('2026-05-30')).toMatchObject({
      resourceKey: 'reports:item-stats:2026-05-30',
      remotePath: 'reports/itemStatsByMonth/2026-05/2026-05-30',
      revision: { path: 'reports/itemStatsByDay/2026-05-30' },
    })
    expect(createAttendanceMonthDescriptor('2026-05')).toMatchObject({
      resourceKey: 'attendance:records:2026-05',
      remotePath: 'attendance/recordsByMonth/2026-05',
      revision: { path: 'attendance/recordsByMonth/2026-05' },
    })
  })
})
