import type {
  PosBatchStatus,
  PosEntryDisplaySummary,
  PosOrderBatch,
  PosOrderEntry,
  PosOrderLine,
  PosPendingBatchPreview,
  PosReceiptData,
  PosTableCustomer,
} from '@/features/pos-kernel/types'
import { groupOrderLines } from '@/shared/grouped-order-lines'

type PosOrderMode = 'customer' | 'staff'

type VisibleBatchCard = {
  batch: PosOrderBatch
  editable: boolean
  pending: boolean
}

type PendingOverlayBatch = {
  table: string
  batch: PosPendingBatchPreview
}

type ReceiptGroup = {
  main: PosOrderLine
  children: PosOrderLine[]
}

type BuilderIssueGuideHost = {
  querySelector?: (selector: string) => BuilderIssueGuideElement | null | undefined
}

type BuilderIssueGuideElement = {
  classList?: {
    add?: (...tokens: string[]) => void
  }
  scrollIntoView?: (options?: unknown) => void
  querySelector?: (selector: string) => BuilderIssueGuideFocusable | null | undefined
}

type BuilderIssueGuideFocusable = {
  focus?: () => void
}

type PersistCustomerInfoSilentlyParams = {
  mode: PosOrderMode
  table: string
  entries: PosOrderEntry[]
  customer: PosTableCustomer
  saveCustomerDraft: (table: string, entries: PosOrderEntry[], customer: PosTableCustomer) => Promise<unknown>
}

type SubmitDraftBatchParams = {
  mode: PosOrderMode
  table: string
  entries: PosOrderEntry[]
  customer: PosTableCustomer
  submitCustomerDraft: (table: string, entries: PosOrderEntry[], customer: PosTableCustomer) => Promise<PosOrderBatch>
  createStaffBatch: (table: string, entries: PosOrderEntry[], customer?: PosTableCustomer) => Promise<PosOrderBatch>
  printKitchenTicket: (batch: PosOrderBatch) => Promise<void>
}

type AcceptPendingBatchParams = {
  table: string
  batchId: string
  acceptPendingBatch: (table: string, batchId: string) => Promise<PosOrderBatch | null>
  printKitchenTicket: (batch: PosOrderBatch) => Promise<void>
}

type UpdateSubmittedBatchParams = {
  table: string
  batchId: string
  entries: PosOrderEntry[]
  updateSubmittedBatch: (table: string, batchId: string, entries: PosOrderEntry[]) => Promise<PosOrderBatch | null>
  printKitchenTicket: (batch: PosOrderBatch) => Promise<void>
}

type FloatingBarViewModel = {
  visible: boolean
  label: string
  clearVisible: boolean
  clearText: string
  clearAction: string
  primaryVisible: boolean
  primaryText: string
  primaryAction: string
}

type StaffWorkspaceDraftRow = {
  kind: 'draft'
  statusLabel: '未送出'
  createdAt: number
  requestLabel: null
  entry: PosOrderEntry
}

type StaffWorkspaceAcceptedRow = {
  kind: 'accepted'
  statusLabel: '已接單'
  createdAt: number
  requestLabel: string
  batchId: string
  entry: PosOrderEntry
}

export type StaffWorkspaceRow = StaffWorkspaceDraftRow | StaffWorkspaceAcceptedRow

type StaffWorkspaceDraftGroup = {
  kind: 'draft'
  statusLabel: '未送出'
  createdAt: number
  requestLabel: null
  rows: StaffWorkspaceDraftRow[]
}

type StaffWorkspaceAcceptedGroup = {
  kind: 'accepted'
  statusLabel: '已接單'
  createdAt: number
  requestLabel: string
  batchId: string
  rows: StaffWorkspaceAcceptedRow[]
}

export type StaffWorkspaceGroup = StaffWorkspaceDraftGroup | StaffWorkspaceAcceptedGroup

export type StaffWorkspaceSummary = {
  groups: StaffWorkspaceGroup[]
  rows: StaffWorkspaceRow[]
  draftSubtotal: number
  submittedSubtotal: number
  draftEntryCount: number
  acceptedEntryCount: number
  acceptedBatchCount: number
  totalRowCount: number
}

export type StaffWorkspaceRowAction = {
  kind: 'edit' | 'treat' | 'delete'
  label: string
  tone: 'primary' | 'warning' | 'success' | 'danger'
  action: string
  attrs: Record<string, string>
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatCurrency(value: number) {
  return `$${Math.round(value || 0)}`
}

function formatQuantity(quantity: number | null | undefined) {
  const safeQuantity = typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0 ? quantity : 1
  return `x${safeQuantity}`
}

function escapeAttributeValue(value: string) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function sortByCreated<T extends { createdAt: number }>(items: T[]) {
  return [...items].sort((left, right) => left.createdAt - right.createdAt)
}

function groupReceiptLines(lines: PosOrderLine[]) {
  return groupOrderLines(lines).map<ReceiptGroup>(({ main, children }) => ({ main, children }))
}

export function getBuilderGroupSelector(groupId: string) {
  return `[data-builder-group="${escapeAttributeValue(groupId)}"]`
}

export function guideBuilderIssue(host: BuilderIssueGuideHost | null | undefined, groupId: string) {
  if (!host?.querySelector || !groupId) {
    return false
  }

  const issueCard = host.querySelector(getBuilderGroupSelector(groupId))
  if (!issueCard) {
    return false
  }

  issueCard.classList?.add?.('issue-target')
  issueCard.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  issueCard
    .querySelector?.('input:not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled])')
    ?.focus?.()

  return true
}

export function getVisibleOrderBatches(
  mode: PosOrderMode,
  pending: PosOrderBatch[],
  submitted: PosOrderBatch[]
): VisibleBatchCard[] {
  if (mode === 'customer') {
    return [
      ...pending.map((batch) => ({ batch, editable: false, pending: true })),
      ...sortByCreated(submitted).map((batch) => ({ batch, editable: false, pending: false })),
    ]
  }

  return sortByCreated(submitted).map((batch) => ({ batch, editable: true, pending: false }))
}

export function selectPendingOverlayBatch(
  mode: PosOrderMode,
  pendingByTable: Record<string, PosPendingBatchPreview[] | undefined>
): PendingOverlayBatch | null {
  if (mode !== 'staff') {
    return null
  }

  for (const [table, batches] of Object.entries(pendingByTable)) {
    const batch = batches?.[0]
    if (batch) {
      return { table, batch }
    }
  }

  return null
}

export function calculateSplitCheckoutTotal(
  baseTotal: number,
  discountPercent: number,
  serviceFeeEnabled: boolean,
  allowance: number
) {
  let finalTotal = baseTotal
  if (discountPercent > 0 && discountPercent <= 100) {
    finalTotal = Math.round(baseTotal * (discountPercent / 100))
  }
  if (serviceFeeEnabled) {
    finalTotal += Math.round(finalTotal * 0.1)
  }
  finalTotal -= allowance
  return Math.max(0, finalTotal)
}

export function calculateStaffOrderTotal(
  baseTotal: number,
  discountPercent: number,
  serviceFeeEnabled: boolean,
  allowance = 0
) {
  let finalTotal = baseTotal
  if (discountPercent > 0 && discountPercent <= 100) {
    finalTotal = Math.round(finalTotal * (discountPercent / 100))
  }
  if (serviceFeeEnabled) {
    finalTotal += Math.round(finalTotal * 0.1)
  }
  finalTotal -= allowance
  return Math.max(0, finalTotal)
}

export function summarizeStaffWorkspace(
  draftEntries: PosOrderEntry[],
  submittedBatches: PosOrderBatch[]
): StaffWorkspaceSummary {
  const draftRows = draftEntries
    .map<StaffWorkspaceDraftRow>((entry) => ({
      kind: 'draft' as const,
      statusLabel: '未送出' as const,
      createdAt: entry.createdAt,
      requestLabel: null,
      entry,
    }))
    .sort((left, right) => left.createdAt - right.createdAt)

  const acceptedGroups = sortByCreated(submittedBatches).map<StaffWorkspaceAcceptedGroup>((batch) => ({
    kind: 'accepted' as const,
    statusLabel: '已接單' as const,
    createdAt: batch.createdAt,
    requestLabel: batch.requestLabel,
    batchId: batch.batchId,
    rows: batch.entries.map<StaffWorkspaceAcceptedRow>((entry) => ({
      kind: 'accepted' as const,
      statusLabel: '已接單' as const,
      createdAt: entry.createdAt,
      requestLabel: batch.requestLabel,
      batchId: batch.batchId,
      entry,
    })),
  }))

  const draftGroup: StaffWorkspaceDraftGroup | null =
    draftRows.length > 0
      ? {
          kind: 'draft',
          statusLabel: '未送出',
          createdAt: draftRows[0].createdAt,
          requestLabel: null,
          rows: draftRows,
        }
      : null

  const groups: StaffWorkspaceGroup[] = [...(draftGroup ? [draftGroup] : []), ...acceptedGroups]

  const rows: StaffWorkspaceRow[] = [...draftRows, ...acceptedGroups.flatMap((group) => group.rows)]

  return {
    groups,
    rows,
    draftSubtotal: draftEntries.reduce((sum, entry) => sum + entry.subtotal, 0),
    submittedSubtotal: submittedBatches.reduce((sum, batch) => sum + batch.subtotal, 0),
    draftEntryCount: draftEntries.length,
    acceptedEntryCount: submittedBatches.reduce((sum, batch) => sum + batch.entries.length, 0),
    acceptedBatchCount: submittedBatches.length,
    totalRowCount: rows.length,
  }
}

export function getStaffWorkspaceRowActions(row: StaffWorkspaceRow, isTreat: boolean): StaffWorkspaceRowAction[] {
  if (row.kind === 'draft') {
    return [
      {
        kind: 'edit',
        label: '編輯',
        tone: 'primary',
        action: 'edit-draft-entry',
        attrs: { 'data-entry-id': row.entry.entryId },
      },
      {
        kind: 'treat',
        label: isTreat ? '取消招待' : '招待',
        tone: isTreat ? 'success' : 'warning',
        action: 'toggle-draft-entry-treat',
        attrs: { 'data-entry-id': row.entry.entryId },
      },
      {
        kind: 'delete',
        label: '刪除',
        tone: 'danger',
        action: 'remove-draft-entry',
        attrs: { 'data-entry-id': row.entry.entryId },
      },
    ]
  }

  return [
    {
      kind: 'edit',
      label: '編輯',
      tone: 'primary',
      action: 'edit-submitted-entry',
      attrs: {
        'data-batch-id': row.batchId,
        'data-entry-id': row.entry.entryId,
      },
    },
    {
      kind: 'treat',
      label: isTreat ? '取消招待' : '招待',
      tone: isTreat ? 'success' : 'warning',
      action: 'toggle-submitted-entry-treat',
      attrs: {
        'data-batch-id': row.batchId,
        'data-entry-id': row.entry.entryId,
      },
    },
    {
      kind: 'delete',
      label: '刪除',
      tone: 'danger',
      action: 'remove-submitted-entry',
      attrs: {
        'data-batch-id': row.batchId,
        'data-entry-id': row.entry.entryId,
      },
    },
  ]
}

export function buildReceiptMarkup(data: PosReceiptData, title: string) {
  const groups = groupReceiptLines(data.lines || [])

  return `
    <section class="receipt-section">
      <div class="receipt-header">
        <h1 class="store-name">QY POS</h1>
        <strong>${escapeHtml(title)}</strong>
      </div>
      <div class="receipt-info">
        <div>桌號：${escapeHtml(data.table || '')}</div>
        <div>時間：${escapeHtml(data.time)}</div>
        <div>單號：${escapeHtml(String(data.seq || ''))}</div>
      </div>
      <hr class="dashed-line">
      <div class="receipt-items">
        ${groups
          .map(
            ({ main, children }) => `
              <div class="receipt-item">
                <span>${escapeHtml(main.shortName)} ${formatQuantity(main.quantity)}${main.selectionSummary ? ` (${escapeHtml(main.selectionSummary)})` : ''}</span>
                <span>${formatCurrency(main.lineTotal)}</span>
              </div>
              ${children
                .map(
                  (line) => `
                    <div class="entry-child-line">${escapeHtml(line.shortName)} ${formatQuantity(line.quantity)}${line.selectionSummary ? ` · ${escapeHtml(line.selectionSummary)}` : ''}${line.lineTotal > 0 ? ` ${formatCurrency(line.lineTotal)}` : ''}</div>
                  `
                )
                .join('')}
            `
          )
          .join('')}
      </div>
      <hr class="dashed-line">
      <div class="receipt-footer">
        <div class="row"><span>原價</span><span>${formatCurrency(data.original || data.total)}</span></div>
        <div class="row total"><span>總計</span><span>${formatCurrency(data.total)}</span></div>
      </div>
    </section>
  `
}

export function getEntryDisplaySummary(
  entry: PosOrderEntry,
  buildDisplaySummary: (entry: PosOrderEntry) => PosEntryDisplaySummary
) {
  return buildDisplaySummary(entry)
}

export async function persistCustomerInfoSilently({
  mode,
  table,
  entries,
  customer,
  saveCustomerDraft,
}: PersistCustomerInfoSilentlyParams) {
  if (mode !== 'customer') {
    return false
  }

  await saveCustomerDraft(table, entries, customer)
  return true
}

export async function submitDraftBatch({
  mode,
  table,
  entries,
  customer,
  submitCustomerDraft,
  createStaffBatch,
  printKitchenTicket,
}: SubmitDraftBatchParams) {
  if (mode === 'customer') {
    const batch = await submitCustomerDraft(table, entries, customer)
    return { batch, nextTab: 'orders' as const, printed: false }
  }

  const batch = await createStaffBatch(table, entries, customer)
  await printKitchenTicket(batch)
  return { batch, nextTab: 'orders' as const, printed: true }
}

export async function acceptPendingBatchAndPrint({
  table,
  batchId,
  acceptPendingBatch,
  printKitchenTicket,
}: AcceptPendingBatchParams) {
  const accepted = await acceptPendingBatch(table, batchId)
  if (!accepted) {
    return null
  }

  await printKitchenTicket(accepted)
  return accepted
}

export async function updateSubmittedBatchAndPrint({
  table,
  batchId,
  entries,
  updateSubmittedBatch,
  printKitchenTicket,
}: UpdateSubmittedBatchParams) {
  const updated = await updateSubmittedBatch(table, batchId, entries)
  if (!updated) {
    return null
  }

  await printKitchenTicket(updated)
  return updated
}

export function getBatchStatusChip(status: PosBatchStatus) {
  return status === 'pending'
    ? '<span class="batch-chip pending">待接單</span>'
    : '<span class="batch-chip accepted">已接單</span>'
}

export function getFloatingBarViewModel(
  mode: PosOrderMode,
  activeTab: 'menu' | 'cart' | 'orders'
): FloatingBarViewModel {
  if (activeTab === 'menu') {
    return {
      visible: true,
      label: '購物車',
      clearVisible: false,
      clearText: '清空',
      clearAction: 'floating-clear-action',
      primaryVisible: true,
      primaryText: '前往購物車',
      primaryAction: 'go-cart-tab',
    }
  }

  if (activeTab === 'cart') {
    return {
      visible: true,
      label: '購物車',
      clearVisible: true,
      clearText: '清空',
      clearAction: 'floating-clear-action',
      primaryVisible: true,
      primaryText: '送出',
      primaryAction: 'floating-primary-action',
    }
  }

  if (mode === 'customer') {
    return {
      visible: true,
      label: '訂單紀錄',
      clearVisible: false,
      clearText: '補印',
      clearAction: 'open-reprint-modal',
      primaryVisible: false,
      primaryText: '結帳',
      primaryAction: 'open-payment-modal',
    }
  }

  return {
    visible: true,
    label: '訂單紀錄',
    clearVisible: true,
    clearText: '補印',
    clearAction: 'open-reprint-modal',
    primaryVisible: true,
    primaryText: '結帳',
    primaryAction: 'open-payment-modal',
  }
}
