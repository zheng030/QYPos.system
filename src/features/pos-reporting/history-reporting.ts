import type {
  V3DailyItemStat,
  V3DailySummary,
  V3DailySummaryRangeEvent,
  V3HistoryRangeEvent,
  V3ItemStatsRangeEvent,
} from '@/features/pos-data/rtdb-v3-types'
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
import { findElement } from '@/shared/dom-helpers'
import { getErrorMessage } from '@/shared/errors'
import { getGroupedOrderLines } from '@/shared/grouped-order-lines'

type HistoryReportingDeps = {
  getIsHistorySimpleMode: () => boolean
  getItemCategoryType: (name: string) => PosCategoryKey
  listClosedOrdersForBusinessDay: (anchor: Date) => Promise<PosOrder[]>
  listClosedOrdersByRange: (start: Date, endExclusive: Date) => Promise<PosOrder[]>
  loadDailySummariesRange: (start: Date, endExclusive: Date) => Promise<Record<string, V3DailySummary>>
  loadItemStatsRange: (start: Date, endExclusive: Date) => Promise<Record<string, Record<string, V3DailyItemStat>>>
  watchClosedOrdersForBusinessDay: (anchor: Date, listener: (event: V3HistoryRangeEvent) => void) => () => void
  watchDailySummariesRange: (
    start: Date,
    endExclusive: Date,
    listener: (event: V3DailySummaryRangeEvent) => void
  ) => () => void
  watchItemStatsRange: (start: Date, endExclusive: Date, listener: (event: V3ItemStatsRangeEvent) => void) => () => void
  readDailySummariesRange: (start: Date, endExclusive: Date) => Record<string, V3DailySummary>
  readItemStatsRange: (start: Date, endExclusive: Date) => Record<string, Record<string, V3DailyItemStat>>
  moveSegmentHighlighter: (index: number) => void
  openPage: (pageId: string) => void
  printReceipt: (data: PosReceiptData, isTicket?: boolean) => Promise<void> | void
  deleteClosedOrder: (order: PosOrder) => Promise<void>
  setIsHistorySimpleMode: (value: boolean) => void
}

type StatsRow = {
  name: string
  count: number
  categoryKey: PosCategoryKey
}

type StatDisplayCategoryKey = 'all' | PosMenuCategoryKey | 'other'

function setText(id: string, value: string) {
  const element = findElement(id)
  if (element) {
    element.innerText = value
  }
}

function normalizeItemName(name: string) {
  const match = name.match(/^[^<]+/)
  const rawName = match ? match[0] : name
  return rawName.replace(/\s*\(招待\)$/, '').trim()
}

function getRangeBounds(range: PosReportRange | string) {
  if (range === 'day') {
    const { start, endExclusive } = getBusinessDayRange(new Date())
    return { start, end: endExclusive }
  }
  if (range === 'week') {
    const { start, endExclusive } = getBusinessWeekRange(new Date())
    return { start, end: endExclusive }
  }
  const { start, endExclusive } = getBusinessMonthRange(new Date())
  return { start, end: endExclusive }
}

function toLocalIsoDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().split('T')[0]
}

function getDateInputValue(input: HTMLInputElement | null, fallback: string) {
  if (!input?.value) {
    return fallback
  }
  try {
    return parseBusinessDateKey(input.value)
  } catch {
    return fallback
  }
}

function _renderRankedList(list: StatsRow[], containerId: string, emptyHtml: string, detailed = true) {
  const container = findElement(containerId)
  if (!container) return

  if (list.length === 0) {
    container.innerHTML = emptyHtml
    return
  }

  container.innerHTML = list
    .map((item, index) => {
      if (!detailed) {
        return `<div class="stats-item-row"><span>${index + 1}. ${item.name}</span><span class="stats-count">${item.count}</span></div>`
      }
      let rankClass = ''
      if (index === 0) rankClass = 'top-1'
      else if (index === 1) rankClass = 'top-2'
      else if (index === 2) rankClass = 'top-3'

      return `
        <div class="stats-row-item">
          <div class="rank-badge ${rankClass}">${index + 1}</div>
          <span class="stats-name">${item.name}</span>
          <span class="stats-val">${item.count}</span>
        </div>
      `
    })
    .join('')
}

function getStatsCategoryKey(categoryKey: PosCategoryKey | string | undefined): PosCategoryKey {
  return (MENU_CATEGORY_KEYS as readonly string[]).includes(String(categoryKey))
    ? (categoryKey as PosCategoryKey)
    : 'other'
}

function createRankedGroups() {
  return Object.fromEntries([
    ['all', [] as StatsRow[]],
    ...[...MENU_CATEGORY_KEYS, 'other'].map((key) => [key, [] as StatsRow[]] as const),
  ]) as Record<StatDisplayCategoryKey, StatsRow[]>
}

function renderCategoryStatColumns(
  containerId: string,
  groups: Record<StatDisplayCategoryKey, StatsRow[]>,
  emptyHtml: string,
  detailed: boolean = true
) {
  const container = findElement(containerId)
  if (!container) return

  container.innerHTML = (['all', ...MENU_CATEGORY_KEYS, 'other'] as StatDisplayCategoryKey[])
    .map((categoryKey) => {
      const list = groups[categoryKey]
      const content =
        list.length === 0
          ? emptyHtml
          : detailed
            ? list
                .map((item, index) => {
                  let rankClass = ''
                  if (index === 0) rankClass = 'top-1'
                  else if (index === 1) rankClass = 'top-2'
                  else if (index === 2) rankClass = 'top-3'

                  return `
                    <div class="stats-row-item">
                      <div class="rank-badge ${rankClass}">${index + 1}</div>
                      <span class="stats-name">${item.name}</span>
                      <span class="stats-val">${item.count}</span>
                    </div>
                  `
                })
                .join('')
            : list
                .map(
                  (item, index) =>
                    `<div class="stats-item-row"><span>${index + 1}. ${item.name}</span><span class="stats-count">${item.count}</span></div>`
                )
                .join('')

      return `
        <section class="stats-category-card">
          <h3>${categoryKey === 'all' ? '全店總計' : POS_CATEGORY_LABELS[categoryKey]}</h3>
          <div class="stats-header-row"><span>品項</span><span>數量</span></div>
          <div class="stats-list-content">${content}</div>
        </section>
      `
    })
    .join('')
}

export function createHistoryReportingModule(deps: HistoryReportingDeps) {
  let stopHistoryWatch: (() => void) | null = null
  let stopReportSummaryWatch: (() => void) | null = null
  let stopCalendarSummaryWatch: (() => void) | null = null
  let stopItemStatsWatch: (() => void) | null = null
  let stopPublicItemStatsWatch: (() => void) | null = null
  let historyViewDate = toBusinessDate(new Date())
  let visibleOrders: PosOrder[] = []

  function resetWatch(stop: (() => void) | null) {
    stop?.()
    return null
  }

  function stopAllWatches() {
    stopHistoryWatch = resetWatch(stopHistoryWatch)
    stopReportSummaryWatch = resetWatch(stopReportSummaryWatch)
    stopCalendarSummaryWatch = resetWatch(stopCalendarSummaryWatch)
    stopItemStatsWatch = resetWatch(stopItemStatsWatch)
    stopPublicItemStatsWatch = resetWatch(stopPublicItemStatsWatch)
  }

  function watchHistory(anchor: Date) {
    stopHistoryWatch = resetWatch(stopHistoryWatch)
    stopHistoryWatch = deps.watchClosedOrdersForBusinessDay(anchor, () => {
      void showHistory()
    })
  }

  function collectRankedStatsFromCache(start: Date, endExclusive: Date) {
    const counts = new Map<string, StatsRow>()
    Object.values(deps.readItemStatsRange(start, endExclusive)).forEach((stats) => {
      Object.values(stats).forEach((item) => {
        const name = normalizeItemName(item.displayName)
        const categoryKey = getStatsCategoryKey(item.categoryKey || deps.getItemCategoryType(name))
        const current = counts.get(name) || { name, count: 0, categoryKey }
        current.count += item.qty || 0
        counts.set(name, current)
      })
    })

    const byCategory = createRankedGroups()
    ;[...counts.values()]
      .sort((left, right) => right.count - left.count)
      .forEach((item) => {
        byCategory.all.push(item)
        const targetKey = getStatsCategoryKey(item.categoryKey)
        if (targetKey === 'extra') {
          return
        }
        byCategory[targetKey].push(item)
      })
    return byCategory
  }

  function renderGroupedOrderItems(order: PosOrder) {
    return getGroupedOrderLines(order)
      .map(({ main, children }) => {
        const childLines = children
          .map((line) => {
            const summary = line.selectionSummary ? ` (${line.selectionSummary})` : ''
            const price = line.lineTotal > 0 ? `$${line.lineTotal}` : ''
            return `<div style="display:flex;justify-content:space-between;padding:4px 0 4px 20px;color:#64748b;"><span>${line.shortName}${summary}</span><span>${price}</span></div>`
          })
          .join('')
        return `
          <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted #eee;">
            <span>${main.shortName}${main.selectionSummary ? ` (${main.selectionSummary})` : ''}${main.quantity > 1 ? ` <b style="color:#ef476f;">x${main.quantity}</b>` : ''}</span>
            <span>$${main.lineTotal}</span>
          </div>
          ${childLines}
        `
      })
      .join('')
  }

  async function showHistory() {
    try {
      const historyBox = findElement('history-box')
      if (!historyBox) return
      const orders = await deps.listClosedOrdersForBusinessDay(new Date())
      visibleOrders = orders
      historyBox.innerHTML = ''
      if (orders.length === 0) {
        historyBox.innerHTML = "<div style='padding:20px;color:#8d99ae;'>今日尚無訂單</div>"
        return
      }

      const isHistorySimpleMode = deps.getIsHistorySimpleMode()
      const btnText = isHistorySimpleMode ? '切換為詳細清單' : '切換為簡化清單'
      historyBox.innerHTML += `<div class="view-toggle-container"><button data-action="toggle-history-view" class="view-toggle-btn btn-effect"><span>${btnText}</span></button></div>`

      orders.forEach((order, index) => {
        const seqDisplay = order.formattedSeq ? `#${order.formattedSeq}` : `#${orders.length - index}`
        const itemsDetail = renderGroupedOrderItems(order)
        const rowId = `detail-${index}`
        const amountDisplay =
          order.originalTotal && order.originalTotal !== order.total
            ? `<span style="text-decoration:line-through; color:#999; font-size:12px;">$${order.originalTotal}</span><br><span style="color:#ef476f;">$${order.total}</span>`
            : `$${order.total}`
        historyBox.innerHTML += `
          <div class="history-row btn-effect" data-action="toggle-detail" data-id="${rowId}">
            <span class="seq" style="font-weight:bold; color:#4361ee;">${seqDisplay}</span>
            <span class="seat">${order.seat || order.table || ''}</span>
            <span class="cust">${order.customerName || '-'}</span>
            <span class="time">${order.time.split(' ')[1] || order.time}</span>
            <span class="amt">${amountDisplay}</span>
          </div>
          <div id="${rowId}" class="history-detail" style="display:none;">
            <div style="background:#f8fafc; padding:15px; border-radius:0 0 12px 12px; border:1px solid #eee; border-top:none;">
              <b>📅 完整時間：</b>${order.time}<br><b>🧾 內容：</b><br>${itemsDetail}
              <div style="text-align:right; margin-top:10px; font-size:18px; font-weight:bold; color:#ef476f;">總計：$${order.total}</div>
              <div style="text-align:right; margin-top:15px; border-top:1px solid #ddd; padding-top:10px; display:flex; justify-content:flex-end; gap:10px;">
                <button data-action="reprint-order" data-index="${index}" class="print-btn btn-effect">🖨 列印明細</button>
                <button data-action="delete-order" data-index="${index}" class="delete-order-btn btn-effect">🗑 刪除此筆訂單</button>
              </div>
            </div>
          </div>
        `
      })
    } catch (error) {
      alert(`showHistory 錯誤\n${getErrorMessage(error)}`)
    }
  }

  function toggleHistoryView() {
    deps.setIsHistorySimpleMode(!deps.getIsHistorySimpleMode())
    void showHistory()
  }

  function filterOrdersFromCache(start: Date, endExclusive: Date, titleText: string) {
    const summaries = deps.readDailySummariesRange(start, endExclusive)
    const total = Object.values(summaries).reduce((sum, summary) => sum + (summary.paidTotal || 0), 0)
    const count = Object.values(summaries).reduce((sum, summary) => sum + (summary.orderCount || 0), 0)
    const mainRevenue = Object.values(summaries).reduce(
      (sum, summary) =>
        sum + Number(summary.categoryRevenue?.pasta_risotto || 0) + Number(summary.categoryRevenue?.bread_set || 0),
      0
    )
    const sideRevenue = Object.values(summaries).reduce(
      (sum, summary) =>
        sum +
        Number(summary.categoryRevenue?.salad || 0) +
        Number(summary.categoryRevenue?.plated_main || 0) +
        Number(summary.categoryRevenue?.a_la_carte || 0) +
        Number(summary.categoryRevenue?.soup || 0) +
        Number(summary.categoryRevenue?.drink || 0) +
        Number(summary.categoryRevenue?.other || 0),
      0
    )

    setText('rptTitle', titleText)
    setText('rptTotal', `$${Math.round(total)}`)
    setText('rptCount', `總單數: ${count}`)
    setText('rptPrimary', `$${Math.round(mainRevenue)}`)
    setText('rptSecondary', `$${Math.round(sideRevenue)}`)
  }

  function renderCalendarGrid(year: number, month: number, dailyTotals: Record<number, number>) {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const grid = findElement('calendarGrid')
    if (!grid) return
    grid.innerHTML = ''
    for (let index = 0; index < firstDay; index += 1) {
      const empty = document.createElement('div')
      empty.className = 'calendar-day empty'
      grid.appendChild(empty)
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const cell = document.createElement('div')
      cell.className = 'calendar-day'
      const revenue = dailyTotals[day] ? `$${dailyTotals[day]}` : ''
      cell.innerHTML = `<div class="day-num">${day}</div><div class="day-revenue">${revenue}</div>`
      grid.appendChild(cell)
    }
  }

  async function generateReport(type: PosReportRange | string) {
    try {
      const reportPage = findElement('reportPage')
      if (!reportPage || reportPage.style.display === 'none') {
        return
      }
      let index = 0
      if (type === 'week') index = 1
      if (type === 'month') index = 2
      deps.moveSegmentHighlighter(index)

      const { start, end } = getRangeBounds(type)
      const title =
        type === 'week' ? '💰 本周營業額 (即時)' : type === 'month' ? '💰 當月營業額 (即時)' : '💰 今日營業額 (即時)'
      await deps.loadDailySummariesRange(start, end)
      stopReportSummaryWatch = resetWatch(stopReportSummaryWatch)
      stopReportSummaryWatch = deps.watchDailySummariesRange(start, end, () => {
        filterOrdersFromCache(start, end, title)
      })
      filterOrdersFromCache(start, end, title)
    } catch (error) {
      alert(`generateReport 錯誤\n${getErrorMessage(error)}`)
    }
  }

  async function renderCalendar() {
    try {
      const today = toBusinessDate(new Date())
      const year = today.getFullYear()
      const month = today.getMonth()
      setText('calendarMonthTitle', `${year}年 ${month + 1}月`)
      const { start, endExclusive: end } = getBusinessMonthRange(today)
      await deps.loadDailySummariesRange(start, end)
      stopCalendarSummaryWatch = resetWatch(stopCalendarSummaryWatch)
      stopCalendarSummaryWatch = deps.watchDailySummariesRange(start, end, () => {
        const totals: Record<number, number> = {}
        Object.entries(deps.readDailySummariesRange(start, end)).forEach(([bizDate, summary]) => {
          totals[Number(bizDate.slice(-2))] = summary.paidTotal || 0
        })
        renderCalendarGrid(year, month, totals)
      })
      const totals: Record<number, number> = {}
      Object.entries(deps.readDailySummariesRange(start, end)).forEach(([bizDate, summary]) => {
        totals[Number(bizDate.slice(-2))] = summary.paidTotal || 0
      })
      renderCalendarGrid(year, month, totals)
    } catch (error) {
      alert(`renderCalendar 錯誤\n${getErrorMessage(error)}`)
    }
  }

  function openItemStatsPage() {
    deps.openPage('itemStatsPage')
    void renderItemStats('day')
  }

  async function renderItemStats(range: PosReportRange | string, button: HTMLElement | null = null) {
    document.querySelectorAll('#itemStatsPage .segment-option').forEach((element) => {
      element.classList.remove('active')
    })
    const customRangeDiv = findElement('customStatsDateRange')
    if (customRangeDiv) {
      customRangeDiv.style.display = range === 'custom' ? 'flex' : 'none'
    }
    if (button) {
      button.classList.add('active')
    }

    const businessNow = toBusinessDate(new Date())
    let start = new Date(businessNow)
    let end: Date | null = null

    if (range === 'day') {
      const rangeBounds = getBusinessDayRange(new Date())
      start = rangeBounds.start
      end = rangeBounds.endExclusive
    } else if (range === 'week') {
      const rangeBounds = getBusinessWeekRange(new Date())
      start = rangeBounds.start
      end = rangeBounds.endExclusive
    } else if (range === 'month') {
      const rangeBounds = getBusinessMonthRange(new Date())
      start = rangeBounds.start
      end = rangeBounds.endExclusive
    } else if (range === 'custom') {
      const sInput = findElement<HTMLInputElement>('statsStartDate')
      const eInput = findElement<HTMLInputElement>('statsEndDate')
      if (sInput && !sInput.value) sInput.value = toLocalIsoDate(businessNow)
      if (eInput && !eInput.value) eInput.value = toLocalIsoDate(businessNow)
      const startBizDateKey = getDateInputValue(sInput, getBusinessDateKey(businessNow))
      const endBizDateKey = getDateInputValue(eInput, startBizDateKey)
      start = getBusinessDayRangeFromKey(startBizDateKey).start
      end = getBusinessDayRangeFromKey(endBizDateKey).endExclusive
    }

    await deps.loadItemStatsRange(start, end || start)
    const render = () => {
      renderCategoryStatColumns(
        'itemStatsColumns',
        collectRankedStatsFromCache(start, end || start),
        "<div style='text-align:center; padding:20px; color:#ccc;'>無銷量資料</div>"
      )
    }
    stopItemStatsWatch = resetWatch(stopItemStatsWatch)
    stopItemStatsWatch = deps.watchItemStatsRange(start, end || start, () => {
      render()
    })
    render()
  }

  function changeStatsMonth(offset: number) {
    const nextDate = new Date(historyViewDate)
    nextDate.setMonth(nextDate.getMonth() + offset)
    historyViewDate = nextDate
    void renderPublicStats()
  }

  async function renderPublicStats() {
    const year = historyViewDate.getFullYear()
    const month = historyViewDate.getMonth()
    setText('statsMonthTitle', `${year}年 ${month + 1}月`)
    const { start, endExclusive: end } = getBusinessMonthRange(historyViewDate)
    await deps.loadItemStatsRange(start, end)
    const render = () => {
      renderCategoryStatColumns(
        'publicStatsColumns',
        collectRankedStatsFromCache(start, end),
        "<div style='padding:10px; color:#8d99ae;'>無資料</div>",
        false
      )
    }
    stopPublicItemStatsWatch = resetWatch(stopPublicItemStatsWatch)
    stopPublicItemStatsWatch = deps.watchItemStatsRange(start, end, () => {
      render()
    })
    render()
  }

  async function reprintOrder(index: number) {
    try {
      const target = visibleOrders[index]
      if (!target) {
        alert('找不到此訂單')
        return
      }
      await deps.printReceipt({
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

  async function deleteSingleOrder(index: number) {
    try {
      if (!confirm('確定刪除此筆訂單嗎？')) return
      const target = visibleOrders[index]
      if (!target) {
        alert('找不到此訂單')
        return
      }
      await deps.deleteClosedOrder(target)
      void showHistory()
    } catch (error) {
      alert(`刪除失敗：${getErrorMessage(error)}`)
    }
  }

  return {
    changeStatsMonth,
    deleteSingleOrder,
    filterOrders: filterOrdersFromCache,
    generateReport,
    openItemStatsPage,
    renderCalendar,
    renderItemStats,
    renderPublicStats,
    reprintOrder,
    showHistory,
    stopAllWatches,
    toggleHistoryView,
    watchHistory,
  }
}
