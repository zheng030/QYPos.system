import { describe, expect, it } from 'vitest'

import { renderItemImageButton, resolvePublicAssetUrl } from './runtime-utils'

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

  it('renders image controls with resolved src and preview URL', () => {
    const html = renderItemImageButton(
      {
        imageUrl: '/menu-img/brunch/garden-breakfast.jpg',
        imageAlt: '花園早餐（無肉）',
        name: '花園早餐',
      },
      'menu-card-image'
    )

    expect(html).toContain('src="/menu-img/brunch/garden-breakfast.jpg"')
    expect(html).toContain('data-image-url="/menu-img/brunch/garden-breakfast.jpg"')
  })
})
