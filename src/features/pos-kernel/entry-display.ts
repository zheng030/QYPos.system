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
      const raw = values?.[rule.id] || ''
      if (!raw.trim()) return ''
      const label = rule.summaryLabel || rule.label
      if (rule.kind === 'text') {
        return `${label}：${raw.trim()}`
      }
      const option = rule.options.find((candidate) => candidate.value === raw)
      return `${label}：${option?.label || raw}`
    })
    .filter(Boolean)
}

function sanitizeLegacyMainParts(parts: string[]) {
  return parts.filter((part) => {
    const { label } = parseSummaryPart(part)
    return !['附飲', '換購', '飲品', '溫度'].includes(label)
  })
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

function getDrinkLine(entry: PosOrderEntry) {
  return entry.lines.find((line) => line.parentLineId && line.courseKind === 'drink') || null
}

function resolveItem(menuMeta: PosMenuMeta, catalogKey: string) {
  return menuMeta.itemsById[catalogKey] || null
}

function buildLineSummaryParts(line: PosOrderLine, item: PosMenuItem | null) {
  const structured = buildSummaryPartsFromSelections(line.selections, item?.selections)
  if (structured.length > 0) {
    return structured
  }
  return splitStoredSummary(line.selectionSummary || '')
}

function buildMainSummaryParts(entry: PosOrderEntry, menuMeta: PosMenuMeta) {
  const item = resolveItem(menuMeta, entry.itemId || entry.catalogKey)
  const structured = buildSummaryPartsFromSelections(entry.selections, item?.selections)
  if (structured.length > 0) {
    return structured
  }

  const mainLine = getMainLine(entry)
  const lineItem = resolveItem(menuMeta, mainLine?.catalogKey || '')
  const lineParts = mainLine ? buildLineSummaryParts(mainLine, lineItem) : []
  if (lineParts.length > 0) {
    return sanitizeLegacyMainParts(lineParts)
  }

  return sanitizeLegacyMainParts(splitStoredSummary(entry.summary.subtitle || ''))
}

function buildDrinkDisplay(entry: PosOrderEntry, menuMeta: PosMenuMeta) {
  const drinkLine = getDrinkLine(entry)
  if (!drinkLine) {
    return { drinkSummary: '', drinkCompact: '' }
  }

  const drinkItem = resolveItem(menuMeta, drinkLine.catalogKey)
  const drinkParts = buildLineSummaryParts(drinkLine, drinkItem).map(parseSummaryPart)
  const temperature = normalizeTemperatureValue(drinkParts.find((part) => part.label === '溫度')?.value || '')
  const extraParts = drinkParts
    .filter((part) => part.label && part.label !== '溫度')
    .map((part) => `${part.label}：${part.value}`)
  const prefix = drinkLine.role === 'upgrade' ? '換購' : '附飲'
  const drinkSummary = `${prefix}：${drinkLine.shortName}${temperature ? ` · 溫度：${temperature}` : ''}${
    extraParts.length > 0 ? ` / ${extraParts.join(' / ')}` : ''
  }`
  const drinkCompact = `${drinkLine.shortName}${temperature ? `(${temperature})` : ''}${
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
  const mainItem = mainLine
    ? resolveItem(menuMeta, mainLine.catalogKey)
    : resolveItem(menuMeta, entry.itemId || entry.catalogKey)
  const mainSummaryParts = buildMainSummaryParts(entry, menuMeta)
  const normalizedLines = entry.lines.map((line) => {
    const item = resolveItem(menuMeta, line.catalogKey)
    const parts = line === mainLine ? mainSummaryParts : buildLineSummaryParts(line, item)
    return {
      ...line,
      selectionSummary: parts.join(' / '),
    }
  })
  const normalizedEntry = {
    ...entry,
    lines: normalizedLines,
    summary: {
      ...entry.summary,
      subtitle: mainSummaryParts.join(' / '),
    },
  }

  if (!mainLine && mainItem) {
    return normalizedEntry
  }

  return normalizedEntry
}
