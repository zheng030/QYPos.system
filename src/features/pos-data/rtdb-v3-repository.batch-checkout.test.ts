import { describe, expect, it } from 'vitest'

import { encodeRtdbKeySegment } from './rtdb-v3-key-codec'
import { createRtdbV3Repository } from './rtdb-v3-repository'
import {
  createDbStub,
  createEntry,
  createSnapshot,
  createState,
  normalizePath,
  readAtPath,
  setAtPath,
} from './rtdb-v3-repository.test-support'

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

    const pendingBatch = await repository.submitCustomerDraft('A1', [customerEntry], state.tableCustomers.A1)
    const submittedBatch = await repository.createStaffBatch('A1', [staffEntry], state.tableCustomers.A1)

    expect(pendingBatch).toMatchObject({ requestSeq: 1, requestLabel: '#5-1' })
    expect(submittedBatch).toMatchObject({ requestSeq: 2, requestLabel: '#5-2' })
    expect(readAtPath(db.data, 'v3/live/tables/A1/summary/nextRequestSeq')).toBe(3)
  })

  it('keeps concurrently added pending batches when customer shared draft saves last-write-wins', async () => {
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

    const originalRef = db.ref.bind(db)
    let injected = false
    db.ref = ((path = '/') => {
      const ref = originalRef(path)
      if (normalizePath(path) === 'v3/live/tables/A1') {
        return {
          ...ref,
          async transaction<T>(updater: (currentValue: T | null) => T) {
            let current = readAtPath(db.data, 'v3/live/tables/A1') as T | null
            let next = updater(current)
            if (!injected) {
              injected = true
              setAtPath(db.data, 'v3/live/tables/A1/pendingBatches/pending_race', {
                batchId: 'pending_race',
                source: 'customer',
                status: 'pending',
                table: 'A1',
                customer: { name: 'A', phone: '' },
                createdAt: 2,
                updatedAt: 2,
                requestLabel: '#5-1',
                entries: {},
                subtotal: 0,
              })
              current = readAtPath(db.data, 'v3/live/tables/A1') as T | null
              next = updater(current)
            }
            setAtPath(db.data, 'v3/live/tables/A1', next)
            return {
              committed: true,
              snapshot: createSnapshot('v3/live/tables/A1', next),
            }
          },
        }
      }
      return ref
    }) as typeof db.ref

    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.saveCustomerDraft('A1', [entry], state.tableCustomers.A1)

    expect(readAtPath(db.data, 'v3/live/tables/A1/draft/entry_1')).toBeTruthy()
    expect(readAtPath(db.data, 'v3/live/tables/A1/pendingBatches/pending_race')).toBeTruthy()
    expect(readAtPath(db.data, 'v3/live/pendingSummaries/A1/pendingCount')).toBe(1)
    expect(state.pendingBatches.A1?.[0]?.batchId).toBe('pending_race')
    db.ref = originalRef as typeof db.ref
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
    expect(readAtPath(db.data, 'v3/live/tables/A1/draft')).toEqual({})
    expect(readAtPath(db.data, 'v3/live/tables/A1/pendingBatches')).toEqual({})
    expect(readAtPath(db.data, 'v3/live/tables/A1/submittedBatches/submitted_1/entries/entry_food')).toBeUndefined()
    expect(readAtPath(db.data, 'v3/live/tables/A1/submittedBatches/submitted_1/entries/entry_drink')).toBeTruthy()
    expect(readAtPath(db.data, 'v3/live/tables/A1/summary/nextSplitCounter')).toBe(2)
    expect(
      readAtPath(db.data, `v3/reports/dailyByMonth/${order.monthKey}/${order.bizDateKey}/categoryRevenue/pasta_risotto`)
    ).toBe(250)
    expect(
      readAtPath(db.data, `v3/reports/dailyByMonth/${order.monthKey}/${order.bizDateKey}/categoryRevenue/drink`)
    ).toBe(60)
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
      entries: {},
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
      entries: {},
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

    expect(db.onceCalls.filter((path) => path === 'v3/history/ordersByMonth/2026-05/2026-05-30')).toHaveLength(1)
    expect(readAtPath(db.data, 'v3/reports/dailyByMonth/2026-05/2026-05-30/paidTotal')).toBe(200)
    expect(
      readAtPath(
        db.data,
        `v3/reports/itemStatsByMonth/2026-05/2026-05-30/${encodeRtdbKeySegment('drink.green-tea')}/qty`
      )
    ).toBe(2)
    expect(
      readAtPath(db.data, `v3/reports/itemStatsByMonth/2026-05/2026-05-30/${encodeRtdbKeySegment('drink.black-tea')}`)
    ).toBeUndefined()
  })
})
