import { afterEach, describe, expect, it } from 'vitest'

import { createOwnerFinanceModule } from './owner-finance'

type ElementStub = {
  id: string
  style: { display: string }
  innerText: string
  innerHTML: string
  value?: string
  dataset?: Record<string, string>
  querySelector?: () => ElementStub | null
  querySelectorAll?: () => ElementStub[]
}

function createElementStub(id = ''): ElementStub {
  return {
    id,
    style: { display: '' },
    innerText: '',
    innerHTML: '',
    value: '',
    dataset: {},
    querySelector: () => null,
    querySelectorAll: () => [],
  }
}

function installDocumentStub() {
  const elements = new Map<string, ElementStub>()
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

  return {
    add(element: ElementStub) {
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

describe('owner-finance', () => {
  it('uses historical item cost snapshots and quantity in revenue detail modal', async () => {
    const ownerWelcome = createElementStub('ownerWelcome')
    ownerWelcome.innerText = '景偉'
    dom.add(ownerWelcome)
    dom.add(createElementStub('revenueDetailTitle'))
    dom.add(createElementStub('revenueDetailList'))
    dom.add(createElementStub('revenueDetailModal'))
    dom.add(createElementStub('financeDetailModal'))
    dom.add(createElementStub('finBtnSpecific'))
    dom.add(createElementStub('confidentialPage'))

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
      getBusinessDate: (date) => new Date(date).getTime(),
      getDateFromOrder: (order) => new Date(order.timestamp || Date.now()),
      getItemCategoryType: () => 'bar',
      getItemCosts: () => ({}),
      getItemPrices: () => ({}),
      listClosedOrdersByDay: async () => [],
      listClosedOrdersByRange: async () => [
        {
          formattedSeq: '12',
          seq: 12,
          seat: 'A1',
          time: '2026/05/30 18:00:00',
          timestamp: new Date('2026-05-30T18:00:00+08:00').getTime(),
          total: 200,
          items: [{ name: '可樂', price: 100, cost: 30, count: 2, type: 'bar' }],
        },
      ],
      loadDailySummariesRange: async () => ({}),
      watchDailySummariesRange: () => () => {},
      readDailySummariesRange: () => ({}),
      getOwnerPasswords: () => ({}),
      hideAll: () => {},
      menuData: {},
      foodOptionVariants: {},
      saveOwnerPassword: async () => {},
      updateItemData: async () => {},
    })

    await finance.updateFinanceStats('day')
    await finance.openRevenueModal('bar')

    expect(document.getElementById('revenueDetailList')?.innerHTML || '').toContain('成本 $60')
    expect(document.getElementById('revenueDetailList')?.innerHTML || '').toContain('可樂 x2')
    expect(document.getElementById('revenueDetailList')?.innerHTML || '').toContain('$200')
  })
})
