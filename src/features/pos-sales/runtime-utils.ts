import type { PosCategoryKey, PosMenuItem, PosOrderBatch, PosOrderEntry } from '@/features/pos-kernel/types'
import { POS_CATEGORY_LABELS } from '@/features/pos-kernel/types'

export function formatCurrency(value: number) {
  return `$${Math.round(value || 0)}`
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

export function getEntryMenuItem(entry: PosOrderEntry, getItemById: (itemId: string) => PosMenuItem | null) {
  const mainLine = entry.lines.find((line) => !line.parentLineId) || entry.lines[0]
  return getItemById(entry.itemId) || getItemById(entry.catalogKey) || getItemById(mainLine?.catalogKey || '')
}

export function getItemImageAlt(item: Pick<PosMenuItem, 'imageAlt' | 'name'>) {
  return item.imageAlt || item.name
}

export function resolvePublicAssetUrl(path: string, baseUrl = import.meta.env.BASE_URL || '/') {
  const value = path.trim()
  if (!value) {
    return ''
  }
  if (/^[a-z][a-z\d+\-.]*:/i.test(value) || value.startsWith('//')) {
    return value
  }
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const normalizedPath = value.replace(/^\/+/, '').replace(/^\.\//, '')
  return `${normalizedBase}${normalizedPath}`
}

export function flattenBatchLines(batch: PosOrderBatch, normalizeEntry: (entry: PosOrderEntry) => PosOrderEntry) {
  return batch.entries.flatMap((entry) => normalizeEntry(entry).lines)
}
