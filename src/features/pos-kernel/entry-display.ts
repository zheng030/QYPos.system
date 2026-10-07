import type {
  PosBuilderSelectionMap,
  PosEntryDisplaySummary,
  PosMenuItem,
  PosMenuMeta,
  PosOrderEntry,
  PosOrderLine,
  PosSelectionRule,
} from './types'

function splitStoredSummary(value: string) {
  return String(value || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function parseSummaryPart(part: string) {
  const index = part.indexOf('：')
  if (index <= 0) {
    return { label: '', value: part.trim() }
  }
  return {
    label: part.slice(0, index).trim(),
    value: part.slice(index + 1).trim(),
  }
}

function normalizeTemperatureValue(value: string) {
  const normalized = String(value || '')
    .trim()
    .replace(/^溫度：/, '')
  if (!normalized) return ''
  if (normalized === 'ice') return '冰'
  if (normalized === 'hot') return '熱'
  return normalized
}

function buildSummaryPartsFromSelections(
  values: PosBuilderSelectionMap | undefined,
  rules: PosSelectionRule[] | undefined
) {
  return (rules || [])
    .map((rule) => {
      if (rule.visibleWhenRuleId && !values?.[rule.visibleWhenRuleId]?.trim()) {
        return ''
      }
      const raw = values?.[rule.id] || ''
      if (!raw.trim()) return ''
      const label = rule.summaryLabel || rule.label
      const option = rule.options.find((candidate) => candidate.value === raw)
      return `${label}：${option?.label || raw}`
    })
    .filter(Boolean)
}

function buildCompactSummary(parts: string[]) {
  return parts
    .map((part) => parseSummaryPart(part).value)
    .filter(Boolean)
    .join(' · ')
}

function getMainLine(entry: PosOrderEntry) {
  return entry.lines.find((line) => !line.parentLineId) || entry.lines[0] || null
}

function getAttachedMealLine(entry: PosOrderEntry) {
  return entry.lines.find((line) => line.parentLineId && ['included', 'upgrade'].includes(line.role)) || null
}

function resolveItem(menuMeta: PosMenuMeta, catalogKey: string) {
  return menuMeta.itemsById[catalogKey] || null
}

function buildLineSummaryParts(line: PosOrderLine, item: PosMenuItem | null) {
  const stored = splitStoredSummary(line.selectionSummary)
  if (stored.length > 0) {
    return stored
  }
  return buildSummaryPartsFromSelections(line.selections, item?.selections)
}

function buildMainSummaryParts(entry: PosOrderEntry, menuMeta: PosMenuMeta) {
  // Saved summaries describe the order at purchase time, even after menu rules change.
  const stored = splitStoredSummary(entry.summary.subtitle)
  if (stored.length > 0) {
    return stored
  }

  const mainLine = getMainLine(entry)
  const lineItem = resolveItem(menuMeta, mainLine?.catalogKey || '')
  const lineParts = mainLine ? buildLineSummaryParts(mainLine, lineItem) : []
  if (lineParts.length > 0) {
    return lineParts
  }

  const item = resolveItem(menuMeta, entry.itemId || entry.catalogKey)
  return buildSummaryPartsFromSelections(entry.selections, item?.selections)
}

function buildDrinkDisplay(entry: PosOrderEntry, menuMeta: PosMenuMeta) {
  const attachedMealLine = getAttachedMealLine(entry)
  if (!attachedMealLine) {
    return { drinkSummary: '', drinkCompact: '' }
  }

  const drinkItem = resolveItem(menuMeta, attachedMealLine.catalogKey)
  const drinkParts = buildLineSummaryParts(attachedMealLine, drinkItem).map(parseSummaryPart)
  const temperature = normalizeTemperatureValue(drinkParts.find((part) => part.label === '溫度')?.value || '')
  const extraParts = drinkParts
    .filter((part) => part.label && part.label !== '溫度')
    .map((part) => `${part.label}：${part.value}`)
  const prefix = attachedMealLine.role === 'upgrade' ? '換購' : '附飲'
  const drinkSummary = `${prefix}：${attachedMealLine.shortName}${temperature ? ` · 溫度：${temperature}` : ''}${
    extraParts.length > 0 ? ` / ${extraParts.join(' / ')}` : ''
  }`
  const drinkCompact = `${attachedMealLine.shortName}${temperature ? `(${temperature})` : ''}${
    extraParts.length > 0
      ? ` · ${extraParts
          .map((part) => parseSummaryPart(part).value)
          .filter(Boolean)
          .join(' · ')}`
      : ''
  }`

  return { drinkSummary, drinkCompact }
}

export function buildEntryDisplaySummary(entry: PosOrderEntry, menuMeta: PosMenuMeta): PosEntryDisplaySummary {
  const mainParts = buildMainSummaryParts(entry, menuMeta)
  const mainSummary = mainParts.join(' / ')
  const mainCompact = buildCompactSummary(mainParts)
  const { drinkSummary, drinkCompact } = buildDrinkDisplay(entry, menuMeta)
  return {
    mainSummary,
    mainCompact,
    drinkSummary,
    drinkCompact,
    expandedSummary: [mainSummary, drinkSummary].filter(Boolean).join(' / '),
  }
}

export function normalizeEntryForDisplay(entry: PosOrderEntry, menuMeta: PosMenuMeta): PosOrderEntry {
  const mainLine = getMainLine(entry)
  const mainSummaryParts = buildMainSummaryParts(entry, menuMeta)
  const normalizedLines = entry.lines.map((line) => {
    const item = resolveItem(menuMeta, line.catalogKey)
    const parts = line === mainLine ? mainSummaryParts : buildLineSummaryParts(line, item)
    return {
      ...line,
      selectionSummary: parts.join(' / '),
    }
  })
  return {
    ...entry,
    lines: normalizedLines,
    summary: {
      ...entry.summary,
      subtitle: mainSummaryParts.join(' / '),
    },
  }
}
