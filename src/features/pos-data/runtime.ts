import type { AppContext, FeatureRuntime } from '@/app/app-context'
import { POS_KERNEL_SERVICE_KEY, type PosKernelService } from '@/features/pos-kernel/service'
import { POS_UI_SERVICE_KEY, type PosUiService } from '@/features/pos-shell/service'
import { ATTENDANCE_SERVICE_KEY } from '@/shared/attendance-service'
import { pbkdf2Hash } from '@/shared/password'
import { createAttendanceService } from './attendance-service'
import { createCoreSyncModule } from './core-sync'
import { createDataSync } from './data-sync'
import { POS_DATA_SERVICE_KEY, type PosDataService } from './service'

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

      const coreSync = createCoreSyncModule({
        state: kernel.state,
        dataSync: () => dataSync,
        localDataPrefix: kernel.localDataPrefix,
        customerDataRootKeys: [...kernel.customerDataRootKeys],
        adminBaseRootKeys: [...kernel.adminBaseRootKeys],
        systemPassword: kernel.systemPassword,
        foodOptionVariants: kernel.foodOptionVariants,
        getBusinessDate: kernel.dates.getBusinessDate,
        getDateFromOrder: kernel.dates.getDateFromOrder,
        getShowApp: () => async (options) => {
          const sales = context.getService<{ showApp(options?: { skipHome?: boolean }): Promise<void> }>('pos-sales')
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
        showHistory: () => {
          const reporting = context.getService<{ showHistory(): void }>('pos-reporting')
          reporting?.showHistory()
        },
        generateReport: (type) => {
          const reporting = context.getService<{ generateReport(type: string): void }>('pos-reporting')
          reporting?.generateReport(type)
        },
        renderCalendar: () => {
          const reporting = context.getService<{ renderCalendar(): void }>('pos-reporting')
          reporting?.renderCalendar()
        },
        renderItemStats: (range) => {
          const reporting = context.getService<{ renderItemStats(range: string): void }>('pos-reporting')
          reporting?.renderItemStats(range)
        },
        renderPublicStats: () => {
          const reporting = context.getService<{ renderPublicStats(): void }>('pos-reporting')
          reporting?.renderPublicStats()
        },
        updateFinancialPage: (ownerName) => {
          const admin = context.getService<{ updateFinancialPage(ownerName: string): void }>('pos-admin')
          admin?.updateFinancialPage(ownerName)
        },
        renderConfidentialCalendar: (ownerName) => {
          const admin = context.getService<{ renderConfidentialCalendar(ownerName: string): void }>('pos-admin')
          admin?.renderConfidentialCalendar(ownerName)
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
        pbkdf2Hash,
      })

      const dataSync = createDataSync({
        cloneValue: coreSync.cloneValue,
        db: kernel.db,
        getRootValue: coreSync.getRootValue,
        incomingOrdersRoot: 'incomingOrders',
        localDataPrefix: kernel.localDataPrefix,
        localRevisionKey: kernel.localRevisionKey,
        pushSyncRecord: coreSync.pushSyncRecord,
        refreshUiAfterDataChange: async () => {
          await coreSync.refreshUiAfterDataChange()
          listeners.forEach((listener) => {
            listener({ roots: [...kernel.refreshUiRoots] })
          })
        },
        rootKeys: [...kernel.dataRootKeys],
        serializeRoot: (root: string) => coreSync.getRootValue(root),
        shouldRefreshUiForRoot: (root: string) => kernel.refreshUiRoots.has(root),
        shouldProcessIncomingOrders: () => !document.body.classList.contains('customer-mode'),
        applyRootValue: coreSync.applyRootValue,
        onIncomingOrdersChanged() {
          coreSync.checkIncomingOrders()
        },
      })

      const attendanceService = createAttendanceService({
        ensureDataSubscriptions: coreSync.ensureDataSubscriptions,
        saveAllToCloud: coreSync.saveAllToCloud,
        getEmployees: () => kernel.state.attendanceEmployees,
        getRecords: () => kernel.state.attendanceRecords,
      })

      const service: PosDataService = {
        attendance: attendanceService,
        ensureRoots: coreSync.ensureRoots,
        ensureDataSubscriptions: coreSync.ensureDataSubscriptions,
        initRealtimeData: coreSync.initRealtimeData,
        saveAllToCloud: async (updates) => {
          const roots = Array.from(
            new Set(
              Object.keys(updates)
                .map((path) => path.split('/')[0])
                .filter(Boolean)
            )
          )
          await coreSync.saveAllToCloud(updates)
          listeners.forEach((listener) => {
            listener({ roots })
          })
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        emitChange(roots) {
          listeners.forEach((listener) => {
            listener({ roots })
          })
        },
        getRootValue: coreSync.getRootValue,
        getVisibleOrders: coreSync.getVisibleOrders,
        getTodayMaxBaseSeq: coreSync.getTodayMaxBaseSeq,
        getOrdersByDate(targetDate) {
          const start = new Date(targetDate)
          start.setHours(5, 0, 0, 0)
          const end = new Date(start)
          end.setDate(end.getDate() + 1)
          return kernel.state.historyOrders.filter((order) => {
            const time = kernel.dates.getDateFromOrder(order)
            return time >= start && time < end
          })
        },
        toggleStockStatus: coreSync.toggleStockStatus,
        toggleParentWithOptions: coreSync.toggleParentWithOptions,
        toggleOptionStock: coreSync.toggleOptionStock,
        updateItemData: coreSync.updateItemData,
        checkLogin: coreSync.checkLogin,
        checkIncomingOrders: coreSync.checkIncomingOrders,
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
        downloadLocalStorage() {
          const admin = context.getService<{ downloadLocalStorage(): void }>('pos-admin')
          admin?.downloadLocalStorage()
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
