import { afterEach, describe, expect, it } from 'vitest'

import { createOwnerFinanceModule } from './owner-finance'

type ElementStub = {
  id: string
  style: { display: string }
  innerText: string
  innerHTML: string
  className?: string
  value?: string
  dataset?: Record<string, string>
  querySelector?: () => ElementStub | null
  querySelectorAll?: () => ElementStub[]
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
  class InputElementStub {}
  const documentStub = {
    body: {
      appendChild: () => {},
      querySelectorAll: () => [],
    },
    createElement: () => createElementStub(),
    getElementById: (id: string) => elements.get(id) || null,
    querySelectorAll: () => [],
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
    },
  }
}

const dom = installDocumentStub()

afterEach(() => {
  dom.reset()
})

;(globalThis as { alert?: (message?: unknown) => void }).alert = () => {}
;(globalThis as { sessionStorage?: Storage }).sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
} as Storage

describe('owner-finance', () => {
  it('uses historical item cost snapshots and quantity in revenue detail modal', async () => {
    const ownerWelcome = createElementStub('ownerWelcome')
    ownerWelcome.innerText = '景偉'
    dom.add(ownerWelcome)
    dom.add(createElementStub('revenueDetailTitle'))
    dom.add(createElementStub('revenueDetailList'))
    dom.add(createElementStub('revenueDetailModal'))
    dom.add(createElementStub('finBtnSpecific'))
    dom.add(createElementStub('confidentialPage'))
    dom.add(createElementStub('financeCategoryCards'))
    dom.add(createElementStub('financeTitle'))
    dom.add(createElementStub('monthTotalRev'))
    dom.add(createElementStub('monthTotalCost'))
    dom.add(createElementStub('monthNetProfit'))

    const finance = createOwnerFinanceModule({
      ensureSubscriptions: async () => {},
      authGate: {
        getDevBypassNotice: () => '',
        verifyPosLogin: async () => true,
        verifyOwnerLogin: async () => true,
        verifyOwnerPasswordChange: async () => true,
        verifyEmployeeLogin: async () => true,
        verifyEmployeePasswordChange: async () => true,
      },
      getItemCategoryType: () => 'drink',
      getItemCosts: () => ({}),
      getItemPrices: () => ({}),
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
      loadDailySummariesRange: async () => ({}),
      watchDailySummariesRange: () => () => {},
      readDailySummariesRange: () => ({}),
      getOwnerPasswords: () => ({}),
      hideAll: () => {},
      menuData: {},
      saveOwnerPassword: async () => {},
      updateItemData: async () => {},
    })

    await finance.updateFinanceStats('day')
    await finance.openRevenueModal('drink')

    expect(document.getElementById('revenueDetailList')?.innerHTML || '').toContain('成本 $60')
    expect(document.getElementById('revenueDetailList')?.innerHTML || '').toContain('可樂 x2')
    expect(document.getElementById('revenueDetailList')?.innerHTML || '').toContain('$200')
  })

  it('aggregates grouped child lines by their own category in revenue details', async () => {
    const ownerWelcome = createElementStub('ownerWelcome')
    ownerWelcome.innerText = '景偉'
    dom.add(ownerWelcome)
    dom.add(createElementStub('revenueDetailTitle'))
    dom.add(createElementStub('revenueDetailList'))
    dom.add(createElementStub('revenueDetailModal'))
    dom.add(createElementStub('finBtnSpecific'))
    dom.add(createElementStub('confidentialPage'))
    dom.add(createElementStub('financeCategoryCards'))
    dom.add(createElementStub('financeTitle'))
    dom.add(createElementStub('monthTotalRev'))
    dom.add(createElementStub('monthTotalCost'))
    dom.add(createElementStub('monthNetProfit'))

    const finance = createOwnerFinanceModule({
      ensureSubscriptions: async () => {},
      authGate: {
        getDevBypassNotice: () => '',
        verifyPosLogin: async () => true,
        verifyOwnerLogin: async () => true,
        verifyOwnerPasswordChange: async () => true,
        verifyEmployeeLogin: async () => true,
        verifyEmployeePasswordChange: async () => true,
      },
      getItemCategoryType: () => 'a_la_carte',
      getItemCosts: () => ({}),
      getItemPrices: () => ({}),
      listClosedOrdersByRange: async () => [
        {
          formattedSeq: '12-1',
          seq: 12,
          seat: 'A1',
          time: '2026/05/30 18:00:00',
          timestamp: new Date('2026-05-30T18:00:00+08:00').getTime(),
          total: 310,
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
              selectionSummary: '',
              isTreat: false,
              sourceEntryId: 'entry_food',
              unitCost: 120,
            },
            {
              lineId: 'entry_food_child_0',
              groupId: 'entry_food',
              parentLineId: 'entry_food_main',
              role: 'upgrade',
              catalogKey: 'drink.latte',
              inventoryKey: 'drink.latte',
              displayName: '拿鐵咖啡',
              shortName: '拿鐵',
              categoryKey: 'drink',
              station: 'kitchen',
              courseKind: 'drink',
              quantity: 1,
              unitPrice: 60,
              priceDelta: 60,
              lineTotal: 60,
              selectionSummary: '',
              isTreat: false,
              sourceEntryId: 'entry_food',
              unitCost: 20,
            },
          ],
        },
      ],
      loadDailySummariesRange: async () => ({}),
      watchDailySummariesRange: () => () => {},
      readDailySummariesRange: () => ({}),
      getOwnerPasswords: () => ({}),
      hideAll: () => {},
      menuData: {},
      saveOwnerPassword: async () => {},
      updateItemData: async () => {},
    })

    await finance.updateFinanceStats('day')
    await finance.openRevenueModal('drink')

    const html = document.getElementById('revenueDetailList')?.innerHTML || ''
    expect(html).toContain('拿鐵')
    expect(html).toContain('成本 $20')
    expect(html).toContain('$60')
  })

  it('includes extra adjustments in total revenue details', async () => {
    const ownerWelcome = createElementStub('ownerWelcome')
    ownerWelcome.innerText = '景偉'
    dom.add(ownerWelcome)
    dom.add(createElementStub('revenueDetailTitle'))
    dom.add(createElementStub('revenueDetailList'))
    dom.add(createElementStub('revenueDetailModal'))
    dom.add(createElementStub('finBtnSpecific'))
    dom.add(createElementStub('confidentialPage'))
    dom.add(createElementStub('financeCategoryCards'))
    dom.add(createElementStub('financeTitle'))
    dom.add(createElementStub('monthTotalRev'))
    dom.add(createElementStub('monthTotalCost'))
    dom.add(createElementStub('monthNetProfit'))

    const finance = createOwnerFinanceModule({
      ensureSubscriptions: async () => {},
      authGate: {
        getDevBypassNotice: () => '',
        verifyPosLogin: async () => true,
        verifyOwnerLogin: async () => true,
        verifyOwnerPasswordChange: async () => true,
        verifyEmployeeLogin: async () => true,
        verifyEmployeePasswordChange: async () => true,
      },
      getItemCategoryType: () => 'drink',
      getItemCosts: () => ({}),
      getItemPrices: () => ({}),
      listClosedOrdersByRange: async () => [
        {
          formattedSeq: '12-1',
          seq: 12,
          seat: 'A1',
          time: '2026/05/30 18:00:00',
          timestamp: new Date('2026-05-30T18:00:00+08:00').getTime(),
          total: 180,
          originalTotal: 200,
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
              quantity: 1,
              unitPrice: 100,
              priceDelta: 0,
              lineTotal: 100,
              selectionSummary: '',
              isTreat: false,
              sourceEntryId: 'entry_1',
              unitCost: 30,
            },
          ],
        },
      ],
      loadDailySummariesRange: async () => ({}),
      watchDailySummariesRange: () => () => {},
      readDailySummariesRange: () => ({}),
      getOwnerPasswords: () => ({}),
      hideAll: () => {},
      menuData: {},
      saveOwnerPassword: async () => {},
      updateItemData: async () => {},
    })

    await finance.updateFinanceStats('day')
    await finance.openRevenueModal('total')

    const html = document.getElementById('revenueDetailList')?.innerHTML || ''
    expect(html).toContain('可樂')
    expect(html).toContain('整單調整')
    expect(html).toContain('$80')
  })

  it('updates owner password through the shared auth flow', async () => {
    const ownerWelcome = createElementStub('ownerWelcome')
    ownerWelcome.innerText = '景偉'
    dom.add(ownerWelcome)
    const pwdOwnerName = createElementStub('pwdOwnerName')
    dom.add(pwdOwnerName)
    const oldPwd = createElementStub('oldPwd')
    dom.add(oldPwd)
    const newPwd = createElementStub('newPwd')
    dom.add(newPwd)
    const confirmPwd = createElementStub('confirmPwd')
    dom.add(confirmPwd)
    dom.add(createElementStub('changePasswordModal'))

    const saves: Array<{
      ownerName: string
      record: { passwordHash: string; passwordSalt: string; updatedAt?: number }
    }> = []
    const ownerPasswords = {
      景偉: {
        passwordHash: 'old-hash',
        passwordSalt: 'old-salt',
      },
    }

    const finance = createOwnerFinanceModule({
      ensureSubscriptions: async () => {},
      authGate: {
        getDevBypassNotice: () => '',
        verifyPosLogin: async () => true,
        verifyOwnerLogin: async () => true,
        verifyOwnerPasswordChange: async () => true,
        verifyEmployeeLogin: async () => true,
        verifyEmployeePasswordChange: async () => true,
      },
      getItemCategoryType: () => 'drink',
      getItemCosts: () => ({}),
      getItemPrices: () => ({}),
      listClosedOrdersByRange: async () => [],
      loadDailySummariesRange: async () => ({}),
      watchDailySummariesRange: () => () => {},
      readDailySummariesRange: () => ({}),
      getOwnerPasswords: () => ownerPasswords,
      hideAll: () => {},
      menuData: {},
      saveOwnerPassword: async (ownerName, record) => {
        saves.push({ ownerName, record })
      },
      updateItemData: async () => {},
    })

    finance.openChangePasswordModal('景偉')
    oldPwd.value = 'old-pass'
    newPwd.value = 'next-pass'
    confirmPwd.value = 'next-pass'
    await finance.confirmChangePassword()

    expect(saves).toHaveLength(1)
    expect(saves[0]?.ownerName).toBe('景偉')
    expect(saves[0]?.record.passwordHash).not.toBe('old-hash')
    expect(saves[0]?.record.passwordSalt).not.toBe('old-salt')
  })

  it('keeps finance and cost entry access symmetric across all three owner accounts', async () => {
    const session = new Map<string, string>()
    ;(globalThis as { sessionStorage?: Storage }).sessionStorage = {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => {
        session.set(key, value)
      },
      removeItem: (key: string) => {
        session.delete(key)
      },
      clear: () => {
        session.clear()
      },
      key: (index: number) => [...session.keys()][index] ?? null,
      get length() {
        return session.size
      },
    } as Storage

    const ownerWelcome = createElementStub('ownerWelcome')
    dom.add(ownerWelcome)
    dom.add(createElementStub('confidentialPage'))
    dom.add(createElementStub('financeDashboard'))
    dom.add(createElementStub('costInputSection'))
    dom.add(createElementStub('financeCalendarSection'))
    dom.add(createElementStub('confidentialTitle'))
    dom.add(createElementStub('costEditorList'))
    dom.add(createElementStub('finCalendarTitle'))
    dom.add(createElementStub('finCalendarGrid'))
    dom.add(createElementStub('financeCategoryCards'))
    dom.add(createElementStub('financeTitle'))
    dom.add(createElementStub('monthTotalRev'))
    dom.add(createElementStub('monthTotalCost'))
    dom.add(createElementStub('monthNetProfit'))

    const verifyOwnerLogin = async () => true
    const finance = createOwnerFinanceModule({
      ensureSubscriptions: async () => {},
      authGate: {
        getDevBypassNotice: () => '',
        verifyPosLogin: async () => true,
        verifyOwnerLogin,
        verifyOwnerPasswordChange: async () => true,
        verifyEmployeeLogin: async () => true,
        verifyEmployeePasswordChange: async () => true,
      },
      getItemCategoryType: () => 'drink',
      getItemCosts: () => ({}),
      getItemPrices: () => ({}),
      listClosedOrdersByRange: async () => [],
      loadDailySummariesRange: async () => ({}),
      watchDailySummariesRange: () => () => {},
      readDailySummariesRange: () => ({}),
      getOwnerPasswords: () => ({
        景偉: { passwordHash: 'h1', passwordSalt: 's1' },
        小飛: { passwordHash: 'h2', passwordSalt: 's2' },
        威志: { passwordHash: 'h3', passwordSalt: 's3' },
      }),
      hideAll: () => {},
      menuData: {
        drink: {
          key: 'drink',
          label: '飲品',
          shortLabel: '飲品',
          sections: [{ id: 'drink-main', label: '飲品', items: [] }],
        },
      },
      saveOwnerPassword: async () => {},
      updateItemData: async () => {},
    })

    sessionStorage.setItem('ownerMode', 'cost')
    await finance.openConfidentialPage('景偉')
    expect(document.getElementById('confidentialTitle')?.innerText).toBe('成本輸入')
    expect(document.getElementById('costInputSection')?.style.display).toBe('block')
    expect(document.getElementById('financeCalendarSection')?.style.display).toBe('none')

    sessionStorage.setItem('ownerMode', 'finance')
    await finance.openConfidentialPage('小飛')
    expect(document.getElementById('confidentialTitle')?.innerText).toBe('財務與詳細訂單')
    expect(document.getElementById('costInputSection')?.style.display).toBe('none')
    expect(document.getElementById('financeCalendarSection')?.style.display).toBe('block')

    sessionStorage.setItem('ownerMode', 'cost')
    await finance.openConfidentialPage('威志')
    expect(document.getElementById('confidentialTitle')?.innerText).toBe('成本輸入')
    expect(document.getElementById('costInputSection')?.style.display).toBe('block')
    expect(document.getElementById('financeCalendarSection')?.style.display).toBe('none')
  })

  it('renders the cost editor from schema categories and item definitions', () => {
    dom.add(createElementStub('costEditorList'))

    const finance = createOwnerFinanceModule({
      ensureSubscriptions: async () => {},
      authGate: {
        getDevBypassNotice: () => '',
        verifyPosLogin: async () => true,
        verifyOwnerLogin: async () => true,
        verifyOwnerPasswordChange: async () => true,
        verifyEmployeeLogin: async () => true,
        verifyEmployeePasswordChange: async () => true,
      },
      getItemCategoryType: () => 'drink',
      getItemCosts: () => ({
        'drink.black-tea': 12,
      }),
      getItemPrices: () => ({
        'drink.black-tea': 80,
      }),
      listClosedOrdersByRange: async () => [],
      loadDailySummariesRange: async () => ({}),
      watchDailySummariesRange: () => () => {},
      readDailySummariesRange: () => ({}),
      getOwnerPasswords: () => ({}),
      hideAll: () => {},
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
      saveOwnerPassword: async () => {},
      updateItemData: async () => {},
    })

    finance.updateFinancialPage('景偉')

    const html = document.getElementById('costEditorList')?.innerHTML || ''
    expect(html).toContain('飲品')
    expect(html).toContain('紅茶')
    expect(html).toContain('data-action="update-item-data"')
    expect(html).toContain('data-name="drink.black-tea"')
    expect(html).toContain('value="80"')
    expect(html).toContain('value="12"')
  })

  it('uses business-date keys for early-morning detailed orders and specific finance summary', async () => {
    const finBtnSpecific = createElementStub('finBtnSpecific')
    finBtnSpecific.dataset = { bizDateKey: '2026-05-31' }
    const ownerOrderBox = createElementStub('ownerOrderBox')
    const ownerSelectedDateTitle = createElementStub('ownerSelectedDateTitle')
    const ownerOrderListSection = createElementStub('ownerOrderListSection')
    const financeTitle = createElementStub('financeTitle')

    dom.add(finBtnSpecific)
    dom.add(ownerOrderBox)
    dom.add(ownerSelectedDateTitle)
    dom.add(ownerOrderListSection)
    dom.add(financeTitle)
    dom.add(createElementStub('monthTotalRev'))
    dom.add(createElementStub('monthTotalCost'))
    dom.add(createElementStub('monthNetProfit'))
    dom.add(createElementStub('financeCategoryCards'))

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

    const finance = createOwnerFinanceModule({
      ensureSubscriptions: async () => {},
      authGate: {
        getDevBypassNotice: () => '',
        verifyPosLogin: async () => true,
        verifyOwnerLogin: async () => true,
        verifyOwnerPasswordChange: async () => true,
        verifyEmployeeLogin: async () => true,
        verifyEmployeePasswordChange: async () => true,
      },
      getItemCategoryType: () => 'drink',
      getItemCosts: () => ({}),
      getItemPrices: () => ({}),
      listClosedOrdersByRange,
      loadDailySummariesRange: async () => ({
        '2026-05-31': {
          paidTotal: 260,
          originalTotal: 260,
          orderCount: 1,
          itemQtyTotal: 1,
          categoryRevenue: { drink: 260 },
          categoryCost: { drink: 0 },
          updatedAt: 1,
        },
      }),
      watchDailySummariesRange: () => () => {},
      readDailySummariesRange: () => ({
        '2026-05-31': {
          paidTotal: 260,
          originalTotal: 260,
          orderCount: 1,
          itemQtyTotal: 1,
          categoryRevenue: { drink: 260 },
          categoryCost: { drink: 0 },
          updatedAt: 1,
        },
      }),
      getOwnerPasswords: () => ({}),
      hideAll: () => {},
      menuData: {},
      saveOwnerPassword: async () => {},
      updateItemData: async () => {},
    })

    await finance.showOwnerDetailedOrders('2026-05-31')
    await finance.updateFinanceStats('specific', '2026-05-31')

    expect(ownerSelectedDateTitle.innerText).toBe('📅 2026/5/31 詳細訂單')
    expect(ownerOrderListSection.style.display).toBe('block')
    expect(ownerOrderBox.innerHTML).toContain('00:30:00')
    expect(financeTitle.innerText).toBe('🏠 全店總計 (2026-05-31)')
  })
})
