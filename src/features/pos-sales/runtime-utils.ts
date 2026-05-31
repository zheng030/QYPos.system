import type { PosCategoryKey, PosOrderBatch, PosOrderEntry } from '@/features/pos-kernel/types'
import { POS_CATEGORY_LABELS } from '@/features/pos-kernel/types'

export function formatCurrency(value: number) {
  return `$${Math.round(value || 0)}`
}

export function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatDateTime(value: number) {
  return new Date(value).toLocaleString('zh-TW', { hour12: false })
}

export function groupChildLines(entry: PosOrderEntry) {
  return entry.lines.filter((line) => line.parentLineId)
}

export function getVisibleDetailChildLines(entry: PosOrderEntry) {
  return groupChildLines(entry).filter((line) => line.courseKind !== 'drink')
}

export function cloneEntryWithTreatState(entry: PosOrderEntry, isTreat: boolean): PosOrderEntry {
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

export function getStaffCategoryLabel(categoryKey: PosCategoryKey) {
  return POS_CATEGORY_LABELS[categoryKey] || POS_CATEGORY_LABELS.other
}

export function flattenBatchLines(batch: PosOrderBatch, normalizeEntry: (entry: PosOrderEntry) => PosOrderEntry) {
  return batch.entries.flatMap((entry) => normalizeEntry(entry).lines)
}
