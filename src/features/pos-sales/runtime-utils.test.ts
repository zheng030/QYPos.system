import { describe, expect, it } from 'vitest'

import type { PosMenuItem, PosOrderEntry } from '@/features/pos-kernel/types'

import { getEntryMenuItem, resolvePublicAssetUrl } from './runtime-utils'

describe('pos-sales runtime-utils', () => {
  it('resolves public asset URLs against the Vite base path', () => {
    expect(resolvePublicAssetUrl('menu-img/brunch/garden-breakfast.jpg', '/')).toBe(
      '/menu-img/brunch/garden-breakfast.jpg'
    )
    expect(resolvePublicAssetUrl('/menu-img/brunch/garden-breakfast.jpg', '/QYPos.system/')).toBe(
      '/QYPos.system/menu-img/brunch/garden-breakfast.jpg'
    )
    expect(resolvePublicAssetUrl('./menu-img/brunch/garden-breakfast.jpg', '/QYPos.system')).toBe(
      '/QYPos.system/menu-img/brunch/garden-breakfast.jpg'
    )
  })

  it('passes through absolute and special image URLs', () => {
    expect(resolvePublicAssetUrl('https://cdn.example.com/item.jpg', '/QYPos.system/')).toBe(
      'https://cdn.example.com/item.jpg'
    )
    expect(resolvePublicAssetUrl('//cdn.example.com/item.jpg', '/QYPos.system/')).toBe('//cdn.example.com/item.jpg')
    expect(resolvePublicAssetUrl('data:image/png;base64,abc', '/QYPos.system/')).toBe('data:image/png;base64,abc')
    expect(resolvePublicAssetUrl('blob:https://example.com/image-id', '/QYPos.system/')).toBe(
      'blob:https://example.com/image-id'
    )
  })

  it('finds the menu item of an entry by item id, catalog key, then main line catalog key', () => {
    const items = new Map([
      ['item.a', { id: 'item.a' }],
      ['catalog.b', { id: 'catalog.b' }],
      ['line.c', { id: 'line.c' }],
    ]) as unknown as Map<string, PosMenuItem>
    const getItemById = (itemId: string) => items.get(itemId) || null
    const entry = (itemId: string, catalogKey: string) =>
      ({
        itemId,
        catalogKey,
        lines: [
          { lineId: 'child', parentLineId: 'main', catalogKey: 'item.a' },
          { lineId: 'main', catalogKey: 'line.c' },
        ],
      }) as unknown as PosOrderEntry

    expect(getEntryMenuItem(entry('item.a', 'catalog.b'), getItemById)?.id).toBe('item.a')
    expect(getEntryMenuItem(entry('missing', 'catalog.b'), getItemById)?.id).toBe('catalog.b')
    expect(getEntryMenuItem(entry('missing', 'missing'), getItemById)?.id).toBe('line.c')
  })
})
