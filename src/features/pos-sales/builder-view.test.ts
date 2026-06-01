import { describe, expect, it } from 'vitest'

import { menuMeta } from '@/features/pos-kernel/data'
import { createCatalogHelpers } from '@/features/pos-kernel/item-helpers'
import { buildBuilderPresentation, createBuilderState, updateBuilderSelection } from './builder'
import { renderBuilderMarkup } from './builder-view'

function createHelpers(inventory: Record<string, boolean | undefined> = {}) {
  return createCatalogHelpers({
    getInventory: () => inventory,
    getItemCosts: () => ({}),
    getItemPrices: () => ({}),
    menuMeta,
  })
}

describe('pos-sales builder-view', () => {
  it('renders the builder as a modal without a separate child-detail section or close icon', () => {
    const helpers = createHelpers()
    let state = createBuilderState('pasta_risotto.chicken-breast', 'customer-draft')
    state = updateBuilderSelection(state, 'main', 'base', 'pasta')
    state = updateBuilderSelection(state, 'main', 'sauce', 'pesto')
    state = updateBuilderSelection(state, 'upgrade', 'bundle-drink-upgrade', 'latte')
    state = updateBuilderSelection(state, 'include', 'included-drink', 'hot', 'temperature')

    const presentation = buildBuilderPresentation({ state, helpers })
    if (!presentation) {
      throw new Error('expected builder presentation')
    }

    const html = renderBuilderMarkup({
      presentation,
      editing: false,
      issueMessage: '',
    })

    expect(html).toContain('class="builder-modal-shell"')
    expect(html).toContain('class="builder-card builder-modal-card"')
    expect(html).not.toContain('子項明細')
    expect(html).not.toContain('builder-close')
    expect(html).not.toContain('builder-rule-hint')
    expect(html).not.toContain('builder-alert')
    expect(html).toContain('附飲 / 換購')
    expect(html).toContain('data-builder-block="main-base"')
    expect(html).toContain('data-builder-group="base"')
    expect(html).toContain('data-builder-group="texture"')
    expect(html).toContain('data-builder-group="included-drink"')
    expect(html).toContain('data-builder-group="included-drink.temperature"')
    expect(html).toContain('data-action="builder-cancel"')
    expect(html).toContain('加入購物車')
    expect(html).not.toContain('data-action="builder-confirm" disabled')
  })

  it('does not render texture before base is selected', () => {
    const helpers = createHelpers()
    const state = createBuilderState('pasta_risotto.chicken-breast', 'customer-draft')
    const presentation = buildBuilderPresentation({ state, helpers })
    if (!presentation) {
      throw new Error('expected builder presentation')
    }

    const html = renderBuilderMarkup({
      presentation,
      editing: false,
      issueMessage: '',
    })

    expect(html).toContain('data-builder-block="main-base"')
    expect(html).toContain('data-builder-group="base"')
    expect(html).not.toContain('data-builder-group="texture"')
    expect(html).not.toContain('>口感<')
  })

  it('disables the confirm button while required selections are incomplete', () => {
    const helpers = createHelpers()
    const state = createBuilderState('pasta_risotto.chicken-breast', 'customer-draft')
    const presentation = buildBuilderPresentation({ state, helpers })
    if (!presentation) {
      throw new Error('expected builder presentation')
    }

    const html = renderBuilderMarkup({
      presentation,
      editing: false,
      issueMessage: '',
    })

    expect(html).toContain('data-action="builder-confirm" disabled')
  })
})
