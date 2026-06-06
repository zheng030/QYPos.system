import { describe, expect, it } from 'vitest'

import {
  createMemoryPersistentCacheStore,
  createPayloadHash,
  registerResourceDescriptor,
  type StorageCodec,
} from './rtdb-v3-cache'
import { buildLiveTable } from './rtdb-v3-mapper'
import { createDbStub, createEntry, createState } from './rtdb-v3-repository.test-support'
import { createRtdbV3RepositoryContext } from './rtdb-v3-repository-context'
import { createHistoryOrdersByDayDescriptor } from './rtdb-v3-resource-registry'
import type { V3ClosedOrder } from './rtdb-v3-types'
import { RTDB_V3_SCHEMA_VERSION } from './rtdb-v3-types'

async function flushAsyncListeners() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

describe('rtdb-v3 repository cache helpers', () => {
  it('drops corrupted cached bodies when codec decode fails', async () => {
    const cacheStore = createMemoryPersistentCacheStore()
    const ctx = createRtdbV3RepositoryContext({
      db: createDbStub({}) as never,
      state: createState(),
      cacheStore,
    })

    const codec: StorageCodec<{ value: string }, { broken: string }> = {
      encode(value) {
        return { broken: value.value }
      },
      decode() {
        throw new Error('decode failed')
      },
    }

    await cacheStore.writeBody('broken:resource', { broken: 'x' })
    await cacheStore.writeManifest({
      schemaVersion: RTDB_V3_SCHEMA_VERSION,
      resourceKey: 'broken:resource',
      revision: 1,
      updatedAt: 1,
      payloadSize: 1,
      payloadHash: createPayloadHash({ broken: 'x' }),
    })

    const cached = await ctx.loadCachedResource(
      registerResourceDescriptor({
        resourceKey: 'broken:resource',
        remotePath: 'broken/path',
        revision: { path: 'broken/path' },
        codec,
      })
    )

    expect(cached).toBeNull()
    expect(await cacheStore.readManifest('broken:resource')).toBeNull()
    expect(await cacheStore.readBody('broken:resource')).toBeNull()
  })

  it('throws when saving cache for a descriptor without revision path', async () => {
    const ctx = createRtdbV3RepositoryContext({
      db: createDbStub({}) as never,
      state: createState(),
      cacheStore: createMemoryPersistentCacheStore(),
    })

    await expect(
      ctx.saveCachedResource(
        {
          resourceKey: 'bad',
          remotePath: 'catalog/bad',
          revision: { path: '' },
          codec: {
            encode(value: number) {
              return value
            },
            decode(value: number) {
              return value
            },
          },
        },
        1,
        1
      )
    ).rejects.toThrow('Descriptor missing revision path')
  })

  it('throws when saving cache for a descriptor without remote path', async () => {
    const ctx = createRtdbV3RepositoryContext({
      db: createDbStub({}) as never,
      state: createState(),
      cacheStore: createMemoryPersistentCacheStore(),
    })

    await expect(
      ctx.saveCachedResource(
        {
          resourceKey: 'bad',
          remotePath: '',
          revision: { path: 'catalog/bad' },
          codec: {
            encode(value: number) {
              return value
            },
            decode(value: number) {
              return value
            },
          },
        },
        1,
        1
      )
    ).rejects.toThrow('Descriptor missing remote path')
  })

  it('drops cached bodies when manifest payload hash does not match body', async () => {
    const cacheStore = createMemoryPersistentCacheStore()
    const ctx = createRtdbV3RepositoryContext({
      db: createDbStub({}) as never,
      state: createState(),
      cacheStore,
    })
    const descriptor = registerResourceDescriptor({
      resourceKey: 'tampered:resource',
      remotePath: 'reports/dailyByMonth/2026-05/2026-05-30',
      revision: { path: 'reports/dailyByDay/2026-05-30' },
      codec: {
        encode(value: number) {
          return value
        },
        decode(value: number) {
          return value
        },
      },
    })

    await cacheStore.writeBody('tampered:resource', 7)
    await cacheStore.writeManifest({
      schemaVersion: RTDB_V3_SCHEMA_VERSION,
      resourceKey: 'tampered:resource',
      revision: 1,
      updatedAt: 1,
      payloadSize: 1,
      payloadHash: createPayloadHash(8),
    })

    const cached = await ctx.loadCachedResource(descriptor)

    expect(cached).toBeNull()
    expect(await cacheStore.readManifest('tampered:resource')).toBeNull()
    expect(await cacheStore.readBody('tampered:resource')).toBeNull()
  })

  it('throws when cache descriptor bypasses resource registry registration', async () => {
    const ctx = createRtdbV3RepositoryContext({
      db: createDbStub({}) as never,
      state: createState(),
      cacheStore: createMemoryPersistentCacheStore(),
    })

    await expect(
      ctx.saveCachedResource(
        {
          resourceKey: 'unregistered',
          remotePath: 'catalog/inventory',
          revision: { path: 'catalog/inventory' },
          codec: {
            encode(value: number) {
              return value
            },
            decode(value: number) {
              return value
            },
          },
        },
        1,
        1
      )
    ).rejects.toThrow('Descriptor not registered')
  })

  it('accepts registered ad-hoc descriptors', async () => {
    const cacheStore = createMemoryPersistentCacheStore()
    const ctx = createRtdbV3RepositoryContext({
      db: createDbStub({}) as never,
      state: createState(),
      cacheStore,
    })
    const descriptor = registerResourceDescriptor({
      resourceKey: 'registered',
      remotePath: 'reports/dailyByMonth/2026-05/2026-05-30',
      revision: { path: 'reports/dailyByDay/2026-05-30' },
      codec: {
        encode(value: number) {
          return value
        },
        decode(value: number) {
          return value
        },
      },
    })

    await ctx.saveCachedResource(descriptor, 3, 7)

    expect(await cacheStore.readManifest('registered')).toMatchObject({
      resourceKey: 'registered',
      revision: 3,
    })
  })

  it('reuses live shard cache when revisions stay unchanged', async () => {
    const entry = createEntry({ entryId: 'entry_1' })
    const liveTable = buildLiveTable({
      draft: [entry],
      pendingBatches: [],
      submittedBatches: [],
      customer: { name: 'A', phone: '' },
      updatedAt: 1,
    })
    const cacheStore = createMemoryPersistentCacheStore()
    const initialCtx = createRtdbV3RepositoryContext({
      db: createDbStub({
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
              A1: liveTable,
            },
          },
        },
      }) as never,
      state: createState(),
      cacheStore,
    })
    await initialCtx.readLiveTable('A1')

    const warmDb = createDbStub({
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
            A1: buildLiveTable({
              draft: [],
              pendingBatches: [],
              submittedBatches: [],
              customer: { name: 'B', phone: '' },
              updatedAt: 2,
            }),
          },
        },
      },
    })
    const warmCtx = createRtdbV3RepositoryContext({
      db: warmDb as never,
      state: createState(),
      cacheStore,
    })

    const warm = await warmCtx.readLiveTable('A1')

    expect(Object.keys(warm.draft)).toEqual(['entry_1'])
    expect(warm.summary?.customer.name).toBe('A')
    expect(warmDb.onceCalls).toEqual([
      'v3/meta/revisions/live/tables/A1/summary',
      'v3/meta/revisions/live/tables/A1/draft',
      'v3/meta/revisions/live/tables/A1/pendingBatches',
      'v3/meta/revisions/live/tables/A1/submittedBatches',
    ])
  })

  it('refetches only changed live shard body when one shard revision changes', async () => {
    const entry = createEntry({ entryId: 'entry_1' })
    const cacheStore = createMemoryPersistentCacheStore()
    const initialCtx = createRtdbV3RepositoryContext({
      db: createDbStub({
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
              A1: buildLiveTable({
                draft: [entry],
                pendingBatches: [],
                submittedBatches: [],
                customer: { name: 'A', phone: '' },
                updatedAt: 1,
              }),
            },
          },
        },
      }) as never,
      state: createState(),
      cacheStore,
    })
    await initialCtx.readLiveTable('A1')

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
            A1: buildLiveTable({
              draft: [entry],
              pendingBatches: [
                {
                  batchId: 'pending_1',
                  source: 'customer',
                  status: 'pending',
                  table: 'A1',
                  customer: { name: 'A', phone: '' },
                  createdAt: 2,
                  updatedAt: 2,
                  requestSeq: 1,
                  requestLabel: '#1-1',
                  entries: [pendingEntry],
                  subtotal: pendingEntry.subtotal,
                },
              ],
              submittedBatches: [],
              customer: { name: 'A', phone: '' },
              updatedAt: 2,
            }),
          },
        },
      },
    })
    const warmCtx = createRtdbV3RepositoryContext({
      db: warmDb as never,
      state: createState(),
      cacheStore,
    })

    const warm = await warmCtx.readLiveTable('A1')

    expect(Object.keys(warm.draft)).toEqual(['entry_1'])
    expect(Object.keys(warm.pendingBatches)).toEqual(['pending_1'])
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

  it('does not trust stale in-memory managed resource when remote revision has advanced', async () => {
    const cacheStore = createMemoryPersistentCacheStore()
    const descriptor = createHistoryOrdersByDayDescriptor('2026-06-01')
    const staleOrder: V3ClosedOrder = {
      orderId: 'ord_stale',
      bizDate: '2026-06-01',
      monthKey: '2026-06',
      createdAt: 1,
      closedAt: 1,
      tableLabel: 'A1',
      displaySeqBase: 1,
      splitCounter: null,
      displaySeqLabel: '1',
      customer: { name: '', phone: '' },
      totals: { paid: 100, original: 100 },
      status: 'closed' as const,
      batchIds: [],
      entries: {},
    }
    const freshOrder: V3ClosedOrder = {
      ...staleOrder,
      orderId: 'ord_fresh',
      displaySeqBase: 2,
      displaySeqLabel: '2',
      totals: { paid: 200, original: 200 },
    }

    const initialCtx = createRtdbV3RepositoryContext({
      db: createDbStub({
        v3: {
          meta: {
            revisions: {
              history: {
                ordersByDay: {
                  '2026-06-01': 1,
                },
              },
            },
          },
          history: {
            ordersByMonth: {
              '2026-06': {
                '2026-06-01': {
                  ord_stale: staleOrder,
                },
              },
            },
          },
        },
      }) as never,
      state: createState(),
      cacheStore,
    })

    await initialCtx.ensureManagedResource({
      descriptor,
      readMemory: () => initialCtx.historyDayCache.get('2026-06-01'),
      writeMemory: (value) => {
        initialCtx.historyDayCache.set('2026-06-01', value)
      },
      readRemote: async () => {
        const snapshot = await initialCtx.db.ref('v3/history/ordersByMonth/2026-06/2026-06-01').once('value')
        return descriptor.codec.decode((snapshot.val() || {}) as Record<string, never>)
      },
    })

    const warmDb = createDbStub({
      v3: {
        meta: {
          revisions: {
            history: {
              ordersByDay: {
                '2026-06-01': 2,
              },
            },
          },
        },
        history: {
          ordersByMonth: {
            '2026-06': {
              '2026-06-01': {
                ord_stale: staleOrder,
                ord_fresh: freshOrder,
              },
            },
          },
        },
      },
    })
    const warmCtx = createRtdbV3RepositoryContext({
      db: warmDb as never,
      state: createState(),
      cacheStore,
    })

    warmCtx.historyDayCache.set('2026-06-01', { ord_stale: staleOrder })
    warmCtx.markResourceFresh(descriptor.resourceKey, 1)

    const result = await warmCtx.ensureManagedResource({
      descriptor,
      readMemory: () => warmCtx.historyDayCache.get('2026-06-01'),
      writeMemory: (value) => {
        warmCtx.historyDayCache.set('2026-06-01', value)
      },
      readRemote: async () => {
        const snapshot = await warmCtx.db.ref('v3/history/ordersByMonth/2026-06/2026-06-01').once('value')
        return descriptor.codec.decode((snapshot.val() || {}) as Record<string, never>)
      },
    })

    expect(Object.keys(result).sort()).toEqual(['ord_fresh', 'ord_stale'])
    expect(warmDb.onceCalls).toContain('v3/history/ordersByMonth/2026-06/2026-06-01')
  })

  it('does not use the remembered revision cache as a freshness shortcut', async () => {
    const descriptor = registerResourceDescriptor({
      resourceKey: 'runtime:freshness',
      remotePath: 'runtime/body',
      revision: { path: 'runtime/body' },
      codec: {
        encode(value: { value: string }) {
          return value
        },
        decode(value: { value: string }) {
          return value
        },
      },
    })
    const db = createDbStub({
      v3: {
        meta: { revisions: { runtime: { body: 2 } } },
        runtime: { body: { value: 'remote' } },
      },
    })
    const ctx = createRtdbV3RepositoryContext({
      db: db as never,
      state: createState(),
      cacheStore: createMemoryPersistentCacheStore(),
    })
    let memory = { value: 'stale' }
    ctx.rememberRevision(descriptor.revision.path, 1)
    ctx.markResourceFresh(descriptor.resourceKey, 1)

    const result = await ctx.getResource({
      descriptor,
      readMemory: () => memory,
      writeMemory: (value) => {
        memory = value
      },
      readRemote: async () => {
        const snapshot = await ctx.db.ref('v3/runtime/body').once('value')
        return descriptor.codec.decode(snapshot.val() as { value: string })
      },
    })

    expect(result.value).toBe('remote')
    expect(db.onceCalls).toContain('v3/meta/revisions/runtime/body')
    expect(db.onceCalls).toContain('v3/runtime/body')
  })

  it('hydrates warm cache before resource watch and skips body read when revision is unchanged', async () => {
    const descriptor = registerResourceDescriptor({
      resourceKey: 'runtime:watched',
      remotePath: 'runtime/watched',
      revision: { path: 'runtime/watched' },
      codec: {
        encode(value: { value: string }) {
          return value
        },
        decode(value: { value: string }) {
          return value
        },
      },
    })
    const cacheStore = createMemoryPersistentCacheStore()
    await cacheStore.writeBody(descriptor.resourceKey, { value: 'cached' })
    await cacheStore.writeManifest({
      schemaVersion: RTDB_V3_SCHEMA_VERSION,
      resourceKey: descriptor.resourceKey,
      revision: 7,
      updatedAt: 1,
      payloadSize: 18,
      payloadHash: createPayloadHash({ value: 'cached' }),
    })
    const db = createDbStub({
      v3: {
        meta: { revisions: { runtime: { watched: 7 } } },
        runtime: { watched: { value: 'remote' } },
      },
    })
    const ctx = createRtdbV3RepositoryContext({
      db: db as never,
      state: createState(),
      cacheStore,
    })
    let memory: { value: string } | undefined
    let changeCount = 0

    const stop = ctx.watchManagedResource({
      descriptor,
      readMemory: () => memory,
      writeMemory: (value) => {
        memory = value
      },
      readRemote: async () => {
        const snapshot = await ctx.db.ref('v3/runtime/watched').once('value')
        return descriptor.codec.decode(snapshot.val() as { value: string })
      },
      onChange: () => {
        changeCount += 1
      },
    })
    await flushAsyncListeners()

    expect(memory?.value).toBe('cached')
    expect(changeCount).toBe(1)
    expect(db.onceCalls).not.toContain('v3/runtime/watched')
    stop()
  })

  it('does not let an older resource revision overwrite newer memory', async () => {
    const descriptor = registerResourceDescriptor({
      resourceKey: 'runtime:race',
      remotePath: 'runtime/race',
      revision: { path: 'runtime/race' },
      codec: {
        encode(value: { value: string }) {
          return value
        },
        decode(value: { value: string }) {
          return value
        },
      },
    })
    const ctx = createRtdbV3RepositoryContext({
      db: createDbStub({}) as never,
      state: createState(),
      cacheStore: createMemoryPersistentCacheStore(),
    })
    let memory = { value: 'newer' }
    ctx.markResourceFresh(descriptor.resourceKey, 4)

    const result = await ctx.syncResource({
      descriptor,
      revision: 3,
      readMemory: () => memory,
      writeMemory: (value) => {
        memory = value
      },
      readRemote: async () => ({ value: 'older' }),
    })

    expect(result.value).toBe('newer')
    expect(memory.value).toBe('newer')
  })

  it('does not apply an older in-flight remote result after newer memory wins', async () => {
    const descriptor = registerResourceDescriptor({
      resourceKey: 'runtime:in-flight-race',
      remotePath: 'runtime/inFlightRace',
      revision: { path: 'runtime/inFlightRace' },
      codec: {
        encode(value: { value: string }) {
          return value
        },
        decode(value: { value: string }) {
          return value
        },
      },
    })
    const ctx = createRtdbV3RepositoryContext({
      db: createDbStub({}) as never,
      state: createState(),
      cacheStore: createMemoryPersistentCacheStore(),
    })
    let memory: { value: string } | undefined
    let resolveOlder!: (value: { value: string }) => void
    const olderRemote = new Promise<{ value: string }>((resolve) => {
      resolveOlder = resolve
    })

    const olderLoad = ctx.syncResource({
      descriptor,
      revision: 3,
      readMemory: () => memory,
      writeMemory: (value) => {
        memory = value
      },
      readRemote: async () => await olderRemote,
    })
    await Promise.resolve()

    memory = { value: 'newer' }
    ctx.markResourceFresh(descriptor.resourceKey, 4)
    resolveOlder({ value: 'older' })
    const result = await olderLoad

    expect(result.value).toBe('newer')
    expect(memory.value).toBe('newer')
    expect(await ctx.loadCachedResource(descriptor)).toBeNull()
  })

  it('lets a newer in-flight resource load supersede an older one', async () => {
    const descriptor = registerResourceDescriptor({
      resourceKey: 'runtime:concurrent-race',
      remotePath: 'runtime/concurrentRace',
      revision: { path: 'runtime/concurrentRace' },
      codec: {
        encode(value: { value: string }) {
          return value
        },
        decode(value: { value: string }) {
          return value
        },
      },
    })
    const ctx = createRtdbV3RepositoryContext({
      db: createDbStub({}) as never,
      state: createState(),
      cacheStore: createMemoryPersistentCacheStore(),
    })
    let memory: { value: string } | undefined
    let resolveOlder!: (value: { value: string }) => void
    let resolveNewer!: (value: { value: string }) => void
    const olderRemote = new Promise<{ value: string }>((resolve) => {
      resolveOlder = resolve
    })
    const newerRemote = new Promise<{ value: string }>((resolve) => {
      resolveNewer = resolve
    })

    const olderLoad = ctx.syncResource({
      descriptor,
      revision: 3,
      readMemory: () => memory,
      writeMemory: (value) => {
        memory = value
      },
      readRemote: async () => await olderRemote,
    })
    await Promise.resolve()
    const newerLoad = ctx.syncResource({
      descriptor,
      revision: 4,
      readMemory: () => memory,
      writeMemory: (value) => {
        memory = value
      },
      readRemote: async () => await newerRemote,
    })
    await Promise.resolve()

    resolveOlder({ value: 'older' })
    resolveNewer({ value: 'newer' })
    const [olderResult, newerResult] = await Promise.all([olderLoad, newerLoad])
    const cached = await ctx.loadCachedResource(descriptor)

    expect(olderResult.value).toBe('newer')
    expect(newerResult.value).toBe('newer')
    expect(memory?.value).toBe('newer')
    expect(cached?.revision).toBe(4)
    expect(cached?.value.value).toBe('newer')
  })
})
