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
import { RTDB_V3_SCHEMA_VERSION } from './rtdb-v3-types'

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
      draftEntryCount: 1,
      pendingBatchCount: 0,
      submittedBatchCount: 0,
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
                draftEntryCount: 1,
                pendingBatchCount: 0,
                submittedBatchCount: 0,
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
              draftEntryCount: 1,
              pendingBatchCount: 1,
              submittedBatchCount: 0,
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
})
