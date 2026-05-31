import { describe, expect, it } from 'vitest'
import { applyClosedOrderToSummary, orderRecordToPosOrder, toClosedOrderRecord } from './rtdb-v3-mapper'
import { createEntry } from './rtdb-v3-repository.test-support'

describe('rtdb-v3-mapper closed order codec', () => {
  it('stores closed-order lines only inside entries and still rebuilds read-model lines', () => {
    const entry = createEntry({
      entryId: 'entry_food',
      itemId: 'pasta_risotto.chicken-breast',
      catalogKey: 'pasta_risotto.chicken-breast',
      inventoryKey: 'pasta_risotto.chicken-breast',
      itemName: '青醬雞胸義大利麵',
      shortName: '青醬雞胸',
      categoryKey: 'pasta_risotto',
      subtotal: 310,
      lines: [
        {
          lineId: 'entry_food_main',
          groupId: 'entry_food',
          role: 'main',
          catalogKey: 'pasta_risotto.chicken-breast',
          inventoryKey: 'pasta_risotto.chicken-breast',
          displayName: '青醬雞胸義大利麵',
          shortName: '青醬雞胸',
          categoryKey: 'pasta_risotto',
          station: 'kitchen',
          courseKind: 'food',
          quantity: 1,
          unitPrice: 250,
          priceDelta: 0,
          lineTotal: 250,
          selectionSummary: '',
          isTreat: false,
          sourceEntryId: 'entry_food',
        },
        {
          lineId: 'entry_food_child_0',
          groupId: 'entry_food',
          parentLineId: 'entry_food_main',
          role: 'upgrade',
          catalogKey: 'drink.latte',
          inventoryKey: 'drink.latte',
          displayName: '拿鐵咖啡',
          shortName: '拿鐵',
          categoryKey: 'drink',
          station: 'kitchen',
          courseKind: 'drink',
          quantity: 1,
          unitPrice: 60,
          priceDelta: 60,
          lineTotal: 60,
          selectionSummary: '',
          isTreat: false,
          sourceEntryId: 'entry_food',
        },
      ],
    })

    const stored = toClosedOrderRecord({
      orderId: 'ord_1',
      table: 'A1',
      displaySeqBase: 12,
      splitCounter: null,
      closedAt: new Date('2026-05-30T12:00:00+08:00').getTime(),
      customer: { name: 'A', phone: '' },
      batchIds: ['submitted_1'],
      entries: [entry],
      itemCosts: {
        'pasta_risotto.chicken-breast': 120,
        'drink.latte': 20,
      },
      paidTotal: 300,
      originalTotal: 310,
    })

    expect('lines' in stored).toBe(false)
    expect(stored.entries.entry_food?.lines.entry_food_main?.unitCost).toBe(120)
    expect(stored.entries.entry_food?.lines.entry_food_child_0?.unitCost).toBe(20)

    const mapped = orderRecordToPosOrder(stored)
    expect(mapped.lines?.map((line) => line.lineId)).toEqual(['entry_food_main', 'entry_food_child_0'])
    expect(mapped.entries?.[0]?.lines.map((line) => line.lineId)).toEqual(['entry_food_main', 'entry_food_child_0'])
  })

  it('rebuilds history UI lines and summary from entries-only closed orders', () => {
    const stored = toClosedOrderRecord({
      orderId: 'ord_entries_only',
      table: 'A1',
      displaySeqBase: 3,
      splitCounter: null,
      closedAt: new Date('2026-05-30T12:00:00+08:00').getTime(),
      customer: { name: '', phone: '' },
      batchIds: [],
      entries: [
        createEntry({
          entryId: 'entry_food',
          itemId: 'pasta_risotto.chicken-breast',
          catalogKey: 'pasta_risotto.chicken-breast',
          inventoryKey: 'pasta_risotto.chicken-breast',
          itemName: '青醬雞胸義大利麵',
          shortName: '青醬雞胸',
          categoryKey: 'pasta_risotto',
          subtotal: 310,
          lines: [
            {
              lineId: 'entry_food_main',
              groupId: 'entry_food',
              role: 'main',
              catalogKey: 'pasta_risotto.chicken-breast',
              inventoryKey: 'pasta_risotto.chicken-breast',
              displayName: '青醬雞胸義大利麵',
              shortName: '青醬雞胸',
              categoryKey: 'pasta_risotto',
              station: 'kitchen',
              courseKind: 'food',
              quantity: 1,
              unitPrice: 250,
              priceDelta: 0,
              lineTotal: 250,
              selectionSummary: '',
              isTreat: false,
              sourceEntryId: 'entry_food',
            },
            {
              lineId: 'entry_food_child_0',
              groupId: 'entry_food',
              parentLineId: 'entry_food_main',
              role: 'upgrade',
              catalogKey: 'drink.latte',
              inventoryKey: 'drink.latte',
              displayName: '拿鐵咖啡',
              shortName: '拿鐵',
              categoryKey: 'drink',
              station: 'kitchen',
              courseKind: 'drink',
              quantity: 1,
              unitPrice: 60,
              priceDelta: 60,
              lineTotal: 60,
              selectionSummary: '',
              isTreat: false,
              sourceEntryId: 'entry_food',
            },
          ],
        }),
      ],
      itemCosts: {
        'pasta_risotto.chicken-breast': 120,
        'drink.latte': 20,
      },
      paidTotal: 310,
      originalTotal: 310,
    })

    const mapped = orderRecordToPosOrder(stored)
    expect(mapped.lines?.map((line) => line.lineId)).toEqual(['entry_food_main', 'entry_food_child_0'])

    const rebuilt = applyClosedOrderToSummary(
      {
        orderCount: 0,
        paidTotal: 0,
        originalTotal: 0,
        itemQtyTotal: 0,
        categoryRevenue: {},
        categoryCost: {},
        updatedAt: 0,
      },
      {},
      stored,
      1,
      99
    )
    expect(rebuilt.summary.orderCount).toBe(1)
    expect(rebuilt.summary.categoryRevenue.pasta_risotto).toBe(250)
    expect(rebuilt.summary.categoryRevenue.drink).toBe(60)
    expect(rebuilt.itemStats['pasta_risotto.chicken-breast']?.cost).toBe(120)
    expect(rebuilt.itemStats['drink.latte']?.cost).toBe(20)
  })

  it('shrinks stored payload versus duplicated root-lines schema', () => {
    const entry = createEntry({
      entryId: 'entry_food',
      itemId: 'pasta_risotto.chicken-breast',
      catalogKey: 'pasta_risotto.chicken-breast',
      inventoryKey: 'pasta_risotto.chicken-breast',
      itemName: '青醬雞胸義大利麵',
      shortName: '青醬雞胸',
      categoryKey: 'pasta_risotto',
      subtotal: 310,
      lines: [
        {
          lineId: 'entry_food_main',
          groupId: 'entry_food',
          role: 'main',
          catalogKey: 'pasta_risotto.chicken-breast',
          inventoryKey: 'pasta_risotto.chicken-breast',
          displayName: '青醬雞胸義大利麵',
          shortName: '青醬雞胸',
          categoryKey: 'pasta_risotto',
          station: 'kitchen',
          courseKind: 'food',
          quantity: 1,
          unitPrice: 250,
          priceDelta: 0,
          lineTotal: 250,
          selectionSummary: '',
          isTreat: false,
          sourceEntryId: 'entry_food',
        },
        {
          lineId: 'entry_food_child_0',
          groupId: 'entry_food',
          parentLineId: 'entry_food_main',
          role: 'upgrade',
          catalogKey: 'drink.latte',
          inventoryKey: 'drink.latte',
          displayName: '拿鐵咖啡',
          shortName: '拿鐵',
          categoryKey: 'drink',
          station: 'kitchen',
          courseKind: 'drink',
          quantity: 1,
          unitPrice: 60,
          priceDelta: 60,
          lineTotal: 60,
          selectionSummary: '',
          isTreat: false,
          sourceEntryId: 'entry_food',
        },
      ],
    })

    const stored = toClosedOrderRecord({
      orderId: 'ord_1',
      table: 'A1',
      displaySeqBase: 12,
      splitCounter: 1,
      closedAt: new Date('2026-05-30T12:00:00+08:00').getTime(),
      customer: { name: 'A', phone: '0912' },
      batchIds: ['submitted_1'],
      entries: [entry],
      itemCosts: {
        'pasta_risotto.chicken-breast': 120,
        'drink.latte': 20,
      },
      paidTotal: 300,
      originalTotal: 310,
    })

    const newPayload = JSON.stringify(stored)
    const duplicatedPayload = JSON.stringify({
      ...stored,
      lines: stored.entries.entry_food?.lines,
    })

    expect(newPayload.length).toBeLessThan(duplicatedPayload.length)
  })
})
