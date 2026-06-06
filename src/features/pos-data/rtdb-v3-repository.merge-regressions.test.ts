import { describe, expect, it } from 'vitest'

import { createRtdbV3Repository } from './rtdb-v3-repository'
import { createDbStub, createEntry, createState, readAtPath, setAtPath } from './rtdb-v3-repository.test-support'
import { dailySummaryStorageCodec } from './rtdb-v3-storage-codecs'

async function flushAsyncListeners() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

describe('rtdb-v3-repository', () => {
  it('refreshes only changed daily summary day on revision invalidation', async () => {
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            reports: {
              dailyByDay: {
                '2026-05-30': 1,
                '2026-05-31': 1,
              },
            },
          },
        },
        reports: {
          dailyByMonth: {
            '2026-05': {
              '2026-05-30': dailySummaryStorageCodec.encode({
                orderCount: 1,
                paidTotal: 100,
                originalTotal: 100,
                itemQtyTotal: 1,
                categoryRevenue: { drink: 100 },
                categoryCost: { drink: 10 },
                updatedAt: 1,
              }),
              '2026-05-31': dailySummaryStorageCodec.encode({
                orderCount: 2,
                paidTotal: 200,
                originalTotal: 200,
                itemQtyTotal: 2,
                categoryRevenue: { drink: 200 },
                categoryCost: { drink: 20 },
                updatedAt: 1,
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
    const stop = repository.watchDailySummariesRange(start, end, () => {})
    db.onceCalls.length = 0

    setAtPath(db.data, 'v3/reports/dailyByMonth/2026-05/2026-05-31/pt', 250)
    db.emit('v3/meta/revisions/reports/dailyByDay/2026-05-31', 'value', 2)
    await flushAsyncListeners()

    expect(db.onceCalls).toContain('v3/reports/dailyByMonth/2026-05/2026-05-31')
    expect(db.onceCalls).not.toContain('v3/reports/dailyByMonth/2026-05/2026-05-30')
    stop()
  })

  it('keeps customer live session scoped to shared draft without creating staff draft state', async () => {
    const entry = createEntry()
    const db = createDbStub({
      v3: {
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
              draft: {
                [entry.entryId]: {
                  ...entry,
                  lines: Object.fromEntries(entry.lines.map((line) => [line.lineId, line])),
                },
              },
              pendingBatches: {},
              submittedBatches: {},
            },
          },
        },
      },
    })
    const state = createState()
    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.startTableLiveSession('customer', 'A1')

    expect(state.activeDraftEntries).toHaveLength(1)
    expect(state.staffDrafts.A1).toBeUndefined()
    expect(db.onCalls.some(({ path, eventName }) => path === 'v3/live/tables/A1' && eventName === 'value')).toBe(false)
    expect(
      db.onCalls
        .filter(({ eventName }) => eventName === 'value')
        .map(({ path }) => path)
        .sort()
    ).toEqual([
      'v3/meta/revisions/live/tables/A1/draft',
      'v3/meta/revisions/live/tables/A1/pendingBatches',
      'v3/meta/revisions/live/tables/A1/submittedBatches',
      'v3/meta/revisions/live/tables/A1/summary',
    ])
  })

  it('returns rejected pending batches back into the shared draft list', async () => {
    const firstEntry = createEntry({ entryId: 'entry_1', createdAt: 1, updatedAt: 1 })
    const secondEntry = createEntry({
      entryId: 'entry_2',
      createdAt: 2,
      updatedAt: 2,
      itemId: 'drink.green-tea',
      catalogKey: 'drink.green-tea',
      inventoryKey: 'drink.green-tea',
      itemName: '綠茶',
      shortName: '綠茶',
    })
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
              draft: {
                [firstEntry.entryId]: {
                  ...firstEntry,
                  lines: Object.fromEntries(firstEntry.lines.map((line) => [line.lineId, line])),
                },
              },
              pendingBatches: {
                pending_1: {
                  batchId: 'pending_1',
                  source: 'customer',
                  status: 'pending',
                  table: 'A1',
                  customer: { name: 'A', phone: '' },
                  createdAt: 3,
                  updatedAt: 3,
                  requestLabel: '#5-1',
                  entries: {
                    [secondEntry.entryId]: {
                      ...secondEntry,
                      lines: Object.fromEntries(secondEntry.lines.map((line) => [line.lineId, line])),
                    },
                  },
                  subtotal: secondEntry.subtotal,
                },
              },
              submittedBatches: {},
            },
          },
        },
      },
    })
    const state = createState()
    state.tableCustomers.A1 = { name: 'A', phone: '', orderId: 5 }
    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.rejectPendingBatch('A1', 'pending_1')

    const draft = readAtPath(db.data, 'v3/live/tables/A1/draft') as Record<string, unknown>
    expect(Object.keys(draft)).toEqual(['entry_1', 'entry_2'])
  })

  it('merges identical staff draft entries into one row with summed quantity', async () => {
    const firstEntry = createEntry({ entryId: 'entry_1', quantity: 1, subtotal: 150, createdAt: 1, updatedAt: 1 })
    const secondEntry = createEntry({ entryId: 'entry_2', quantity: 1, subtotal: 150, createdAt: 2, updatedAt: 2 })
    const state = createState()
    const repository = createRtdbV3Repository({
      db: createDbStub({}) as never,
      state,
      helpers: {
        normalizeEntryForDisplay(entry) {
          return entry
        },
        getCanonicalDraftEntries(entries) {
          const [first, second] = entries
          return [
            {
              ...first,
              quantity: first.quantity + second.quantity,
              subtotal: first.subtotal + second.subtotal,
              updatedAt: second.updatedAt,
              summary: {
                ...first.summary,
                quantityLabel: '2 份',
                totalLabel: '$300',
              },
              lines: first.lines.map((line) => ({
                ...line,
                quantity: line.quantity + (second.lines[0]?.quantity || 0),
                lineTotal: line.lineTotal + (second.lines[0]?.lineTotal || 0),
              })),
            },
          ]
        },
      },
    })

    await repository.saveStaffDraft('A1', [firstEntry, secondEntry])

    expect(state.staffDrafts.A1).toHaveLength(1)
    expect(state.staffDrafts.A1?.[0]).toMatchObject({
      quantity: 2,
      subtotal: 300,
      summary: {
        quantityLabel: '2 份',
        totalLabel: '$300',
      },
    })
  })

  it('merges rejected pending entries with matching existing draft entries', async () => {
    const firstEntry = createEntry({ entryId: 'entry_1', createdAt: 1, updatedAt: 1, quantity: 1, subtotal: 150 })
    const secondEntry = createEntry({ entryId: 'entry_2', createdAt: 3, updatedAt: 3, quantity: 1, subtotal: 150 })
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
              draft: {
                [firstEntry.entryId]: {
                  ...firstEntry,
                  lines: Object.fromEntries(firstEntry.lines.map((line) => [line.lineId, line])),
                },
              },
              pendingBatches: {
                pending_1: {
                  batchId: 'pending_1',
                  source: 'customer',
                  status: 'pending',
                  table: 'A1',
                  customer: { name: 'A', phone: '' },
                  createdAt: 3,
                  updatedAt: 3,
                  requestLabel: '#5-1',
                  entries: {
                    [secondEntry.entryId]: {
                      ...secondEntry,
                      lines: Object.fromEntries(secondEntry.lines.map((line) => [line.lineId, line])),
                    },
                  },
                  subtotal: secondEntry.subtotal,
                },
              },
              submittedBatches: {},
            },
          },
        },
      },
    })
    const state = createState()
    state.tableCustomers.A1 = { name: 'A', phone: '', orderId: 5 }
    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.rejectPendingBatch('A1', 'pending_1')

    const draft = readAtPath(db.data, 'v3/live/tables/A1/draft') as Record<string, { q: number; t: number }>
    expect(Object.keys(draft)).toHaveLength(1)
    expect(draft.entry_1).toMatchObject({ q: 2, t: 300 })
  })
})
