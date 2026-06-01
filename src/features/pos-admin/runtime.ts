import type { AppContext, FeatureRuntime } from '@/app/app-context'

import { POS_DATA_SERVICE_KEY, type PosDataService } from '@/features/pos-data/service'
import { POS_KERNEL_SERVICE_KEY, type PosKernelService } from '@/features/pos-kernel/service'
import type { PosFinanceMode } from '@/features/pos-kernel/types'
import { toggleAccordion } from '@/features/pos-reporting/ui'
import { POS_UI_SERVICE_KEY, type PosUiService } from '@/features/pos-shell/service'
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
      let stopAdminCatalogWatch: (() => void) | null = null

      booted = true

      const ownerFinance = createOwnerFinanceModule({
        ensureSubscriptions: async () => {
          await data.ensureCatalog()
        },
        getItemCategoryType: kernel.helpers.getItemCategoryType,
        getItemCosts: () => kernel.state.itemCosts,
        getItemPrices: () => kernel.state.itemPrices,
        listClosedOrdersByRange: data.listClosedOrdersByRange,
        loadDailySummariesRange: data.loadDailySummariesRange,
        watchClosedOrdersRange: data.watchClosedOrdersRange,
        watchDailySummariesRange: data.watchDailySummariesRange,
        readDailySummariesRange: data.readDailySummariesRange,
        hideAll: ui.hideAll,
        menuData: kernel.menuData,
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

      function stopAdminWatch() {
        stopAdminCatalogWatch?.()
        stopAdminCatalogWatch = null
      }

      function syncAdminWatch(pageId = ui.getActivePage()) {
        stopAdminWatch()
        if (pageId === 'productPage') {
          stopAdminCatalogWatch = data.watchCatalogRevision((event) => {
            if (!event.changedSegments.includes('inventory')) {
              return
            }
            renderProductManagement({
              inventory: () => kernel.state.inventory,
              menuData: kernel.menuData,
            })
          })
          return
        }

        if (pageId !== 'confidentialPage') {
          ownerFinance.stopAllWatches()
          return
        }

        const title = document.getElementById('confidentialTitle')?.innerText || ''
        stopAdminCatalogWatch = data.watchCatalogRevision((event) => {
          if (title === '成本輸入') {
            if (!event.changedSegments.some((segment) => segment === 'prices' || segment === 'costs')) {
              return
            }
            ownerFinance.updateFinancialPage()
            return
          }

          if (!event.changedSegments.some((segment) => segment === 'prices' || segment === 'costs')) {
            return
          }
          ownerFinance.updateFinancialPage()
        })
      }

      ui.on('click', 'open-finance-page', (_event, element) => {
        const mode = element.dataset.mode
        if (mode === 'cost' || mode === 'finance') {
          void ownerFinance.openFinancePage(mode as PosFinanceMode).then(() => {
            syncAdminWatch('confidentialPage')
          })
        }
      })
      ui.on('click', 'open-settings-page', () => {
        void context.getService<{ openSettingsPage(): Promise<void> }>('pos-sales')?.openSettingsPage?.()
      })
      ui.on('click', 'open-product-page', async () => {
        await openProductPage()
        syncAdminWatch('productPage')
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
      ui.on('click', 'close-revenue-modal', () => {
        ownerFinance.closeRevenueModal()
      })
      ui.on('click', 'select-owner-finance-day', (_event, element) => {
        const bizDateKey = element.dataset.bizDateKey
        if (!bizDateKey) return
        document.querySelectorAll('#finCalendarGrid .calendar-day').forEach((item) => {
          item.classList.remove('active')
        })
        element.classList.add('active')
        ownerFinance.showDetailedOrders(bizDateKey)
        const specificBtn = document.getElementById('finBtnSpecific')
        if (specificBtn) {
          specificBtn.innerText = bizDateKey.slice(2)
          specificBtn.dataset.bizDateKey = bizDateKey
          specificBtn.style.display = 'inline-block'
          void ownerFinance.updateFinanceStats('specific', bizDateKey)
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
        stopAdminWatch()
        ownerFinance.stopAllWatches()
      })

      ui.subscribePage((pageId) => {
        syncAdminWatch(pageId)
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
