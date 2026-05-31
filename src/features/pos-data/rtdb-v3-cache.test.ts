import { afterEach, describe, expect, it } from 'vitest'

import {
  createIdentityCodec,
  createMemoryPersistentCacheStore,
  createPayloadHash,
  createPersistentCacheStore,
  createResourceRegistry,
} from './rtdb-v3-cache'
import { createEntry } from './rtdb-v3-repository.test-support'
import {
  closedOrderStorageCodec,
  dailySummaryStorageCodec,
  itemStatsStorageCodec,
  orderBatchStorageCodec,
  orderEntryStorageCodec,
  tableSummaryStorageCodec,
} from './rtdb-v3-storage-codecs'
import { RTDB_V3_SCHEMA_VERSION } from './rtdb-v3-types'

type LocalStorageStub = Storage & {
  dump: () => Record<string, string>
}

type IdbRequestStub<T> = {
  result: T
  error: Error | null
  onsuccess: ((event: Event) => void) | null
  onerror: ((event: Event) => void) | null
  readyState: 'pending' | 'done'
  completeSuccess: (value: T) => void
  completeError: (error?: Error) => void
}

type IdbOpenRequestStub = IdbRequestStub<IDBDatabase> & {
  onupgradeneeded: ((event: IDBVersionChangeEvent) => void) | null
  completeSuccess: (db: IDBDatabase) => void
  completeError: (error?: Error) => void
  runUpgrade: (db: IDBDatabase) => void
}

function triggerEvent(handler: ((event: Event) => void) | null, target: object) {
  handler?.({ target } as unknown as Event)
}

function triggerUpgradeEvent(handler: ((event: IDBVersionChangeEvent) => void) | null, target: object) {
  handler?.({ target } as unknown as IDBVersionChangeEvent)
}

function createLocalStorageStub(seed?: Record<string, string>): LocalStorageStub {
  const values = new Map(Object.entries(seed || {}))

  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key) {
      return values.has(key) ? values.get(key) || null : null
    },
    key(index) {
      return [...values.keys()][index] || null
    },
    removeItem(key) {
      values.delete(key)
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
    dump() {
      return Object.fromEntries(values.entries())
    },
  } as LocalStorageStub
}

function createIdbRequestStub<T>(): IdbRequestStub<T> {
  const request = {
    result: undefined as T,
    error: null as Error | null,
    onsuccess: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    readyState: 'pending' as 'pending' | 'done',
    completeSuccess(value: T) {
      request.result = value
      request.readyState = 'done'
      triggerEvent(request.onsuccess, request)
    },
    completeError(error?: Error) {
      request.error = error || new Error('request failed')
      request.readyState = 'done'
      triggerEvent(request.onerror, request)
    },
  }

  return request
}

function createIndexedDbSuccessStub() {
  const bodyStore = new Map<string, unknown>()
  const db = {
    objectStoreNames: {
      contains(name: string) {
        return name === 'resourceBodies'
      },
    },
    createObjectStore() {
      return {} as unknown as IDBObjectStore
    },
    transaction(_storeName: string, _mode: IDBTransactionMode) {
      const transaction = {
        error: null as Error | null,
        oncomplete: null as ((event: Event) => void) | null,
        onabort: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        objectStore() {
          return {
            get(key: string) {
              const request = createIdbRequestStub<unknown>()
              setTimeout(() => {
                request.completeSuccess(bodyStore.has(key) ? bodyStore.get(key) : undefined)
              }, 0)
              setTimeout(() => {
                triggerEvent(transaction.oncomplete, transaction)
              }, 0)
              return request as unknown as IDBRequest<unknown>
            },
            put(value: unknown, key: string) {
              bodyStore.set(key, value)
              setTimeout(() => {
                triggerEvent(transaction.oncomplete, transaction)
              }, 0)
              return undefined
            },
            delete(key: string) {
              bodyStore.delete(key)
              setTimeout(() => {
                triggerEvent(transaction.oncomplete, transaction)
              }, 0)
              return undefined
            },
            clear() {
              bodyStore.clear()
              setTimeout(() => {
                triggerEvent(transaction.oncomplete, transaction)
              }, 0)
              return undefined
            },
          } as unknown as IDBObjectStore
        },
      }

      return transaction as unknown as IDBTransaction
    },
  } as unknown as IDBDatabase

  const indexedDb = {
    open(_name: string, _version?: number) {
      const request = createIdbRequestStub<IDBDatabase>() as IdbOpenRequestStub
      request.onupgradeneeded = null
      request.runUpgrade = (upgradeDb: IDBDatabase) => {
        request.result = upgradeDb
        triggerUpgradeEvent(request.onupgradeneeded, request)
      }
      request.completeSuccess = (resultDb: IDBDatabase) => {
        request.result = resultDb
        request.readyState = 'done'
        triggerEvent(request.onsuccess, request)
      }
      request.completeError = (error?: Error) => {
        request.error = error || new Error('open failed')
        request.readyState = 'done'
        triggerEvent(request.onerror, request)
      }

      queueMicrotask(() => {
        request.runUpgrade(db)
        request.completeSuccess(db)
      })

      return request
    },
  } as unknown as IDBFactory

  return {
    indexedDb,
    dumpBody() {
      return Object.fromEntries(bodyStore.entries())
    },
  }
}

function installBrowserCacheGlobals(args: { localStorage?: Storage; indexedDB?: IDBFactory | undefined }) {
  const originalLocalStorage = globalThis.localStorage
  const originalIndexedDb = globalThis.indexedDB

  if (args.localStorage) {
    ;(globalThis as { localStorage?: Storage }).localStorage = args.localStorage
  } else {
    delete (globalThis as { localStorage?: Storage }).localStorage
  }

  if (typeof args.indexedDB !== 'undefined') {
    ;(globalThis as { indexedDB?: IDBFactory }).indexedDB = args.indexedDB
  } else {
    delete (globalThis as { indexedDB?: IDBFactory }).indexedDB
  }

  return () => {
    if (typeof originalLocalStorage === 'undefined') {
      delete (globalThis as { localStorage?: Storage }).localStorage
    } else {
      ;(globalThis as { localStorage?: Storage }).localStorage = originalLocalStorage
    }

    if (typeof originalIndexedDb === 'undefined') {
      delete (globalThis as { indexedDB?: IDBFactory }).indexedDB
    } else {
      ;(globalThis as { indexedDB?: IDBFactory }).indexedDB = originalIndexedDb
    }
  }
}

const restoreGlobals: Array<() => void> = []

afterEach(() => {
  while (restoreGlobals.length > 0) {
    restoreGlobals.pop()?.()
  }
})

describe('rtdb-v3-cache', () => {
  it('round-trips manifest and body through memory store', async () => {
    const store = createMemoryPersistentCacheStore()

    await store.writeBody('catalog:inventory', { cola: true })
    await store.writeManifest({
      schemaVersion: RTDB_V3_SCHEMA_VERSION,
      resourceKey: 'catalog:inventory',
      revision: 8,
      updatedAt: 100,
      payloadSize: 13,
      payloadHash: createPayloadHash({ cola: true }),
    })

    expect(await store.readManifest('catalog:inventory')).toEqual({
      schemaVersion: RTDB_V3_SCHEMA_VERSION,
      resourceKey: 'catalog:inventory',
      revision: 8,
      updatedAt: 100,
      payloadSize: 13,
      payloadHash: createPayloadHash({ cola: true }),
    })
    expect(await store.readBody<Record<string, boolean>>('catalog:inventory')).toEqual({ cola: true })
  })

  it('invalidates stale schema manifests in memory store', async () => {
    const store = createMemoryPersistentCacheStore()

    await store.writeBody('history:orders:2026-05-30', { ord_1: { paid: 100 } })
    await store.writeManifest({
      schemaVersion: 2,
      resourceKey: 'history:orders:2026-05-30',
      revision: 1,
      updatedAt: 1,
      payloadSize: 10,
      payloadHash: createPayloadHash({ ord_1: { paid: 100 } }),
    })

    expect(await store.readManifest('history:orders:2026-05-30')).toBeNull()
    expect(await store.readBody('history:orders:2026-05-30')).toBeNull()
  })

  it('clears whole namespace when any stale schema manifest is encountered', async () => {
    const store = createMemoryPersistentCacheStore()

    await store.writeBody('history:orders:2026-05-30', { ord_1: { paid: 100 } })
    await store.writeManifest({
      schemaVersion: 2,
      resourceKey: 'history:orders:2026-05-30',
      revision: 1,
      updatedAt: 1,
      payloadSize: 10,
      payloadHash: createPayloadHash({ ord_1: { paid: 100 } }),
    })
    await store.writeBody('catalog:inventory', { cola: true })
    await store.writeManifest({
      schemaVersion: 2,
      resourceKey: 'catalog:inventory',
      revision: 2,
      updatedAt: 2,
      payloadSize: 5,
      payloadHash: createPayloadHash({ cola: true }),
    })

    expect(await store.readManifest('history:orders:2026-05-30')).toBeNull()
    expect(await store.readManifest('catalog:inventory')).toBeNull()
    expect(await store.readBody('history:orders:2026-05-30')).toBeNull()
    expect(await store.readBody('catalog:inventory')).toBeNull()
  })

  it('clears namespace bodies and manifests together', async () => {
    const store = createMemoryPersistentCacheStore()

    await store.writeBody('a', { x: 1 })
    await store.writeManifest({
      schemaVersion: RTDB_V3_SCHEMA_VERSION,
      resourceKey: 'a',
      revision: 1,
      updatedAt: 1,
      payloadSize: 1,
      payloadHash: createPayloadHash({ x: 1 }),
    })
    await store.writeBody('b', { y: 2 })
    await store.writeManifest({
      schemaVersion: RTDB_V3_SCHEMA_VERSION,
      resourceKey: 'b',
      revision: 2,
      updatedAt: 2,
      payloadSize: 1,
      payloadHash: createPayloadHash({ y: 2 }),
    })

    await store.clearNamespace()

    expect(await store.readManifest('a')).toBeNull()
    expect(await store.readManifest('b')).toBeNull()
    expect(await store.readBody('a')).toBeNull()
    expect(await store.readBody('b')).toBeNull()
  })

  it('uses localStorage + indexedDB when browser storage is available', async () => {
    const localStorage = createLocalStorageStub()
    const indexedDb = createIndexedDbSuccessStub()
    restoreGlobals.push(installBrowserCacheGlobals({ localStorage, indexedDB: indexedDb.indexedDb }))

    const store = createPersistentCacheStore()
    const body = { cola: true }
    const payloadHash = createPayloadHash(body)

    await store.writeBody('catalog:inventory', body)
    await store.writeManifest({
      schemaVersion: RTDB_V3_SCHEMA_VERSION,
      resourceKey: 'catalog:inventory',
      revision: 5,
      updatedAt: 123,
      payloadSize: 13,
      payloadHash,
    })

    expect(localStorage.dump()).toMatchObject({
      'qys:rtdb-v3-cache:schema-version': String(RTDB_V3_SCHEMA_VERSION),
      'qys:rtdb-v3-cache:manifest:catalog:inventory': JSON.stringify({
        schemaVersion: RTDB_V3_SCHEMA_VERSION,
        resourceKey: 'catalog:inventory',
        revision: 5,
        updatedAt: 123,
        payloadSize: 13,
        payloadHash,
      }),
    })
    expect(indexedDb.dumpBody()).toEqual({ 'catalog:inventory': body })
    expect(await store.readManifest('catalog:inventory')).toEqual({
      schemaVersion: RTDB_V3_SCHEMA_VERSION,
      resourceKey: 'catalog:inventory',
      revision: 5,
      updatedAt: 123,
      payloadSize: 13,
      payloadHash,
    })
    expect(await store.readBody<Record<string, boolean>>('catalog:inventory')).toEqual(body)
  })

  it('falls back to memory store when indexedDB open fails at runtime', async () => {
    const localStorage = createLocalStorageStub()
    restoreGlobals.push(
      installBrowserCacheGlobals({
        localStorage,
        indexedDB: {
          open() {
            const request = createIdbRequestStub<IDBDatabase>() as IdbOpenRequestStub
            request.onupgradeneeded = null
            request.runUpgrade = () => {}
            request.completeSuccess = () => {}
            request.completeError = (error?: Error) => {
              request.error = error || new Error('open failed')
              request.readyState = 'done'
              triggerEvent(request.onerror, request)
            }
            queueMicrotask(() => {
              request.completeError(new Error('IndexedDB open failed'))
            })
            return request
          },
        } as unknown as IDBFactory,
      })
    )

    const store = createPersistentCacheStore()

    await store.writeBody('catalog:inventory', { cola: true })
    await store.writeManifest({
      schemaVersion: RTDB_V3_SCHEMA_VERSION,
      resourceKey: 'catalog:inventory',
      revision: 2,
      updatedAt: 5,
      payloadSize: 13,
      payloadHash: createPayloadHash({ cola: true }),
    })

    expect(await store.readBody<Record<string, boolean>>('catalog:inventory')).toEqual({ cola: true })
    expect(await store.readManifest('catalog:inventory')).toEqual({
      schemaVersion: RTDB_V3_SCHEMA_VERSION,
      resourceKey: 'catalog:inventory',
      revision: 2,
      updatedAt: 5,
      payloadSize: 13,
      payloadHash: createPayloadHash({ cola: true }),
    })
    expect(localStorage.dump()).toEqual({
      'qys:rtdb-v3-cache:schema-version': String(RTDB_V3_SCHEMA_VERSION),
    })
  })

  it('clears browser namespace when stored schema version is stale', async () => {
    const localStorage = createLocalStorageStub({
      'qys:rtdb-v3-cache:schema-version': '2',
      'qys:rtdb-v3-cache:manifest:catalog:inventory': JSON.stringify({
        schemaVersion: 2,
        resourceKey: 'catalog:inventory',
        revision: 1,
        updatedAt: 1,
        payloadSize: 1,
        payloadHash: createPayloadHash({ cola: true }),
      }),
    })
    const indexedDb = createIndexedDbSuccessStub()
    restoreGlobals.push(installBrowserCacheGlobals({ localStorage, indexedDB: indexedDb.indexedDb }))

    const store = createPersistentCacheStore()

    expect(await store.readManifest('catalog:inventory')).toBeNull()
    expect(localStorage.dump()).toEqual({
      'qys:rtdb-v3-cache:schema-version': String(RTDB_V3_SCHEMA_VERSION),
    })
    expect(indexedDb.dumpBody()).toEqual({})
  })

  it('falls back to memory store when localStorage access throws at runtime', async () => {
    const brokenLocalStorage = {
      get length() {
        throw new Error('quota')
      },
      clear() {
        throw new Error('quota')
      },
      getItem() {
        throw new Error('quota')
      },
      key() {
        throw new Error('quota')
      },
      removeItem() {
        throw new Error('quota')
      },
      setItem() {
        throw new Error('quota')
      },
    } as unknown as Storage
    restoreGlobals.push(
      installBrowserCacheGlobals({
        localStorage: brokenLocalStorage,
        indexedDB: createIndexedDbSuccessStub().indexedDb,
      })
    )

    const store = createPersistentCacheStore()

    await store.writeBody('catalog:inventory', { cola: true })
    await store.writeManifest({
      schemaVersion: RTDB_V3_SCHEMA_VERSION,
      resourceKey: 'catalog:inventory',
      revision: 3,
      updatedAt: 7,
      payloadSize: 13,
      payloadHash: createPayloadHash({ cola: true }),
    })

    expect(await store.readBody<Record<string, boolean>>('catalog:inventory')).toEqual({ cola: true })
    expect(await store.readManifest('catalog:inventory')).toEqual({
      schemaVersion: RTDB_V3_SCHEMA_VERSION,
      resourceKey: 'catalog:inventory',
      revision: 3,
      updatedAt: 7,
      payloadSize: 13,
      payloadHash: createPayloadHash({ cola: true }),
    })
  })

  it('rejects duplicate resource keys and duplicate revision paths', () => {
    expect(() =>
      createResourceRegistry([
        {
          resourceKey: 'catalog:inventory',
          remotePath: 'catalog/inventory',
          revision: { path: 'catalog/inventory' },
          codec: createIdentityCodec<Record<string, boolean>>(),
        },
        {
          resourceKey: 'catalog:inventory',
          remotePath: 'catalog/prices',
          revision: { path: 'catalog/prices' },
          codec: createIdentityCodec<Record<string, number>>(),
        },
      ])
    ).toThrow('Duplicate resource key')

    expect(() =>
      createResourceRegistry([
        {
          resourceKey: 'catalog:inventory',
          remotePath: 'catalog/inventory',
          revision: { path: 'catalog/inventory' },
          codec: createIdentityCodec<Record<string, boolean>>(),
        },
        {
          resourceKey: 'catalog:prices',
          remotePath: 'catalog/prices',
          revision: { path: 'catalog/inventory' },
          codec: createIdentityCodec<Record<string, number>>(),
        },
      ])
    ).toThrow('Duplicate revision path')
  })

  it('rejects duplicate remote paths and exposes remote-path lookup', () => {
    const registry = createResourceRegistry([
      {
        resourceKey: 'catalog:inventory',
        remotePath: 'catalog/inventory',
        revision: { path: 'catalog/inventory' },
        codec: createIdentityCodec<Record<string, boolean>>(),
      },
      {
        resourceKey: 'catalog:prices',
        remotePath: 'catalog/prices',
        revision: { path: 'catalog/prices' },
        codec: createIdentityCodec<Record<string, number>>(),
      },
    ])

    expect(registry.hasRemotePath('catalog/inventory')).toBe(true)
    expect(registry.getByRemotePath('catalog/prices')?.resourceKey).toBe('catalog:prices')

    expect(() =>
      createResourceRegistry([
        {
          resourceKey: 'a',
          remotePath: 'catalog/inventory',
          revision: { path: 'catalog/a' },
          codec: createIdentityCodec<number>(),
        },
        {
          resourceKey: 'b',
          remotePath: 'catalog/inventory',
          revision: { path: 'catalog/b' },
          codec: createIdentityCodec<number>(),
        },
      ])
    ).toThrow('Duplicate remote path')
  })

  it('round-trips compact report codecs and shrinks stored payloads', () => {
    const dailySummary = {
      orderCount: 12,
      paidTotal: 3456,
      originalTotal: 3600,
      itemQtyTotal: 19,
      categoryRevenue: { drink: 980, pasta_risotto: 2476 },
      categoryCost: { drink: 210, pasta_risotto: 1200 },
      updatedAt: 99,
    }
    const itemStats = {
      'drink.black-tea': {
        displayName: '紅茶',
        categoryKey: 'drink',
        qty: 5,
        revenue: 400,
        cost: 60,
        updatedAt: 99,
      },
      'pasta_risotto.chicken-breast': {
        displayName: '青醬雞胸義大利麵',
        categoryKey: 'pasta_risotto',
        qty: 4,
        revenue: 1240,
        cost: 480,
        updatedAt: 99,
      },
    }

    const encodedSummary = dailySummaryStorageCodec.encode(dailySummary)
    const encodedStats = itemStatsStorageCodec.encode(itemStats)

    expect(dailySummaryStorageCodec.decode(encodedSummary)).toEqual(dailySummary)
    expect(itemStatsStorageCodec.decode(encodedStats)).toEqual(itemStats)
    expect(JSON.stringify(encodedSummary).length).toBeLessThan(JSON.stringify(dailySummary).length)
    expect(JSON.stringify(encodedStats).length).toBeLessThan(JSON.stringify(itemStats).length)
  })

  it('shrinks live summary and batch payloads at storage boundary', () => {
    const summary = {
      timerStartedAt: 1,
      displaySeqBase: 12,
      draftEntryCount: 1,
      pendingBatchCount: 2,
      submittedBatchCount: 2,
      nextRequestSeq: 9,
      nextSplitCounter: 4,
      customer: { name: 'A', phone: '0912' },
      updatedAt: 99,
    }
    const batch = {
      batchId: 'pending_1',
      source: 'customer' as const,
      status: 'pending' as const,
      table: 'A1',
      customer: { name: 'A', phone: '0912' },
      createdAt: 1,
      updatedAt: 2,
      requestSeq: 3,
      requestLabel: '#12-3',
      entries: {},
      subtotal: 150,
    }

    const encodedSummary = tableSummaryStorageCodec.encode(summary)
    const encodedBatch = orderBatchStorageCodec.encode(batch)

    expect(tableSummaryStorageCodec.decode(encodedSummary)).toEqual(summary)
    expect(orderBatchStorageCodec.decode(encodedBatch)).toEqual(batch)
    expect(JSON.stringify(encodedSummary).length).toBeLessThan(JSON.stringify(summary).length)
    expect(JSON.stringify(encodedBatch).length).toBeLessThan(JSON.stringify(batch).length)
  })

  it('shrinks closed-order payload at storage boundary', () => {
    const order = {
      orderId: 'ord_1',
      bizDate: '2026-05-30' as const,
      monthKey: '2026-05' as const,
      createdAt: 1,
      closedAt: 2,
      tableLabel: 'A1',
      displaySeqBase: 12,
      splitCounter: 1,
      displaySeqLabel: '12-1',
      customer: { name: 'A', phone: '0912' },
      totals: { paid: 300, original: 310 },
      status: 'closed' as const,
      batchIds: ['submitted_1'],
      entries: {},
    }

    const encoded = closedOrderStorageCodec.encode(order)

    expect(closedOrderStorageCodec.decode(encoded)).toEqual(order)
    expect(JSON.stringify(encoded).length).toBeLessThan(JSON.stringify(order).length)
  })

  it('removes undefined optional fields from encoded order entries', () => {
    const entry = createEntry()
    const encoded = orderEntryStorageCodec.encode({
      ...entry,
      lines: Object.fromEntries(entry.lines.map((line) => [line.lineId, line])),
    })

    const mainLineId = entry.lines[0]?.lineId || 'm'
    expect(encoded.l?.[mainLineId]).toBeTruthy()
    expect(Object.hasOwn(encoded.l?.[mainLineId] || {}, 'p')).toBe(false)
  })
})
