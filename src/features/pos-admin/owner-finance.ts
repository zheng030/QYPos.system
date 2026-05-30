import type { V3DailySummary, V3DailySummaryRangeEvent } from '@/features/pos-data/rtdb-v3-types'
import type {
  PosCategoryKey,
  PosFinanceStats,
  PosItemCostsMap,
  PosItemPricesMap,
  PosMenuData,
  PosMenuItem,
  PosOrder,
  PosOwnerAuthMap,
  PosOwnerAuthRecord,
  PosOwnerMode,
  PosOwnerName,
  PosReportRange,
  PosRevenueBucket,
  PosRevenueDetailItem,
  PosRevenueDetails,
} from '@/features/pos-kernel/types'
import { MENU_CATEGORY_KEYS, POS_CATEGORY_LABELS } from '@/features/pos-kernel/types'
import type { AuthGate } from '@/shared/auth-gate'
import { findElement, requireElement, requireInput } from '@/shared/dom-helpers'
import { toNumberValue } from '@/shared/errors'
import { getGroupedOrderLines } from '@/shared/grouped-order-lines'
import { getLegacyElement } from '@/shared/legacy-dom'
import { pbkdf2Hash, randomSaltBase64 } from '@/shared/password'

type OwnerFinanceDeps = {
  ensureSubscriptions: () => Promise<void>
  authGate: AuthGate
  getBusinessDate: (date: Date | string | number) => number
  getDateFromOrder: (order: PosOrder) => Date
  getItemCategoryType: (name: string) => PosCategoryKey
  getItemCosts: () => PosItemCostsMap
  getItemPrices: () => PosItemPricesMap
  listClosedOrdersByDay: (targetDate: Date) => Promise<PosOrder[]>
  listClosedOrdersByRange: (start: Date, endExclusive: Date) => Promise<PosOrder[]>
  loadDailySummariesRange: (start: Date, endExclusive: Date) => Promise<Record<string, V3DailySummary>>
  watchDailySummariesRange: (
    start: Date,
    endExclusive: Date,
    listener: (event: V3DailySummaryRangeEvent) => void
  ) => () => void
  readDailySummariesRange: (start: Date, endExclusive: Date) => Record<string, V3DailySummary>
  getOwnerPasswords: () => PosOwnerAuthMap
  hideAll: () => void
  menuData: PosMenuData
  saveOwnerPassword: (ownerName: string, record: PosOwnerAuthRecord) => Promise<void>
  updateItemData: (name: string, type: string, value: string) => Promise<void>
}

type DailyFinanceEntry = {
  totalRevenue: number
  totalCost: number
  byCategory: Record<PosCategoryKey, { revenue: number; cost: number }>
  orderCount: number
}

const REPORT_CATEGORY_KEYS: PosCategoryKey[] = [...MENU_CATEGORY_KEYS, 'other', 'extra']

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

function formatCurrency(value: number) {
  const rounded = Math.round(value)
  return rounded >= 0 ? `$${rounded}` : `-$${Math.abs(rounded)}`
}

function toLocalIsoDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().split('T')[0]
}

function normalizeItemName(name: string) {
  return name.replace(/\s*\(招待\)$/, '').trim()
}

function getMenuItems(categoryData: PosMenuData[string]) {
  if (!categoryData) return []
  return categoryData.sections.flatMap((section) => section.items)
}

function getReportCategoryKey(categoryKey: PosCategoryKey | string | undefined): PosCategoryKey {
  return REPORT_CATEGORY_KEYS.includes(categoryKey as PosCategoryKey) ? (categoryKey as PosCategoryKey) : 'other'
}

function renderFinanceCategoryCards(stats: PosFinanceStats) {
  const container = findElement('financeCategoryCards')
  if (!container) return

  container.innerHTML = REPORT_CATEGORY_KEYS.map((categoryKey) => {
    const categoryStats = stats.byCategory[categoryKey]
    return `
      <div class="summary-card finance-category-card" data-category="${categoryKey}">
        <h3>${POS_CATEGORY_LABELS[categoryKey]}</h3>
        <div class="sum-row"><span>營收</span><span>${formatCurrency(categoryStats.revenue)}</span></div>
        <div class="sum-row"><span>成本</span><span>${formatCurrency(-categoryStats.cost)}</span></div>
        <hr>
        <div class="sum-row grand-total"><span>淨利</span><span>${formatCurrency(categoryStats.revenue - categoryStats.cost)}</span></div>
        <button class="btn-effect detail-btn" data-action="open-revenue-modal" data-type="${categoryKey}">查看明細</button>
      </div>
    `
  }).join('')
}

function buildFinanceStats(): PosFinanceStats {
  return {
    totalRevenue: 0,
    totalCost: 0,
    byCategory: Object.fromEntries(
      REPORT_CATEGORY_KEYS.map((key) => [key, { revenue: 0, cost: 0 }])
    ) as PosFinanceStats['byCategory'],
  }
}

function buildRevenueDetails(): PosRevenueDetails {
  const details = {} as PosRevenueDetails
  REPORT_CATEGORY_KEYS.forEach((key) => {
    details[key] = []
  })
  details.total = []
  return details
}

function setFinanceSummary(stats: PosFinanceStats, titleText: string) {
  setText('financeTitle', titleText)
  setText('monthTotalRev', formatCurrency(stats.totalRevenue))
  setText('monthTotalCost', formatCurrency(-stats.totalCost))
  setText('monthNetProfit', formatCurrency(stats.totalRevenue - stats.totalCost))
  renderFinanceCategoryCards(stats)
}

function buildSummaryFromDailyRange(range: Record<string, V3DailySummary>) {
  const stats = buildFinanceStats()
  Object.values(range).forEach((summary) => {
    stats.totalRevenue += summary.paidTotal || 0
    REPORT_CATEGORY_KEYS.forEach((key) => {
      const revenue = Number(summary.categoryRevenue?.[key] || 0)
      const cost = Number(summary.categoryCost?.[key] || 0)
      stats.byCategory[key].revenue += revenue
      stats.byCategory[key].cost += cost
      stats.totalCost += cost
    })
  })
  return stats
}

function buildDailyFinanceEntry(summary: V3DailySummary): DailyFinanceEntry {
  return {
    totalRevenue: summary.paidTotal || 0,
    totalCost: REPORT_CATEGORY_KEYS.reduce((sum, key) => sum + Number(summary.categoryCost?.[key] || 0), 0),
    byCategory: Object.fromEntries(
      REPORT_CATEGORY_KEYS.map((key) => [
        key,
        {
          revenue: Number(summary.categoryRevenue?.[key] || 0),
          cost: Number(summary.categoryCost?.[key] || 0),
        },
      ])
    ) as DailyFinanceEntry['byCategory'],
    orderCount: summary.orderCount || 0,
  }
}

function parseLocalDateInput(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (![year, month, day].every(Number.isFinite)) {
    return null
  }
  return new Date(year, month - 1, day)
}

async function createOwnerPasswordRecord(password: string): Promise<PosOwnerAuthRecord> {
  const passwordSalt = randomSaltBase64(16)
  const passwordHash = await pbkdf2Hash(password, passwordSalt)
  return {
    passwordHash,
    passwordSalt,
    updatedAt: Date.now(),
  }
}

export function createOwnerFinanceModule(deps: OwnerFinanceDeps) {
  let dailyFinancialData: Record<string, DailyFinanceEntry> = {}
  let revenueDetails: PosRevenueDetails = buildRevenueDetails()
  let activeFinanceRange: { start: Date; end: Date; titleText: string } | null = null
  let stopFinanceSummaryWatch: (() => void) | null = null
  let stopFinanceCalendarWatch: (() => void) | null = null
  let historyViewDate = new Date()

  if (historyViewDate.getHours() < 5) {
    historyViewDate.setDate(historyViewDate.getDate() - 1)
  }

  function resetFinanceWatch() {
    stopFinanceSummaryWatch?.()
    stopFinanceSummaryWatch = null
  }

  function resetFinanceCalendarWatch() {
    stopFinanceCalendarWatch?.()
    stopFinanceCalendarWatch = null
  }

  function stopAllWatches() {
    resetFinanceWatch()
    resetFinanceCalendarWatch()
  }

  function setFinanceRangeControls(range: PosReportRange | string) {
    document.querySelectorAll('.finance-controls button').forEach((button) => {
      button.classList.remove('active')
    })

    const buttonIdMap: Record<string, string> = {
      day: 'finBtnDay',
      week: 'finBtnWeek',
      month: 'finBtnMonth',
      custom: 'finBtnCustom',
      specific: 'finBtnSpecific',
    }

    const buttonId = buttonIdMap[range]
    if (buttonId) {
      findElement(buttonId)?.classList.add('active')
    }

    setDisplay('customFinanceDateRange', range === 'custom' ? 'flex' : 'none')
  }

  function openOwnerLogin(mode: PosOwnerMode | string) {
    sessionStorage.setItem('ownerMode', mode)
    setDisplay('ownerLoginModal', 'flex')
  }

  function closeOwnerModal() {
    getLegacyElement('ownerLoginModal').style.display = 'none'
  }

  async function checkOwner(name: string) {
    const password = prompt(`請輸入 ${name} 的密碼：`)
    const ownerName = name as PosOwnerName
    const isValid = await deps.authGate.verifyOwnerLogin(ownerName, password ?? '', deps.getOwnerPasswords())
    if (isValid) {
      closeOwnerModal()
      void openConfidentialPage(ownerName)
      return
    }
    alert('❌ 密碼錯誤！')
  }

  async function openConfidentialPage(ownerName: PosOwnerName) {
    deps.hideAll()
    setDisplay('confidentialPage', 'block')
    setText('ownerWelcome', ownerName)
    await deps.ensureSubscriptions()
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
    const now = new Date()
    if (now.getHours() < 5) now.setDate(now.getDate() - 1)
    historyViewDate = new Date(now)
    await renderConfidentialCalendar(ownerName)
  }

  function buildCostRow(item: PosMenuItem, price: number, cost: number) {
    return `
      <tr>
        <td style="font-weight: 500; color: #343a40;">${item.name}</td>
        <td>
          <input type="number" class="cost-input" value="${price}" data-action="update-item-data" data-name="${item.id}" data-type="price">
        </td>
        <td>
          <input type="number" class="cost-input" value="${cost}" data-action="update-item-data" data-name="${item.id}" data-type="cost" style="color: #e03131; font-weight:bold;">
        </td>
      </tr>
    `
  }

  function updateFinancialPage(_ownerName: PosOwnerName | string) {
    const listContainer = requireElement('costEditorList')
    const itemPrices = deps.getItemPrices()
    const itemCosts = deps.getItemCosts()
    listContainer.innerHTML = ''

    MENU_CATEGORY_KEYS.forEach((categoryKey) => {
      const categoryData = deps.menuData[categoryKey]
      if (!categoryData) return
      const items = getMenuItems(categoryData)
      const title = POS_CATEGORY_LABELS[categoryKey]
      const rows = items
        .map((item) =>
          buildCostRow(
            item,
            toNumberValue(itemPrices[item.id] ?? item.basePrice),
            toNumberValue(itemCosts[item.id] ?? 0)
          )
        )
        .join('')
      listContainer.innerHTML += `
        <div class="cat-badge">${title}</div>
        <div class="cost-table-container">
          <table class="cost-table">
            <thead>
              <tr>
                <th style="width: 40%;">品項名稱</th>
                <th style="width: 30%;">售價</th>
                <th style="width: 30%;">成本</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `
    })
  }

  function renderConfidentialCalendarGrid(_ownerName: PosOwnerName | string, year: number, month: number) {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const grid = requireElement('finCalendarGrid')
    const selectedDateKey = Array.from(grid.querySelectorAll<HTMLElement>('.calendar-day.active'))
      .map((cell) => cell.dataset.dateKey || '')
      .find(Boolean)

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
      const dateStr = `${year}/${month + 1}/${day}`
      if (selectedDateKey && selectedDateKey === dateStr) {
        cell.classList.add('active')
      } else if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
        cell.classList.add('active')
      }

      const stats = dailyFinancialData[dateStr]
      const showRev = stats ? stats.totalRevenue : 0

      let htmlContent = `<div class="day-num">${day}</div>`
      if (showRev > 0) {
        htmlContent += `<div style="font-size:12px; color:#4361ee; font-weight:bold;">$${Math.round(showRev)}</div>`
        if ((stats?.orderCount || 0) > 0) {
          htmlContent += `<div style="font-size:10px; color:#8d99ae;">(${stats?.orderCount}單)</div>`
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

  async function changeOwnerMonth(offset: number) {
    const nextDate = new Date(historyViewDate)
    nextDate.setMonth(nextDate.getMonth() + offset)
    historyViewDate = nextDate
    const owner = findElement('ownerWelcome')?.innerText as PosOwnerName | undefined
    if (!owner) return
    await renderConfidentialCalendar(owner)
    setDisplay('ownerOrderListSection', 'none')
    const specificBtn = findElement('finBtnSpecific')
    if (specificBtn) {
      specificBtn.style.display = 'none'
      specificBtn.dataset.date = ''
    }
  }

  async function renderConfidentialCalendar(ownerName: PosOwnerName | string) {
    document.querySelectorAll('.finance-controls button').forEach((button) => {
      button.classList.remove('active')
    })
    findElement('finBtnMonth')?.classList.add('active')
    setText('financeTitle', '🏠 全店總計 (該月)')

    const year = historyViewDate.getFullYear()
    const month = historyViewDate.getMonth()
    setText('finCalendarTitle', `${year}年 ${month + 1}月`)

    const start = new Date(year, month, 1, 5, 0, 0, 0)
    const end = new Date(year, month + 1, 1, 5, 0, 0, 0)
    activeFinanceRange = { start, end, titleText: '🏠 全店總計 (本月)' }
    resetFinanceWatch()
    await deps.loadDailySummariesRange(start, end)

    const render = () => {
      const range = deps.readDailySummariesRange(start, end)
      dailyFinancialData = Object.fromEntries(
        Object.entries(range).map(([bizDateKey, summary]) => {
          const [yearStr, monthStr, dayStr] = bizDateKey.split('-')
          return [`${Number(yearStr)}/${Number(monthStr)}/${Number(dayStr)}`, buildDailyFinanceEntry(summary)]
        })
      )
      setFinanceSummary(buildSummaryFromDailyRange(range), '🏠 全店總計 (本月)')
      renderConfidentialCalendarGrid(ownerName, year, month)
    }

    render()
    stopFinanceCalendarWatch = deps.watchDailySummariesRange(start, end, () => {
      render()
    })
  }

  function resolveFinanceRange(range: PosReportRange | string, targetDate?: Date | null) {
    const now = targetDate ? new Date(targetDate) : new Date()
    if (now.getHours() < 5) now.setDate(now.getDate() - 1)

    let start = new Date(now)
    let end = new Date(now)
    let titleText = '🏠 全店總計'

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
      titleText = '🏠 全店總計 (本週)'
    } else if (range === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 5, 0, 0, 0)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 5, 0, 0, 0)
      titleText = '🏠 全店總計 (本月)'
    } else if (range === 'custom') {
      const startInput = findElement<HTMLInputElement>('financeStartDate')
      const endInput = findElement<HTMLInputElement>('financeEndDate')
      if (startInput && !startInput.value) {
        startInput.value = toLocalIsoDate(new Date(now.getFullYear(), now.getMonth(), 1))
      }
      if (endInput && !endInput.value) {
        endInput.value = toLocalIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
      }
      const [sy, sm, sd] = (startInput?.value || toLocalIsoDate(now)).split('-').map(Number)
      const [ey, em, ed] = (endInput?.value || toLocalIsoDate(now)).split('-').map(Number)
      start = new Date(sy, sm - 1, sd, 5, 0, 0, 0)
      end = new Date(ey, em - 1, ed + 1, 5, 0, 0, 0)
      titleText = `🏠 全店總計 (${startInput?.value || ''} ~ ${endInput?.value || ''})`
    } else if (range === 'specific') {
      const specificValue = findElement<HTMLElement>('finBtnSpecific')?.dataset.date || ''
      const specificDate = targetDate || (specificValue ? parseLocalDateInput(specificValue) : null) || now
      start = new Date(specificDate)
      start.setHours(5, 0, 0, 0)
      end = new Date(start)
      end.setDate(end.getDate() + 1)
      titleText = `🏠 全店總計 (${toLocalIsoDate(start)})`
    }

    return { start, end, titleText }
  }

  async function loadRevenueDetailsForRange(start: Date, end: Date) {
    const orders = await deps.listClosedOrdersByRange(start, end)
    const nextDetails = buildRevenueDetails()

    orders.forEach((order) => {
      const lines = order.lines || []
      let categorizedRevenue = 0

      lines.forEach((line) => {
        const name = normalizeItemName(line.displayName || (line as { itemName?: string }).itemName || line.shortName)
        const categoryKey = getReportCategoryKey(line.categoryKey || deps.getItemCategoryType(name))
        const qty = Math.max(1, toNumberValue(line.quantity ?? 1))
        const revenue = toNumberValue(line.lineTotal)
        const cost = toNumberValue((line as { unitCost?: number }).unitCost ?? 0) * qty
        const detail: PosRevenueDetailItem = {
          name,
          categoryLabel: POS_CATEGORY_LABELS[categoryKey],
          price: revenue,
          cost,
          qty,
          time: order.time,
          seq: order.formattedSeq || order.seq || '',
          seat: order.seat || order.table || '',
        }

        nextDetails[categoryKey].push(detail)
        nextDetails.total.push(detail)
        categorizedRevenue += revenue
      })

      const extra = (order.total || 0) - categorizedRevenue
      if (extra !== 0) {
        const extraDetail: PosRevenueDetailItem = {
          amount: extra,
          categoryLabel: POS_CATEGORY_LABELS.extra,
          seq: order.formattedSeq || order.seq || '',
          seat: order.seat || order.table || '',
          time: order.time,
        }
        nextDetails.extra.push(extraDetail)
        nextDetails.total.push(extraDetail)
      }
    })

    revenueDetails = nextDetails
  }

  async function updateFinanceStats(range: PosReportRange | string, targetDate: Date | null = null) {
    setFinanceRangeControls(range)
    const nextRange = resolveFinanceRange(range, targetDate)
    activeFinanceRange = nextRange
    resetFinanceWatch()
    await deps.loadDailySummariesRange(nextRange.start, nextRange.end)
    const render = () => {
      const stats = buildSummaryFromDailyRange(deps.readDailySummariesRange(nextRange.start, nextRange.end))
      setFinanceSummary(stats, nextRange.titleText)
    }
    render()
    stopFinanceSummaryWatch = deps.watchDailySummariesRange(nextRange.start, nextRange.end, () => {
      render()
    })
  }

  async function openRevenueModal(type: string) {
    const bucket = ([...REPORT_CATEGORY_KEYS, 'total'] as string[]).includes(type)
      ? (type as PosRevenueBucket)
      : 'total'
    const titleMap: Record<PosRevenueBucket, string> = {
      pasta_risotto: POS_CATEGORY_LABELS.pasta_risotto,
      bread_set: POS_CATEGORY_LABELS.bread_set,
      salad: POS_CATEGORY_LABELS.salad,
      plated_main: POS_CATEGORY_LABELS.plated_main,
      a_la_carte: POS_CATEGORY_LABELS.a_la_carte,
      soup: POS_CATEGORY_LABELS.soup,
      drink: POS_CATEGORY_LABELS.drink,
      other: POS_CATEGORY_LABELS.other,
      extra: POS_CATEGORY_LABELS.extra,
      total: '全部分類',
    }
    setText('revenueDetailTitle', titleMap[bucket])
    if (activeFinanceRange) {
      await loadRevenueDetailsForRange(activeFinanceRange.start, activeFinanceRange.end)
    }
    const data = revenueDetails[bucket] || []
    if (data.length === 0) {
      setHtml('revenueDetailList', "<div class='empty-hint'>目前區間沒有資料</div>")
      getLegacyElement('revenueDetailModal').style.display = 'flex'
      return
    }
    const html = data
      .map((item) => {
        if (bucket === 'extra' || typeof item.amount === 'number') {
          return `<div class="detail-item-row"><span class="detail-price">#${item.seq || ''}</span><div class="detail-name">${item.categoryLabel || POS_CATEGORY_LABELS.extra}</div><div class="detail-info"><span class="detail-price">${formatCurrency(item.amount || 0)}</span><span class="detail-time">${item.time || ''}</span></div></div>`
        }
        const qtyText = item.qty && item.qty > 1 ? ` x${item.qty}` : ''
        const costText =
          typeof item.cost === 'number'
            ? `<span class="detail-price" style="color:#ef476f;">成本 ${formatCurrency(item.cost)}</span>`
            : ''
        return `<div class="detail-item-row"><span class="detail-price">#${item.seq || ''}</span><div class="detail-name">${item.name || ''}${qtyText}</div><div class="detail-info"><span class="detail-price">${formatCurrency(item.price || 0)}</span>${costText}<span class="detail-time">${item.time || ''}</span></div></div>`
      })
      .join('')
    setHtml('revenueDetailList', html)
    getLegacyElement('revenueDetailModal').style.display = 'flex'
  }

  function closeRevenueModal() {
    getLegacyElement('revenueDetailModal').style.display = 'none'
  }

  async function showOwnerDetailedOrders(year: number, month: number, day: number) {
    const targetDate = new Date(year, month, day)
    const targetOrders = [...(await deps.listClosedOrdersByDay(targetDate))].reverse()
    setDisplay('ownerOrderListSection', 'block')
    setText('ownerSelectedDateTitle', `📅 ${year}/${month + 1}/${day} 詳細訂單`)
    if (targetOrders.length === 0) {
      setHtml('ownerOrderBox', "<div style='padding:20px; text-align:center;'>無資料</div>")
      return
    }
    const rows = targetOrders
      .map((order) => {
        const summary = getGroupedOrderLines(order)
          .map(({ main }) => `${main.shortName}${main.quantity > 1 ? ` x${main.quantity}` : ''}`)
          .join('、')
        return `
          <div class="history-row" style="grid-template-columns: 0.5fr 0.8fr 2fr 0.8fr 0.8fr auto !important; font-size:14px; cursor:default;">
            <span class="seq" style="font-weight:bold; color:#4361ee;">#${order.formattedSeq || order.seq || '?'}</span>
            <span class="seat">${order.seat || order.table || ''}</span>
            <span class="cust" style="color:#64748b; font-size:13px;">${summary}</span>
            <span class="time">${order.time.split(' ')[1] || order.time}</span>
            <span class="amt" style="font-weight:bold; color:#ef476f;">${formatCurrency(order.total || 0)}</span>
            <button data-action="archived-order-readonly" class="btn-effect" style="padding:5px 10px; font-size:12px; background:#94a3b8; color:white; border-radius:5px;">已歸檔</button>
          </div>
        `
      })
      .join('')
    setHtml('ownerOrderBox', rows)
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
    const isValid = await deps.authGate.verifyOwnerPasswordChange(ownerName as PosOwnerName, oldPwd, ownerPasswords)
    if (!isValid) {
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

    const nextRecord = await createOwnerPasswordRecord(newPwd)
    ownerPasswords[ownerName] = nextRecord
    await deps.saveOwnerPassword(ownerName, nextRecord)
    alert('✅ 密碼已更新')
    closeChangePasswordModal()
  }

  return {
    changeOwnerMonth,
    checkOwner,
    closeChangePasswordModal,
    closeOwnerModal,
    closeRevenueModal,
    confirmChangePassword,
    openChangePasswordModal,
    openConfidentialPage,
    openOwnerLogin,
    openRevenueModal,
    renderConfidentialCalendar,
    showOwnerDetailedOrders,
    stopAllWatches,
    updateFinancialPage,
    updateFinanceStats,
  }
}
