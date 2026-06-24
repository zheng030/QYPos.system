import type { AppContext } from '@/app/app-context'
import { POS_DATA_SERVICE_KEY, type PosDataService } from '@/features/pos-data/service'
import type { PosBuilderState, PosMenuCategoryKey, PosOrderEntry } from '@/features/pos-kernel/types'
import type { PosUiService } from '@/features/pos-shell/service'
import type { CheckinPageService } from '@/shared/checkin-page-service'
import { CHECKIN_PAGE_SERVICE_KEY } from '@/shared/checkin-page-service'

type RuntimeBindingsDeps = {
  context: AppContext
  ui: PosUiService
  kernel: {
    state: {
      currentMode: 'staff' | 'customer'
      menuFilter: {
        activeTab: 'menu' | 'cart' | 'orders'
        activeCategoryKey: PosMenuCategoryKey
      }
      currentBuilder: PosBuilderState | null
      staffWorkspace: {
        expanded: boolean
        serviceFeeEnabled: boolean
      }
    }
  }
  openTableSelect: () => Promise<void>
  goHome: () => void
  openOrderPage: (table: string, options?: { mode?: 'staff' | 'customer' }) => Promise<void>
  toggleQrMode: () => void
  closeQrModal: () => void
  renderMenuCategoryChips: () => void
  renderMenuGrid: () => void
  setOrderTab: (tab: 'menu' | 'cart' | 'orders') => void
  openBuilder: (
    itemId: string,
    target: 'customer-draft' | 'staff-draft' | 'submitted-batch',
    entry?: PosOrderEntry,
    batchId?: string
  ) => void
  editDraftEntry: (entryId: string) => Promise<void>
  removeDraftEntry: (entryId: string) => Promise<void>
  toggleDraftEntryTreat: (entryId: string) => Promise<void>
  confirmClearDraft: () => void
  confirmSubmitDraft: () => void
  openReprintModal: () => Promise<void>
  closeOrderActionConfirmModal: () => void
  confirmPendingOrderAction: () => Promise<void>
  closeBuilder: () => void
  updateBuilderQuantity: (state: PosBuilderState, quantity: number) => PosBuilderState
  updateBuilderSelection: (
    state: PosBuilderState,
    kind: 'main' | 'include' | 'upgrade',
    groupId: string,
    value: string,
    ruleId?: string
  ) => PosBuilderState
  renderBuilder: () => void
  commitBuilder: () => Promise<void>
  openPaymentModal: () => void
  closeCheckoutModal: () => void
  recalcFinalPay: () => void
  checkoutAll: () => Promise<void>
  acceptPendingBatchFromOverlay: () => Promise<void>
  rejectPendingBatchFromOverlay: () => Promise<void>
  editSubmittedBatch: (batchId: string) => Promise<void>
  editSubmittedEntry: (batchId: string, entryId: string) => Promise<void>
  toggleSubmittedEntryTreat: (batchId: string, entryId: string) => Promise<void>
  removeSubmittedEntry: (batchId: string, entryId: string) => Promise<void>
  reprintSubmittedBatch: (batchId: string) => Promise<void>
  updateFloatingActions: () => void
  openStaffDiscountModal: () => void
  closeStaffDiscountModal: () => void
  previewStaffDiscount: () => void
  confirmStaffDiscount: () => void
  resetStaffDiscount: () => void
  saveAndExitStaffOrder: () => Promise<void>
  closeReprintModal: () => void
  confirmReprintSelection: () => Promise<void>
  toggleAllReprint: (checked: boolean) => void
  updateCustomerInfoSilently: () => Promise<void>
  openCloseBusinessModal: () => Promise<void>
  openSplitCheckoutModal: () => void
  checkoutSplitSelection: () => Promise<void>
  recalcSplitTotal: () => void
  closeSplitCheckoutModal: () => void
  moveSplitEntry: (entryId: string, selected: boolean) => void
  closeSummaryModal: () => void
  stopInventoryRevisionWatch: () => void
  syncInventoryRevisionWatch: () => void
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

let closeImagePreviewKeydown: ((event: KeyboardEvent) => void) | null = null

function closeImagePreview() {
  const host = document.getElementById('imagePreviewHost')
  if (host) {
    host.innerHTML = ''
  }
  if (closeImagePreviewKeydown) {
    document.removeEventListener('keydown', closeImagePreviewKeydown)
    closeImagePreviewKeydown = null
  }
}

function openImagePreview(imageUrl: string, imageAlt: string) {
  const host = document.getElementById('imagePreviewHost')
  if (!host) return
  closeImagePreview()
  host.innerHTML = `
    <div class="image-preview-backdrop show" data-action="close-image-preview" role="dialog" aria-modal="true" aria-label="${escapeHtml(imageAlt)}大圖">
      <div class="image-preview-sheet" data-image-preview-sheet>
        <button class="image-preview-close btn-effect" type="button" data-action="close-image-preview" aria-label="關閉圖片">×</button>
        <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(imageAlt)}">
      </div>
    </div>
  `
  closeImagePreviewKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      closeImagePreview()
    }
  }
  document.addEventListener('keydown', closeImagePreviewKeydown)
}

export function registerPosSalesBindings({
  context,
  ui,
  kernel,
  openTableSelect,
  goHome,
  openOrderPage,
  toggleQrMode,
  closeQrModal,
  renderMenuCategoryChips,
  renderMenuGrid,
  setOrderTab,
  openBuilder,
  editDraftEntry,
  removeDraftEntry,
  toggleDraftEntryTreat,
  confirmClearDraft,
  confirmSubmitDraft,
  openReprintModal,
  closeOrderActionConfirmModal,
  confirmPendingOrderAction,
  closeBuilder,
  updateBuilderQuantity,
  updateBuilderSelection,
  renderBuilder,
  commitBuilder,
  openPaymentModal,
  closeCheckoutModal,
  recalcFinalPay,
  checkoutAll,
  acceptPendingBatchFromOverlay,
  rejectPendingBatchFromOverlay,
  editSubmittedBatch,
  editSubmittedEntry,
  toggleSubmittedEntryTreat,
  removeSubmittedEntry,
  reprintSubmittedBatch,
  updateFloatingActions,
  openStaffDiscountModal,
  closeStaffDiscountModal,
  previewStaffDiscount,
  confirmStaffDiscount,
  resetStaffDiscount,
  saveAndExitStaffOrder,
  closeReprintModal,
  confirmReprintSelection,
  toggleAllReprint,
  updateCustomerInfoSilently,
  openCloseBusinessModal,
  openSplitCheckoutModal,
  checkoutSplitSelection,
  recalcSplitTotal,
  closeSplitCheckoutModal,
  moveSplitEntry,
  closeSummaryModal,
  stopInventoryRevisionWatch,
  syncInventoryRevisionWatch,
}: RuntimeBindingsDeps) {
  ui.on('click', 'check-login', () => {
    void context.getService<PosDataService>(POS_DATA_SERVICE_KEY)?.checkLogin()
  })
  ui.on('keydown', 'login-password', (event) => {
    if (!(event instanceof KeyboardEvent) || event.key !== 'Enter') return
    event.preventDefault()
    void context.getService<PosDataService>(POS_DATA_SERVICE_KEY)?.checkLogin()
  })
  ui.on('click', 'open-table-select', () => {
    void openTableSelect()
  })
  ui.on('click', 'toggle-qr-mode', () => {
    toggleQrMode()
  })
  ui.on('click', 'close-qr-modal', () => {
    closeQrModal()
  })
  ui.on('click', 'select-table', (_event, element) => {
    const table = element.dataset.table
    if (table) {
      void openOrderPage(table, { mode: 'staff' })
    }
  })
  ui.on('click', 'open-checkin-page', () => {
    context.getService<CheckinPageService>(CHECKIN_PAGE_SERVICE_KEY)?.open()
  })
  ui.on('click', 'go-home', () => {
    context.getService<PosDataService>(POS_DATA_SERVICE_KEY)?.stopTableLiveSession()
    goHome()
  })
  ui.on('click', 'save-and-exit', () => {
    context.getService<PosDataService>(POS_DATA_SERVICE_KEY)?.stopTableLiveSession()
    void openTableSelect()
  })
  ui.on('click', 'open-menu-category', (_event, element) => {
    const category = element.dataset.category as PosMenuCategoryKey | undefined
    if (!category) return
    kernel.state.menuFilter.activeCategoryKey = category
    renderMenuCategoryChips()
    renderMenuGrid()
  })
  ui.on('click', 'set-order-tab', (_event, element) => {
    const tab = element.dataset.tab as 'menu' | 'cart' | 'orders' | undefined
    if (!tab) return
    setOrderTab(tab)
  })
  ui.on('click', 'go-cart-tab', () => {
    setOrderTab('cart')
  })
  ui.on('click', 'select-menu-item', (_event, element) => {
    const itemId = element.dataset.itemId
    if (!itemId) return
    openBuilder(itemId, kernel.state.currentMode === 'customer' ? 'customer-draft' : 'staff-draft')
  })
  ui.on('click', 'open-image-preview', (event, element) => {
    event.preventDefault()
    event.stopPropagation()
    const imageUrl = element.dataset.imageUrl
    if (!imageUrl) return
    openImagePreview(imageUrl, element.dataset.imageAlt || '商品圖片')
  })
  ui.on('click', 'close-image-preview', (event) => {
    const target = event.target
    if (
      target instanceof HTMLElement &&
      target.closest('[data-image-preview-sheet]') &&
      target.dataset.action !== 'close-image-preview'
    ) {
      return
    }
    closeImagePreview()
  })
  ui.on('click', 'edit-draft-entry', (_event, element) => {
    const entryId = element.dataset.entryId
    if (entryId) {
      void editDraftEntry(entryId)
    }
  })
  ui.on('click', 'remove-draft-entry', (_event, element) => {
    const entryId = element.dataset.entryId
    if (entryId) {
      void removeDraftEntry(entryId)
    }
  })
  ui.on('click', 'toggle-draft-entry-treat', (_event, element) => {
    const entryId = element.dataset.entryId
    if (entryId) {
      void toggleDraftEntryTreat(entryId)
    }
  })
  ui.on('click', 'discard-customer-draft', () => {
    confirmClearDraft()
  })
  ui.on('click', 'clear-staff-draft', () => {
    confirmClearDraft()
  })
  ui.on('click', 'submit-active-draft', () => {
    confirmSubmitDraft()
  })
  ui.on('click', 'floating-clear-action', () => {
    if (kernel.state.menuFilter.activeTab === 'orders') {
      void openReprintModal()
      return
    }
    confirmClearDraft()
  })
  ui.on('click', 'floating-primary-action', () => {
    if (kernel.state.menuFilter.activeTab === 'orders') {
      openPaymentModal()
      return
    }
    confirmSubmitDraft()
  })
  ui.on('click', 'close-order-action-confirm', () => {
    closeOrderActionConfirmModal()
  })
  ui.on('click', 'confirm-order-action', () => {
    void confirmPendingOrderAction()
  })
  ui.on('click', 'builder-cancel', () => {
    closeBuilder()
  })
  ui.on('click', 'builder-adjust-qty', (_event, element) => {
    const delta = Number.parseInt(element.dataset.delta || '0', 10)
    if (!kernel.state.currentBuilder || Number.isNaN(delta)) return
    kernel.state.currentBuilder = updateBuilderQuantity(
      kernel.state.currentBuilder,
      kernel.state.currentBuilder.quantity + delta
    )
    renderBuilder()
  })
  ui.on('change', 'builder-set-qty', (event) => {
    if (!(event.target instanceof HTMLInputElement) || !kernel.state.currentBuilder) return
    const quantity = Number.parseInt(event.target.value || '1', 10)
    kernel.state.currentBuilder = updateBuilderQuantity(kernel.state.currentBuilder, quantity)
    renderBuilder()
  })
  ui.on('click', 'builder-select-main', (_event, element) => {
    const ruleId = element.dataset.ruleId
    const value = element.dataset.value
    if (!kernel.state.currentBuilder || !ruleId || value == null) return
    kernel.state.currentBuilder = updateBuilderSelection(kernel.state.currentBuilder, 'main', ruleId, value)
    renderBuilder()
  })
  ui.on('input', 'builder-select-main', (event, element) => {
    if (!(event.target instanceof HTMLInputElement) || !kernel.state.currentBuilder) return
    const ruleId = element.dataset.ruleId
    if (!ruleId) return
    kernel.state.currentBuilder = updateBuilderSelection(
      kernel.state.currentBuilder,
      'main',
      ruleId,
      event.target.value
    )
  })
  ui.on('click', 'builder-select-upgrade', (_event, element) => {
    const groupId = element.dataset.groupId
    const value = element.dataset.value
    if (!kernel.state.currentBuilder || !groupId || value == null) return
    kernel.state.currentBuilder = updateBuilderSelection(kernel.state.currentBuilder, 'upgrade', groupId, value)
    renderBuilder()
  })
  ui.on('click', 'builder-select-include', (_event, element) => {
    const includeId = element.dataset.includeId
    const ruleId = element.dataset.ruleId
    const value = element.dataset.value
    if (!kernel.state.currentBuilder || !includeId || !ruleId || value == null) return
    kernel.state.currentBuilder = updateBuilderSelection(
      kernel.state.currentBuilder,
      'include',
      includeId,
      value,
      ruleId
    )
    renderBuilder()
  })
  ui.on('input', 'builder-select-include', (event, element) => {
    if (!(event.target instanceof HTMLInputElement) || !kernel.state.currentBuilder) return
    const includeId = element.dataset.includeId
    const ruleId = element.dataset.ruleId
    if (!includeId || !ruleId) return
    kernel.state.currentBuilder = updateBuilderSelection(
      kernel.state.currentBuilder,
      'include',
      includeId,
      event.target.value,
      ruleId
    )
  })
  ui.on('click', 'builder-confirm', () => {
    void commitBuilder()
  })
  ui.on('click', 'open-payment-modal', () => {
    openPaymentModal()
  })
  ui.on('click', 'close-payment-modal', () => {
    closeCheckoutModal()
  })
  ui.on('input', 'calc-final-pay', () => {
    recalcFinalPay()
  })
  ui.on('click', 'confirm-checkout', () => {
    void checkoutAll()
  })
  ui.on('click', 'accept-pending-batch', () => {
    void acceptPendingBatchFromOverlay()
  })
  ui.on('click', 'reject-pending-batch', () => {
    void rejectPendingBatchFromOverlay()
  })
  ui.on('click', 'edit-submitted-batch', (_event, element) => {
    const batchId = element.dataset.batchId
    if (batchId) {
      void editSubmittedBatch(batchId)
    }
  })
  ui.on('click', 'edit-submitted-entry', (_event, element) => {
    const batchId = element.dataset.batchId
    const entryId = element.dataset.entryId
    if (batchId && entryId) {
      void editSubmittedEntry(batchId, entryId)
    }
  })
  ui.on('click', 'toggle-submitted-entry-treat', (_event, element) => {
    const batchId = element.dataset.batchId
    const entryId = element.dataset.entryId
    if (batchId && entryId) {
      void toggleSubmittedEntryTreat(batchId, entryId)
    }
  })
  ui.on('click', 'remove-submitted-entry', (_event, element) => {
    const batchId = element.dataset.batchId
    const entryId = element.dataset.entryId
    if (batchId && entryId) {
      void removeSubmittedEntry(batchId, entryId)
    }
  })
  ui.on('click', 'reprint-submitted-batch', (_event, element) => {
    const batchId = element.dataset.batchId
    if (batchId) {
      void reprintSubmittedBatch(batchId)
    }
  })
  ui.on('click', 'open-reprint-modal', () => {
    void openReprintModal()
  })
  ui.on('click', 'toggle-staff-workspace', () => {
    kernel.state.staffWorkspace.expanded = !kernel.state.staffWorkspace.expanded
    updateFloatingActions()
  })
  ui.on('keydown', 'toggle-staff-workspace', (event) => {
    if (!(event instanceof KeyboardEvent) || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    kernel.state.staffWorkspace.expanded = !kernel.state.staffWorkspace.expanded
    updateFloatingActions()
  })
  ui.on('click', 'toggle-staff-service-fee', () => {
    kernel.state.staffWorkspace.serviceFeeEnabled = !kernel.state.staffWorkspace.serviceFeeEnabled
    updateFloatingActions()
  })
  ui.on('click', 'open-staff-discount-modal', () => {
    openStaffDiscountModal()
  })
  ui.on('click', 'close-staff-discount-modal', () => {
    closeStaffDiscountModal()
  })
  ui.on('input', 'preview-staff-discount', () => {
    previewStaffDiscount()
  })
  ui.on('click', 'confirm-staff-discount', () => {
    confirmStaffDiscount()
  })
  ui.on('click', 'reset-staff-discount', () => {
    resetStaffDiscount()
  })
  ui.on('click', 'staff-save-and-exit', () => {
    void saveAndExitStaffOrder()
  })
  ui.on('click', 'close-reprint-modal', () => {
    closeReprintModal()
  })
  ui.on('click', 'confirm-reprint-selection', () => {
    void confirmReprintSelection()
  })
  ui.on('change', 'toggle-all-reprint', (_event, element) => {
    if (!(element instanceof HTMLInputElement)) return
    toggleAllReprint(element.checked)
  })
  ui.on('input', 'customer-info-input', () => {
    void updateCustomerInfoSilently()
  })
  ui.on('click', 'close-business', () => {
    void openCloseBusinessModal()
  })
  ui.on('click', 'open-split-checkout', () => {
    openSplitCheckoutModal()
  })
  ui.on('click', 'confirm-payment', () => {
    void checkoutSplitSelection()
  })
  ui.on('input', 'calc-split-total', () => {
    recalcSplitTotal()
  })
  ui.on('click', 'close-checkout-modal', () => {
    closeSplitCheckoutModal()
  })
  ui.on('click', 'move-to-paying', (_event, element) => {
    const entryId = element.dataset.entryId
    if (entryId) moveSplitEntry(entryId, true)
  })
  ui.on('click', 'move-to-unpaid', (_event, element) => {
    const entryId = element.dataset.entryId
    if (entryId) moveSplitEntry(entryId, false)
  })
  ui.on('click', 'close-summary-modal', () => {
    closeSummaryModal()
  })
  ui.on('click', 'confirm-clear-data', () => {
    closeSummaryModal()
  })

  ui.registerHideHook(() => {
    context.getService<PosDataService>(POS_DATA_SERVICE_KEY)?.stopTableLiveSession()
    stopInventoryRevisionWatch()
  })

  ui.subscribePage((pageId) => {
    if (pageId !== 'orderPage') {
      context.getService<PosDataService>(POS_DATA_SERVICE_KEY)?.stopTableLiveSession()
    }
    syncInventoryRevisionWatch()
  })
}
