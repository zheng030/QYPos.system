import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PosDataService } from '@/features/pos-data/service'
import { menuMeta } from '@/features/pos-kernel/data'
import { createCatalogHelpers } from '@/features/pos-kernel/item-helpers'
import type { PosKernelService } from '@/features/pos-kernel/service'
import type { PosMenuItem } from '@/features/pos-kernel/types'
import { createPosSalesOrderUiModule } from './runtime-order-ui'

function getMenuItemSnippet(html: string, itemId: string) {
  const index = html.indexOf(`data-item-id="${itemId}"`)
  if (index < 0) {
    return ''
  }
  return html.slice(Math.max(0, index - 500), index + 500)
}

function getContainingButton(html: string, itemId: string) {
  const index = html.indexOf(`data-item-id="${itemId}"`)
  if (index < 0) {
    return ''
  }
  const start = html.lastIndexOf('<button', index)
  const end = html.indexOf('</button>', index)
  return start >= 0 && end >= index ? html.slice(start, end + '</button>'.length) : ''
}

function getContainingArticle(html: string, itemId: string) {
  const index = html.indexOf(`data-item-id="${itemId}"`)
  if (index < 0) {
    return null
  }
  const start = html.lastIndexOf('<article', index)
  const end = start >= 0 ? html.indexOf('</article>', start) : -1
  return start >= 0 && end >= index ? html.slice(start, end + '</article>'.length) : null
}

function createOrderUi(items: PosMenuItem[], soldOutIds = new Set<string>()) {
  const helpers = createCatalogHelpers({
    getInventory: () => Object.fromEntries([...soldOutIds].map((itemId) => [itemId, false])),
    getItemCosts: () => ({}),
    getItemPrices: () => ({}),
    menuMeta,
  })
  const kernel = {
    state: {
      currentMode: 'customer',
      menuFilter: {
        activeCategoryKey: 'brunch',
      },
    },
    menuMeta,
    helpers: {
      ...helpers,
      getMenuItemsByMode: () => items,
    },
  } as unknown as PosKernelService

  return createPosSalesOrderUiModule({
    kernel,
    data: {} as PosDataService,
    defaultCategory: 'brunch',
    currentDraftEntries: () => [],
    isCustomerMode: () => true,
    pendingOverlayState: {
      requestKey: null,
      loading: false,
      batch: null,
      error: null,
    },
    setOrderTab: vi.fn(),
    updateFloatingActions: vi.fn(),
    updatePanelCopy: vi.fn(),
    setCustomerBoxVisibility: vi.fn(),
    getDisplaySummary: vi.fn(),
    renderEntrySubtitleLines: () => '',
  })
}

describe('pos-sales runtime-order-ui', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders menu images only for image-backed items and keeps no-image items on the original item card', () => {
    const brunch = menuMeta.categories.brunch
    if (!brunch) {
      throw new Error('expected brunch category')
    }
    const items = brunch.sections.flatMap((section) => section.items)
    const grid = { innerHTML: '' }
    vi.stubGlobal('document', {
      getElementById: (id: string) => (id === 'menuGrid' ? grid : null),
    })

    createOrderUi(items, new Set(['brunch.garden-breakfast', 'brunch.garden-smoked-salmon'])).renderMenuGrid()

    const imageArticle = getContainingArticle(grid.innerHTML, 'brunch.garden-breakfast')
    expect(imageArticle).toContain('class="menu-item-card sold-out"')
    expect(imageArticle).toContain('class="menu-card-image menu-image-button"')
    expect(imageArticle).toContain('src="/menu-img/brunch/garden-breakfast.jpg"')
    expect(imageArticle).toContain('class="item menu-item-main btn-effect"')
    expect(imageArticle).toContain('disabled')

    expect(getContainingArticle(grid.innerHTML, 'brunch.garden-smoked-salmon')).toBeNull()
    const noImageButton = getContainingButton(grid.innerHTML, 'brunch.garden-smoked-salmon')
    expect(noImageButton).toContain('class="item btn-effect sold-out"')
    expect(noImageButton).toContain('disabled')
    expect(noImageButton).not.toContain('menu-item-main')
    expect(getMenuItemSnippet(grid.innerHTML, 'brunch.garden-smoked-salmon')).not.toContain('menu-card-image')
    expect(grid.innerHTML).not.toContain('menu-image-fallback')
    expect(grid.innerHTML).not.toContain('無圖')
  })
})
