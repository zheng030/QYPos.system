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
        renderCart: () => {
          const sales = context.getService<{ renderCart(): void }>('pos-sales')
          sales?.renderCart()
        },
        showIncomingOrderModal: (table, orderData) => {
          const sales = context.getService<{ showIncomingOrderModal(table: string, orderData: unknown): void }>(
            'pos-sales'
          )
          sales?.showIncomingOrderModal(table, orderData)
        },
        closeIncomingOrderModal: () => {
          const sales = context.getService<{ closeIncomingOrderModal(): void }>('pos-sales')
          sales?.closeIncomingOrderModal()
        },
        authGate,
      })

      const repository = createRtdbV3Repository({
        db: kernel.db,
        state: kernel.state,
        onLiveStateChange(roots) {
          emitDataChange(roots)
          void uiBridge.refreshUiAfterDataChange({ includeAnalytics: false, includeAdmin: false })
          if (roots.includes('incomingOrders')) {
            uiBridge.checkIncomingOrders()
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
          await uiBridge.refreshUiAfterDataChange({ includeAnalytics: false, includeAdmin: false })
          uiBridge.checkIncomingOrders()
        },
        async startTableLiveSession(mode, table) {
          await repository.startTableLiveSession(mode, table)
          await uiBridge.refreshUiAfterDataChange({ includeAnalytics: false, includeAdmin: false })
        },
        stopTableLiveSession() {
          repository.stopTableLiveSession()
        },
        async ensureCatalog() {
          await repository.ensureCatalog()
          await uiBridge.refreshUiAfterDataChange({ includeAnalytics: false, includeAdmin: false })
        },
        async ensureOwnerAuth() {
          await repository.ensureOwnerAuth()
          await uiBridge.refreshUiAfterDataChange({ includeAnalytics: false, includeAdmin: false })
        },
        async listClosedOrdersByDay(targetDate) {
          const orders = await repository.listClosedOrdersByDay(targetDate)
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
        async saveTableDraft(table, cart, customer) {
          const result = await repository.saveTableDraft(table, cart, customer)
          emitDataChange(['live'])
          await uiBridge.refreshUiAfterDataChange()
          return result
        },
        async submitIncomingOrder(table, cart, customer) {
          await repository.submitIncomingOrder(table, cart, customer)
          emitDataChange(['incomingOrders'])
          await uiBridge.refreshUiAfterDataChange()
        },
        async acceptIncomingOrder(table, requestId) {
          const result = await repository.acceptIncomingOrder(table, requestId)
          emitDataChange(['incomingOrders', 'tableCarts'])
          await uiBridge.refreshUiAfterDataChange()
          uiBridge.checkIncomingOrders()
          return result
        },
        async rejectIncomingOrder(table, requestId) {
          await repository.rejectIncomingOrder(table, requestId)
          emitDataChange(['incomingOrders'])
          await uiBridge.refreshUiAfterDataChange()
          uiBridge.checkIncomingOrders()
        },
        async checkoutTable(payload) {
          const order = await repository.checkoutTable(payload)
          emitDataChange(['historyOrders', 'tableCarts'])
          await uiBridge.refreshUiAfterDataChange()
          return order
        },
        async checkoutSplit(payload) {
          const order = await repository.checkoutSplit(payload)
          emitDataChange(['historyOrders', 'tableCarts'])
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
        toggleStockStatus: async (name, checked) => {
          await repository.updateInventory(name, checked)
          await uiBridge.refreshUiAfterDataChange({ includeAnalytics: false, includeAdmin: false })
        },
        toggleParentWithOptions: async (name, checked) => {
          const batch: Record<string, boolean> = { [name]: checked }
          for (const option of kernel.foodOptionVariants[name] || []) {
            batch[`${name}::${option}`] = checked
          }
          await repository.updateInventoryBatch(batch)
          await uiBridge.refreshUiAfterDataChange({ includeAnalytics: false, includeAdmin: false })
        },
        toggleOptionStock: async (name, option, checked) => {
          kernel.state.inventory[`${name}::${option}`] = checked
          await repository.updateInventory(`${name}::${option}`, checked)
          if (kernel.foodOptionVariants[name]) {
            const hasAny = kernel.foodOptionVariants[name].some(
              (variant) => kernel.state.inventory[`${name}::${variant}`] !== false
            )
            kernel.state.inventory[name] = hasAny
            await repository.updateInventory(name, hasAny)
          }
          await uiBridge.refreshUiAfterDataChange({ includeAnalytics: false, includeAdmin: false })
        },
        updateItemData: async (name, type, value) => {
          let numericValue = parseInt(value, 10)
          if (Number.isNaN(numericValue)) numericValue = 0
          if (type === 'cost') await repository.updateItemCost(name, numericValue)
          else await repository.updateItemPrice(name, numericValue)
          await uiBridge.refreshUiAfterDataChange({ includeAnalytics: false, includeAdmin: false })
        },
        checkLogin: uiBridge.checkLogin,
        checkIncomingOrders: uiBridge.checkIncomingOrders,
        fixAllOrderIds: async () => {
          const sales = context.getService<{ fixAllOrderIds(): Promise<void> }>('pos-sales')
          if (!sales) {
            throw new Error('POS sales service is not ready')
          }
          await sales.fixAllOrderIds()
        },
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
    },
  }
}
