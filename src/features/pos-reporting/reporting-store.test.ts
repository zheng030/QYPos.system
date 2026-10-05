import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPageRouter } from '@/app/page-router'
import type { V3DailyItemStat } from '@/features/pos-data/rtdb-v3-types'
import type { PosDataService } from '@/features/pos-data/service'
import type { PosKernelService } from '@/features/pos-kernel/service'
import type { PosOrder } from '@/features/pos-kernel/types'
import { createReportingStore } from './reporting-store'

function createItemStat(displayName: string, qty: number, categoryKey: string, revenue: number): V3DailyItemStat {
  return { displayName, qty, categoryKey, revenue, cost: 0, updatedAt: 1 }
}

const ORDER: PosOrder = {
  formattedSeq: '12-1',
  seq: 12,
  seat: 'A1',
  table: 'A1',
  time: '2026/05/30 18:00:00',
  total: 310,
  originalTotal: 310,
  lines: [
    {
      lineId: 'entry_food_main',
      groupId: 'entry_food',
      role: 'main',
      catalogKey: 'pasta_risotto.chicken-breast',
      inventoryKey: 'pasta_risotto.chicken-breast',
      displayName: '青醬雞胸義大利麵',
      shortName: '青醬雞胸',
      categoryKey: 'pasta_risotto',
      station: 'kitchen',
      courseKind: 'food',
      quantity: 1,
      unitPrice: 250,
      priceDelta: 0,
      lineTotal: 250,
      selectionSummary: '主食：義大利麵 / 口味：青醬',
      isTreat: false,
      sourceEntryId: 'entry_food',
    },
  ],
}

function createFakeData(overrides: Partial<PosDataService> = {}) {
  const stops: string[] = []
  const data = {
    listClosedOrdersForBusinessDay: vi.fn(async (_anchor: Date) => [ORDER]),
    watchClosedOrdersForBusinessDay: vi.fn(() => () => stops.push('history')),
    loadDailySummariesRange: vi.fn(async () => ({})),
    watchDailySummariesRange: vi.fn(() => () => stops.push('summary')),
    readDailySummariesRange: vi.fn(() => ({})),
    loadItemStatsRange: vi.fn(async () => ({})),
    watchItemStatsRange: vi.fn(() => () => stops.push('itemStats')),
    readItemStatsRange: vi.fn(() => ({})),
    deleteClosedOrder: vi.fn(async () => {}),
    ...overrides,
  }
  return { data, stops }
}

function createStore(data: Partial<PosDataService>) {
  const router = createPageRouter()
  const printReceipt = vi.fn(async () => {})
  const kernel = { helpers: { getItemCategoryType: () => 'other' } } as unknown as PosKernelService
  const reporting = createReportingStore({ kernel, data: data as PosDataService, router, printReceipt })
  return { router, printReceipt, reporting }
}

beforeEach(() => {
  vi.stubGlobal('alert', vi.fn())
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true)
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('reporting store', () => {
  it('keeps independent report and calendar watchers and stops them on leave', async () => {
    const { data, stops } = createFakeData()
    const { router, reporting } = createStore(data)

    router.showPage('reportPage')
    await vi.waitFor(() => expect(data.watchDailySummariesRange).toHaveBeenCalledTimes(2))
    expect(reporting.reportSegment.value).toBe(0)
    expect(stops).toEqual([])

    router.showPage('home')
    expect(stops).toEqual(['summary', 'summary'])
  })

  it('only generates a report while the report page is visible', async () => {
    const { data } = createFakeData({
      readDailySummariesRange: vi.fn(() => ({
        '2026-05-30': { paidTotal: 500.4, orderCount: 3, categoryRevenue: { pasta_risotto: 300, drink: 200 } },
      })) as unknown as PosDataService['readDailySummariesRange'],
    })
    const { router, reporting } = createStore(data)

    await reporting.generateReport('week')
    expect(data.loadDailySummariesRange).not.toHaveBeenCalled()

    router.showPage('reportPage')
    await reporting.generateReport('week')
    expect(reporting.reportSegment.value).toBe(1)
    expect(reporting.itemStatsActive.value).toBeNull()
    expect({ ...reporting.reportSummary }).toEqual({
      title: '💰 本周營業額 (即時)',
      total: '$500',
      count: '總單數: 3',
      primary: '$300',
      secondary: '$200',
    })
  })

  it('loads history when the page opens and toggles the view mode', async () => {
    const { data, stops } = createFakeData()
    const { router, reporting } = createStore(data)

    router.showPage('historyPage')
    await vi.waitFor(() => expect(reporting.historyOrders.value).toEqual([ORDER]))
    expect(data.watchClosedOrdersForBusinessDay).toHaveBeenCalledTimes(1)

    reporting.toggleHistoryRow(0)
    expect(reporting.expandedHistoryRows.has(0)).toBe(true)
    reporting.toggleHistoryView()
    expect(reporting.historySimpleMode.value).toBe(true)
    await vi.waitFor(() => expect(reporting.expandedHistoryRows.size).toBe(0))

    router.showPage('home')
    expect(stops).toEqual(['history'])
  })

  it('reprints and deletes the visible archived order', async () => {
    const { data } = createFakeData()
    const { router, printReceipt, reporting } = createStore(data)
    router.showPage('historyPage')
    await vi.waitFor(() => expect(reporting.historyOrders.value).toHaveLength(1))

    await reporting.reprintOrder(0)
    expect(printReceipt).toHaveBeenCalledWith({
      seq: '12-1',
      table: 'A1',
      time: '2026/05/30 18:00:00',
      lines: ORDER.lines,
      original: 310,
      total: 310,
    })

    vi.mocked(confirm).mockReturnValueOnce(false)
    await reporting.deleteOrder(0)
    expect(data.deleteClosedOrder).not.toHaveBeenCalled()

    await reporting.deleteOrder(0)
    expect(data.deleteClosedOrder).toHaveBeenCalledWith(ORDER)

    await reporting.reprintOrder(5)
    expect(alert).toHaveBeenCalledWith('找不到此訂單')
  })

  it('uses the current timestamp as the business-day anchor for early-morning history', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-05-31T02:30:00+08:00'))
    const { data } = createFakeData()
    const { router } = createStore(data)

    router.showPage('historyPage')

    await vi.waitFor(() => expect(data.listClosedOrdersForBusinessDay).toHaveBeenCalledTimes(1))
    expect(data.listClosedOrdersForBusinessDay).toHaveBeenCalledWith(new Date('2026-05-31T02:30:00+08:00'))
  })

  it('ranks item stats into the all-store total, every menu category, and the other bucket', async () => {
    const stats = {
      '2026-05-30': {
        pasta: createItemStat('雞胸', 3, 'pasta_risotto', 750),
        bread: createItemStat('蒜香麵包餐', 2, 'bread_set', 300),
        salad: createItemStat('凱薩沙拉', 1, 'salad', 180),
        main: createItemStat('香煎雞腿排', 4, 'plated_main', 1200),
        aLaCarte: createItemStat('炸物拼盤', 5, 'a_la_carte', 500),
        soup: createItemStat('主廚濃湯', 2, 'soup', 180),
        dessert: createItemStat('原味巴斯克', 2, 'dessert', 220),
        drink: createItemStat('拿鐵', 6, 'drink', 360),
        treat: createItemStat('拿鐵 (招待)', 1, 'drink', 0),
        other: createItemStat('神秘品項', 1, 'other', 50),
      },
    }
    const { data } = createFakeData({ readItemStatsRange: vi.fn(() => stats) })
    const { router, reporting } = createStore(data)

    router.showPage('itemStatsPage')
    await vi.waitFor(() => expect(reporting.itemStatsColumns.value).not.toEqual([]))
    expect(data.loadItemStatsRange).toHaveBeenCalledTimes(1)
    expect(data.watchItemStatsRange).toHaveBeenCalledTimes(1)

    const columns = reporting.itemStatsColumns.value
    expect(columns.map((column) => column.title)).toEqual([
      '全店總計',
      '義大利麵 / 燉飯',
      '早午餐',
      '麵包餐',
      '沙拉',
      '排餐',
      '單品',
      '湯品',
      '甜點',
      '飲品',
      '其他 / 未知',
    ])
    expect(columns[0].rows.slice(0, 2)).toEqual([
      { name: '拿鐵', count: 7, categoryKey: 'drink' },
      { name: '炸物拼盤', count: 5, categoryKey: 'a_la_carte' },
    ])
    expect(columns.find((column) => column.key === 'dessert')?.rows.map((row) => row.name)).toEqual(['原味巴斯克'])
    expect(columns.find((column) => column.key === 'other')?.rows.map((row) => row.name)).toEqual(['神秘品項'])
    expect(reporting.itemStatsActive.value).toBeNull()
    expect(reporting.customStatsVisible.value).toBe(false)
  })

  it('uses business-date keys for custom item stats ranges without midnight drift', async () => {
    const { data } = createFakeData({
      readItemStatsRange: vi.fn(() => ({ '2026-05-31': { drink: createItemStat('紅茶', 1, 'drink', 80) } })),
    })
    const { reporting } = createStore(data)

    reporting.statsDates.end = '2026-05-31'
    reporting.setStatsDate('start', '2026-05-31')

    await vi.waitFor(() => expect(reporting.itemStatsColumns.value[0]?.rows[0]?.name).toBe('紅茶'))
    expect(data.loadItemStatsRange).toHaveBeenCalledWith(
      new Date('2026-05-31T05:00:00+08:00'),
      new Date('2026-06-01T05:00:00+08:00')
    )
    expect(reporting.customStatsVisible.value).toBe(true)
  })

  it('summarizes today before closing business', async () => {
    const { data } = createFakeData()
    const { reporting } = createStore(data)

    await reporting.openCloseBusinessModal()
    expect({ ...reporting.summaryModal }).toEqual({ open: true, count: 1, total: 310 })

    reporting.confirmCloseBusiness()
    expect(alert).toHaveBeenCalledWith('清空所有資料功能目前停用')
    expect(reporting.summaryModal.open).toBe(false)
  })
})
