import { toBusinessDateStartTimestamp } from '@/shared/business-day'
import { groupOrderLines } from '@/shared/grouped-order-lines'
import { buildEntryDisplaySummary, normalizeEntryForDisplay } from './entry-display'
import type {
  PosBuilderSelectionMap,
  PosCategoryKey,
  PosFinanceStats,
  PosInventoryMap,
  PosItemCostsMap,
  PosMenuMeta,
  PosOrder,
  PosOrderEntry,
  PosOrderLine,
  PosRevenueDetails,
  PosSelectionRule,
} from './types'

type CatalogHelpersDeps = {
  getInventory: () => PosInventoryMap
  getItemCosts: () => PosItemCostsMap
  getItemPrices: () => Record<string, number | undefined>
  menuMeta: PosMenuMeta
}

function stableStringify(value: unknown): string {
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`
}

function getSelectionRuleMap(rules: PosSelectionRule[] | undefined) {
  return Object.fromEntries((rules || []).map((rule) => [rule.id, rule]))
}

export function getBusinessDate(dateObj: Date | string | number) {
  try {
    return toBusinessDateStartTimestamp(dateObj)
  } catch {
    return toBusinessDateStartTimestamp(Date.now())
  }
}

export function getDateFromOrder(order: Partial<PosOrder> | null | undefined) {
  if (!order) return new Date()
  if (order.timestamp) return new Date(order.timestamp)
  if (order.time) {
    const date = new Date(order.time)
    if (!Number.isNaN(date.getTime())) return date
  }
  return new Date()
}

export function getEntrySignature(entry: PosOrderEntry): string {
  return [
    entry.itemId,
    entry.quantity,
    stableStringify(entry.selections),
    stableStringify(entry.includeSelections),
    stableStringify(entry.upgradeSelections),
    entry.status,
    entry.source,
  ].join('||')
}

export function getDeltaEntries(currentEntries: PosOrderEntry[], baseEntries: PosOrderEntry[]) {
  const baseCounts = new Map<string, number>()
  baseEntries.forEach((entry) => {
    const key = getEntrySignature(entry)
    baseCounts.set(key, (baseCounts.get(key) || 0) + 1)
  })

  const delta: PosOrderEntry[] = []
  currentEntries.forEach((entry) => {
    const key = getEntrySignature(entry)
    const count = baseCounts.get(key) || 0
    if (count > 0) {
      baseCounts.set(key, count - 1)
      return
    }
    delta.push(entry)
  })

  return delta
}

export function getMergedEntries(entries: PosOrderEntry[]) {
  const merged = new Map<string, PosOrderEntry>()
  entries.forEach((entry) => {
    const key = [
      entry.itemId,
      stableStringify(entry.selections),
      stableStringify(entry.includeSelections),
      stableStringify(entry.upgradeSelections),
      entry.status,
      entry.source,
    ].join('||')
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { ...entry })
      return
    }
    existing.quantity += entry.quantity
    existing.subtotal += entry.subtotal
    existing.updatedAt = Math.max(existing.updatedAt, entry.updatedAt)
    existing.summary = {
      ...existing.summary,
      quantityLabel: `${existing.quantity} 份`,
      totalLabel: `$${existing.subtotal}`,
    }
    existing.lines = existing.lines.map((line) => ({
      ...line,
      quantity: line.quantity + (entry.lines.find((candidate) => candidate.lineId === line.lineId)?.quantity || 0),
      lineTotal: line.lineTotal + (entry.lines.find((candidate) => candidate.lineId === line.lineId)?.lineTotal || 0),
    }))
  })
  return [...merged.values()]
}

export function getCanonicalDraftEntries(entries: PosOrderEntry[]) {
  return getMergedEntries(entries).sort(
    (left, right) => left.createdAt - right.createdAt || left.entryId.localeCompare(right.entryId)
  )
}

export function buildSelectionSummary(
  selections: PosBuilderSelectionMap,
  selectionRules: PosSelectionRule[] | undefined,
  includeSelections: Record<string, PosBuilderSelectionMap>,
  upgradeSelections: Record<string, string>
) {
  const ruleMap = getSelectionRuleMap(selectionRules)
  const parts: string[] = []

  Object.entries(selections || {}).forEach(([ruleId, value]) => {
    if (!value) return
    const rule = ruleMap[ruleId]
    if (!rule) return
    const summaryLabel = rule.summaryLabel || rule.label
    if (rule.kind === 'single') {
      const option = rule.options.find((candidate) => candidate.value === value)
      if (option) parts.push(`${summaryLabel}：${option.label}`)
      return
    }
    parts.push(`${summaryLabel}：${value}`)
  })

  Object.entries(includeSelections || {}).forEach(([includeId, includeValues]) => {
    Object.entries(includeValues || {}).forEach(([ruleId, value]) => {
      if (!value) return
      parts.push(`${includeId}：${value}`)
      if (ruleId === 'temperature') {
        parts[parts.length - 1] = `${includeId}：${value === 'ice' ? '冰' : '熱'}`
      }
    })
  })

  Object.entries(upgradeSelections || {}).forEach(([groupId, value]) => {
    if (!value) return
    parts.push(`${groupId}：${value}`)
  })

  return parts.join(' / ')
}

export function buildRevenueDetailsTemplate(categoryKeys: PosCategoryKey[]): PosRevenueDetails {
  const details = Object.fromEntries([...categoryKeys, 'total'].map((key) => [key, []])) as unknown as PosRevenueDetails

  return details
}

export function buildFinanceStatsTemplate(categoryKeys: PosCategoryKey[]): PosFinanceStats {
  return {
    totalRevenue: 0,
    totalCost: 0,
    byCategory: Object.fromEntries(
      categoryKeys.map((key) => [key, { revenue: 0, cost: 0 }])
    ) as PosFinanceStats['byCategory'],
  }
}

export function createCatalogHelpers({ getInventory, getItemCosts, getItemPrices, menuMeta }: CatalogHelpersDeps) {
  function getItemById(itemId: string) {
    return menuMeta.itemsById[itemId] || null
  }

  function getMenuItemsByMode(mode: 'customer' | 'staff') {
    return Object.values(menuMeta.itemsById).filter((item) => !item.menuModes || item.menuModes.includes(mode))
  }

  function getItemCategoryType(itemIdOrName: string) {
    const direct = menuMeta.itemsById[itemIdOrName]
    if (direct) return direct.categoryKey
    const match = Object.values(menuMeta.itemsById).find(
      (item) => item.name === itemIdOrName || item.shortName === itemIdOrName
    )
    return match?.categoryKey || 'other'
  }

  function getItemDisplayPrice(itemId: string) {
    const item = getItemById(itemId)
    if (!item) return 0
    return getItemPrice(itemId) ?? item.basePrice
  }

  function getItemPrice(itemId: string) {
    const item = menuMeta.itemsById[itemId]
    if (!item) return null
    return Number(getItemPrices()[itemId] ?? item.basePrice)
  }

  function getOwnedSelectionInventoryKeys(itemId: string) {
    const item = getItemById(itemId)
    if (!item) return []
    return [
      ...new Set(
        (item.selections || [])
          .filter((rule) => rule.kind === 'single')
          .flatMap((rule) => rule.options)
          .filter((option) => !option.targetItemId)
          .map((option) => option.inventoryKey)
          .filter(Boolean)
      ),
    ]
  }

  function getCostByItemId(itemId: string) {
    return Number(getItemCosts()[itemId] ?? 0)
  }

  function isInventoryKeySoldOut(inventoryKey: string) {
    if (!inventoryKey) return false
    const inventory = getInventory()
    return inventory[inventoryKey] === false
  }

  function isItemSoldOut(itemId: string) {
    const item = getItemById(itemId)
    if (!item) return true
    const soldOutKey = item.soldOutKey || item.id
    return isInventoryKeySoldOut(soldOutKey)
  }

  function validateSelections(itemId: string, selections: PosBuilderSelectionMap) {
    const item = getItemById(itemId)
    if (!item) return ['找不到商品']
    const errors: string[] = []
    ;(item.selections || []).forEach((rule) => {
      const value = selections[rule.id]
      if (rule.required && !value) {
        errors.push(rule.id)
        return
      }
      if (rule.kind === 'single' && value && !rule.options.some((option) => option.value === value)) {
        errors.push(rule.id)
      }
    })
    return errors
  }

  function resolveSelectionLabel(itemId: string, ruleId: string, value: string) {
    const item = getItemById(itemId)
    const rule = item?.selections?.find((candidate) => candidate.id === ruleId)
    if (!rule) return value
    if (rule.kind === 'text') return value
    return rule.options.find((option) => option.value === value)?.label || value
  }

  function flattenEntryLines(entry: PosOrderEntry) {
    return [...entry.lines]
  }

  function getEntrySubtotal(entry: PosOrderEntry) {
    return entry.lines.reduce((sum, line) => sum + line.lineTotal, 0)
  }

  function sumLines(lines: PosOrderLine[]) {
    return lines.reduce((sum, line) => sum + line.lineTotal, 0)
  }

  return {
    buildFinanceStatsTemplate,
    buildRevenueDetailsTemplate,
    buildEntryDisplaySummary: (entry: PosOrderEntry) => buildEntryDisplaySummary(entry, menuMeta),
    buildSelectionSummary,
    getCanonicalDraftEntries,
    flattenEntryLines,
    groupOrderLines,
    getCostByItemId,
    getDeltaEntries,
    getEntrySubtotal,
    getItemById,
    getMenuItemsByMode,
    getItemCategoryType,
    getItemDisplayPrice,
    getItemPrice,
    getMergedEntries,
    getOwnedSelectionInventoryKeys,
    isInventoryKeySoldOut,
    isItemSoldOut,
    normalizeEntryForDisplay: (entry: PosOrderEntry) => normalizeEntryForDisplay(entry, menuMeta),
    resolveSelectionLabel,
    sumLines,
    validateSelections,
  }
}
