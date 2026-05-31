import type { AppContext, FeatureRuntime } from '@/app/app-context'
import { POS_DATA_SERVICE_KEY, type PosDataService } from '@/features/pos-data/service'
import { POS_KERNEL_SERVICE_KEY, type PosKernelService } from '@/features/pos-kernel/service'
import type {
  PosBuilderState,
  PosCategoryKey,
  PosMenuCategoryKey,
  PosOrderBatch,
  PosOrderEntry,
  PosPendingBatchPreview,
  PosReceiptData,
} from '@/features/pos-kernel/types'
import { POS_CATEGORY_LABELS } from '@/features/pos-kernel/types'
import { POS_UI_SERVICE_KEY, type PosUiService } from '@/features/pos-shell/service'
import { CHECKIN_PAGE_SERVICE_KEY, type CheckinPageService } from '@/shared/checkin-page-service'
import { findElement, requireElement, requireInput } from '@/shared/dom-helpers'
import { groupOrderLines } from '@/shared/grouped-order-lines'
import { renderQrCode } from '@/shared/qrcode'
import {
  buildBuilderPresentation,
  createBuilderState,
  finalizeBuilderEntry,
  getFirstBuilderIssue,
  hydrateBuilderState,
  updateBuilderQuantity,
  updateBuilderSelection,
} from './builder'
import { renderBuilderMarkup, renderBuilderMissingMarkup } from './builder-view'
import {
  acceptPendingBatchAndPrint,
  buildReceiptMarkup,
  calculateSplitCheckoutTotal,
  calculateStaffOrderTotal,
  getBatchStatusChip,
  getFloatingBarViewModel,
  getStaffWorkspaceRowActions,
  getVisibleOrderBatches,
  guideBuilderIssue,
  persistCustomerInfoSilently,
  selectPendingOverlayBatch,
  submitDraftBatch,
  summarizeStaffWorkspace,
  updateSubmittedBatchAndPrint,
} from './runtime-support'
import { POS_SALES_SERVICE_KEY, type PosSalesService } from './service'

let booted = false

type StaffWorkspaceSummaryView = ReturnType<typeof summarizeStaffWorkspace>
type StaffWorkspaceRowView = StaffWorkspaceSummaryView['rows'][number]
type StaffWorkspaceGroupView = StaffWorkspaceSummaryView['groups'][number]

type BuilderTarget = PosBuilderState['target']

type RenderBatchOptions = {
  editable: boolean
  pending: boolean
}

type SplitCheckoutState = {
  selectedEntryIds: Set<string>
}

type PosOrderTab = 'menu' | 'cart' | 'orders'

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

type CatalogWatchStop = (() => void) | null

function formatCurrency(value: number) {
  return `$${Math.round(value || 0)}`
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDateTime(value: number) {
  return new Date(value).toLocaleString('zh-TW', { hour12: false })
}

function groupChildLines(entry: PosOrderEntry) {
  return entry.lines.filter((line) => line.parentLineId)
}

function getVisibleDetailChildLines(entry: PosOrderEntry) {
  return groupChildLines(entry).filter((line) => line.courseKind !== 'drink')
}

function _sortByCreated<T extends { createdAt: number }>(items: T[]) {
  return [...items].sort((left, right) => left.createdAt - right.createdAt)
}

function cloneEntryWithTreatState(entry: PosOrderEntry, isTreat: boolean): PosOrderEntry {
  const nextLines = entry.lines.map((line) => ({
    ...line,
    isTreat,
    lineTotal: isTreat ? 0 : line.unitPrice * line.quantity,
  }))
  const subtotal = nextLines.reduce((sum, line) => sum + line.lineTotal, 0)
  const title = entry.itemName + (isTreat ? ' (招待)' : '')
  return {
    ...entry,
    updatedAt: Date.now(),
    lines: nextLines,
    subtotal,
    summary: {
      ...entry.summary,
      title,
      totalLabel: `$${subtotal}`,
    },
  }
}

function getStaffCategoryLabel(categoryKey: PosCategoryKey) {
  return POS_CATEGORY_LABELS[categoryKey] || POS_CATEGORY_LABELS.other
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
      const defaultCategory = kernel.categories[0]
      const splitCheckoutState: SplitCheckoutState = {
        selectedEntryIds: new Set<string>(),
      }
      const pendingOverlayState: PendingOverlayState = {
        requestKey: null,
        loading: false,
        batch: null,
        error: null,
      }
      let pendingOrderAction: PendingOrderAction = null
      let stopCatalogRevisionWatch: CatalogWatchStop = null
      let printCleanupTimer: number | null = null
      let removePrintListener: (() => void) | null = null

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

      function currentCustomerInfo() {
        const table = kernel.state.selectedTable
        return table ? kernel.state.tableCustomers[table] || {} : {}
      }

      function readCustomerInfo() {
        const currentInfo = currentCustomerInfo()
        const nameInput = findElement<HTMLInputElement>('custName')
        const phoneInput = findElement<HTMLInputElement>('custPhone')
        return {
          name: nameInput?.value.trim() || String(currentInfo.name || ''),
          phone: phoneInput?.value.trim() || String(currentInfo.phone || ''),
          orderId: currentInfo.orderId,
        }
      }

      function setOrderTab(tab: PosOrderTab) {
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

      function syncCustomerInputs() {
        const info = currentCustomerInfo()
        const nameInput = findElement<HTMLInputElement>('custName')
        const phoneInput = findElement<HTMLInputElement>('custPhone')
        if (nameInput) nameInput.value = String(info.name || '')
        if (phoneInput) phoneInput.value = String(info.phone || '')
      }

      function setCustomerBoxVisibility() {
        const box = findElement('orderCustomerBox')
        if (!box) return
        box.style.display = kernel.state.currentMode === 'customer' ? 'flex' : 'none'
      }

      function setCustomerMode(mode: 'staff' | 'customer') {
        kernel.state.currentMode = mode
        document.body.classList.toggle('customer-mode', mode === 'customer')
        document.body.classList.toggle('staff-mode', mode === 'staff')
        if (mode === 'customer') {
          sessionStorage.setItem('customerMode', 'true')
        } else {
          sessionStorage.removeItem('customerMode')
        }
      }

      function updateFloatingActions() {
        const floatingBar = findElement('customerFloatingBar')
        const customerMain = findElement('customerFloatingMain')
        const staffWorkspace = findElement('staffFloatingWorkspace')
        const floatingLabel = findElement('floatingActionLabel')
        const clearBtn = findElement<HTMLButtonElement>('floatingClearBtn')
        const primaryBtn = findElement<HTMLButtonElement>('floatingPrimaryBtn')
        if (!floatingBar || !customerMain || !staffWorkspace || !floatingLabel || !clearBtn || !primaryBtn) return

        floatingBar.style.display = 'flex'
        customerMain.style.display = isCustomerMode() ? 'flex' : 'none'
        staffWorkspace.style.display = isCustomerMode() ? 'none' : 'flex'
        if (!isCustomerMode()) {
          updateStaffWorkspace()
          return
        }

        const viewModel = getFloatingBarViewModel(kernel.state.currentMode, kernel.state.menuFilter.activeTab)
        floatingLabel.innerText = viewModel.label
        clearBtn.style.display = viewModel.clearVisible ? 'inline-flex' : 'none'
        clearBtn.innerText = viewModel.clearText
        clearBtn.dataset.action = viewModel.clearAction
        primaryBtn.style.display = viewModel.primaryVisible ? 'inline-flex' : 'none'
        primaryBtn.innerText = viewModel.primaryText
        primaryBtn.dataset.action = viewModel.primaryAction
      }

      function currentStaffDiscountPercent() {
        return kernel.state.staffWorkspace.discount?.percent || 0
      }

      function currentSubmittedTotal() {
        return kernel.state.activeSubmittedBatches.reduce((sum, batch) => sum + batch.subtotal, 0)
      }

      function isEntryTreat(entry: PosOrderEntry) {
        return entry.lines.every((line) => line.isTreat)
      }

      function normalizeEntry(entry: PosOrderEntry) {
        return kernel.helpers.normalizeEntryForDisplay(entry)
      }

      function getDisplaySummary(entry: PosOrderEntry) {
        return kernel.helpers.buildEntryDisplaySummary(entry)
      }

      function flattenBatchLines(batch: PosOrderBatch) {
        return batch.entries.flatMap((entry) => normalizeEntry(entry).lines)
      }

      function buildStaffRowSummary(entry: PosOrderEntry) {
        const summary = getDisplaySummary(entry)
        const parts = [entry.summary.quantityLabel]
        if (summary.mainCompact) {
          parts.push(summary.mainCompact)
        }
        if (summary.drinkCompact) {
          parts.push(summary.drinkCompact)
        }
        return parts.join(' · ')
      }

      function renderEntrySubtitleLines(lines: Array<{ text: string; className?: string } | null | undefined | false>) {
        return lines
          .filter((line): line is { text: string; className?: string } =>
            Boolean(line && typeof line === 'object' && line.text)
          )
          .map(
            (line) =>
              `<div class="entry-card-subtitle${line.className ? ` ${line.className}` : ''}">${escapeHtml(line.text)}</div>`
          )
          .join('')
      }

      function renderStaffWorkspaceActions(row: ReturnType<typeof summarizeStaffWorkspace>['rows'][number]) {
        const isTreat = isEntryTreat(row.entry)
        return `
          <div class="entry-card-actions entry-card-actions--compact">
            ${getStaffWorkspaceRowActions(row, isTreat)
              .map((action) => {
                const attrs = Object.entries(action.attrs)
                  .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
                  .join(' ')
                return `<button class="mini-btn mini-btn--compact ${action.tone} btn-effect" data-action="${action.action}" ${attrs}>${action.label}</button>`
              })
              .join('')}
          </div>
        `
      }

      function renderStaffWorkspaceEntry(row: StaffWorkspaceRowView) {
        const entry = row.entry
        const compactSummary = buildStaffRowSummary(entry)
        const categoryLabel = getStaffCategoryLabel(entry.categoryKey)
        const summary = getDisplaySummary(entry)
        if (!kernel.state.staffWorkspace.expanded) {
          return `
            <div class="staff-stream-entry-line is-collapsed">
              <div class="staff-stream-row-inline">
                <span class="staff-stream-row-inline-main">
                  <span class="staff-stream-inline-title">${escapeHtml(entry.summary.title)}</span>
                  <span class="staff-stream-inline-summary">${escapeHtml(compactSummary)}</span>
                </span>
                <span class="staff-stream-row-inline-side">
                  <span class="entry-card-total">${formatCurrency(entry.subtotal)}</span>
                  <span class="staff-stream-row-actions-inline">${renderStaffWorkspaceActions(row)}</span>
                </span>
              </div>
            </div>
          `
        }

        return `
          <div class="staff-stream-entry-line">
            <div class="staff-stream-row-head">
              <div class="staff-stream-row-title-group">
                <div class="staff-stream-row-meta">
                  <span class="staff-category-chip">${escapeHtml(categoryLabel)}</span>
                  <div class="entry-card-title">${escapeHtml(entry.summary.title)}</div>
                  <span class="staff-stream-title-qty">${escapeHtml(entry.summary.quantityLabel)}</span>
                </div>
                ${summary.expandedSummary ? `<div class="entry-card-subtitle">${escapeHtml(summary.expandedSummary)}</div>` : ''}
              </div>
              <div class="entry-card-total">${formatCurrency(entry.subtotal)}</div>
            </div>
            <div class="staff-stream-row-actions">${renderStaffWorkspaceActions(row)}</div>
          </div>
        `
      }

      function renderStaffWorkspaceGroup(group: StaffWorkspaceGroupView) {
        const badgeClass = group.kind === 'draft' ? 'draft' : 'accepted'
        const requestMeta = group.requestLabel
          ? `<span class="staff-stream-ref">${escapeHtml(group.requestLabel)}</span>`
          : ''
        return `
          <article class="staff-stream-row ${badgeClass}${kernel.state.staffWorkspace.expanded ? '' : ' is-collapsed'}">
            <div class="staff-stream-row-meta staff-stream-group-meta">
              <span class="staff-stream-chip ${badgeClass}">${group.statusLabel}</span>
              ${requestMeta}
            </div>
            <div class="staff-stream-group-list">
              ${group.rows.map((row) => renderStaffWorkspaceEntry(row)).join('')}
            </div>
          </article>
        `
      }

      function applyStaffWorkspaceState() {
        const floatingBar = findElement('customerFloatingBar')
        const staffWorkspace = findElement('staffFloatingWorkspace')
        const toggleLabel = findElement('staffWorkspaceToggleLabel')
        const toggleButton = findElement('staffWorkspaceToggleButton')
        const serviceFeeBtn = findElement('staffServiceFeeBtn')
        const discountBtn = findElement('staffDiscountBtn')
        if (floatingBar) {
          floatingBar.classList.toggle('is-expanded', kernel.state.staffWorkspace.expanded)
          floatingBar.classList.toggle('is-collapsed', !kernel.state.staffWorkspace.expanded)
        }
        if (staffWorkspace) {
          staffWorkspace.classList.toggle('is-expanded', kernel.state.staffWorkspace.expanded)
          staffWorkspace.classList.toggle('is-collapsed', !kernel.state.staffWorkspace.expanded)
        }
        if (toggleLabel) {
          toggleLabel.innerText = kernel.state.staffWorkspace.expanded ? '收合明細' : '展開明細'
        }
        if (toggleButton) {
          toggleButton.setAttribute('aria-expanded', kernel.state.staffWorkspace.expanded ? 'true' : 'false')
        }
        if (serviceFeeBtn) {
          serviceFeeBtn.classList.toggle('active', kernel.state.staffWorkspace.serviceFeeEnabled)
        }
        if (discountBtn) {
          discountBtn.classList.toggle('active', currentStaffDiscountPercent() > 0)
          discountBtn.innerText =
            currentStaffDiscountPercent() > 0 ? `🏷️ ${currentStaffDiscountPercent()}%折數` : '🏷️ 折扣'
        }
      }

      function updateStaffWorkspace() {
        const streamList = findElement('staffWorkspaceStreamList')
        const metaEl = findElement('staffWorkspaceMeta')
        const totalEl = findElement('staffWorkspaceTotal')
        if (!streamList || !metaEl || !totalEl) {
          return
        }

        const entries = currentDraftEntries()
        const batches = kernel.state.activeSubmittedBatches
        const totals = summarizeStaffWorkspace(entries, batches)
        const estimatedCheckout = calculateStaffOrderTotal(
          totals.submittedSubtotal,
          currentStaffDiscountPercent(),
          kernel.state.staffWorkspace.serviceFeeEnabled
        )
        metaEl.innerText = `${totals.draftEntryCount} 項未送出 · ${totals.acceptedEntryCount} 項已接單 · ${totals.acceptedBatchCount} 張已接單${currentStaffDiscountPercent() > 0 || kernel.state.staffWorkspace.serviceFeeEnabled ? ' · 已套用整單設定' : ''}`
        totalEl.innerText = formatCurrency(estimatedCheckout)

        streamList.innerHTML =
          totals.groups.length === 0
            ? "<div class='staff-stream-empty'>目前沒有未送出或已接單品項</div>"
            : totals.groups.map((group) => renderStaffWorkspaceGroup(group)).join('')

        streamList.classList.toggle('is-expanded', kernel.state.staffWorkspace.expanded)
        applyStaffWorkspaceState()
      }

      function stopInventoryRevisionWatch() {
        stopCatalogRevisionWatch?.()
        stopCatalogRevisionWatch = null
      }

      function refreshCatalogDrivenUi() {
        renderMenuGrid()
        renderCart()
      }

      function syncInventoryRevisionWatch() {
        const activePage = ui.getActivePage()
        const shouldWatch = activePage === 'orderPage' || activePage === 'productPage'
        if (!shouldWatch) {
          stopInventoryRevisionWatch()
          return
        }
        if (stopCatalogRevisionWatch) {
          return
        }
        stopCatalogRevisionWatch = data.watchCatalogRevision((event) => {
          if (!event.changedSegments.includes('inventory')) {
            return
          }
          refreshCatalogDrivenUi()
        })
      }

      function updatePanelCopy() {
        const draftTitle = findElement('draftPanelTitle')
        const draftSubtitle = findElement('draftPanelSubtitle')
        const submittedTitle = findElement('submittedPanelTitle')
        const submittedSubtitle = findElement('submittedPanelSubtitle')
        const menuSubtitle = findElement('menuPanelSubtitle')

        if (kernel.state.currentMode === 'customer') {
          if (draftTitle) draftTitle.innerText = '購物車'
          if (draftSubtitle) draftSubtitle.innerText = '同桌客人會即時看到同一份購物車'
          if (submittedTitle) submittedTitle.innerText = '訂單紀錄'
          if (submittedSubtitle) submittedSubtitle.innerText = '待接單與已接單分開顯示'
          if (menuSubtitle) menuSubtitle.innerText = '依主分類瀏覽與加點'
          updateFloatingActions()
          return
        }

        if (draftTitle) draftTitle.innerText = '購物車'
        if (draftSubtitle) draftSubtitle.innerText = '僅保留在目前終端，送出後直接成立訂單紀錄'
        if (submittedTitle) submittedTitle.innerText = '訂單紀錄'
        if (submittedSubtitle) submittedSubtitle.innerText = '可補印、編輯，結帳只統計訂單紀錄'
        if (menuSubtitle) menuSubtitle.innerText = '依主分類瀏覽與加點'
        updateFloatingActions()
      }

      function resetStaffWorkspaceState() {
        kernel.state.staffWorkspace.expanded = false
        kernel.state.staffWorkspace.serviceFeeEnabled = false
        kernel.state.staffWorkspace.discount = null
      }

      function renderMenuGrid() {
        const chips = findElement('menuCategoryChips')
        const grid = findElement('menuGrid')
        if (!chips || !grid) {
          return
        }

        const activeCategory = kernel.state.menuFilter.activeCategoryKey || defaultCategory
        chips.innerHTML = kernel.categories
          .map((categoryKey) => {
            const category = kernel.menuMeta.categories[categoryKey]
            if (!category) return ''
            const activeClass = activeCategory === categoryKey ? ' active' : ''
            return `<button class="categoryBtn btn-effect${activeClass}" data-action="open-menu-category" data-category="${categoryKey}">${escapeHtml(category.shortLabel)}</button>`
          })
          .join('')

        const category = kernel.menuMeta.categories[activeCategory]
        if (!category) {
          grid.innerHTML = "<div class='entry-card'>目前沒有分類資料</div>"
          return
        }

        const visibleItemIds = new Set(
          kernel.helpers.getMenuItemsByMode(kernel.state.currentMode).map((item) => item.id)
        )

        grid.innerHTML = category.sections
          .map((section) => {
            const items = section.items
              .filter((item) => visibleItemIds.has(item.id))
              .map((item) => {
                const disabled = kernel.helpers.isItemSoldOut(item.id)
                const price = kernel.helpers.getItemDisplayPrice(item.id)
                const tags = item.tags?.length
                  ? `<div class="menu-item-tags">${escapeHtml(item.tags.join(' / '))}</div>`
                  : ''
                return `
                  <button
                    class="item btn-effect${disabled ? ' sold-out' : ''}"
                    data-action="select-menu-item"
                    data-item-id="${escapeHtml(item.id)}"
                    ${disabled ? 'disabled' : ''}
                  >
                    <span>
                      ${escapeHtml(item.name)}
                      ${tags}
                    </span>
                    <b>${formatCurrency(price)}</b>
                  </button>
                `
              })
              .join('')
            if (!items) {
              return ''
            }
            return `<div class="sub-cat-title">${escapeHtml(section.label)}</div>${items}`
          })
          .join('')
      }

      function renderDraftSummary(entries: PosOrderEntry[]) {
        const total = entries.reduce((sum, entry) => sum + entry.subtotal, 0)
        const totalEl = findElement('total')
        const floatingSummary = findElement('floatingDraftSummary')
        if (totalEl) {
          totalEl.innerText = `總金額：${formatCurrency(total)}`
        }
        if (floatingSummary) {
          floatingSummary.innerText = `${entries.length} 件 · ${formatCurrency(total)}`
        }
      }

      function renderEntryCard(
        entry: PosOrderEntry,
        actions: { editAction: string; deleteAction: string; treatAction?: string }
      ) {
        const childLines = getVisibleDetailChildLines(entry)
        const isTreat = entry.lines.every((line) => line.isTreat)
        const summary = getDisplaySummary(entry)
        return `
          <article class="entry-card">
            <div class="entry-card-head">
              <div>
                <div class="entry-card-title">${escapeHtml(entry.summary.title)}</div>
                ${renderEntrySubtitleLines([{ text: summary.mainSummary }])}
              </div>
              <div class="entry-card-total">${formatCurrency(entry.subtotal)}</div>
            </div>
            ${
              childLines.length > 0
                ? `<div class="entry-child-list">${childLines
                    .map((line) => {
                      const suffix = line.selectionSummary ? ` · ${escapeHtml(line.selectionSummary)}` : ''
                      const delta = line.lineTotal > 0 ? ` ${formatCurrency(line.lineTotal)}` : ''
                      return `<div class="entry-child-line">${escapeHtml(line.shortName)}${suffix}${delta}</div>`
                    })
                    .join('')}</div>`
                : ''
            }
            <div class="entry-card-head" style="margin-top:12px;">
              <div>
                ${renderEntrySubtitleLines([{ text: entry.summary.quantityLabel }, { text: summary.drinkSummary }])}
              </div>
              <div class="entry-card-actions">
                <button class="mini-btn primary btn-effect" data-action="${actions.editAction}" data-entry-id="${escapeHtml(entry.entryId)}">編輯</button>
                ${
                  actions.treatAction
                    ? `<button class="mini-btn ${isTreat ? 'success' : 'warning'} btn-effect" data-action="${actions.treatAction}" data-entry-id="${escapeHtml(entry.entryId)}">${isTreat ? '取消招待' : '招待'}</button>`
                    : ''
                }
                <button class="mini-btn danger btn-effect" data-action="${actions.deleteAction}" data-entry-id="${escapeHtml(entry.entryId)}">刪除</button>
              </div>
            </div>
          </article>
        `
      }

      function renderDraftEntries() {
        const list = findElement('cart-list')
        if (!list) return
        const entries = currentDraftEntries()
        renderDraftSummary(entries)
        if (entries.length === 0) {
          list.innerHTML = "<div class='entry-card'>目前沒有購物車內容</div>"
          return
        }

        list.innerHTML = entries
          .map((entry) =>
            renderEntryCard(entry, {
              editAction: 'edit-draft-entry',
              deleteAction: 'remove-draft-entry',
              treatAction: kernel.state.currentMode === 'staff' ? 'toggle-draft-entry-treat' : undefined,
            })
          )
          .join('')
      }

      function renderBatchCard(batch: PosOrderBatch, options: RenderBatchOptions) {
        const statusChip = getBatchStatusChip(options.pending ? 'pending' : 'accepted')
        const actions = options.pending
          ? ''
          : options.editable
            ? `
                <div class="batch-card-actions">
                  <button class="mini-btn primary btn-effect" data-action="edit-submitted-batch" data-batch-id="${escapeHtml(batch.batchId)}">編輯</button>
                  <button class="mini-btn primary btn-effect" data-action="reprint-submitted-batch" data-batch-id="${escapeHtml(batch.batchId)}">補印</button>
                </div>
              `
            : ''
        return `
          <article class="batch-card ${options.pending ? 'pending' : 'accepted'}">
            <div class="batch-card-head">
              <div>
                <div class="batch-card-title">${escapeHtml(batch.requestLabel)} ${statusChip}</div>
                <div class="batch-card-subtitle">${escapeHtml(batch.customer?.name || '')}${batch.customer?.phone ? ` · ${escapeHtml(batch.customer.phone)}` : ''}</div>
              </div>
              <div class="batch-card-total">${formatCurrency(batch.subtotal)}</div>
            </div>
            <div class="batch-entry-list">
              ${batch.entries
                .map((entry) => {
                  const grouped = groupOrderLines(entry.lines)[0]
                  const childLines = (grouped?.children || groupChildLines(entry)).filter(
                    (line) => line.courseKind !== 'drink'
                  )
                  const summary = getDisplaySummary(entry)
                  const entryActions =
                    options.pending || !options.editable
                      ? ''
                      : `
                          <div class="entry-card-actions">
                            <button class="mini-btn primary btn-effect" data-action="edit-submitted-entry" data-batch-id="${escapeHtml(batch.batchId)}" data-entry-id="${escapeHtml(entry.entryId)}">編輯</button>
                          </div>
                        `
                  return `
                    <div class="entry-line-row">
                      <div>
                        <div class="entry-card-title">${escapeHtml(entry.summary.title)}</div>
                        ${renderEntrySubtitleLines([
                          { text: entry.summary.quantityLabel },
                          { text: summary.mainSummary },
                          { text: summary.drinkSummary },
                        ])}
                        ${childLines
                          .map(
                            (line) =>
                              `<div class="entry-child-line">${escapeHtml(line.shortName)}${line.selectionSummary ? ` · ${escapeHtml(line.selectionSummary)}` : ''}</div>`
                          )
                          .join('')}
                        ${entryActions}
                      </div>
                      <div class="entry-card-total">${formatCurrency(entry.subtotal)}</div>
                    </div>
                  `
                })
                .join('')}
            </div>
            ${actions}
          </article>
        `
      }

      function renderSubmittedBatches() {
        const list = findElement('submittedBatchList')
        if (!list) return
        const cards = getVisibleOrderBatches(
          kernel.state.currentMode,
          kernel.state.activePendingBatches,
          kernel.state.activeSubmittedBatches
        )
        const html = cards.map(({ batch, editable, pending }) => renderBatchCard(batch, { editable, pending })).join('')
        list.innerHTML =
          html ||
          (kernel.state.currentMode === 'customer'
            ? "<div class='batch-card'>目前沒有訂單紀錄</div>"
            : "<div class='batch-card'>目前沒有訂單紀錄</div>")
      }

      function renderPendingOverlayEntries(entries: PosOrderEntry[]) {
        return entries
          .map((entry) => {
            const summary = getDisplaySummary(entry)
            return `
              <div class="entry-card">
                <div class="entry-card-head">
                  <div>
                    <div class="entry-card-title">${escapeHtml(entry.summary.title)}</div>
                    ${renderEntrySubtitleLines([
                      { text: entry.summary.quantityLabel },
                      { text: summary.mainSummary },
                      { text: summary.drinkSummary },
                    ])}
                  </div>
                  <div class="entry-card-total">${formatCurrency(entry.subtotal)}</div>
                </div>
              </div>
            `
          })
          .join('')
      }

      function renderPendingOverlayPreview(
        preview: PosPendingBatchPreview,
        options?: { loading?: boolean; error?: string | null }
      ) {
        return preview.entries
          .map(
            (entry) => `
              <div class="entry-card pending-overlay-preview-card${options?.loading ? ' is-loading' : ''}${options?.error ? ' is-error' : ''}">
                <div class="entry-card-head">
                  <div>
                    <div class="entry-card-title">${escapeHtml(entry.title)}</div>
                    ${renderEntrySubtitleLines([
                      { text: entry.quantityLabel },
                      {
                        text: options?.error
                          ? options.error
                          : options?.loading
                            ? '正在載入訂單明細…'
                            : '等待載入完整明細',
                        className: 'pending-overlay-preview-copy',
                      },
                    ])}
                  </div>
                  <div class="entry-card-total pending-overlay-preview-total">${options?.error ? '明細未載入' : '載入中'}</div>
                </div>
              </div>
            `
          )
          .join('')
      }

      function renderPendingOverlay() {
        const overlay = findElement('pendingBatchOverlay')
        const title = findElement('pendingOverlayTitle')
        const list = findElement('pendingOverlayList')
        if (!overlay || !title || !list) return
        const pending = selectPendingOverlayBatch(kernel.state.currentMode, kernel.state.pendingBatchPreviews)
        if (!pending) {
          overlay.classList.remove('show')
          kernel.state.currentPendingBatchId = null
          kernel.state.currentPendingTable = null
          return
        }

        kernel.state.currentPendingTable = pending.table
        kernel.state.currentPendingBatchId = pending.batch.batchId
        title.innerText = `桌號：${pending.table} · ${pending.batch.requestLabel}`

        const requestKey = `${pending.table}:${pending.batch.batchId}`
        if (
          pendingOverlayState.requestKey &&
          pendingOverlayState.requestKey !== requestKey &&
          !pendingOverlayState.loading
        ) {
          pendingOverlayState.batch = null
          pendingOverlayState.error = null
        }
        const resolvedBatch =
          pendingOverlayState.requestKey === requestKey && pendingOverlayState.batch?.batchId === pending.batch.batchId
            ? pendingOverlayState.batch
            : null

        list.innerHTML = resolvedBatch
          ? renderPendingOverlayEntries(resolvedBatch.entries)
          : renderPendingOverlayPreview(pending.batch, {
              loading: pendingOverlayState.requestKey === requestKey && pendingOverlayState.loading,
              error:
                pendingOverlayState.requestKey === requestKey && pendingOverlayState.error
                  ? pendingOverlayState.error
                  : null,
            })
        overlay.classList.add('show')
      }

      async function ensurePendingOverlayBatchDetail(table: string, preview: PosPendingBatchPreview) {
        const requestKey = `${table}:${preview.batchId}`
        if (
          pendingOverlayState.requestKey === requestKey &&
          (pendingOverlayState.loading || pendingOverlayState.batch)
        ) {
          renderPendingOverlay()
          return
        }

        pendingOverlayState.requestKey = requestKey
        pendingOverlayState.loading = true
        pendingOverlayState.batch = null
        pendingOverlayState.error = null
        renderPendingOverlay()

        try {
          const batch = await data.readPendingBatchDetail(table, preview.batchId)
          if (pendingOverlayState.requestKey !== requestKey) {
            return
          }
          pendingOverlayState.loading = false
          pendingOverlayState.batch = batch
          pendingOverlayState.error = batch ? null : '找不到完整訂單明細'
        } catch {
          if (pendingOverlayState.requestKey !== requestKey) {
            return
          }
          pendingOverlayState.loading = false
          pendingOverlayState.batch = null
          pendingOverlayState.error = '完整訂單明細載入失敗'
        }

        renderPendingOverlay()
      }

      function openBuilder(itemId: string, target: BuilderTarget, entry?: PosOrderEntry, batchId?: string) {
        const state = entry ? hydrateBuilderState(entry, target, batchId) : createBuilderState(itemId, target, batchId)
        kernel.state.currentBuilder = state
        renderBuilder()
      }

      function closeBuilder() {
        kernel.state.currentBuilder = null
        const host = findElement('builderHost')
        if (host) host.innerHTML = ''
      }

      function renderBuilder() {
        const host = findElement('builderHost')
        if (!host) return
        const builderState = kernel.state.currentBuilder
        if (!builderState) {
          host.innerHTML = ''
          return
        }

        const presentation = buildBuilderPresentation({
          state: builderState,
          helpers: kernel.helpers,
        })
        if (!presentation) {
          host.innerHTML = renderBuilderMissingMarkup('找不到商品')
          return
        }

        const firstIssue = getFirstBuilderIssue([...presentation.missingIssues, ...presentation.soldOutIssues])
        host.innerHTML = renderBuilderMarkup({
          presentation,
          editing: Boolean(builderState.editingEntryId),
          issueMessage: firstIssue ? `${firstIssue.label}尚未完成` : '',
        })
        if (firstIssue) {
          guideBuilderIssue(host, firstIssue.groupId)
        }
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
          const batch = kernel.state.activeSubmittedBatches.find(
            (candidate) => candidate.batchId === builderState.batchId
          )
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

      function renderCart() {
        setCustomerBoxVisibility()
        updatePanelCopy()
        renderMenuGrid()
        renderBuilder()
        renderDraftEntries()
        renderSubmittedBatches()
        renderPendingOverlay()
        if (isCustomerMode()) {
          setOrderTab(kernel.state.menuFilter.activeTab)
        } else {
          updateFloatingActions()
        }
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
          const isTreat = !isEntryTreat(entry)
          return cloneEntryWithTreatState(entry, isTreat)
        })
        await persistDraft(next)
        renderCart()
      }

      async function updateSubmittedEntrySet(
        batchId: string,
        buildNext: (entries: PosOrderEntry[]) => PosOrderEntry[]
      ) {
        const batch = kernel.state.activeSubmittedBatches.find((candidate) => candidate.batchId === batchId)
        if (!batch) return
        await data.updateSubmittedBatch(currentTable(), batchId, buildNext(batch.entries))
        renderCart()
      }

      async function toggleSubmittedEntryTreat(batchId: string, entryId: string) {
        await updateSubmittedEntrySet(batchId, (entries) =>
          entries.map((entry) => {
            if (entry.entryId !== entryId) {
              return entry
            }
            return cloneEntryWithTreatState(entry, !isEntryTreat(entry))
          })
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

      function showPendingBatchOverlay() {
        const pending = selectPendingOverlayBatch(kernel.state.currentMode, kernel.state.pendingBatchPreviews)
        renderPendingOverlay()
        if (pending) {
          void ensurePendingOverlayBatchDetail(pending.table, pending.batch)
        }
      }

      function closePendingBatchOverlay() {
        pendingOverlayState.requestKey = null
        pendingOverlayState.loading = false
        pendingOverlayState.batch = null
        pendingOverlayState.error = null
        renderPendingOverlay()
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
          return `<div class="entry-card">${emptyText}</div>`
        }
        return entries
          .map((entry) => {
            const grouped = groupOrderLines(entry.lines)[0]
            const children = (grouped?.children || groupChildLines(entry)).filter((line) => line.courseKind !== 'drink')
            const summary = getDisplaySummary(entry)
            return `
              <article class="entry-card split-entry-card">
                <div class="entry-card-head">
                  <div>
                    <div class="entry-card-title">${escapeHtml(entry.summary.title)}</div>
                    ${summary.mainSummary ? `<div class="entry-card-subtitle">${escapeHtml(summary.mainSummary)}</div>` : ''}
                    ${summary.drinkSummary ? `<div class="entry-card-subtitle">${escapeHtml(summary.drinkSummary)}</div>` : ''}
                  </div>
                  <div class="entry-card-total">${formatCurrency(entry.subtotal)}</div>
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
        return {
          baseTotal,
          finalTotal,
        }
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

      async function printReceipt(data: PosReceiptData, isTicket = false) {
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
        container.innerHTML = buildReceiptMarkup(
          {
            ...data,
            lines: data.lines,
          },
          title
        )
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

      async function showQrModal(table: string) {
        const modal = findElement('qrCodeModal')
        const container = findElement('qrcode')
        const title = findElement('qrTableTitle')
        if (!modal || !container || !title) return
        title.innerText = table
        const base = `${location.origin}${location.pathname}?table=${encodeURIComponent(table)}`
        await renderQrCode(container, base, 220)
        modal.style.display = 'flex'
      }

      function closeQrModal() {
        const modal = findElement('qrCodeModal')
        const container = findElement('qrcode')
        if (modal) modal.style.display = 'none'
        if (container) container.innerHTML = ''
      }

      function toggleQrMode() {
        kernel.state.isQrMode = !kernel.state.isQrMode
        document.body.classList.toggle('qr-select-mode', kernel.state.isQrMode)
      }

      function startClock() {
        const systemTime = findElement('systemTime')
        const seatTimer = findElement('seatTimer')
        const update = () => {
          if (systemTime) {
            systemTime.innerText = new Date().toLocaleString('zh-TW', { hour12: false })
          }
          if (!seatTimer || !kernel.state.selectedTable) {
            if (seatTimer) seatTimer.innerText = ''
            return
          }
          const startedAt = kernel.state.tableTimers[kernel.state.selectedTable]
          if (!startedAt) {
            seatTimer.innerText = ''
            return
          }
          const diffMinutes = Math.floor((Date.now() - startedAt) / 60000)
          seatTimer.innerText = `入座 ${diffMinutes} 分`
        }
        update()
        if (kernel.state.seatTimerInterval) {
          clearInterval(kernel.state.seatTimerInterval)
        }
        kernel.state.seatTimerInterval = setInterval(update, 1000)
      }

      async function showApp(options: { skipHome?: boolean; skipStaffLive?: boolean } = {}) {
        const loginScreen = findElement('login-screen')
        const appContainer = findElement('app-container')
        if (loginScreen) loginScreen.style.display = 'none'
        if (appContainer) appContainer.style.display = 'block'
        startClock()
        if (!options.skipStaffLive) {
          await data.startStaffLive()
        }
        if (!options.skipHome) {
          ui.showHome()
        }
      }

      async function renderTableGrid() {
        const grid = requireElement('tableSelectGrid')
        grid.innerHTML = ''
        kernel.tables.forEach((table) => {
          const status = kernel.state.tableStatuses[table]
          const className = status === 'yellow' ? 'status-yellow' : status === 'red' ? 'status-red' : 'status-white'
          grid.innerHTML += `<div class="tableBtn btn-effect ${className}" data-action="select-table" data-table="${escapeHtml(table)}"><b>${escapeHtml(table)}</b></div>`
        })
      }

      async function openTableSelect() {
        closeBuilder()
        resetStaffWorkspaceState()
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
        closeBuilder()
        ui.showHome()
      }

      async function openOrderPage(table: string, options: { mode?: 'staff' | 'customer' } = {}) {
        const mode = options.mode || kernel.state.currentMode
        if (kernel.state.isQrMode && mode !== 'customer') {
          await showQrModal(table)
          return
        }
        setCustomerMode(mode)
        if (mode === 'staff') {
          resetStaffWorkspaceState()
        }
        requireElement('seatLabel').innerText = `（${table}）`
        kernel.state.menuFilter.activeCategoryKey = defaultCategory
        kernel.state.menuFilter.activeTab = 'menu'
        closeBuilder()
        ui.hideAll()
        ui.activatePage('orderPage')
        await data.ensureCatalog()
        await data.startTableLiveSession(mode, table)
        syncCustomerInputs()
        setCustomerBoxVisibility()
        updatePanelCopy()
        renderMenuGrid()
        renderCart()
      }

      async function updateCustomerInfoSilently() {
        const table = maybeCurrentTable()
        if (!table) return
        await persistCustomerInfoSilently({
          mode: kernel.state.currentMode,
          table,
          entries: currentDraftEntries(),
          customer: readCustomerInfo(),
          saveCustomerDraft: data.saveCustomerDraft,
        })
      }

      async function openCloseBusinessModal() {
        const modal = findElement('summaryModal')
        const orders = await data.listClosedOrdersForBusinessDay(new Date())
        const total = orders.reduce((sum, order) => sum + (order.total || 0), 0)
        const countEl = findElement('sumCount')
        const totalEl = findElement('sumTotal')
        if (countEl) countEl.innerText = `${orders.length} 單`
        if (totalEl) totalEl.innerText = formatCurrency(total)
        if (modal) {
          modal.style.display = 'flex'
        }
      }

      function closeSummaryModal() {
        const modal = findElement('summaryModal')
        if (modal) {
          modal.style.display = 'none'
        }
      }

      ui.on('click', 'check-login', () => {
        void data.checkLogin()
      })
      ui.on('keydown', 'login-password', (event) => {
        if (!(event instanceof KeyboardEvent) || event.key !== 'Enter') return
        event.preventDefault()
        void data.checkLogin()
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
        goHome()
      })
      ui.on('click', 'save-and-exit', () => {
        void openTableSelect()
      })
      ui.on('click', 'open-menu-category', (_event, element) => {
        const category = element.dataset.category as PosMenuCategoryKey | undefined
        if (!category) return
        kernel.state.menuFilter.activeCategoryKey = category
        renderMenuGrid()
      })
      ui.on('click', 'set-order-tab', (_event, element) => {
        const tab = element.dataset.tab as PosOrderTab | undefined
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
        renderBuilder()
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
        renderBuilder()
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
        stopInventoryRevisionWatch()
      })

      ui.subscribePage(() => {
        syncInventoryRevisionWatch()
      })

      const service: PosSalesService = {
        showApp,
        openTableSelect,
        openSettingsPage,
        goHome,
        renderMenu: renderMenuGrid,
        renderCart,
        renderTableGrid,
        showPendingBatchOverlay,
        closePendingBatchOverlay,
        closeCheckoutModal,
        printReceipt,
      }

      context.registerService(POS_SALES_SERVICE_KEY, service)
      context.registerService('pos-sales', service)

      ui.startRouter()
      const urlParams = new URLSearchParams(location.search)
      const tableParam = urlParams.get('table')
      if (tableParam) {
        sessionStorage.setItem('isLoggedIn', 'true')
        setCustomerMode('customer')
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
