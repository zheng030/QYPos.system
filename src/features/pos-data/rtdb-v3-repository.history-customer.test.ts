import { describe, expect, it } from 'vitest'

import { createMemoryPersistentCacheStore } from './rtdb-v3-cache'
import { encodeRtdbKeySegment } from './rtdb-v3-key-codec'
import { createRtdbV3Repository } from './rtdb-v3-repository'
import {
  createDbStub,
  createEntry,
  createState,
  measurePayloadSize,
  readAtPath,
} from './rtdb-v3-repository.test-support'
import { dailySummaryStorageCodec, itemStatsStorageCodec } from './rtdb-v3-storage-codecs'

describe('rtdb-v3-repository', () => {
  const sampleDailySummary = {
    orderCount: 1,
    paidTotal: 100,
    originalTotal: 100,
    itemQtyTotal: 0,
    categoryRevenue: { drink: 100 },
    categoryCost: { drink: 10 },
    updatedAt: 1,
  }
  const sampleItemStats = {
    cola: {
      displayName: '可樂',
      categoryKey: 'drink',
      qty: 1,
      revenue: 100,
      cost: 10,
      updatedAt: 1,
    },
  }

  it('reads a_la_carte-day history and item stats from child paths only', async () => {
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            history: { ordersByDay: { '2026-05-30': 1 } },
            reports: {
              dailyByDay: { '2026-05-30': 1 },
              itemStatsByDay: { '2026-05-30': 1 },
            },
          },
        },
        history: {
          ordersByMonth: {
            '2026-05': {
              '2026-05-30': {
                ord_1: {
                  orderId: 'ord_1',
                  bizDate: '2026-05-30',
                  monthKey: '2026-05',
                  createdAt: 1,
                  closedAt: 2,
                  tableLabel: 'A1',
                  displaySeqBase: 3,
                  splitCounter: null,
                  displaySeqLabel: '3',
                  customer: { name: '', phone: '' },
                  totals: { paid: 100, original: 100 },
                  status: 'closed',
                  batchIds: [],
                  entries: {},
                  lines: {},
                },
              },
            },
          },
        },
        reports: {
          dailyByMonth: {
            '2026-05': {
              '2026-05-30': dailySummaryStorageCodec.encode(sampleDailySummary),
            },
          },
          itemStatsByMonth: {
            '2026-05': {
              '2026-05-30': itemStatsStorageCodec.encode(sampleItemStats),
            },
          },
        },
      },
    })

    const repository = createRtdbV3Repository({
      db: db as never,
      state: createState(),
    })

    const start = new Date('2026-05-30T05:00:00+08:00')
    const end = new Date('2026-05-31T05:00:00+08:00')

    await repository.listClosedOrdersByRange({ start, endExclusive: end })
    await repository.loadDailySummariesRange(start, end)
    await repository.loadItemStatsRange(start, end)

    expect(db.onceCalls).toContain('v3/history/ordersByMonth/2026-05/2026-05-30')
    expect(db.onceCalls).toContain('v3/reports/dailyByMonth/2026-05/2026-05-30')
    expect(db.onceCalls).toContain('v3/reports/itemStatsByMonth/2026-05/2026-05-30')
    expect(db.onceCalls).not.toContain('v3/history/ordersByMonth/2026-05')
    expect(db.onceCalls).not.toContain('v3/reports/dailyByMonth/2026-05')
    expect(db.onceCalls).not.toContain('v3/reports/itemStatsByMonth/2026-05')
  })

  it('keeps day report read traffic under month-root baseline', async () => {
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            history: { ordersByDay: { '2026-05-30': 1, '2026-05-31': 1 } },
            reports: {
              dailyByDay: { '2026-05-30': 1, '2026-05-31': 1 },
              itemStatsByDay: { '2026-05-30': 1, '2026-05-31': 1 },
            },
          },
        },
        history: {
          ordersByMonth: {
            '2026-05': {
              '2026-05-30': {},
              '2026-05-31': {},
            },
          },
        },
        reports: {
          dailyByMonth: {
            '2026-05': {
              '2026-05-30': dailySummaryStorageCodec.encode(sampleDailySummary),
              '2026-05-31': dailySummaryStorageCodec.encode({ ...sampleDailySummary, paidTotal: 150, updatedAt: 2 }),
            },
          },
          itemStatsByMonth: {
            '2026-05': {
              '2026-05-30': itemStatsStorageCodec.encode(sampleItemStats),
              '2026-05-31': itemStatsStorageCodec.encode({
                tea: { displayName: '茶', categoryKey: 'drink', qty: 2, revenue: 150, cost: 20, updatedAt: 2 },
              }),
            },
          },
        },
      },
    })
    const repository = createRtdbV3Repository({ db: db as never, state: createState() })
    const start = new Date('2026-05-30T05:00:00+08:00')
    const end = new Date('2026-06-01T05:00:00+08:00')

    await repository.loadDailySummariesRange(start, end)
    await repository.loadItemStatsRange(start, end)

    const actualReadSize = db.readEvents
      .filter((event) => event.phase === 'once' && event.path.startsWith('v3/reports/'))
      .reduce((sum, event) => sum + event.payloadSize, 0)
    const monthRootBaseline =
      measurePayloadSize(readAtPath(db.data, 'v3/reports/dailyByMonth/2026-05')) +
      measurePayloadSize(readAtPath(db.data, 'v3/reports/itemStatsByMonth/2026-05'))

    expect(actualReadSize).toBeLessThan(monthRootBaseline)
  })

  it('reuses warm cache for history and reports when day revisions stay unchanged', async () => {
    const cacheStore = createMemoryPersistentCacheStore()
    const initialDb = createDbStub({
      v3: {
        meta: {
          revisions: {
            history: { ordersByDay: { '2026-05-30': 1 } },
            reports: {
              dailyByDay: { '2026-05-30': 1 },
              itemStatsByDay: { '2026-05-30': 1 },
            },
          },
        },
        history: {
          ordersByMonth: {
            '2026-05': {
              '2026-05-30': {
                ord_1: {
                  orderId: 'ord_1',
                  bizDate: '2026-05-30',
                  monthKey: '2026-05',
                  createdAt: 1,
                  closedAt: 2,
                  tableLabel: 'A1',
                  displaySeqBase: 3,
                  splitCounter: null,
                  displaySeqLabel: '3',
                  customer: { name: '', phone: '' },
                  totals: { paid: 100, original: 100 },
                  status: 'closed',
                  batchIds: [],
                  entries: {},
                },
              },
            },
          },
        },
        reports: {
          dailyByMonth: {
            '2026-05': {
              '2026-05-30': dailySummaryStorageCodec.encode(sampleDailySummary),
            },
          },
          itemStatsByMonth: {
            '2026-05': {
              '2026-05-30': itemStatsStorageCodec.encode(sampleItemStats),
            },
          },
        },
      },
    })
    const start = new Date('2026-05-30T05:00:00+08:00')
    const end = new Date('2026-05-31T05:00:00+08:00')
    const initialRepository = createRtdbV3Repository({
      db: initialDb as never,
      state: createState(),
      cacheStore,
    })

    await initialRepository.listClosedOrdersByRange({ start, endExclusive: end })
    await initialRepository.loadDailySummariesRange(start, end)
    await initialRepository.loadItemStatsRange(start, end)

    const warmDb = createDbStub({
      v3: {
        meta: {
          revisions: {
            history: { ordersByDay: { '2026-05-30': 1 } },
            reports: {
              dailyByDay: { '2026-05-30': 1 },
              itemStatsByDay: { '2026-05-30': 1 },
            },
          },
        },
        history: {
          ordersByMonth: {
            '2026-05': {
              '2026-05-30': {},
            },
          },
        },
        reports: {
          dailyByMonth: {
            '2026-05': {
              '2026-05-30': null,
            },
          },
          itemStatsByMonth: {
            '2026-05': {
              '2026-05-30': itemStatsStorageCodec.encode({}),
            },
          },
        },
      },
    })
    const warmRepository = createRtdbV3Repository({
      db: warmDb as never,
      state: createState(),
      cacheStore,
    })

    const orders = await warmRepository.listClosedOrdersByRange({ start, endExclusive: end })
    const summaries = await warmRepository.loadDailySummariesRange(start, end)
    const stats = await warmRepository.loadItemStatsRange(start, end)

    expect(orders).toHaveLength(1)
    expect(summaries['2026-05-30']?.paidTotal).toBe(100)
    expect(stats['2026-05-30']?.cola?.revenue).toBe(100)
    expect([...warmDb.onceCalls].sort()).toEqual([
      'v3/meta/revisions/history/ordersByDay/2026-05-30',
      'v3/meta/revisions/reports/dailyByDay/2026-05-30',
      'v3/meta/revisions/reports/itemStatsByDay/2026-05-30',
    ])
  })

  it('normalizes legacy mixed summaries when reading live and history entries', async () => {
    const legacyEntry = {
      entryId: 'entry_food',
      groupId: 'entry_food',
      itemId: 'pasta_risotto.chicken-breast',
      catalogKey: 'pasta_risotto.chicken-breast',
      inventoryKey: 'pasta_risotto.chicken-breast',
      itemName: '雞胸',
      shortName: '雞胸',
      categoryKey: 'pasta_risotto',
      quantity: 1,
      status: 'accepted' as const,
      source: 'customer' as const,
      createdAt: 1,
      updatedAt: 1,
      selections: { base: 'pasta', sauce: 'pesto' },
      includeSelections: { 'included-drink': { temperature: 'ice' } },
      upgradeSelections: { 'bundle-drink-upgrade': 'espresso' },
      lines: {
        entry_food_main: {
          lineId: 'entry_food_main',
          groupId: 'entry_food',
          role: 'main',
          catalogKey: 'pasta_risotto.chicken-breast',
          inventoryKey: 'pasta_risotto.chicken-breast',
          displayName: '雞胸',
          shortName: '雞胸',
          categoryKey: 'pasta_risotto',
          station: 'kitchen',
          courseKind: 'food',
          quantity: 1,
          unitPrice: 250,
          priceDelta: 0,
          lineTotal: 250,
          selections: { base: 'pasta', sauce: 'pesto' },
          selectionSummary: '主食：義大利麵 / 口味：青醬 / 附飲：濃縮咖啡',
          isTreat: false,
          sourceEntryId: 'entry_food',
        },
        entry_food_child_0: {
          lineId: 'entry_food_child_0',
          groupId: 'entry_food',
          parentLineId: 'entry_food_main',
          role: 'upgrade',
          catalogKey: 'drink.espresso',
          inventoryKey: 'drink.espresso',
          displayName: '濃縮咖啡',
          shortName: '濃縮咖啡',
          categoryKey: 'drink',
          station: 'kitchen',
          courseKind: 'drink',
          quantity: 1,
          unitPrice: 60,
          priceDelta: 60,
          lineTotal: 60,
          selections: { temperature: 'ice' },
          selectionSummary: '溫度：冰',
          isTreat: false,
          sourceEntryId: 'entry_food',
        },
      },
      subtotal: 310,
      summary: {
        title: '雞胸',
        subtitle: '主食：義大利麵 / 口味：青醬 / 附飲：濃縮咖啡',
        quantityLabel: '1 份',
        totalLabel: '$310',
      },
    }
    const db = createDbStub({
      v3: {
        history: {
          ordersByMonth: {
            '2026-05': {
              '2026-05-30': {
                ord_1: {
                  orderId: 'ord_1',
                  bizDate: '2026-05-30',
                  monthKey: '2026-05',
                  createdAt: 1,
                  closedAt: 1,
                  tableLabel: 'A1',
                  displaySeqBase: 12,
                  splitCounter: null,
                  displaySeqLabel: '12',
                  customer: { name: '', phone: '' },
                  totals: { paid: 310, original: 310 },
                  status: 'closed',
                  batchIds: [],
                  entries: { entry_food: legacyEntry },
                  lines: {
                    entry_food_main: { ...legacyEntry.lines.entry_food_main, unitCost: 0 },
                    entry_food_child_0: { ...legacyEntry.lines.entry_food_child_0, unitCost: 0 },
                  },
                },
              },
            },
          },
        },
      },
    })
    const repository = createRtdbV3Repository({
      db: db as never,
      state: createState(),
      helpers: {
        normalizeEntryForDisplay(entry) {
          return {
            ...entry,
            summary: { ...entry.summary, subtitle: '主食：義大利麵 / 口味：青醬' },
            lines: entry.lines.map((line) =>
              line.parentLineId
                ? { ...line, selectionSummary: '溫度：冰' }
                : { ...line, selectionSummary: '主食：義大利麵 / 口味：青醬' }
            ),
          }
        },
        getCanonicalDraftEntries(entries) {
          return entries
        },
      },
    })

    const orders = await repository.listClosedOrdersForBusinessDay(new Date('2026-05-30T12:00:00+08:00'))
    expect(orders[0]?.entries?.[0]?.summary.subtitle).toBe('主食：義大利麵 / 口味：青醬')
    expect(orders[0]?.lines?.find((line) => line.parentLineId)?.selectionSummary).toBe('溫度：冰')
  })

  it('maps early-morning anchors to the previous business day when listing closed orders', async () => {
    const db = createDbStub({
      v3: {
        history: {
          ordersByMonth: {
            '2026-05': {
              '2026-05-30': {
                closed_early: {
                  orderId: 'closed_early',
                  bizDate: '2026-05-30',
                  monthKey: '2026-05',
                  createdAt: 1,
                  closedAt: new Date('2026-05-31T02:30:00+08:00').getTime(),
                  tableLabel: 'A1',
                  displaySeqBase: 12,
                  splitCounter: null,
                  displaySeqLabel: '12',
                  customer: { name: '', phone: '' },
                  totals: { paid: 200, original: 200 },
                  status: 'closed',
                  batchIds: [],
                  entries: {
                    entry_food: {
                      entryId: 'entry_food',
                      groupId: 'entry_food',
                      itemId: 'drink.cola',
                      catalogKey: 'drink.cola',
                      inventoryKey: 'drink.cola',
                      itemName: '可樂',
                      shortName: '可樂',
                      categoryKey: 'drink',
                      quantity: 1,
                      status: 'accepted',
                      source: 'staff',
                      createdAt: 1,
                      updatedAt: 1,
                      selections: {},
                      includeSelections: {},
                      upgradeSelections: {},
                      lines: {
                        entry_food_main: {
                          lineId: 'entry_food_main',
                          groupId: 'entry_food',
                          role: 'main',
                          catalogKey: 'drink.cola',
                          inventoryKey: 'drink.cola',
                          displayName: '可樂',
                          shortName: '可樂',
                          categoryKey: 'drink',
                          station: 'kitchen',
                          courseKind: 'drink',
                          quantity: 1,
                          unitPrice: 200,
                          priceDelta: 0,
                          lineTotal: 200,
                          selectionSummary: '',
                          isTreat: false,
                          sourceEntryId: 'entry_food',
                          unitCost: 0,
                        },
                      },
                      subtotal: 200,
                      summary: {
                        title: '可樂',
                        subtitle: '',
                        quantityLabel: '1 份',
                        totalLabel: '$200',
                      },
                    },
                  },
                  lines: {
                    entry_food_main: {
                      lineId: 'entry_food_main',
                      groupId: 'entry_food',
                      role: 'main',
                      catalogKey: 'drink.cola',
                      inventoryKey: 'drink.cola',
                      displayName: '可樂',
                      shortName: '可樂',
                      categoryKey: 'drink',
                      station: 'kitchen',
                      courseKind: 'drink',
                      quantity: 1,
                      unitPrice: 200,
                      priceDelta: 0,
                      lineTotal: 200,
                      selectionSummary: '',
                      isTreat: false,
                      sourceEntryId: 'entry_food',
                      unitCost: 0,
                    },
                  },
                },
              },
            },
          },
        },
      },
    })
    const repository = createRtdbV3Repository({ db: db as never, state: createState() })

    const orders = await repository.listClosedOrdersForBusinessDay(new Date('2026-05-31T02:30:00+08:00'))

    expect(db.onceCalls).toContain('v3/history/ordersByMonth/2026-05/2026-05-30')
    expect(orders).toHaveLength(1)
    expect(orders[0]?.timestamp).toBe(new Date('2026-05-31T02:30:00+08:00').getTime())
    expect(orders[0]?.total).toBe(200)
  })

  it('saves customer drafts while preserving pending and submitted batches', async () => {
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
                displaySeqBase: 9,
                batchCount: 1,
                customer: { name: 'A', phone: '' },
                updatedAt: 1,
              },
              draft: {},
              pendingBatches: {
                pending_1: {
                  batchId: 'pending_1',
                  source: 'customer',
                  status: 'pending',
                  table: 'A1',
                  customer: { name: 'A', phone: '' },
                  createdAt: 1,
                  updatedAt: 1,
                  requestLabel: '#9-1',
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
                  requestLabel: '#9-2',
                  entries: {},
                  subtotal: 0,
                },
              },
            },
          },
        },
      },
    })
    const state = createState()
    state.tableCustomers.A1 = { name: 'A', phone: '', orderId: 9 }
    const repository = createRtdbV3Repository({ db: db as never, state })

    const result = await repository.saveCustomerDraft('A1', [entry], state.tableCustomers.A1)

    expect(result.displaySeqBase).toBe(9)
    expect(readAtPath(db.data, `v3/live/tables/A1/draft/${entry.entryId}`)).toBeTruthy()
    expect(readAtPath(db.data, 'v3/live/tables/A1/pendingBatches/pending_1')).toBeTruthy()
    expect(readAtPath(db.data, 'v3/live/tables/A1/submittedBatches/submitted_1')).toBeTruthy()
  })

  it('encodes live draft keys when entry ids contain firebase-forbidden characters', async () => {
    const entry = createEntry({
      entryId: 'pasta_risotto.chicken-leg_1780141709473',
      groupId: 'pasta_risotto.chicken-leg_1780141709473',
      itemId: 'pasta_risotto.chicken-leg',
      catalogKey: 'pasta_risotto.chicken-leg',
      inventoryKey: 'pasta_risotto.chicken-leg',
      lines: [
        {
          lineId: 'pasta_risotto.chicken-leg_1780141709473_main',
          groupId: 'pasta_risotto.chicken-leg_1780141709473',
          role: 'main',
          catalogKey: 'pasta_risotto.chicken-leg',
          inventoryKey: 'pasta_risotto.chicken-leg',
          displayName: '雞腿',
          shortName: '雞腿',
          categoryKey: 'pasta_risotto',
          station: 'kitchen',
          courseKind: 'food',
          quantity: 1,
          unitPrice: 250,
          priceDelta: 0,
          lineTotal: 250,
          selectionSummary: '',
          isTreat: false,
          sourceEntryId: 'pasta_risotto.chicken-leg_1780141709473',
        },
      ],
    })
    const db = createDbStub({
      v3: {
        history: {
          sequenceByDate: {},
        },
        live: {
          tables: {
            A1: {
              summary: null,
              draft: {},
              pendingBatches: {},
              submittedBatches: {},
            },
          },
        },
      },
    })
    const state = createState()
    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.saveCustomerDraft('A1', [entry], { name: '', phone: '' })

    const encodedEntryId = encodeRtdbKeySegment(entry.entryId)
    const encodedLineId = encodeRtdbKeySegment(entry.lines[0]?.lineId || '')
    expect(readAtPath(db.data, `v3/live/tables/A1/draft/${encodedEntryId}`)).toBeTruthy()
    expect(readAtPath(db.data, `v3/live/tables/A1/draft/${encodedEntryId}/l/${encodedLineId}`)).toBeTruthy()
  })

  it('moves customer draft to pending batch and can accept or reject it', async () => {
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

    const batch = await repository.submitCustomerDraft('A1', [entry], state.tableCustomers.A1)
    expect(batch).toMatchObject({ requestSeq: 1, requestLabel: '#5-1' })
    expect(readAtPath(db.data, `v3/live/tables/A1/pendingBatches/${batch.batchId}`)).toBeTruthy()
    expect(readAtPath(db.data, 'v3/live/tables/A1/draft')).toBeUndefined()

    const accepted = await repository.acceptPendingBatch('A1', batch.batchId)
    expect(accepted?.status).toBe('accepted')
    expect(readAtPath(db.data, `v3/live/tables/A1/pendingBatches/${batch.batchId}`)).toBeUndefined()
    expect(readAtPath(db.data, `v3/live/tables/A1/submittedBatches/${batch.batchId}`)).toBeTruthy()

    const batch2 = await repository.submitCustomerDraft('A1', [entry], state.tableCustomers.A1)
    expect(batch2).toMatchObject({ requestSeq: 2, requestLabel: '#5-2' })
    await repository.rejectPendingBatch('A1', batch2.batchId)
    expect(readAtPath(db.data, `v3/live/tables/A1/pendingBatches/${batch2.batchId}`)).toBeUndefined()
    expect(readAtPath(db.data, 'v3/live/tables/A1/draft')).toBeTruthy()
  })
})
