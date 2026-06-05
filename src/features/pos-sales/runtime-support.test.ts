import { describe, expect, it, vi } from 'vitest'

import { menuMeta } from '@/features/pos-kernel/data'
import { buildEntryDisplaySummary as buildKernelEntryDisplaySummary } from '@/features/pos-kernel/item-helpers'
import type { PosOrderBatch, PosOrderEntry, PosReceiptData } from '@/features/pos-kernel/types'
import {
  acceptPendingBatchAndPrint,
  buildAdjustedAmountDisplay,
  buildReceiptMarkup,
  calculateSplitCheckoutTotal,
  calculateStaffOrderTotal,
  getBuilderGroupSelector,
  getCustomerBoxDisplay,
  getEntryAdjustedAmountDisplay,
  getEntryDisplaySummary,
  getFloatingBarViewModel,
  getStaffWorkspaceRowActions,
  getStaffWorkspaceTotalDisplay,
  getVisibleOrderBatches,
  guideBuilderIssue,
  persistCustomerInfoSilently,
  renderAdjustedAmountHtml,
  selectPendingOverlayBatch,
  submitDraftBatch,
  summarizeStaffWorkspace,
  updateSubmittedBatchAndPrint,
} from './runtime-support'

function createEntry(overrides: Partial<PosOrderEntry> = {}): PosOrderEntry {
  return {
    entryId: 'entry_1',
    groupId: 'entry_1',
    itemId: 'pasta_risotto.chicken-breast',
    catalogKey: 'pasta_risotto.chicken-breast',
    inventoryKey: 'pasta_risotto.chicken-breast',
    itemName: '雞胸',
    shortName: '雞胸',
    categoryKey: 'pasta_risotto',
    quantity: 1,
    status: 'draft',
    source: 'customer',
    createdAt: 1,
    updatedAt: 1,
    selections: {},
    includeSelections: {},
    upgradeSelections: {},
    lines: [
      {
        lineId: 'entry_1_main',
        groupId: 'entry_1',
        role: 'main',
        catalogKey: 'pasta_risotto.chicken-breast',
        inventoryKey: 'pasta_risotto.chicken-breast',
        categoryKey: 'pasta_risotto',
        displayName: '青醬雞胸義大利麵',
        shortName: '青醬雞胸',
        station: 'kitchen',
        courseKind: 'food',
        quantity: 1,
        unitPrice: 250,
        priceDelta: 0,
        lineTotal: 250,
        selectionSummary: '主食：義大利麵 / 口味：青醬',
        isTreat: false,
        sourceEntryId: 'entry_1',
      },
      {
        lineId: 'entry_1_child_0',
        groupId: 'entry_1',
        parentLineId: 'entry_1_main',
        role: 'upgrade',
        catalogKey: 'drink.latte',
        inventoryKey: 'drink.latte',
        categoryKey: 'drink',
        displayName: '拿鐵咖啡',
        shortName: '拿鐵',
        station: 'kitchen',
        courseKind: 'drink',
        quantity: 1,
        unitPrice: 60,
        priceDelta: 60,
        lineTotal: 60,
        selectionSummary: '溫度：冰',
        isTreat: false,
        sourceEntryId: 'entry_1',
      },
    ],
    subtotal: 310,
    summary: {
      title: '雞胸',
      subtitle: '主食：義大利麵 / 口味：青醬',
      quantityLabel: '1 份',
      totalLabel: '$310',
    },
    ...overrides,
  }
}

function createBatch(overrides: Partial<PosOrderBatch> = {}): PosOrderBatch {
  const entries = overrides.entries || [createEntry()]
  return {
    batchId: 'batch_1',
    source: 'customer',
    status: 'pending',
    table: 'A1',
    customer: { name: '王小明', phone: '0900' },
    createdAt: 10,
    updatedAt: 10,
    requestSeq: 1,
    requestLabel: '#12-1',
    entries,
    subtotal: entries.reduce((sum, entry) => sum + entry.subtotal, 0),
    ...overrides,
  }
}

describe('pos-sales runtime-support', () => {
  it('shows pending then submitted batches for customer mode and only submitted for staff mode', () => {
    const pending = [createBatch({ batchId: 'pending_1', status: 'pending', createdAt: 1 })]
    const submitted = [createBatch({ batchId: 'submitted_1', status: 'accepted', createdAt: 2 })]

    expect(getVisibleOrderBatches('customer', pending, submitted).map((item) => item.batch.batchId)).toEqual([
      'pending_1',
      'submitted_1',
    ])
    expect(getVisibleOrderBatches('staff', pending, submitted).map((item) => item.batch.batchId)).toEqual([
      'submitted_1',
    ])
  })

  it('selects the first pending overlay batch by table order only for staff mode', () => {
    const match = selectPendingOverlayBatch(
      'staff',
      {
        A1: [
          {
            batchId: 'pending_1',
            requestSeq: 1,
            requestLabel: '#1-1',
            createdAt: 1,
            entries: [{ entryId: 'preview_0', title: '紅茶', quantityLabel: '1 份' }],
          },
        ],
        A2: [
          {
            batchId: 'pending_2',
            requestSeq: 1,
            requestLabel: '#2-1',
            createdAt: 2,
            entries: [{ entryId: 'preview_1', title: '雞胸', quantityLabel: '2 份' }],
          },
        ],
      },
      ['A2', 'A1']
    )
    expect(match).toMatchObject({
      table: 'A2',
      batch: { batchId: 'pending_2' },
    })
    expect(
      selectPendingOverlayBatch('customer', {
        A2: [
          {
            batchId: 'pending_3',
            requestSeq: 2,
            requestLabel: '#2-2',
            createdAt: 3,
            entries: [{ entryId: 'p2', title: '可樂', quantityLabel: '1 份' }],
          },
        ],
      })
    ).toBeNull()
  })

  it('calculates split checkout totals with discount, service fee, and allowance', () => {
    expect(calculateSplitCheckoutTotal(1000, 90, true, 50)).toBe(940)
    expect(calculateSplitCheckoutTotal(100, 0, false, 150)).toBe(0)
  })

  it('calculates staff order totals using the same折數/service fee semantics', () => {
    expect(calculateStaffOrderTotal(1000, 90, true, 0)).toBe(990)
    expect(calculateStaffOrderTotal(1000, 0, false, 150)).toBe(850)
  })

  it('builds a plain adjusted amount display when the amount did not change', () => {
    expect(buildAdjustedAmountDisplay(310, 310)).toEqual({
      originalLabel: '$310',
      finalLabel: '$310',
      hasAdjustment: false,
      noteLabel: undefined,
      finalTone: undefined,
    })
    expect(renderAdjustedAmountHtml(buildAdjustedAmountDisplay(310, 310))).toBe('$310')
  })

  it('builds a treat entry adjusted display from original line prices', () => {
    const treatEntry = createEntry({
      lines: createEntry().lines.map((line) => ({
        ...line,
        isTreat: true,
        lineTotal: 0,
      })),
      subtotal: 0,
      summary: {
        ...createEntry().summary,
        title: '雞胸 (招待)',
        totalLabel: '$0',
      },
    })

    expect(getEntryAdjustedAmountDisplay(treatEntry)).toEqual({
      originalLabel: '$310',
      finalLabel: '$0',
      hasAdjustment: true,
      noteLabel: undefined,
      finalTone: 'success',
    })

    expect(renderAdjustedAmountHtml(getEntryAdjustedAmountDisplay(treatEntry))).toContain(
      'price-adjusted-final--success'
    )
    expect(renderAdjustedAmountHtml(getEntryAdjustedAmountDisplay(treatEntry))).toContain('$310')
    expect(renderAdjustedAmountHtml(getEntryAdjustedAmountDisplay(treatEntry))).toContain('$0')
  })

  it('builds a workspace total display for discount only', () => {
    const display = getStaffWorkspaceTotalDisplay([createEntry()], 80, false)

    expect(display).toEqual({
      originalLabel: '$310',
      finalLabel: '$248',
      hasAdjustment: true,
      noteLabel: '折數 80%',
      finalTone: 'danger',
    })
  })

  it('builds a workspace total display for service fee only', () => {
    const display = getStaffWorkspaceTotalDisplay([createEntry()], 0, true)

    expect(display).toEqual({
      originalLabel: '$310',
      finalLabel: '$341',
      hasAdjustment: true,
      noteLabel: '含服務費 +$31',
      finalTone: 'danger',
    })
  })

  it('builds a workspace total display that includes treat and order-level adjustments', () => {
    const treatEntry = createEntry({
      lines: createEntry().lines.map((line) => ({
        ...line,
        isTreat: true,
        lineTotal: 0,
      })),
      subtotal: 0,
      summary: {
        ...createEntry().summary,
        title: '雞胸 (招待)',
        totalLabel: '$0',
      },
    })

    const display = getStaffWorkspaceTotalDisplay([createEntry(), treatEntry], 80, true)

    expect(display).toEqual({
      originalLabel: '$620',
      finalLabel: '$273',
      hasAdjustment: true,
      noteLabel: '折數 80% · 含服務費 +$25',
      finalTone: 'danger',
    })
    expect(renderAdjustedAmountHtml(display, { stacked: true })).toContain('price-adjusted--stack')
  })

  it('summarizes draft and submitted totals for the staff floating workspace', () => {
    const entries = [createEntry({ entryId: 'entry_1' }), createEntry({ entryId: 'entry_2', subtotal: 180 })]
    const batches = [
      createBatch({ batchId: 'batch_1', status: 'accepted' }),
      createBatch({ batchId: 'batch_2', status: 'accepted' }),
    ]
    const summary = summarizeStaffWorkspace(entries, batches)

    expect(summary).toMatchObject({
      draftSubtotal: 490,
      submittedSubtotal: 620,
      draftEntryCount: 2,
      acceptedEntryCount: 2,
      acceptedBatchCount: 2,
      totalRowCount: 4,
    })
    expect(summary.rows.map((row) => row.kind)).toEqual(['draft', 'draft', 'accepted', 'accepted'])
    expect(summary.groups).toHaveLength(3)
    expect(summary.groups[0]).toMatchObject({
      kind: 'draft',
      statusLabel: '未送出',
    })
    expect(summary.groups[0].rows.map((row) => row.entry.entryId)).toEqual(['entry_1', 'entry_2'])
    expect(summary.groups.slice(1).map((group) => group.kind)).toEqual(['accepted', 'accepted'])
    expect(summary.groups.slice(1).map((group) => group.rows)).toEqual([
      [expect.objectContaining({ entry: expect.objectContaining({ entryId: 'entry_1' }) })],
      [expect.objectContaining({ entry: expect.objectContaining({ entryId: 'entry_1' }) })],
    ])
  })

  it('builds the same three staff workspace actions for draft and accepted rows', () => {
    const draftRow = summarizeStaffWorkspace([createEntry({ entryId: 'draft_1' })], []).rows[0]
    const acceptedRow = summarizeStaffWorkspace([], [createBatch({ batchId: 'batch_9', status: 'accepted' })]).rows[0]

    expect(getStaffWorkspaceRowActions(draftRow, false)).toEqual([
      {
        kind: 'edit',
        label: '編輯',
        tone: 'primary',
        action: 'edit-draft-entry',
        attrs: { 'data-entry-id': 'draft_1' },
      },
      {
        kind: 'treat',
        label: '招待',
        tone: 'warning',
        action: 'toggle-draft-entry-treat',
        attrs: { 'data-entry-id': 'draft_1' },
      },
      {
        kind: 'delete',
        label: '刪除',
        tone: 'danger',
        action: 'remove-draft-entry',
        attrs: { 'data-entry-id': 'draft_1' },
      },
    ])

    expect(getStaffWorkspaceRowActions(acceptedRow, true)).toEqual([
      {
        kind: 'edit',
        label: '編輯',
        tone: 'primary',
        action: 'edit-submitted-entry',
        attrs: { 'data-batch-id': 'batch_9', 'data-entry-id': 'entry_1' },
      },
      {
        kind: 'treat',
        label: '取消招待',
        tone: 'success',
        action: 'toggle-submitted-entry-treat',
        attrs: { 'data-batch-id': 'batch_9', 'data-entry-id': 'entry_1' },
      },
      {
        kind: 'delete',
        label: '刪除',
        tone: 'danger',
        action: 'remove-submitted-entry',
        attrs: { 'data-batch-id': 'batch_9', 'data-entry-id': 'entry_1' },
      },
    ])
  })

  it('formats main and drink summaries from a finalized entry for shared renders', () => {
    expect(getEntryDisplaySummary(createEntry(), (entry) => buildKernelEntryDisplaySummary(entry, menuMeta))).toEqual({
      mainSummary: '主食：義大利麵 / 口味：青醬',
      mainCompact: '義大利麵 · 青醬',
      drinkSummary: '換購：拿鐵 · 溫度：冰',
      drinkCompact: '拿鐵(冰)',
      expandedSummary: '主食：義大利麵 / 口味：青醬 / 換購：拿鐵 · 溫度：冰',
    })
  })

  it('maps the floating bar actions by tab and mode', () => {
    expect(getFloatingBarViewModel('customer', 'menu')).toMatchObject({
      visible: true,
      label: '購物車',
      clearVisible: false,
      primaryVisible: true,
      primaryText: '前往購物車',
      primaryAction: 'go-cart-tab',
    })
    expect(getFloatingBarViewModel('customer', 'cart')).toMatchObject({
      clearVisible: true,
      primaryVisible: true,
      primaryText: '送出',
    })
    expect(getFloatingBarViewModel('customer', 'orders')).toMatchObject({
      label: '訂單紀錄',
      clearVisible: false,
      primaryVisible: false,
    })
    expect(getFloatingBarViewModel('staff', 'orders')).toMatchObject({
      clearVisible: true,
      clearText: '補印',
      primaryVisible: true,
      primaryText: '結帳',
    })
  })

  it('renders grouped receipt markup with child line indentation', () => {
    const data: PosReceiptData = {
      seq: '12-1',
      table: 'A1',
      time: '2026/05/30 18:00:00',
      lines: createEntry().lines,
      original: 310,
      total: 310,
    }

    const html = buildReceiptMarkup(data, 'Kitchen 工作單')
    expect(html).toContain('Kitchen 工作單')
    expect(html).toContain('青醬雞胸')
    expect(html).toContain('x1')
    expect(html).toContain('(主食：義大利麵 / 口味：青醬)')
    expect(html).toContain('拿鐵')
    expect(html).toContain('· 溫度：冰')
  })

  it('guides the first builder issue to its matching group card and focusable control', () => {
    const focus = vi.fn()
    const scrollIntoView = vi.fn()
    const add = vi.fn()
    const querySelector = vi.fn((selector: string) => {
      if (selector === getBuilderGroupSelector('bundle-drink-upgrade')) {
        return {
          classList: { add },
          scrollIntoView,
          querySelector: (childSelector: string) =>
            childSelector.includes('button:not([disabled])') ? { focus } : null,
        }
      }
      return null
    })

    expect(guideBuilderIssue({ querySelector }, 'bundle-drink-upgrade')).toBe(true)
    expect(add).toHaveBeenCalledWith('issue-target')
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('returns false when the requested builder issue card is missing', () => {
    const querySelector = vi.fn(() => null)
    expect(guideBuilderIssue({ querySelector }, 'missing-group')).toBe(false)
  })

  it('persists customer info silently in customer and staff mode through mode-specific writes', async () => {
    const saveCustomerDraft = vi.fn(async () => ({ displaySeqBase: 12 }))
    const updateTableCustomer = vi.fn(async () => ({ displaySeqBase: 12 }))

    await expect(
      persistCustomerInfoSilently({
        mode: 'staff',
        table: 'A1',
        entries: [createEntry()],
        customer: { name: '王小明' },
        saveCustomerDraft,
        updateTableCustomer,
      })
    ).resolves.toBe(true)

    await expect(
      persistCustomerInfoSilently({
        mode: 'customer',
        table: 'A1',
        entries: [createEntry()],
        customer: { name: '王小明' },
        saveCustomerDraft,
        updateTableCustomer,
      })
    ).resolves.toBe(true)

    expect(saveCustomerDraft).toHaveBeenCalledTimes(1)
    expect(updateTableCustomer).toHaveBeenCalledTimes(1)
    expect(updateTableCustomer).toHaveBeenCalledWith('A1', { name: '王小明' })
  })

  it('shows the customer info input box for both customer and staff table sessions', () => {
    expect(getCustomerBoxDisplay('customer')).toBe('flex')
    expect(getCustomerBoxDisplay('staff')).toBe('flex')
  })

  it('submits customer drafts without printing and prints staff-created batches immediately', async () => {
    const submitCustomerDraft = vi.fn(async () => createBatch({ batchId: 'pending_1', status: 'pending' }))
    const createStaffBatch = vi.fn(async () =>
      createBatch({ batchId: 'submitted_1', status: 'accepted', source: 'staff' })
    )
    const printKitchenTicket = vi.fn(async () => {})

    const customerResult = await submitDraftBatch({
      mode: 'customer',
      table: 'A1',
      entries: [createEntry()],
      customer: { name: '王小明' },
      submitCustomerDraft,
      createStaffBatch,
      printKitchenTicket,
    })
    expect(customerResult.printed).toBe(false)
    expect(submitCustomerDraft).toHaveBeenCalledTimes(1)
    expect(printKitchenTicket).not.toHaveBeenCalled()

    const staffResult = await submitDraftBatch({
      mode: 'staff',
      table: 'A1',
      entries: [createEntry({ source: 'staff', status: 'draft' })],
      customer: { name: '王小明' },
      submitCustomerDraft,
      createStaffBatch,
      printKitchenTicket,
    })
    expect(staffResult.printed).toBe(true)
    expect(createStaffBatch).toHaveBeenCalledTimes(1)
    expect(printKitchenTicket).toHaveBeenCalledTimes(1)
  })

  it('prints accepted and updated submitted batches after persistence', async () => {
    const printKitchenTicket = vi.fn(async () => {})
    const acceptedBatch = createBatch({ batchId: 'pending_1', status: 'accepted' })
    const updatedBatch = createBatch({ batchId: 'submitted_1', status: 'accepted' })

    await expect(
      acceptPendingBatchAndPrint({
        table: 'A1',
        batchId: 'pending_1',
        acceptPendingBatch: async () => acceptedBatch,
        printKitchenTicket,
      })
    ).resolves.toBe(acceptedBatch)

    await expect(
      updateSubmittedBatchAndPrint({
        table: 'A1',
        batchId: 'submitted_1',
        entries: updatedBatch.entries,
        updateSubmittedBatch: async () => updatedBatch,
        printKitchenTicket,
      })
    ).resolves.toBe(updatedBatch)

    expect(printKitchenTicket).toHaveBeenCalledTimes(2)
  })
})
