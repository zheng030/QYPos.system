import { describe, expect, it } from 'vitest'

import type { CorePosState } from '@/features/pos-kernel/types'
import { DEFAULT_FLAVOR_SELECTION } from '@/shared/flavor'
import { createRtdbV3Repository } from './rtdb-v3-repository'

type EventName = 'value' | 'child_added' | 'child_changed' | 'child_removed'

type Listener = (snapshot: { val(): unknown; key(): string | null }) => void

function createState(): CorePosState {
  return {
    tableTimers: {},
    tableCarts: {},
    tableStatuses: {},
    tableCustomers: {},
    tableSplitCounters: {},
    itemCosts: {},
    itemPrices: {},
    inventory: {},
    attendanceEmployees: {},
    attendanceRecords: {},
    ownerPasswords: {},
    incomingOrders: {},
    tableBatchCounts: {},
    selectedTable: null,
    cart: [],
    sentItems: [],
    seatTimerInterval: null,
    tempCustomItem: null,
    isExtraShot: false,
    tempLeftList: [],
    tempRightList: [],
    currentOriginalTotal: 0,
    finalTotal: 0,
    currentDiscount: { type: 'none', value: 0 },
    discountedTotal: 0,
    isServiceFeeEnabled: false,
    isQrMode: false,
    currentIncomingTable: null,
    entryCartSignature: '[]',
    isCartSimpleMode: false,
    isHistorySimpleMode: false,
    currentCategory: null,
    currentFlavorSelection: { ...DEFAULT_FLAVOR_SELECTION },
    reprintItemsForModal: null,
    syncLog: [],
  }
}

function normalizePath(path: string) {
  return path.replace(/^\/+/, '').replace(/\/+$/, '')
}

function createSnapshot(path: string, value: unknown) {
  const key = normalizePath(path).split('/').pop() || null
  return {
    val() {
      return value
    },
    key() {
      return key
    },
  }
}

function createChildSnapshot(childKey: string, value: unknown) {
  return {
    val() {
      return value
    },
    key() {
      return childKey
    },
  }
}

function readAtPath(tree: Record<string, unknown>, path: string) {
  const normalized = normalizePath(path)
  if (!normalized) return tree
  return normalized.split('/').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[segment]
  }, tree)
}

function isServerIncrement(value: unknown): value is { '.sv': { increment: number } } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      '.sv' in value &&
      typeof (value as { '.sv'?: { increment?: unknown } })['.sv']?.increment === 'number'
  )
}

function setAtPath(tree: Record<string, unknown>, path: string, value: unknown) {
  const normalized = normalizePath(path)
  if (!normalized) {
    throw new Error('Root writes are not supported in test stub')
  }
  const segments = normalized.split('/')
  let current: Record<string, unknown> = tree
  for (const segment of segments.slice(0, -1)) {
    const next = current[segment]
    if (!next || typeof next !== 'object') {
      current[segment] = {}
    }
    current = current[segment] as Record<string, unknown>
  }
  const leaf = segments.at(-1) || ''
  if (value === null) {
    delete current[leaf]
    return
  }
  if (isServerIncrement(value)) {
    current[leaf] = Number(current[leaf] || 0) + value['.sv'].increment
    return
  }
  current[leaf] = value
}

function createDbStub(initialData: Record<string, unknown>) {
  const data = structuredClone(initialData)
  const onceCalls: string[] = []
  const onCalls: Array<{ path: string; eventName: EventName }> = []
  const listeners = new Map<string, Map<EventName, Set<Listener>>>()

  function emit(path: string, eventName: EventName, value: unknown, childKey?: string) {
    const normalized = normalizePath(path)
    listeners
      .get(normalized)
      ?.get(eventName)
      ?.forEach((listener) => {
        listener(childKey ? createChildSnapshot(childKey, value) : createSnapshot(normalized, value))
      })
  }

  return {
    onceCalls,
    onCalls,
    emit,
    data,
    ref(path = '/') {
      const normalized = normalizePath(path)
      return {
        async once(eventName: 'value') {
          if (eventName !== 'value') throw new Error(`Unsupported event: ${eventName}`)
          onceCalls.push(normalized)
          return createSnapshot(normalized, readAtPath(data, normalized))
        },
        on(eventName: EventName, listener: Listener) {
          onCalls.push({ path: normalized, eventName })
          const byEvent = listeners.get(normalized) || new Map<EventName, Set<Listener>>()
          const bucket = byEvent.get(eventName) || new Set<Listener>()
          bucket.add(listener)
          byEvent.set(eventName, bucket)
          listeners.set(normalized, byEvent)

          if (eventName === 'value') {
            listener(createSnapshot(normalized, readAtPath(data, normalized)))
          }
          if (eventName === 'child_added') {
            const current = readAtPath(data, normalized)
            if (current && typeof current === 'object') {
              Object.entries(current as Record<string, unknown>).forEach(([childKey, value]) => {
                listener(createChildSnapshot(childKey, value))
              })
            }
          }

          return () => {
            bucket.delete(listener)
          }
        },
        async update(payload: Record<string, unknown>) {
          for (const [key, value] of Object.entries(payload)) {
            setAtPath(data, key, value)
          }
        },
        async transaction<T>(updater: (currentValue: T | null) => T) {
          const current = readAtPath(data, normalized) as T | null
          const next = updater(current ?? null)
          setAtPath(data, normalized, next)
          return {
            committed: true,
            snapshot: createSnapshot(normalized, next),
          }
        },
      }
    },
  }
}

describe('rtdb-v3-repository', () => {
  it('reads single-day history and item stats from child paths only', async () => {
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
                  items: {},
                },
              },
            },
          },
        },
        reports: {
          dailyByMonth: {
            '2026-05': {
              '2026-05-30': {
                orderCount: 1,
                paidTotal: 100,
                originalTotal: 100,
                itemQtyTotal: 0,
                barRevenue: 0,
                bbqRevenue: 0,
                unknownRevenue: 0,
                extraRevenue: 100,
                barCost: 0,
                bbqCost: 0,
                unknownCost: 0,
                updatedAt: 1,
              },
            },
          },
          itemStatsByMonth: {
            '2026-05': {
              '2026-05-30': {
                cola: {
                  displayName: '可樂',
                  type: 'bar',
                  qty: 1,
                  treatQty: 0,
                  revenue: 100,
                  cost: 10,
                  updatedAt: 1,
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

  it('writes only day-level revisions when checkout closes an order', async () => {
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
                displaySeqBase: 5,
                splitCounter: 1,
                batchCount: 0,
                customer: { name: 'A', phone: '' },
                updatedAt: 1,
              },
              cart: {},
              incomingOrders: {},
            },
          },
          tableSummaries: {
            A1: {
              status: 'yellow',
              timerStartedAt: 1,
              displaySeqBase: 5,
              splitCounter: 1,
              batchCount: 0,
              customer: { name: 'A', phone: '' },
              updatedAt: 1,
            },
          },
          pendingSummaries: {},
        },
        reports: {
          dailyByMonth: {},
          itemStatsByMonth: {},
        },
      },
    })
    const state = createState()
    state.tableCustomers.A1 = { name: 'A', phone: '', orderId: 5 }
    const colaKey = '可樂'
    state.itemCosts[colaKey] = 10
    const repository = createRtdbV3Repository({
      db: db as never,
      state,
    })

    await repository.checkoutTable({
      table: 'A1',
      cart: [{ name: '可樂', price: 100, type: 'bar' }],
      customer: state.tableCustomers.A1,
      paidTotal: 100,
      originalTotal: 100,
      splitCounter: 1,
    })

    expect(readAtPath(db.data, 'v3/meta/revisions/history/ordersByDay')).toBeTruthy()
    expect(readAtPath(db.data, 'v3/meta/revisions/reports/dailyByDay')).toBeTruthy()
    expect(readAtPath(db.data, 'v3/meta/revisions/reports/itemStatsByDay')).toBeTruthy()
    expect(readAtPath(db.data, 'v3/meta/revisions/history/ordersByMonth')).toBeUndefined()
    expect(readAtPath(db.data, 'v3/meta/revisions/reports/dailyByMonth')).toBeUndefined()
    expect(readAtPath(db.data, 'v3/meta/revisions/reports/itemStatsByMonth')).toBeUndefined()
  })

  it('aggregates duplicate item stat keys before writing checkout report increments', async () => {
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
                displaySeqBase: 7,
                splitCounter: 1,
                batchCount: 0,
                customer: { name: '', phone: '' },
                updatedAt: 1,
              },
              cart: {},
              incomingOrders: {},
            },
          },
          tableSummaries: {},
          pendingSummaries: {},
        },
        reports: {
          dailyByMonth: {},
          itemStatsByMonth: {},
        },
      },
    })
    const state = createState()
    state.tableCustomers.A1 = { name: '', phone: '', orderId: 7 }
    const wingKey = '雞翅'
    state.itemCosts[wingKey] = 20
    const repository = createRtdbV3Repository({ db: db as never, state })

    const order = await repository.checkoutTable({
      table: 'A1',
      cart: [
        { name: '雞翅', price: 100, type: 'bbq' },
        { name: '雞翅', price: 100, type: 'bbq', isTreat: true },
        { name: '雞翅', price: 120, type: 'bbq' },
      ],
      customer: state.tableCustomers.A1,
      paidTotal: 220,
      originalTotal: 320,
      splitCounter: 1,
    })

    const bizDate = String(order.bizDateKey)
    const monthKey = String(order.monthKey)
    expect(readAtPath(db.data, `v3/reports/itemStatsByMonth/${monthKey}/${bizDate}/雞翅/qty`)).toBe(3)
    expect(readAtPath(db.data, `v3/reports/itemStatsByMonth/${monthKey}/${bizDate}/雞翅/treatQty`)).toBe(1)
    expect(readAtPath(db.data, `v3/reports/itemStatsByMonth/${monthKey}/${bizDate}/雞翅/revenue`)).toBe(220)
    expect(readAtPath(db.data, `v3/reports/itemStatsByMonth/${monthKey}/${bizDate}/雞翅/cost`)).toBe(60)
  })

  it('reuses caller-local orderId without reserving a new display sequence', async () => {
    const db = createDbStub({
      v3: {
        meta: {
          revisions: {
            history: { ordersByDay: {} },
          },
        },
        history: {
          sequenceByDate: {},
        },
        live: {
          tables: {},
          tableSummaries: {},
          pendingSummaries: {},
        },
      },
    })
    const state = createState()
    state.tableCustomers.A1 = { name: 'A', phone: '', orderId: 99 }

    const repository = createRtdbV3Repository({
      db: db as never,
      state,
    })

    const result = await repository.saveTableDraft('A1', [{ name: '可樂', price: 100 }], state.tableCustomers.A1)

    expect(result.displaySeqBase).toBe(99)
    expect(state.tableCustomers.A1?.orderId).toBe(99)
    const sequenceByDate = readAtPath(db.data, 'v3/history/sequenceByDate') as Record<
      string,
      { nextDisplaySeq: number } | undefined
    >
    const entries = Object.entries(sequenceByDate || {})
    expect(entries).toHaveLength(0)
    expect(db.onceCalls).not.toContain('v3/live/tableSummaries/A1')
  })

  it('preserves pending queue when saving table draft', async () => {
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
                splitCounter: 1,
                batchCount: 2,
                customer: { name: 'A', phone: '' },
                updatedAt: 1,
              },
              cart: {},
              incomingOrders: {
                req_1: {
                  requestId: 'req_1',
                  createdAt: 1,
                  batchId: 2,
                  customer: { name: '', phone: '' },
                  items: {
                    line_1: {
                      position: 0,
                      displayName: '可樂',
                      catalogKey: '可樂',
                      type: 'bar',
                      unitPrice: 100,
                      isTreat: false,
                    },
                  },
                },
              },
            },
          },
          tableSummaries: {},
          pendingSummaries: {},
        },
      },
    })
    const state = createState()
    state.tableCustomers.A1 = { name: 'A', phone: '', orderId: 9 }
    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.saveTableDraft('A1', [{ name: '雪碧', price: 120, type: 'bar' }], state.tableCustomers.A1)

    expect(readAtPath(db.data, 'v3/live/tables/A1/incomingOrders/req_1')).toBeTruthy()
    expect(readAtPath(db.data, 'v3/live/pendingSummaries/A1/pendingCount')).toBe(1)
    expect(readAtPath(db.data, 'v3/live/pendingSummaries/A1/firstOrder/requestId')).toBe('req_1')
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
      items: {
        item_1: {
          position: 0,
          displayName: '可樂',
          catalogKey: '可樂',
          type: 'bar',
          qty: 1,
          unitPrice: 100,
          unitCost: 10,
          lineTotal: 100,
          isTreat: false,
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
      items: {
        item_1: {
          position: 0,
          displayName: '雪碧',
          catalogKey: '雪碧',
          type: 'bar',
          qty: 2,
          unitPrice: 100,
          unitCost: 20,
          lineTotal: 200,
          isTreat: false,
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
      items: [],
      total: 100,
    })

    expect(db.onceCalls.filter((path) => path === 'v3/history/ordersByMonth/2026-05/2026-05-30')).toHaveLength(2)
    expect(readAtPath(db.data, 'v3/reports/dailyByMonth/2026-05/2026-05-30/paidTotal')).toBe(200)
    expect(readAtPath(db.data, 'v3/reports/itemStatsByMonth/2026-05/2026-05-30/雪碧/qty')).toBe(2)
    expect(readAtPath(db.data, 'v3/reports/itemStatsByMonth/2026-05/2026-05-30/可樂')).toBeUndefined()
  })

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

  it('seeds staff live from child index subscriptions without authority table reads', async () => {
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
              splitCounter: 1,
              batchCount: 1,
              customer: { name: 'A', phone: '' },
              updatedAt: 1,
            },
            B2: {
              status: null,
              timerStartedAt: null,
              displaySeqBase: null,
              splitCounter: 1,
              batchCount: 2,
              customer: { name: '', phone: '' },
              updatedAt: 2,
            },
          },
          pendingSummaries: {
            A1: {
              pendingCount: 2,
              firstOrder: {
                requestId: 'req_1',
                createdAt: 1,
                batchId: 1,
                customer: { name: '', phone: '' },
                previewItems: {
                  item_1: {
                    position: 0,
                    displayName: '可樂',
                    unitPrice: 100,
                  },
                },
              },
            },
          },
        },
      },
    })
    const state = createState()
    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.startStaffLive()

    expect(db.onceCalls).not.toContain('v3/live/tableSummaries')
    expect(db.onceCalls).not.toContain('v3/live/pendingSummaries')
    expect(db.onceCalls).not.toContain('v3/live/tables')
    expect(state.tableStatuses.A1).toBe('yellow')
    expect(Array.isArray(state.incomingOrders.A1)).toBe(true)
    expect((state.incomingOrders.A1 as Array<{ requestId?: string }>)[0]?.requestId).toBe('req_1')
  })

  it('updates pending preview queue when pending summary changes', async () => {
    const db = createDbStub({
      v3: {
        catalog: {
          inventory: {},
          prices: {},
          costs: {},
        },
        live: {
          tableSummaries: {},
          pendingSummaries: {
            A1: {
              pendingCount: 1,
              firstOrder: {
                requestId: 'req_1',
                createdAt: 1,
                batchId: 1,
                customer: { name: '', phone: '' },
                previewItems: {
                  item_1: {
                    position: 0,
                    displayName: '可樂',
                    unitPrice: 100,
                  },
                },
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

    await repository.startStaffLive()
    db.emit(
      'v3/live/pendingSummaries',
      'child_changed',
      {
        pendingCount: 2,
        firstOrder: {
          requestId: 'req_2',
          createdAt: 2,
          batchId: 2,
          customer: { name: '', phone: '' },
          previewItems: {
            item_1: {
              position: 0,
              displayName: '雪碧',
              unitPrice: 120,
            },
          },
        },
      },
      'A1'
    )

    expect(Array.isArray(state.incomingOrders.A1)).toBe(true)
    expect((state.incomingOrders.A1 as Array<{ requestId?: string }>).some((item) => item.requestId === 'req_2')).toBe(
      true
    )
  })

  it('removes accepted incoming request from local queue immediately', async () => {
    const db = createDbStub({
      v3: {
        live: {
          tables: {
            A1: {
              summary: null,
              cart: {},
              incomingOrders: {
                req_1: {
                  requestId: 'req_1',
                  createdAt: 1,
                  batchId: 1,
                  customer: { name: '', phone: '' },
                  items: {
                    line_1: {
                      position: 0,
                      displayName: '可樂',
                      catalogKey: '可樂',
                      type: 'bar',
                      unitPrice: 100,
                      isTreat: false,
                    },
                  },
                },
              },
            },
          },
          tableSummaries: {},
        },
      },
    })
    const state = createState()
    state.incomingOrders.A1 = [{ requestId: 'req_1', items: [{ name: '可樂', price: 100 }] }]
    const repository = createRtdbV3Repository({ db: db as never, state })

    await repository.acceptIncomingOrder('A1', 'req_1')

    expect(state.incomingOrders.A1).toBeUndefined()
  })

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
              '2026-05-30': {
                orderCount: 1,
                paidTotal: 100,
                originalTotal: 100,
                itemQtyTotal: 1,
                barRevenue: 100,
                bbqRevenue: 0,
                unknownRevenue: 0,
                extraRevenue: 0,
                barCost: 10,
                bbqCost: 0,
                unknownCost: 0,
                updatedAt: 1,
              },
              '2026-05-31': {
                orderCount: 2,
                paidTotal: 200,
                originalTotal: 200,
                itemQtyTotal: 2,
                barRevenue: 200,
                bbqRevenue: 0,
                unknownRevenue: 0,
                extraRevenue: 0,
                barCost: 20,
                bbqCost: 0,
                unknownCost: 0,
                updatedAt: 1,
              },
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

    setAtPath(db.data, 'v3/reports/dailyByMonth/2026-05/2026-05-31/paidTotal', 250)
    db.emit('v3/meta/revisions/reports/dailyByDay/2026-05-31', 'value', 2)
    await Promise.resolve()

    expect(db.onceCalls).toContain('v3/reports/dailyByMonth/2026-05/2026-05-31')
    expect(db.onceCalls).not.toContain('v3/reports/dailyByMonth/2026-05/2026-05-30')
    stop()
  })
})
