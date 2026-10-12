import type { PosCatalogHelpers } from '@/features/pos-kernel/service'
import type { PosMenuItem, PosOrderBatch, PosOrderLine, PosReceiptData } from '@/features/pos-kernel/types'

import { flattenBatchLines, formatDateTime } from './runtime-utils'

type KitchenTicketHelpers = Pick<PosCatalogHelpers, 'getItemById' | 'normalizeEntryForDisplay'>

// Trailing qualifiers such as (素) or (需預訂) stay at the very end of the kitchen name.
const QUALIFIER = /([（(][^()（）]+[）)])$/

function withCategorySuffix(name: string, categoryKey: string) {
  if (categoryKey === 'salad') return name.endsWith('沙拉') ? name : `${name}沙拉`
  if (categoryKey === 'plated_main') return /(牛排|排餐)$/.test(name) ? name : `${name}排餐`
  if (categoryKey === 'bread_set') return name.endsWith('麵包餐') ? name : `${name}麵包餐`
  return name
}

// The selected pasta/risotto base: its label and the summary part stating it, e.g. 主食：燉飯.
function findSelectedBase(line: PosOrderLine, item: PosMenuItem | null) {
  const rule = item?.selections?.find((candidate) => candidate.id === 'base')
  const option = rule?.options.find((candidate) => candidate.value === line.selections?.base)
  if (!rule || !option) return null
  return { label: option.label, summaryPart: `${rule.summaryLabel || rule.label}：${option.label}` }
}

/** Kitchen-only wording of a main line, e.g. 牛小排 -> 牛小排排餐, 雞胸 + 燉飯 -> 雞胸燉飯. */
export function toKitchenLine(line: PosOrderLine, item: PosMenuItem | null): PosOrderLine {
  if (item?.kitchenName) return { ...line, shortName: item.kitchenName }
  const qualifier = line.displayName.match(QUALIFIER)?.[1] || ''
  let name = withCategorySuffix((line.shortName || line.displayName).replace(QUALIFIER, '').trim(), line.categoryKey)
  let selectionSummary = line.selectionSummary
  const base = findSelectedBase(line, item)
  if (base) {
    if (!name.endsWith(base.label)) name += base.label
    selectionSummary = selectionSummary
      .split(' / ')
      .filter((part) => part !== base.summaryPart)
      .join(' / ')
  }
  return { ...line, shortName: `${name}${qualifier}`, selectionSummary }
}

/** One kitchen ticket for one or more same-table batches; stored orders are left untouched. */
export function buildKitchenTicket(batches: PosOrderBatch[], helpers: KitchenTicketHelpers): PosReceiptData {
  const merged = batches.length > 1
  const subtotal = batches.reduce((sum, batch) => sum + batch.subtotal, 0)
  return {
    seq: merged ? `合併 ${batches.length} 筆` : batches[0].requestLabel,
    table: batches[0].table,
    // The earliest last-updated batch, matching the single-batch ticket time.
    time: formatDateTime(Math.min(...batches.map((batch) => batch.updatedAt))),
    sourceLabels: merged ? batches.map((batch) => batch.requestLabel) : undefined,
    lines: batches
      .flatMap((batch) => flattenBatchLines(batch, helpers.normalizeEntryForDisplay))
      .map((line) => (line.parentLineId ? line : toKitchenLine(line, helpers.getItemById(line.catalogKey)))),
    original: subtotal,
    total: subtotal,
  }
}
