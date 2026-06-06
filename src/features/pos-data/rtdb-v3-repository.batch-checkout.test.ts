import { describe, expect, it, vi } from 'vitest'

import { encodeRtdbKeySegment } from './rtdb-v3-key-codec'
import { createRtdbV3Repository } from './rtdb-v3-repository'
import { createDbStub, createEntry, createState, readAtPath, setAtPath } from './rtdb-v3-repository.test-support'
import { createRtdbV3RepositoryContext } from './rtdb-v3-repository-context'
import { createRtdbV3RepositoryHistoryModule } from './rtdb-v3-repository-history'
import { createRtdbV3RepositoryLiveModule } from './rtdb-v3-repository-live'
import type { V3ClosedOrder } from './rtdb-v3-types'

describe('rtdb-v3-repository', () => {
  it('uses a shared per-table request sequence across customer and staff batches', async () => {
    const customerEntry = createEntry({ entryId: 'entry_customer' })
    const staffEntry = createEntry({ entryId: 'entry_staff', source: 'staff', status: 'draft' })
    const db = createDbStub({
      v3: {
        history: {
          sequenceByDate: {},
        },
        live: {
          tables: {
            A1: {
              summary: {
                timerStartedAt: 1,
                displaySeqBase: 5,
                customer: { name: 'A', phone: '' },
                updatedAt: 1,
              },
              draft: {},
              pendingBatches: {},
              submittedBatches: {},
            },
          },
        },
      },
    })
    const state = createState()
    state.tableCustomers.A1 = { name: 'A', phone: '', orderId: 5 }
    const repository = createRtdbV3Repository({ db: db as never, state })

    const pendingBatch = await repository.submitCustomerDraft('A1', [customerEntry], state.tableCustomers.A1)
    const submittedBatch = await repository.createStaffBatch('A1', [staffEntry], state.tableCustomers.A1)

    expect(pendingBatch).toMatchObject({ requestSeq: 1, requestLabel: '#5-1' })
    expect(submittedBatch).toMatchObject({ requestSeq: 2, requestLabel: '#5-2' })
    expect(readAtPath(db.data, 'v3/live/tables/A1/summary/nextRequestSeq')).toBe(3)
  })

  it('saves customer draft without touching sibling pending batch shards', async () => {
    const entry = createEntry()
    const db = createDbStub({
      v3: {
        history: {
          sequenceByDate: {},
        },
        live: {
          tables: {
            A1: {
              summary: {
                status: 'yellow',
                timerStartedAt: 1,
                displaySeqBase: 5,
                batchCount: 0,
                customer: { name: 'A', phone: '' },
                updatedAt: 1,
              },
              draft: {},
              pendingBatches: {},
              submittedBatches: {},
            },
          },
        },
      },
    })
    const state = createState()
    state.tableCustomers.A1 = { name: 'A', phone: '', orderId: 5 }

    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.saveCustomerDraft('A1', [entry], state.tableCustomers.A1)

    expect(readAtPath(db.data, `v3/live/tables/A1/draft/${entry.entryId}`)).toBeTruthy()
    expect(readAtPath(db.data, 'v3/live/tables/A1/pendingBatches')).toEqual({})
    expect(readAtPath(db.data, 'v3/live/tables/A1/submittedBatches')).toEqual({})
    expect(readAtPath(db.data, 'v3/live/pendingSummaries/A1')).toBeUndefined()
    expect([...db.onceCalls].sort()).toEqual(
      [
        'v3/meta/revisions/live/tables/A1/summary',
        'v3/meta/revisions/live/tables/A1/draft',
        'v3/meta/revisions/live/tables/A1/pendingBatches',
        'v3/meta/revisions/live/tables/A1/submittedBatches',
        'v3/live/tables/A1/draft',
        'v3/live/tables/A1/summary',
        'v3/live/tables/A1/pendingBatches',
        'v3/live/tables/A1/submittedBatches',
      ].sort()
    )
  })

  it('writes day-level revisions and clears live state when checkout closes submitted batches', async () => {
    const entry = createEntry({
      itemId: 'drink.latte',
      itemName: '拿鐵咖啡',
      shortName: '拿鐵',
      categoryKey: 'drink',
      subtotal: 150,
    })
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            history: { ordersByDay: {} },
            reports: {
              dailyByDay: {},
              itemStatsByDay: {},
            },
          },
        },
        history: {
          sequenceByDate: {},
        },
        live: {
          tables: {
            A1: {
              summary: {
                status: 'yellow',
                timerStartedAt: 1,
                displaySeqBase: 12,
                batchCount: 1,
                customer: { name: 'A', phone: '' },
                updatedAt: 1,
              },
              draft: {},
              pendingBatches: {},
              submittedBatches: {
                submitted_1: {
                  batchId: 'submitted_1',
                  source: 'staff',
                  status: 'accepted',
                  table: 'A1',
                  customer: { name: 'A', phone: '' },
                  createdAt: 1,
                  updatedAt: 1,
                  acceptedAt: 1,
                  requestLabel: '#12-1',
                  entries: {
                    entry_1: {
                      ...entry,
                      status: 'accepted',
                      source: 'staff',
                      lines: {
                        entry_1_main: {
                          ...entry.lines[0],
                        },
                      },
                    },
                  },
                  subtotal: 150,
                },
              },
            },
          },
        },
        reports: {
          dailyByMonth: {},
          itemStatsByMonth: {},
        },
      },
    })
    const state = createState()
    state.itemCosts['drink.latte'] = 40
    state.tableCustomers.A1 = { name: 'A', phone: '', orderId: 12 }
    const repository = createRtdbV3Repository({ db: db as never, state })

    const order = await repository.checkoutSubmittedBatches({
      table: 'A1',
      entries: [{ ...entry, status: 'accepted', source: 'staff' }],
      customer: state.tableCustomers.A1,
      paidTotal: 150,
      originalTotal: 150,
    })

    expect(order.total).toBe(150)
    expect(readAtPath(db.data, 'v3/meta/revisions/history/ordersByDay')).toBeTruthy()
    expect(readAtPath(db.data, 'v3/meta/revisions/reports/dailyByDay')).toBeTruthy()
    expect(readAtPath(db.data, 'v3/meta/revisions/reports/itemStatsByDay')).toBeTruthy()
    const historyMonth = String(order.monthKey)
    const historyDay = String(order.bizDateKey)
    const storedOrder = readAtPath(
      db.data,
      `v3/history/ordersByMonth/${historyMonth}/${historyDay}/${order.orderId}`
    ) as { r?: unknown; e?: Record<string, { l?: Record<string, { w?: number }> }> } | undefined
    expect(storedOrder?.r).toBeUndefined()
    expect(Object.values(storedOrder?.e || {})[0]?.l?.[entry.lines[0]?.lineId || 'm']?.w).toBe(40)
    expect(readAtPath(db.data, 'v3/live/tables/A1')).toBeUndefined()
    expect(readAtPath(db.data, 'v3/live/tableSummaries/A1')).toBeUndefined()
    expect(state.submittedBatches.A1).toBeUndefined()
  })

  it('updates inventory, prices, and costs through the schema-driven catalog paths', async () => {
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            catalog: {
              inventory: 0,
              prices: 0,
              costs: 0,
            },
          },
        },
        catalog: {
          inventory: {
            'pasta_risotto.chicken-breast': true,
            'drink.latte': true,
          },
          prices: {
            'drink.black-tea': 70,
          },
          costs: {
            'drink.black-tea': 10,
          },
        },
      },
    })
    const state = createState()
    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.updateInventory('drink.latte', false)
    await repository.updateInventoryBatch({
      'pasta_risotto.chicken-breast': false,
      'drink.black-tea': false,
    })
    await repository.updateItemPrice('drink.black-tea', 85)
    await repository.updateItemCost('drink.black-tea', 12)

    expect(readAtPath(db.data, `v3/catalog/inventory/${encodeRtdbKeySegment('drink.latte')}`)).toBe(false)
    expect(readAtPath(db.data, `v3/catalog/inventory/${encodeRtdbKeySegment('pasta_risotto.chicken-breast')}`)).toBe(
      false
    )
    expect(readAtPath(db.data, `v3/catalog/inventory/${encodeRtdbKeySegment('drink.black-tea')}`)).toBe(false)
    expect(readAtPath(db.data, `v3/catalog/prices/${encodeRtdbKeySegment('drink.black-tea')}`)).toBe(85)
    expect(readAtPath(db.data, `v3/catalog/costs/${encodeRtdbKeySegment('drink.black-tea')}`)).toBe(12)
    expect(state.inventory['drink.latte']).toBe(false)
    expect(state.inventory['pasta_risotto.chicken-breast']).toBe(false)
    expect(state.inventory['drink.black-tea']).toBe(false)
    expect(state.itemPrices['drink.black-tea']).toBe(85)
    expect(state.itemCosts['drink.black-tea']).toBe(12)
  })

  it('supports parent item inventory sync payloads without touching unrelated target-item keys', async () => {
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            catalog: {
              inventory: 0,
            },
          },
        },
        catalog: {
          inventory: {},
        },
      },
    })
    const state = createState()
    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.updateInventoryBatch({
      'pasta_risotto.bolognese-pork': false,
      'selection.pasta_risotto.bolognese-pork.base.pasta': false,
      'selection.pasta_risotto.bolognese-pork.base.risotto': false,
    })

    expect(readAtPath(db.data, `v3/catalog/inventory/${encodeRtdbKeySegment('pasta_risotto.bolognese-pork')}`)).toBe(
      false
    )
    expect(
      readAtPath(
        db.data,
        `v3/catalog/inventory/${encodeRtdbKeySegment('selection.pasta_risotto.bolognese-pork.base.pasta')}`
      )
    ).toBe(false)
    expect(
      readAtPath(
        db.data,
        `v3/catalog/inventory/${encodeRtdbKeySegment('selection.pasta_risotto.bolognese-pork.base.risotto')}`
      )
    ).toBe(false)
    expect(readAtPath(db.data, `v3/catalog/inventory/${encodeRtdbKeySegment('drink.black-tea')}`)).toBeUndefined()
  })

  it('supports split checkout by selected entry ids and keeps remaining submitted entries live', async () => {
    const orderTs = new Date('2026-05-30T12:00:00+08:00').getTime()
    const pasta = createEntry({
      entryId: 'entry_food',
      itemId: 'pasta_risotto.chicken-breast',
      itemName: '青醬雞胸義大利麵',
      shortName: '青醬雞胸',
      categoryKey: 'pasta_risotto',
      subtotal: 310,
      createdAt: orderTs,
      updatedAt: orderTs,
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
    const drink = createEntry({
      entryId: 'entry_drink',
      itemId: 'drink.black-tea',
      itemName: '紅茶',
      shortName: '紅茶',
      categoryKey: 'drink',
      subtotal: 80,
      createdAt: orderTs,
      updatedAt: orderTs,
      lines: [
        {
          lineId: 'entry_drink_main',
          groupId: 'entry_drink',
          role: 'main',
          catalogKey: 'drink.black-tea',
          inventoryKey: 'drink.black-tea',
          displayName: '紅茶',
          shortName: '紅茶',
          categoryKey: 'drink',
          station: 'kitchen',
          courseKind: 'drink',
          quantity: 1,
          unitPrice: 80,
          priceDelta: 0,
          lineTotal: 80,
          selectionSummary: '',
          isTreat: false,
          sourceEntryId: 'entry_drink',
        },
      ],
    })
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            history: { ordersByDay: {} },
            reports: {
              dailyByDay: {},
              itemStatsByDay: {},
            },
          },
        },
        history: {
          sequenceByDate: {},
        },
        live: {
          tables: {
            A1: {
              summary: {
                status: 'yellow',
                timerStartedAt: 1,
                displaySeqBase: 12,
                batchCount: 1,
                nextSplitCounter: 1,
                customer: { name: 'A', phone: '' },
                updatedAt: 1,
              },
              draft: {
                stale_draft: {
                  ...createEntry({ entryId: 'stale_draft', subtotal: 90 }),
                  lines: {
                    stale_draft_main: {
                      ...createEntry({ entryId: 'stale_draft', subtotal: 90 }).lines[0],
                    },
                  },
                },
              },
              pendingBatches: {
                pending_1: {
                  batchId: 'pending_1',
                  source: 'customer',
                  status: 'pending',
                  table: 'A1',
                  customer: { name: 'A', phone: '' },
                  createdAt: 1,
                  updatedAt: 1,
                  requestLabel: '#12-1',
                  entries: {},
                  subtotal: 0,
                },
              },
              submittedBatches: {
                submitted_1: {
                  batchId: 'submitted_1',
                  source: 'staff',
                  status: 'accepted',
                  table: 'A1',
                  customer: { name: 'A', phone: '' },
                  createdAt: 1,
                  updatedAt: 1,
                  acceptedAt: 1,
                  requestLabel: '#12-2',
                  entries: {
                    entry_food: {
                      ...pasta,
                      status: 'accepted',
                      source: 'staff',
                      lines: Object.fromEntries(pasta.lines.map((line) => [line.lineId, line])),
                    },
                    entry_drink: {
                      ...drink,
                      status: 'accepted',
                      source: 'staff',
                      lines: Object.fromEntries(drink.lines.map((line) => [line.lineId, line])),
                    },
                  },
                  subtotal: 390,
                },
              },
            },
          },
        },
        reports: {
          dailyByMonth: {},
          itemStatsByMonth: {},
        },
      },
    })
    const state = createState()
    state.itemCosts['pasta_risotto.chicken-breast'] = 120
    state.itemCosts['drink.latte'] = 20
    state.itemCosts['drink.black-tea'] = 10
    state.tableCustomers.A1 = { name: 'A', phone: '', orderId: 12 }
    const repository = createRtdbV3Repository({ db: db as never, state })

    const order = await repository.checkoutSubmittedBatches({
      table: 'A1',
      entryIds: ['entry_food'],
      customer: state.tableCustomers.A1,
      paidTotal: 300,
      originalTotal: 310,
    })

    expect(order.formattedSeq).toBe('12-1')
    expect(order.total).toBe(300)
    expect(order.lines?.map((line) => line.catalogKey)).toEqual(['pasta_risotto.chicken-breast', 'drink.latte'])
    expect(readAtPath(db.data, 'v3/live/tables/A1/draft')).toBeUndefined()
    expect(readAtPath(db.data, 'v3/live/tables/A1/pendingBatches')).toBeUndefined()
    expect(readAtPath(db.data, 'v3/live/tables/A1/submittedBatches/submitted_1/e/entry_food')).toBeUndefined()
    expect(readAtPath(db.data, 'v3/live/tables/A1/submittedBatches/submitted_1/e/entry_drink')).toBeTruthy()
    expect(readAtPath(db.data, 'v3/live/tables/A1/summary/nextSplitCounter')).toBe(2)
    expect(readAtPath(db.data, `v3/reports/dailyByMonth/${order.monthKey}/${order.bizDateKey}/cr/pasta_risotto`)).toBe(
      250
    )
    expect(readAtPath(db.data, `v3/reports/dailyByMonth/${order.monthKey}/${order.bizDateKey}/cr/drink`)).toBe(60)
    expect(state.submittedBatches.A1?.[0]?.entries.map((entry) => entry.entryId)).toEqual(['entry_drink'])
    expect(state.tableSplitCounters.A1).toBe(2)
  })

  it('rebuilds reports from fresh day orders when deleting a closed order', async () => {
    const staleOrder = {
      orderId: 'ord_old',
      bizDate: '2026-05-30',
      monthKey: '2026-05',
      createdAt: 1,
      closedAt: 1,
      tableLabel: 'A1',
      displaySeqBase: 1,
      splitCounter: null,
      displaySeqLabel: '1',
      customer: { name: '', phone: '' },
      totals: { paid: 100, original: 100 },
      status: 'closed',
      batchIds: [],
      entries: {
        entry_1: {
          ...createEntry({
            entryId: 'entry_1',
            itemId: 'drink.black-tea',
            catalogKey: 'drink.black-tea',
            inventoryKey: 'drink.black-tea',
            itemName: '可樂',
            shortName: '可樂',
            categoryKey: 'drink',
            subtotal: 100,
          }),
          status: 'accepted',
          source: 'staff',
          lines: {
            item_1: {
              lineId: 'item_1',
              groupId: 'group_1',
              role: 'main',
              catalogKey: 'drink.black-tea',
              inventoryKey: 'drink.black-tea',
              displayName: '可樂',
              shortName: '可樂',
              categoryKey: 'drink',
              station: 'kitchen',
              courseKind: 'drink',
              quantity: 1,
              unitPrice: 100,
              unitCost: 10,
              priceDelta: 0,
              lineTotal: 100,
              selectionSummary: '',
              isTreat: false,
              sourceEntryId: 'entry_1',
            },
          },
        },
      },
    }
    const freshOrder = {
      orderId: 'ord_keep',
      bizDate: '2026-05-30',
      monthKey: '2026-05',
      createdAt: 2,
      closedAt: 2,
      tableLabel: 'B1',
      displaySeqBase: 2,
      splitCounter: null,
      displaySeqLabel: '2',
      customer: { name: '', phone: '' },
      totals: { paid: 200, original: 200 },
      status: 'closed',
      batchIds: [],
      entries: {
        entry_1: {
          ...createEntry({
            entryId: 'entry_1',
            itemId: 'drink.green-tea',
            catalogKey: 'drink.green-tea',
            inventoryKey: 'drink.green-tea',
            itemName: '雪碧',
            shortName: '雪碧',
            categoryKey: 'drink',
            quantity: 2,
            subtotal: 200,
          }),
          status: 'accepted',
          source: 'staff',
          lines: {
            item_1: {
              lineId: 'item_1',
              groupId: 'group_1',
              role: 'main',
              catalogKey: 'drink.green-tea',
              inventoryKey: 'drink.green-tea',
              displayName: '雪碧',
              shortName: '雪碧',
              categoryKey: 'drink',
              station: 'kitchen',
              courseKind: 'drink',
              quantity: 2,
              unitPrice: 100,
              unitCost: 20,
              priceDelta: 0,
              lineTotal: 200,
              selectionSummary: '',
              isTreat: false,
              sourceEntryId: 'entry_1',
            },
          },
        },
      },
    }
    const db = createDbStub({
      v3: {
        history: {
          ordersByMonth: {
            '2026-05': {
              '2026-05-30': {
                ord_old: staleOrder,
              },
            },
          },
        },
        reports: {
          dailyByMonth: {},
          itemStatsByMonth: {},
        },
      },
    })
    const repository = createRtdbV3Repository({ db: db as never, state: createState() })
    const start = new Date('2026-05-30T05:00:00+08:00')
    const end = new Date('2026-05-31T05:00:00+08:00')

    await repository.listClosedOrdersByRange({ start, endExclusive: end })
    setAtPath(db.data, 'v3/history/ordersByMonth/2026-05/2026-05-30/ord_keep', freshOrder)
    await repository.deleteClosedOrder({
      orderId: 'ord_old',
      monthKey: '2026-05',
      bizDateKey: '2026-05-30',
      time: '',
      total: 100,
    })

    expect(db.onceCalls.filter((path) => path === 'v3/history/ordersByMonth/2026-05/2026-05-30')).toHaveLength(2)
    expect(readAtPath(db.data, 'v3/reports/dailyByMonth/2026-05/2026-05-30/pt')).toBe(200)
    expect(readAtPath(db.data, 'v3/reports/itemStatsByMonth/2026-05/2026-05-30/drink%2Egreen-tea/q')).toBe(2)
    expect(readAtPath(db.data, 'v3/reports/itemStatsByMonth/2026-05/2026-05-30/drink%2Eblack-tea')).toBeUndefined()
  })

  it('rebuilds reports from authoritative day history instead of stale partial cache during checkout', async () => {
    const bizDate = '2026-06-01'
    const monthKey = '2026-06'
    const orderTs = new Date('2026-06-01T12:00:00+08:00').getTime()
    const existingA: V3ClosedOrder = {
      orderId: 'ord_a',
      bizDate,
      monthKey,
      createdAt: orderTs - 3000,
      closedAt: orderTs - 3000,
      tableLabel: 'A1',
      displaySeqBase: 1,
      splitCounter: null,
      displaySeqLabel: '1',
      customer: { name: '', phone: '' },
      totals: { paid: 2000, original: 2000 },
      status: 'closed' as const,
      batchIds: [],
      entries: {},
    }
    const existingB: V3ClosedOrder = {
      ...existingA,
      orderId: 'ord_b',
      displaySeqBase: 2,
      displaySeqLabel: '2',
      closedAt: orderTs - 2000,
      createdAt: orderTs - 2000,
      totals: { paid: 1500, original: 1500 },
    }
    const existingMissingFromCache: V3ClosedOrder = {
      ...existingA,
      orderId: 'ord_c',
      displaySeqBase: 3,
      displaySeqLabel: '3',
      closedAt: orderTs - 1000,
      createdAt: orderTs - 1000,
      totals: { paid: 750, original: 750 },
    }
    const checkoutEntry = createEntry({
      entryId: 'entry_checkout',
      itemId: 'drink.black-tea',
      catalogKey: 'drink.black-tea',
      inventoryKey: 'drink.black-tea',
      itemName: '紅茶',
      shortName: '紅茶',
      categoryKey: 'drink',
      subtotal: 750,
      createdAt: orderTs,
      updatedAt: orderTs,
      lines: [
        {
          lineId: 'entry_checkout_main',
          groupId: 'entry_checkout',
          role: 'main',
          catalogKey: 'drink.black-tea',
          inventoryKey: 'drink.black-tea',
          displayName: '紅茶',
          shortName: '紅茶',
          categoryKey: 'drink',
          station: 'kitchen',
          courseKind: 'drink',
          quantity: 1,
          unitPrice: 750,
          priceDelta: 0,
          lineTotal: 750,
          selectionSummary: '',
          isTreat: false,
          sourceEntryId: 'entry_checkout',
        },
      ],
    })
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            history: {
              ordersByDay: {
                [bizDate]: 1,
              },
            },
            reports: {
              dailyByDay: {
                [bizDate]: 1,
              },
              itemStatsByDay: {
                [bizDate]: 1,
              },
            },
            live: {
              tables: {
                A1: {
                  summary: 1,
                  pendingBatches: 1,
                  submittedBatches: 1,
                },
              },
            },
          },
        },
        history: {
          sequenceByDate: {},
          ordersByMonth: {
            [monthKey]: {
              [bizDate]: {
                ord_a: existingA,
                ord_b: existingB,
                ord_c: existingMissingFromCache,
              },
            },
          },
        },
        live: {
          tables: {
            A1: {
              summary: {
                status: 'yellow',
                timerStartedAt: 1,
                displaySeqBase: 9,
                batchCount: 1,
                customer: { name: 'A', phone: '' },
                updatedAt: 1,
              },
              draft: {},
              pendingBatches: {},
              submittedBatches: {
                submitted_1: {
                  batchId: 'submitted_1',
                  source: 'staff',
                  status: 'accepted',
                  table: 'A1',
                  customer: { name: 'A', phone: '' },
                  createdAt: orderTs,
                  updatedAt: orderTs,
                  acceptedAt: orderTs,
                  requestSeq: 1,
                  requestLabel: '#9-1',
                  entries: {
                    entry_checkout: {
                      ...checkoutEntry,
                      status: 'accepted',
                      source: 'staff',
                      lines: Object.fromEntries(checkoutEntry.lines.map((line) => [line.lineId, line])),
                    },
                  },
                  subtotal: 750,
                },
              },
            },
          },
        },
        reports: {
          dailyByMonth: {
            [monthKey]: {
              [bizDate]: {
                oc: 2,
                pt: 3500,
                ot: 3500,
                iq: 0,
                cr: {},
                cc: {},
                ua: 1,
              },
            },
          },
          itemStatsByMonth: {
            [monthKey]: {
              [bizDate]: {},
            },
          },
        },
      },
    })
    const state = createState()
    state.itemCosts['drink.black-tea'] = 0
    state.tableCustomers.A1 = { name: 'A', phone: '', orderId: 9 }
    const ctx = createRtdbV3RepositoryContext({ db: db as never, state })
    const history = createRtdbV3RepositoryHistoryModule(ctx)
    const live = createRtdbV3RepositoryLiveModule(ctx, {
      rebuildDayReports: history.rebuildDayReports,
    })

    await history.listClosedOrdersByRange({
      start: new Date('2026-06-01T05:00:00+08:00'),
      endExclusive: new Date('2026-06-02T05:00:00+08:00'),
    })

    ctx.historyDayCache.set(bizDate, {
      ord_a: existingA,
      ord_b: existingB,
    })
    ctx.markResourceFresh(`history:orders:${bizDate}`, 0)

    vi.useFakeTimers()
    vi.setSystemTime(orderTs)
    try {
      const order = await live.checkoutSubmittedBatches({
        table: 'A1',
        entries: [{ ...checkoutEntry, status: 'accepted', source: 'staff' }],
        customer: state.tableCustomers.A1,
        paidTotal: 750,
        originalTotal: 750,
      })

      expect(order.total).toBe(750)
      expect(readAtPath(db.data, `v3/reports/dailyByMonth/${monthKey}/${bizDate}/pt`)).toBe(5000)
      expect(readAtPath(db.data, `v3/reports/dailyByMonth/${monthKey}/${bizDate}/oc`)).toBe(4)
      expect(db.onceCalls).toContain(`v3/history/ordersByMonth/${monthKey}/${bizDate}`)
    } finally {
      vi.useRealTimers()
    }
  })
})
