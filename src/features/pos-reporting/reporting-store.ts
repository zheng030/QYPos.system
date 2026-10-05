import { reactive, shallowRef } from 'vue'

import type { PageRouter } from '@/app/page-router'
import type { PosDataService } from '@/features/pos-data/service'
import type { PosKernelService } from '@/features/pos-kernel/service'
import type {
  PosCategoryKey,
  PosMenuCategoryKey,
  PosOrder,
  PosReceiptData,
  PosReportRange,
} from '@/features/pos-kernel/types'
import { MENU_CATEGORY_KEYS, POS_CATEGORY_LABELS } from '@/features/pos-kernel/types'
import {
  getBusinessDateKey,
  getBusinessDayRange,
  getBusinessDayRangeFromKey,
  getBusinessMonthRange,
  getBusinessWeekRange,
  parseBusinessDateKey,
  toBusinessDate,
} from '@/shared/business-day'
import { getErrorMessage } from '@/shared/errors'

type ReportingStoreDeps = {
  kernel: PosKernelService
  data: PosDataService
  router: PageRouter
  printReceipt: (data: PosReceiptData, isTicket?: boolean) => Promise<void>
}

type StatsRow = {
  name: string
  count: number
  categoryKey: PosCategoryKey
}

type StatDisplayCategoryKey = 'all' | PosMenuCategoryKey | 'other'

export type ItemStatsColumn = {
  key: StatDisplayCategoryKey
  title: string
  rows: StatsRow[]
}

export type CalendarCell = { day: number; revenue: string } | null

export type ItemStatsRange = 'day' | 'week' | 'month' | 'custom'

const STAT_COLUMN_KEYS: StatDisplayCategoryKey[] = ['all', ...MENU_CATEGORY_KEYS, 'other']
const REPORT_TITLES: Record<string, string> = {
  day: '💰 今日營業額 (即時)',
  week: '💰 本周營業額 (即時)',
  month: '💰 當月營業額 (即時)',
}

function normalizeItemName(name: string) {
  const match = name.match(/^[^<]+/)
  const rawName = match ? match[0] : name
  return rawName.replace(/\s*\(招待\)$/, '').trim()
}

function getRangeBounds(range: PosReportRange | string) {
  const bounds =
    range === 'day'
      ? getBusinessDayRange(new Date())
      : range === 'week'
        ? getBusinessWeekRange(new Date())
        : getBusinessMonthRange(new Date())
  return { start: bounds.start, end: bounds.endExclusive }
}

export function toLocalIsoDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().split('T')[0]
}

function parseDateInput(value: string, fallback: string) {
  if (!value) {
    return fallback
  }
  try {
    return parseBusinessDateKey(value)
  } catch {
    return fallback
  }
}

function getStatsCategoryKey(categoryKey: PosCategoryKey | string | undefined): PosCategoryKey {
  return (MENU_CATEGORY_KEYS as readonly string[]).includes(String(categoryKey))
    ? (categoryKey as PosCategoryKey)
    : 'other'
}

export type ReportingStore = ReturnType<typeof createReportingStore>

export function createReportingStore({ kernel, data, router, printReceipt }: ReportingStoreDeps) {
  let stopHistoryWatch: (() => void) | null = null
  let stopReportSummaryWatch: (() => void) | null = null
  let stopCalendarSummaryWatch: (() => void) | null = null
  let stopItemStatsWatch: (() => void) | null = null

  function stopAllWatches() {
    for (const stop of [stopHistoryWatch, stopReportSummaryWatch, stopCalendarSummaryWatch, stopItemStatsWatch]) {
      stop?.()
    }
    stopHistoryWatch = null
    stopReportSummaryWatch = null
    stopCalendarSummaryWatch = null
    stopItemStatsWatch = null
  }

  // ---- today's history ----

  const historyOrders = shallowRef<PosOrder[] | null>(null)
  const historySimpleMode = shallowRef(false)
  const expandedHistoryRows = reactive(new Set<number>())

  async function showHistory() {
    try {
      const orders = await data.listClosedOrdersForBusinessDay(new Date())
      expandedHistoryRows.clear()
      historyOrders.value = orders
    } catch (error) {
      alert(`showHistory 錯誤\n${getErrorMessage(error)}`)
    }
  }

  function watchHistory(anchor: Date) {
    stopHistoryWatch?.()
    stopHistoryWatch = data.watchClosedOrdersForBusinessDay(anchor, () => {
      void showHistory()
    })
  }

  function toggleHistoryView() {
    historySimpleMode.value = !historySimpleMode.value
    void showHistory()
  }

  function toggleHistoryRow(index: number) {
    if (expandedHistoryRows.has(index)) expandedHistoryRows.delete(index)
    else expandedHistoryRows.add(index)
  }

  async function reprintOrder(index: number) {
    try {
      const target = historyOrders.value?.[index]
      if (!target) {
        alert('找不到此訂單')
        return
      }
      await printReceipt({
        seq: target.formattedSeq || target.seq || index + 1,
        table: target.seat || target.table || '',
        time: target.time,
        lines: target.lines || [],
        original: target.originalTotal || target.total || 0,
        total: target.total || 0,
      })
    } catch (error) {
      alert(`列印失敗：${getErrorMessage(error)}`)
    }
  }

  async function deleteOrder(index: number) {
    try {
      if (!confirm('確定刪除此筆訂單嗎？')) return
      const target = historyOrders.value?.[index]
      if (!target) {
        alert('找不到此訂單')
        return
      }
      await data.deleteClosedOrder(target)
      void showHistory()
    } catch (error) {
      alert(`刪除失敗：${getErrorMessage(error)}`)
    }
  }

  // ---- business close summary ----

  const summaryModal = reactive({ open: false, count: 0, total: 0 })

  async function openCloseBusinessModal() {
    const orders = await data.listClosedOrdersForBusinessDay(new Date())
    summaryModal.count = orders.length
    summaryModal.total = orders.reduce((sum, order) => sum + (order.total || 0), 0)
    summaryModal.open = true
  }

  function closeSummaryModal() {
    summaryModal.open = false
  }

  function confirmCloseBusiness() {
    alert('清空所有資料功能目前停用')
    closeSummaryModal()
  }

  // ---- revenue report ----

  // null keeps the static first-option highlight until a report range is chosen.
  const reportSegment = shallowRef<number | null>(null)
  const reportSummary = reactive({ title: '全店營收', total: '$0', count: '總單數: 0', primary: '$0', secondary: '$0' })
  const calendarTitle = shallowRef('')
  const calendarCells = shallowRef<CalendarCell[]>([])

  function moveSegmentHighlighter(index: number) {
    reportSegment.value = index
    itemStatsActive.value = null
  }

  function renderReportSummary(start: Date, end: Date, title: string) {
    const summaries = Object.values(data.readDailySummariesRange(start, end))
    const sumRevenue = (keys: PosCategoryKey[]) =>
      summaries.reduce(
        (sum, summary) => sum + keys.reduce((inner, key) => inner + Number(summary.categoryRevenue?.[key] || 0), 0),
        0
      )
    reportSummary.title = title
    reportSummary.total = `$${Math.round(summaries.reduce((sum, summary) => sum + (summary.paidTotal || 0), 0))}`
    reportSummary.count = `總單數: ${summaries.reduce((sum, summary) => sum + (summary.orderCount || 0), 0)}`
    reportSummary.primary = `$${Math.round(sumRevenue(['pasta_risotto', 'bread_set']))}`
    reportSummary.secondary = `$${Math.round(
      sumRevenue(['salad', 'plated_main', 'a_la_carte', 'soup', 'drink', 'other'])
    )}`
  }

  async function generateReport(range: PosReportRange | string) {
    try {
      if (router.activePage.value !== 'reportPage') {
        return
      }
      moveSegmentHighlighter(range === 'week' ? 1 : range === 'month' ? 2 : 0)
      const { start, end } = getRangeBounds(range)
      const title = REPORT_TITLES[range] || REPORT_TITLES.day
      await data.loadDailySummariesRange(start, end)
      stopReportSummaryWatch?.()
      stopReportSummaryWatch = data.watchDailySummariesRange(start, end, () => {
        renderReportSummary(start, end, title)
      })
      renderReportSummary(start, end, title)
    } catch (error) {
      alert(`generateReport 錯誤\n${getErrorMessage(error)}`)
    }
  }

  function renderCalendarGrid(year: number, month: number, start: Date, end: Date) {
    const totals: Record<number, number> = {}
    for (const [bizDate, summary] of Object.entries(data.readDailySummariesRange(start, end))) {
      totals[Number(bizDate.slice(-2))] = summary.paidTotal || 0
    }
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    calendarCells.value = [
      ...Array.from({ length: firstDay }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => ({
        day: index + 1,
        revenue: totals[index + 1] ? `$${totals[index + 1]}` : '',
      })),
    ]
  }

  async function renderCalendar() {
    try {
      const today = toBusinessDate(new Date())
      const year = today.getFullYear()
      const month = today.getMonth()
      calendarTitle.value = `${year}年 ${month + 1}月`
      const { start, endExclusive: end } = getBusinessMonthRange(today)
      await data.loadDailySummariesRange(start, end)
      stopCalendarSummaryWatch?.()
      stopCalendarSummaryWatch = data.watchDailySummariesRange(start, end, () => {
        renderCalendarGrid(year, month, start, end)
      })
      renderCalendarGrid(year, month, start, end)
    } catch (error) {
      alert(`renderCalendar 錯誤\n${getErrorMessage(error)}`)
    }
  }

  // ---- item stats ----

  // The markup starts with 今日 highlighted; any stats render replaces it with the clicked range (if any).
  const itemStatsActive = shallowRef<ItemStatsRange | null>('day')
  const customStatsVisible = shallowRef<boolean | null>(null)
  const statsDates = reactive({ start: '', end: '' })
  const itemStatsColumns = shallowRef<ItemStatsColumn[]>([])

  function collectRankedStats(start: Date, endExclusive: Date): ItemStatsColumn[] {
    const counts = new Map<string, StatsRow>()
    for (const stats of Object.values(data.readItemStatsRange(start, endExclusive))) {
      for (const item of Object.values(stats)) {
        const name = normalizeItemName(item.displayName)
        const categoryKey = getStatsCategoryKey(item.categoryKey || kernel.helpers.getItemCategoryType(name))
        const current = counts.get(name) || { name, count: 0, categoryKey }
        current.count += item.qty || 0
        counts.set(name, current)
      }
    }

    const byCategory = Object.fromEntries(STAT_COLUMN_KEYS.map((key) => [key, [] as StatsRow[]])) as Record<
      StatDisplayCategoryKey,
      StatsRow[]
    >
    for (const item of [...counts.values()].sort((left, right) => right.count - left.count)) {
      byCategory.all.push(item)
      const targetKey = getStatsCategoryKey(item.categoryKey)
      if (targetKey !== 'extra') {
        byCategory[targetKey].push(item)
      }
    }
    return STAT_COLUMN_KEYS.map((key) => ({
      key,
      title: key === 'all' ? '全店總計' : POS_CATEGORY_LABELS[key],
      rows: byCategory[key],
    }))
  }

  async function renderItemStats(range: ItemStatsRange, clicked = false) {
    itemStatsActive.value = clicked ? range : null
    customStatsVisible.value = range === 'custom'

    const businessNow = toBusinessDate(new Date())
    let start = new Date(businessNow)
    let end: Date | null = null
    if (range === 'custom') {
      statsDates.start ||= toLocalIsoDate(businessNow)
      statsDates.end ||= toLocalIsoDate(businessNow)
      const startKey = parseDateInput(statsDates.start, getBusinessDateKey(businessNow))
      const endKey = parseDateInput(statsDates.end, startKey)
      start = getBusinessDayRangeFromKey(startKey).start
      end = getBusinessDayRangeFromKey(endKey).endExclusive
    } else {
      const bounds = getRangeBounds(range)
      start = bounds.start
      end = bounds.end
    }

    const rangeEnd = end || start
    await data.loadItemStatsRange(start, rangeEnd)
    stopItemStatsWatch?.()
    stopItemStatsWatch = data.watchItemStatsRange(start, rangeEnd, () => {
      itemStatsColumns.value = collectRankedStats(start, rangeEnd)
    })
    itemStatsColumns.value = collectRankedStats(start, rangeEnd)
  }

  function setStatsDate(field: 'start' | 'end', value: string) {
    statsDates[field] = value
    void renderItemStats('custom')
  }

  router.onLeave(stopAllWatches)

  router.onEnter((pageId) => {
    if (pageId === 'historyPage') {
      watchHistory(new Date())
      void showHistory()
    }
    if (pageId === 'reportPage') {
      void Promise.all([generateReport('day'), renderCalendar()]).then(() => {
        moveSegmentHighlighter(0)
      })
    }
    if (pageId === 'itemStatsPage') {
      void renderItemStats('day')
    }
  })

  return {
    historyOrders,
    historySimpleMode,
    expandedHistoryRows,
    summaryModal,
    reportSegment,
    reportSummary,
    calendarTitle,
    calendarCells,
    itemStatsActive,
    customStatsVisible,
    statsDates,
    itemStatsColumns,
    toggleHistoryView,
    toggleHistoryRow,
    reprintOrder,
    deleteOrder,
    openCloseBusinessModal,
    closeSummaryModal,
    confirmCloseBusiness,
    generateReport,
    renderItemStats,
    setStatsDate,
  }
}
