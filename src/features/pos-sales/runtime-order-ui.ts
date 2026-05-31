import type { PosDataService } from '@/features/pos-data/service'
import type { PosKernelService } from '@/features/pos-kernel/service'
import type {
  PosBuilderState,
  PosMenuCategoryKey,
  PosOrderBatch,
  PosOrderEntry,
  PosPendingBatchPreview,
} from '@/features/pos-kernel/types'
import { groupOrderLines } from '@/shared/grouped-order-lines'
import { buildBuilderPresentation, createBuilderState, getFirstBuilderIssue, hydrateBuilderState } from './builder'
import { renderBuilderMarkup, renderBuilderMissingMarkup } from './builder-view'
import {
  getBatchStatusChip,
  getVisibleOrderBatches,
  guideBuilderIssue,
  selectPendingOverlayBatch,
} from './runtime-support'
import { escapeHtml, formatCurrency, getVisibleDetailChildLines, groupChildLines } from './runtime-utils'

type PendingOverlayState = {
  requestKey: string | null
  loading: boolean
  batch: PosOrderBatch | null
  error: string | null
}

type OrderUiDeps = {
  kernel: PosKernelService
  data: PosDataService
  defaultCategory: PosMenuCategoryKey
  currentDraftEntries: () => PosOrderEntry[]
  isCustomerMode: () => boolean
  pendingOverlayState: PendingOverlayState
  setOrderTab: (tab: 'menu' | 'cart' | 'orders') => void
  updateFloatingActions: () => void
  updatePanelCopy: () => void
  setCustomerBoxVisibility: () => void
  getDisplaySummary: (entry: PosOrderEntry) => ReturnType<PosKernelService['helpers']['buildEntryDisplaySummary']>
  renderEntrySubtitleLines: (lines: Array<{ text: string; className?: string } | null | undefined | false>) => string
}

export function createPosSalesOrderUiModule({
  kernel,
  data,
  defaultCategory,
  currentDraftEntries,
  isCustomerMode,
  pendingOverlayState,
  setOrderTab,
  updateFloatingActions,
  updatePanelCopy,
  setCustomerBoxVisibility,
  getDisplaySummary,
  renderEntrySubtitleLines,
}: OrderUiDeps) {
  function renderMenuGrid() {
    const grid = document.getElementById('menuGrid')
    if (!grid) {
      return
    }

    const activeCategory = kernel.state.menuFilter.activeCategoryKey || defaultCategory
    const category = kernel.menuMeta.categories[activeCategory]
    if (!category) {
      grid.innerHTML = "<div class='entry-card'>目前沒有分類資料</div>"
      return
    }

    const visibleItemIds = new Set(kernel.helpers.getMenuItemsByMode(kernel.state.currentMode).map((item) => item.id))
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
    const totalEl = document.getElementById('total')
    const floatingSummary = document.getElementById('floatingDraftSummary')
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
    const list = document.getElementById('cart-list')
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

  function renderBatchCard(batch: PosOrderBatch, options: { editable: boolean; pending: boolean }) {
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
    const list = document.getElementById('submittedBatchList')
    if (!list) return
    const cards = getVisibleOrderBatches(
      kernel.state.currentMode,
      kernel.state.activePendingBatches,
      kernel.state.activeSubmittedBatches
    )
    const html = cards.map(({ batch, editable, pending }) => renderBatchCard(batch, { editable, pending })).join('')
    list.innerHTML = html || "<div class='batch-card'>目前沒有訂單紀錄</div>"
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
                    text: options?.error ? options.error : options?.loading ? '正在載入訂單明細…' : '等待載入完整明細',
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
    const overlay = document.getElementById('pendingBatchOverlay')
    const title = document.getElementById('pendingOverlayTitle')
    const list = document.getElementById('pendingOverlayList')
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
    if (pendingOverlayState.requestKey === requestKey && (pendingOverlayState.loading || pendingOverlayState.batch)) {
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

  function openBuilder(itemId: string, target: PosBuilderState['target'], entry?: PosOrderEntry, batchId?: string) {
    const state = entry ? hydrateBuilderState(entry, target, batchId) : createBuilderState(itemId, target, batchId)
    kernel.state.currentBuilder = state
    renderBuilder()
  }

  function closeBuilder() {
    kernel.state.currentBuilder = null
    const host = document.getElementById('builderHost')
    if (host) host.innerHTML = ''
  }

  function renderBuilder() {
    const host = document.getElementById('builderHost')
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

  return {
    renderMenuGrid,
    renderDraftEntries,
    renderSubmittedBatches,
    renderPendingOverlay,
    ensurePendingOverlayBatchDetail,
    openBuilder,
    closeBuilder,
    renderBuilder,
    showPendingBatchOverlay,
    closePendingBatchOverlay,
    renderCart,
  }
}
