import type { AppContext, FeatureRuntime } from '@/app/app-context'

import { POS_DATA_SERVICE_KEY, type PosDataService } from '@/features/pos-data/service'
import { POS_KERNEL_SERVICE_KEY, type PosKernelService } from '@/features/pos-kernel/service'
import { toggleAccordion } from '@/features/pos-reporting/ui'
import { POS_UI_SERVICE_KEY, type PosUiService } from '@/features/pos-shell/service'
import { authGate } from '@/shared/auth-gate'
import { createOwnerFinanceModule } from './owner-finance'
import { closeSummaryModal, downloadSyncLog, renderProductManagement } from './product-management'
import { POS_ADMIN_SERVICE_KEY, type PosAdminService } from './service'

let booted = false

export function createPosAdminFeature(context: AppContext): FeatureRuntime {
  return {
    id: 'pos-admin',
    dependsOn: ['pos-data', 'pos-shell'],
    async boot() {
      if (booted) {
        return
      }

      const maybeKernel = context.getService<PosKernelService>(POS_KERNEL_SERVICE_KEY)
      const maybeData = context.getService<PosDataService>(POS_DATA_SERVICE_KEY)
      const maybeUi = context.getService<PosUiService>(POS_UI_SERVICE_KEY)
      if (!maybeKernel || !maybeData || !maybeUi) {
        throw new Error('POS admin dependencies are not ready')
      }
      const kernel = maybeKernel
      const data = maybeData
      const ui = maybeUi

      booted = true

      const ownerFinance = createOwnerFinanceModule({
        authGate,
        ensureSubscriptions: async () => {
          await Promise.all([data.ensureOwnerAuth(), data.ensureCatalog()])
        },
        getBusinessDate: kernel.dates.getBusinessDate,
        getDateFromOrder: kernel.dates.getDateFromOrder,
        getItemCategoryType: kernel.helpers.getItemCategoryType,
        getItemCosts: () => kernel.state.itemCosts,
        getItemPrices: () => kernel.state.itemPrices,
        listClosedOrdersForBusinessDay: data.listClosedOrdersForBusinessDay,
        listClosedOrdersByRange: data.listClosedOrdersByRange,
        loadDailySummariesRange: data.loadDailySummariesRange,
        watchDailySummariesRange: data.watchDailySummariesRange,
        readDailySummariesRange: data.readDailySummariesRange,
        getOwnerPasswords: () => kernel.state.ownerPasswords,
        hideAll: ui.hideAll,
        menuData: kernel.menuData,
        saveOwnerPassword: data.setOwnerPassword,
        updateItemData: data.updateItemData,
      })

      async function openProductPage() {
        await data.ensureCatalog()
        ui.showPage('productPage')
        renderProductManagement({
          inventory: () => kernel.state.inventory,
          menuData: kernel.menuData,
        })
      }

      ui.on('click', 'open-owner-login', (_event, element) => {
        const mode = element.dataset.mode
        if (mode) ownerFinance.openOwnerLogin(mode)
      })
      ui.on('click', 'open-settings-page', () => {
        void context.getService<{ openSettingsPage(): Promise<void> }>('pos-sales')?.openSettingsPage?.()
      })
      ui.on('click', 'open-product-page', async () => {
        await openProductPage()
      })
      ui.on('click', 'check-owner', (_event, element) => {
        const owner = element.dataset.owner
        if (owner) void ownerFinance.checkOwner(owner)
      })
      ui.on('click', 'close-owner-modal', () => {
        ownerFinance.closeOwnerModal()
      })
      ui.on('click', 'close-change-password-modal', () => {
        ownerFinance.closeChangePasswordModal()
      })
      ui.on('click', 'confirm-change-password', () => {
        void ownerFinance.confirmChangePassword()
      })
      ui.on('click', 'change-owner-month', (_event, element) => {
        void ownerFinance.changeOwnerMonth(Number(element.dataset.offset || 0))
      })
      ui.on('click', 'update-finance-stats', (_event, element) => {
        const range = element.dataset.range
        if (range) void ownerFinance.updateFinanceStats(range)
      })
      ui.on('click', 'open-revenue-modal', (_event, element) => {
        const type = element.dataset.type
        if (type) void ownerFinance.openRevenueModal(type)
      })
      ui.on('click', 'open-change-password-modal', (_event, element) => {
        const owner = element.dataset.owner
        if (owner) ownerFinance.openChangePasswordModal(owner)
      })
      ui.on('click', 'close-revenue-modal', () => {
        ownerFinance.closeRevenueModal()
      })
      ui.on('click', 'select-owner-finance-day', (_event, element) => {
        const year = Number(element.dataset.year || '')
        const month = Number(element.dataset.month || '')
        const day = Number(element.dataset.day || '')
        if ([year, month, day].some(Number.isNaN)) return
        document.querySelectorAll('#finCalendarGrid .calendar-day').forEach((item) => {
          item.classList.remove('active')
        })
        element.classList.add('active')
        ownerFinance.showOwnerDetailedOrders(year, month, day)
        const specificBtn = document.getElementById('finBtnSpecific')
        if (specificBtn) {
          const mm = String(month + 1).padStart(2, '0')
          const dd = String(day).padStart(2, '0')
          specificBtn.innerText = `${String(year).slice(2)}-${mm}-${dd}`
          specificBtn.dataset.date = `${year}-${mm}-${dd}`
          specificBtn.style.display = 'inline-block'
          void ownerFinance.updateFinanceStats('specific', new Date(year, month, day))
        }
      })
      ui.on('click', 'archived-order-readonly', () => {
        alert('此介面僅供查帳')
      })
      ui.on('click', 'download-sync-log', () => {
        downloadSyncLog(kernel.state.syncLog)
      })
      ui.on('click', 'download-local-storage', () => {
        alert('localStorage 匯出已移除')
      })
      ui.on('click', 'clear-all-data', () => {
        const modal = document.getElementById('summaryModal')
        if (modal) modal.style.display = 'flex'
      })
      ui.on('click', 'close-summary-modal', () => {
        closeSummaryModal()
      })
      ui.on('click', 'confirm-clear-data', () => {
        alert('清空所有資料功能目前停用')
        closeSummaryModal()
      })
      ui.on('click', 'toggle-accordion', (_event, element) => {
        const id = element.dataset.id
        if (id) toggleAccordion(id)
      })
      ui.on('change', 'finance-date-range', () => {
        void ownerFinance.updateFinanceStats('custom')
      })
      ui.on('change', 'toggle-stock-status', (_event, element) => {
        if (!(element instanceof HTMLInputElement)) return
        const itemId = element.dataset.name
        if (itemId) void data.toggleStockStatus(itemId, element.checked)
      })
      ui.on('change', 'toggle-inventory-batch', (_event, element) => {
        if (!(element instanceof HTMLInputElement)) return
        const keys = (element.dataset.batchKeys || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
        if (keys.length === 0) return
        void data.toggleInventoryBatch(Object.fromEntries(keys.map((key) => [key, element.checked])))
      })
      ui.on('change', 'toggle-option-stock', (_event, element) => {
        if (!(element instanceof HTMLInputElement)) return
        const name = element.dataset.name
        const option = element.dataset.option
        if (name && option) void data.toggleOptionStock(name, option, element.checked)
      })
      ui.on('change', 'update-item-data', (_event, element) => {
        if (!(element instanceof HTMLInputElement)) return
        const name = element.dataset.name
        const type = element.dataset.type
        if (name && type) void data.updateItemData(name, type, element.value)
      })

      ui.registerHideHook(() => {
        ownerFinance.stopAllWatches()
      })

      const service: PosAdminService = {
        updateFinancialPage: ownerFinance.updateFinancialPage,
        renderConfidentialCalendar: ownerFinance.renderConfidentialCalendar,
        stopAllWatches: ownerFinance.stopAllWatches,
        renderProductManagement() {
          renderProductManagement({
            inventory: () => kernel.state.inventory,
            menuData: kernel.menuData,
          })
        },
        downloadSyncLog() {
          downloadSyncLog(kernel.state.syncLog)
        },
        downloadLocalStorage() {
          alert('localStorage 匯出已移除')
        },
        closeSummaryModal,
      }

      context.registerService(POS_ADMIN_SERVICE_KEY, service)
      context.registerService('pos-admin', {
        ...service,
        ...ownerFinance,
      })
    },
  }
}
