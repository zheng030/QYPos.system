import type { AppContext, FeatureRuntime } from '@/app/app-context'
import { POS_DATA_SERVICE_KEY, type PosDataService } from '@/features/pos-data/service'
import { POS_KERNEL_SERVICE_KEY, type PosKernelService } from '@/features/pos-kernel/service'
import { POS_UI_SERVICE_KEY, type PosUiService } from '@/features/pos-shell/service'
import { CHECKIN_PAGE_SERVICE_KEY, type CheckinPageService } from '@/shared/checkin-page-service'
import { renderQrCode } from '@/shared/qrcode'
import { createMenuModalModule } from './menu-modals'
import { POS_SALES_SERVICE_KEY, type PosSalesService } from './service'
import { createServiceFlowModule } from './service-flow'
import { createWorkspaceUiModule } from './workspace-ui'

let booted = false

export function createPosSalesFeature(context: AppContext): FeatureRuntime {
  return {
    id: 'pos-sales',
    dependsOn: ['pos-data', 'pos-shell'],
    async boot() {
      if (booted) {
        return
      }

      const kernel = context.getService<PosKernelService>(POS_KERNEL_SERVICE_KEY)
      const data = context.getService<PosDataService>(POS_DATA_SERVICE_KEY)
      const ui = context.getService<PosUiService>(POS_UI_SERVICE_KEY)
      const hideAllHooks = context.getService<Set<() => void>>('pos-shell-hide-hooks')
      if (!kernel || !data || !ui || !hideAllHooks) {
        throw new Error('POS sales dependencies are not ready')
      }

      booted = true

      let addToCart: ReturnType<typeof createServiceFlowModule>['addToCart']

      const workspaceUi = createWorkspaceUiModule({
        state: kernel.state,
        tables: kernel.tables,
        categories: kernel.categories,
        menuData: kernel.menuData,
        hideAllHooks,
        hideAll: ui.hideAll,
        showHome: ui.showHome,
        activatePage: ui.activatePage,
        renderQrCode,
        hasAvailableVariants: kernel.helpers.hasAvailableVariants,
        shouldHideCustomerItemName: kernel.orderUtils.shouldHideCustomerItemName,
        getMergedItems: kernel.orderUtils.getMergedItems,
        ensureDataSubscriptions: data.ensureDataSubscriptions,
        initRealtimeData: data.initRealtimeData,
        saveAllToCloud: data.saveAllToCloud,
        showToast: ui.showToast,
        setCurrentCategory(category) {
          kernel.state.currentCategory = category
        },
      })

      const serviceFlow = createServiceFlowModule({
        state: kernel.state,
        db: kernel.db,
        menuData: kernel.menuData,
        getBusinessDate: kernel.dates.getBusinessDate,
        getDateFromOrder: kernel.dates.getDateFromOrder,
        getDeltaItems: kernel.orderUtils.getDeltaItems,
        getItemCategoryType: kernel.helpers.getItemCategoryType,
        getTodayMaxBaseSeq: data.getTodayMaxBaseSeq,
        stripHiddenTag: kernel.orderUtils.stripHiddenTag,
        ensureRoots: data.ensureRoots,
        saveAllToCloud: data.saveAllToCloud,
        renderCart: workspaceUi.renderCart,
        openTableSelect: workspaceUi.openTableSelect,
        goHome: workspaceUi.goHome,
        closeIncomingOrderModal: workspaceUi.closeIncomingOrderModal,
        checkIncomingOrders: data.checkIncomingOrders,
        closeCheckoutModal() {
          menuModals.closeCheckoutModal()
        },
        getShowToast: () => ui.showToast,
      })
      addToCart = serviceFlow.addToCart

      const menuModals = createMenuModalModule({
        state: kernel.state,
        itemPrices: () => kernel.state.itemPrices,
        foodOptionVariants: kernel.foodOptionVariants,
        getAvailableVariants: kernel.helpers.getAvailableVariants,
        getMergedItems: kernel.orderUtils.getMergedItems,
        getAddToCart: () => addToCart,
        calcSplitTotal: serviceFlow.calcSplitTotal,
        checkoutAll: serviceFlow.checkoutAll,
        printReceipt: serviceFlow.printReceipt,
        renderCart: workspaceUi.renderCart,
      })

      ui.on('click', 'check-login', () => {
        void data.checkLogin()
      })
      ui.on('click', 'open-table-select', () => {
        void workspaceUi.openTableSelect()
      })
      ui.on('click', 'select-table', (_event, element) => {
        const table = element.dataset.table
        if (!table) return
        if (kernel.state.isQrMode) {
          workspaceUi.showQrModal(table)
          workspaceUi.toggleQrMode()
          return
        }
        void workspaceUi.openOrderPageLogic(table)
      })
      ui.on('click', 'open-checkin-page', () => {
        context.getService<CheckinPageService>(CHECKIN_PAGE_SERVICE_KEY)?.open()
      })
      ui.on('click', 'go-home', () => {
        workspaceUi.goHome()
      })
      ui.on('click', 'toggle-qr-mode', () => {
        workspaceUi.toggleQrMode()
      })
      ui.on('click', 'save-and-exit', () => {
        void serviceFlow.saveAndExit()
      })
      ui.on('click', 'toggle-cart-view', () => {
        workspaceUi.toggleCartView()
      })
      ui.on('click', 'toggle-service-fee', () => {
        workspaceUi.toggleServiceFee()
      })
      ui.on('click', 'open-menu-category', (_event, element) => {
        const category = element.dataset.category
        if (category) workspaceUi.openItems(category)
      })
      ui.on('click', 'build-categories', () => {
        workspaceUi.buildCategories()
      })
      ui.on('click', 'add-inline-hidden-beer', () => {
        menuModals.addInlineHiddenBeer()
      })
      ui.on('click', 'check-item-type', (_event, element) => {
        const name = element.dataset.name
        const category = element.dataset.category
        const rawPrice = element.dataset.price
        if (!name || !category || rawPrice === undefined) return
        const price = rawPrice.startsWith('"') ? JSON.parse(rawPrice) : Number(rawPrice)
        menuModals.checkItemType(name, Number.isNaN(price) ? rawPrice : price, category)
      })
      ui.on('click', 'add-shot-set', (_event, element) => {
        const name = element.dataset.name
        const price = Number(element.dataset.price || '')
        if (name && !Number.isNaN(price)) {
          menuModals.addShotSet(name, price)
        }
      })
      ui.on('click', 'open-discount-modal', () => {
        menuModals.openDiscountModal()
      })
      ui.on('click', 'save-order-manual', () => {
        void serviceFlow.saveOrderManual()
      })
      ui.on('click', 'open-reprint-modal', () => {
        menuModals.openReprintModal()
      })
      ui.on('click', 'open-payment-modal', () => {
        void menuModals.openPaymentModal()
      })
      ui.on('click', 'open-split-checkout', () => {
        menuModals.openSplitCheckout()
      })
      ui.on('click', 'move-to-pay', (_event, element) => {
        const index = Number(element.dataset.index || '')
        if (!Number.isNaN(index)) menuModals.moveToPay(index)
      })
      ui.on('click', 'remove-from-pay', (_event, element) => {
        const index = Number(element.dataset.index || '')
        if (!Number.isNaN(index)) menuModals.removeFromPay(index)
      })
      ui.on('click', 'toggle-treat', (_event, element) => {
        const index = Number(element.dataset.index || '')
        if (!Number.isNaN(index)) serviceFlow.toggleTreat(index)
      })
      ui.on('click', 'remove-cart-item', (_event, element) => {
        const index = Number(element.dataset.index || '')
        if (!Number.isNaN(index)) serviceFlow.removeItem(index)
      })
      ui.on('click', 'close-payment-modal', () => {
        menuModals.closePaymentModal()
      })
      ui.on('click', 'confirm-checkout', () => {
        void menuModals.confirmCheckout()
      })
      ui.on('click', 'close-checkout-modal', () => {
        menuModals.closeCheckoutModal()
      })
      ui.on('click', 'confirm-payment', () => {
        void serviceFlow.confirmPayment()
      })
      ui.on('click', 'close-reprint-modal', () => {
        menuModals.closeReprintModal()
      })
      ui.on('click', 'confirm-reprint-selection', () => {
        menuModals.confirmReprintSelection()
      })
      ui.on('click', 'close-discount-modal', () => {
        menuModals.closeDiscountModal()
      })
      ui.on('click', 'confirm-discount', () => {
        menuModals.confirmDiscount()
      })
      ui.on('click', 'close-allowance-modal', () => {
        menuModals.closeAllowanceModal()
      })
      ui.on('click', 'confirm-allowance', () => {
        menuModals.confirmAllowance()
      })
      ui.on('click', 'close-food-modal', () => {
        menuModals.closeFoodModal()
      })
      ui.on('click', 'confirm-food-item', () => {
        menuModals.confirmFoodItem()
      })
      ui.on('click', 'close-drink-modal', () => {
        menuModals.closeDrinkModal()
      })
      ui.on('click', 'confirm-drink-item', () => {
        menuModals.confirmDrinkItem()
      })
      ui.on('click', 'toggle-extra-shot', () => {
        menuModals.toggleExtraShot()
      })
      ui.on('click', 'close-custom-modal', () => {
        menuModals.closeCustomModal()
      })
      ui.on('click', 'confirm-custom-item', () => {
        menuModals.confirmCustomItem()
      })
      ui.on('click', 'close-qr-modal', () => {
        workspaceUi.closeQrModal()
      })
      ui.on('click', 'reject-incoming-order', () => {
        void serviceFlow.rejectIncomingOrder()
      })
      ui.on('click', 'confirm-incoming-order', () => {
        void serviceFlow.confirmIncomingOrder()
      })
      ui.on('click', 'customer-submit-order', () => {
        void serviceFlow.customerSubmitOrder()
      })
      ui.on('change', 'toggle-all-reprint', (_event, element) => {
        if (element instanceof HTMLInputElement) {
          menuModals.toggleAllReprint(element)
        }
      })
      ui.on('input', 'calc-final-pay', () => {
        serviceFlow.calcFinalPay()
      })
      ui.on('input', 'calc-split-total', () => {
        serviceFlow.calcSplitTotal()
      })
      ui.on('input', 'discount-preview', () => {
        menuModals.updateDiscPreview()
      })
      ui.on('input', 'custom-alcohol-range', () => {
        const range = document.getElementById('alcoholRange') as HTMLInputElement | null
        const value = document.getElementById('alcoholVal')
        if (range && value) value.innerText = range.value
      })
      ui.on('keydown', 'login-password', (event) => {
        if (!(event instanceof KeyboardEvent) || event.key !== 'Enter') return
        event.preventDefault()
        void data.checkLogin()
      })

      const service: PosSalesService = {
        showApp: workspaceUi.showApp,
        openTableSelect: workspaceUi.openTableSelect,
        goHome: workspaceUi.goHome,
        renderCart: workspaceUi.renderCart,
        renderTableGrid: workspaceUi.renderTableGrid,
        showIncomingOrderModal: workspaceUi.showIncomingOrderModal,
        closeIncomingOrderModal: workspaceUi.closeIncomingOrderModal,
        closeCheckoutModal: menuModals.closeCheckoutModal,
        fixAllOrderIds: serviceFlow.fixAllOrderIds,
      }

      context.registerService(POS_SALES_SERVICE_KEY, service)
      context.registerService('pos-sales', {
        ...service,
        showIncomingOrderModal: workspaceUi.showIncomingOrderModal,
        closeIncomingOrderModal: workspaceUi.closeIncomingOrderModal,
      })

      ui.startRouter()
      await workspaceUi.startCorePosApp()
    },
  }
}
