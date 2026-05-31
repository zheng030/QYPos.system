import type { CorePosState, PosOrderEntry } from '@/features/pos-kernel/types'

export type EventName = 'value' | 'child_added' | 'child_changed' | 'child_removed'
export type Listener = (snapshot: { val(): unknown; key(): string | null }) => void

export function createState(): CorePosState {
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

export function normalizePath(path: string) {
  return path.replace(/^\/+/, '').replace(/\/+$/, '')
}

export function createSnapshot(path: string, value: unknown) {
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

export function createChildSnapshot(childKey: string, value: unknown) {
  return {
    val() {
      return value
    },
    key() {
      return childKey
    },
  }
}

export function readAtPath(tree: Record<string, unknown>, path: string) {
  const normalized = normalizePath(path)
  if (!normalized) return tree
  return normalized.split('/').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[segment]
  }, tree)
}

export function isServerIncrement(value: unknown): value is { '.sv': { increment: number } } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      '.sv' in value &&
      typeof (value as { '.sv'?: { increment?: unknown } })['.sv']?.increment === 'number'
  )
}

export function setAtPath(tree: Record<string, unknown>, path: string, value: unknown) {
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

export function assertFirebaseSafeKeys(value: unknown, path = '') {
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

export function createDbStub(initialData: Record<string, unknown>) {
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

export function createEntry(overrides: Partial<PosOrderEntry> = {}): PosOrderEntry {
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
