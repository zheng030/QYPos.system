import type { PosKernelService } from '@/features/pos-kernel/service'
import type { PosOrderEntry } from '@/features/pos-kernel/types'
import { createAttendanceService } from './attendance-service'
import { createRtdbV3Repository } from './rtdb-v3-repository'
import type { PosDataChangeEvent, PosDataService } from './service'

export function createPosDataService(kernel: PosKernelService): PosDataService {
  const listeners = new Set<(event: PosDataChangeEvent) => void>()

  function emitDataChange(roots: string[]) {
    listeners.forEach((listener) => {
      listener({ roots })
    })
  }

  const repository = createRtdbV3Repository({
    db: kernel.db,
    state: kernel.state,
    tables: kernel.tables,
    helpers: {
      getCanonicalDraftEntries: kernel.helpers.getCanonicalDraftEntries,
      normalizeEntryForDisplay: kernel.helpers.normalizeEntryForDisplay,
    },
    onLiveStateChange(roots) {
      emitDataChange(roots)
    },
  })

  const attendance = createAttendanceService({
    ensureWindow: async (monthKeys) => {
      await repository.ensureAttendanceWindow(monthKeys)
    },
    ensureFullHistory: async () => {
      await repository.ensureAttendanceFullHistory()
    },
    watchWindow: (monthKeys, onChange) => repository.watchAttendanceWindow(monthKeys, onChange),
    watchFullHistory: (onChange) => repository.watchAttendanceFullHistory(onChange),
    save: async (updates) => {
      await repository.saveAttendanceUpdates(updates)
    },
    getEmployees: () => kernel.state.attendanceEmployees,
    getRecords: () => kernel.state.attendanceRecords,
  })

  async function withChange<T>(roots: string[], run: () => Promise<T>) {
    const result = await run()
    emitDataChange(roots)
    return result
  }

  function ensureInventory() {
    return withChange(['inventory'], () => repository.ensureInventory())
  }

  async function ensureDrinkAvailability(entries: PosOrderEntry[]) {
    await ensureInventory()
    const unavailable = new Set<string>()
    for (const entry of entries) {
      for (const line of entry.lines) {
        if (line.courseKind !== 'drink') continue
        const temperature = kernel.drinkTemperatureSwitches.find(
          (option) => option.value === line.selections?.temperature
        )
        if (temperature && kernel.helpers.isInventoryKeySoldOut(temperature.soldOutKey)) {
          unavailable.add(`${line.shortName || line.displayName}（${temperature.label}）`)
        }
      }
    }
    if (unavailable.size > 0) {
      throw new Error(`以下飲料暫停供應，請調整購物車後再送出：${[...unavailable].join('、')}`)
    }
  }

  return {
    attendance,
    startStaffLive: () => withChange(['pendingBatches'], () => repository.startStaffLive()),
    startTableLiveSession: (mode, table) =>
      withChange(['liveSession'], () => repository.startTableLiveSession(mode, table)),
    stopTableLiveSession() {
      repository.stopTableLiveSession()
    },
    ensureCatalog: () => withChange(['catalog'], () => repository.ensureCatalog()),
    ensureInventory,
    listClosedOrdersForBusinessDay: (anchor) => repository.listClosedOrdersForBusinessDay(anchor),
    listClosedOrdersByRange: (start, endExclusive) => repository.listClosedOrdersByRange({ start, endExclusive }),
    loadDailySummariesRange: (start, endExclusive) => repository.loadDailySummariesRange(start, endExclusive),
    loadItemStatsRange: (start, endExclusive) => repository.loadItemStatsRange(start, endExclusive),
    watchCatalogRevision: (listener) => repository.watchCatalogRevision(listener),
    watchClosedOrdersRange: (start, endExclusive, listener) =>
      repository.watchClosedOrdersRange(start, endExclusive, listener),
    watchClosedOrdersForBusinessDay: (anchor, listener) => repository.watchClosedOrdersForBusinessDay(anchor, listener),
    watchDailySummariesRange: (start, endExclusive, listener) =>
      repository.watchDailySummariesRange(start, endExclusive, listener),
    watchItemStatsRange: (start, endExclusive, listener) =>
      repository.watchItemStatsRange(start, endExclusive, listener),
    readDailySummariesRange: (start, endExclusive) => repository.readDailySummariesRange(start, endExclusive),
    readItemStatsRange: (start, endExclusive) => repository.readItemStatsRange(start, endExclusive),
    saveCustomerDraft: (table, entries, customer) =>
      withChange(['tableDrafts'], () => repository.saveCustomerDraft(table, entries, customer)),
    updateTableCustomer: (table, customer) =>
      withChange(['tableCustomers'], () => repository.updateTableCustomer(table, customer)),
    submitCustomerDraft: (table, entries, customer) =>
      withChange(['tableDrafts', 'pendingBatches'], async () => {
        await ensureDrinkAvailability(entries)
        return repository.submitCustomerDraft(table, entries, customer)
      }),
    discardCustomerDraft: (table) => withChange(['tableDrafts'], () => repository.discardCustomerDraft(table)),
    readPendingBatchDetail: (table, batchId) => repository.readPendingBatchDetail(table, batchId),
    acceptPendingBatch: (table, batchId) =>
      withChange(['pendingBatches', 'submittedBatches'], () => repository.acceptPendingBatch(table, batchId)),
    rejectPendingBatch: (table, batchId) =>
      withChange(['tableDrafts', 'pendingBatches'], () => repository.rejectPendingBatch(table, batchId)),
    saveStaffDraft: (table, entries) => withChange(['staffDrafts'], () => repository.saveStaffDraft(table, entries)),
    createStaffBatch: (table, entries, customer) =>
      withChange(['submittedBatches', 'staffDrafts'], async () => {
        await ensureDrinkAvailability(entries)
        return repository.createStaffBatch(table, entries, customer)
      }),
    updateSubmittedBatch: (table, batchId, entries) =>
      withChange(['submittedBatches'], () => repository.updateSubmittedBatch(table, batchId, entries)),
    checkoutSubmittedBatches: (payload) =>
      withChange(['historyOrders', 'tableDrafts', 'pendingBatches', 'submittedBatches'], () =>
        repository.checkoutSubmittedBatches(payload)
      ),
    deleteClosedOrder: (order) => withChange(['historyOrders'], () => repository.deleteClosedOrder(order)),
    readCustomerNotice: () => repository.readCustomerNotice(),
    saveCustomerNotice: (notice) => repository.saveCustomerNotice(notice),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emitChange: emitDataChange,
    async toggleStockStatus(itemId, checked) {
      const item = kernel.helpers.getItemById(itemId)
      if (!item) {
        return
      }
      const childKeys = kernel.helpers.getOwnedSelectionInventoryKeys(itemId)
      const batch = Object.fromEntries([item.inventoryKey, ...childKeys].map((key) => [key, checked]))
      await withChange(['inventory'], () => repository.updateInventoryBatch(batch))
    },
    async toggleInventoryBatch(batch) {
      if (Object.keys(batch).length === 0) {
        return
      }
      await withChange(['inventory'], () => repository.updateInventoryBatch(batch))
    },
    toggleOptionStock: (_itemId, optionKey, checked) =>
      withChange(['inventory'], () => repository.updateInventory(optionKey, checked)),
    async updateItemData(itemId, type, value) {
      const numericValue = Number.parseInt(value, 10)
      const safeValue = Number.isFinite(numericValue) ? numericValue : 0
      if (type === 'cost') {
        await withChange(['itemCosts'], () => repository.updateItemCost(itemId, safeValue))
        return
      }
      await withChange(['itemPrices'], () => repository.updateItemPrice(itemId, safeValue))
    },
    getSyncLog() {
      return kernel.state.syncLog
    },
  }
}
