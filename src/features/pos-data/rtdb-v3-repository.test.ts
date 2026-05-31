import { describe, expect, it } from 'vitest'

import type { CorePosState, PosOrderEntry } from '@/features/pos-kernel/types'
import { encodeRtdbKeySegment } from './rtdb-v3-key-codec'
import { createRtdbV3Repository } from './rtdb-v3-repository'

type EventName = 'value' | 'child_added' | 'child_changed' | 'child_removed'
type Listener = (snapshot: { val(): unknown; key(): string | null }) => void

function createState(): CorePosState {
  return {
    tableTimers: {},
    tableStatuses: {},
    tableCustomers: {},
    itemCosts: {},
    itemPrices: {},
    inventory: {},
    attendanceEmployees: {},
    attendanceRecords: {},
    ownerPasswords: {},
    tableDrafts: {},
    pendingBatchPreviews: {},
    pendingBatches: {},
    submittedBatches: {},
    staffDrafts: {},
    selectedTable: null,
    currentMode: 'staff',
    activeDraftEntries: [],
    activePendingBatches: [],
    activeSubmittedBatches: [],
    tableBatchCounts: {},
    tableSplitCounters: {},
    seatTimerInterval: null,
    currentBuilder: null,
    currentPendingBatchId: null,
    currentPendingTable: null,
    isQrMode: false,
    isHistorySimpleMode: false,
    menuFilter: {
      activeTab: 'menu',
      activeCategoryKey: 'pasta_risotto',
    },
    staffWorkspace: {
      expanded: false,
      serviceFeeEnabled: false,
      discount: null,
    },
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

function assertFirebaseSafeKeys(value: unknown, path = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return
  }

  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    if (!key || /[.#$/[\]]/.test(key)) {
      throw new Error(`Invalid Firebase key at ${path || '<root>'}: ${key}`)
    }
    assertFirebaseSafeKeys(entry, path ? `${path}.${key}` : key)
  })
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
          assertFirebaseSafeKeys(next, normalized)
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

function createEntry(overrides: Partial<PosOrderEntry> = {}): PosOrderEntry {
  const entryId = overrides.entryId || 'entry_1'
  const itemId = overrides.itemId || 'drink.latte'
  const itemName = overrides.itemName || '拿鐵咖啡'
  const shortName = overrides.shortName || '拿鐵'
  const categoryKey = overrides.categoryKey || 'drink'
  return {
    entryId,
    groupId: overrides.groupId || entryId,
    itemId,
    catalogKey: overrides.catalogKey || itemId,
    inventoryKey: overrides.inventoryKey || itemId,
    itemName,
    shortName,
    categoryKey,
    quantity: overrides.quantity || 1,
    status: overrides.status || 'draft',
    source: overrides.source || 'customer',
    createdAt: overrides.createdAt || 1,
    updatedAt: overrides.updatedAt || 1,
    selections: overrides.selections || {},
    includeSelections: overrides.includeSelections || {},
    upgradeSelections: overrides.upgradeSelections || {},
    lines: overrides.lines || [
      {
        lineId: `${entryId}_main`,
        groupId: overrides.groupId || entryId,
        role: 'main',
        catalogKey: overrides.catalogKey || itemId,
        inventoryKey: overrides.inventoryKey || itemId,
        displayName: itemName,
        shortName,
        categoryKey,
        station: 'kitchen',
        courseKind: 'drink',
        quantity: overrides.quantity || 1,
        unitPrice: overrides.subtotal || 150,
        priceDelta: 0,
        lineTotal: overrides.subtotal || 150,
        selectionSummary: '',
        isTreat: false,
        sourceEntryId: entryId,
      },
    ],
    subtotal: overrides.subtotal || 150,
    summary: overrides.summary || {
      title: itemName,
      subtitle: '',
      quantityLabel: '1 份',
      totalLabel: '$150',
    },
  }
}

describe('rtdb-v3-repository', () => {
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
              '2026-05-30': {
                orderCount: 1,
                paidTotal: 100,
                originalTotal: 100,
                itemQtyTotal: 0,
                categoryRevenue: { drink: 100 },
                categoryCost: { drink: 10 },
                updatedAt: 1,
              },
            },
          },
          itemStatsByMonth: {
            '2026-05': {
              '2026-05-30': {
                cola: {
                  displayName: '可樂',
                  categoryKey: 'drink',
                  qty: 1,
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
    expect(readAtPath(db.data, 'v3/live/tables/A1/draft/entry_1')).toBeTruthy()
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
    expect(readAtPath(db.data, `v3/live/tables/A1/draft/${encodedEntryId}/lines/${encodedLineId}`)).toBeTruthy()
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
    expect(readAtPath(db.data, 'v3/live/tables/A1/draft')).toEqual({})

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
                categoryRevenue: { drink: 100 },
                categoryCost: { drink: 10 },
                updatedAt: 1,
              },
              '2026-05-31': {
                orderCount: 2,
                paidTotal: 200,
                originalTotal: 200,
                itemQtyTotal: 2,
                categoryRevenue: { drink: 200 },
                categoryCost: { drink: 20 },
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

    const draft = readAtPath(db.data, 'v3/live/tables/A1/draft') as Record<
      string,
      { quantity: number; subtotal: number }
    >
    expect(Object.keys(draft)).toHaveLength(1)
    expect(draft.entry_1).toMatchObject({
      quantity: 2,
      subtotal: 300,
    })
  })

  it('removes a submitted batch when updateSubmittedBatch receives no entries', async () => {
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
                  createdAt: 3,
                  updatedAt: 3,
                  acceptedAt: 3,
                  requestLabel: '#5-1',
                  entries: {
                    [entry.entryId]: {
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

    const result = await repository.updateSubmittedBatch('A1', 'submitted_1', [])

    expect(result).toBeNull()
    expect(readAtPath(db.data, 'v3/live/tables/A1/submittedBatches/submitted_1')).toBeUndefined()
    expect(readAtPath(db.data, 'v3/live/tables/A1/summary/batchCount')).toBe(0)
  })
})
