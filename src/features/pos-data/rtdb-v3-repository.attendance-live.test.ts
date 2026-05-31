import { describe, expect, it } from 'vitest'

import { encodeRtdbKeySegment } from './rtdb-v3-key-codec'
import { createRtdbV3Repository } from './rtdb-v3-repository'
import { createDbStub, createEntry, createState, readAtPath } from './rtdb-v3-repository.test-support'

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
              recordsByMonth: {
                '2026-04': 1,
                '2026-05': 1,
              },
            },
          },
        },
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

  it('avoids revision preflight reads for initial catalog and owner auth loads', async () => {
    const db = createDbStub({
      v3: {
        catalog: {
          inventory: { cola: true },
          prices: { cola: 100 },
          costs: { cola: 10 },
        },
        auth: {
          owners: {
            景偉: { passwordHash: 'h', passwordSalt: 's' },
          },
        },
      },
    })
    const repository = createRtdbV3Repository({
      db: db as never,
      state: createState(),
    })

    await repository.ensureCatalog()
    await repository.ensureOwnerAuth()

    expect(db.onceCalls).toEqual(['v3/catalog/inventory', 'v3/catalog/prices', 'v3/catalog/costs', 'v3/auth/owners'])
    expect(db.onceCalls.some((path) => path.startsWith('v3/meta/revisions/'))).toBe(false)
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
          tableSummaries: {},
          pendingSummaries: {},
        },
      },
    })
    const repository = createRtdbV3Repository({
      db: db as never,
      state: createState(),
    })

    await repository.startStaffLive()
    await repository.startStaffLive()

    expect(db.onceCalls.filter((path) => path === 'v3/live/tableSummaries')).toHaveLength(0)
    expect(db.onceCalls.filter((path) => path === 'v3/live/pendingSummaries')).toHaveLength(0)
    expect(
      db.onCalls.filter(
        ({ path, eventName }) =>
          (path === 'v3/live/tableSummaries' || path === 'v3/live/pendingSummaries') &&
          ['child_added', 'child_changed', 'child_removed'].includes(eventName)
      )
    ).toHaveLength(6)
  })

  it('seeds staff live preview batches from pending summary subscriptions', async () => {
    const db = createDbStub({
      v3: {
        catalog: {
          inventory: {},
          prices: {},
          costs: {},
        },
        live: {
          tableSummaries: {
            A1: {
              status: 'yellow',
              timerStartedAt: 1,
              displaySeqBase: 8,
              batchCount: 1,
              customer: { name: 'A', phone: '' },
              updatedAt: 1,
            },
          },
          pendingSummaries: {
            A1: {
              pendingCount: 1,
              firstBatch: {
                batchId: 'pending_1',
                requestSeq: 1,
                createdAt: 1,
                requestLabel: '#8-1',
                itemPreview: [{ title: '可樂', quantityLabel: '2 份' }],
              },
            },
          },
        },
      },
    })
    const state = createState()
    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.startStaffLive()

    expect(state.tableStatuses.A1).toBe('yellow')
    expect(state.pendingBatchPreviews.A1?.[0]?.batchId).toBe('pending_1')
    expect(state.pendingBatchPreviews.A1?.[0]?.requestSeq).toBe(1)
    expect(state.pendingBatchPreviews.A1?.[0]?.entries[0]?.title).toBe('可樂')
    expect(state.pendingBatchPreviews.A1?.[0]?.entries[0]?.quantityLabel).toBe('2 份')
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

    expect(db.onceCalls).toContain('v3/live/tables/A1/pendingBatches/pending_1')
    expect(batch).toMatchObject({
      batchId: 'pending_1',
      requestSeq: 1,
      requestLabel: '#8-1',
      subtotal: 220,
      entries: [expect.objectContaining({ entryId: 'entry_pending', itemName: '鱸魚' })],
    })
  })
})
