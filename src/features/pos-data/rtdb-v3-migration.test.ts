import { describe, expect, it } from 'vitest'

// @ts-expect-error runtime-tested JS migration script
import { buildV3Dataset } from '../../../scripts/migrate-rtdb-v3.mjs'

describe('rtdb-v3 migration', () => {
  it('emits day-level report revisions for migrated orders', () => {
    const migratedAt = 1_717_000_000_000
    const result = buildV3Dataset({
      source: {
        legacy: {
          historyOrders: [
            {
              seat: 'A1',
              formattedSeq: '12',
              time: '2026/05/30 18:00:00',
              timestamp: new Date('2026-05-30T18:00:00+08:00').getTime(),
              items: [{ name: '可樂', price: 100, type: 'bar' }],
              total: 100,
              originalTotal: 100,
              customerName: '王小明',
              customerPhone: '0900',
            },
          ],
          tableTimers: {},
          tableCarts: {},
          tableStatuses: {},
          tableCustomers: {},
          tableSplitCounters: {},
          itemCosts: { 可樂: 10 },
          itemPrices: { 可樂: 100 },
          inventory: {},
          attendanceEmployees: {},
          attendanceRecords: {},
          incomingOrders: {},
          tableBatchCounts: {},
          ownerPasswords: {},
        },
        v2: null,
        v3: null,
      },
      frontendData: {
        firebaseConfig: {},
        menuData: {},
        foodOptionVariants: {},
        ownerPasswords: {},
      },
      migrationId: 'test-migration',
      migratedAt,
    })

    expect(result.dataset.meta.revisions.reports.dailyByDay['2026-05-30']).toBe(migratedAt)
    expect(result.dataset.meta.revisions.reports.itemStatsByDay['2026-05-30']).toBe(migratedAt)
    expect(result.dataset.reports.dailyByMonth['2026-05']['2026-05-30']?.paidTotal).toBe(100)
    expect(result.dataset.reports.itemStatsByMonth['2026-05']['2026-05-30']?.可樂?.revenue).toBe(100)
    expect(result.dataset.live.pendingSummaries).toEqual({})
  })
})
