import type {
  PosFinanceStats,
  PosItemCostsMap,
  PosItemPricesMap,
  PosMenuCategory,
  PosMenuData,
  PosMenuItem,
  PosOrder,
  PosOwnerMode,
  PosOwnerName,
  PosOwnerPasswordsMap,
  PosReportRange,
  PosRevenueBucket,
  PosRevenueDetailItem,
  PosRevenueDetails,
} from '@/features/pos-kernel/types'
import { findElement, requireElement, requireInput } from '@/shared/dom-helpers'
import { toNumberValue } from '@/shared/errors'
import { getLegacyElement } from '@/shared/legacy-dom'

type OwnerFinanceDeps = {
  ensureSubscriptions: (roots: string[]) => Promise<void>
  getBusinessDate: (date: Date | string | number) => number
  getCostByItemName: (itemName: string, variant?: string) => number
  getDateFromOrder: (order: PosOrder) => Date
  getHistoryOrders: () => PosOrder[]
  getHistoryViewDate: () => Date
  getItemCategoryType: (name: string) => string
  getItemCosts: () => PosItemCostsMap
  getItemPrices: () => PosItemPricesMap
  getOrdersByDate: (targetDate: Date) => PosOrder[]
  getOwnerPasswords: () => PosOwnerPasswordsMap
  hideAll: () => void
  initHistoryDate: () => void
  menuData: PosMenuData
  foodOptionVariants: Record<string, string[]>
  saveAllToCloud: (updates: Record<string, unknown>) => Promise<void>
  setHistoryViewDate: (date: Date) => void
  updateItemData: (name: string, type: string, value: string) => Promise<void>
}

type DailyFinanceEntry = {
  barRev: number
  barCost: number
  bbqRev: number
  bbqCost: number
}

type CostRowOptions = {
  displayName?: string
  costKey?: string
  disablePrice?: boolean
}

const BAR_CATEGORIES = ['調酒', '純飲', 'shot', '啤酒', '咖啡', '飲料', '厚片', '甜點']
const BBQ_CATEGORIES = ['燒烤', '主餐', '炸物']
function setText(id: string, value: string) {
  const element = findElement(id)
  if (element) {
    element.innerText = value
  }
}

function setHtml(id: string, value: string) {
  const element = findElement(id)
  if (element) {
    element.innerHTML = value
  }
}

function setDisplay(id: string, display: string) {
  const element = findElement(id)
  if (element) {
    element.style.display = display
  }
}

function toLocalIsoDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().split('T')[0]
}

function normalizeItemName(name: string) {
  return name.replace(/\s*\(招待\)$/, '').trim()
}

function getMenuItems(categoryData: PosMenuCategory) {
  if (Array.isArray(categoryData)) return categoryData
  return Object.values(categoryData).flat()
}

function renderSummaryCardVisibility(ownerName: PosOwnerName) {
  const barCard = findElement('confidentialPage')?.querySelector<HTMLElement>('.bar-theme')
  const bbqCard = findElement('confidentialPage')?.querySelector<HTMLElement>('.bbq-theme')
  const totalCard = findElement('confidentialPage')?.querySelector<HTMLElement>('.total-theme')

  if (!barCard || !bbqCard || !totalCard) {
    return
  }

  if (ownerName === '小飛') {
    barCard.style.display = 'block'
    bbqCard.style.display = 'none'
    totalCard.style.display = 'none'
    return
  }
  if (ownerName === '威志') {
    barCard.style.display = 'none'
    bbqCard.style.display = 'block'
    totalCard.style.display = 'none'
    return
  }

  barCard.style.display = 'block'
  bbqCard.style.display = 'block'
  totalCard.style.display = 'block'
}

function renderFinanceDetailVisibility(ownerName?: PosOwnerName) {
  const financeDetail = findElement('financeDetailModal')
  const barCard = financeDetail?.querySelector<HTMLElement>('.bar-style')
  const bbqCard = financeDetail?.querySelector<HTMLElement>('.bbq-style')
  const totalCard = financeDetail?.querySelector<HTMLElement>('.total-style')

  if (!barCard || !bbqCard || !totalCard || !ownerName) {
    return
  }

  if (ownerName === '小飛') {
    barCard.style.display = 'block'
    bbqCard.style.display = 'none'
    totalCard.style.display = 'none'
    return
  }
  if (ownerName === '威志') {
    barCard.style.display = 'none'
    bbqCard.style.display = 'block'
    totalCard.style.display = 'none'
    return
  }

  barCard.style.display = 'block'
  bbqCard.style.display = 'block'
  totalCard.style.display = 'block'
}

function buildFinanceStats() {
  return {
    barRev: 0,
    barCost: 0,
    bbqRev: 0,
    bbqCost: 0,
    unknownRev: 0,
    unknownCost: 0,
    extraRev: 0,
    totalRev: 0,
  } satisfies PosFinanceStats
}

function buildRevenueDetails() {
  return {
    bar: [],
    bbq: [],
    unknown: [],
    extra: [],
  } satisfies PosRevenueDetails
}

function setFinanceSummary(stats: PosFinanceStats, titleText: string) {
  setText('financeTitle', titleText)
  setText('barRevenue', `$${Math.round(stats.barRev)}`)
  setText('barCost', `-$${Math.round(stats.barCost)}`)
  setText('barNet', `$${Math.round(stats.barRev - stats.barCost)}`)
  setText('bbqRevenue', `$${Math.round(stats.bbqRev)}`)
  setText('bbqCost', `-$${Math.round(stats.bbqCost)}`)
  setText('bbqNet', `$${Math.round(stats.bbqRev - stats.bbqCost)}`)
  setText('unknownRevenue', `$${Math.round(stats.unknownRev)}`)
  setText('unknownCost', `-$${Math.round(stats.unknownCost)}`)
  setText('unknownNet', `$${Math.round(stats.unknownRev - stats.unknownCost)}`)

  const extraText = stats.extraRev >= 0 ? `$${Math.round(stats.extraRev)}` : `-$${Math.abs(Math.round(stats.extraRev))}`
  setText('extraRevenue', extraText)

  const totalRev = stats.totalRev || stats.barRev + stats.bbqRev + stats.unknownRev + stats.extraRev
  const totalCost = stats.barCost + stats.bbqCost + stats.unknownCost
  setText('monthTotalRev', `$${Math.round(totalRev)}`)
  setText('monthTotalCost', `-$${Math.round(totalCost)}`)
  setText('monthNetProfit', `$${Math.round(totalRev - totalCost)}`)
}

export function createOwnerFinanceModule(deps: OwnerFinanceDeps) {
  let dailyFinancialData: Record<string, DailyFinanceEntry> = {}
  let revenueDetails: PosRevenueDetails = buildRevenueDetails()

  function openOwnerLogin(mode: PosOwnerMode | string) {
    sessionStorage.setItem('ownerMode', mode)
    setDisplay('ownerLoginModal', 'flex')
  }

  function closeOwnerModal() {
    getLegacyElement('ownerLoginModal').style.display = 'none'
  }

  function checkOwner(name: string) {
    const password = prompt(`請輸入 ${name} 的密碼：`)
    if (password === deps.getOwnerPasswords()[name]) {
      closeOwnerModal()
      void openConfidentialPage(name as PosOwnerName)
      return
    }
    alert('❌ 密碼錯誤！')
  }

  async function openConfidentialPage(ownerName: PosOwnerName) {
    deps.hideAll()
    setDisplay('confidentialPage', 'block')
    setText('ownerWelcome', ownerName)
    await deps.ensureSubscriptions(['historyOrders', 'itemCosts', 'itemPrices'])
    setDisplay('financeDashboard', 'none')

    const currentLoginMode = (sessionStorage.getItem('ownerMode') || 'finance') as PosOwnerMode
    if (currentLoginMode === 'cost') {
      setDisplay('costInputSection', 'block')
      setDisplay('financeCalendarSection', 'none')
      setText('confidentialTitle', '成本輸入')
      updateFinancialPage(ownerName)
      return
    }

    setDisplay('costInputSection', 'none')
    setDisplay('financeCalendarSection', 'block')
    setText('confidentialTitle', '財務與詳細訂單')
    deps.initHistoryDate()
    renderConfidentialCalendar(ownerName)
  }

  function getTargetCategories(ownerName: PosOwnerName) {
    if (ownerName === '小飛') return BAR_CATEGORIES
    if (ownerName === '威志') return BBQ_CATEGORIES
    return [...BAR_CATEGORIES, ...BBQ_CATEGORIES, '其他']
  }

  function buildCostRow(name: string, price: number, cost: number, options: CostRowOptions = {}) {
    const displayName = options.displayName || name
    const priceCell = options.disablePrice
      ? `<input type="number" class="cost-input" value="${price}" placeholder="售價" disabled>`
      : `<input type="number" class="cost-input" value="${price}" placeholder="售價" data-action="update-item-data" data-name="${name}" data-type="price">`
    const costKey = options.costKey || name

    return `
                <tr>
                    <td style="font-weight: 500; color: #343a40;">${displayName}</td>
                    <td>${priceCell}</td>
                    <td>
                        <input type="number" class="cost-input" value="${cost}" placeholder="成本"
                            data-action="update-item-data" data-name="${costKey}" data-type="cost" style="color: #e03131; font-weight:bold;">
                    </td>
                </tr>
            `
  }

  function updateFinancialPage(ownerName: PosOwnerName | string) {
    const listContainer = requireElement('costEditorList')
    listContainer.innerHTML = ''

    const itemPrices = deps.getItemPrices()
    const itemCosts = deps.getItemCosts()

    getTargetCategories(ownerName as PosOwnerName).forEach((category) => {
      const categoryData = deps.menuData[category]
      if (!categoryData) return

      const catHeader = document.createElement('div')
      catHeader.className = 'cat-badge'
      catHeader.innerText = category
      listContainer.appendChild(catHeader)

      const tableContainer = document.createElement('div')
      tableContainer.className = 'cost-table-container'

      let tableHtml = `
            <table class="cost-table">
                <thead>
                    <tr>
                        <th style="width: 40%;">品項名稱</th>
                        <th style="width: 30%;">售價 (改)</th>
                        <th style="width: 30%;">成本 (改)</th>
                    </tr>
                </thead>
                <tbody>
        `

      getMenuItems(categoryData).forEach((item: PosMenuItem) => {
        const currentPrice = toNumberValue(itemPrices[item.name] ?? item.price)
        const currentCost = toNumberValue(itemCosts[item.name] ?? 0)
        tableHtml += buildCostRow(item.name, currentPrice, currentCost)

        const variants = deps.foodOptionVariants[item.name]
        variants?.forEach((option) => {
          const costKey = `${item.name}::${option}`
          const optionCost = toNumberValue(itemCosts[costKey] ?? 0)
          tableHtml += buildCostRow(item.name, currentPrice, optionCost, {
            displayName: `${item.name} (${option})`,
            costKey,
            disablePrice: true,
          })
        })
      })

      tableHtml += '</tbody></table>'
      tableContainer.innerHTML = tableHtml
      listContainer.appendChild(tableContainer)
    })
  }

  function closeFinanceDetailModal() {
    getLegacyElement('financeDetailModal').style.display = 'none'
  }

  function openFinanceDetailModal(dateKey: string, stats: DailyFinanceEntry) {
    setText('fdTitle', `📅 ${dateKey} 財務明細`)
    setText('fdBarRev', `$${Math.round(stats.barRev)}`)
    setText('fdBarCost', `-$${Math.round(stats.barCost)}`)
    setText('fdBarProfit', `$${Math.round(stats.barRev - stats.barCost)}`)
    setText('fdBbqRev', `$${Math.round(stats.bbqRev)}`)
    setText('fdBbqCost', `-$${Math.round(stats.bbqCost)}`)
    setText('fdBbqProfit', `$${Math.round(stats.bbqRev - stats.bbqCost)}`)

    const totalRev = stats.barRev + stats.bbqRev
    const totalCost = stats.barCost + stats.bbqCost
    setText('fdTotalRev', `$${Math.round(totalRev)}`)
    setText('fdTotalCost', `-$${Math.round(totalCost)}`)
    setText('fdTotalProfit', `$${Math.round(totalRev - totalCost)}`)

    const ownerName = findElement('ownerWelcome')?.innerText as PosOwnerName | undefined
    renderFinanceDetailVisibility(ownerName)
    getLegacyElement('financeDetailModal').style.display = 'flex'
  }

  function changeOwnerMonth(offset: number) {
    const nextDate = new Date(deps.getHistoryViewDate())
    nextDate.setMonth(nextDate.getMonth() + offset)
    deps.setHistoryViewDate(nextDate)
    const owner = findElement('ownerWelcome')?.innerText as PosOwnerName | undefined
    if (!owner) return
    renderConfidentialCalendar(owner)
    setDisplay('ownerOrderListSection', 'none')
    const specificBtn = findElement('finBtnSpecific')
    if (specificBtn) {
      specificBtn.style.display = 'none'
      specificBtn.dataset.date = ''
    }
  }

  function renderConfidentialCalendar(ownerName: PosOwnerName | string) {
    document.querySelectorAll('.finance-controls button').forEach((button) => {
      button.classList.remove('active')
    })
    findElement('finBtnMonth')?.classList.add('active')
    setText('financeTitle', '🏠 全店總計 (該月)')

    const historyViewDate = deps.getHistoryViewDate()
    const year = historyViewDate.getFullYear()
    const month = historyViewDate.getMonth()
    setText('finCalendarTitle', `${year}年 ${month + 1}月`)

    dailyFinancialData = {}
    const dailyCounts: Record<number, number> = {}
    const monthStats = buildFinanceStats()

    deps.getHistoryOrders().forEach((order) => {
      const date = deps.getDateFromOrder(order)
      if (date.getHours() < 5) date.setDate(date.getDate() - 1)
      if (date.getFullYear() !== year || date.getMonth() !== month) {
        return
      }

      const dayKey = date.getDate()
      const dateStr = `${year}/${month + 1}/${dayKey}`
      if (!dailyFinancialData[dateStr]) {
        dailyFinancialData[dateStr] = { barRev: 0, barCost: 0, bbqRev: 0, bbqCost: 0 }
      }
      dailyCounts[dayKey] = (dailyCounts[dayKey] || 0) + 1

      const entry = dailyFinancialData[dateStr]
      entry.barRev += order.total || 0
      monthStats.barRev += order.total || 0
      monthStats.totalRev += order.total || 0
    })

    setFinanceSummary(monthStats, '🏠 全店總計 (本月)')
    renderSummaryCardVisibility(ownerName as PosOwnerName)

    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const grid = requireElement('finCalendarGrid')
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
        cell.classList.add('active')
      }

      const dateStr = `${year}/${month + 1}/${day}`
      const stats = dailyFinancialData[dateStr] || { barRev: 0, barCost: 0, bbqRev: 0, bbqCost: 0 }
      const showRev =
        ownerName === '小飛' ? stats.barRev : ownerName === '威志' ? stats.bbqRev : stats.barRev + stats.bbqRev

      let htmlContent = `<div class="day-num">${day}</div>`
      if (showRev > 0) {
        htmlContent += `<div style="font-size:12px; color:#4361ee; font-weight:bold;">$${showRev}</div>`
        if (dailyCounts[day]) {
          htmlContent += `<div style="font-size:10px; color:#8d99ae;">(${dailyCounts[day]}單)</div>`
        }
        cell.style.backgroundColor = '#e0e7ff'
      }

      cell.dataset.action = 'select-owner-finance-day'
      cell.dataset.year = String(year)
      cell.dataset.month = String(month)
      cell.dataset.day = String(day)
      cell.dataset.dateKey = dateStr
      cell.innerHTML = htmlContent
      grid.appendChild(cell)
    }
  }

  function setActiveFinanceRange(range: PosReportRange | string) {
    document.querySelectorAll('.finance-controls button').forEach((button) => {
      button.classList.remove('active')
    })
    setDisplay('customFinanceDateRange', range === 'custom' ? 'flex' : 'none')
    if (range === 'day') findElement('finBtnDay')?.classList.add('active')
    if (range === 'week') findElement('finBtnWeek')?.classList.add('active')
    if (range === 'month') findElement('finBtnMonth')?.classList.add('active')
    if (range === 'custom') findElement('finBtnCustom')?.classList.add('active')
    if (range === 'specific') findElement('finBtnSpecific')?.classList.add('active')
  }

  function resolveFinanceRange(range: PosReportRange | string) {
    const now = new Date()
    if (now.getHours() < 5) now.setDate(now.getDate() - 1)

    let start = new Date(now)
    let end = new Date(now)
    let titleText = ''

    if (range === 'day') {
      start.setHours(5, 0, 0, 0)
      end = new Date(start)
      end.setDate(end.getDate() + 1)
      titleText = '🏠 全店總計 (今日)'
    } else if (range === 'week') {
      const day = start.getDay() || 7
      start.setDate(start.getDate() - (day - 1))
      start.setHours(5, 0, 0, 0)
      end = new Date(start)
      end.setDate(end.getDate() + 7)
      titleText = '🏠 全店總計 (本周)'
    } else if (range === 'month') {
      start.setDate(1)
      start.setHours(5, 0, 0, 0)
      end = new Date(start)
      end.setMonth(end.getMonth() + 1)
      titleText = '🏠 全店總計 (本月)'
    } else if (range === 'custom') {
      const startInput = findElement<HTMLInputElement>('financeStartDate')
      const endInput = findElement<HTMLInputElement>('financeEndDate')
      if (startInput && !startInput.value) {
        const date = new Date()
        date.setDate(1)
        startInput.value = toLocalIsoDate(date)
      }
      if (endInput && !endInput.value) {
        const date = new Date()
        date.setMonth(date.getMonth() + 1)
        date.setDate(0)
        endInput.value = toLocalIsoDate(date)
      }

      const [sy, sm, sd] = (startInput?.value || toLocalIsoDate(start)).split('-').map(Number)
      const [ey, em, ed] = (endInput?.value || toLocalIsoDate(end)).split('-').map(Number)
      start = new Date(sy, sm - 1, sd, 5, 0, 0, 0)
      end = new Date(ey, em - 1, ed, 5, 0, 0, 0)
      end.setDate(end.getDate() + 1)
      titleText = `🏠 全店總計 (${(startInput?.value || '').replace(/-/g, '/')}~${(endInput?.value || '').replace(/-/g, '/')})`
    } else if (range === 'specific') {
      const dateStr = findElement('finBtnSpecific')?.dataset.date || ''
      if (dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number)
        start = new Date(year, month - 1, day, 5, 0, 0, 0)
        end = new Date(start)
        end.setDate(end.getDate() + 1)
      } else {
        start.setHours(5, 0, 0, 0)
        end = new Date(start)
        end.setDate(end.getDate() + 1)
      }
      titleText = `🏠 全店總計 (${dateStr || '自選日'})`
    }

    return { start, end, titleText }
  }

  function updateFinanceStats(range: PosReportRange | string, _targetDate: Date | null = null) {
    setActiveFinanceRange(range)
    const { start, end, titleText } = resolveFinanceRange(range)
    const bizStart = deps.getBusinessDate(start)
    const bizEnd = deps.getBusinessDate(end)

    const stats = buildFinanceStats()
    revenueDetails = buildRevenueDetails()

    deps.getHistoryOrders().forEach((order) => {
      const date = deps.getDateFromOrder(order)
      const biz = deps.getBusinessDate(date)
      if (biz < bizStart || biz >= bizEnd) {
        return
      }

      const total = order.total || 0
      let barSum = 0
      let bbqSum = 0
      let unknownSum = 0

      order.items.forEach((item) => {
        const name = normalizeItemName(item.name)
        const type = item.type || deps.getItemCategoryType(name)
        const itemPrice = toNumberValue(item.price)
        const cost = deps.getCostByItemName(item.name, item.variant)
        const detail: PosRevenueDetailItem = {
          name,
          price: itemPrice,
          cost,
          time: order.time || date.toLocaleString('zh-TW', { hour12: false }),
          seq: order.formattedSeq || order.seq || '',
        }

        if (type === 'bar') {
          barSum += itemPrice
          stats.barCost += cost
          revenueDetails.bar.push(detail)
        } else if (type === 'bbq') {
          bbqSum += itemPrice
          stats.bbqCost += cost
          revenueDetails.bbq.push(detail)
        } else {
          unknownSum += itemPrice
          stats.unknownCost += cost
          revenueDetails.unknown.push(detail)
        }
      })

      const adjustment = total - (barSum + bbqSum + unknownSum)
      stats.barRev += barSum
      stats.bbqRev += bbqSum
      stats.unknownRev += unknownSum
      stats.extraRev += adjustment
      stats.totalRev += total

      if (adjustment !== 0) {
        revenueDetails.extra.push({
          amount: adjustment,
          seat: order.seat || '',
          time: order.time || date.toLocaleString('zh-TW', { hour12: false }),
          seq: order.formattedSeq || order.seq || '',
        })
      }
    })

    setFinanceSummary(stats, titleText)
  }

  function openRevenueModal(type: string) {
    const bucket = (['bar', 'bbq', 'unknown', 'extra'].includes(type) ? type : 'bar') as PosRevenueBucket
    const map: Record<PosRevenueBucket, string> = {
      bar: '🍺 酒吧明細',
      bbq: '🍖 燒烤明細',
      unknown: '❔ 未分類明細',
      extra: '🎫 整單調整來源',
    }

    setText('revenueDetailTitle', map[bucket])
    const data = revenueDetails[bucket]
    if (data.length === 0) {
      setHtml('revenueDetailList', "<div class='empty-hint'>目前區間沒有此類品項</div>")
      getLegacyElement('revenueDetailModal').style.display = 'flex'
      return
    }

    const html =
      bucket === 'extra'
        ? data
            .map((item) => {
              const amount = item.amount || 0
              const amountText =
                amount >= 0
                  ? `<span class="detail-price">$${Math.round(amount)}</span>`
                  : `<span class="detail-price" style="color:#ef476f;">-$${Math.abs(Math.round(amount))}</span>`
              const seatText = item.seat ? `<span class="detail-name">${item.seat}</span>` : ''
              const seqText = item.seq ? `<span class="detail-price">#${item.seq}</span>` : ''
              return `<div class="detail-item-row">${seqText}${seatText}<div class="detail-info">${amountText}<span class="detail-time">${item.time || '--:--'}</span></div></div>`
            })
            .join('')
        : data
            .map((item) => {
              const costText =
                typeof item.cost === 'number' && item.cost > 0
                  ? `<span class="detail-price" style="color:#ef476f;">成本 $${item.cost}</span>`
                  : ''
              return `<div class="detail-item-row"><span class="detail-price">#${item.seq}</span><div class="detail-name">${item.name}</div><div class="detail-info"><span class="detail-price">$${item.price}</span>${costText}<span class="detail-time">${item.time || '--:--'}</span></div></div>`
            })
            .join('')

    setHtml('revenueDetailList', html)
    getLegacyElement('revenueDetailModal').style.display = 'flex'
  }

  function closeRevenueModal() {
    getLegacyElement('revenueDetailModal').style.display = 'none'
  }

  function showOwnerDetailedOrders(year: number, month: number, day: number) {
    const targetDate = new Date(year, month, day)
    setDisplay('ownerOrderListSection', 'block')

    const targetOrders = [...deps.getOrdersByDate(targetDate)].reverse()
    if (targetOrders.length === 0) {
      setHtml('ownerOrderList', "<div style='padding:20px; text-align:center;'>無資料</div>")
      return
    }

    const title = `📅 ${year}/${month + 1}/${day} 詳細訂單`
    const rows = targetOrders
      .map((order) => {
        const seqDisplay = order.formattedSeq ? `#${order.formattedSeq}` : '#?'
        const timeOnly = order.time.split(' ')[1] || order.time
        const summary = order.items
          .map((item) => {
            let name = item.name
            if ((item.count ?? 1) > 1) name += ` x${item.count}`
            if (item.isTreat && !name.includes('(招待)')) name += ' (招待)'
            return name
          })
          .join('、')

        return `
            <div class="history-row" style="grid-template-columns: 0.5fr 0.8fr 2fr 0.8fr 0.8fr auto !important; font-size:14px; cursor:default;">
                <span class="seq" style="font-weight:bold; color:#4361ee;">${seqDisplay}</span>
                <span class="seat">${order.seat || ''}</span>
                <span class="cust" style="color:#64748b; font-size:13px;">${summary}</span>
                <span class="time">${timeOnly}</span>
                <span class="amt" style="font-weight:bold; color:#ef476f;">$${order.total}</span>
                <button data-action="archived-order-readonly" class="btn-effect" style="padding:5px 10px; font-size:12px; background:#94a3b8; color:white; border-radius:5px;">已歸檔</button>
            </div>`
      })
      .join('')

    setHtml('ownerOrderList', `<div class="title" style="font-size:20px;">${title}</div>${rows}`)
    findElement('ownerOrderListSection')?.scrollIntoView({ behavior: 'smooth' })
  }

  function openChangePasswordModal(ownerName: string) {
    setText('pwdOwnerName', ownerName)
    requireInput('oldPwd').value = ''
    requireInput('newPwd').value = ''
    requireInput('confirmPwd').value = ''
    getLegacyElement('changePasswordModal').style.display = 'flex'
  }

  function closeChangePasswordModal() {
    getLegacyElement('changePasswordModal').style.display = 'none'
  }

  async function confirmChangePassword() {
    const ownerName = findElement('pwdOwnerName')?.innerText
    const oldPwd = requireInput('oldPwd').value
    const newPwd = requireInput('newPwd').value
    const confirmPwd = requireInput('confirmPwd').value
    const ownerPasswords = deps.getOwnerPasswords()

    if (!ownerName || ownerPasswords[ownerName] === undefined) {
      alert('找不到該帳號')
      return
    }
    if (oldPwd !== ownerPasswords[ownerName]) {
      alert('舊密碼錯誤')
      return
    }
    if (!newPwd) {
      alert('請輸入新密碼')
      return
    }
    if (newPwd !== confirmPwd) {
      alert('兩次新密碼不一致')
      return
    }

    ownerPasswords[ownerName] = newPwd
    await deps.saveAllToCloud({ [`ownerPasswords/${ownerName}`]: newPwd })
    alert('✅ 密碼已更新')
    closeChangePasswordModal()
  }

  return {
    changeOwnerMonth,
    checkOwner,
    closeChangePasswordModal,
    closeFinanceDetailModal,
    closeOwnerModal,
    closeRevenueModal,
    confirmChangePassword,
    openChangePasswordModal,
    openConfidentialPage,
    openFinanceDetailModal,
    openOwnerLogin,
    openRevenueModal,
    renderConfidentialCalendar,
    showOwnerDetailedOrders,
    updateFinancialPage,
    updateFinanceStats,
  }
}
