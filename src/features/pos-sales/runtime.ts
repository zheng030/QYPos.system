import type { AppContext, FeatureRuntime } from '@/app/app-context'
import { POS_DATA_SERVICE_KEY, type PosDataService } from '@/features/pos-data/service'
import { POS_KERNEL_SERVICE_KEY, type PosKernelService } from '@/features/pos-kernel/service'
import type { PosMenuCategoryKey, PosOrderBatch } from '@/features/pos-kernel/types'
import { POS_UI_SERVICE_KEY, type PosUiService } from '@/features/pos-shell/service'
import { createPosSalesActionsModule } from './runtime-actions'
import { registerPosSalesBindings } from './runtime-bindings'
import { createPosSalesNavigationModule } from './runtime-navigation'
import { createPosSalesOrderUiModule } from './runtime-order-ui'
import { createPosSalesWorkspaceModule } from './runtime-workspace'
import { POS_SALES_SERVICE_KEY, type PosSalesService } from './service'

let booted = false

type PendingOverlayState = {
  requestKey: string | null
  loading: boolean
  batch: PosOrderBatch | null
  error: string | null
}

type SplitCheckoutState = {
  selectedEntryIds: Set<string>
}

export function createPosSalesFeature(context: AppContext): FeatureRuntime {
  return {
    id: 'pos-sales',
    dependsOn: ['pos-data', 'pos-shell'],
    async boot() {
      if (booted) {
        return
      }

      const maybeKernel = context.getService<PosKernelService>(POS_KERNEL_SERVICE_KEY)
      const maybeData = context.getService<PosDataService>(POS_DATA_SERVICE_KEY)
      const maybeUi = context.getService<PosUiService>(POS_UI_SERVICE_KEY)
      if (!maybeKernel || !maybeData || !maybeUi) {
        throw new Error('POS sales dependencies are not ready')
      }
      const kernel = maybeKernel
      const data = maybeData
      const ui = maybeUi

      booted = true
      const defaultCategory = kernel.categories[0] as PosMenuCategoryKey
      const splitCheckoutState: SplitCheckoutState = {
        selectedEntryIds: new Set<string>(),
      }
      const pendingOverlayState: PendingOverlayState = {
        requestKey: null,
        loading: false,
        batch: null,
        error: null,
      }
      let stopCatalogRevisionWatch: (() => void) | null = null

      function currentTable() {
        if (!kernel.state.selectedTable) {
          throw new Error('No selected table')
        }
        return kernel.state.selectedTable
      }

      function maybeCurrentTable() {
        return kernel.state.selectedTable
      }

      function isCustomerMode() {
        return kernel.state.currentMode === 'customer'
      }

      function currentDraftEntries() {
        if (kernel.state.currentMode === 'staff') {
          const table = maybeCurrentTable()
          return table ? kernel.state.staffDrafts[table] || [] : []
        }
        return kernel.state.activeDraftEntries
      }

      function readCustomerInfo() {
        const currentInfo = kernel.state.selectedTable
          ? kernel.state.tableCustomers[kernel.state.selectedTable] || {}
          : {}
        const nameInput = document.getElementById('custName') as HTMLInputElement | null
        const phoneInput = document.getElementById('custPhone') as HTMLInputElement | null
        return {
          name: nameInput?.value.trim() || String(currentInfo.name || ''),
          phone: phoneInput?.value.trim() || String(currentInfo.phone || ''),
          orderId: currentInfo.orderId,
        }
      }

      let updateFloatingActions = () => {}
      function setOrderTab(tab: 'menu' | 'cart' | 'orders') {
        kernel.state.menuFilter.activeTab = tab
        document.querySelectorAll<HTMLElement>('#orderToolbarTabs [data-action="set-order-tab"]').forEach((button) => {
          button.classList.toggle('active', button.dataset.tab === tab)
        })
        document.querySelectorAll<HTMLElement>('[data-order-panel]').forEach((panel) => {
          const isActive = panel.dataset.orderPanel === tab
          panel.classList.toggle('is-active', isActive)
        })
        updateFloatingActions()
      }

      const orderUi = createPosSalesOrderUiModule({
        kernel,
        data,
        defaultCategory,
        currentDraftEntries,
        isCustomerMode,
        pendingOverlayState,
        setOrderTab,
        updateFloatingActions: () => updateFloatingActions(),
        updatePanelCopy: () => workspace.updatePanelCopy(),
        setCustomerBoxVisibility: () => workspace.setCustomerBoxVisibility(),
        getDisplaySummary: (entry) => workspace.getDisplaySummary(entry),
        renderEntrySubtitleLines: (lines) => workspace.renderEntrySubtitleLines(lines),
      })

      const workspace = createPosSalesWorkspaceModule({
        kernel,
        data,
        ui,
        defaultCategory,
        currentDraftEntries,
        isCustomerMode,
        getStopCatalogRevisionWatch: () => stopCatalogRevisionWatch,
        setStopCatalogRevisionWatch: (stop) => {
          stopCatalogRevisionWatch = stop
        },
        renderMenuGrid: () => orderUi.renderMenuGrid(),
        renderCart: () => orderUi.renderCart(),
      })
      updateFloatingActions = workspace.updateFloatingActions

      const navigation = createPosSalesNavigationModule({
        kernel,
        data,
        maybeCurrentTable,
        currentDraftEntries,
        readCustomerInfo,
      })

      async function showApp(options: { skipHome?: boolean; skipStaffLive?: boolean } = {}) {
        const loginScreen = document.getElementById('login-screen')
        const appContainer = document.getElementById('app-container')
        if (loginScreen) loginScreen.style.display = 'none'
        if (appContainer) appContainer.style.display = 'block'
        navigation.startClock()
        if (!options.skipStaffLive) {
          await data.startStaffLive()
        }
        if (!options.skipHome) {
          ui.showHome()
        }
      }

      async function renderTableGrid() {
        const grid = document.getElementById('tableSelectGrid')
        if (!grid) {
          throw new Error('Missing #tableSelectGrid')
        }
        grid.innerHTML = ''
        kernel.tables.forEach((table) => {
          const status = kernel.state.tableStatuses[table]
          const className = status === 'yellow' ? 'status-yellow' : status === 'red' ? 'status-red' : 'status-white'
          grid.innerHTML += `<div class="tableBtn btn-effect ${className}" data-action="select-table" data-table="${table}"><b>${table}</b></div>`
        })
      }

      async function openTableSelect() {
        orderUi.closeBuilder()
        workspace.resetStaffWorkspaceState()
        ui.hideAll()
        ui.activatePage('tableSelect')
        await renderTableGrid()
      }

      async function openSettingsPage() {
        ui.hideAll()
        await data.ensureOwnerAuth()
        ui.activatePage('settingsPage')
      }

      function goHome() {
        orderUi.closeBuilder()
        ui.showHome()
      }

      async function openOrderPage(table: string, options: { mode?: 'staff' | 'customer' } = {}) {
        const mode = options.mode || kernel.state.currentMode
        if (kernel.state.isQrMode && mode !== 'customer') {
          await navigation.showQrModal(table)
          return
        }
        workspace.setCustomerMode(mode)
        if (mode === 'staff') {
          workspace.resetStaffWorkspaceState()
        }
        const seatLabel = document.getElementById('seatLabel')
        if (seatLabel) {
          seatLabel.innerText = `（${table}）`
        }
        kernel.state.menuFilter.activeCategoryKey = defaultCategory
        kernel.state.menuFilter.activeTab = 'menu'
        orderUi.closeBuilder()
        ui.hideAll()
        ui.activatePage('orderPage')
        await data.ensureCatalog()
        await data.startTableLiveSession(mode, table)
        workspace.syncCustomerInputs()
        workspace.setCustomerBoxVisibility()
        workspace.updatePanelCopy()
        workspace.renderMenuCategoryChips()
        orderUi.renderCart()
      }

      const actions = createPosSalesActionsModule({
        kernel,
        data,
        pendingOverlayState,
        splitCheckoutState,
        currentTable,
        isCustomerMode,
        currentDraftEntries,
        readCustomerInfo,
        setOrderTab,
        currentStaffDiscountPercent: workspace.currentStaffDiscountPercent,
        currentSubmittedTotal: workspace.currentSubmittedTotal,
        isEntryTreat: workspace.isEntryTreat,
        flattenBatchLines: (batch) => workspace.flattenBatchLines(batch),
        updateFloatingActions: workspace.updateFloatingActions,
        resetStaffWorkspaceState: workspace.resetStaffWorkspaceState,
        renderEntrySubtitleLines: workspace.renderEntrySubtitleLines,
        getDisplaySummary: workspace.getDisplaySummary,
        closeBuilder: orderUi.closeBuilder,
        renderBuilder: orderUi.renderBuilder,
        openBuilder: orderUi.openBuilder,
        renderCart: orderUi.renderCart,
        openTableSelect,
        showQrModal: navigation.showQrModal,
      })

      registerPosSalesBindings({
        context,
        ui,
        kernel,
        openTableSelect,
        goHome,
        openOrderPage,
        toggleQrMode: navigation.toggleQrMode,
        closeQrModal: navigation.closeQrModal,
        renderMenuGrid: orderUi.renderMenuGrid,
        setOrderTab,
        openBuilder: orderUi.openBuilder,
        editDraftEntry: actions.editDraftEntry,
        removeDraftEntry: actions.removeDraftEntry,
        toggleDraftEntryTreat: actions.toggleDraftEntryTreat,
        confirmClearDraft: actions.confirmClearDraft,
        confirmSubmitDraft: actions.confirmSubmitDraft,
        openReprintModal: actions.openReprintModal,
        closeOrderActionConfirmModal: actions.closeOrderActionConfirmModal,
        confirmPendingOrderAction: actions.confirmPendingOrderAction,
        closeBuilder: orderUi.closeBuilder,
        updateBuilderQuantity: actions.updateBuilderQuantity,
        updateBuilderSelection: actions.updateBuilderSelection,
        renderBuilder: orderUi.renderBuilder,
        commitBuilder: actions.commitBuilder,
        openPaymentModal: actions.openPaymentModal,
        closeCheckoutModal: actions.closeCheckoutModal,
        recalcFinalPay: actions.recalcFinalPay,
        checkoutAll: actions.checkoutAll,
        acceptPendingBatchFromOverlay: actions.acceptPendingBatchFromOverlay,
        rejectPendingBatchFromOverlay: actions.rejectPendingBatchFromOverlay,
        editSubmittedBatch: actions.editSubmittedBatch,
        editSubmittedEntry: actions.editSubmittedEntry,
        toggleSubmittedEntryTreat: actions.toggleSubmittedEntryTreat,
        removeSubmittedEntry: actions.removeSubmittedEntry,
        reprintSubmittedBatch: actions.reprintSubmittedBatch,
        updateFloatingActions: workspace.updateFloatingActions,
        openStaffDiscountModal: actions.openStaffDiscountModal,
        closeStaffDiscountModal: actions.closeStaffDiscountModal,
        previewStaffDiscount: actions.previewStaffDiscount,
        confirmStaffDiscount: actions.confirmStaffDiscount,
        resetStaffDiscount: actions.resetStaffDiscount,
        saveAndExitStaffOrder: actions.saveAndExitStaffOrder,
        closeReprintModal: actions.closeReprintModal,
        confirmReprintSelection: actions.confirmReprintSelection,
        toggleAllReprint: actions.toggleAllReprint,
        updateCustomerInfoSilently: navigation.updateCustomerInfoSilently,
        openCloseBusinessModal: navigation.openCloseBusinessModal,
        openSplitCheckoutModal: actions.openSplitCheckoutModal,
        checkoutSplitSelection: actions.checkoutSplitSelection,
        recalcSplitTotal: actions.recalcSplitTotal,
        closeSplitCheckoutModal: actions.closeSplitCheckoutModal,
        moveSplitEntry: actions.moveSplitEntry,
        closeSummaryModal: navigation.closeSummaryModal,
        stopInventoryRevisionWatch: workspace.stopInventoryRevisionWatch,
        syncInventoryRevisionWatch: workspace.syncInventoryRevisionWatch,
      })

      const service: PosSalesService = {
        showApp,
        openTableSelect,
        openSettingsPage,
        goHome,
        renderMenu() {
          workspace.renderMenuCategoryChips()
          orderUi.renderMenuGrid()
        },
        renderCart: orderUi.renderCart,
        renderTableGrid,
        showPendingBatchOverlay: orderUi.showPendingBatchOverlay,
        closePendingBatchOverlay: orderUi.closePendingBatchOverlay,
        closeCheckoutModal: actions.closeCheckoutModal,
        printReceipt: actions.printReceipt,
      }

      context.registerService(POS_SALES_SERVICE_KEY, service)
      context.registerService('pos-sales', service)

      ui.startRouter()
      const urlParams = new URLSearchParams(location.search)
      const tableParam = urlParams.get('table')
      if (tableParam) {
        sessionStorage.setItem('isLoggedIn', 'true')
        workspace.setCustomerMode('customer')
        await showApp({ skipHome: true, skipStaffLive: true })
        await openOrderPage(decodeURIComponent(tableParam), { mode: 'customer' })
        return
      }

      if (sessionStorage.getItem('isLoggedIn') === 'true') {
        await showApp()
      }
    },
  }
}
