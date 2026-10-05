import { computed, reactive, shallowRef } from 'vue'

import type { LiveState } from '@/app/live-state'
import type { PageRouter } from '@/app/page-router'
import type { PosDataService } from '@/features/pos-data/service'
import type { PosKernelService } from '@/features/pos-kernel/service'
import type {
  PosBuilderState,
  PosMenuCategoryKey,
  PosOrderBatch,
  PosOrderEntry,
  PosPendingBatchPreview,
  PosReceiptData,
} from '@/features/pos-kernel/types'
import { getErrorMessage } from '@/shared/errors'
import type { PosPageId } from '@/shared/pos-page'
import { bindBodyClass } from '@/shared/ui/body-class'
import type { ReceiptPrinter } from '@/shared/ui/receipt-printer'

import {
  buildBuilderPresentation,
  createBuilderState,
  finalizeBuilderEntry,
  getFirstBuilderIssue,
  hydrateBuilderState,
  updateBuilderQuantity,
  updateBuilderSelection,
} from './builder'
import { createCustomerNoticeGate } from './customer-notice-gate'
import type { NewOrderBell } from './new-order-bell'
import {
  acceptPendingBatchAndPrint,
  calculateSplitCheckoutTotal,
  calculateStaffOrderTotal,
  type FloatingClearAction,
  type FloatingPrimaryAction,
  getFloatingBarViewModel,
  getStaffWorkspaceTotalDisplay,
  getVisibleOrderBatches,
  persistCustomerInfoSilently,
  selectPendingOverlayBatch,
  submitDraftBatch,
  summarizeStaffWorkspace,
  updateSubmittedBatchAndPrint,
} from './runtime-support'
import { cloneEntryWithTreatState, flattenBatchLines, formatCurrency, formatDateTime } from './runtime-utils'

export type OrderTab = 'menu' | 'cart' | 'orders'
export type OrderMode = 'staff' | 'customer'

type SalesStoreDeps = {
  kernel: PosKernelService
  data: PosDataService
  live: LiveState
  router: PageRouter
  printer: ReceiptPrinter
  bell: NewOrderBell
}

type ConfirmAction = {
  title: string
  message: string
  confirmText: string
  onConfirm: () => Promise<void>
}

type PendingOverlayDetail = {
  requestKey: string | null
  loading: boolean
  batch: PosOrderBatch | null
  error: string | null
}

export type PendingOverlayView = {
  table: string
  preview: PosPendingBatchPreview
  resolved: PosOrderBatch | null
  loading: boolean
  error: string | null
}

export type SalesStore = ReturnType<typeof createSalesStore>

export function createSalesStore({ kernel, data, live, router, printer, bell }: SalesStoreDeps) {
  const defaultCategory = kernel.categories[0] as PosMenuCategoryKey

  // Body mode classes are only applied once a table session picks a mode.
  const appliedMode = shallowRef<OrderMode | null>(null)
  const mode = computed<OrderMode>(() => appliedMode.value ?? 'staff')
  const qrMode = shallowRef(false)
  const seatLabel = shallowRef('')
  const activeCategory = shallowRef<PosMenuCategoryKey>(defaultCategory)
  const activeTab = shallowRef<OrderTab>('menu')
  // Tab highlight only follows explicit tab switches, so staff sessions never show an active tab.
  const appliedTab = shallowRef<OrderTab | null>(null)
  const workspace = reactive({ expanded: false, serviceFeeEnabled: false, discountPercent: 0 })
  const customerInfo = reactive({ name: '', phone: '' })
  const customerNotice = createCustomerNoticeGate(data.readCustomerNotice)

  bindBodyClass('customer-mode', () => appliedMode.value === 'customer')
  bindBodyClass('staff-mode', () => appliedMode.value === 'staff')
  bindBodyClass('qr-select-mode', () => qrMode.value)

  function isCustomerMode() {
    return kernel.state.currentMode === 'customer'
  }

  function currentTable() {
    if (!kernel.state.selectedTable) {
      throw new Error('No selected table')
    }
    return kernel.state.selectedTable
  }

  function currentDraftEntries() {
    if (kernel.state.currentMode === 'staff') {
      const table = kernel.state.selectedTable
      return table ? kernel.state.staffDrafts[table] || [] : []
    }
    return kernel.state.activeDraftEntries
  }

  function submittedEntries() {
    return kernel.state.activeSubmittedBatches.flatMap((batch) => batch.entries)
  }

  function currentSubmittedTotal() {
    return kernel.state.activeSubmittedBatches.reduce((sum, batch) => sum + batch.subtotal, 0)
  }

  function isEntryTreat(entry: PosOrderEntry) {
    return entry.lines.every((line) => line.isTreat)
  }

  function setCustomerMode(next: OrderMode) {
    kernel.state.currentMode = next
    appliedMode.value = next
    if (next === 'customer') {
      sessionStorage.setItem('customerMode', 'true')
    } else {
      sessionStorage.removeItem('customerMode')
    }
  }

  function setOrderTab(tab: OrderTab) {
    activeTab.value = tab
    appliedTab.value = tab
  }

  function resetStaffWorkspace() {
    workspace.expanded = false
    workspace.serviceFeeEnabled = false
    workspace.discountPercent = 0
  }

  function syncCustomerInputs() {
    const table = kernel.state.selectedTable
    const info = table ? kernel.state.tableCustomers[table] || {} : {}
    customerInfo.name = String(info.name || '')
    customerInfo.phone = String(info.phone || '')
  }

  function readCustomerInfo() {
    const table = kernel.state.selectedTable
    const stored = table ? kernel.state.tableCustomers[table] || {} : {}
    return {
      name: customerInfo.name.trim() || String(stored.name || ''),
      phone: customerInfo.phone.trim() || String(stored.phone || ''),
      orderId: stored.orderId,
    }
  }

  async function setCustomerField(field: 'name' | 'phone', value: string) {
    customerInfo[field] = value
    const table = kernel.state.selectedTable
    if (!table) return
    await persistCustomerInfoSilently({
      mode: kernel.state.currentMode,
      table,
      entries: currentDraftEntries(),
      customer: readCustomerInfo(),
      saveCustomerDraft: data.saveCustomerDraft,
      updateTableCustomer: data.updateTableCustomer,
    })
  }

  // ---- views derived from live data ----

  const draftEntries = computed(() => {
    live.state()
    void mode.value
    return [...currentDraftEntries()]
  })

  const visibleBatches = computed(() => {
    const state = live.state()
    return getVisibleOrderBatches(mode.value, state.activePendingBatches, state.activeSubmittedBatches)
  })

  const floatingBar = computed(() => getFloatingBarViewModel(mode.value, activeTab.value))

  const tableButtons = computed(() => {
    const state = live.state()
    return kernel.tables.map((table) => {
      const status = state.tableStatuses[table]
      return { table, statusClass: status === 'yellow' || status === 'red' ? `status-${status}` : 'status-white' }
    })
  })

  const menuCategories = kernel.categories.flatMap((key) => {
    const category = kernel.menuMeta.categories[key]
    return category ? [{ key, label: category.shortLabel }] : []
  })

  // null when the active category has no data; sections without visible items are skipped.
  const menuSections = computed(() => {
    live.state()
    const category = kernel.menuMeta.categories[activeCategory.value]
    if (!category) {
      return null
    }
    const visibleItemIds = new Set(kernel.helpers.getMenuItemsByMode(mode.value).map((item) => item.id))
    return category.sections.flatMap((section) => {
      const items = section.items
        .filter((item) => visibleItemIds.has(item.id))
        .map((item) => ({
          item,
          soldOut: kernel.helpers.isItemSoldOut(item.id),
          price: kernel.helpers.getItemDisplayPrice(item.id),
        }))
      return items.length > 0 ? [{ label: section.label, items }] : []
    })
  })

  const drinkTemperatures = computed(() => {
    live.state()
    return kernel.drinkTemperatureSwitches.map((option) => ({
      ...option,
      available: !kernel.helpers.isInventoryKeySoldOut(option.soldOutKey),
    }))
  })

  function setDrinkTemperatureAvailable(soldOutKey: string, available: boolean) {
    return data.toggleInventoryBatch({ [soldOutKey]: available })
  }

  const staffSummary = computed(() => {
    const state = live.state()
    void mode.value
    const batches = state.activeSubmittedBatches
    const totals = summarizeStaffWorkspace(currentDraftEntries(), batches)
    return {
      totals,
      total: getStaffWorkspaceTotalDisplay(
        batches.flatMap((batch) => batch.entries),
        workspace.discountPercent,
        workspace.serviceFeeEnabled
      ),
    }
  })

  // ---- navigation ----

  function openTableSelect() {
    closeBuilder()
    resetStaffWorkspace()
    router.showPage('tableSelect')
  }

  async function openOrderPage(table: string, options: { mode?: OrderMode } = {}) {
    const nextMode = options.mode || kernel.state.currentMode
    if (qrMode.value && nextMode !== 'customer') {
      showQrModal(table)
      return
    }
    setCustomerMode(nextMode)
    if (nextMode === 'staff') {
      resetStaffWorkspace()
    }
    seatLabel.value = `（${table}）`
    activeCategory.value = defaultCategory
    activeTab.value = 'menu'
    closeBuilder()
    router.showPage('orderPage')
    await data.ensureCatalog()
    await data.startTableLiveSession(nextMode, table)
    syncCustomerInputs()
    renderOrderSession()
  }

  // Parts of the order page that refresh at fixed points instead of tracking live data.
  function renderOrderSession() {
    renderPendingOverlay()
    if (isCustomerMode()) {
      setOrderTab(activeTab.value)
    }
  }

  function selectCategory(category: PosMenuCategoryKey) {
    activeCategory.value = category
  }

  function toggleQrMode() {
    qrMode.value = !qrMode.value
  }

  // ---- QR modal ----

  const qrModal = reactive({ open: false, table: '', url: '' })

  function showQrModal(table: string) {
    qrModal.table = table
    qrModal.url = `${location.origin}${location.pathname}?table=${encodeURIComponent(table)}`
    qrModal.open = true
  }

  function closeQrModal() {
    qrModal.open = false
    qrModal.url = ''
  }

  // ---- builder ----

  // The draft lives outside Vue so typing into builder text fields does not re-render the modal.
  let builderDraft: PosBuilderState | null = null
  const builderRevision = shallowRef(0)

  function renderBuilder() {
    builderRevision.value += 1
  }

  const builder = computed(() => {
    void builderRevision.value
    live.state()
    const draft = builderDraft
    if (!draft) {
      return null
    }
    const presentation = buildBuilderPresentation({ state: draft, helpers: kernel.helpers })
    if (!presentation) {
      return { presentation: null, editing: false, issueGroupId: null }
    }
    const firstIssue = getFirstBuilderIssue([...presentation.missingIssues, ...presentation.soldOutIssues])
    return {
      presentation,
      editing: Boolean(draft.editingEntryId),
      issueGroupId: firstIssue?.groupId ?? null,
    }
  })

  function openBuilder(itemId: string, target: PosBuilderState['target'], entry?: PosOrderEntry, batchId?: string) {
    builderDraft = entry ? hydrateBuilderState(entry, target, batchId) : createBuilderState(itemId, target, batchId)
    renderBuilder()
  }

  function closeBuilder() {
    builderDraft = null
    renderBuilder()
  }

  function selectMenuItem(itemId: string) {
    openBuilder(itemId, isCustomerMode() ? 'customer-draft' : 'staff-draft')
  }

  function adjustBuilderQuantity(delta: number) {
    if (!builderDraft) return
    builderDraft = updateBuilderQuantity(builderDraft, builderDraft.quantity + delta)
    renderBuilder()
  }

  function setBuilderQuantity(value: string) {
    if (!builderDraft) return
    builderDraft = updateBuilderQuantity(builderDraft, Number.parseInt(value || '1', 10))
    renderBuilder()
  }

  function selectBuilderMain(ruleId: string, value: string, render = true) {
    if (!builderDraft) return
    builderDraft = updateBuilderSelection(builderDraft, 'main', ruleId, value)
    if (render) renderBuilder()
  }

  function selectBuilderInclude(includeId: string, ruleId: string, value: string, render = true) {
    if (!builderDraft) return
    builderDraft = updateBuilderSelection(builderDraft, 'include', includeId, value, ruleId)
    if (render) renderBuilder()
  }

  function selectBuilderUpgrade(groupId: string, value: string) {
    if (!builderDraft) return
    builderDraft = updateBuilderSelection(builderDraft, 'upgrade', groupId, value)
    renderBuilder()
  }

  async function persistDraft(entries: PosOrderEntry[]) {
    const table = currentTable()
    if (kernel.state.currentMode === 'staff') {
      await data.saveStaffDraft(table, entries)
      return
    }
    await data.saveCustomerDraft(table, entries, readCustomerInfo())
  }

  async function commitBuilder() {
    const draft = builderDraft
    if (!draft) return
    const previousEntry =
      draft.editingEntryId && draft.target !== 'submitted-batch'
        ? currentDraftEntries().find((entry) => entry.entryId === draft.editingEntryId)
        : draft.batchId
          ? kernel.state.activeSubmittedBatches
              .find((batch) => batch.batchId === draft.batchId)
              ?.entries.find((entry) => entry.entryId === draft.editingEntryId)
          : null

    const result = finalizeBuilderEntry({
      state: draft,
      helpers: kernel.helpers,
      source: isCustomerMode() ? 'customer' : 'staff',
      status: draft.target === 'submitted-batch' ? 'accepted' : 'draft',
      entryId: draft.editingEntryId || undefined,
      createdAt: previousEntry?.createdAt,
    })
    if (!result.ok) {
      renderBuilder()
      return
    }

    if (draft.target === 'submitted-batch' && draft.batchId) {
      const batch = kernel.state.activeSubmittedBatches.find((candidate) => candidate.batchId === draft.batchId)
      if (!batch) return
      await updateSubmittedBatchAndPrint({
        table: currentTable(),
        batchId: batch.batchId,
        entries: batch.entries.map((entry) => (entry.entryId === result.entry.entryId ? result.entry : entry)),
        updateSubmittedBatch: data.updateSubmittedBatch,
        printKitchenTicket,
      })
      closeBuilder()
      renderOrderSession()
      return
    }

    const current = currentDraftEntries()
    await persistDraft(
      kernel.helpers.getCanonicalDraftEntries(
        draft.editingEntryId
          ? current.map((entry) => (entry.entryId === result.entry.entryId ? result.entry : entry))
          : [...current, result.entry]
      )
    )
    closeBuilder()
    renderOrderSession()
  }

  // ---- draft and submitted entry actions ----

  function editDraftEntry(entryId: string) {
    const entry = currentDraftEntries().find((candidate) => candidate.entryId === entryId)
    if (!entry) return
    openBuilder(entry.itemId, isCustomerMode() ? 'customer-draft' : 'staff-draft', entry)
  }

  async function removeDraftEntry(entryId: string) {
    await persistDraft(currentDraftEntries().filter((entry) => entry.entryId !== entryId))
    renderOrderSession()
  }

  async function toggleDraftEntryTreat(entryId: string) {
    await persistDraft(
      currentDraftEntries().map((entry) =>
        entry.entryId === entryId ? cloneEntryWithTreatState(entry, !isEntryTreat(entry)) : entry
      )
    )
    renderOrderSession()
  }

  function editSubmittedEntry(batchId: string, entryId?: string) {
    const batch = kernel.state.activeSubmittedBatches.find((candidate) => candidate.batchId === batchId)
    const target = entryId ? batch?.entries.find((entry) => entry.entryId === entryId) : batch?.entries[0]
    if (!batch || !target) return
    openBuilder(target.itemId, 'submitted-batch', target, batchId)
    if (isCustomerMode()) {
      setOrderTab('orders')
    }
  }

  async function updateSubmittedEntries(batchId: string, buildNext: (entries: PosOrderEntry[]) => PosOrderEntry[]) {
    const batch = kernel.state.activeSubmittedBatches.find((candidate) => candidate.batchId === batchId)
    if (!batch) return
    await data.updateSubmittedBatch(currentTable(), batchId, buildNext(batch.entries))
    renderOrderSession()
  }

  function toggleSubmittedEntryTreat(batchId: string, entryId: string) {
    return updateSubmittedEntries(batchId, (entries) =>
      entries.map((entry) =>
        entry.entryId === entryId ? cloneEntryWithTreatState(entry, !isEntryTreat(entry)) : entry
      )
    )
  }

  function removeSubmittedEntry(batchId: string, entryId: string) {
    return updateSubmittedEntries(batchId, (entries) => entries.filter((entry) => entry.entryId !== entryId))
  }

  // ---- confirm modal ----

  const confirmDialog = reactive({ open: false, title: '確認操作', message: '請確認是否繼續。', confirmText: '確認' })
  let confirmAction: ConfirmAction['onConfirm'] | null = null

  function openConfirm(action: ConfirmAction) {
    confirmAction = action.onConfirm
    confirmDialog.title = action.title
    confirmDialog.message = action.message
    confirmDialog.confirmText = action.confirmText
    confirmDialog.open = true
  }

  function closeConfirm() {
    confirmAction = null
    confirmDialog.open = false
  }

  async function runConfirmedAction() {
    const action = confirmAction
    closeConfirm()
    await action?.()
  }

  function confirmClearDraft() {
    openConfirm({
      title: '清空購物車',
      message: '確定要清空目前購物車內容嗎？',
      confirmText: '確認清空',
      onConfirm: async () => {
        if (isCustomerMode()) {
          await data.discardCustomerDraft(currentTable())
        } else {
          await data.saveStaffDraft(currentTable(), [])
        }
        closeBuilder()
        renderOrderSession()
      },
    })
  }

  function confirmSubmitDraft() {
    openConfirm({
      title: '送出購物車',
      message: '確定要送出目前購物車內容嗎？',
      confirmText: '確認送出',
      onConfirm: submitActiveDraft,
    })
  }

  async function submitActiveDraft() {
    const entries = currentDraftEntries()
    if (entries.length === 0) {
      alert('目前沒有可送出的內容')
      return
    }
    if (!(await trySubmitDraft(entries, kernel.state.currentMode))) return
    closeBuilder()
    if (isCustomerMode()) {
      setOrderTab('orders')
    }
    renderOrderSession()
  }

  async function trySubmitDraft(entries: PosOrderEntry[], mode: OrderMode) {
    try {
      await submitDraftBatch({
        mode,
        table: currentTable(),
        entries,
        customer: readCustomerInfo(),
        submitCustomerDraft: data.submitCustomerDraft,
        createStaffBatch: data.createStaffBatch,
        printKitchenTicket,
      })
      return true
    } catch (error) {
      if (mode === 'customer') setOrderTab('cart')
      alert(`送單失敗：${getErrorMessage(error)}`)
      return false
    }
  }

  function runFloatingClear(action: FloatingClearAction) {
    if (action === 'open-reprint') {
      openReprintModal()
      return
    }
    confirmClearDraft()
  }

  function runFloatingPrimary(action: FloatingPrimaryAction) {
    if (action === 'go-cart') {
      setOrderTab('cart')
      return
    }
    if (action === 'open-payment') {
      openPaymentModal()
      return
    }
    confirmSubmitDraft()
  }

  async function saveAndExitStaffOrder() {
    const entries = currentDraftEntries()
    if (entries.length === 0) {
      openTableSelect()
      return
    }
    if (!(await trySubmitDraft(entries, 'staff'))) return
    closeBuilder()
    resetStaffWorkspace()
    openTableSelect()
  }

  // ---- printing ----

  function printReceipt(receipt: PosReceiptData, isTicket = false) {
    return printer.print(receipt, isTicket)
  }

  function printKitchenTicket(batch: PosOrderBatch) {
    return printReceipt(
      {
        seq: batch.requestLabel,
        table: batch.table,
        time: formatDateTime(batch.updatedAt),
        lines: flattenBatchLines(batch, kernel.helpers.normalizeEntryForDisplay),
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
    await printKitchenTicket(batch)
  }

  // ---- reprint modal ----

  const reprintModal = reactive({
    open: false,
    batches: [] as PosOrderBatch[],
    selected: new Set<string>(),
    allChecked: false,
  })

  function openReprintModal() {
    reprintModal.batches = [...kernel.state.activeSubmittedBatches]
    reprintModal.selected.clear()
    reprintModal.open = true
  }

  function closeReprintModal() {
    reprintModal.open = false
  }

  function setReprintSelected(batchId: string, checked: boolean) {
    if (checked) reprintModal.selected.add(batchId)
    else reprintModal.selected.delete(batchId)
  }

  function toggleAllReprint(checked: boolean) {
    reprintModal.allChecked = checked
    for (const batch of reprintModal.batches) {
      setReprintSelected(batch.batchId, checked)
    }
  }

  async function confirmReprintSelection() {
    const batchIds = reprintModal.batches
      .map((batch) => batch.batchId)
      .filter((batchId) => reprintModal.selected.has(batchId))
    for (const batchId of batchIds) {
      await reprintSubmittedBatch(batchId)
    }
    closeReprintModal()
  }

  // ---- payment modal ----

  const paymentModal = reactive({
    open: false,
    original: 0,
    discountPercent: 0,
    discountLabel: '',
    serviceFee: false,
    allowance: '',
    final: '',
  })

  function openPaymentModal() {
    const total = submittedEntries().reduce((sum, entry) => sum + entry.subtotal, 0)
    paymentModal.original = total
    paymentModal.discountPercent = isCustomerMode() ? 0 : workspace.discountPercent
    paymentModal.discountLabel = ''
    paymentModal.serviceFee = isCustomerMode() ? false : workspace.serviceFeeEnabled
    paymentModal.allowance = '0'
    paymentModal.final = String(calculateStaffOrderTotal(total, paymentModal.discountPercent, paymentModal.serviceFee))
    paymentModal.open = true
  }

  function closePaymentModal() {
    paymentModal.open = false
  }

  function recalcPayment(changes: { serviceFee?: boolean; allowance?: string }) {
    Object.assign(paymentModal, changes)
    const discountPercent = isCustomerMode() ? 0 : workspace.discountPercent
    const allowance = Number.parseInt(paymentModal.allowance || '0', 10) || 0
    paymentModal.discountLabel =
      discountPercent > 0
        ? `(已套用 ${discountPercent}% 折數${paymentModal.serviceFee ? '，含 10% 服務費' : ''})`
        : paymentModal.serviceFee
          ? '(含 10% 服務費)'
          : ''
    paymentModal.final = String(
      calculateStaffOrderTotal(paymentModal.original, discountPercent, paymentModal.serviceFee, allowance)
    )
  }

  async function checkoutAll() {
    const entries = submittedEntries()
    if (entries.length === 0) {
      alert('目前沒有可結帳的訂單紀錄')
      return
    }
    const original = entries.reduce((sum, entry) => sum + entry.subtotal, 0)
    await data.checkoutSubmittedBatches({
      table: currentTable(),
      entries,
      customer: readCustomerInfo(),
      paidTotal: Number.parseInt(paymentModal.final || '0', 10) || original,
      originalTotal: original,
    })
    closePaymentModal()
    closeBuilder()
    openTableSelect()
  }

  // ---- split checkout modal ----

  const splitModal = reactive({
    open: false,
    selected: new Set<string>(),
    discount: '',
    serviceFee: false,
    allowance: '',
  })

  const splitEntries = computed(() => {
    live.state()
    const selected: PosOrderEntry[] = []
    const unpaid: PosOrderEntry[] = []
    for (const entry of submittedEntries()) {
      ;(splitModal.selected.has(entry.entryId) ? selected : unpaid).push(entry)
    }
    const baseTotal = selected.reduce((sum, entry) => sum + entry.subtotal, 0)
    const finalTotal = calculateSplitCheckoutTotal(
      baseTotal,
      Number.parseFloat(splitModal.discount || '0'),
      splitModal.serviceFee,
      Number.parseInt(splitModal.allowance || '0', 10) || 0
    )
    return { selected, unpaid, baseTotal, finalTotal }
  })

  function openSplitCheckoutModal() {
    if (submittedEntries().length === 0) {
      alert('目前沒有可拆單的訂單紀錄')
      return
    }
    splitModal.selected.clear()
    splitModal.discount = ''
    splitModal.allowance = ''
    splitModal.serviceFee = false
    splitModal.open = true
  }

  function closeSplitCheckoutModal() {
    splitModal.open = false
    splitModal.selected.clear()
  }

  function moveSplitEntry(entryId: string, selected: boolean) {
    if (selected) splitModal.selected.add(entryId)
    else splitModal.selected.delete(entryId)
  }

  async function checkoutSplitSelection() {
    const { selected, baseTotal, finalTotal } = splitEntries.value
    if (selected.length === 0) {
      alert('請先選擇本次結帳品項')
      return
    }
    await data.checkoutSubmittedBatches({
      table: currentTable(),
      entryIds: selected.map((entry) => entry.entryId),
      customer: readCustomerInfo(),
      paidTotal: finalTotal,
      originalTotal: baseTotal,
    })
    closeSplitCheckoutModal()
    closeBuilder()
    renderOrderSession()
  }

  // ---- staff workspace & discount modal ----

  function toggleWorkspace() {
    workspace.expanded = !workspace.expanded
  }

  function toggleServiceFee() {
    workspace.serviceFeeEnabled = !workspace.serviceFeeEnabled
  }

  const discountModal = reactive({ open: false, original: 0, input: '' })

  const discountPreview = computed(() => {
    live.state()
    const percent = Number.parseFloat(discountModal.input || '0')
    if (Number.isNaN(percent) || percent <= 0 || percent > 100) {
      return ''
    }
    const original = currentSubmittedTotal()
    return `原價 ${formatCurrency(original)} → 折後 ${formatCurrency(Math.round(original * (percent / 100)))}`
  })

  function openDiscountModal() {
    if (isCustomerMode()) return
    discountModal.original = currentSubmittedTotal()
    discountModal.input = workspace.discountPercent > 0 ? String(workspace.discountPercent) : ''
    discountModal.open = true
  }

  function closeDiscountModal() {
    discountModal.open = false
  }

  function confirmDiscount() {
    const percent = Number.parseFloat(discountModal.input || '0')
    workspace.discountPercent = Number.isFinite(percent) && percent > 0 && percent <= 100 ? percent : 0
    closeDiscountModal()
  }

  function resetDiscount() {
    workspace.discountPercent = 0
    discountModal.input = ''
  }

  // ---- pending batch overlay ----

  const pendingDetail: PendingOverlayDetail = { requestKey: null, loading: false, batch: null, error: null }
  // The overlay is a snapshot redrawn at fixed points, matching when staff expect it to change.
  const pendingOverlay = shallowRef<PendingOverlayView | null>(null)

  function resetPendingDetail() {
    pendingDetail.requestKey = null
    pendingDetail.loading = false
    pendingDetail.batch = null
    pendingDetail.error = null
  }

  function selectPendingBatch() {
    return selectPendingOverlayBatch(kernel.state.currentMode, kernel.state.pendingBatchPreviews, kernel.tables)
  }

  function renderPendingOverlay() {
    const pending = selectPendingBatch()
    if (!pending) {
      pendingOverlay.value = null
      return
    }
    const requestKey = `${pending.table}:${pending.batch.batchId}`
    if (pendingDetail.requestKey && pendingDetail.requestKey !== requestKey && !pendingDetail.loading) {
      pendingDetail.batch = null
      pendingDetail.error = null
    }
    const isCurrent = pendingDetail.requestKey === requestKey
    pendingOverlay.value = {
      table: pending.table,
      preview: pending.batch,
      resolved: isCurrent && pendingDetail.batch?.batchId === pending.batch.batchId ? pendingDetail.batch : null,
      loading: isCurrent && pendingDetail.loading,
      error: isCurrent ? pendingDetail.error : null,
    }
  }

  async function ensurePendingDetail(table: string, preview: PosPendingBatchPreview) {
    const requestKey = `${table}:${preview.batchId}`
    if (pendingDetail.requestKey === requestKey && (pendingDetail.loading || pendingDetail.batch)) {
      renderPendingOverlay()
      return
    }

    pendingDetail.requestKey = requestKey
    pendingDetail.loading = true
    pendingDetail.batch = null
    pendingDetail.error = null
    renderPendingOverlay()

    try {
      const batch = await data.readPendingBatchDetail(table, preview.batchId)
      if (pendingDetail.requestKey !== requestKey) return
      pendingDetail.loading = false
      pendingDetail.batch = batch
      pendingDetail.error = batch ? null : '找不到完整訂單明細'
    } catch {
      if (pendingDetail.requestKey !== requestKey) return
      pendingDetail.loading = false
      pendingDetail.batch = null
      pendingDetail.error = '完整訂單明細載入失敗'
    }
    renderPendingOverlay()
  }

  function checkPendingBatches() {
    const hasPending = Object.values(kernel.state.pendingBatchPreviews).some((batches) => batches?.[0])
    if (!hasPending) {
      resetPendingDetail()
      renderPendingOverlay()
      return
    }
    const pending = selectPendingBatch()
    renderPendingOverlay()
    if (pending) {
      void ensurePendingDetail(pending.table, pending.batch)
    }
  }

  async function settlePendingBatch(settle: (table: string, batchId: string) => Promise<unknown>) {
    const current = pendingOverlay.value
    if (!current) return
    bell.stop()
    await settle(current.table, current.preview.batchId)
    resetPendingDetail()
    renderOrderSession()
  }

  function acceptPendingBatch() {
    return settlePendingBatch((table, batchId) =>
      acceptPendingBatchAndPrint({
        table,
        batchId,
        acceptPendingBatch: data.acceptPendingBatch,
        printKitchenTicket,
      })
    )
  }

  function rejectPendingBatch() {
    return settlePendingBatch(data.rejectPendingBatch)
  }

  // ---- live wiring ----

  data.subscribe(({ roots }) => {
    if (router.activePage.value === 'orderPage' && kernel.state.selectedTable) {
      if (appliedMode.value !== 'customer') {
        syncCustomerInputs()
      }
      renderOrderSession()
    }
    if (roots.includes('pendingBatches')) {
      checkPendingBatches()
      if (!isCustomerMode()) {
        bell.sync(kernel.state.pendingBatches)
      }
    }
  })

  let stopCatalogWatch: (() => void) | null = null

  function syncCatalogWatch(pageId: PosPageId) {
    if (pageId !== 'orderPage') {
      stopCatalogWatch?.()
      stopCatalogWatch = null
      return
    }
    stopCatalogWatch ??= data.watchCatalogRevision(() => live.touch())
  }

  router.onLeave(() => {
    closeBuilder()
    data.stopTableLiveSession()
    stopCatalogWatch?.()
    stopCatalogWatch = null
  })

  router.onEnter((pageId) => {
    if (pageId !== 'orderPage') {
      data.stopTableLiveSession()
    }
    syncCatalogWatch(pageId)
  })

  return {
    mode,
    qrMode,
    seatLabel,
    activeCategory,
    activeTab,
    appliedTab,
    workspace,
    customerInfo,
    customerNotice,
    draftEntries,
    visibleBatches,
    floatingBar,
    tableButtons,
    menuCategories,
    menuSections,
    drinkTemperatures,
    staffSummary,
    builder,
    confirmDialog,
    qrModal,
    reprintModal,
    paymentModal,
    splitModal,
    splitEntries,
    discountModal,
    discountPreview,
    pendingOverlay,
    isEntryTreat,
    setCustomerMode,
    setCustomerField,
    openTableSelect,
    openOrderPage,
    selectCategory,
    setDrinkTemperatureAvailable,
    setOrderTab,
    toggleQrMode,
    closeQrModal,
    selectMenuItem,
    closeBuilder,
    adjustBuilderQuantity,
    setBuilderQuantity,
    selectBuilderMain,
    selectBuilderInclude,
    selectBuilderUpgrade,
    commitBuilder,
    editDraftEntry,
    removeDraftEntry,
    toggleDraftEntryTreat,
    editSubmittedEntry,
    toggleSubmittedEntryTreat,
    removeSubmittedEntry,
    closeConfirm,
    runConfirmedAction,
    runFloatingClear,
    runFloatingPrimary,
    saveAndExitStaffOrder,
    printReceipt,
    reprintSubmittedBatch,
    openReprintModal,
    closeReprintModal,
    setReprintSelected,
    toggleAllReprint,
    confirmReprintSelection,
    openPaymentModal,
    closePaymentModal,
    recalcPayment,
    checkoutAll,
    openSplitCheckoutModal,
    closeSplitCheckoutModal,
    moveSplitEntry,
    checkoutSplitSelection,
    toggleWorkspace,
    toggleServiceFee,
    openDiscountModal,
    closeDiscountModal,
    confirmDiscount,
    resetDiscount,
    acceptPendingBatch,
    rejectPendingBatch,
  }
}
