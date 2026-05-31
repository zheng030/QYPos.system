import type { AppContext, FeatureRuntime } from '@/app/app-context'
import { POS_KERNEL_SERVICE_KEY, type PosKernelService } from '@/features/pos-kernel/service'
import { POS_UI_SERVICE_KEY, type PosUiService } from '@/features/pos-shell/service'
import { ATTENDANCE_SERVICE_KEY } from '@/shared/attendance-service'
import { authGate } from '@/shared/auth-gate'
import { createAttendanceService } from './attendance-service'
import { createRtdbV3Repository } from './rtdb-v3-repository'
import { POS_DATA_SERVICE_KEY, type PosDataService } from './service'
import { createUiBridgeModule } from './ui-bridge'

let booted = false

export function createPosDataFeature(context: AppContext): FeatureRuntime {
  return {
    id: 'pos-data',
    dependsOn: ['pos-kernel', 'pos-shell'],
    async boot() {
      if (booted) {
        return
      }

      const kernel = context.getService<PosKernelService>(POS_KERNEL_SERVICE_KEY)
      const ui = context.getService<PosUiService>(POS_UI_SERVICE_KEY)
      if (!kernel || !ui) {
        throw new Error('POS kernel or shell service is not ready')
      }

      booted = true
      const listeners = new Set<(event: { roots: string[] }) => void>()
      const uiBridge = createUiBridgeModule({
        state: kernel.state,
        systemPassword: kernel.systemPassword,
        getShowApp: () => async (options) => {
          const sales = context.getService<{
            showApp(options?: { skipHome?: boolean; skipStaffLive?: boolean }): Promise<void>
          }>('pos-sales')
          if (!sales) {
            throw new Error('POS sales service is not ready')
          }
          await sales.showApp(options)
        },
        renderTableGrid: async () => {
          const sales = context.getService<{ renderTableGrid(): Promise<void> }>('pos-sales')
          await sales?.renderTableGrid()
        },
        renderMenu: () => {
          const sales = context.getService<{ renderMenu(): void }>('pos-sales')
          sales?.renderMenu()
        },
        renderCart: () => {
          const sales = context.getService<{ renderCart(): void }>('pos-sales')
          sales?.renderCart()
        },
        renderProductManagement: () => {
          const admin = context.getService<{ renderProductManagement(): void }>('pos-admin')
          admin?.renderProductManagement()
        },
        showPendingBatchOverlay: () => {
          const sales = context.getService<{ showPendingBatchOverlay(): void }>('pos-sales')
          sales?.showPendingBatchOverlay()
        },
        closePendingBatchOverlay: () => {
          const sales = context.getService<{ closePendingBatchOverlay(): void }>('pos-sales')
          sales?.closePendingBatchOverlay()
        },
        authGate,
      })

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
          void uiBridge.refreshUiAfterDataChange({ includeAnalytics: false })
          if (roots.includes('pendingBatches')) {
            uiBridge.checkPendingBatches()
          }
        },
      })

      function emitDataChange(roots: string[]) {
        listeners.forEach((listener) => {
          listener({ roots })
        })
      }

      const attendanceService = createAttendanceService({
        ensureWindow: async (monthKeys) => {
          await repository.ensureAttendanceWindow(monthKeys)
        },
        ensureFullHistory: async () => {
          await repository.ensureAttendanceFullHistory()
        },
        watchWindow: (monthKeys, onChange) => {
          return repository.watchAttendanceWindow(monthKeys, () => {
            onChange()
          })
        },
        save: async (updates) => {
          await repository.saveAttendanceUpdates(updates)
        },
        getEmployees: () => kernel.state.attendanceEmployees,
        getRecords: () => kernel.state.attendanceRecords,
      })

      const service: PosDataService = {
        attendance: attendanceService,
        async startStaffLive() {
          await repository.startStaffLive()
          await uiBridge.refreshUiAfterDataChange({ includeAnalytics: false })
          uiBridge.checkPendingBatches()
        },
        async startTableLiveSession(mode, table) {
          await repository.startTableLiveSession(mode, table)
          await uiBridge.refreshUiAfterDataChange({ includeAnalytics: false })
        },
        stopTableLiveSession() {
          repository.stopTableLiveSession()
        },
        async ensureCatalog() {
          await repository.ensureCatalog()
          await uiBridge.refreshUiAfterDataChange({ includeAnalytics: false })
        },
        async ensureOwnerAuth() {
          await repository.ensureOwnerAuth()
          await uiBridge.refreshUiAfterDataChange({ includeAnalytics: false })
        },
        async listClosedOrdersForBusinessDay(anchor) {
          const orders = await repository.listClosedOrdersForBusinessDay(anchor)
          emitDataChange(['historyOrders'])
          return orders
        },
        async listClosedOrdersByRange(start, endExclusive) {
          const orders = await repository.listClosedOrdersByRange({ start, endExclusive })
          emitDataChange(['historyOrders'])
          return orders
        },
        async loadDailySummariesRange(start, endExclusive) {
          return repository.loadDailySummariesRange(start, endExclusive)
        },
        async loadItemStatsRange(start, endExclusive) {
          return repository.loadItemStatsRange(start, endExclusive)
        },
        watchCatalogRevision(listener) {
          return repository.watchCatalogRevision(listener)
        },
        watchOwnerAuthRevision(listener) {
          return repository.watchOwnerAuthRevision(listener)
        },
        watchClosedOrdersRange(start, endExclusive, listener) {
          return repository.watchClosedOrdersRange(start, endExclusive, listener)
        },
        watchClosedOrdersForBusinessDay(anchor, listener) {
          return repository.watchClosedOrdersForBusinessDay(anchor, listener)
        },
        watchDailySummariesRange(start, endExclusive, listener) {
          return repository.watchDailySummariesRange(start, endExclusive, listener)
        },
        watchItemStatsRange(start, endExclusive, listener) {
          return repository.watchItemStatsRange(start, endExclusive, listener)
        },
        readDailySummariesRange(start, endExclusive) {
          return repository.readDailySummariesRange(start, endExclusive)
        },
        readItemStatsRange(start, endExclusive) {
          return repository.readItemStatsRange(start, endExclusive)
        },
        async saveCustomerDraft(table, entries, customer) {
          const result = await repository.saveCustomerDraft(table, entries, customer)
          emitDataChange(['tableDrafts'])
          await uiBridge.refreshUiAfterDataChange()
          return result
        },
        async submitCustomerDraft(table, entries, customer) {
          const batch = await repository.submitCustomerDraft(table, entries, customer)
          emitDataChange(['tableDrafts', 'pendingBatches'])
          await uiBridge.refreshUiAfterDataChange()
          uiBridge.checkPendingBatches()
          return batch
        },
        async discardCustomerDraft(table) {
          await repository.discardCustomerDraft(table)
          emitDataChange(['tableDrafts'])
          await uiBridge.refreshUiAfterDataChange()
        },
        async readPendingBatchDetail(table, batchId) {
          return repository.readPendingBatchDetail(table, batchId)
        },
        async acceptPendingBatch(table, batchId) {
          const batch = await repository.acceptPendingBatch(table, batchId)
          emitDataChange(['pendingBatches', 'submittedBatches'])
          await uiBridge.refreshUiAfterDataChange()
          uiBridge.checkPendingBatches()
          return batch
        },
        async rejectPendingBatch(table, batchId) {
          await repository.rejectPendingBatch(table, batchId)
          emitDataChange(['tableDrafts', 'pendingBatches'])
          await uiBridge.refreshUiAfterDataChange()
          uiBridge.checkPendingBatches()
        },
        async saveStaffDraft(table, entries) {
          await repository.saveStaffDraft(table, entries)
          emitDataChange(['staffDrafts'])
          await uiBridge.refreshUiAfterDataChange()
        },
        async createStaffBatch(table, entries, customer) {
          const batch = await repository.createStaffBatch(table, entries, customer)
          emitDataChange(['submittedBatches', 'staffDrafts'])
          await uiBridge.refreshUiAfterDataChange()
          return batch
        },
        async updateSubmittedBatch(table, batchId, entries) {
          const batch = await repository.updateSubmittedBatch(table, batchId, entries)
          emitDataChange(['submittedBatches'])
          await uiBridge.refreshUiAfterDataChange()
          return batch
        },
        async checkoutSubmittedBatches(payload) {
          const order = await repository.checkoutSubmittedBatches(payload)
          emitDataChange(['historyOrders', 'tableDrafts', 'pendingBatches', 'submittedBatches'])
          await uiBridge.refreshUiAfterDataChange()
          return order
        },
        async deleteClosedOrder(order) {
          await repository.deleteClosedOrder(order)
          emitDataChange(['historyOrders'])
          await uiBridge.refreshUiAfterDataChange()
        },
        async setOwnerPassword(ownerName, record) {
          await repository.setOwnerPassword(ownerName, record)
          emitDataChange(['ownerPasswords'])
          await uiBridge.refreshUiAfterDataChange()
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        emitChange(roots) {
          emitDataChange(roots)
        },
        toggleStockStatus: async (itemId, checked) => {
          const item = kernel.helpers.getItemById(itemId)
          if (!item) {
            return
          }
          const childKeys = kernel.helpers.getOwnedSelectionInventoryKeys(itemId)
          const batch = Object.fromEntries([item.inventoryKey, ...childKeys].map((key) => [key, checked]))
          await repository.updateInventoryBatch(batch)
          await uiBridge.refreshUiAfterDataChange({ includeAnalytics: false })
        },
        toggleInventoryBatch: async (batch) => {
          if (Object.keys(batch).length === 0) {
            return
          }
          await repository.updateInventoryBatch(batch)
          await uiBridge.refreshUiAfterDataChange({ includeAnalytics: false })
        },
        toggleOptionStock: async (_itemId, optionKey, checked) => {
          await repository.updateInventory(optionKey, checked)
          await uiBridge.refreshUiAfterDataChange({ includeAnalytics: false })
        },
        updateItemData: async (itemId, type, value) => {
          const numericValue = Number.parseInt(value, 10)
          const safeValue = Number.isFinite(numericValue) ? numericValue : 0
          if (type === 'cost') {
            await repository.updateItemCost(itemId, safeValue)
          } else {
            await repository.updateItemPrice(itemId, safeValue)
          }
          await uiBridge.refreshUiAfterDataChange({ includeAnalytics: false, includeAdmin: false })
        },
        checkLogin: uiBridge.checkLogin,
        checkPendingBatches: uiBridge.checkPendingBatches,
        downloadSyncLog() {
          const admin = context.getService<{ downloadSyncLog(): void }>('pos-admin')
          admin?.downloadSyncLog()
        },
        getSyncLog() {
          return kernel.state.syncLog
        },
      }

      context.registerService(POS_DATA_SERVICE_KEY, service)
      context.registerService(ATTENDANCE_SERVICE_KEY, attendanceService)
      context.registerService('pos-data', service)
    },
  }
}
