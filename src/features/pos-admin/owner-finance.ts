import { reactive, shallowRef } from 'vue'

import type { V3DailySummary } from '@/features/pos-data/rtdb-v3-types'
import type { PosDataService } from '@/features/pos-data/service'
import type { PosKernelService } from '@/features/pos-kernel/service'
import type {
  PosCategoryKey,
  PosFinanceMode,
  PosFinanceStats,
  PosOrder,
  PosReportRange,
  PosRevenueBucket,
  PosRevenueDetailItem,
  PosRevenueDetails,
} from '@/features/pos-kernel/types'
import { MENU_CATEGORY_KEYS, POS_CATEGORY_LABELS } from '@/features/pos-kernel/types'
import {
  getBusinessDateKey,
  getBusinessDateKeyFromParts,
  getBusinessDayRange,
  getBusinessDayRangeFromKey,
  getBusinessMonthRange,
  getBusinessWeekRange,
  parseBusinessDateKey,
  toBusinessDate,
} from '@/shared/business-day'
import { toNumberValue } from '@/shared/errors'
import { getGroupedOrderLines, getGroupedOrderSummary } from '@/shared/grouped-order-lines'

type OwnerFinanceDeps = {
  kernel: PosKernelService
  data: PosDataService
}

type DailyFinanceEntry = {
  totalRevenue: number
  orderCount: number
}

export type FinanceRange = Exclude<PosReportRange, never>

export type CostEditorRow = { id: string; name: string; price: number; cost: number }
export type CostEditorCategory = { key: string; title: string; rows: CostEditorRow[] }

export type FinanceCalendarCell = {
  day: number
  bizDateKey: string
  active: boolean
  revenue: number
  orderCount: number
} | null

export type FinanceCategoryCard = { key: PosCategoryKey; title: string; revenue: string; cost: string; net: string }

export type FinanceOrderRow = { seq: string; seat: string; summary: string; time: string; amount: string }

export const REPORT_CATEGORY_KEYS: PosCategoryKey[] = [...MENU_CATEGORY_KEYS, 'other', 'extra']

const REVENUE_TITLES: Record<PosRevenueBucket, string> = {
  ...POS_CATEGORY_LABELS,
  total: '全部分類',
}

export function formatSignedCurrency(value: number) {
  const rounded = Math.round(value)
  return rounded >= 0 ? `$${rounded}` : `-$${Math.abs(rounded)}`
}

function toLocalIsoDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().split('T')[0]
}

function formatBusinessDateLabel(bizDateKey: string) {
  const [year, month, day] = parseBusinessDateKey(bizDateKey).split('-').map(Number)
  return `${year}/${month}/${day}`
}

function normalizeItemName(name: string) {
  return name.replace(/\s*\(招待\)$/, '').trim()
}

function getReportCategoryKey(categoryKey: PosCategoryKey | string | undefined): PosCategoryKey {
  return REPORT_CATEGORY_KEYS.includes(categoryKey as PosCategoryKey) ? (categoryKey as PosCategoryKey) : 'other'
}

function parseBusinessDateInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  try {
    return parseBusinessDateKey(trimmed)
  } catch {
    return null
  }
}

function buildEmptyStats(): PosFinanceStats {
  return {
    totalRevenue: 0,
    totalCost: 0,
    byCategory: Object.fromEntries(
      REPORT_CATEGORY_KEYS.map((key) => [key, { revenue: 0, cost: 0 }])
    ) as PosFinanceStats['byCategory'],
  }
}

function buildEmptyRevenueDetails(): PosRevenueDetails {
  return Object.fromEntries(
    [...REPORT_CATEGORY_KEYS, 'total'].map((key) => [key, [] as PosRevenueDetailItem[]])
  ) as PosRevenueDetails
}

function summarizeDailyRange(range: Record<string, V3DailySummary>) {
  const stats = buildEmptyStats()
  for (const summary of Object.values(range)) {
    stats.totalRevenue += summary.paidTotal || 0
    for (const key of REPORT_CATEGORY_KEYS) {
      const revenue = Number(summary.categoryRevenue?.[key] || 0)
      const cost = Number(summary.categoryCost?.[key] || 0)
      stats.byCategory[key].revenue += revenue
      stats.byCategory[key].cost += cost
      stats.totalCost += cost
    }
  }
  return stats
}

export function buildRevenueDetails(
  orders: PosOrder[],
  getItemCategoryType: (name: string) => PosCategoryKey
): PosRevenueDetails {
  const details = buildEmptyRevenueDetails()
  for (const order of orders) {
    let categorizedRevenue = 0
    const seq = order.formattedSeq || order.seq || ''
    const seat = order.seat || order.table || ''
    for (const line of order.lines || []) {
      const name = normalizeItemName(line.displayName || (line as { itemName?: string }).itemName || line.shortName)
      const categoryKey = getReportCategoryKey(line.categoryKey || getItemCategoryType(name))
      const qty = Math.max(1, toNumberValue(line.quantity ?? 1))
      const revenue = toNumberValue(line.lineTotal)
      const detail: PosRevenueDetailItem = {
        name,
        categoryLabel: POS_CATEGORY_LABELS[categoryKey],
        price: revenue,
        cost: toNumberValue(line.unitCost ?? 0) * qty,
        qty,
        time: order.time,
        seq,
        seat,
      }
      details[categoryKey].push(detail)
      details.total.push(detail)
      categorizedRevenue += revenue
    }

    const extra = (order.total || 0) - categorizedRevenue
    if (extra !== 0) {
      const extraDetail: PosRevenueDetailItem = {
        amount: extra,
        categoryLabel: POS_CATEGORY_LABELS.extra,
        seq,
        seat,
        time: order.time,
      }
      details.extra.push(extraDetail)
      details.total.push(extraDetail)
    }
  }
  return details
}

export type OwnerFinance = ReturnType<typeof createOwnerFinance>

export function createOwnerFinance({ kernel, data }: OwnerFinanceDeps) {
  let dailyFinancialData: Record<string, DailyFinanceEntry> = {}
  let revenueDetails = buildEmptyRevenueDetails()
  let activeFinanceRange: { start: Date; end: Date } | null = null
  let activeDetailedOrdersKey: string | null = null
  let stopSummaryWatch: (() => void) | null = null
  let stopCalendarWatch: (() => void) | null = null
  let stopDetailedOrdersWatch: (() => void) | null = null
  let viewDate = toBusinessDate(new Date())

  // null until the page is opened once, so the sections keep their initial layout.
  const view = shallowRef<PosFinanceMode | null>(null)
  const title = shallowRef('財務 / 詳單')
  const costCategories = shallowRef<CostEditorCategory[]>([])
  const calendarTitle = shallowRef('')
  const calendarCells = shallowRef<FinanceCalendarCell[]>([])
  const summary = reactive({
    title: '全店總計',
    revenue: '$0',
    cost: '$0',
    net: '$0',
    categories: [] as FinanceCategoryCard[],
  })
  const activeRange = shallowRef<FinanceRange | null>('month')
  const customRangeVisible = shallowRef(false)
  const rangeDates = reactive({ start: '', end: '' })
  const specificDay = reactive({ visible: false, bizDateKey: '' })
  const orderList = reactive({
    visible: false,
    title: '',
    rows: null as FinanceOrderRow[] | null,
  })
  const revenueModal = reactive({
    open: false,
    title: '品項明細',
    bucket: 'total' as PosRevenueBucket,
    items: [] as PosRevenueDetailItem[],
  })

  function stopSummary() {
    stopSummaryWatch?.()
    stopSummaryWatch = null
  }

  function stopCalendar() {
    stopCalendarWatch?.()
    stopCalendarWatch = null
  }

  function stopDetailedOrders() {
    stopDetailedOrdersWatch?.()
    stopDetailedOrdersWatch = null
  }

  function stopAllWatches() {
    stopSummary()
    stopCalendar()
    stopDetailedOrders()
  }

  function setSummary(stats: PosFinanceStats, titleText: string) {
    summary.title = titleText
    summary.revenue = formatSignedCurrency(stats.totalRevenue)
    summary.cost = formatSignedCurrency(-stats.totalCost)
    summary.net = formatSignedCurrency(stats.totalRevenue - stats.totalCost)
    summary.categories = REPORT_CATEGORY_KEYS.map((key) => {
      const categoryStats = stats.byCategory[key]
      return {
        key,
        title: POS_CATEGORY_LABELS[key],
        revenue: formatSignedCurrency(categoryStats.revenue),
        cost: formatSignedCurrency(-categoryStats.cost),
        net: formatSignedCurrency(categoryStats.revenue - categoryStats.cost),
      }
    })
  }

  function setRangeControls(range: FinanceRange) {
    activeRange.value = range
    customRangeVisible.value = range === 'custom'
  }

  async function openFinancePage(mode: PosFinanceMode) {
    await data.ensureCatalog()
    view.value = mode
    activeDetailedOrdersKey = null
    if (mode === 'cost') {
      title.value = '成本輸入'
      stopAllWatches()
      renderCostEditor()
      return
    }
    title.value = '財務與詳細訂單'
    stopDetailedOrders()
    viewDate = toBusinessDate(new Date())
    await renderCalendar()
  }

  function renderCostEditor() {
    const prices = kernel.state.itemPrices
    const costs = kernel.state.itemCosts
    costCategories.value = MENU_CATEGORY_KEYS.flatMap((key) => {
      const category = kernel.menuData[key]
      if (!category) return []
      return [
        {
          key,
          title: POS_CATEGORY_LABELS[key],
          rows: category.sections
            .flatMap((section) => section.items)
            .map((item) => ({
              id: item.id,
              name: item.name,
              price: toNumberValue(prices[item.id] ?? item.basePrice),
              cost: toNumberValue(costs[item.id] ?? 0),
            })),
        },
      ]
    })
  }

  function updateItemData(itemId: string, type: 'price' | 'cost', value: string) {
    return data.updateItemData(itemId, type, value)
  }

  function renderCalendarGrid(year: number, month: number) {
    // Like the previous grid, the earliest highlighted day stays selected and today is always highlighted.
    const selectedKey = calendarCells.value.find((cell) => cell?.active)?.bizDateKey
    const today = toBusinessDate(new Date())
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    calendarCells.value = [
      ...Array.from({ length: firstDay }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1
        const bizDateKey = getBusinessDateKeyFromParts(year, month, day)
        const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
        const stats = dailyFinancialData[bizDateKey]
        return {
          day,
          bizDateKey,
          active: selectedKey === bizDateKey || isToday,
          revenue: stats ? stats.totalRevenue : 0,
          orderCount: stats?.orderCount || 0,
        }
      }),
    ]
  }

  async function renderCalendar() {
    activeRange.value = 'month'
    summary.title = '🏠 全店總計 (該月)'
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    calendarTitle.value = `${year}年 ${month + 1}月`

    const { start, endExclusive: end } = getBusinessMonthRange(viewDate)
    activeFinanceRange = { start, end }
    stopSummary()
    stopCalendar()
    await data.loadDailySummariesRange(start, end)

    const render = () => {
      const range = data.readDailySummariesRange(start, end)
      dailyFinancialData = Object.fromEntries(
        Object.entries(range).map(([bizDateKey, daily]) => [
          bizDateKey,
          { totalRevenue: daily.paidTotal || 0, orderCount: daily.orderCount || 0 },
        ])
      )
      setSummary(summarizeDailyRange(range), '🏠 全店總計 (本月)')
      renderCalendarGrid(year, month)
    }

    render()
    stopCalendarWatch = data.watchDailySummariesRange(start, end, render)
  }

  async function changeMonth(offset: number) {
    const nextDate = new Date(viewDate)
    nextDate.setMonth(nextDate.getMonth() + offset)
    viewDate = nextDate
    await renderCalendar()
    orderList.visible = false
    specificDay.visible = false
    specificDay.bizDateKey = ''
  }

  function resolveRange(range: FinanceRange, targetBizDateKey: string | null) {
    const anchor = targetBizDateKey?.trim() ? getBusinessDayRangeFromKey(targetBizDateKey).start : new Date()
    const businessNow = toBusinessDate(anchor)

    if (range === 'day' || range === 'week' || range === 'month') {
      const bounds =
        range === 'day'
          ? getBusinessDayRange(anchor)
          : range === 'week'
            ? getBusinessWeekRange(anchor)
            : getBusinessMonthRange(anchor)
      const label = range === 'day' ? '今日' : range === 'week' ? '本週' : '本月'
      return { start: bounds.start, end: bounds.endExclusive, titleText: `🏠 全店總計 (${label})` }
    }

    if (range === 'custom') {
      rangeDates.start ||= toLocalIsoDate(new Date(businessNow.getFullYear(), businessNow.getMonth(), 1))
      rangeDates.end ||= toLocalIsoDate(new Date(businessNow.getFullYear(), businessNow.getMonth() + 1, 0))
      const startKey = parseBusinessDateInput(rangeDates.start) || getBusinessDateKey(businessNow)
      const endKey = parseBusinessDateInput(rangeDates.end) || getBusinessDateKey(businessNow)
      return {
        start: getBusinessDayRangeFromKey(startKey).start,
        end: getBusinessDayRangeFromKey(endKey).endExclusive,
        titleText: `🏠 全店總計 (${rangeDates.start} ~ ${rangeDates.end})`,
      }
    }

    const targetKey =
      parseBusinessDateInput(targetBizDateKey || '') ||
      parseBusinessDateInput(specificDay.bizDateKey) ||
      getBusinessDateKey(anchor)
    const bounds = getBusinessDayRangeFromKey(targetKey)
    return { start: bounds.start, end: bounds.endExclusive, titleText: `🏠 全店總計 (${targetKey})` }
  }

  async function updateStats(range: FinanceRange, targetBizDateKey: string | null = null) {
    setRangeControls(range)
    const next = resolveRange(range, targetBizDateKey)
    activeFinanceRange = { start: next.start, end: next.end }
    stopSummary()
    await data.loadDailySummariesRange(next.start, next.end)
    const render = () => {
      setSummary(summarizeDailyRange(data.readDailySummariesRange(next.start, next.end)), next.titleText)
    }
    render()
    stopSummaryWatch = data.watchDailySummariesRange(next.start, next.end, render)
  }

  function setRangeDate(field: 'start' | 'end', value: string) {
    rangeDates[field] = value
    void updateStats('custom')
  }

  async function showDetailedOrders(bizDateKey: string) {
    const normalizedKey = parseBusinessDateKey(bizDateKey)
    const { start, endExclusive } = getBusinessDayRangeFromKey(normalizedKey)
    activeDetailedOrdersKey = normalizedKey
    stopDetailedOrders()
    const orders = [...(await data.listClosedOrdersByRange(start, endExclusive))].reverse()
    orderList.visible = true
    orderList.title = `📅 ${formatBusinessDateLabel(normalizedKey)} 詳細訂單`
    if (orders.length === 0) {
      orderList.rows = null
      return
    }
    orderList.rows = orders.map((order) => ({
      seq: `#${order.formattedSeq || order.seq || '?'}`,
      seat: order.seat || order.table || '',
      summary: getGroupedOrderSummary(getGroupedOrderLines(order)),
      time: order.time.split(' ')[1] || order.time,
      amount: formatSignedCurrency(order.total || 0),
    }))
    stopDetailedOrdersWatch = data.watchClosedOrdersRange(start, endExclusive, () => {
      if (activeDetailedOrdersKey === normalizedKey) {
        void showDetailedOrders(normalizedKey)
      }
    })
  }

  function selectDay(bizDateKey: string) {
    calendarCells.value = calendarCells.value.map((cell) =>
      cell ? { ...cell, active: cell.bizDateKey === bizDateKey } : cell
    )
    void showDetailedOrders(bizDateKey)
    specificDay.bizDateKey = bizDateKey
    specificDay.visible = true
    void updateStats('specific', bizDateKey)
  }

  async function openRevenueModal(type: string) {
    const bucket = ([...REPORT_CATEGORY_KEYS, 'total'] as string[]).includes(type)
      ? (type as PosRevenueBucket)
      : 'total'
    revenueModal.title = REVENUE_TITLES[bucket]
    if (activeFinanceRange) {
      revenueDetails = buildRevenueDetails(
        await data.listClosedOrdersByRange(activeFinanceRange.start, activeFinanceRange.end),
        kernel.helpers.getItemCategoryType
      )
    }
    revenueModal.bucket = bucket
    revenueModal.items = revenueDetails[bucket] || []
    revenueModal.open = true
  }

  function closeRevenueModal() {
    revenueModal.open = false
  }

  return {
    view,
    title,
    costCategories,
    calendarTitle,
    calendarCells,
    summary,
    activeRange,
    customRangeVisible,
    rangeDates,
    specificDay,
    orderList,
    revenueModal,
    stopAllWatches,
    openFinancePage,
    renderCostEditor,
    updateItemData,
    changeMonth,
    updateStats,
    setRangeDate,
    selectDay,
    openRevenueModal,
    closeRevenueModal,
  }
}
