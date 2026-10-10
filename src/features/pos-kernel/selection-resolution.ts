import type { PosBuilderSelectionMap, PosSelectionRule } from './types'

export function isSelectionRuleVisible(rule: PosSelectionRule, selections: PosBuilderSelectionMap | undefined) {
  if (!rule.visibleWhenRuleId) {
    return true
  }
  return Boolean(selections?.[rule.visibleWhenRuleId]?.trim())
}

export function getResolvedSelectionMap(
  rules: PosSelectionRule[] | undefined,
  explicitSelections: PosBuilderSelectionMap | undefined
) {
  const resolved: PosBuilderSelectionMap = {}

  for (const rule of rules || []) {
    if (!isSelectionRuleVisible(rule, resolved)) {
      continue
    }

    const value = explicitSelections?.[rule.id] || rule.defaultValue || ''

    if (value.trim()) {
      resolved[rule.id] = value
    }
  }

  return resolved
}
