import { getResolvedSelectionMap, isSelectionRuleVisible } from '@/features/pos-kernel/selection-resolution'
import type { PosCatalogHelpers } from '@/features/pos-kernel/service'
import type {
  PosBuilderSelectionMap,
  PosBuilderState,
  PosBundleUpgradeGroup,
  PosMenuItem,
  PosOrderEntry,
  PosOrderLine,
  PosSelectionRule,
  PosSingleSelectionRule,
} from '@/features/pos-kernel/types'
import { createChildLineId, createEntryId, createMainLineId } from '@/shared/rtdb-entity-id'

type BuilderHelpers = Pick<
  PosCatalogHelpers,
  | 'getItemById'
  | 'getItemDisplayPrice'
  | 'isInventoryKeySoldOut'
  | 'isItemSoldOut'
  | 'normalizeEntryForDisplay'
  | 'sumLines'
>

type SelectionRuleValue = string

export type BuilderIssue = {
  kind: 'missing' | 'sold-out'
  groupId: string
  label: string
}

export type BuilderOptionView = {
  value: string
  label: string
  priceDelta: number
  disabled: boolean
  selected: boolean
}

export type BuilderRuleView = {
  id: string
  label: string
  summaryLabel?: string
  kind: 'single' | 'text'
  required: boolean
  value: string
  builderBlockId?: string
  builderRow?: number
  placeholder?: string
  options?: BuilderOptionView[]
}

export type BuilderMainBlockView = {
  id: string
  label: string
  rows: BuilderRuleView[][]
}

export type BuilderIncludeView = {
  id: string
  label: string
  itemId: string
  itemName: string
  itemShortName: string
  priceDelta: number
  categoryKey: PosMenuItem['categoryKey']
  rules: BuilderRuleView[]
}

export type BuilderUpgradeGroupView = {
  id: string
  label: string
  summaryLabel?: string
  required: boolean
  selectedValue: string
  options: BuilderOptionView[]
}

export type BuilderChildBlockView = {
  includeId: string
  label: string
  itemId: string
  itemName: string
  itemShortName: string
  priceDelta: number
  categoryKey: PosMenuItem['categoryKey']
  optionGroup?: BuilderUpgradeGroupView
  rules: BuilderRuleView[]
}

export type BuilderPresentation = {
  item: PosMenuItem
  disabled: boolean
  canConfirm: boolean
  quantity: number
  title: string
  basePrice: number
  subtotal: number
  subtitle: string
  missingIssues: BuilderIssue[]
  soldOutIssues: BuilderIssue[]
  mainBlocks: BuilderMainBlockView[]
  childBlocks: BuilderChildBlockView[]
  upgradeGroups: BuilderUpgradeGroupView[]
}

export type BuilderFinalizeResult =
  | {
      ok: true
      entry: PosOrderEntry
    }
  | {
      ok: false
      issues: BuilderIssue[]
    }

type FinalizeParams = {
  state: PosBuilderState
  helpers: BuilderHelpers
  source: PosOrderEntry['source']
  status: PosOrderEntry['status']
  entryId?: string
  createdAt?: number
  updatedAt?: number
}

type IncludeResolution = {
  includeId: string
  label: string
  item: PosMenuItem | null
  priceDelta: number
  childSelections: PosBuilderSelectionMap
}

function cloneSelections(input: PosBuilderSelectionMap | undefined): PosBuilderSelectionMap {
  return { ...(input || {}) }
}

function cloneIncludeSelections(input: Record<string, PosBuilderSelectionMap> | undefined) {
  return Object.fromEntries(Object.entries(input || {}).map(([key, value]) => [key, cloneSelections(value)]))
}

function buildIssue(kind: BuilderIssue['kind'], groupId: string, label: string): BuilderIssue {
  return { kind, groupId, label }
}

function resolveSingleOptionLabel(rule: PosSelectionRule | undefined, value: string) {
  if (!rule || !value) return ''
  if (rule.kind === 'text') return value.trim()
  return rule.options.find((option) => option.value === value)?.label || value
}

function ruleHasInventoryTracking(rule: PosSelectionRule): rule is PosSingleSelectionRule {
  return rule.kind === 'single' && rule.tracksInventory
}

function getPersistedSelectionMap(rules: PosSelectionRule[] | undefined, values: PosBuilderSelectionMap | undefined) {
  return getResolvedSelectionMap(rules, values)
}

function getSelectedUpgradeOption(item: PosMenuItem, groupId: string, value: string) {
  const group = item.upgradeGroups?.find((candidate) => candidate.id === groupId)
  return group?.options.find((option) => option.value === value) || null
}

function isOptionDisabled(
  option: { inventoryKey: string; targetItemId?: string },
  rule: PosSelectionRule | PosBundleUpgradeGroup,
  helpers: BuilderHelpers
) {
  if ('kind' in rule && ruleHasInventoryTracking(rule) && helpers.isInventoryKeySoldOut(option.inventoryKey)) {
    return true
  }
  return option.targetItemId ? helpers.isItemSoldOut(option.targetItemId) : false
}

function isAutoOptionalDrinkGroup(group: PosBundleUpgradeGroup, helpers: BuilderHelpers) {
  if (!['bundle-drink-upgrade', 'brunch-drink-upgrade'].includes(group.id)) return false
  const freeDrinkOptions = group.options.filter((option) => option.priceDelta === 0)
  return freeDrinkOptions.length > 0 && freeDrinkOptions.every((option) => isOptionDisabled(option, group, helpers))
}

function getResolvedIncludeSelections(
  includeId: string,
  childItem: PosMenuItem,
  state: PosBuilderState,
  defaultSelections: PosBuilderSelectionMap | undefined
) {
  const fromInclude = cloneSelections(state.includeSelections[includeId])
  return getResolvedSelectionMap(childItem.selections, fromInclude, defaultSelections)
}

function buildRuleView(rule: PosSelectionRule, value: string, helpers: BuilderHelpers): BuilderRuleView {
  if (rule.kind === 'text') {
    return {
      id: rule.id,
      label: rule.label,
      summaryLabel: rule.summaryLabel,
      kind: 'text',
      required: rule.required,
      value,
      builderBlockId: undefined,
      builderRow: undefined,
      placeholder: rule.placeholder,
    }
  }

  return {
    id: rule.id,
    label: rule.label,
    summaryLabel: rule.summaryLabel,
    kind: 'single',
    required: rule.required,
    value,
    builderBlockId: rule.builderBlockId,
    builderRow: rule.builderRow,
    options: rule.options.map((option) => ({
      value: option.value,
      label: option.label,
      priceDelta: option.priceDelta || 0,
      disabled: isOptionDisabled(option, rule, helpers),
      selected: option.value === value,
    })),
  }
}

function buildSummary(item: PosMenuItem, state: PosBuilderState): string {
  const parts: string[] = []
  const resolvedSelections = getResolvedSelectionMap(item.selections, state.selections)

  for (const rule of item.selections || []) {
    if (!isSelectionRuleVisible(rule, resolvedSelections)) continue
    const value = resolvedSelections[rule.id] || ''
    if (!value.trim()) continue
    const label = rule.summaryLabel || rule.label
    const displayValue = resolveSingleOptionLabel(rule, value)
    if (displayValue) {
      parts.push(`${label}：${displayValue}`)
    }
  }

  return parts.join(' / ')
}

function buildMainBlocks(ruleViews: BuilderRuleView[]) {
  const blockOrder: string[] = []
  const blockMap = new Map<string, { label: string; rows: Map<number, BuilderRuleView[]> }>()

  ruleViews.forEach((rule) => {
    const blockId = rule.builderBlockId || rule.id
    const row = rule.builderRow || 1
    let block = blockMap.get(blockId)
    if (!block) {
      block = {
        label: rule.label,
        rows: new Map(),
      }
      blockMap.set(blockId, block)
      blockOrder.push(blockId)
    }
    const rowRules = block.rows.get(row)
    if (rowRules) {
      rowRules.push(rule)
      return
    }
    block.rows.set(row, [rule])
  })

  return blockOrder.map((blockId) => {
    const block = blockMap.get(blockId)
    return {
      id: blockId,
      label: block?.label || blockId,
      rows: block ? [...block.rows.entries()].sort(([left], [right]) => left - right).map(([, rules]) => rules) : [],
    } satisfies BuilderMainBlockView
  })
}

function resolveIncludes(item: PosMenuItem, state: PosBuilderState, helpers: BuilderHelpers) {
  const resolutions: IncludeResolution[] = []
  const soldOutIssues: BuilderIssue[] = []
  const missingIssues: BuilderIssue[] = []

  for (const includeRule of item.includes || []) {
    let targetItemId = includeRule.itemId
    let priceDelta = 0

    if (includeRule.upgradeGroupId) {
      const selectedValue = state.upgradeSelections[includeRule.upgradeGroupId] || ''
      if (!selectedValue) {
        resolutions.push({
          includeId: includeRule.id,
          label: includeRule.label,
          item: null,
          priceDelta: 0,
          childSelections: cloneSelections(state.includeSelections[includeRule.id]),
        })
        continue
      }
      const selectedOption = getSelectedUpgradeOption(item, includeRule.upgradeGroupId, selectedValue)
      if (selectedOption?.targetItemId) {
        targetItemId = selectedOption.targetItemId
        priceDelta = selectedOption.priceDelta || 0
      }
    }

    const childItem = helpers.getItemById(targetItemId)
    if (!childItem) {
      soldOutIssues.push(buildIssue('sold-out', includeRule.id, includeRule.label))
      continue
    }
    if (helpers.isItemSoldOut(childItem.id)) {
      soldOutIssues.push(buildIssue('sold-out', includeRule.id, includeRule.label))
    }

    const childSelections = getResolvedIncludeSelections(
      includeRule.id,
      childItem,
      state,
      includeRule.defaultSelections
    )
    for (const rule of childItem.selections || []) {
      const value = childSelections[rule.id] || ''
      if (rule.required && !value.trim()) {
        missingIssues.push(buildIssue('missing', `${includeRule.id}.${rule.id}`, `${includeRule.label} ${rule.label}`))
      }
    }

    resolutions.push({
      includeId: includeRule.id,
      label: includeRule.label,
      item: childItem,
      priceDelta,
      childSelections,
    })
  }

  return { resolutions, soldOutIssues, missingIssues }
}

function calculateSubtotal(item: PosMenuItem, quantity: number, state: PosBuilderState, helpers: BuilderHelpers) {
  let subtotal = helpers.getItemDisplayPrice(item.id) * quantity
  for (const group of item.upgradeGroups || []) {
    const value = state.upgradeSelections[group.id] || ''
    const option = group.options.find((candidate) => candidate.value === value)
    if (option?.priceDelta) {
      subtotal += option.priceDelta * quantity
    }
  }
  return subtotal
}

export function createBuilderState(
  itemId: string,
  target: PosBuilderState['target'],
  batchId?: string
): PosBuilderState {
  return {
    itemId,
    quantity: 1,
    selections: {},
    includeSelections: {},
    upgradeSelections: {},
    editingEntryId: null,
    target,
    batchId,
  }
}

export function hydrateBuilderState(
  entry: PosOrderEntry,
  target: PosBuilderState['target'],
  batchId?: string
): PosBuilderState {
  const selections = cloneSelections(entry.selections)
  const includeSelections = cloneIncludeSelections(entry.includeSelections)
  const legacyTemperature = selections.temperature
  if (legacyTemperature && !includeSelections['included-drink']?.temperature) {
    includeSelections['included-drink'] = {
      ...(includeSelections['included-drink'] || {}),
      temperature: legacyTemperature,
    }
    delete selections.temperature
  }

  return {
    itemId: entry.itemId,
    quantity: entry.quantity,
    selections,
    includeSelections,
    upgradeSelections: { ...(entry.upgradeSelections || {}) },
    editingEntryId: entry.entryId,
    target,
    batchId,
  }
}

export function updateBuilderQuantity(state: PosBuilderState, quantity: number): PosBuilderState {
  return {
    ...state,
    quantity: Math.max(1, quantity || 1),
  }
}

export function updateBuilderSelection(
  state: PosBuilderState,
  scope: 'main' | 'include' | 'upgrade',
  key: string,
  value: string,
  nestedKey?: string
): PosBuilderState {
  if (scope === 'main') {
    return {
      ...state,
      selections: {
        ...state.selections,
        [key]: value,
      },
    }
  }

  if (scope === 'upgrade') {
    return {
      ...state,
      upgradeSelections: {
        ...state.upgradeSelections,
        [key]: value,
      },
    }
  }

  if (!nestedKey) {
    return state
  }

  return {
    ...state,
    includeSelections: {
      ...state.includeSelections,
      [key]: {
        ...(state.includeSelections[key] || {}),
        [nestedKey]: value,
      },
    },
  }
}

export function buildBuilderPresentation(args: {
  state: PosBuilderState
  helpers: BuilderHelpers
}): BuilderPresentation | null {
  const { state, helpers } = args
  const item = helpers.getItemById(state.itemId)
  if (!item) return null

  const missingIssues: BuilderIssue[] = []
  const soldOutIssues: BuilderIssue[] = []
  const quantity = Math.max(1, state.quantity || 1)
  const resolvedMainSelections = getResolvedSelectionMap(item.selections, state.selections)
  const mainRuleViews = (item.selections || []).map((rule) => {
    if (!isSelectionRuleVisible(rule, resolvedMainSelections)) {
      return null
    }
    const value = resolvedMainSelections[rule.id] || ''
    if (rule.required && !value.trim()) {
      missingIssues.push(buildIssue('missing', rule.id, rule.label))
    }
    if (rule.kind === 'single' && value) {
      const option = rule.options.find((candidate) => candidate.value === value)
      if (option?.targetItemId && helpers.isItemSoldOut(option.targetItemId)) {
        soldOutIssues.push(buildIssue('sold-out', rule.id, rule.label))
      }
    }
    return buildRuleView(rule, value, helpers)
  })
  const visibleMainRuleViews = mainRuleViews.filter((rule): rule is BuilderRuleView => Boolean(rule))
  const mainBlocks = buildMainBlocks(visibleMainRuleViews)

  if (helpers.isItemSoldOut(item.id)) {
    soldOutIssues.push(buildIssue('sold-out', item.id, item.name))
  }

  const upgradeGroups = (item.upgradeGroups || []).map((group) => {
    const selectedValue = state.upgradeSelections[group.id] || ''
    const required = group.required && !isAutoOptionalDrinkGroup(group, helpers)
    const options = group.options.map((option) => ({
      value: option.value,
      label: option.label,
      priceDelta: option.priceDelta || 0,
      disabled: isOptionDisabled(option, group, helpers),
      selected: selectedValue === option.value,
    }))
    const availableCount = options.filter((option) => !option.disabled).length
    if (required && availableCount === 0) {
      soldOutIssues.push(buildIssue('sold-out', group.id, group.label))
    }
    if (required && !selectedValue) {
      missingIssues.push(buildIssue('missing', group.id, group.label))
    }
    if (selectedValue && options.find((option) => option.value === selectedValue)?.disabled) {
      soldOutIssues.push(buildIssue('sold-out', group.id, group.label))
    }
    return {
      id: group.id,
      label: group.label,
      summaryLabel: group.summaryLabel,
      required,
      selectedValue,
      options,
    } satisfies BuilderUpgradeGroupView
  })

  const includeResolution = resolveIncludes(item, state, helpers)
  soldOutIssues.push(...includeResolution.soldOutIssues)
  missingIssues.push(...includeResolution.missingIssues)
  const childBlocks = includeResolution.resolutions.map((resolution) => {
    const optionGroup = (item.upgradeGroups || []).find(
      (group) => group.id === item.includes?.find((candidate) => candidate.id === resolution.includeId)?.upgradeGroupId
    )
    const selectedValue = optionGroup ? state.upgradeSelections[optionGroup.id] || '' : ''
    return {
      includeId: resolution.includeId,
      label: resolution.label,
      itemId: resolution.item?.id || '',
      itemName: resolution.item?.name || '',
      itemShortName: resolution.item?.shortName || resolution.item?.name || '',
      priceDelta: resolution.priceDelta,
      categoryKey: resolution.item?.categoryKey || 'other',
      optionGroup: optionGroup
        ? {
            id: optionGroup.id,
            label: optionGroup.label,
            summaryLabel: optionGroup.summaryLabel,
            required: optionGroup.required && !isAutoOptionalDrinkGroup(optionGroup, helpers),
            selectedValue,
            options: optionGroup.options.map((option) => ({
              value: option.value,
              label: option.label,
              priceDelta: option.priceDelta || 0,
              disabled: isOptionDisabled(option, optionGroup, helpers),
              selected: selectedValue === option.value,
            })),
          }
        : undefined,
      rules: (resolution.item?.selections || []).map((rule) =>
        buildRuleView(rule, resolution.childSelections[rule.id] || '', helpers)
      ),
    } satisfies BuilderChildBlockView
  })

  const childLinkedUpgradeGroupIds = new Set(
    (item.includes || []).map((includeRule) => includeRule.upgradeGroupId).filter(Boolean)
  )
  const standaloneUpgradeGroups = upgradeGroups.filter((group) => !childLinkedUpgradeGroupIds.has(group.id))

  return {
    item,
    disabled: soldOutIssues.length > 0,
    canConfirm: missingIssues.length === 0 && soldOutIssues.length === 0,
    quantity,
    title: item.name,
    basePrice: helpers.getItemDisplayPrice(item.id),
    subtotal: calculateSubtotal(item, quantity, state, helpers),
    subtitle: buildSummary(item, state),
    missingIssues,
    soldOutIssues,
    mainBlocks,
    childBlocks,
    upgradeGroups: standaloneUpgradeGroups,
  }
}

export function finalizeBuilderEntry(params: FinalizeParams): BuilderFinalizeResult {
  const { state, helpers, source, status, entryId, createdAt, updatedAt } = params
  const item = helpers.getItemById(state.itemId)
  if (!item) {
    return {
      ok: false,
      issues: [buildIssue('sold-out', state.itemId, '找不到商品')],
    }
  }

  const presentation = buildBuilderPresentation({ state, helpers })
  if (!presentation) {
    return {
      ok: false,
      issues: [buildIssue('sold-out', state.itemId, '找不到商品')],
    }
  }

  const issues = [...presentation.missingIssues, ...presentation.soldOutIssues]
  if (issues.length > 0) {
    return { ok: false, issues }
  }

  const now = updatedAt || Date.now()
  const resolvedEntryId = entryId || state.editingEntryId || createEntryId()
  const groupId = resolvedEntryId
  const quantity = Math.max(1, state.quantity || 1)
  const mainLineId = createMainLineId()
  const lines: PosOrderLine[] = []
  const resolvedMainSelections = getPersistedSelectionMap(item.selections, state.selections)
  const summary = buildSummary(item, state)
  const includeResolution = resolveIncludes(item, state, helpers)
  const resolvedIncludeSelections = Object.fromEntries(
    includeResolution.resolutions
      .filter((resolution) => resolution.item)
      .map((resolution) => [resolution.includeId, cloneSelections(resolution.childSelections)])
  )

  lines.push({
    lineId: mainLineId,
    groupId,
    role: 'main',
    catalogKey: item.productKey,
    inventoryKey: item.inventoryKey,
    displayName: item.name,
    shortName: item.shortName || item.name,
    categoryKey: item.categoryKey,
    station: item.station,
    courseKind: item.courseKind,
    quantity,
    unitPrice: helpers.getItemDisplayPrice(item.id),
    priceDelta: 0,
    lineTotal: helpers.getItemDisplayPrice(item.id) * quantity,
    selections: resolvedMainSelections,
    selectionSummary: summary
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.split('：')[1]?.trim() || part)
      .join(' / '),
    isTreat: false,
    sourceEntryId: resolvedEntryId,
  })

  includeResolution.resolutions.forEach((resolution, index) => {
    if (!resolution.item) {
      return
    }
    lines.push({
      lineId: createChildLineId(index),
      groupId,
      parentLineId: mainLineId,
      role: resolution.priceDelta > 0 ? 'upgrade' : 'included',
      catalogKey: resolution.item.productKey,
      inventoryKey: resolution.item.inventoryKey,
      displayName: resolution.item.name,
      shortName: resolution.item.shortName || resolution.item.name,
      categoryKey: resolution.item.categoryKey,
      station: resolution.item.station,
      courseKind: resolution.item.courseKind,
      quantity,
      unitPrice: resolution.priceDelta,
      priceDelta: resolution.priceDelta,
      lineTotal: resolution.priceDelta * quantity,
      selections: resolution.childSelections,
      selectionSummary: (resolution.item.selections || [])
        .map((rule) => {
          const value = resolution.childSelections[rule.id] || ''
          if (!value.trim()) return ''
          const displayValue = resolveSingleOptionLabel(rule, value)
          return displayValue || ''
        })
        .filter(Boolean)
        .join(' / '),
      isTreat: false,
      sourceEntryId: resolvedEntryId,
    })
  })

  const subtotal = helpers.sumLines(lines)

  const normalizedEntry = helpers.normalizeEntryForDisplay({
    entryId: resolvedEntryId,
    groupId,
    itemId: item.id,
    catalogKey: item.productKey,
    inventoryKey: item.inventoryKey,
    itemName: item.name,
    shortName: item.shortName || item.name,
    categoryKey: item.categoryKey,
    quantity,
    status,
    source,
    createdAt: createdAt ?? now,
    updatedAt: now,
    selections: resolvedMainSelections,
    includeSelections: resolvedIncludeSelections,
    upgradeSelections: { ...(state.upgradeSelections || {}) },
    lines,
    subtotal,
    summary: {
      title: item.name,
      subtitle: summary,
      quantityLabel: `${quantity} 份`,
      totalLabel: `$${subtotal}`,
    },
  })

  return {
    ok: true,
    entry: normalizedEntry,
  }
}

export function getFirstBuilderIssue(issues: BuilderIssue[]) {
  return issues[0] || null
}

export function getBuilderSelectionValue(
  state: PosBuilderState,
  scope: 'main' | 'include' | 'upgrade',
  key: string,
  nestedKey?: string
): SelectionRuleValue {
  if (scope === 'main') {
    return state.selections[key] || ''
  }
  if (scope === 'upgrade') {
    return state.upgradeSelections[key] || ''
  }
  if (!nestedKey) {
    return ''
  }
  return state.includeSelections[key]?.[nestedKey] || ''
}
