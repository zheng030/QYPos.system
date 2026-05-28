import type { AppContext, FeatureRuntime } from '@/app/app-context'

import { POS_DATA_SERVICE_KEY, type PosDataService } from '@/features/pos-data/service'
import { POS_KERNEL_SERVICE_KEY, type PosKernelService } from '@/features/pos-kernel/service'
import { toggleAccordion } from '@/features/pos-reporting/ui'
import { POS_UI_SERVICE_KEY, type PosUiService } from '@/features/pos-shell/service'
import { createOwnerFinanceModule } from './owner-finance'
import { closeSummaryModal, downloadLocalStorage, downloadSyncLog, renderProductManagement } from './product-management'
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

      const kernel = context.getService<PosKernelService>(POS_KERNEL_SERVICE_KEY)
      const data = context.getService<PosDataService>(POS_DATA_SERVICE_KEY)
      const ui = context.getService<PosUiService>(POS_UI_SERVICE_KEY)
      if (!kernel || !data || !ui) {
        throw new Error('POS admin dependencies are not ready')
      }

      booted = true

      const ownerFinance = createOwnerFinanceModule({
        ensureSubscriptions: data.ensureDataSubscriptions,
        getBusinessDate: kernel.dates.getBusinessDate,
        getCostByItemName: kernel.helpers.getCostByItemName,
        getDateFromOrder: kernel.dates.getDateFromOrder,
        getHistoryOrders: () => kernel.state.historyOrders,
        getHistoryViewDate: () => kernel.state.historyViewDate,
        getItemCategoryType: kernel.helpers.getItemCategoryType,
        getItemCosts: () => kernel.state.itemCosts,
        getItemPrices: () => kernel.state.itemPrices,
        getOrdersByDate: data.getOrdersByDate,
        getOwnerPasswords: () => kernel.state.ownerPasswords,
        hideAll: ui.hideAll,
        initHistoryDate: () => {
          const now = new Date()
          if (now.getHours() < 5) now.setDate(now.getDate() - 1)
          kernel.state.historyViewDate = new Date(now)
        },
        menuData: kernel.menuData,
        foodOptionVariants: kernel.foodOptionVariants,
        saveAllToCloud: data.saveAllToCloud,
        setHistoryViewDate(value) {
          kernel.state.historyViewDate = value
        },
        updateItemData: data.updateItemData,
      })

      ui.on('click', 'open-owner-login', (_event, element) => {
        const mode = element.dataset.mode
        if (mode) ownerFinance.openOwnerLogin(mode)
      })
      ui.on('click', 'open-settings-page', () => {
        void context.getService<{ openSettingsPage(): Promise<void> }>('pos-sales')?.openSettingsPage?.()
      })
      ui.on('click', 'open-product-page', async () => {
        await data.ensureDataSubscriptions(['inventory'])
        ui.showPage('productPage')
        renderProductManagement({
          inventory: () => kernel.state.inventory,
          menuData: kernel.menuData,
          foodOptionVariants: kernel.foodOptionVariants,
          hasAvailableVariants: kernel.helpers.hasAvailableVariants,
        })
      })
      ui.on('click', 'check-owner', (_event, element) => {
        const owner = element.dataset.owner
        if (owner) ownerFinance.checkOwner(owner)
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
        ownerFinance.changeOwnerMonth(Number(element.dataset.offset || 0))
      })
      ui.on('click', 'update-finance-stats', (_event, element) => {
        const range = element.dataset.range
        if (range) ownerFinance.updateFinanceStats(range)
      })
      ui.on('click', 'open-revenue-modal', (_event, element) => {
        const type = element.dataset.type
        if (type) ownerFinance.openRevenueModal(type)
      })
      ui.on('click', 'open-change-password-modal', (_event, element) => {
        const owner = element.dataset.owner
        if (owner) ownerFinance.openChangePasswordModal(owner)
      })
      ui.on('click', 'close-finance-detail-modal', () => {
        ownerFinance.closeFinanceDetailModal()
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
          ownerFinance.updateFinanceStats('specific', new Date(year, month, day, 5, 0, 0, 0))
        }
      })
      ui.on('click', 'archived-order-readonly', () => {
        alert('此介面僅供查帳')
      })
      ui.on('click', 'download-sync-log', () => {
        downloadSyncLog(kernel.state.syncLog)
      })
      ui.on('click', 'download-local-storage', () => {
        downloadLocalStorage()
      })
      ui.on('click', 'fix-all-order-ids', () => {
        void data.fixAllOrderIds()
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
        ownerFinance.updateFinanceStats('custom')
      })
      ui.on('change', 'toggle-parent-with-options', (_event, element) => {
        if (!(element instanceof HTMLInputElement)) return
        const name = element.dataset.name
        if (name) void data.toggleParentWithOptions(name, element.checked)
      })
      ui.on('change', 'toggle-stock-status', (_event, element) => {
        if (!(element instanceof HTMLInputElement)) return
        const name = element.dataset.name
        if (name) void data.toggleStockStatus(name, element.checked)
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

      const service: PosAdminService = {
        updateFinancialPage: ownerFinance.updateFinancialPage,
        renderConfidentialCalendar: ownerFinance.renderConfidentialCalendar,
        renderProductManagement() {
          renderProductManagement({
            inventory: () => kernel.state.inventory,
            menuData: kernel.menuData,
            foodOptionVariants: kernel.foodOptionVariants,
            hasAvailableVariants: kernel.helpers.hasAvailableVariants,
          })
        },
        downloadSyncLog() {
          downloadSyncLog(kernel.state.syncLog)
        },
        downloadLocalStorage,
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
