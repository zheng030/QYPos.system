import { describe, expect, it } from 'vitest'
import { menuMeta } from '@/features/pos-kernel/data'
import { createCatalogHelpers } from '@/features/pos-kernel/item-helpers'
import {
  buildBuilderPresentation,
  createBuilderState,
  finalizeBuilderEntry,
  hydrateBuilderState,
  updateBuilderSelection,
} from './builder'

function createHelpers(inventory: Record<string, boolean | undefined> = {}) {
  return createCatalogHelpers({
    getInventory: () => inventory,
    getItemCosts: () => ({}),
    getItemPrices: () => ({}),
    menuMeta,
  })
}

describe('pos-sales builder', () => {
  it('normalizes schema metadata for every product and selectable child', () => {
    Object.values(menuMeta.itemsById).forEach((item) => {
      expect(item.productKey).toBe(item.id)
      expect(item.inventoryKey).toBeTruthy()
      expect(item.categoryKey).toBeTruthy()
      expect(item.station).toBe('kitchen')
      item.includes?.forEach((includeRule) => {
        expect(includeRule.inventoryKey).toBeTruthy()
        expect(includeRule.categoryKey).toBeTruthy()
      })
      item.selections?.forEach((rule) => {
        if (rule.kind !== 'single') return
        rule.options.forEach((option) => {
          expect(option.optionKey).toBeTruthy()
          expect(option.inventoryKey).toBeTruthy()
          expect(option.categoryKey).toBeTruthy()
          expect(option.station).toBe('kitchen')
          expect(typeof option.priceDelta).toBe('number')
        })
      })
      item.upgradeGroups?.forEach((group) => {
        group.options.forEach((option) => {
          expect(option.optionKey).toBeTruthy()
          expect(option.inventoryKey).toBeTruthy()
          expect(option.categoryKey).toBeTruthy()
          expect(option.station).toBe('kitchen')
          expect(typeof option.priceDelta).toBe('number')
        })
      })
    })
  })

  it('requires explicit selections before finalizing a bundle item', () => {
    const helpers = createHelpers()
    const state = createBuilderState('pasta_risotto.chicken-breast', 'customer-draft')

    const presentation = buildBuilderPresentation({ state, helpers })
    expect(presentation?.canConfirm).toBe(false)
    expect(presentation?.missingIssues.map((issue) => issue.groupId)).toEqual(['base', 'sauce', 'bundle-drink-upgrade'])

    const result = finalizeBuilderEntry({
      state,
      helpers,
      source: 'customer',
      status: 'draft',
    })
    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('expected missing validation result')
    }
    expect(result.issues[0]?.groupId).toBe('base')
  })

  it('makes the free-drink group optional when all free drinks are sold out', () => {
    const helpers = createHelpers({
      'drink.black-tea': false,
      'drink.green-tea': false,
      'drink.espresso': false,
      'drink.americano': false,
      'drink.latte': false,
      'soup.chef': false,
      'soup.puff': false,
    })
    const state = createBuilderState('plated_main.chicken-leg', 'customer-draft')
    const presentation = buildBuilderPresentation({ state, helpers })

    expect(presentation?.disabled).toBe(false)
    expect(presentation?.missingIssues.map((issue) => issue.groupId)).not.toContain('bundle-drink-upgrade')
    expect(presentation?.childBlocks[0]?.optionGroup?.required).toBe(false)
  })

  it('builds grouped main and upgrade lines with child category pricing', () => {
    const helpers = createHelpers()
    let state = createBuilderState('pasta_risotto.chicken-breast', 'customer-draft')
    state = updateBuilderSelection(state, 'main', 'base', 'pasta')
    state = updateBuilderSelection(state, 'main', 'sauce', 'pesto')
    state = updateBuilderSelection(state, 'upgrade', 'bundle-drink-upgrade', 'latte')
    state = updateBuilderSelection(state, 'include', 'included-drink', 'hot', 'temperature')

    const presentation = buildBuilderPresentation({ state, helpers })
    expect(presentation?.canConfirm).toBe(true)

    const result = finalizeBuilderEntry({
      state,
      helpers,
      source: 'customer',
      status: 'draft',
      entryId: 'entry_test',
      createdAt: 10,
      updatedAt: 20,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected finalized entry')
    }

    expect(result.entry.summary.subtitle).toBe('主食：義大利麵 / 口味：青醬')
    expect(result.entry.lines).toHaveLength(2)
    expect(result.entry.lines[0]).toMatchObject({
      lineId: 'entry_test_main',
      role: 'main',
      catalogKey: 'pasta_risotto.chicken-breast',
      inventoryKey: 'pasta_risotto.chicken-breast',
      displayName: '雞胸',
      lineTotal: 250,
      selectionSummary: '主食：義大利麵 / 口味：青醬',
    })
    expect(result.entry.lines[1]).toMatchObject({
      parentLineId: 'entry_test_main',
      role: 'upgrade',
      catalogKey: 'drink.latte',
      categoryKey: 'drink',
      unitPrice: 60,
      lineTotal: 60,
      selectionSummary: '溫度：熱',
    })
    expect(result.entry.subtotal).toBe(310)
  })

  it('generates firebase-safe entry and line ids for new entries', () => {
    const helpers = createHelpers()
    let state = createBuilderState('pasta_risotto.chicken-leg', 'customer-draft')
    state = updateBuilderSelection(state, 'main', 'base', 'pasta')
    state = updateBuilderSelection(state, 'main', 'sauce', 'cheese')
    state = updateBuilderSelection(state, 'upgrade', 'bundle-drink-upgrade', 'latte')
    state = updateBuilderSelection(state, 'include', 'included-drink', 'hot', 'temperature')

    const result = finalizeBuilderEntry({
      state,
      helpers,
      source: 'customer',
      status: 'draft',
      updatedAt: 1780141709473,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected finalized entry')
    }

    expect(result.entry.entryId).not.toContain('.')
    expect(result.entry.groupId).toBe(result.entry.entryId)
    expect(result.entry.lines.every((line) => !line.lineId.includes('.'))).toBe(true)
  })

  it('shows child temperature only after selecting a drink item with that spec', () => {
    const helpers = createHelpers()
    let state = createBuilderState('pasta_risotto.chicken-breast', 'customer-draft')
    state = updateBuilderSelection(state, 'main', 'base', 'pasta')
    state = updateBuilderSelection(state, 'main', 'sauce', 'pesto')

    const beforeUpgrade = buildBuilderPresentation({ state, helpers })
    expect(beforeUpgrade?.childBlocks[0]?.optionGroup?.id).toBe('bundle-drink-upgrade')
    expect(beforeUpgrade?.childBlocks[0]?.rules).toHaveLength(0)

    state = updateBuilderSelection(state, 'upgrade', 'bundle-drink-upgrade', 'latte')
    const afterLatte = buildBuilderPresentation({ state, helpers })
    expect(afterLatte?.childBlocks[0]?.itemId).toBe('drink.latte')
    expect(afterLatte?.childBlocks[0]?.rules.map((rule) => rule.id)).toContain('temperature')
  })

  it('omits temperature when the selected child item does not define that spec', () => {
    const helpers = createHelpers()
    let state = createBuilderState('pasta_risotto.chicken-breast', 'customer-draft')
    state = updateBuilderSelection(state, 'main', 'base', 'pasta')
    state = updateBuilderSelection(state, 'main', 'sauce', 'pesto')
    state = updateBuilderSelection(state, 'upgrade', 'bundle-drink-upgrade', 'chef-soup')

    const presentation = buildBuilderPresentation({ state, helpers })
    expect(presentation?.childBlocks[0]?.itemId).toBe('soup.chef')
    expect(presentation?.childBlocks[0]?.rules.map((rule) => rule.id)).not.toContain('temperature')
    expect(presentation?.childBlocks[0]?.rules.map((rule) => rule.id)).toContain('note')
  })

  it('treats free-drink selection as optional when black tea and green tea are both sold out', () => {
    const helpers = createHelpers({
      'drink.black-tea': false,
      'drink.green-tea': false,
    })
    let state = createBuilderState('pasta_risotto.chicken-breast', 'customer-draft')
    state = updateBuilderSelection(state, 'main', 'base', 'pasta')
    state = updateBuilderSelection(state, 'main', 'sauce', 'pesto')

    const presentation = buildBuilderPresentation({ state, helpers })
    expect(presentation?.missingIssues.map((issue) => issue.groupId)).toEqual([])
    expect(presentation?.childBlocks[0]?.optionGroup?.required).toBe(false)

    const result = finalizeBuilderEntry({
      state,
      helpers,
      source: 'customer',
      status: 'draft',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('expected finalized entry without included drink')
    }
    expect(result.entry.lines).toHaveLength(1)
  })

  it('disables item-scoped main options when their inventory keys are sold out', () => {
    const helpers = createHelpers({
      'selection.pasta_risotto.chicken-breast.sauce.pesto': false,
    })
    const state = createBuilderState('pasta_risotto.chicken-breast', 'customer-draft')
    const presentation = buildBuilderPresentation({ state, helpers })
    const sauceRule = presentation?.mainRules.find((rule) => rule.id === 'sauce')
    expect(sauceRule?.options?.find((option) => option.value === 'pesto')?.disabled).toBe(true)
  })

  it('hydrates legacy entries by moving main temperature into include selections', () => {
    const legacyState = hydrateBuilderState(
      {
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
        selections: {
          temperature: 'hot',
          base: 'pasta',
        },
        includeSelections: {},
        upgradeSelections: {
          'bundle-drink-upgrade': 'latte',
        },
        lines: [],
        subtotal: 0,
        summary: {
          title: '雞胸',
          subtitle: '',
          quantityLabel: '1 份',
          totalLabel: '$0',
        },
      },
      'customer-draft'
    )

    expect(legacyState.selections.temperature).toBeUndefined()
    expect(legacyState.includeSelections['included-drink']).toMatchObject({ temperature: 'hot' })
  })
})
