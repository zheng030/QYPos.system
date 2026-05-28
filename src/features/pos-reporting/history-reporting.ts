import type {
  PosCartItem,
  PosMergedCartItem,
  PosOrder,
  PosReceiptData,
  PosReportRange,
} from '@/features/pos-kernel/types'
import { findElement } from '@/shared/dom-helpers'
import { getErrorMessage, toNumberValue } from '@/shared/errors'
import { formatFlavorText } from '@/shared/flavor'

type HistoryReportingDeps = {
  getDateFromOrder: (order: PosOrder) => Date
  getBusinessDate: (date: Date | string | number) => number
  getHistoryOrders: () => PosOrder[]
  getHistoryViewDate: () => Date
  getIsHistorySimpleMode: () => boolean
  getItemCategoryType: (name: string) => string
  getLatestVisibleOrders: () => PosOrder[] | null
  getMergedItems: (items: PosCartItem[]) => PosMergedCartItem[]
  getVisibleOrders: () => PosOrder[]
  moveSegmentHighlighter: (index: number) => void
  openPage: (pageId: string) => void
  printReceipt: (data: PosReceiptData, isTicket?: boolean) => Promise<void> | void
  saveAllToCloud: (updates: Record<string, unknown>) => Promise<void>
  setHistoryViewDate: (date: Date) => void
  setIsHistorySimpleMode: (value: boolean) => void
  setLatestVisibleOrders: (orders: PosOrder[] | null) => void
}

type StatsRow = {
  name: string
  count: number
}

function normalizeItemName(name: string) {
  const match = name.match(/^[^<]+/)
  const rawName = match ? match[0] : name
  return rawName.replace(/\s*\(招待\)$/, '').trim()
}

function setText(id: string, value: string) {
  const element = findElement(id)
  if (element) {
    element.innerText = value
  }
}

function getDateInputValue(input: HTMLInputElement | null, fallback: Date) {
  if (!input?.value) {
    return fallback
  }
  const [year, month, day] = input.value.split('-').map((value) => Number(value))
  return new Date(year, month - 1, day)
}

function toLocalIsoDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().split('T')[0]
}

export function createHistoryReportingModule(deps: HistoryReportingDeps) {
  function getOpenHistoryDetailIds() {
    const ids: string[] = []
    document.querySelectorAll<HTMLElement>('.history-detail').forEach((element) => {
      if (element.style.display === 'block') {
        ids.push(element.id)
      }
    })
    return ids
  }

  function renderOrderItem(item: PosCartItem | PosMergedCartItem) {
    const count = item.count ?? 1
    const countStr = count > 1 ? ` <b style="color:#ef476f;">x${count}</b>` : ''
    const flavorText = formatFlavorText(item.flavor)
    const itemLabel = `${item.name}${flavorText ? ` (${flavorText})` : ''}`
    if (item.isTreat) {
      const treatTag = item.name.includes('(招待)') ? '' : ' (招待)'
      return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted #eee;"><span>${itemLabel}${treatTag}${countStr}</span> <span>$0</span></div>`
    }

    const price = toNumberValue(item.price)
    const priceStr = count > 1 ? `$${price * count}` : `$${price}`
    return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted #eee;"><span>${itemLabel}${countStr}</span> <span>${priceStr}</span></div>`
  }

  function getOrdersForActions() {
    const latestVisibleOrders = deps.getLatestVisibleOrders()
    return latestVisibleOrders && latestVisibleOrders.length > 0
      ? latestVisibleOrders
      : (latestVisibleOrders ?? deps.getVisibleOrders())
  }

  function collectRankedStats(startBiz: number, endBiz: number) {
    const counts: Record<string, number> = {}
    const typeMap: Record<string, string> = {}

    deps.getHistoryOrders().forEach((order) => {
      const biz = deps.getBusinessDate(deps.getDateFromOrder(order))
      if (biz < startBiz || biz >= endBiz || !Array.isArray(order.items)) {
        return
      }

      order.items.forEach((item) => {
        const name = normalizeItemName(item.name)
        const qty = item.count ?? 1
        if (!typeMap[name]) {
          typeMap[name] = item.type || deps.getItemCategoryType(name)
        }
        counts[name] = (counts[name] || 0) + qty
      })
    })

    const barList: StatsRow[] = []
    const bbqList: StatsRow[] = []

    Object.entries(counts)
      .sort((left, right) => right[1] - left[1])
      .forEach(([name, count]) => {
        const target = (typeMap[name] || deps.getItemCategoryType(name)) === 'bar' ? barList : bbqList
        target.push({ name, count })
      })

    return { barList, bbqList }
  }

  function renderRankedList(list: StatsRow[], containerId: string, emptyHtml: string, detailed = true) {
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

  function showHistory() {
    try {
      const historyBox = findElement('history-box')
      if (!historyBox) return

      const openIds = getOpenHistoryDetailIds()
      historyBox.innerHTML = ''

      const orders = deps.getVisibleOrders()
      deps.setLatestVisibleOrders(orders)

      if (orders.length === 0) {
        historyBox.innerHTML = "<div style='padding:20px;color:#8d99ae;'>今日尚無訂單 (或已日結)</div>"
        return
      }

      const isHistorySimpleMode = deps.getIsHistorySimpleMode()
      const btnIcon = isHistorySimpleMode ? '📝' : '🔢'
      const btnText = isHistorySimpleMode ? '切換為詳細清單' : '切換為簡化清單 (合併數量)'
      historyBox.innerHTML += `<div class="view-toggle-container"><button data-action="toggle-history-view" class="view-toggle-btn btn-effect"><span class="icon">${btnIcon}</span><span>${btnText}</span></button></div>`

      orders.forEach((order, index) => {
        const seqDisplay = order.formattedSeq ? `#${order.formattedSeq}` : `#${orders.length - index}`
        const custInfo =
          order.customerName || order.customerPhone
            ? `<span style="color:#007bff; font-weight:bold;">${order.customerName || ''}</span> ${order.customerPhone || ''}`
            : "<span style='color:#ccc'>-</span>"
        const itemsToDisplay = isHistorySimpleMode ? deps.getMergedItems(order.items) : order.items
        const itemsDetail = itemsToDisplay.map(renderOrderItem).join('')
        const timeOnly = order.time.split(' ')[1] || order.time
        const rowId = `detail-${index}`
        const displayStyle = openIds.includes(rowId) ? 'block' : 'none'
        let amountDisplay = `$${order.total}`
        if (order.originalTotal && order.originalTotal !== order.total) {
          amountDisplay = `<span style="text-decoration:line-through; color:#999; font-size:12px;">$${order.originalTotal}</span> <br> <span style="color:#ef476f;">$${order.total}</span>`
        }

        historyBox.innerHTML += `<div class="history-row btn-effect" data-action="toggle-detail" data-id="${rowId}"><span class="seq" style="font-weight:bold; color:#4361ee;">${seqDisplay}</span><span class="seat">${order.seat}</span><span class="cust">${custInfo}</span><span class="time">${timeOnly}</span><span class="amt">${amountDisplay}</span></div><div id="${rowId}" class="history-detail" style="display:${displayStyle};"><div style="background:#f8fafc; padding:15px; border-radius:0 0 12px 12px; border:1px solid #eee; border-top:none;"><b>📅 完整時間：</b>${order.time}<br><b>🧾 內容：</b><br>${itemsDetail}<div style="text-align:right; margin-top:10px; font-size:18px; font-weight:bold; color:#ef476f;">總計：$${order.total}</div><div style="text-align:right; margin-top:15px; border-top:1px solid #ddd; padding-top:10px; display:flex; justify-content:flex-end; gap:10px;"><button data-action="reprint-order" data-index="${index}" class="print-btn btn-effect">🖨 列印明細</button><button data-action="delete-single-order" data-index="${index}" class="delete-single-btn btn-effect">🗑 刪除此筆訂單</button></div></div></div>`
      })
    } catch (error) {
      alert(`showHistory 錯誤\n${getErrorMessage(error)}`)
    }
  }

  function toggleHistoryView() {
    deps.setIsHistorySimpleMode(!deps.getIsHistorySimpleMode())
    showHistory()
  }

  function filterOrders(startTime: Date, endTime: Date | null, titleText: string) {
    let total = 0
    let count = 0
    let barTotal = 0
    let bbqTotal = 0

    deps.getHistoryOrders().forEach((order) => {
      const orderTime = deps.getDateFromOrder(order)
      if (orderTime < startTime || (endTime && orderTime >= endTime)) {
        return
      }

      total += order.total || 0
      count += 1
      order.items.forEach((item) => {
        const itemType = item.type || deps.getItemCategoryType(item.name)
        if (itemType === 'bbq') {
          bbqTotal += toNumberValue(item.price)
        } else {
          barTotal += toNumberValue(item.price)
        }
      })
    })

    setText('rptTitle', titleText)
    setText('rptTotal', `$${total}`)
    setText('rptCount', `總單數: ${count}`)
    setText('rptBar', `$${barTotal}`)
    setText('rptBBQ', `$${bbqTotal}`)
  }

  function generateReport(type: PosReportRange | string) {
    try {
      const reportContent = findElement('reportContent')
      const reportPage = findElement('reportPage')
      if (!reportContent || !reportPage || reportPage.style.display === 'none') {
        return
      }

      document.querySelectorAll('.segment-option').forEach((button) => {
        button.classList.remove('active')
      })

      let index = 0
      if (type === 'week') index = 1
      if (type === 'month') index = 2

      const options = document.querySelectorAll('.segment-option')
      if (options[index]) {
        options[index].classList.add('active')
      }
      deps.moveSegmentHighlighter(index)

      const now = new Date()
      if (now.getHours() < 5) now.setDate(now.getDate() - 1)
      const start = new Date(now)
      let title = ''

      if (type === 'day') {
        start.setHours(5, 0, 0, 0)
        const end = new Date(start)
        end.setDate(end.getDate() + 1)
        title = '💰 今日營業額 (即時)'
        filterOrders(start, end, title)
      } else if (type === 'week') {
        const day = start.getDay() || 7
        start.setDate(start.getDate() - (day - 1))
        start.setHours(5, 0, 0, 0)
        title = '💰 本周營業額 (即時)'
        filterOrders(start, new Date(), title)
      } else if (type === 'month') {
        start.setDate(1)
        start.setHours(5, 0, 0, 0)
        title = '💰 當月營業額 (即時)'
        filterOrders(start, new Date(), title)
      }
    } catch (error) {
      alert(`generateReport 錯誤\n${getErrorMessage(error)}`)
    }
  }

  function renderCalendar() {
    try {
      const now = new Date()
      if (now.getHours() < 5) now.setDate(now.getDate() - 1)
      const year = now.getFullYear()
      const month = now.getMonth()
      setText('calendarMonthTitle', `${year}年 ${month + 1}月`)

      const dailyTotals: Record<number, number> = {}
      deps.getHistoryOrders().forEach((order) => {
        const date = deps.getDateFromOrder(order)
        if (date.getHours() < 5) date.setDate(date.getDate() - 1)
        if (date.getFullYear() === year && date.getMonth() === month) {
          const dayKey = date.getDate()
          dailyTotals[dayKey] = (dailyTotals[dayKey] || 0) + (order.total || 0)
        }
      })

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

      const today = new Date()
      if (today.getHours() < 5) today.setDate(today.getDate() - 1)
      for (let day = 1; day <= daysInMonth; day += 1) {
        const cell = document.createElement('div')
        cell.className = 'calendar-day'
        if (day === today.getDate() && month === today.getMonth()) {
          cell.classList.add('today')
        }
        const revenue = dailyTotals[day] ? `$${dailyTotals[day]}` : ''
        cell.innerHTML = `<div class="day-num">${day}</div><div class="day-revenue">${revenue}</div>`
        grid.appendChild(cell)
      }
    } catch (error) {
      alert(`renderCalendar 錯誤\n${getErrorMessage(error)}`)
    }
  }

  function openItemStatsPage() {
    deps.openPage('itemStatsPage')
    const activeBtn = findElement('statBtnDay')
    if (activeBtn) {
      renderItemStats('day', activeBtn)
    }
  }

  function renderItemStats(range: PosReportRange | string, button: HTMLElement | null = null) {
    document.querySelectorAll('#itemStatsPage .segment-option').forEach((element) => {
      element.classList.remove('active')
    })

    let activeBtn = button
    if (!activeBtn) {
      if (range === 'day') activeBtn = findElement('statBtnDay')
      if (range === 'week') activeBtn = findElement('statBtnWeek')
      if (range === 'month') activeBtn = findElement('statBtnMonth')
      if (range === 'custom') activeBtn = findElement('statBtnCustom')
    }

    const customRangeDiv = findElement('customStatsDateRange')
    if (customRangeDiv) {
      customRangeDiv.style.display = range === 'custom' ? 'flex' : 'none'
    }

    if (activeBtn) {
      activeBtn.classList.add('active')
      const highlighter = findElement('statsHighlighter')
      if (highlighter) {
        let index = 0
        if (range === 'week') index = 1
        if (range === 'month') index = 2
        if (range === 'custom') index = 3
        highlighter.style.transform = `translateX(${index * 100}%)`
      }
    }

    const now = new Date()
    if (now.getHours() < 5) now.setDate(now.getDate() - 1)
    let start = new Date(now)
    let end: Date | null = null

    if (range === 'day') {
      start.setHours(5, 0, 0, 0)
      end = new Date(start)
      end.setDate(end.getDate() + 1)
    } else if (range === 'week') {
      const day = start.getDay() || 7
      start.setDate(start.getDate() - (day - 1))
      start.setHours(5, 0, 0, 0)
      end = new Date(start)
      end.setDate(end.getDate() + 7)
    } else if (range === 'month') {
      start.setDate(1)
      start.setHours(5, 0, 0, 0)
      end = new Date(start)
      end.setMonth(end.getMonth() + 1)
    } else if (range === 'custom') {
      const sInput = findElement<HTMLInputElement>('statsStartDate')
      const eInput = findElement<HTMLInputElement>('statsEndDate')

      if (sInput && !sInput.value) {
        const date = new Date()
        date.setDate(1)
        sInput.value = toLocalIsoDate(date)
      }
      if (eInput && !eInput.value) {
        const date = new Date()
        date.setMonth(date.getMonth() + 1)
        date.setDate(0)
        eInput.value = toLocalIsoDate(date)
      }

      start = getDateInputValue(sInput, start)
      start.setHours(5, 0, 0, 0)
      end = getDateInputValue(eInput, start)
      end.setDate(end.getDate() + 1)
      end.setHours(5, 0, 0, 0)
    }

    const { barList, bbqList } = collectRankedStats(deps.getBusinessDate(start), deps.getBusinessDate(end || start))

    renderRankedList(
      barList,
      'statsListBar',
      "<div style='text-align:center; padding:20px; color:#ccc;'>無銷量資料</div>"
    )
    renderRankedList(
      bbqList,
      'statsListBbq',
      "<div style='text-align:center; padding:20px; color:#ccc;'>無銷量資料</div>"
    )
  }

  function changeStatsMonth(offset: number) {
    const nextDate = new Date(deps.getHistoryViewDate())
    nextDate.setMonth(nextDate.getMonth() + offset)
    deps.setHistoryViewDate(nextDate)
    renderPublicStats()
  }

  function renderPublicStats() {
    const historyViewDate = deps.getHistoryViewDate()
    const year = historyViewDate.getFullYear()
    const month = historyViewDate.getMonth()
    setText('statsMonthTitle', `${year}年 ${month + 1}月`)

    const stats: Record<string, { count: number; type: string }> = {}
    deps.getHistoryOrders().forEach((order) => {
      const date = deps.getDateFromOrder(order)
      if (date.getHours() < 5) date.setDate(date.getDate() - 1)
      if (date.getFullYear() !== year || date.getMonth() !== month) {
        return
      }

      order.items.forEach((item) => {
        const name = normalizeItemName(item.name)
        if (!stats[name]) {
          stats[name] = {
            count: 0,
            type: item.type || deps.getItemCategoryType(name),
          }
        }
        stats[name].count += item.count ?? 1
      })
    })

    const barList: StatsRow[] = []
    const bbqList: StatsRow[] = []

    Object.entries(stats).forEach(([name, data]) => {
      const target = data.type === 'bar' ? barList : bbqList
      target.push({ name, count: data.count })
    })

    barList.sort((left, right) => right.count - left.count)
    bbqList.sort((left, right) => right.count - left.count)

    renderRankedList(barList, 'publicStatsBar', "<div style='padding:10px; color:#8d99ae;'>無資料</div>", false)
    renderRankedList(bbqList, 'publicStatsBbq', "<div style='padding:10px; color:#8d99ae;'>無資料</div>", false)
  }

  async function reprintOrder(index: number) {
    try {
      const target = getOrdersForActions()[index]
      if (!target) {
        alert('找不到此訂單')
        return
      }

      const seq = target.formattedSeq || target.seq || index + 1
      const table = target.seat || target.table || ''
      const time =
        target.time ||
        (target.timestamp
          ? new Date(target.timestamp).toLocaleString('zh-TW', { hour12: false })
          : new Date().toLocaleString('zh-TW', { hour12: false }))
      const original = target.originalTotal || target.total || 0
      const rawItems = Array.isArray(target.items) ? target.items : []
      const items = deps.getIsHistorySimpleMode() ? deps.getMergedItems(rawItems) : rawItems

      await deps.printReceipt(
        {
          seq,
          table,
          time,
          items,
          original,
          total: target.total || 0,
        },
        false
      )
    } catch (error) {
      alert(`列印失敗：${getErrorMessage(error)}`)
    }
  }

  async function deleteSingleOrder(index: number) {
    try {
      if (!confirm('確定刪除此筆訂單嗎？')) return

      const target = getOrdersForActions()[index]
      if (!target) {
        alert('找不到此訂單')
        return
      }

      const historyOrders = deps.getHistoryOrders()
      const idxInHistory = historyOrders.indexOf(target)
      if (idxInHistory === -1) {
        alert('刪除失敗：索引不存在')
        return
      }

      historyOrders.splice(idxInHistory, 1)
      await deps.saveAllToCloud({ historyOrders })
      showHistory()
    } catch (error) {
      alert(`刪除失敗：${getErrorMessage(error)}`)
    }
  }

  return {
    changeStatsMonth,
    deleteSingleOrder,
    filterOrders,
    generateReport,
    openItemStatsPage,
    renderCalendar,
    renderItemStats,
    renderPublicStats,
    reprintOrder,
    showHistory,
    toggleHistoryView,
  }
}
