import { afterEach, describe, expect, it } from 'vitest'

import { createOwnerFinanceModule } from './owner-finance'

type ElementStub = {
  id: string
  style: { display: string; backgroundColor?: string }
  innerText: string
  innerHTML: string
  className?: string
  value?: string
  dataset?: Record<string, string>
  querySelector?: () => ElementStub | null
  querySelectorAll?: (selector?: string) => ElementStub[]
  appendChild?: (child: ElementStub) => void
  classList?: {
    add: (...tokens: string[]) => void
    remove: (...tokens: string[]) => void
  }
}

function createElementStub(id = ''): ElementStub {
  return {
    id,
    style: { display: '' },
    innerText: '',
    innerHTML: '',
    className: '',
    value: '',
    dataset: {},
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild: () => {},
    classList: {
      add: () => {},
      remove: () => {},
    },
  }
}

function installDocumentStub() {
  const elements = new Map<string, ElementStub>()
  const financeButtons = ['finBtnDay', 'finBtnWeek', 'finBtnMonth', 'finBtnCustom', 'finBtnSpecific'].map((id) =>
    createElementStub(id)
  )
  class InputElementStub {}

  const documentStub = {
    body: {
      appendChild: () => {},
      querySelectorAll: () => [],
    },
    createElement: () => createElementStub(),
    getElementById: (id: string) => elements.get(id) || null,
    querySelectorAll: (selector?: string) => {
      if (selector === '.finance-controls button') return financeButtons
      return []
    },
  }

  ;(globalThis as { document?: unknown }).document = documentStub as unknown
  ;(globalThis as { HTMLElement?: unknown }).HTMLElement = Object as unknown
  ;(globalThis as { HTMLInputElement?: unknown }).HTMLInputElement = InputElementStub as unknown

  return {
    add(element: ElementStub) {
      Object.setPrototypeOf(element, InputElementStub.prototype)
      elements.set(element.id, element)
    },
    reset() {
      elements.clear()
      financeButtons.forEach((button) => {
        button.innerText = ''
        button.innerHTML = ''
        button.style.display = ''
        button.dataset = {}
      })
    },
  }
}

const dom = installDocumentStub()

afterEach(() => {
  dom.reset()
})

function createFinanceModule(overrides: Partial<Parameters<typeof createOwnerFinanceModule>[0]> = {}) {
  return createOwnerFinanceModule({
    ensureSubscriptions: async () => {},
    getItemCategoryType: () => 'drink',
    getItemCosts: () => ({}),
    getItemPrices: () => ({}),
    listClosedOrdersByRange: async () => [],
    loadDailySummariesRange: async () => ({}),
    watchClosedOrdersRange: () => () => {},
    watchDailySummariesRange: () => () => {},
    readDailySummariesRange: () => ({}),
    hideAll: () => {},
    menuData: {},
    updateItemData: async () => {},
    ...overrides,
  })
}

describe('owner-finance', () => {
  it('opens cost mode directly without owner auth', async () => {
    dom.add(createElementStub('confidentialPage'))
    dom.add(createElementStub('financeDashboard'))
    dom.add(createElementStub('costInputSection'))
    dom.add(createElementStub('financeCalendarSection'))
    dom.add(createElementStub('confidentialTitle'))
    dom.add(createElementStub('costEditorList'))

    const finance = createFinanceModule({
      menuData: {
        drink: {
          key: 'drink',
          label: '飲品',
          shortLabel: '飲品',
          sections: [{ id: 'drink-main', label: '飲品', items: [] }],
        },
      },
    })

    await finance.openFinancePage('cost')

    expect(document.getElementById('confidentialTitle')?.innerText).toBe('成本輸入')
    expect(document.getElementById('costInputSection')?.style.display).toBe('block')
    expect(document.getElementById('financeCalendarSection')?.style.display).toBe('none')
  })

  it('opens finance mode directly without owner auth', async () => {
    dom.add(createElementStub('confidentialPage'))
    dom.add(createElementStub('financeDashboard'))
    dom.add(createElementStub('costInputSection'))
    dom.add(createElementStub('financeCalendarSection'))
    dom.add(createElementStub('confidentialTitle'))
    dom.add(createElementStub('financeCategoryCards'))
    dom.add(createElementStub('financeTitle'))
    dom.add(createElementStub('monthTotalRev'))
    dom.add(createElementStub('monthTotalCost'))
    dom.add(createElementStub('monthNetProfit'))
    dom.add(createElementStub('finCalendarTitle'))
    dom.add(createElementStub('finCalendarGrid'))

    const finance = createFinanceModule()

    await finance.openFinancePage('finance')

    expect(document.getElementById('confidentialTitle')?.innerText).toBe('財務與詳細訂單')
    expect(document.getElementById('costInputSection')?.style.display).toBe('none')
    expect(document.getElementById('financeCalendarSection')?.style.display).toBe('block')
  })

  it('renders the cost editor from schema categories and item definitions', () => {
    dom.add(createElementStub('costEditorList'))

    const finance = createFinanceModule({
      getItemCosts: () => ({
        'drink.black-tea': 12,
      }),
      getItemPrices: () => ({
        'drink.black-tea': 80,
      }),
      menuData: {
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
      },
    })

    finance.updateFinancialPage()

    const html = document.getElementById('costEditorList')?.innerHTML || ''
    expect(html).toContain('飲品')
    expect(html).toContain('紅茶')
    expect(html).toContain('data-action="update-item-data"')
    expect(html).toContain('data-name="drink.black-tea"')
    expect(html).toContain('value="80"')
    expect(html).toContain('value="12"')
  })

  it('uses historical item cost snapshots and quantity in revenue detail modal', async () => {
    dom.add(createElementStub('revenueDetailTitle'))
    dom.add(createElementStub('revenueDetailList'))
    dom.add(createElementStub('revenueDetailModal'))
    dom.add(createElementStub('financeCategoryCards'))
    dom.add(createElementStub('financeTitle'))
    dom.add(createElementStub('monthTotalRev'))
    dom.add(createElementStub('monthTotalCost'))
    dom.add(createElementStub('monthNetProfit'))

    const finance = createFinanceModule({
      listClosedOrdersByRange: async () => [
        {
          formattedSeq: '12',
          seq: 12,
          seat: 'A1',
          time: '2026/05/30 18:00:00',
          timestamp: new Date('2026-05-30T18:00:00+08:00').getTime(),
          total: 200,
          lines: [
            {
              lineId: 'cola_main',
              groupId: 'cola',
              role: 'main',
              catalogKey: 'drink.cola',
              inventoryKey: 'drink.cola',
              displayName: '可樂',
              shortName: '可樂',
              categoryKey: 'drink',
              station: 'kitchen',
              courseKind: 'drink',
              quantity: 2,
              unitPrice: 100,
              priceDelta: 0,
              lineTotal: 200,
              selectionSummary: '',
              isTreat: false,
              sourceEntryId: 'entry_1',
              unitCost: 30,
            },
          ],
        },
      ],
    })

    await finance.updateFinanceStats('day')
    await finance.openRevenueModal('drink')

    expect(document.getElementById('revenueDetailList')?.innerHTML || '').toContain('成本 $60')
    expect(document.getElementById('revenueDetailList')?.innerHTML || '').toContain('可樂 x2')
    expect(document.getElementById('revenueDetailList')?.innerHTML || '').toContain('$200')
  })

  it('shows detailed orders with business-date key routing', async () => {
    dom.add(createElementStub('financeOrderBox'))
    dom.add(createElementStub('financeSelectedDateTitle'))
    dom.add(createElementStub('financeOrderListSection'))
    dom.add(createElementStub('financeTitle'))
    dom.add(createElementStub('monthTotalRev'))
    dom.add(createElementStub('monthTotalCost'))
    dom.add(createElementStub('monthNetProfit'))
    dom.add(createElementStub('financeCategoryCards'))
    const finBtnSpecific = createElementStub('finBtnSpecific')
    finBtnSpecific.dataset = { bizDateKey: '2026-05-31' }
    dom.add(finBtnSpecific)

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
            lines: [
              {
                lineId: 'line_1',
                groupId: 'group_1',
                role: 'main' as const,
                catalogKey: 'drink.black-tea',
                inventoryKey: 'drink.black-tea',
                displayName: '紅茶',
                shortName: '紅茶',
                categoryKey: 'drink' as const,
                station: 'kitchen' as const,
                courseKind: 'drink' as const,
                quantity: 1,
                unitPrice: 260,
                priceDelta: 0,
                lineTotal: 260,
                selectionSummary: '',
                isTreat: false,
                sourceEntryId: 'entry_1',
              },
            ],
          },
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
    }

    const finance = createFinanceModule({
      listClosedOrdersByRange,
      loadDailySummariesRange: async () => summaryRange,
      readDailySummariesRange: () => summaryRange,
    })

    await finance.showDetailedOrders('2026-05-31')
    await finance.updateFinanceStats('specific', '2026-05-31')

    expect(document.getElementById('financeSelectedDateTitle')?.innerText).toBe('📅 2026/5/31 詳細訂單')
    expect(document.getElementById('financeOrderListSection')?.style.display).toBe('block')
    expect(document.getElementById('financeOrderBox')?.innerHTML).toContain('00:30:00')
    expect(document.getElementById('financeTitle')?.innerText).toBe('🏠 全店總計 (2026-05-31)')
  })
})
