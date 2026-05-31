import { afterEach, describe, expect, it, vi } from 'vitest'

import type { V3DailyItemStat, V3DailySummaryRangeEvent } from '@/features/pos-data/rtdb-v3-types'
import { createHistoryReportingModule } from './history-reporting'

type ElementStub = {
  id: string
  style: { display: string }
  innerText: string
  innerHTML: string
  classList: {
    add: (...tokens: string[]) => void
    remove: (...tokens: string[]) => void
  }
  appendChild: (child: ElementStub) => void
}

function createElementStub(id = ''): ElementStub {
  return {
    id,
    style: { display: '' },
    innerText: '',
    innerHTML: '',
    classList: {
      add: () => {},
      remove: () => {},
    },
    appendChild: () => {},
  }
}

function createItemStat(displayName: string, qty: number, categoryKey: string, revenue: number): V3DailyItemStat {
  return {
    displayName,
    qty,
    categoryKey,
    revenue,
    cost: 0,
    updatedAt: 1,
  }
}

function installDocumentStub() {
  const elements = new Map<string, ElementStub>()
  const body = {
    appendChild: (element: ElementStub) => {
      if (element.id) elements.set(element.id, element)
    },
    querySelectorAll: () => [],
  }
  const documentStub = {
    body,
    createElement: () => createElementStub(),
    getElementById: (id: string) => elements.get(id) || null,
    querySelectorAll: () => [],
  }

  ;(globalThis as { document?: unknown }).document = documentStub as unknown
  ;(globalThis as { HTMLElement?: unknown }).HTMLElement = Object as unknown

  return {
    add(element: ElementStub) {
      if (element.id) elements.set(element.id, element)
    },
    reset() {
      elements.clear()
    },
  }
}

const dom = installDocumentStub()

afterEach(() => {
  vi.useRealTimers()
  dom.reset()
})

describe('history-reporting', () => {
  it('keeps independent summary watchers for report and calendar views', async () => {
    const watchCalls: Array<{ start: number; end: number }> = []
    const stopCalls: string[] = []

    const reportPage = createElementStub('reportPage')
    reportPage.style.display = 'block'
    dom.add(reportPage)
    dom.add(createElementStub('reportContent'))
    dom.add(createElementStub('calendarMonthTitle'))
    dom.add(createElementStub('calendarGrid'))

    const reporting = createHistoryReportingModule({
      getIsHistorySimpleMode: () => false,
      getItemCategoryType: () => 'other',
      listClosedOrdersForBusinessDay: async () => [],
      listClosedOrdersByRange: async () => [],
      loadDailySummariesRange: async () => ({}),
      loadItemStatsRange: async () => ({}),
      watchClosedOrdersForBusinessDay: () => () => {},
      watchDailySummariesRange: (start, endExclusive, _listener: (event: V3DailySummaryRangeEvent) => void) => {
        watchCalls.push({ start: start.getTime(), end: endExclusive.getTime() })
        const id = `summary-${watchCalls.length}`
        return () => {
          stopCalls.push(id)
        }
      },
      watchItemStatsRange: () => () => {},
      readDailySummariesRange: () => ({}),
      readItemStatsRange: () => ({}),
      moveSegmentHighlighter: () => {},
      openPage: () => {},
      printReceipt: async () => {},
      deleteClosedOrder: async () => {},
      setIsHistorySimpleMode: () => {},
    })

    await reporting.generateReport('day')
    await reporting.renderCalendar()

    expect(watchCalls).toHaveLength(2)
    expect(stopCalls).toHaveLength(0)

    reporting.stopAllWatches()
    expect(stopCalls).toHaveLength(2)
  })

  it('renders grouped line items for closed-order history details', async () => {
    const historyBox = createElementStub('history-box')
    dom.add(historyBox)

    const reporting = createHistoryReportingModule({
      getIsHistorySimpleMode: () => false,
      getItemCategoryType: () => 'drink',
      listClosedOrdersForBusinessDay: async () => [
        {
          formattedSeq: '12-1',
          seat: 'A1',
          time: '2026/05/30 18:00:00',
          total: 300,
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
              selectionSummary: '溫度：熱',
              isTreat: false,
              sourceEntryId: 'entry_food',
            },
          ],
        },
      ],
      listClosedOrdersByRange: async () => [],
      loadDailySummariesRange: async () => ({}),
      loadItemStatsRange: async () => ({}),
      watchClosedOrdersForBusinessDay: () => () => {},
      watchDailySummariesRange: () => () => {},
      watchItemStatsRange: () => () => {},
      readDailySummariesRange: () => ({}),
      readItemStatsRange: () => ({}),
      moveSegmentHighlighter: () => {},
      openPage: () => {},
      printReceipt: async () => {},
      deleteClosedOrder: async () => {},
      setIsHistorySimpleMode: () => {},
    })

    await reporting.showHistory()

    expect(historyBox.innerHTML).toContain('青醬雞胸')
    expect(historyBox.innerHTML).toContain('拿鐵')
    expect(historyBox.innerHTML).toContain('(溫度：熱)')
    expect(historyBox.innerHTML).toContain('$250')
  })

  it('renders item stats with all-store total plus 7 menu categories and other bucket', async () => {
    const itemStatsColumns = createElementStub('itemStatsColumns')
    const customRange = createElementStub('customStatsDateRange')
    dom.add(itemStatsColumns)
    dom.add(customRange)

    const reporting = createHistoryReportingModule({
      getIsHistorySimpleMode: () => false,
      getItemCategoryType: () => 'other',
      listClosedOrdersForBusinessDay: async () => [],
      listClosedOrdersByRange: async () => [],
      loadDailySummariesRange: async () => ({}),
      loadItemStatsRange: async () => ({
        '2026-05-30': {
          pasta: createItemStat('雞胸', 3, 'pasta_risotto', 750),
          bread: createItemStat('蒜香麵包餐', 2, 'bread_set', 300),
          salad: createItemStat('凱薩沙拉', 1, 'salad', 180),
          main: createItemStat('香煎雞腿排', 4, 'plated_main', 1200),
          aLaCarte: createItemStat('炸物拼盤', 5, 'a_la_carte', 500),
          soup: createItemStat('主廚濃湯', 2, 'soup', 180),
          drink: createItemStat('拿鐵', 6, 'drink', 360),
          other: createItemStat('神秘品項', 1, 'other', 50),
        },
      }),
      watchClosedOrdersForBusinessDay: () => () => {},
      watchDailySummariesRange: () => () => {},
      watchItemStatsRange: () => () => {},
      readDailySummariesRange: () => ({}),
      readItemStatsRange: () => ({
        '2026-05-30': {
          pasta: createItemStat('雞胸', 3, 'pasta_risotto', 750),
          bread: createItemStat('蒜香麵包餐', 2, 'bread_set', 300),
          salad: createItemStat('凱薩沙拉', 1, 'salad', 180),
          main: createItemStat('香煎雞腿排', 4, 'plated_main', 1200),
          aLaCarte: createItemStat('炸物拼盤', 5, 'a_la_carte', 500),
          soup: createItemStat('主廚濃湯', 2, 'soup', 180),
          drink: createItemStat('拿鐵', 6, 'drink', 360),
          other: createItemStat('神秘品項', 1, 'other', 50),
        },
      }),
      moveSegmentHighlighter: () => {},
      openPage: () => {},
      printReceipt: async () => {},
      deleteClosedOrder: async () => {},
      setIsHistorySimpleMode: () => {},
    })

    await reporting.renderItemStats('day')

    expect(itemStatsColumns.innerHTML).toContain('全店總計')
    expect(itemStatsColumns.innerHTML).toContain('義大利麵 / 燉飯')
    expect(itemStatsColumns.innerHTML).toContain('麵包餐')
    expect(itemStatsColumns.innerHTML).toContain('沙拉')
    expect(itemStatsColumns.innerHTML).toContain('排餐')
    expect(itemStatsColumns.innerHTML).toContain('單品')
    expect(itemStatsColumns.innerHTML).toContain('湯品')
    expect(itemStatsColumns.innerHTML).toContain('飲品')
    expect(itemStatsColumns.innerHTML).toContain('其他 / 未知')
    expect(itemStatsColumns.innerHTML).toContain('拿鐵')
    expect(itemStatsColumns.innerHTML).toContain('炸物拼盤')
  })

  it('reprints and deletes the visible archived order', async () => {
    const historyBox = createElementStub('history-box')
    dom.add(historyBox)
    const printReceipt = vi.fn(async () => {})
    const deleteClosedOrder = vi.fn(async () => {})
    ;(globalThis as { confirm?: (message?: string) => boolean }).confirm = () => true

    const order = {
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
          role: 'main' as const,
          catalogKey: 'pasta_risotto.chicken-breast',
          inventoryKey: 'pasta_risotto.chicken-breast',
          displayName: '青醬雞胸義大利麵',
          shortName: '青醬雞胸',
          categoryKey: 'pasta_risotto' as const,
          station: 'kitchen' as const,
          courseKind: 'food' as const,
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

    const reporting = createHistoryReportingModule({
      getIsHistorySimpleMode: () => false,
      getItemCategoryType: () => 'drink',
      listClosedOrdersForBusinessDay: async () => [order],
      listClosedOrdersByRange: async () => [],
      loadDailySummariesRange: async () => ({}),
      loadItemStatsRange: async () => ({}),
      watchClosedOrdersForBusinessDay: () => () => {},
      watchDailySummariesRange: () => () => {},
      watchItemStatsRange: () => () => {},
      readDailySummariesRange: () => ({}),
      readItemStatsRange: () => ({}),
      moveSegmentHighlighter: () => {},
      openPage: () => {},
      printReceipt,
      deleteClosedOrder,
      setIsHistorySimpleMode: () => {},
    })

    await reporting.showHistory()
    await reporting.reprintOrder(0)
    await reporting.deleteSingleOrder(0)

    expect(printReceipt).toHaveBeenCalledWith({
      seq: '12-1',
      table: 'A1',
      time: '2026/05/30 18:00:00',
      lines: order.lines,
      original: 310,
      total: 310,
    })
    expect(deleteClosedOrder).toHaveBeenCalledWith(order)
  })

  it('uses the current timestamp as the business-day anchor for early-morning history', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-31T02:30:00+08:00'))

    const historyBox = createElementStub('history-box')
    dom.add(historyBox)

    const seenAnchors: Date[] = []
    const listClosedOrdersForBusinessDay = vi.fn(async (anchor: Date) => {
      seenAnchors.push(anchor)
      return []
    })
    const reporting = createHistoryReportingModule({
      getIsHistorySimpleMode: () => false,
      getItemCategoryType: () => 'drink',
      listClosedOrdersForBusinessDay,
      listClosedOrdersByRange: async () => [],
      loadDailySummariesRange: async () => ({}),
      loadItemStatsRange: async () => ({}),
      watchClosedOrdersForBusinessDay: () => () => {},
      watchDailySummariesRange: () => () => {},
      watchItemStatsRange: () => () => {},
      readDailySummariesRange: () => ({}),
      readItemStatsRange: () => ({}),
      moveSegmentHighlighter: () => {},
      openPage: () => {},
      printReceipt: async () => {},
      deleteClosedOrder: async () => {},
      setIsHistorySimpleMode: () => {},
    })

    await reporting.showHistory()

    expect(listClosedOrdersForBusinessDay).toHaveBeenCalledTimes(1)
    expect(seenAnchors[0]?.getTime()).toBe(new Date('2026-05-31T02:30:00+08:00').getTime())
  })

  it('uses business-date keys for custom item stats ranges without midnight drift', async () => {
    const itemStatsColumns = createElementStub('itemStatsColumns')
    const customRange = createElementStub('customStatsDateRange')
    const statsStartDate = createElementStub('statsStartDate') as ElementStub & { value: string }
    const statsEndDate = createElementStub('statsEndDate') as ElementStub & { value: string }
    statsStartDate.value = '2026-05-31'
    statsEndDate.value = '2026-05-31'

    dom.add(itemStatsColumns)
    dom.add(customRange)
    dom.add(statsStartDate)
    dom.add(statsEndDate)

    const seenRanges: Array<{ start: number; end: number }> = []
    const reporting = createHistoryReportingModule({
      getIsHistorySimpleMode: () => false,
      getItemCategoryType: () => 'drink',
      listClosedOrdersForBusinessDay: async () => [],
      listClosedOrdersByRange: async () => [],
      loadDailySummariesRange: async () => ({}),
      loadItemStatsRange: async (start, endExclusive) => {
        seenRanges.push({ start: start.getTime(), end: endExclusive.getTime() })
        return {
          '2026-05-31': {
            drink: createItemStat('紅茶', 1, 'drink', 80),
          },
        }
      },
      watchClosedOrdersForBusinessDay: () => () => {},
      watchDailySummariesRange: () => () => {},
      watchItemStatsRange: () => () => {},
      readDailySummariesRange: () => ({}),
      readItemStatsRange: () => ({
        '2026-05-31': {
          drink: createItemStat('紅茶', 1, 'drink', 80),
        },
      }),
      moveSegmentHighlighter: () => {},
      openPage: () => {},
      printReceipt: async () => {},
      deleteClosedOrder: async () => {},
      setIsHistorySimpleMode: () => {},
    })

    await reporting.renderItemStats('custom')

    expect(seenRanges).toEqual([
      {
        start: new Date('2026-05-31T05:00:00+08:00').getTime(),
        end: new Date('2026-06-01T05:00:00+08:00').getTime(),
      },
    ])
    expect(itemStatsColumns.innerHTML).toContain('紅茶')
  })
})
