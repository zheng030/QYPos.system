import { describe, expect, it, vi } from 'vitest'

import type { V3DailySummary } from '@/features/pos-data/rtdb-v3-types'
import type { PosDataService } from '@/features/pos-data/service'
import type { PosKernelService } from '@/features/pos-kernel/service'
import type { PosMenuData, PosOrder, PosOrderLine } from '@/features/pos-kernel/types'
import { createOwnerFinance } from './owner-finance'

type FinanceFixture = {
  menuData?: PosMenuData
  itemPrices?: Record<string, number>
  itemCosts?: Record<string, number>
  listClosedOrdersByRange?: (start: Date, endExclusive: Date) => Promise<PosOrder[]>
  summaryRange?: Record<string, V3DailySummary>
}

function createFinance(fixture: FinanceFixture = {}) {
  const kernel = {
    state: { itemPrices: fixture.itemPrices || {}, itemCosts: fixture.itemCosts || {} },
    menuData: fixture.menuData || {},
    helpers: { getItemCategoryType: () => 'drink' },
  } as unknown as PosKernelService
  const data = {
    ensureCatalog: vi.fn(async () => {}),
    loadDailySummariesRange: vi.fn(async () => fixture.summaryRange || {}),
    readDailySummariesRange: vi.fn(() => fixture.summaryRange || {}),
    watchDailySummariesRange: vi.fn(() => () => {}),
    listClosedOrdersByRange: vi.fn(fixture.listClosedOrdersByRange || (async () => [])),
    watchClosedOrdersRange: vi.fn(() => () => {}),
    updateItemData: vi.fn(async () => {}),
  } as unknown as PosDataService
  return { finance: createOwnerFinance({ kernel, data }), data }
}

function createLine(overrides: Partial<PosOrderLine> = {}): PosOrderLine {
  return {
    lineId: 'line_1',
    groupId: 'group_1',
    role: 'main',
    catalogKey: 'drink.black-tea',
    inventoryKey: 'drink.black-tea',
    displayName: '紅茶',
    shortName: '紅茶',
    categoryKey: 'drink',
    station: 'kitchen',
    courseKind: 'drink',
    quantity: 1,
    unitPrice: 260,
    priceDelta: 0,
    lineTotal: 260,
    selectionSummary: '',
    isTreat: false,
    sourceEntryId: 'entry_1',
    ...overrides,
  }
}

const drinkMenu: PosMenuData = {
  drink: {
    key: 'drink',
    label: '飲品',
    shortLabel: '飲品',
    sections: [
      {
        id: 'drink-main',
        label: '飲品',
        items: [
          {
            id: 'drink.black-tea',
            productKey: 'drink.black-tea',
            inventoryKey: 'drink.black-tea',
            name: '紅茶',
            shortName: '紅茶',
            categoryKey: 'drink',
            courseKind: 'drink',
            station: 'kitchen',
            kind: 'single',
            basePrice: 70,
            price: 70,
          },
        ],
      },
    ],
  },
} as PosMenuData

describe('owner-finance', () => {
  it('opens cost mode directly without owner auth', async () => {
    const { finance } = createFinance({ menuData: drinkMenu })

    expect(finance.view.value).toBeNull()
    expect(finance.title.value).toBe('財務 / 詳單')

    await finance.openFinancePage('cost')

    expect(finance.view.value).toBe('cost')
    expect(finance.title.value).toBe('成本輸入')
  })

  it('opens finance mode directly without owner auth', async () => {
    const { finance, data } = createFinance()

    await finance.openFinancePage('finance')

    expect(finance.view.value).toBe('finance')
    expect(finance.title.value).toBe('財務與詳細訂單')
    expect(finance.summary.title).toBe('🏠 全店總計 (本月)')
    expect(finance.calendarCells.value.some((cell) => cell?.active)).toBe(true)
    expect(data.watchDailySummariesRange).toHaveBeenCalledTimes(1)
  })

  it('builds the cost editor from schema categories with current prices and costs', async () => {
    const { finance } = createFinance({
      menuData: drinkMenu,
      itemPrices: { 'drink.black-tea': 80 },
      itemCosts: { 'drink.black-tea': 12 },
    })

    await finance.openFinancePage('cost')

    expect(finance.costCategories.value).toEqual([
      { key: 'drink', title: '飲品', rows: [{ id: 'drink.black-tea', name: '紅茶', price: 80, cost: 12 }] },
    ])
  })

  it('falls back to the base price and zero cost when nothing is stored', async () => {
    const { finance } = createFinance({ menuData: drinkMenu })

    await finance.openFinancePage('cost')

    expect(finance.costCategories.value[0].rows[0]).toMatchObject({ price: 70, cost: 0 })
  })

  it('uses historical item cost snapshots and quantity in revenue detail modal', async () => {
    const { finance } = createFinance({
      listClosedOrdersByRange: async () => [
        {
          formattedSeq: '12',
          seq: 12,
          seat: 'A1',
          time: '2026/05/30 18:00:00',
          timestamp: new Date('2026-05-30T18:00:00+08:00').getTime(),
          total: 200,
          lines: [
            createLine({
              catalogKey: 'drink.cola',
              inventoryKey: 'drink.cola',
              displayName: '可樂',
              shortName: '可樂',
              quantity: 2,
              unitPrice: 100,
              lineTotal: 200,
              unitCost: 30,
            }),
          ],
        } as PosOrder,
      ],
    })

    await finance.updateStats('day')
    await finance.openRevenueModal('drink')

    expect(finance.revenueModal.open).toBe(true)
    expect(finance.revenueModal.items).toEqual([
      expect.objectContaining({ name: '可樂', qty: 2, price: 200, cost: 60, seq: '12', seat: 'A1' }),
    ])
  })

  it('uses the dessert category label in revenue detail modal', async () => {
    const { finance } = createFinance()

    await finance.openRevenueModal('dessert')

    expect(finance.revenueModal.title).toBe('甜點')
    expect(finance.revenueModal.open).toBe(true)
    finance.closeRevenueModal()
    expect(finance.revenueModal.open).toBe(false)
  })

  it('shows detailed orders with business-date key routing', async () => {
    const listClosedOrdersByRange = async (start: Date, endExclusive: Date) => {
      if (
        start.getTime() === new Date('2026-05-31T05:00:00+08:00').getTime() &&
        endExclusive.getTime() === new Date('2026-06-01T05:00:00+08:00').getTime()
      ) {
        return [
          {
            formattedSeq: '19',
            seq: 19,
            seat: 'A1',
            table: 'A1',
            time: '2026/06/01 00:30:00',
            timestamp: new Date('2026-06-01T00:30:00+08:00').getTime(),
            total: 260,
            lines: [createLine()],
          } as PosOrder,
        ]
      }
      return []
    }
    const summaryRange = {
      '2026-05-31': {
        paidTotal: 260,
        originalTotal: 260,
        orderCount: 1,
        itemQtyTotal: 1,
        categoryRevenue: { drink: 260 },
        categoryCost: { drink: 0 },
        updatedAt: 1,
      },
    } as Record<string, V3DailySummary>
    const { finance } = createFinance({ listClosedOrdersByRange, summaryRange })

    finance.selectDay('2026-05-31')
    await vi.waitFor(() => expect(finance.orderList.rows).not.toBeNull())

    expect(finance.specificDay).toEqual({ visible: true, bizDateKey: '2026-05-31' })
    expect(finance.orderList.visible).toBe(true)
    expect(finance.orderList.title).toBe('📅 2026/5/31 詳細訂單')
    expect(finance.orderList.rows).toEqual([
      expect.objectContaining({ seq: '#19', seat: 'A1', time: '00:30:00', amount: '$260' }),
    ])
    expect(finance.activeRange.value).toBe('specific')
    expect(finance.summary.title).toBe('🏠 全店總計 (2026-05-31)')
    expect(finance.summary.revenue).toBe('$260')
  })
})
