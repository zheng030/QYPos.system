import { describe, expect, it } from 'vitest'

import { drinkTemperatureSwitches, menuMeta } from '@/features/pos-kernel/data'
import { buildProductManagementView } from './product-management'

const inventory = {
  'pasta_risotto.chicken-breast': true,
  'selection.pasta_risotto.chicken-breast.base.pasta': true,
  'selection.pasta_risotto.chicken-breast.base.risotto': false,
  'selection.pasta_risotto.chicken-breast.sauce.cheese': true,
  'selection.pasta_risotto.chicken-breast.sauce.pesto': false,
}

describe('product-management', () => {
  it('builds top-level batch toggles without spec-category or target quick groups', () => {
    const view = buildProductManagementView(menuMeta.categories, drinkTemperatureSwitches, inventory)

    expect(view.quickSections.map((section) => section.title)).toEqual(['菜單分類', '口味 / 主食', '飲品溫度'])
    const [categorySection, selectionSection] = view.quickSections
    expect(categorySection.rows.map((row) => row.label)).toContain('義大利麵 / 燉飯')
    expect(categorySection.rows.map((row) => row.label)).toContain('甜點')
    expect(categorySection.rows.map((row) => row.label)).not.toContain('品類')
    expect(categorySection.rows.map((row) => row.label)).not.toContain('附加品類')

    const selectionLabels = selectionSection.rows.map((row) => row.label)
    expect(selectionLabels).toEqual(expect.arrayContaining(['主食 / 義大利麵', '主食 / 通心粉', '口味 / 青醬']))
    expect(selectionLabels).not.toContain('口感 / 正常')
    expect(selectionLabels).not.toContain('口感 / 偏軟')
  })

  it('offers store-wide cold and hot drink switches', () => {
    const view = buildProductManagementView(menuMeta.categories, drinkTemperatureSwitches, {
      'drink-temperature.hot': false,
    })
    const temperature = view.quickSections.find((section) => section.title === '飲品溫度')

    expect(temperature?.rows.map(({ label, keys, checked, status }) => ({ label, keys, checked, status }))).toEqual([
      { label: '冷飲', keys: ['drink-temperature.ice'], checked: true, status: 'available' },
      { label: '熱飲', keys: ['drink-temperature.hot'], checked: false, status: 'sold-out' },
    ])
  })

  it('marks batch toggles partial when only some of their keys are available', () => {
    const view = buildProductManagementView(menuMeta.categories, drinkTemperatureSwitches, inventory)
    const pesto = view.quickSections[1].rows.find((row) => row.label === '口味 / 青醬')

    expect(pesto?.keys).toContain('selection.pasta_risotto.chicken-breast.sauce.pesto')
    expect(pesto).toMatchObject({ checked: false, status: 'partial' })

    const soldOut = buildProductManagementView(
      menuMeta.categories,
      drinkTemperatureSwitches,
      Object.fromEntries((pesto?.keys || []).map((key) => [key, false]))
    ).quickSections[1].rows.find((row) => row.label === '口味 / 青醬')
    expect(soldOut).toMatchObject({ checked: false, status: 'sold-out' })
  })

  it('lists bundle rule options per item without target-backed options', () => {
    const view = buildProductManagementView(menuMeta.categories, drinkTemperatureSwitches, inventory)
    const items = view.categories.flatMap((category) => category.items)
    const optionKeys = items.flatMap((item) => item.options.map((option) => option.inventoryKey))

    expect(view.categories[0].accordionId).toBe('mgmt-acc-1')
    expect(items.map((item) => item.id)).toContain('dessert.original-basque')
    expect(optionKeys).toContain('selection.pasta_risotto.cheese-macaroni.base.macaroni')
    expect(optionKeys).not.toContain('selection.pasta_risotto.chicken-breast.base.macaroni')

    const chicken = items.find((item) => item.id === 'pasta_risotto.chicken-breast')
    expect(chicken?.available).toBe(true)
    expect(chicken?.options.find((option) => option.inventoryKey.endsWith('sauce.pesto'))).toMatchObject({
      label: '口味 / 青醬',
      available: false,
    })
  })
})
