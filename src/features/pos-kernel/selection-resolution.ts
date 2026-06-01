import type { PosBuilderSelectionMap, PosSelectionRule } from './types'

export function isSelectionRuleVisible(rule: PosSelectionRule, selections: PosBuilderSelectionMap | undefined) {
  if (rule.kind !== 'single' || !rule.visibleWhenRuleId) {
    return true
  }
  return Boolean(selections?.[rule.visibleWhenRuleId]?.trim())
}

export function getResolvedSelectionMap(
  rules: PosSelectionRule[] | undefined,
  explicitSelections: PosBuilderSelectionMap | undefined,
  fallbackSelections: PosBuilderSelectionMap | undefined = undefined
) {
  const resolved: PosBuilderSelectionMap = {}

  for (const rule of rules || []) {
    if (!isSelectionRuleVisible(rule, resolved)) {
      continue
    }

    const explicitValue = explicitSelections?.[rule.id] || ''
    const fallbackValue = fallbackSelections?.[rule.id] || ''
    const value =
      rule.kind === 'single'
        ? explicitValue || fallbackValue || rule.defaultValue || ''
        : explicitValue || fallbackValue || ''

    if (value.trim()) {
      resolved[rule.id] = value
    }
  }

  return resolved
}
