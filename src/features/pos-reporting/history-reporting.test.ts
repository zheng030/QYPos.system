import { afterEach, describe, expect, it } from 'vitest'

import type { V3DailySummaryRangeEvent } from '@/features/pos-data/rtdb-v3-types'
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
      getItemCategoryType: () => 'bar',
      getMergedItems: (items) => items.map((item) => ({ ...item, count: 1 })),
      listClosedOrdersByDay: async () => [],
      listClosedOrdersByRange: async () => [],
      loadDailySummariesRange: async () => ({}),
      loadItemStatsRange: async () => ({}),
      watchClosedOrdersRange: () => () => {},
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
})
