import type { PosDataService } from '@/features/pos-data/service'
import type { PosKernelService } from '@/features/pos-kernel/service'
import type { PosMenuCategoryKey, PosOrderEntry } from '@/features/pos-kernel/types'
import type { PosUiService } from '@/features/pos-shell/service'
import {
  calculateStaffOrderTotal,
  getFloatingBarViewModel,
  getStaffWorkspaceRowActions,
  type StaffWorkspaceGroup,
  type StaffWorkspaceRow,
  summarizeStaffWorkspace,
} from './runtime-support'
import { escapeHtml, flattenBatchLines, formatCurrency, getStaffCategoryLabel } from './runtime-utils'

type WorkspaceDeps = {
  kernel: PosKernelService
  data: PosDataService
  ui: PosUiService
  defaultCategory: PosMenuCategoryKey
  currentDraftEntries: () => PosOrderEntry[]
  isCustomerMode: () => boolean
  getStopCatalogRevisionWatch: () => (() => void) | null
  setStopCatalogRevisionWatch: (stop: (() => void) | null) => void
  renderMenuGrid: () => void
  renderCart: () => void
}

export function createPosSalesWorkspaceModule({
  kernel,
  data,
  ui,
  defaultCategory,
  currentDraftEntries,
  isCustomerMode,
  getStopCatalogRevisionWatch,
  setStopCatalogRevisionWatch,
  renderMenuGrid,
  renderCart,
}: WorkspaceDeps) {
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

  function renderStaffWorkspaceActions(row: StaffWorkspaceRow) {
    const treat = isEntryTreat(row.entry)
    return `
      <div class="entry-card-actions entry-card-actions--compact">
        ${getStaffWorkspaceRowActions(row, treat)
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

  function renderStaffWorkspaceEntry(row: StaffWorkspaceRow) {
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

  function renderStaffWorkspaceGroup(group: StaffWorkspaceGroup) {
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
    const floatingBar = document.getElementById('customerFloatingBar')
    const staffWorkspace = document.getElementById('staffFloatingWorkspace')
    const toggleLabel = document.getElementById('staffWorkspaceToggleLabel')
    const toggleButton = document.getElementById('staffWorkspaceToggleButton')
    const serviceFeeBtn = document.getElementById('staffServiceFeeBtn')
    const discountBtn = document.getElementById('staffDiscountBtn')
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
      discountBtn.innerText = currentStaffDiscountPercent() > 0 ? `🏷️ ${currentStaffDiscountPercent()}%折數` : '🏷️ 折扣'
    }
  }

  function updateStaffWorkspace() {
    const streamList = document.getElementById('staffWorkspaceStreamList')
    const metaEl = document.getElementById('staffWorkspaceMeta')
    const totalEl = document.getElementById('staffWorkspaceTotal')
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
    getStopCatalogRevisionWatch()?.()
    setStopCatalogRevisionWatch(null)
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
    if (getStopCatalogRevisionWatch()) {
      return
    }
    setStopCatalogRevisionWatch(
      data.watchCatalogRevision((event) => {
        if (!event.changedSegments.includes('inventory')) {
          return
        }
        refreshCatalogDrivenUi()
      })
    )
  }

  function updateFloatingActions() {
    const floatingBar = document.getElementById('customerFloatingBar')
    const customerMain = document.getElementById('customerFloatingMain')
    const staffWorkspace = document.getElementById('staffFloatingWorkspace')
    const floatingLabel = document.getElementById('floatingActionLabel')
    const clearBtn = document.getElementById('floatingClearBtn') as HTMLButtonElement | null
    const primaryBtn = document.getElementById('floatingPrimaryBtn') as HTMLButtonElement | null
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

  function updatePanelCopy() {
    const draftTitle = document.getElementById('draftPanelTitle')
    const draftSubtitle = document.getElementById('draftPanelSubtitle')
    const submittedTitle = document.getElementById('submittedPanelTitle')
    const submittedSubtitle = document.getElementById('submittedPanelSubtitle')
    const menuSubtitle = document.getElementById('menuPanelSubtitle')

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

  function syncCustomerInputs() {
    const info = kernel.state.selectedTable ? kernel.state.tableCustomers[kernel.state.selectedTable] || {} : {}
    const nameInput = document.getElementById('custName') as HTMLInputElement | null
    const phoneInput = document.getElementById('custPhone') as HTMLInputElement | null
    if (nameInput) nameInput.value = String(info.name || '')
    if (phoneInput) phoneInput.value = String(info.phone || '')
  }

  function setCustomerBoxVisibility() {
    const box = document.getElementById('orderCustomerBox')
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

  function renderMenuCategoryChips() {
    const chips = document.getElementById('menuCategoryChips')
    if (!chips) {
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
  }

  return {
    currentStaffDiscountPercent,
    currentSubmittedTotal,
    isEntryTreat,
    normalizeEntry,
    getDisplaySummary,
    flattenBatchLines(batch: Parameters<typeof flattenBatchLines>[0]) {
      return flattenBatchLines(batch, normalizeEntry)
    },
    renderEntrySubtitleLines,
    updateStaffWorkspace,
    stopInventoryRevisionWatch,
    refreshCatalogDrivenUi,
    syncInventoryRevisionWatch,
    updateFloatingActions,
    updatePanelCopy,
    resetStaffWorkspaceState,
    syncCustomerInputs,
    setCustomerBoxVisibility,
    setCustomerMode,
    renderMenuCategoryChips,
  }
}
