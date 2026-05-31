import type { PosOrder } from '@/features/pos-kernel/types'
import { getBusinessDayRange } from '@/shared/business-day'
import {
  buildSummaryFromClosedOrders,
  getBizDateKeysBetween,
  getMonthKeyFromBizDate,
  orderRecordToPosOrder,
} from './rtdb-v3-mapper'
import {
  decodeItemStatsRecord,
  encodeItemStatsRecord,
  type HistoryRange,
  type RtdbV3RepositoryContext,
} from './rtdb-v3-repository-context'
import type {
  V3BizDateKey,
  V3ClosedOrder,
  V3DailyItemStat,
  V3DailySummary,
  V3DailySummaryRangeEvent,
  V3HistoryRangeEvent,
  V3ItemStatsRangeEvent,
} from './rtdb-v3-types'
import { RTDB_V3_ROOT } from './rtdb-v3-types'

export function createRtdbV3RepositoryHistoryModule(ctx: RtdbV3RepositoryContext) {
  async function ensureHistoryBizDate(bizDate: V3BizDateKey) {
    if (ctx.historyDayCache.has(bizDate)) {
      return ctx.historyDayCache.get(bizDate) || {}
    }
    const monthKey = getMonthKeyFromBizDate(bizDate)
    const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/history/ordersByMonth/${monthKey}/${bizDate}`).once('value')
    const value = (snapshot.val() || {}) as Record<string, V3ClosedOrder>
    ctx.historyDayCache.set(bizDate, value)
    return value
  }

  async function ensureDailySummaryDay(bizDate: V3BizDateKey) {
    if (ctx.dailySummaryDayCache.has(bizDate)) {
      return ctx.dailySummaryDayCache.get(bizDate) || null
    }
    const monthKey = getMonthKeyFromBizDate(bizDate)
    const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/reports/dailyByMonth/${monthKey}/${bizDate}`).once('value')
    const value = (snapshot.val() || null) as V3DailySummary | null
    if (value) {
      ctx.dailySummaryDayCache.set(bizDate, value)
    }
    return value
  }

  async function ensureItemStatsDay(bizDate: V3BizDateKey) {
    if (ctx.itemStatsDayCache.has(bizDate)) {
      return ctx.itemStatsDayCache.get(bizDate) || {}
    }
    const monthKey = getMonthKeyFromBizDate(bizDate)
    const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/reports/itemStatsByMonth/${monthKey}/${bizDate}`).once('value')
    const value = decodeItemStatsRecord((snapshot.val() || {}) as Record<string, V3DailyItemStat>)
    ctx.itemStatsDayCache.set(bizDate, value)
    return value
  }

  async function listClosedOrdersByRange(range: HistoryRange) {
    const bizDateKeys = getBizDateKeysBetween(range.start, range.endExclusive)
    const orders = await Promise.all(
      bizDateKeys.map(async (bizDate) => {
        const byDay = await ensureHistoryBizDate(bizDate)
        return Object.values(byDay || {})
          .sort((left, right) => left.closedAt - right.closedAt)
          .map((order) => orderRecordToPosOrder(order, ctx.helpers?.normalizeEntryForDisplay))
      })
    )
    return orders.flat()
  }

  async function listClosedOrdersForBusinessDay(anchor: Date) {
    const { start, endExclusive } = getBusinessDayRange(anchor)
    return listClosedOrdersByRange({ start, endExclusive })
  }

  async function loadDailySummariesRange(start: Date, endExclusive: Date) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    const result: Record<string, V3DailySummary> = {}
    await Promise.all(
      bizDateKeys.map(async (bizDate) => {
        const summary = await ensureDailySummaryDay(bizDate)
        if (summary) result[bizDate] = summary
      })
    )
    return result
  }

  async function loadItemStatsRange(start: Date, endExclusive: Date) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    const result: Record<string, Record<string, V3DailyItemStat>> = {}
    await Promise.all(
      bizDateKeys.map(async (bizDate) => {
        const stats = await ensureItemStatsDay(bizDate)
        result[bizDate] = stats
      })
    )
    return result
  }

  function readDailySummariesRange(start: Date, endExclusive: Date) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    const summaries: Record<string, V3DailySummary> = {}
    bizDateKeys.forEach((bizDate) => {
      const summary = ctx.dailySummaryDayCache.get(bizDate)
      if (summary) {
        summaries[bizDate] = summary
      }
    })
    return summaries
  }

  function readItemStatsRange(start: Date, endExclusive: Date) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    return Object.fromEntries(bizDateKeys.map((bizDate) => [bizDate, ctx.itemStatsDayCache.get(bizDate) || {}]))
  }

  function watchClosedOrdersRange(start: Date, endExclusive: Date, onInvalidate: (event: V3HistoryRangeEvent) => void) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    const stops = bizDateKeys.map(
      (bizDate) =>
        ctx.db.ref(`${RTDB_V3_ROOT}/meta/revisions/history/ordersByDay/${bizDate}`).on('value', () => {
          ctx.historyDayCache.delete(bizDate)
          void ensureHistoryBizDate(bizDate).then(() => {
            onInvalidate({ kind: 'history-orders', changedBizDates: [bizDate] })
          })
        }) as () => void
    )
    return () => {
      stops.forEach((stop) => {
        stop()
      })
    }
  }

  function watchClosedOrdersForBusinessDay(anchor: Date, onInvalidate: (event: V3HistoryRangeEvent) => void) {
    const { start, endExclusive } = getBusinessDayRange(anchor)
    return watchClosedOrdersRange(start, endExclusive, onInvalidate)
  }

  function watchDailySummariesRange(
    start: Date,
    endExclusive: Date,
    onInvalidate: (event: V3DailySummaryRangeEvent) => void
  ) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    const stops = bizDateKeys.map(
      (bizDate) =>
        ctx.db.ref(`${RTDB_V3_ROOT}/meta/revisions/reports/dailyByDay/${bizDate}`).on('value', () => {
          ctx.dailySummaryDayCache.delete(bizDate)
          void ensureDailySummaryDay(bizDate).then(() => {
            onInvalidate({ kind: 'daily-summary', changedBizDates: [bizDate] })
          })
        }) as () => void
    )
    return () => {
      stops.forEach((stop) => {
        stop()
      })
    }
  }

  function watchItemStatsRange(start: Date, endExclusive: Date, onInvalidate: (event: V3ItemStatsRangeEvent) => void) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    const stops = bizDateKeys.map(
      (bizDate) =>
        ctx.db.ref(`${RTDB_V3_ROOT}/meta/revisions/reports/itemStatsByDay/${bizDate}`).on('value', () => {
          ctx.itemStatsDayCache.delete(bizDate)
          void ensureItemStatsDay(bizDate).then(() => {
            onInvalidate({ kind: 'item-stats', changedBizDates: [bizDate] })
          })
        }) as () => void
    )
    return () => {
      stops.forEach((stop) => {
        stop()
      })
    }
  }

  async function rebuildDayReports(bizDate: V3BizDateKey) {
    const monthKey = getMonthKeyFromBizDate(bizDate)
    const orders = await ensureHistoryBizDate(bizDate)
    const rebuilt = buildSummaryFromClosedOrders(orders)
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/reports/dailyByMonth/${monthKey}/${bizDate}`]: rebuilt.summary,
      [`${RTDB_V3_ROOT}/reports/itemStatsByMonth/${monthKey}/${bizDate}`]: encodeItemStatsRecord(rebuilt.itemStats),
    }
    ctx.touchRevision(`reports/dailyByDay/${bizDate}`, payload)
    ctx.touchRevision(`reports/itemStatsByDay/${bizDate}`, payload)
    await ctx.updateRoot(payload)
    if (rebuilt.summary) ctx.dailySummaryDayCache.set(bizDate, rebuilt.summary)
    else ctx.dailySummaryDayCache.delete(bizDate)
    if (rebuilt.itemStats) ctx.itemStatsDayCache.set(bizDate, rebuilt.itemStats)
    else ctx.itemStatsDayCache.delete(bizDate)
  }

  async function deleteClosedOrder(order: PosOrder) {
    const bizDate = String(order.bizDateKey || '')
    const monthKey = String(order.monthKey || getMonthKeyFromBizDate(bizDate as V3BizDateKey))
    const orderId = String(order.orderId || '')
    if (!bizDate || !monthKey || !orderId) {
      return
    }
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/history/ordersByMonth/${monthKey}/${bizDate}/${orderId}`]: null,
    }
    ctx.touchRevision(`history/ordersByDay/${bizDate}`, payload)
    await ctx.updateRoot(payload)

    const current = { ...(await ensureHistoryBizDate(bizDate as V3BizDateKey)) }
    delete current[orderId]
    ctx.historyDayCache.set(bizDate as V3BizDateKey, current)
    await rebuildDayReports(bizDate as V3BizDateKey)
  }

  return {
    ensureHistoryBizDate,
    ensureDailySummaryDay,
    ensureItemStatsDay,
    listClosedOrdersByRange,
    listClosedOrdersForBusinessDay,
    loadDailySummariesRange,
    loadItemStatsRange,
    readDailySummariesRange,
    readItemStatsRange,
    watchClosedOrdersRange,
    watchClosedOrdersForBusinessDay,
    watchDailySummariesRange,
    watchItemStatsRange,
    rebuildDayReports,
    deleteClosedOrder,
  }
}
