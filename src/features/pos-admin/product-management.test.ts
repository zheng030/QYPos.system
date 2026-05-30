import { afterEach, describe, expect, it } from 'vitest'

import { menuMeta } from '@/features/pos-kernel/data'
import { renderProductManagement } from './product-management'

type ElementStub = {
  id: string
  innerHTML: string
  style: { display: string }
  classList: {
    contains: (token: string) => boolean
  }
  querySelector: (selector: string) => { classList: { contains: (token: string) => boolean } } | null
  querySelectorAll: (selector: string) => Array<{ classList: { contains: (token: string) => boolean }; id: string }>
}

function createElementStub(id = ''): ElementStub {
  return {
    id,
    innerHTML: '',
    style: { display: '' },
    classList: {
      contains: () => false,
    },
    querySelector: () => null,
    querySelectorAll: () => [],
  }
}

function installDocumentStub() {
  const elements = new Map<string, ElementStub>()
  const documentStub = {
    getElementById: (id: string) => elements.get(id) || null,
  }

  ;(globalThis as { document?: unknown }).document = documentStub as unknown
  ;(globalThis as { HTMLElement?: unknown }).HTMLElement = Object as unknown

  return {
    add(element: ElementStub) {
      elements.set(element.id, element)
    },
    reset() {
      elements.clear()
    },
  }
}

const dom = installDocumentStub()

afterEach(() => {
  dom.reset()
})

describe('product-management', () => {
  it('renders top-level batch toggles and bundle rule option rows without spec-category or target quick groups', () => {
    const container = createElementStub('productManagementList')
    dom.add(container)

    renderProductManagement({
      inventory: () => ({
        'pasta_risotto.chicken-breast': true,
        'selection.pasta_risotto.chicken-breast.base.pasta': true,
        'selection.pasta_risotto.chicken-breast.base.risotto': false,
        'selection.pasta_risotto.chicken-breast.sauce.cheese': true,
        'selection.pasta_risotto.chicken-breast.sauce.pesto': false,
      }),
      menuData: menuMeta.categories,
    })

    expect(container.innerHTML).toContain('data-action="toggle-inventory-batch"')
    expect(container.innerHTML).toContain('data-id="product-quick-panel"')
    expect(container.innerHTML).toContain('>菜單分類<')
    expect(container.innerHTML).toContain('>口味 / 主食<')
    expect(container.innerHTML).toContain('義大利麵 / 燉飯')
    expect(container.innerHTML).toContain('>義大利麵 / 燉飯<')
    expect(container.innerHTML).toContain('主食 / 義大利麵')
    expect(container.innerHTML).toContain('口味 / 青醬')
    expect(container.innerHTML).toContain('data-option="selection.pasta_risotto.chicken-breast.sauce.pesto"')
    expect(container.innerHTML).not.toContain('>品類<')
    expect(container.innerHTML).not.toContain('>附加品類<')
    expect(container.innerHTML).toContain(
      'id="product-quick-panel" data-product-quick-panel class="accordion-content "'
    )
  })
})
