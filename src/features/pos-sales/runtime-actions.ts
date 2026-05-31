import type { PosDataService } from '@/features/pos-data/service'
import type { PosKernelService } from '@/features/pos-kernel/service'
import type { PosBuilderState, PosOrderBatch, PosOrderEntry, PosReceiptData } from '@/features/pos-kernel/types'
import { findElement, requireElement, requireInput } from '@/shared/dom-helpers'
import { finalizeBuilderEntry, updateBuilderQuantity, updateBuilderSelection } from './builder'
import {
  acceptPendingBatchAndPrint,
  buildReceiptMarkup,
  calculateSplitCheckoutTotal,
  calculateStaffOrderTotal,
  getEntryAdjustedAmountDisplay,
  renderAdjustedAmountHtml,
  submitDraftBatch,
  updateSubmittedBatchAndPrint,
} from './runtime-support'
import { cloneEntryWithTreatState, escapeHtml, formatCurrency, formatDateTime } from './runtime-utils'

type PendingOrderAction = null | {
  title: string
  message: string
  confirmText: string
  onConfirm: () => Promise<void>
}

type PendingOverlayState = {
  requestKey: string | null
  loading: boolean
  batch: PosOrderBatch | null
  error: string | null
}

type SplitCheckoutState = {
  selectedEntryIds: Set<string>
}

type RuntimeActionsDeps = {
  kernel: PosKernelService
  data: PosDataService
  pendingOverlayState: PendingOverlayState
  splitCheckoutState: SplitCheckoutState
  currentTable: () => string
  isCustomerMode: () => boolean
  currentDraftEntries: () => PosOrderEntry[]
  readCustomerInfo: () => { name: string; phone: string; orderId: string | number | undefined }
  setOrderTab: (tab: 'menu' | 'cart' | 'orders') => void
  currentStaffDiscountPercent: () => number
  currentSubmittedTotal: () => number
  isEntryTreat: (entry: PosOrderEntry) => boolean
  flattenBatchLines: (batch: PosOrderBatch) => PosReceiptData['lines']
  updateFloatingActions: () => void
  resetStaffWorkspaceState: () => void
  renderEntrySubtitleLines: (lines: Array<{ text: string; className?: string } | null | undefined | false>) => string
  getDisplaySummary: (entry: PosOrderEntry) => ReturnType<PosKernelService['helpers']['buildEntryDisplaySummary']>
  closeBuilder: () => void
  renderBuilder: () => void
  openBuilder: (itemId: string, target: PosBuilderState['target'], entry?: PosOrderEntry, batchId?: string) => void
  renderCart: () => void
  openTableSelect: () => Promise<void>
  showQrModal: (table: string) => Promise<void>
}

export function createPosSalesActionsModule({
  kernel,
  data,
  pendingOverlayState,
  splitCheckoutState,
  currentTable,
  isCustomerMode,
  currentDraftEntries,
  readCustomerInfo,
  setOrderTab,
  currentStaffDiscountPercent,
  currentSubmittedTotal,
  isEntryTreat,
  flattenBatchLines,
  updateFloatingActions,
  resetStaffWorkspaceState,
  renderEntrySubtitleLines,
  getDisplaySummary,
  closeBuilder,
  renderBuilder,
  openBuilder,
  renderCart,
  openTableSelect,
  showQrModal,
}: RuntimeActionsDeps) {
  let pendingOrderAction: PendingOrderAction = null
  let printCleanupTimer: number | null = null
  let removePrintListener: (() => void) | null = null

  async function persistDraft(entries: PosOrderEntry[]) {
    const table = currentTable()
    if (kernel.state.currentMode === 'staff') {
      await data.saveStaffDraft(table, entries)
      return
    }
    await data.saveCustomerDraft(table, entries, readCustomerInfo())
  }

  async function commitBuilder() {
    const builderState = kernel.state.currentBuilder
    if (!builderState) return
    const source = kernel.state.currentMode === 'customer' ? 'customer' : 'staff'
    const status = builderState.target === 'submitted-batch' ? 'accepted' : 'draft'
    const previousEntry =
      builderState.editingEntryId && builderState.target !== 'submitted-batch'
        ? currentDraftEntries().find((entry) => entry.entryId === builderState.editingEntryId)
        : builderState.batchId
          ? kernel.state.activeSubmittedBatches
              .find((batch) => batch.batchId === builderState.batchId)
              ?.entries.find((entry) => entry.entryId === builderState.editingEntryId)
          : null

    const result = finalizeBuilderEntry({
      state: builderState,
      helpers: kernel.helpers,
      source,
      status,
      entryId: builderState.editingEntryId || undefined,
      createdAt: previousEntry?.createdAt,
    })
    if (!result.ok) {
      renderBuilder()
      return
    }

    if (builderState.target === 'submitted-batch' && builderState.batchId) {
      const batch = kernel.state.activeSubmittedBatches.find((candidate) => candidate.batchId === builderState.batchId)
      if (!batch) return
      const entries = batch.entries.map((entry) => (entry.entryId === result.entry.entryId ? result.entry : entry))
      await updateSubmittedBatchAndPrint({
        table: currentTable(),
        batchId: batch.batchId,
        entries,
        updateSubmittedBatch: data.updateSubmittedBatch,
        printKitchenTicket: printKitchenTicketForBatch,
      })
      closeBuilder()
      renderCart()
      return
    }

    const current = currentDraftEntries()
    const next = kernel.helpers.getCanonicalDraftEntries(
      builderState.editingEntryId
        ? current.map((entry) => (entry.entryId === result.entry.entryId ? result.entry : entry))
        : [...current, result.entry]
    )
    await persistDraft(next)
    closeBuilder()
    renderCart()
  }

  function closeOrderActionConfirmModal() {
    pendingOrderAction = null
    const modal = findElement('orderActionConfirmModal')
    if (modal) {
      modal.style.display = 'none'
    }
  }

  function openOrderActionConfirmModal(action: Exclude<PendingOrderAction, null>) {
    pendingOrderAction = action
    const modal = findElement('orderActionConfirmModal')
    const title = findElement('orderActionConfirmTitle')
    const message = findElement('orderActionConfirmMessage')
    const confirmBtn = findElement<HTMLButtonElement>('orderActionConfirmBtn')
    if (title) title.innerText = action.title
    if (message) message.innerText = action.message
    if (confirmBtn) {
      confirmBtn.innerText = action.confirmText
    }
    if (modal) {
      modal.style.display = 'flex'
    }
  }

  async function confirmPendingOrderAction() {
    const action = pendingOrderAction
    closeOrderActionConfirmModal()
    if (!action) return
    await action.onConfirm()
  }

  function confirmClearDraft() {
    openOrderActionConfirmModal({
      title: '清空購物車',
      message: '確定要清空目前購物車內容嗎？',
      confirmText: '確認清空',
      onConfirm: async () => {
        if (kernel.state.currentMode === 'customer') {
          await discardCustomerDraft()
          return
        }
        await clearStaffDraft()
      },
    })
  }

  function confirmSubmitDraft() {
    openOrderActionConfirmModal({
      title: '送出購物車',
      message: '確定要送出目前購物車內容嗎？',
      confirmText: '確認送出',
      onConfirm: submitActiveDraft,
    })
  }

  async function removeDraftEntry(entryId: string) {
    const next = currentDraftEntries().filter((entry) => entry.entryId !== entryId)
    await persistDraft(next)
    renderCart()
  }

  async function toggleDraftEntryTreat(entryId: string) {
    const next = currentDraftEntries().map((entry) => {
      if (entry.entryId !== entryId) {
        return entry
      }
      const treat = !isEntryTreat(entry)
      return cloneEntryWithTreatState(entry, treat)
    })
    await persistDraft(next)
    renderCart()
  }

  async function updateSubmittedEntrySet(batchId: string, buildNext: (entries: PosOrderEntry[]) => PosOrderEntry[]) {
    const batch = kernel.state.activeSubmittedBatches.find((candidate) => candidate.batchId === batchId)
    if (!batch) return
    await data.updateSubmittedBatch(currentTable(), batchId, buildNext(batch.entries))
    renderCart()
  }

  async function toggleSubmittedEntryTreat(batchId: string, entryId: string) {
    await updateSubmittedEntrySet(batchId, (entries) =>
      entries.map((entry) =>
        entry.entryId === entryId ? cloneEntryWithTreatState(entry, !isEntryTreat(entry)) : entry
      )
    )
  }

  async function removeSubmittedEntry(batchId: string, entryId: string) {
    await updateSubmittedEntrySet(batchId, (entries) => entries.filter((entry) => entry.entryId !== entryId))
  }

  async function discardCustomerDraft() {
    await data.discardCustomerDraft(currentTable())
    closeBuilder()
    renderCart()
  }

  async function clearStaffDraft() {
    await data.saveStaffDraft(currentTable(), [])
    closeBuilder()
    renderCart()
  }

  async function saveAndExitStaffOrder() {
    const entries = currentDraftEntries()
    if (entries.length === 0) {
      await openTableSelect()
      return
    }
    await submitDraftBatch({
      mode: 'staff',
      table: currentTable(),
      entries,
      customer: readCustomerInfo(),
      submitCustomerDraft: data.submitCustomerDraft,
      createStaffBatch: data.createStaffBatch,
      printKitchenTicket: printKitchenTicketForBatch,
    })
    closeBuilder()
    resetStaffWorkspaceState()
    await openTableSelect()
  }

  async function submitActiveDraft() {
    const entries = currentDraftEntries()
    if (entries.length === 0) {
      alert('目前沒有可送出的內容')
      return
    }
    await submitDraftBatch({
      mode: kernel.state.currentMode,
      table: currentTable(),
      entries,
      customer: readCustomerInfo(),
      submitCustomerDraft: data.submitCustomerDraft,
      createStaffBatch: data.createStaffBatch,
      printKitchenTicket: printKitchenTicketForBatch,
    })
    closeBuilder()
    if (isCustomerMode()) {
      setOrderTab('orders')
    }
    renderCart()
  }

  async function editDraftEntry(entryId: string) {
    const entry = currentDraftEntries().find((candidate) => candidate.entryId === entryId)
    if (!entry) return
    openBuilder(entry.itemId, kernel.state.currentMode === 'customer' ? 'customer-draft' : 'staff-draft', entry)
  }

  async function editSubmittedBatch(batchId: string) {
    const batch = kernel.state.activeSubmittedBatches.find((candidate) => candidate.batchId === batchId)
    if (!batch || batch.entries.length === 0) return
    const targetEntry = batch.entries[0]
    openBuilder(targetEntry.itemId, 'submitted-batch', targetEntry, batchId)
    if (isCustomerMode()) {
      setOrderTab('orders')
    }
  }

  async function editSubmittedEntry(batchId: string, entryId: string) {
    const batch = kernel.state.activeSubmittedBatches.find((candidate) => candidate.batchId === batchId)
    const targetEntry = batch?.entries.find((entry) => entry.entryId === entryId)
    if (!batch || !targetEntry) return
    openBuilder(targetEntry.itemId, 'submitted-batch', targetEntry, batchId)
    if (isCustomerMode()) {
      setOrderTab('orders')
    }
  }

  async function acceptPendingBatchFromOverlay() {
    const table = kernel.state.currentPendingTable
    const batchId = kernel.state.currentPendingBatchId
    if (!table || !batchId) return
    await acceptPendingBatchAndPrint({
      table,
      batchId,
      acceptPendingBatch: data.acceptPendingBatch,
      printKitchenTicket: printKitchenTicketForBatch,
    })
    pendingOverlayState.requestKey = null
    pendingOverlayState.loading = false
    pendingOverlayState.batch = null
    pendingOverlayState.error = null
    renderCart()
  }

  async function rejectPendingBatchFromOverlay() {
    const table = kernel.state.currentPendingTable
    const batchId = kernel.state.currentPendingBatchId
    if (!table || !batchId) return
    await data.rejectPendingBatch(table, batchId)
    pendingOverlayState.requestKey = null
    pendingOverlayState.loading = false
    pendingOverlayState.batch = null
    pendingOverlayState.error = null
    renderCart()
  }

  function closeCheckoutModal() {
    const modal = findElement('paymentModal')
    if (modal) modal.style.display = 'none'
  }

  function openPaymentModal() {
    const modal = findElement('paymentModal')
    if (!modal) return
    const entries = kernel.state.activeSubmittedBatches.flatMap((batch) => batch.entries)
    const total = entries.reduce((sum, entry) => sum + entry.subtotal, 0)
    const discountPercent = isCustomerMode() ? 0 : currentStaffDiscountPercent()
    const payDiscountRow = findElement('payDiscountRow')
    const payDiscountValue = findElement('payDiscountValue')
    requireElement('payOriginal').innerText = formatCurrency(total)
    requireElement('payOriginal').dataset.amount = String(total)
    requireElement('payDiscLabel').innerText = ''
    requireInput('payServiceFee').checked = isCustomerMode() ? false : kernel.state.staffWorkspace.serviceFeeEnabled
    requireInput('payAllowance').value = '0'
    if (payDiscountRow) {
      payDiscountRow.style.display = discountPercent > 0 ? 'flex' : 'none'
    }
    if (payDiscountValue) {
      payDiscountValue.innerText = discountPercent > 0 ? `${discountPercent}%` : '無'
    }
    requireInput('payFinal').value = String(
      calculateStaffOrderTotal(total, discountPercent, requireInput('payServiceFee').checked)
    )
    modal.style.display = 'flex'
  }

  function closeSplitCheckoutModal() {
    const modal = findElement('checkoutModal')
    if (modal) {
      modal.style.display = 'none'
    }
    splitCheckoutState.selectedEntryIds.clear()
  }

  function getSplitSelectedEntries() {
    const selectedEntries = kernel.state.activeSubmittedBatches.flatMap((batch) =>
      batch.entries.filter((entry) => splitCheckoutState.selectedEntryIds.has(entry.entryId))
    )
    const unpaidEntries = kernel.state.activeSubmittedBatches.flatMap((batch) =>
      batch.entries.filter((entry) => !splitCheckoutState.selectedEntryIds.has(entry.entryId))
    )
    return { selectedEntries, unpaidEntries }
  }

  function renderSplitEntryList(
    entries: PosOrderEntry[],
    action: 'move-to-paying' | 'move-to-unpaid',
    emptyText: string
  ) {
    if (entries.length === 0) {
      return `<div class='entry-card'>${emptyText}</div>`
    }
    return entries
      .map((entry) => {
        const summary = getDisplaySummary(entry)
        const children = entry.lines.filter((line) => line.parentLineId && line.courseKind !== 'drink')
        const totalHtml = renderAdjustedAmountHtml(getEntryAdjustedAmountDisplay(entry))
        return `
          <article class="entry-card">
            <div class="entry-card-head">
              <div>
                <div class="entry-card-title">${escapeHtml(entry.summary.title)}</div>
                ${renderEntrySubtitleLines([
                  { text: entry.summary.quantityLabel },
                  { text: summary.mainSummary },
                  { text: summary.drinkSummary },
                ])}
              </div>
              <div class="entry-card-total">${totalHtml}</div>
            </div>
            ${
              children.length > 0
                ? `<div class="entry-child-list">${children
                    .map(
                      (line) =>
                        `<div class="entry-child-line">${escapeHtml(line.shortName)}${line.selectionSummary ? ` · ${escapeHtml(line.selectionSummary)}` : ''}</div>`
                    )
                    .join('')}</div>`
                : ''
            }
            <div class="entry-card-actions" style="margin-top:12px;">
              <button class="mini-btn primary btn-effect" data-action="${action}" data-entry-id="${escapeHtml(entry.entryId)}">${
                action === 'move-to-paying' ? '加入本次結帳' : '移回未結帳'
              }</button>
            </div>
          </article>
        `
      })
      .join('')
  }

  function recalcSplitTotal() {
    const { selectedEntries } = getSplitSelectedEntries()
    const baseTotal = selectedEntries.reduce((sum, entry) => sum + entry.subtotal, 0)
    const discount = Number.parseFloat(requireInput('splitDisc').value || '0')
    const serviceFeeEnabled = requireInput('splitServiceFee').checked
    const allowance = Number.parseInt(requireInput('splitAllow').value || '0', 10) || 0
    const finalTotal = calculateSplitCheckoutTotal(baseTotal, discount, serviceFeeEnabled, allowance)
    const totalEl = findElement('payTotal')
    if (totalEl) {
      totalEl.innerText = formatCurrency(finalTotal)
    }
    return { baseTotal, finalTotal }
  }

  function renderSplitCheckoutModal() {
    const unpaidList = findElement('unpaidList')
    const payingList = findElement('payingList')
    if (!unpaidList || !payingList) return
    const { selectedEntries, unpaidEntries } = getSplitSelectedEntries()
    unpaidList.innerHTML = renderSplitEntryList(unpaidEntries, 'move-to-paying', '目前沒有未結帳品項')
    payingList.innerHTML = renderSplitEntryList(selectedEntries, 'move-to-unpaid', '尚未選擇本次結帳品項')
    recalcSplitTotal()
  }

  function openSplitCheckoutModal() {
    const entries = kernel.state.activeSubmittedBatches.flatMap((batch) => batch.entries)
    if (entries.length === 0) {
      alert('目前沒有可拆單的訂單紀錄')
      return
    }
    splitCheckoutState.selectedEntryIds.clear()
    requireInput('splitDisc').value = ''
    requireInput('splitAllow').value = ''
    requireInput('splitServiceFee').checked = false
    renderSplitCheckoutModal()
    const modal = findElement('checkoutModal')
    if (modal) {
      modal.style.display = 'flex'
    }
  }

  function moveSplitEntry(entryId: string, selected: boolean) {
    if (selected) {
      splitCheckoutState.selectedEntryIds.add(entryId)
    } else {
      splitCheckoutState.selectedEntryIds.delete(entryId)
    }
    renderSplitCheckoutModal()
  }

  function recalcFinalPay() {
    const original = Number.parseInt(requireElement('payOriginal').dataset.amount || '0', 10) || 0
    const discountPercent = isCustomerMode() ? 0 : currentStaffDiscountPercent()
    const serviceFeeEnabled = requireInput('payServiceFee').checked
    const allowance = Number.parseInt(requireInput('payAllowance').value || '0', 10) || 0
    requireElement('payDiscLabel').innerText =
      discountPercent > 0
        ? `(已套用 ${discountPercent}% 折數${serviceFeeEnabled ? '，含 10% 服務費' : ''})`
        : serviceFeeEnabled
          ? '(含 10% 服務費)'
          : ''
    requireInput('payFinal').value = String(
      calculateStaffOrderTotal(original, discountPercent, serviceFeeEnabled, allowance)
    )
  }

  async function checkoutAll() {
    const entries = kernel.state.activeSubmittedBatches.flatMap((batch) => batch.entries)
    if (entries.length === 0) {
      alert('目前沒有可結帳的訂單紀錄')
      return
    }
    const original = entries.reduce((sum, entry) => sum + entry.subtotal, 0)
    const paidTotal = Number.parseInt(requireInput('payFinal').value || '0', 10) || original
    await data.checkoutSubmittedBatches({
      table: currentTable(),
      entries,
      customer: readCustomerInfo(),
      paidTotal,
      originalTotal: original,
    })
    closeCheckoutModal()
    closeBuilder()
    await openTableSelect()
  }

  async function checkoutSplitSelection() {
    const { selectedEntries } = getSplitSelectedEntries()
    if (selectedEntries.length === 0) {
      alert('請先選擇本次結帳品項')
      return
    }
    const { baseTotal, finalTotal } = recalcSplitTotal()
    await data.checkoutSubmittedBatches({
      table: currentTable(),
      entryIds: selectedEntries.map((entry) => entry.entryId),
      customer: readCustomerInfo(),
      paidTotal: finalTotal,
      originalTotal: baseTotal,
    })
    closeSplitCheckoutModal()
    closeBuilder()
    renderCart()
  }

  async function printReceipt(dataToPrint: PosReceiptData, isTicket = false) {
    const container = requireElement('receipt-print-area')
    const title = isTicket ? 'Kitchen 工作單' : '結帳明細'
    const resetPrintHost = () => {
      if (printCleanupTimer !== null) {
        window.clearTimeout(printCleanupTimer)
        printCleanupTimer = null
      }
      removePrintListener?.()
      removePrintListener = null
      document.body.classList.remove('receipt-printing')
      container.classList.remove('print-area-active')
      container.classList.add('print-area-hidden')
      container.innerHTML = ''
    }

    resetPrintHost()
    container.innerHTML = buildReceiptMarkup({ ...dataToPrint, lines: dataToPrint.lines }, title)
    container.classList.remove('print-area-hidden')
    container.classList.add('print-area-active')
    document.body.classList.add('receipt-printing')

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finalize = () => {
        if (settled) {
          return
        }
        settled = true
        resetPrintHost()
        resolve()
      }
      const handleAfterPrint = () => {
        finalize()
      }

      window.addEventListener('afterprint', handleAfterPrint, { once: true })
      removePrintListener = () => {
        window.removeEventListener('afterprint', handleAfterPrint)
      }
      printCleanupTimer = window.setTimeout(finalize, 2000)

      try {
        window.print()
      } catch (error) {
        resetPrintHost()
        reject(error)
      }
    })
  }

  async function printKitchenTicketForBatch(batch: PosOrderBatch) {
    await printReceipt(
      {
        seq: batch.requestLabel,
        table: batch.table,
        time: formatDateTime(batch.updatedAt),
        lines: flattenBatchLines(batch),
        original: batch.subtotal,
        total: batch.subtotal,
      },
      true
    )
  }

  async function reprintSubmittedBatch(batchId: string) {
    const batch = kernel.state.activeSubmittedBatches.find((candidate) => candidate.batchId === batchId)
    if (!batch) {
      alert('找不到批次')
      return
    }
    await printKitchenTicketForBatch(batch)
  }

  async function openReprintModal() {
    const modal = findElement('reprintSelectionModal')
    const list = findElement('reprintSelectionList')
    if (!modal || !list) return
    const batches = kernel.state.activeSubmittedBatches
    if (batches.length === 0) {
      list.innerHTML = "<div class='entry-card'>目前沒有可補印的訂單紀錄</div>"
    } else {
      list.innerHTML = batches
        .map(
          (batch) => `
            <label class="cart-item-row">
              <span>
                <input class="reprint-checkbox" type="checkbox" data-batch-id="${escapeHtml(batch.batchId)}">
                ${escapeHtml(batch.requestLabel)}
              </span>
              <span class="cart-item-price">${formatCurrency(batch.subtotal)}</span>
            </label>
          `
        )
        .join('')
    }
    modal.style.display = 'flex'
  }

  function closeReprintModal() {
    const modal = findElement('reprintSelectionModal')
    if (modal) modal.style.display = 'none'
  }

  function openStaffDiscountModal() {
    if (isCustomerMode()) return
    const modal = findElement('staffDiscountModal')
    const original = currentSubmittedTotal()
    const currentPercent = currentStaffDiscountPercent()
    if (findElement('staffDiscountOriginal')) {
      requireElement('staffDiscountOriginal').innerText = formatCurrency(original)
    }
    if (findElement<HTMLInputElement>('staffDiscountInput')) {
      requireInput('staffDiscountInput').value = currentPercent > 0 ? String(currentPercent) : ''
    }
    previewStaffDiscount()
    if (modal) modal.style.display = 'flex'
  }

  function closeStaffDiscountModal() {
    const modal = findElement('staffDiscountModal')
    if (modal) modal.style.display = 'none'
  }

  function previewStaffDiscount() {
    const preview = findElement('staffDiscountPreview')
    const input = findElement<HTMLInputElement>('staffDiscountInput')
    if (!preview || !input) return
    const percent = Number.parseFloat(input.value || '0')
    const original = currentSubmittedTotal()
    if (Number.isNaN(percent) || percent <= 0 || percent > 100) {
      preview.innerText = ''
      return
    }
    preview.innerText = `原價 ${formatCurrency(original)} → 折後 ${formatCurrency(Math.round(original * (percent / 100)))}`
  }

  function confirmStaffDiscount() {
    const input = findElement<HTMLInputElement>('staffDiscountInput')
    if (!input) return
    const percent = Number.parseFloat(input.value || '0')
    kernel.state.staffWorkspace.discount =
      Number.isFinite(percent) && percent > 0 && percent <= 100 ? { percent } : null
    closeStaffDiscountModal()
    updateFloatingActions()
  }

  function resetStaffDiscount() {
    kernel.state.staffWorkspace.discount = null
    if (findElement<HTMLInputElement>('staffDiscountInput')) {
      requireInput('staffDiscountInput').value = ''
    }
    previewStaffDiscount()
    updateFloatingActions()
  }

  function toggleAllReprint(checked: boolean) {
    document.querySelectorAll<HTMLInputElement>('#reprintSelectionList input[type="checkbox"]').forEach((input) => {
      input.checked = checked
    })
  }

  async function confirmReprintSelection() {
    const selectedBatchIds = Array.from(
      document.querySelectorAll<HTMLInputElement>('#reprintSelectionList input[type="checkbox"]:checked')
    ).map((input) => input.dataset.batchId || '')

    for (const batchId of selectedBatchIds) {
      if (batchId) {
        await reprintSubmittedBatch(batchId)
      }
    }
    closeReprintModal()
  }

  return {
    updateBuilderQuantity,
    updateBuilderSelection,
    persistDraft,
    commitBuilder,
    closeOrderActionConfirmModal,
    openOrderActionConfirmModal,
    confirmPendingOrderAction,
    confirmClearDraft,
    confirmSubmitDraft,
    removeDraftEntry,
    toggleDraftEntryTreat,
    toggleSubmittedEntryTreat,
    removeSubmittedEntry,
    discardCustomerDraft,
    clearStaffDraft,
    saveAndExitStaffOrder,
    submitActiveDraft,
    editDraftEntry,
    editSubmittedBatch,
    editSubmittedEntry,
    acceptPendingBatchFromOverlay,
    rejectPendingBatchFromOverlay,
    closeCheckoutModal,
    openPaymentModal,
    closeSplitCheckoutModal,
    renderSplitCheckoutModal,
    openSplitCheckoutModal,
    moveSplitEntry,
    recalcFinalPay,
    recalcSplitTotal,
    checkoutAll,
    checkoutSplitSelection,
    printReceipt,
    printKitchenTicketForBatch,
    reprintSubmittedBatch,
    openReprintModal,
    closeReprintModal,
    openStaffDiscountModal,
    closeStaffDiscountModal,
    previewStaffDiscount,
    confirmStaffDiscount,
    resetStaffDiscount,
    toggleAllReprint,
    confirmReprintSelection,
    showQrModal,
  }
}
