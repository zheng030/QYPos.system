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
  setAtPath,
} from './rtdb-v3-repository.test-support'
import { encodeLiveTableShardValue } from './rtdb-v3-storage-codecs'
import type { V3OrderLine } from './rtdb-v3-types'

async function flushAsyncListeners() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

describe('rtdb-v3-repository', () => {
  it('deletes attendance record from its original month bucket', async () => {
    const db = createDbStub({
      v3: {
        attendance: {
          employees: {},
          recordsByMonth: {
            '2026-04': {
              rec_1: {
                id: 'rec_1',
                eid: 'emp_1',
                type: 'CLOCK_IN',
                ts: new Date('2026-04-30T06:00:00+08:00').getTime(),
              },
            },
          },
        },
      },
    })
    const state = createState()
    const repository = createRtdbV3Repository({
      db: db as never,
      state,
    })

    await repository.ensureAttendanceWindow(['2026-04'])
    await repository.saveAttendanceUpdates({ 'attendanceRecords/rec_1': null })

    expect(readAtPath(db.data, 'v3/attendance/recordsByMonth/2026-04/rec_1')).toBeUndefined()
    expect(state.attendanceRecords.rec_1).toBeUndefined()
  })

  it('moves edited attendance record across month buckets', async () => {
    const originalTs = new Date('2026-04-30T06:00:00+08:00').getTime()
    const movedTs = new Date('2026-05-01T06:00:00+08:00').getTime()
    const db = createDbStub({
      v3: {
        attendance: {
          employees: {},
          recordsByMonth: {
            '2026-04': {
              rec_1: { id: 'rec_1', eid: 'emp_1', type: 'CLOCK_IN', ts: originalTs },
            },
            '2026-05': {},
          },
        },
      },
    })
    const state = createState()
    const repository = createRtdbV3Repository({
      db: db as never,
      state,
    })

    await repository.ensureAttendanceWindow(['2026-04', '2026-05'])
    await repository.saveAttendanceUpdates({
      'attendanceRecords/rec_1': { id: 'rec_1', eid: 'emp_1', type: 'CLOCK_OUT', ts: movedTs },
    })

    expect(readAtPath(db.data, 'v3/attendance/recordsByMonth/2026-04/rec_1')).toBeUndefined()
    expect(readAtPath(db.data, 'v3/attendance/recordsByMonth/2026-05/rec_1')).toEqual({
      id: 'rec_1',
      eid: 'emp_1',
      type: 'CLOCK_OUT',
      ts: movedTs,
    })
    expect(state.attendanceRecords.rec_1).toEqual({
      id: 'rec_1',
      eid: 'emp_1',
      type: 'CLOCK_OUT',
      ts: movedTs,
    })
  })

  it('keeps attendance state scoped to the active window until full history is requested', async () => {
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            attendance: {
              monthIndex: 1,
              recordsByMonth: {
                '2026-04': 1,
                '2026-05': 1,
              },
            },
          },
        },
        attendance: {
          employees: {},
          monthIndex: {
            '2026-04': true,
            '2026-05': true,
          },
          recordsByMonth: {
            '2026-04': {
              rec_1: {
                id: 'rec_1',
                eid: 'emp_1',
                type: 'CLOCK_IN',
                ts: new Date('2026-04-30T06:00:00+08:00').getTime(),
              },
            },
            '2026-05': {
              rec_2: {
                id: 'rec_2',
                eid: 'emp_1',
                type: 'CLOCK_OUT',
                ts: new Date('2026-05-01T06:00:00+08:00').getTime(),
              },
            },
          },
        },
      },
    })
    const state = createState()
    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.ensureAttendanceWindow(['2026-04'])
    expect(Object.keys(state.attendanceRecords)).toEqual(['rec_1'])

    await repository.ensureAttendanceWindow(['2026-05'])
    expect(Object.keys(state.attendanceRecords)).toEqual(['rec_2'])

    await repository.ensureAttendanceFullHistory()
    expect(Object.keys(state.attendanceRecords).sort()).toEqual(['rec_1', 'rec_2'])
  })

  it('keeps attendance window reads under full-history baseline', async () => {
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            attendance: {
              employees: 1,
              recordsByMonth: {
                '2026-04': 1,
                '2026-05': 1,
              },
            },
          },
        },
        attendance: {
          employees: {
            emp_1: { id: 'emp_1', name: 'A' },
          },
          recordsByMonth: {
            '2026-04': {
              rec_1: {
                id: 'rec_1',
                eid: 'emp_1',
                type: 'CLOCK_IN',
                ts: new Date('2026-04-30T06:00:00+08:00').getTime(),
              },
            },
            '2026-05': {
              rec_2: {
                id: 'rec_2',
                eid: 'emp_1',
                type: 'CLOCK_OUT',
                ts: new Date('2026-05-01T06:00:00+08:00').getTime(),
              },
            },
          },
        },
      },
    })
    const repository = createRtdbV3Repository({ db: db as never, state: createState() })

    await repository.ensureAttendanceWindow(['2026-04'])

    const actualReadSize = db.readEvents
      .filter((event) => event.phase === 'once' && event.path.startsWith('v3/attendance/'))
      .reduce((sum, event) => sum + event.payloadSize, 0)
    const fullHistoryBaseline =
      measurePayloadSize(readAtPath(db.data, 'v3/attendance/employees')) +
      measurePayloadSize(readAtPath(db.data, 'v3/attendance/recordsByMonth'))

    expect(actualReadSize).toBeLessThan(fullHistoryBaseline)
  })

  it('reuses warm cache for attendance employees and active month when revisions stay unchanged', async () => {
    const cacheStore = createMemoryPersistentCacheStore()
    const initialDb = createDbStub({
      v3: {
        meta: {
          revisions: {
            attendance: {
              employees: 1,
              recordsByMonth: {
                '2026-04': 1,
              },
            },
          },
        },
        attendance: {
          employees: {
            emp_1: { id: 'emp_1', name: 'A' },
          },
          recordsByMonth: {
            '2026-04': {
              rec_1: {
                id: 'rec_1',
                eid: 'emp_1',
                type: 'CLOCK_IN',
                ts: new Date('2026-04-30T06:00:00+08:00').getTime(),
              },
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

    await initialRepository.ensureAttendanceWindow(['2026-04'])

    const warmDb = createDbStub({
      v3: {
        meta: {
          revisions: {
            attendance: {
              employees: 1,
              recordsByMonth: {
                '2026-04': 1,
              },
            },
          },
        },
        attendance: {
          employees: {
            emp_1: { id: 'emp_1', name: 'Changed' },
          },
          recordsByMonth: {
            '2026-04': {},
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

    await warmRepository.ensureAttendanceWindow(['2026-04'])

    expect(state.attendanceEmployees.emp_1?.name).toBe('A')
    expect(Object.keys(state.attendanceRecords)).toEqual(['rec_1'])
    expect([...warmDb.onceCalls].sort()).toEqual(
      ['v3/meta/revisions/attendance/employees', 'v3/meta/revisions/attendance/recordsByMonth/2026-04'].sort()
    )
  })

  it('refetches only changed attendance month after revision invalidation with warm cache', async () => {
    const cacheStore = createMemoryPersistentCacheStore()
    const initialDb = createDbStub({
      v3: {
        meta: {
          revisions: {
            attendance: {
              employees: 1,
              recordsByMonth: {
                '2026-04': 1,
                '2026-05': 1,
              },
            },
          },
        },
        attendance: {
          employees: {
            emp_1: { id: 'emp_1', name: 'A' },
          },
          recordsByMonth: {
            '2026-04': {
              rec_1: {
                id: 'rec_1',
                eid: 'emp_1',
                type: 'CLOCK_IN',
                ts: new Date('2026-04-30T06:00:00+08:00').getTime(),
              },
            },
            '2026-05': {
              rec_2: {
                id: 'rec_2',
                eid: 'emp_1',
                type: 'CLOCK_OUT',
                ts: new Date('2026-05-01T06:00:00+08:00').getTime(),
              },
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
    await initialRepository.ensureAttendanceWindow(['2026-04', '2026-05'])

    const warmDb = createDbStub({
      v3: {
        meta: {
          revisions: {
            attendance: {
              employees: 1,
              recordsByMonth: {
                '2026-04': 1,
                '2026-05': 1,
              },
            },
          },
        },
        attendance: {
          employees: {
            emp_1: { id: 'emp_1', name: 'A' },
          },
          recordsByMonth: {
            '2026-04': {
              rec_1: {
                id: 'rec_1',
                eid: 'emp_1',
                type: 'CLOCK_IN',
                ts: new Date('2026-04-30T06:00:00+08:00').getTime(),
              },
            },
            '2026-05': {
              rec_2: {
                id: 'rec_2',
                eid: 'emp_1',
                type: 'CLOCK_OUT',
                ts: new Date('2026-05-01T06:00:00+08:00').getTime(),
              },
            },
          },
        },
      },
    })
    const state = createState()
    const repository = createRtdbV3Repository({
      db: warmDb as never,
      state,
      cacheStore,
    })

    await repository.ensureAttendanceWindow(['2026-04', '2026-05'])
    let resolveInvalidation: (() => void) | null = null
    const invalidated = new Promise<void>((resolve) => {
      resolveInvalidation = resolve
    })
    const stop = repository.watchAttendanceWindow(['2026-04', '2026-05'], () => {
      resolveInvalidation?.()
    })
    warmDb.onceCalls.length = 0

    setAtPath(warmDb.data, 'v3/attendance/recordsByMonth/2026-05/rec_3', {
      id: 'rec_3',
      eid: 'emp_1',
      type: 'CLOCK_IN',
      ts: new Date('2026-05-02T06:00:00+08:00').getTime(),
    })
    warmDb.emit('v3/meta/revisions/attendance/recordsByMonth/2026-05', 'value', 2)
    await invalidated

    expect(warmDb.onceCalls).toEqual(['v3/attendance/recordsByMonth/2026-05'])
    expect(Object.keys(state.attendanceRecords).sort()).toEqual(['rec_1', 'rec_2', 'rec_3'])
    stop()
  })

  it('refetches attendance employees when employee revision changes', async () => {
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            attendance: {
              employees: 1,
              recordsByMonth: {
                '2026-04': 1,
              },
            },
          },
        },
        attendance: {
          employees: {
            emp_1: { id: 'emp_1', name: 'A' },
          },
          recordsByMonth: {
            '2026-04': {
              rec_1: {
                id: 'rec_1',
                eid: 'emp_1',
                type: 'CLOCK_IN',
                ts: new Date('2026-04-30T06:00:00+08:00').getTime(),
              },
            },
          },
        },
      },
    })
    const state = createState()
    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.ensureAttendanceWindow(['2026-04'])
    let resolveInvalidation: (() => void) | null = null
    const invalidated = new Promise<void>((resolve) => {
      resolveInvalidation = resolve
    })
    const stop = repository.watchAttendanceWindow(['2026-04'], (event) => {
      if (event.employeesChanged) {
        resolveInvalidation?.()
      }
    })
    db.onceCalls.length = 0

    setAtPath(db.data, 'v3/attendance/employees/emp_2', { id: 'emp_2', name: 'B' })
    db.emit('v3/meta/revisions/attendance/employees', 'value', 2)
    await invalidated

    expect(db.onceCalls).toEqual(['v3/attendance/employees'])
    expect(state.attendanceEmployees.emp_2?.name).toBe('B')
    stop()
  })

  it('uses revision preflight on initial catalog loads, then reuses warm cache', async () => {
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            catalog: {
              inventory: 1,
              prices: 1,
              costs: 1,
            },
          },
        },
        catalog: {
          inventory: { cola: true },
          prices: { cola: 100 },
          costs: { cola: 10 },
        },
      },
    })
    const cacheStore = createMemoryPersistentCacheStore()
    const repository = createRtdbV3Repository({
      db: db as never,
      state: createState(),
      cacheStore,
    })

    await repository.ensureCatalog()

    expect([...db.onceCalls].sort()).toEqual(
      [
        'v3/meta/revisions/catalog/inventory',
        'v3/meta/revisions/catalog/costs',
        'v3/meta/revisions/catalog/prices',
        'v3/catalog/costs',
        'v3/catalog/inventory',
        'v3/catalog/prices',
      ].sort()
    )

    const warmDb = createDbStub({
      v3: {
        meta: {
          revisions: {
            catalog: {
              inventory: 1,
              prices: 1,
              costs: 1,
            },
          },
        },
        catalog: {
          inventory: { cola: false },
          prices: { cola: 999 },
          costs: { cola: 999 },
        },
      },
    })
    const warmRepository = createRtdbV3Repository({
      db: warmDb as never,
      state: createState(),
      cacheStore,
    })

    await warmRepository.ensureCatalog()

    expect([...warmDb.onceCalls].sort()).toEqual(
      [
        'v3/meta/revisions/catalog/inventory',
        'v3/meta/revisions/catalog/costs',
        'v3/meta/revisions/catalog/prices',
      ].sort()
    )
  })

  it('refetches changed catalog segment after revision invalidation even with warm cache', async () => {
    const cacheStore = createMemoryPersistentCacheStore()
    const initialDb = createDbStub({
      v3: {
        meta: {
          revisions: {
            catalog: {
              inventory: 1,
              prices: 1,
              costs: 1,
            },
          },
        },
        catalog: {
          inventory: { cola: true },
          prices: {},
          costs: {},
        },
      },
    })
    const initialRepository = createRtdbV3Repository({
      db: initialDb as never,
      state: createState(),
      cacheStore,
    })
    await initialRepository.ensureCatalog()

    const warmDb = createDbStub({
      v3: {
        meta: {
          revisions: {
            catalog: {
              inventory: 1,
              prices: 1,
              costs: 1,
            },
          },
        },
        catalog: {
          inventory: { cola: false },
          prices: {},
          costs: {},
        },
      },
    })
    const repository = createRtdbV3Repository({
      db: warmDb as never,
      state: createState(),
      cacheStore,
    })

    await repository.ensureCatalog()
    const stop = repository.watchCatalogRevision(() => {})
    warmDb.onceCalls.length = 0

    warmDb.emit('v3/meta/revisions/catalog/inventory', 'value', 2)
    await flushAsyncListeners()

    expect(warmDb.onceCalls).toContain('v3/catalog/inventory')
    stop()
  })

  it('does not duplicate staff live subscriptions on repeated start', async () => {
    const db = createDbStub({
      v3: {
        catalog: {
          inventory: {},
          prices: {},
          costs: {},
        },
        live: {
          tables: {},
        },
      },
    })
    const repository = createRtdbV3Repository({
      db: db as never,
      state: createState(),
      tables: ['A1', 'A2'],
    })

    await repository.startStaffLive()
    await repository.startStaffLive()

    expect(db.onceCalls.filter((path) => path === 'v3/live/tableSummaries')).toHaveLength(0)
    expect(db.onceCalls.filter((path) => path === 'v3/live/tables/A1/pendingBatches')).toHaveLength(1)
    expect(
      db.onCalls.filter(
        ({ path, eventName }) =>
          path.startsWith('v3/meta/revisions/live/tables/') &&
          (path.endsWith('/pendingBatches') || path.endsWith('/summary')) &&
          eventName === 'value'
      )
    ).toHaveLength(4)
  })

  it('seeds staff live preview batches from canonical pending shard subscriptions', async () => {
    const previewEntry = createEntry({ entryId: 'entry_1', shortName: '可樂', itemName: '可樂' })
    const encodedPendingBatches = encodeLiveTableShardValue('pendingBatches', {
      pending_1: {
        batchId: 'pending_1',
        source: 'customer',
        status: 'pending',
        table: 'A1',
        customer: { name: 'A', phone: '' },
        updatedAt: 1,
        requestSeq: 1,
        createdAt: 1,
        requestLabel: '#8-1',
        entries: {
          entry_1: {
            ...previewEntry,
            summary: {
              title: '可樂',
              subtitle: '',
              quantityLabel: '2 份',
              totalLabel: '$100',
            },
            quantity: 2,
            lines: {
              entry_1_main: {
                ...previewEntry.lines[0],
                lineId: 'entry_1_main',
                shortName: '可樂',
                displayName: '可樂',
                sourceEntryId: 'entry_1',
                quantity: 2,
              } satisfies V3OrderLine,
            },
          },
        },
        subtotal: 100,
      },
    })
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            live: {
              tables: {
                A1: {
                  pendingBatches: 1,
                },
              },
            },
          },
        },
        catalog: {
          inventory: {},
          prices: {},
          costs: {},
        },
        live: {
          tables: {
            A1: {
              summary: {
                timerStartedAt: 1,
                displaySeqBase: 8,
                customer: { name: 'A', phone: '' },
                updatedAt: 1,
              },
              pendingBatches: encodedPendingBatches,
            },
          },
        },
      },
    })
    const state = createState()
    const repository = createRtdbV3Repository({ db: db as never, state, tables: ['A1'] })

    await repository.startStaffLive()

    expect(state.tableStatuses.A1).toBeUndefined()
    expect(state.pendingBatchPreviews.A1?.[0]?.batchId).toBe('pending_1')
    expect(state.pendingBatchPreviews.A1?.[0]?.requestSeq).toBe(1)
    expect(state.pendingBatchPreviews.A1?.[0]?.entries[0]?.title).toBe('可樂')
    expect(state.pendingBatchPreviews.A1?.[0]?.entries[0]?.quantityLabel).toBe('2 份')
  })

  it('keeps local split counter when staff summary mirror update omits counter fields', async () => {
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            live: {
              tables: {
                A1: {
                  summary: 1,
                },
              },
            },
          },
        },
        catalog: {
          inventory: {},
          prices: {},
          costs: {},
        },
        live: {
          tables: {
            A1: {
              summary: {
                status: 'yellow',
                timerStartedAt: 1,
                displaySeqBase: 8,
                batchCount: 1,
                customer: { name: 'A', phone: '' },
                updatedAt: 1,
              },
            },
          },
        },
      },
    })
    const state = createState()
    state.tableSplitCounters.A1 = 7
    const repository = createRtdbV3Repository({ db: db as never, state, tables: ['A1'] })

    await repository.startStaffLive()
    db.emit('v3/meta/revisions/live/tables/A1/summary', 'value', 2)

    expect(state.tableSplitCounters.A1).toBe(7)
  })

  it('reads a single pending batch detail from the live table path only', async () => {
    const entry = createEntry({ entryId: 'entry_pending', subtotal: 220, itemName: '鱸魚', shortName: '鱸魚' })
    const db = createDbStub({
      v3: {
        live: {
          tables: {
            A1: {
              pendingBatches: {
                pending_1: {
                  batchId: 'pending_1',
                  source: 'customer',
                  status: 'pending',
                  table: 'A1',
                  customer: { name: '', phone: '' },
                  createdAt: 5,
                  updatedAt: 5,
                  requestLabel: '#8-1',
                  entries: {
                    [encodeRtdbKeySegment(entry.entryId)]: {
                      ...entry,
                      lines: Object.fromEntries(entry.lines.map((line) => [encodeRtdbKeySegment(line.lineId), line])),
                    },
                  },
                  subtotal: 220,
                },
              },
            },
          },
        },
      },
    })
    const repository = createRtdbV3Repository({ db: db as never, state: createState() })

    const batch = await repository.readPendingBatchDetail('A1', 'pending_1')

    expect(db.onceCalls).toContain('v3/live/tables/A1/pendingBatches')
    expect(db.onceCalls).not.toContain('v3/live/tables/A1/pendingBatches/pending_1')
    expect(batch).toMatchObject({
      batchId: 'pending_1',
      requestSeq: 1,
      requestLabel: '#8-1',
      subtotal: 220,
      entries: [expect.objectContaining({ entryId: 'entry_pending', itemName: '鱸魚' })],
    })
  })
})
