import { describe, expect, it } from 'vitest'

import { createMemoryPersistentCacheStore } from './rtdb-v3-cache'
import { createRtdbV3Repository } from './rtdb-v3-repository'
import {
  createDbStub,
  createEntry,
  createState,
  measurePayloadSize,
  readAtPath,
  setAtPath,
} from './rtdb-v3-repository.test-support'
import { encodeLiveTableShardValue, getStoredTableSummaryFieldKey } from './rtdb-v3-storage-codecs'

function lastRootUpdateKeys(db: ReturnType<typeof createDbStub>) {
  return db.updateCalls.at(-1)?.payloadKeys || []
}

function lastRootUpdate(db: ReturnType<typeof createDbStub>) {
  return db.updateCalls.at(-1)
}

function sumReadPayloadSize(
  db: ReturnType<typeof createDbStub>,
  predicate: (event: (typeof db.readEvents)[number]) => boolean = () => true
) {
  return db.readEvents.filter(predicate).reduce((sum, event) => sum + event.payloadSize, 0)
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

async function flushAsyncListeners() {
  await flushMicrotasks()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushMicrotasks()
}

function expectSummaryPatchKeys(
  keys: string[],
  fields: Array<'timerStartedAt' | 'displaySeqBase' | 'customer' | 'updatedAt'>
) {
  const baseKeys = ['v3/meta/revisions/live/tables/A1/summary']
  const summaryKeys = fields.map((field) => `v3/live/tables/A1/summary/${getStoredTableSummaryFieldKey(field)}`)
  expect(keys.sort()).toEqual([...baseKeys, ...summaryKeys].sort())
}

describe('rtdb-v3 repository contract', () => {
  it('never uses live table root transactions for customer/staff table mutations', async () => {
    const entry = createEntry()
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            live: {
              tables: {
                A1: {
                  summary: 1,
                  draft: 1,
                  pendingBatches: 1,
                  submittedBatches: 1,
                },
              },
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
    await repository.submitCustomerDraft('A1', [entry], state.tableCustomers.A1)
    await repository.createStaffBatch('A1', [entry], state.tableCustomers.A1)

    expect(db.transactionCalls.some((path) => path === 'v3/live/tables/A1')).toBe(false)
    expect(
      db.transactionCalls.every(
        (path) => path === 'v3/live/tables/A1/summary/nextRequestSeq' || path.startsWith('v3/history/sequenceByDate/')
      )
    ).toBe(true)
  })

  it('uses only summary child counter transactions for live request/split counters', async () => {
    const entry = createEntry({ status: 'accepted', source: 'staff' })
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            live: {
              tables: {
                A1: {
                  summary: 1,
                  pendingBatches: 1,
                  submittedBatches: 1,
                },
              },
            },
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
                displaySeqBase: 5,
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
                  createdAt: 2,
                  updatedAt: 2,
                  acceptedAt: 2,
                  requestSeq: 1,
                  requestLabel: '#5-1',
                  entries: {
                    entry_1: {
                      ...entry,
                      lines: Object.fromEntries(entry.lines.map((line) => [line.lineId, line])),
                    },
                  },
                  subtotal: entry.subtotal,
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
    state.tableCustomers.A1 = { name: 'A', phone: '', orderId: 5 }
    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.submitCustomerDraft('A1', [createEntry()], state.tableCustomers.A1)
    await repository.createStaffBatch(
      'A1',
      [createEntry({ source: 'staff', status: 'draft' })],
      state.tableCustomers.A1
    )
    await repository.checkoutSubmittedBatches({
      table: 'A1',
      entries: [entry],
      customer: state.tableCustomers.A1,
      paidTotal: entry.subtotal,
      originalTotal: entry.subtotal,
    })

    expect(db.transactionCalls.filter((path) => path === 'v3/live/tables/A1/summary/nextRequestSeq').length).toBe(2)
    expect(db.transactionCalls.filter((path) => path === 'v3/live/tables/A1/summary/nextSplitCounter').length).toBe(1)
    expect(db.transactionCalls.some((path) => path === 'v3/live/tables/A1')).toBe(false)
    expect(
      db.transactionCalls.every(
        (path) =>
          path === 'v3/live/tables/A1/summary/nextRequestSeq' ||
          path === 'v3/live/tables/A1/summary/nextSplitCounter' ||
          path.startsWith('v3/history/sequenceByDate/')
      )
    ).toBe(true)
  })

  it('never reads or subscribes the live table root body for table sessions', async () => {
    const entry = createEntry()
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            live: {
              tables: {
                A1: {
                  summary: 1,
                  draft: 1,
                  pendingBatches: 1,
                  submittedBatches: 1,
                },
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
    const repository = createRtdbV3Repository({ db: db as never, state: createState() })

    await repository.startTableLiveSession('customer', 'A1')

    expect(db.onceCalls).not.toContain('v3/live/tables/A1')
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

  it('saveCustomerDraft writes only draft and summary live shards plus derived previews/revisions', async () => {
    const entry = createEntry()
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            live: {
              tables: {
                A1: {
                  summary: 1,
                  draft: 1,
                  pendingBatches: 1,
                  submittedBatches: 1,
                },
              },
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
                status: null,
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

    const keys = lastRootUpdateKeys(db)
    expect(keys).toContain(`v3/live/tables/A1/draft/${entry.entryId}`)
    expect(keys).toContain('v3/meta/revisions/live/tables/A1/draft')
    expectSummaryPatchKeys(
      keys.filter((key) => key.includes('/summary')),
      ['timerStartedAt', 'updatedAt']
    )
  })

  it('updateTableCustomer writes only the summary customer fields', async () => {
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            live: {
              tables: {
                A1: {
                  summary: 1,
                  draft: 1,
                  pendingBatches: 1,
                  submittedBatches: 1,
                },
              },
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
                status: null,
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

    await repository.updateTableCustomer('A1', { name: 'B', phone: '0912', orderId: 5 })

    const keys = lastRootUpdateKeys(db)
    expectSummaryPatchKeys(
      keys.filter((key) => key.includes('/summary')),
      ['customer', 'updatedAt']
    )
    expect(keys.some((key) => key.includes('/draft'))).toBe(false)
    expect(keys.some((key) => key.includes('/pendingBatches'))).toBe(false)
    expect(keys.some((key) => key.includes('/submittedBatches'))).toBe(false)
  })

  it('saveCustomerDraft strips undefined fields from encoded draft payloads', async () => {
    const entry = createEntry()
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            live: {
              tables: {
                A1: {
                  summary: 1,
                  draft: 1,
                  pendingBatches: 1,
                  submittedBatches: 1,
                },
              },
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
                status: null,
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

    const storedDraft = lastRootUpdate(db)?.payload[`v3/live/tables/A1/draft/${entry.entryId}`] as
      | {
          l?: Record<string, Record<string, unknown>>
        }
      | undefined
    const mainLineId = entry.lines[0]?.lineId || 'm'
    expect(storedDraft?.l?.[mainLineId]).toBeTruthy()
    expect(Object.hasOwn(storedDraft?.l?.[mainLineId] || {}, 'p')).toBe(false)
  })

  it('acceptPendingBatch writes only pending/submitted/summary shards plus derived preview/revisions', async () => {
    const entry = createEntry({ entryId: 'entry_1', status: 'pending', createdAt: 2, updatedAt: 2 })
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            live: {
              tables: {
                A1: {
                  summary: 1,
                  draft: 1,
                  pendingBatches: 1,
                  submittedBatches: 1,
                },
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
                displaySeqBase: 5,
                batchCount: 0,
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
                  createdAt: 2,
                  updatedAt: 2,
                  requestSeq: 1,
                  requestLabel: '#5-1',
                  entries: {
                    entry_1: {
                      ...entry,
                      lines: Object.fromEntries(entry.lines.map((line) => [line.lineId, line])),
                    },
                  },
                  subtotal: entry.subtotal,
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

    await repository.acceptPendingBatch('A1', 'pending_1')

    const keys = lastRootUpdateKeys(db)
    expect(keys).toContain('v3/live/tables/A1/pendingBatches/pending_1')
    expect(keys).toContain('v3/live/tables/A1/submittedBatches/pending_1')
    expect(keys).toContain('v3/meta/revisions/live/tables/A1/pendingBatches')
    expect(keys).toContain('v3/meta/revisions/live/tables/A1/submittedBatches')
    expectSummaryPatchKeys(
      keys.filter((key) => key.includes('/summary')),
      ['updatedAt']
    )
  })

  it('updateSubmittedBatch writes only submitted and summary shards when patching batch entries', async () => {
    const entry = createEntry({ entryId: 'entry_1', status: 'accepted', source: 'staff', createdAt: 2, updatedAt: 2 })
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            live: {
              tables: {
                A1: {
                  summary: 1,
                  draft: 1,
                  pendingBatches: 1,
                  submittedBatches: 1,
                },
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
                displaySeqBase: 5,
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
                  createdAt: 2,
                  updatedAt: 2,
                  acceptedAt: 2,
                  requestSeq: 1,
                  requestLabel: '#5-1',
                  entries: {
                    entry_1: {
                      ...entry,
                      lines: Object.fromEntries(entry.lines.map((line) => [line.lineId, line])),
                    },
                  },
                  subtotal: entry.subtotal,
                },
              },
            },
          },
        },
      },
    })
    const state = createState()
    state.tableCustomers.A1 = { name: 'A', phone: '', orderId: 5 }
    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.updateSubmittedBatch('A1', 'submitted_1', [{ ...entry, quantity: 2, subtotal: 300 }])

    const keys = lastRootUpdateKeys(db)
    expect(keys).toContain('v3/live/tables/A1/submittedBatches/submitted_1')
    expect(keys).toContain('v3/meta/revisions/live/tables/A1/submittedBatches')
    expectSummaryPatchKeys(
      keys.filter((key) => key.includes('/summary')),
      ['updatedAt']
    )
  })

  it('submitCustomerDraft reads only summary, pending, and submitted shards before writing', async () => {
    const entry = createEntry()
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
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
                stale: {
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
    state.tableCustomers.A1 = { name: 'A', phone: '', orderId: 5 }
    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.submitCustomerDraft('A1', [entry], state.tableCustomers.A1)

    expect(db.onceCalls).not.toContain('v3/live/tables/A1/draft')
    expect(db.onceCalls).toContain('v3/live/tables/A1/summary')
    expect(db.onceCalls).toContain('v3/live/tables/A1/pendingBatches')
    expect(db.onceCalls).toContain('v3/live/tables/A1/submittedBatches')
  })

  it('rejectPendingBatch reads draft only when merge-back is required', async () => {
    const draftEntry = createEntry({ entryId: 'draft_1', createdAt: 1, updatedAt: 1 })
    const pendingEntry = createEntry({ entryId: 'pending_1', status: 'pending', createdAt: 2, updatedAt: 2 })
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            live: {
              tables: {
                A1: {
                  summary: 1,
                  draft: 1,
                  pendingBatches: 1,
                  submittedBatches: 1,
                },
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
                displaySeqBase: 5,
                batchCount: 0,
                customer: { name: 'A', phone: '' },
                updatedAt: 1,
              },
              draft: {
                draft_1: {
                  ...draftEntry,
                  lines: Object.fromEntries(draftEntry.lines.map((line) => [line.lineId, line])),
                },
              },
              pendingBatches: {
                pending_1: {
                  batchId: 'pending_1',
                  source: 'customer',
                  status: 'pending',
                  table: 'A1',
                  customer: { name: 'A', phone: '' },
                  createdAt: 2,
                  updatedAt: 2,
                  requestSeq: 1,
                  requestLabel: '#5-1',
                  entries: {
                    pending_1: {
                      ...pendingEntry,
                      lines: Object.fromEntries(pendingEntry.lines.map((line) => [line.lineId, line])),
                    },
                  },
                  subtotal: pendingEntry.subtotal,
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

    expect(db.onceCalls).toContain('v3/live/tables/A1/draft')
    expect(db.onceCalls).toContain('v3/live/tables/A1/pendingBatches')
    expect(db.onceCalls).toContain('v3/live/tables/A1/submittedBatches')
    expect(db.onceCalls).toContain('v3/live/tables/A1/summary')
  })

  it('createStaffBatch skips live draft shard reads and only loads summary, pending, submitted', async () => {
    const entry = createEntry({ source: 'staff', status: 'draft' })
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
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

    await repository.createStaffBatch('A1', [entry], state.tableCustomers.A1)

    expect(db.onceCalls).not.toContain('v3/live/tables/A1/draft')
    expect(db.onceCalls).toContain('v3/live/tables/A1/summary')
    expect(db.onceCalls).toContain('v3/live/tables/A1/pendingBatches')
    expect(db.onceCalls).toContain('v3/live/tables/A1/submittedBatches')
  })

  it('checkoutSubmittedBatches skips draft shard reads and rebuilds reports from authoritative day history', async () => {
    const entry = createEntry({ status: 'accepted', source: 'staff' })
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            history: { ordersByDay: {} },
            reports: {
              dailyByDay: {},
              itemStatsByDay: {},
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
        },
        live: {
          tables: {
            A1: {
              summary: {
                status: 'yellow',
                timerStartedAt: 1,
                displaySeqBase: 5,
                batchCount: 1,
                customer: { name: 'A', phone: '' },
                updatedAt: 1,
              },
              draft: {
                stale: {
                  ...entry,
                  lines: Object.fromEntries(entry.lines.map((line) => [line.lineId, line])),
                },
              },
              pendingBatches: {},
              submittedBatches: {
                submitted_1: {
                  batchId: 'submitted_1',
                  source: 'staff',
                  status: 'accepted',
                  table: 'A1',
                  customer: { name: 'A', phone: '' },
                  createdAt: 2,
                  updatedAt: 2,
                  acceptedAt: 2,
                  requestSeq: 1,
                  requestLabel: '#5-1',
                  entries: {
                    entry_1: {
                      ...entry,
                      lines: Object.fromEntries(entry.lines.map((line) => [line.lineId, line])),
                    },
                  },
                  subtotal: entry.subtotal,
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
    state.tableCustomers.A1 = { name: 'A', phone: '', orderId: 5 }
    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.checkoutSubmittedBatches({
      table: 'A1',
      entries: [entry],
      customer: state.tableCustomers.A1,
      paidTotal: entry.subtotal,
      originalTotal: entry.subtotal,
    })

    expect(db.onceCalls).not.toContain('v3/live/tables/A1/draft')
    expect(db.onceCalls).toContain('v3/live/tables/A1/summary')
    expect(db.onceCalls).toContain('v3/live/tables/A1/pendingBatches')
    expect(db.onceCalls).toContain('v3/live/tables/A1/submittedBatches')
    expect(db.onceCalls.filter((path) => path.startsWith('v3/history/ordersByMonth/'))).toHaveLength(1)
  })

  it('keeps request sequence unique across concurrent repository clients on same table', async () => {
    const firstEntry = createEntry({ entryId: 'entry_1' })
    const secondEntry = createEntry({ entryId: 'entry_2', createdAt: 2, updatedAt: 2 })
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
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
    const customer = { name: 'A', phone: '', orderId: 5 }
    const repoA = createRtdbV3Repository({ db: db as never, state: createState() })
    const repoB = createRtdbV3Repository({ db: db as never, state: createState() })

    const [firstBatch, secondBatch] = await Promise.all([
      repoA.submitCustomerDraft('A1', [firstEntry], customer),
      repoB.submitCustomerDraft('A1', [secondEntry], customer),
    ])

    expect(new Set([firstBatch.requestSeq, secondBatch.requestSeq]).size).toBe(2)
    expect([firstBatch.requestSeq, secondBatch.requestSeq].sort((a, b) => a - b)).toEqual([1, 2])
    expect(readAtPath(db.data, 'v3/live/tables/A1/summary/nextRequestSeq')).toBe(3)
  })

  it('does not clobber summary counters when summary patch writes sibling fields', async () => {
    const entry = createEntry()
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
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
        },
        live: {
          tables: {
            A1: {
              summary: {
                status: 'yellow',
                timerStartedAt: 1,
                displaySeqBase: 5,
                batchCount: 0,
                nextRequestSeq: 9,
                nextSplitCounter: 4,
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

    expect(readAtPath(db.data, 'v3/live/tables/A1/summary/nextRequestSeq')).toBe(9)
    expect(readAtPath(db.data, 'v3/live/tables/A1/summary/nextSplitCounter')).toBe(4)
    expect(lastRootUpdateKeys(db)).not.toContain('v3/live/tables/A1/summary')
    expect(lastRootUpdateKeys(db)).not.toContain('v3/live/tableSummaries/A1')
  })

  it('keeps split counter unique across concurrent partial checkouts on same table', async () => {
    const makeEntry = (entryId: string, subtotal: number) =>
      createEntry({
        entryId,
        itemId: `drink.${entryId}`,
        catalogKey: `drink.${entryId}`,
        inventoryKey: `drink.${entryId}`,
        itemName: entryId,
        shortName: entryId,
        subtotal,
      })
    const firstEntry = makeEntry('entry_1', 100)
    const secondEntry = makeEntry('entry_2', 120)
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            history: { ordersByDay: {} },
            reports: {
              dailyByDay: {},
              itemStatsByDay: {},
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
        },
        live: {
          tables: {
            A1: {
              summary: {
                status: 'yellow',
                timerStartedAt: 1,
                displaySeqBase: 5,
                batchCount: 2,
                customer: { name: 'A', phone: '' },
                updatedAt: 1,
              },
              draft: {},
              pendingBatches: {},
              submittedBatches: {
                submitted_a: {
                  batchId: 'submitted_a',
                  source: 'staff',
                  status: 'accepted',
                  table: 'A1',
                  customer: { name: 'A', phone: '' },
                  createdAt: 1,
                  updatedAt: 1,
                  acceptedAt: 1,
                  requestSeq: 1,
                  requestLabel: '#5-1',
                  entries: {
                    entry_1: {
                      ...firstEntry,
                      status: 'accepted',
                      source: 'staff',
                      lines: Object.fromEntries(firstEntry.lines.map((line) => [line.lineId, line])),
                    },
                  },
                  subtotal: firstEntry.subtotal,
                },
                submitted_b: {
                  batchId: 'submitted_b',
                  source: 'staff',
                  status: 'accepted',
                  table: 'A1',
                  customer: { name: 'A', phone: '' },
                  createdAt: 2,
                  updatedAt: 2,
                  acceptedAt: 2,
                  requestSeq: 2,
                  requestLabel: '#5-2',
                  entries: {
                    entry_2: {
                      ...secondEntry,
                      status: 'accepted',
                      source: 'staff',
                      lines: Object.fromEntries(secondEntry.lines.map((line) => [line.lineId, line])),
                    },
                  },
                  subtotal: secondEntry.subtotal,
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
    const customer = { name: 'A', phone: '', orderId: 5 }
    const createCheckoutState = () => {
      const state = createState()
      state.itemCosts['drink.entry_1'] = 10
      state.itemCosts['drink.entry_2'] = 12
      return state
    }
    const repoA = createRtdbV3Repository({ db: db as never, state: createCheckoutState() })
    const repoB = createRtdbV3Repository({ db: db as never, state: createCheckoutState() })

    const [firstOrder, secondOrder] = await Promise.all([
      repoA.checkoutSubmittedBatches({
        table: 'A1',
        entryIds: ['entry_1'],
        customer,
        paidTotal: 100,
        originalTotal: 100,
      }),
      repoB.checkoutSubmittedBatches({
        table: 'A1',
        entryIds: ['entry_2'],
        customer,
        paidTotal: 120,
        originalTotal: 120,
      }),
    ])

    expect(new Set([firstOrder.formattedSeq, secondOrder.formattedSeq]).size).toBe(2)
    expect(readAtPath(db.data, 'v3/live/tables/A1/summary/nextSplitCounter')).toBe(3)
  })

  it('keeps live draft payload under full-table rewrite baseline', async () => {
    const entry = createEntry()
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
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
        },
        live: {
          tables: {
            A1: {
              summary: {
                status: 'yellow',
                timerStartedAt: 1,
                displaySeqBase: 5,
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
                  createdAt: 2,
                  updatedAt: 2,
                  requestSeq: 1,
                  requestLabel: '#5-1',
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
                  createdAt: 3,
                  updatedAt: 3,
                  acceptedAt: 3,
                  requestSeq: 2,
                  requestLabel: '#5-2',
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
    state.tableCustomers.A1 = { name: 'A', phone: '', orderId: 5 }
    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.saveCustomerDraft('A1', [entry], state.tableCustomers.A1)

    const update = lastRootUpdate(db)
    const fullRewriteBaseline = JSON.stringify({
      'v3/live/tables/A1': readAtPath(db.data, 'v3/live/tables/A1'),
    }).length
    expect(update?.payloadSize || 0).toBeLessThan(fullRewriteBaseline)
  })

  it('keeps customer submit traffic under reading full live table baseline', async () => {
    const entry = createEntry()
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
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
        history: { sequenceByDate: {} },
        live: {
          tables: {
            A1: {
              summary: {
                status: 'yellow',
                timerStartedAt: 1,
                displaySeqBase: 5,
                batchCount: 1,
                customer: { name: 'A', phone: '' },
                updatedAt: 1,
              },
              draft: {
                stale: {
                  ...entry,
                  lines: Object.fromEntries(entry.lines.map((line) => [line.lineId, line])),
                },
              },
              pendingBatches: {
                pending_1: {
                  batchId: 'pending_1',
                  source: 'customer',
                  status: 'pending',
                  table: 'A1',
                  customer: { name: 'A', phone: '' },
                  createdAt: 2,
                  updatedAt: 2,
                  requestSeq: 1,
                  requestLabel: '#5-1',
                  entries: {},
                  subtotal: 0,
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

    await repository.submitCustomerDraft('A1', [entry], state.tableCustomers.A1)

    const actualReadSize = sumReadPayloadSize(
      db,
      (event) => event.phase === 'once' && event.path.startsWith('v3/live/')
    )
    const fullTableBaseline = JSON.stringify(readAtPath(db.data, 'v3/live/tables/A1')).length

    expect(actualReadSize).toBeLessThan(fullTableBaseline)
  })

  it('keeps staff accept write payload under rewriting whole live table baseline', async () => {
    const entry = createEntry({ entryId: 'entry_1', status: 'pending', createdAt: 2, updatedAt: 2 })
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            live: {
              tables: {
                A1: {
                  summary: 1,
                  draft: 1,
                  pendingBatches: 1,
                  submittedBatches: 1,
                },
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
                displaySeqBase: 5,
                batchCount: 0,
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
                  createdAt: 2,
                  updatedAt: 2,
                  requestSeq: 1,
                  requestLabel: '#5-1',
                  entries: {
                    entry_1: {
                      ...entry,
                      lines: Object.fromEntries(entry.lines.map((line) => [line.lineId, line])),
                    },
                  },
                  subtotal: entry.subtotal,
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
    const baseline = JSON.stringify({
      'v3/live/tables/A1': readAtPath(db.data, 'v3/live/tables/A1'),
    }).length

    await repository.acceptPendingBatch('A1', 'pending_1')

    expect(lastRootUpdate(db)?.payloadSize || 0).toBeLessThan(baseline)
  })

  it('keeps staff open-table reads under full-root once-plus-subscribe baseline', async () => {
    const entry = createEntry()
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            live: {
              tables: {
                A1: {
                  summary: 1,
                  draft: 1,
                  pendingBatches: 1,
                  submittedBatches: 1,
                },
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
                displaySeqBase: 5,
                batchCount: 1,
                customer: { name: 'A', phone: '' },
                updatedAt: 1,
              },
              draft: {
                [entry.entryId]: {
                  ...entry,
                  lines: Object.fromEntries(entry.lines.map((line) => [line.lineId, line])),
                },
              },
              pendingBatches: {
                pending_1: {
                  batchId: 'pending_1',
                  source: 'customer',
                  status: 'pending',
                  table: 'A1',
                  customer: { name: 'A', phone: '' },
                  createdAt: 2,
                  updatedAt: 2,
                  requestSeq: 1,
                  requestLabel: '#5-1',
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
                  createdAt: 3,
                  updatedAt: 3,
                  acceptedAt: 3,
                  requestSeq: 2,
                  requestLabel: '#5-2',
                  entries: {},
                  subtotal: 0,
                },
              },
            },
          },
        },
      },
    })
    const repository = createRtdbV3Repository({ db: db as never, state: createState() })

    await repository.startTableLiveSession('staff', 'A1')

    const actualReadSize = sumReadPayloadSize(
      db,
      (event) => event.path.startsWith('v3/live/tables/A1/') && (event.phase === 'once' || event.phase === 'on-init')
    )
    const rootBaseline = measurePayloadSize(readAtPath(db.data, 'v3/live/tables/A1')) * 2

    expect(actualReadSize).toBeLessThan(rootBaseline)
  })

  it('reconnects table session from warm cache and refetches only changed live shard', async () => {
    const cacheStore = createMemoryPersistentCacheStore()
    const entry = createEntry({ entryId: 'entry_1' })
    const initialDb = createDbStub({
      v3: {
        meta: {
          revisions: {
            live: {
              tables: {
                A1: {
                  summary: 1,
                  draft: 1,
                  pendingBatches: 1,
                  submittedBatches: 1,
                },
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
    const initialRepository = createRtdbV3Repository({
      db: initialDb as never,
      state: createState(),
      cacheStore,
    })
    await initialRepository.startTableLiveSession('customer', 'A1')

    const pendingEntry = createEntry({ entryId: 'entry_pending', status: 'pending', createdAt: 2, updatedAt: 2 })
    const warmDb = createDbStub({
      v3: {
        meta: {
          revisions: {
            live: {
              tables: {
                A1: {
                  summary: 1,
                  draft: 1,
                  pendingBatches: 2,
                  submittedBatches: 1,
                },
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
                displaySeqBase: 5,
                batchCount: 0,
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
                  createdAt: 2,
                  updatedAt: 2,
                  requestSeq: 1,
                  requestLabel: '#5-1',
                  entries: {
                    [pendingEntry.entryId]: {
                      ...pendingEntry,
                      lines: Object.fromEntries(pendingEntry.lines.map((line) => [line.lineId, line])),
                    },
                  },
                  subtotal: pendingEntry.subtotal,
                },
              },
              submittedBatches: {},
            },
          },
        },
      },
    })
    const state = createState()
    const warmRepository = createRtdbV3Repository({
      db: warmDb as never,
      state,
      cacheStore,
    })

    await warmRepository.startTableLiveSession('customer', 'A1')

    expect(state.activeDraftEntries.map((item) => item.entryId)).toEqual(['entry_1'])
    expect(state.activePendingBatches[0]?.entries.map((item) => item.entryId)).toEqual(['entry_pending'])
    expect([...warmDb.onceCalls].sort()).toEqual(
      [
        'v3/meta/revisions/live/tables/A1/summary',
        'v3/meta/revisions/live/tables/A1/draft',
        'v3/meta/revisions/live/tables/A1/pendingBatches',
        'v3/meta/revisions/live/tables/A1/submittedBatches',
        'v3/live/tables/A1/pendingBatches',
      ].sort()
    )
  })

  it('keeps partial checkout total write payload under whole-live-root baseline', async () => {
    const pasta = createEntry({
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
    const drink = createEntry({
      entryId: 'entry_drink',
      itemId: 'drink.black-tea',
      catalogKey: 'drink.black-tea',
      inventoryKey: 'drink.black-tea',
      itemName: '紅茶',
      shortName: '紅茶',
      categoryKey: 'drink',
      subtotal: 80,
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
        history: { sequenceByDate: {} },
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
    const beforeUpdates = db.updateCalls.length

    const order = await repository.checkoutSubmittedBatches({
      table: 'A1',
      entryIds: ['entry_food'],
      customer: state.tableCustomers.A1,
      paidTotal: 300,
      originalTotal: 310,
    })

    const actualWriteSize = db.updateCalls.slice(beforeUpdates).reduce((sum, call) => sum + call.payloadSize, 0)
    const baseline = JSON.stringify({
      'v3/live/tables/A1': readAtPath(db.data, 'v3/live/tables/A1'),
      [`v3/history/ordersByMonth/${order.monthKey}/${order.bizDateKey}`]: readAtPath(
        db.data,
        `v3/history/ordersByMonth/${order.monthKey}/${order.bizDateKey}`
      ),
      [`v3/reports/dailyByMonth/${order.monthKey}/${order.bizDateKey}`]: readAtPath(
        db.data,
        `v3/reports/dailyByMonth/${order.monthKey}/${order.bizDateKey}`
      ),
      [`v3/reports/itemStatsByMonth/${order.monthKey}/${order.bizDateKey}`]: readAtPath(
        db.data,
        `v3/reports/itemStatsByMonth/${order.monthKey}/${order.bizDateKey}`
      ),
      [`v3/meta/revisions/history/ordersByDay/${order.bizDateKey}`]: readAtPath(
        db.data,
        `v3/meta/revisions/history/ordersByDay/${order.bizDateKey}`
      ),
      [`v3/meta/revisions/reports/dailyByDay/${order.bizDateKey}`]: readAtPath(
        db.data,
        `v3/meta/revisions/reports/dailyByDay/${order.bizDateKey}`
      ),
      [`v3/meta/revisions/reports/itemStatsByDay/${order.bizDateKey}`]: readAtPath(
        db.data,
        `v3/meta/revisions/reports/itemStatsByDay/${order.bizDateKey}`
      ),
      'v3/meta/revisions/live/tables/A1/summary': readAtPath(db.data, 'v3/meta/revisions/live/tables/A1/summary'),
      'v3/meta/revisions/live/tables/A1/pendingBatches': readAtPath(
        db.data,
        'v3/meta/revisions/live/tables/A1/pendingBatches'
      ),
      'v3/meta/revisions/live/tables/A1/submittedBatches': readAtPath(
        db.data,
        'v3/meta/revisions/live/tables/A1/submittedBatches'
      ),
    }).length

    expect(actualWriteSize).toBeLessThanOrEqual(baseline + 64)
  })

  it('pushes new customer pending batches into staff global preview without page refresh', async () => {
    const entry = createEntry({ entryId: 'entry_pending', itemName: '可樂', shortName: '可樂' })
    const encodedPendingBatches = encodeLiveTableShardValue('pendingBatches', {
      pending_1: {
        batchId: 'pending_1',
        source: 'customer',
        status: 'pending',
        table: 'A1',
        customer: { name: '王小明', phone: '0900' },
        createdAt: 2,
        updatedAt: 2,
        requestSeq: 1,
        requestLabel: '#5-1',
        entries: {
          [entry.entryId]: {
            ...entry,
            status: 'pending',
            lines: Object.fromEntries(entry.lines.map((line) => [line.lineId, line])),
          },
        },
        subtotal: entry.subtotal,
      },
    })
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            live: {
              tables: {
                A1: {
                  summary: 1,
                  pendingBatches: 0,
                  submittedBatches: 0,
                },
                B1: {
                  summary: 1,
                  pendingBatches: 0,
                  submittedBatches: 0,
                },
              },
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
                timerStartedAt: null,
                displaySeqBase: 5,
                customer: { name: '王小明', phone: '0900' },
                updatedAt: 2,
              },
              draft: {},
              pendingBatches: encodedPendingBatches,
              submittedBatches: {},
            },
            B1: {
              summary: {
                timerStartedAt: null,
                displaySeqBase: 6,
                customer: { name: '', phone: '' },
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
    const staffState = createState()
    const staffRepository = createRtdbV3Repository({ db: db as never, state: staffState, tables: ['A1', 'B1'] })

    await staffRepository.startStaffLive()
    db.emit('v3/meta/revisions/live/tables/A1/pendingBatches', 'value', 1)
    await flushMicrotasks()

    expect(staffState.pendingBatchPreviews.A1?.[0]).toMatchObject({
      batchId: expect.stringMatching(/^pending_/),
      requestLabel: '#5-1',
      entries: [expect.objectContaining({ title: '可樂' })],
    })
    expect(staffState.pendingBatches.A1?.[0]?.entries[0]?.entryId).toBe('entry_pending')
  })

  it('derives staff table status only from submitted shard data', async () => {
    const submitted = {
      batchId: 'submitted_1',
      source: 'staff' as const,
      status: 'accepted' as const,
      table: 'B1',
      customer: { name: '', phone: '' },
      createdAt: 2,
      updatedAt: 2,
      acceptedAt: 2,
      requestSeq: 1,
      requestLabel: '#6-1',
      entries: {},
      subtotal: 0,
    }
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            live: {
              tables: {
                A1: { summary: 1, pendingBatches: 1, submittedBatches: 1 },
                B1: { summary: 1, pendingBatches: 1, submittedBatches: 1 },
              },
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
                timerStartedAt: null,
                displaySeqBase: 5,
                customer: { name: '', phone: '' },
                updatedAt: 1,
              },
              pendingBatches: {
                ...encodeLiveTableShardValue('pendingBatches', {
                  pending_1: {
                    batchId: 'pending_1',
                    source: 'customer' as const,
                    status: 'pending' as const,
                    table: 'A1',
                    customer: { name: '', phone: '' },
                    createdAt: 1,
                    updatedAt: 1,
                    requestSeq: 1,
                    requestLabel: '#5-1',
                    entries: {},
                    subtotal: 0,
                  },
                }),
              },
              submittedBatches: {},
            },
            B1: {
              summary: {
                timerStartedAt: null,
                displaySeqBase: 6,
                customer: { name: '', phone: '' },
                updatedAt: 1,
              },
              pendingBatches: {},
              submittedBatches: {
                ...encodeLiveTableShardValue('submittedBatches', {
                  submitted_1: submitted,
                }),
              },
            },
          },
        },
      },
    })
    const staffState = createState()
    const staffRepository = createRtdbV3Repository({ db: db as never, state: staffState, tables: ['A1', 'B1'] })

    await staffRepository.startStaffLive()

    expect(staffState.tableStatuses.A1).toBeUndefined()
    expect(staffState.tableStatuses.B1).toBe('yellow')

    setAtPath(db.data, 'v3/live/tables/B1/submittedBatches', {})
    db.emit('v3/meta/revisions/live/tables/B1/submittedBatches', 'value', 2)
    await flushAsyncListeners()

    expect(staffState.tableStatuses.B1).toBeUndefined()
  })

  it('keeps staff selected table stable while another table receives a new pending batch', async () => {
    const a1Entry = createEntry({ entryId: 'entry_a1', itemName: '可樂', shortName: '可樂' })
    const encodedPendingBatches = encodeLiveTableShardValue('pendingBatches', {
      pending_1: {
        batchId: 'pending_1',
        source: 'customer',
        status: 'pending',
        table: 'A1',
        customer: { name: '王小明', phone: '0900' },
        createdAt: 2,
        updatedAt: 2,
        requestSeq: 1,
        requestLabel: '#5-1',
        entries: {
          [a1Entry.entryId]: {
            ...a1Entry,
            status: 'pending',
            lines: Object.fromEntries(a1Entry.lines.map((line) => [line.lineId, line])),
          },
        },
        subtotal: a1Entry.subtotal,
      },
    })
    const b1Submitted = {
      batchId: 'submitted_1',
      source: 'staff' as const,
      status: 'accepted' as const,
      table: 'B1',
      customer: { name: '', phone: '' },
      createdAt: 2,
      updatedAt: 2,
      acceptedAt: 2,
      requestSeq: 1,
      requestLabel: '#6-1',
      entries: {},
      subtotal: 0,
    }
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            live: {
              tables: {
                A1: { summary: 1, draft: 1, pendingBatches: 0, submittedBatches: 0 },
                B1: { summary: 1, draft: 1, pendingBatches: 0, submittedBatches: 1 },
              },
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
                timerStartedAt: null,
                displaySeqBase: 5,
                customer: { name: '王小明', phone: '0900' },
                updatedAt: 2,
              },
              draft: {},
              pendingBatches: encodedPendingBatches,
              submittedBatches: {},
            },
            B1: {
              summary: {
                timerStartedAt: null,
                displaySeqBase: 6,
                customer: { name: '', phone: '' },
                updatedAt: 1,
              },
              draft: {},
              pendingBatches: {},
              submittedBatches: {
                ...encodeLiveTableShardValue('submittedBatches', {
                  submitted_1: {
                    ...b1Submitted,
                    entries: {},
                  },
                }),
              },
            },
          },
        },
      },
    })
    const staffState = createState()
    const staffRepository = createRtdbV3Repository({ db: db as never, state: staffState, tables: ['A1', 'B1'] })

    await staffRepository.startStaffLive()
    await staffRepository.startTableLiveSession('staff', 'B1')
    db.emit('v3/meta/revisions/live/tables/A1/pendingBatches', 'value', 1)
    await flushMicrotasks()

    expect(staffState.selectedTable).toBe('B1')
    expect(staffState.activePendingBatches).toEqual([])
    expect(staffState.pendingBatchPreviews.A1?.[0]?.requestLabel).toBe('#5-1')
    expect(staffState.activeSubmittedBatches[0]?.batchId).toBe('submitted_1')
  })
})
