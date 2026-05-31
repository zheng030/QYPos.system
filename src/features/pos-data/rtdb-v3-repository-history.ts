import type { PosOrder } from '@/features/pos-kernel/types'
import { getBusinessDayRange } from '@/shared/business-day'
import {
  buildSummaryFromClosedOrders,
  getBizDateKeysBetween,
  getMonthKeyFromBizDate,
  orderRecordToPosOrder,
} from './rtdb-v3-mapper'
import type { HistoryRange, RtdbV3RepositoryContext } from './rtdb-v3-repository-context'
import {
  createDailySummaryDescriptor,
  createHistoryOrdersByDayDescriptor,
  createItemStatsDescriptor,
} from './rtdb-v3-resource-registry'
import { closedOrderMapStorageCodec, dailySummaryStorageCodec, itemStatsStorageCodec } from './rtdb-v3-storage-codecs'
import type {
  V3BizDateKey,
  V3DailyItemStat,
  V3DailySummary,
  V3DailySummaryRangeEvent,
  V3HistoryRangeEvent,
  V3ItemStatsRangeEvent,
} from './rtdb-v3-types'
import { RTDB_V3_ROOT } from './rtdb-v3-types'

export function createRtdbV3RepositoryHistoryModule(ctx: RtdbV3RepositoryContext) {
  function toRevisionValue(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  }

  async function ensureHistoryBizDate(bizDate: V3BizDateKey) {
    if (ctx.historyDayCache.has(bizDate)) {
      return ctx.historyDayCache.get(bizDate) || {}
    }
    const descriptor = createHistoryOrdersByDayDescriptor(bizDate)
    const value = await ctx.loadCacheFirstResource({
      descriptor,
      readRemote: async () => {
        const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/${descriptor.remotePath}`).once('value')
        return closedOrderMapStorageCodec.decode((snapshot.val() || {}) as Record<string, never>)
      },
    })
    ctx.historyDayCache.set(bizDate, value)
    return value
  }

  async function refreshHistoryBizDate(bizDate: V3BizDateKey) {
    const descriptor = createHistoryOrdersByDayDescriptor(bizDate)
    const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/${descriptor.remotePath}`).once('value')
    const value = descriptor.codec.decode((snapshot.val() || {}) as Record<string, never>)
    ctx.historyDayCache.set(bizDate, value)
    await ctx.saveCachedResource(descriptor, ctx.revisionCache.get(`history/ordersByDay/${bizDate}`) || 0, value)
    return value
  }

  async function ensureDailySummaryDay(bizDate: V3BizDateKey) {
    if (ctx.dailySummaryDayCache.has(bizDate)) {
      return ctx.dailySummaryDayCache.get(bizDate) || null
    }
    const descriptor = createDailySummaryDescriptor(bizDate)
    const value = await ctx.loadCacheFirstResource({
      descriptor,
      readRemote: async () => {
        const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/${descriptor.remotePath}`).once('value')
        return descriptor.codec.decode((snapshot.val() || null) as ReturnType<typeof dailySummaryStorageCodec.encode>)
      },
    })
    if (value) {
      ctx.dailySummaryDayCache.set(bizDate, value)
    }
    return value
  }

  async function refreshDailySummaryDay(bizDate: V3BizDateKey) {
    const descriptor = createDailySummaryDescriptor(bizDate)
    const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/${descriptor.remotePath}`).once('value')
    const value = descriptor.codec.decode(
      (snapshot.val() || null) as ReturnType<typeof dailySummaryStorageCodec.encode>
    )
    if (value) {
      ctx.dailySummaryDayCache.set(bizDate, value)
    } else {
      ctx.dailySummaryDayCache.delete(bizDate)
    }
    await ctx.saveCachedResource(descriptor, ctx.revisionCache.get(`reports/dailyByDay/${bizDate}`) || 0, value)
    return value
  }

  async function ensureItemStatsDay(bizDate: V3BizDateKey) {
    if (ctx.itemStatsDayCache.has(bizDate)) {
      return ctx.itemStatsDayCache.get(bizDate) || {}
    }
    const descriptor = createItemStatsDescriptor(bizDate)
    const value = await ctx.loadCacheFirstResource({
      descriptor,
      readRemote: async () => {
        const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/${descriptor.remotePath}`).once('value')
        return descriptor.codec.decode((snapshot.val() || {}) as ReturnType<typeof itemStatsStorageCodec.encode>)
      },
    })
    ctx.itemStatsDayCache.set(bizDate, value)
    return value
  }

  async function refreshItemStatsDay(bizDate: V3BizDateKey) {
    const descriptor = createItemStatsDescriptor(bizDate)
    const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/${descriptor.remotePath}`).once('value')
    const value = descriptor.codec.decode((snapshot.val() || {}) as ReturnType<typeof itemStatsStorageCodec.encode>)
    ctx.itemStatsDayCache.set(bizDate, value)
    await ctx.saveCachedResource(descriptor, ctx.revisionCache.get(`reports/itemStatsByDay/${bizDate}`) || 0, value)
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
    const stops = bizDateKeys.map((bizDate) => {
      const descriptor = createHistoryOrdersByDayDescriptor(bizDate)
      return ctx.db.ref(`${RTDB_V3_ROOT}/meta/revisions/${descriptor.revision.path}`).on('value', (snapshot) => {
        const revision = toRevisionValue(snapshot.val())
        const previousRevision = ctx.revisionCache.get(descriptor.revision.path)
        ctx.revisionCache.set(descriptor.revision.path, revision)
        if (previousRevision === revision) {
          return
        }
        ctx.historyDayCache.delete(bizDate)
        void refreshHistoryBizDate(bizDate).then(() => {
          onInvalidate({ kind: 'history-orders', changedBizDates: [bizDate] })
        })
      }) as () => void
    })
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
    const stops = bizDateKeys.map((bizDate) => {
      const descriptor = createDailySummaryDescriptor(bizDate)
      return ctx.db.ref(`${RTDB_V3_ROOT}/meta/revisions/${descriptor.revision.path}`).on('value', (snapshot) => {
        const revision = toRevisionValue(snapshot.val())
        const previousRevision = ctx.revisionCache.get(descriptor.revision.path)
        ctx.revisionCache.set(descriptor.revision.path, revision)
        if (previousRevision === revision) {
          return
        }
        ctx.dailySummaryDayCache.delete(bizDate)
        void refreshDailySummaryDay(bizDate).then(() => {
          onInvalidate({ kind: 'daily-summary', changedBizDates: [bizDate] })
        })
      }) as () => void
    })
    return () => {
      stops.forEach((stop) => {
        stop()
      })
    }
  }

  function watchItemStatsRange(start: Date, endExclusive: Date, onInvalidate: (event: V3ItemStatsRangeEvent) => void) {
    const bizDateKeys = getBizDateKeysBetween(start, endExclusive)
    const stops = bizDateKeys.map((bizDate) => {
      const descriptor = createItemStatsDescriptor(bizDate)
      return ctx.db.ref(`${RTDB_V3_ROOT}/meta/revisions/${descriptor.revision.path}`).on('value', (snapshot) => {
        const revision = toRevisionValue(snapshot.val())
        const previousRevision = ctx.revisionCache.get(descriptor.revision.path)
        ctx.revisionCache.set(descriptor.revision.path, revision)
        if (previousRevision === revision) {
          return
        }
        ctx.itemStatsDayCache.delete(bizDate)
        void refreshItemStatsDay(bizDate).then(() => {
          onInvalidate({ kind: 'item-stats', changedBizDates: [bizDate] })
        })
      }) as () => void
    })
    return () => {
      stops.forEach((stop) => {
        stop()
      })
    }
  }

  async function rebuildDayReports(bizDate: V3BizDateKey) {
    const orders = await ensureHistoryBizDate(bizDate)
    const rebuilt = buildSummaryFromClosedOrders(orders)
    const dailyDescriptor = createDailySummaryDescriptor(bizDate)
    const itemStatsDescriptor = createItemStatsDescriptor(bizDate)
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/${dailyDescriptor.remotePath}`]: dailySummaryStorageCodec.encode(rebuilt.summary),
      [`${RTDB_V3_ROOT}/${itemStatsDescriptor.remotePath}`]: itemStatsStorageCodec.encode(rebuilt.itemStats || {}),
    }
    ctx.touchRevision(`reports/dailyByDay/${bizDate}`, payload)
    ctx.touchRevision(`reports/itemStatsByDay/${bizDate}`, payload)
    await ctx.updateRoot(payload)
    if (rebuilt.summary) ctx.dailySummaryDayCache.set(bizDate, rebuilt.summary)
    else ctx.dailySummaryDayCache.delete(bizDate)
    if (rebuilt.itemStats) ctx.itemStatsDayCache.set(bizDate, rebuilt.itemStats)
    else ctx.itemStatsDayCache.delete(bizDate)
    await ctx.saveCachedResource(
      dailyDescriptor,
      ctx.revisionCache.get(`reports/dailyByDay/${bizDate}`) || 0,
      rebuilt.summary
    )
    await ctx.saveCachedResource(
      itemStatsDescriptor,
      ctx.revisionCache.get(`reports/itemStatsByDay/${bizDate}`) || 0,
      rebuilt.itemStats || {}
    )
  }

  async function deleteClosedOrder(order: PosOrder) {
    const bizDate = String(order.bizDateKey || '')
    const monthKey = String(order.monthKey || getMonthKeyFromBizDate(bizDate as V3BizDateKey))
    const orderId = String(order.orderId || '')
    if (!bizDate || !monthKey || !orderId) {
      return
    }
    const descriptor = createHistoryOrdersByDayDescriptor(bizDate as V3BizDateKey)
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/${descriptor.remotePath}/${orderId}`]: null,
    }
    ctx.touchRevision(`history/ordersByDay/${bizDate}`, payload)
    await ctx.updateRoot(payload)

    await refreshHistoryBizDate(bizDate as V3BizDateKey)
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
