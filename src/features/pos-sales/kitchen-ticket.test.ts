import { describe, expect, it } from 'vitest'

import { menuMeta } from '@/features/pos-kernel/data'
import type { PosOrderBatch, PosOrderEntry, PosOrderLine } from '@/features/pos-kernel/types'
import { groupOrderLines } from '@/shared/grouped-order-lines'

import { buildKitchenTicket, toKitchenLine } from './kitchen-ticket'

const helpers = {
  getItemById: (itemId: string) => menuMeta.itemsById[itemId] || null,
  normalizeEntryForDisplay: (entry: PosOrderEntry) => entry,
}

function baseOptions(catalogKey: string) {
  return menuMeta.itemsById[catalogKey]?.selections?.find((rule) => rule.id === 'base')?.options || []
}

function menuLine(catalogKey: string, base?: string): PosOrderLine {
  const item = menuMeta.itemsById[catalogKey]
  if (!item) throw new Error(`Unknown fixture: ${catalogKey}`)
  const baseLabel = baseOptions(catalogKey).find((option) => option.value === base)?.label
  return {
    lineId: 'main',
    groupId: 'entry',
    role: 'main',
    catalogKey,
    inventoryKey: item.inventoryKey,
    categoryKey: item.categoryKey,
    displayName: item.name,
    shortName: item.shortName || item.name,
    station: 'kitchen',
    courseKind: item.courseKind,
    quantity: 1,
    unitPrice: item.basePrice,
    priceDelta: 0,
    lineTotal: item.basePrice,
    selections: base ? { base } : {},
    selectionSummary: baseLabel ? `主食：${baseLabel} / 口感：正常` : '',
    isTreat: false,
    sourceEntryId: 'entry',
  }
}

function kitchenName(catalogKey: string, base?: string) {
  return toKitchenLine(menuLine(catalogKey, base), helpers.getItemById(catalogKey)).shortName
}

function batch(batchId: string, lines: PosOrderLine[], updatedAt: number): PosOrderBatch {
  const entryLines = lines.map((line) => ({ ...line, groupId: batchId, sourceEntryId: batchId }))
  const subtotal = entryLines.reduce((sum, line) => sum + line.lineTotal, 0)
  const entry: PosOrderEntry = {
    entryId: batchId,
    groupId: batchId,
    itemId: entryLines[0].catalogKey,
    catalogKey: entryLines[0].catalogKey,
    inventoryKey: entryLines[0].inventoryKey,
    itemName: entryLines[0].displayName,
    shortName: entryLines[0].shortName,
    categoryKey: entryLines[0].categoryKey,
    quantity: 1,
    status: 'accepted',
    source: 'customer',
    createdAt: updatedAt,
    updatedAt,
    selections: {},
    upgradeSelections: {},
    lines: entryLines,
    subtotal,
    summary: { title: entryLines[0].displayName, subtitle: '', quantityLabel: '1 份', totalLabel: `$${subtotal}` },
  }
  return {
    batchId,
    table: '01桌',
    requestLabel: `#${batchId}`,
    requestSeq: 1,
    source: 'customer',
    status: 'accepted',
    createdAt: updatedAt,
    updatedAt,
    customer: {},
    entries: [entry],
    subtotal,
  }
}

describe('kitchen ticket names', () => {
  it('distinguishes salads, plated mains, bread meals and brunch dishes with similar ingredients', () => {
    const cases: Record<string, string> = {
      'salad.beef-short-rib': '牛小排沙拉',
      'plated_main.beef-short-rib': '牛小排排餐',
      'bread_set.beef-short-rib': '帶骨牛小排麵包餐',
      'salad.smoked-salmon': '煙燻鮭魚沙拉',
      'salad.crispy-bacon': '香煎脆培根沙拉',
      'salad.salami-mozzarella': '臘腸起司沙拉',
      'plated_main.chicken-leg': '香煎雞腿排餐',
      'bread_set.creamy-chicken-leg': '奶油燉雞腿麵包餐',
      'bread_set.garlic-lemon-shrimp': '蒜香檸檬鮮蝦麵包餐',
      'plated_main.red-wine-beef-stew': '紅酒燉牛肉排餐',
      'plated_main.filet-mignon': '菲力牛排',
      'plated_main.beef-wellington': '威靈頓牛排(需預訂)',
      'brunch.garden-breakfast': '花園早餐（無肉）',
      'bread_set.garlic-bread': '蒜香義式麵包片',
    }
    for (const [key, expected] of Object.entries(cases)) {
      expect(kitchenName(key), key).toBe(expected)
    }
  })

  it('puts the selected base in the name instead of repeating it in the options', () => {
    const risotto = toKitchenLine(
      menuLine('pasta_risotto.lemon-salmon', 'risotto'),
      helpers.getItemById('pasta_risotto.lemon-salmon')
    )
    expect(risotto.shortName).toBe('檸香鮭魚燉飯')
    expect(risotto.selectionSummary).toBe('口感：正常')
    expect(kitchenName('pasta_risotto.lemon-salmon', 'pasta')).toBe('檸香鮭魚義大利麵')
    expect(kitchenName('pasta_risotto.bolognese-pork', 'pasta')).toBe('辣番茄肉醬義大利麵(豬肉)')
    expect(kitchenName('pasta_risotto.creamy-mushroom-veg', 'risotto')).toBe('奶油野菇醬燉飯(素)')
    expect(kitchenName('pasta_risotto.beef-short-rib-risotto', 'risotto')).toBe('留香牛小排燉飯')
    expect(kitchenName('pasta_risotto.cheese-macaroni', 'macaroni')).toBe('起司通心粉')
  })

  it('gives every menu item and base option a distinct name', () => {
    const seen = new Set<string>()
    for (const item of Object.values(menuMeta.itemsById)) {
      const bases = baseOptions(item.id).map((option) => option.value)
      for (const base of bases.length > 0 ? bases : [undefined]) {
        const name = kitchenName(item.id, base)
        expect(seen.has(name), `Duplicate printed name: ${item.id} ${base ?? ''} -> ${name}`).toBe(false)
        seen.add(name)
      }
    }
  })
})

describe('merged kitchen ticket', () => {
  it('prints same-table batches on one ticket, renaming only main lines', () => {
    const drink = { ...menuLine('drink.black-tea'), lineId: 'drink', role: 'included' as const, parentLineId: 'main' }
    const left = batch('A', [menuLine('salad.smoked-salmon'), drink], Date.parse('2026-10-12T12:10:00+08:00'))
    const right = batch(
      'B',
      [menuLine('pasta_risotto.lemon-salmon', 'risotto')],
      Date.parse('2026-10-12T12:00:00+08:00')
    )
    const ticket = buildKitchenTicket([left, right], helpers)

    expect(ticket.seq).toBe('合併 2 筆')
    expect(ticket.sourceLabels).toEqual(['#A', '#B'])
    expect(ticket.time).toBe(buildKitchenTicket([right], helpers).time)
    expect(ticket.total).toBe(left.subtotal + right.subtotal)
    expect(
      groupOrderLines(ticket.lines).map((group) => [group.main.shortName, group.children.map((line) => line.shortName)])
    ).toEqual([
      ['煙燻鮭魚沙拉', [drink.shortName]],
      ['檸香鮭魚燉飯', []],
    ])
  })
})
