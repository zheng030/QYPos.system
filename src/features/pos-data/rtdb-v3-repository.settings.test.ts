import { describe, expect, it } from 'vitest'

import { createMemoryPersistentCacheStore } from './rtdb-v3-cache'
import { createRtdbV3Repository } from './rtdb-v3-repository'
import { createDbStub, createState } from './rtdb-v3-repository.test-support'

const NOTICE = { enabled: true, title: '用餐須知', message: '每人低消一杯飲品\n用餐時間 90 分鐘' }

function createRepository(db: ReturnType<typeof createDbStub>, cacheStore = createMemoryPersistentCacheStore()) {
  return createRtdbV3Repository({ db: db as never, state: createState(), cacheStore })
}

describe('rtdb-v3 customer notice settings', () => {
  it('reads null before the shop saves a notice, touching only its revision and body', async () => {
    const db = createDbStub({})

    expect(await createRepository(db).readCustomerNotice()).toBeNull()
    expect(db.onceCalls).toEqual(['v3/meta/revisions/settings/customerNotice', 'v3/settings/customerNotice'])
  })

  it('saves the notice and its revision in one small write', async () => {
    const db = createDbStub({})
    const repository = createRepository(db)

    await repository.saveCustomerNotice(NOTICE)

    expect(db.updateCalls).toHaveLength(1)
    expect(db.updateCalls[0]?.payloadKeys).toEqual([
      'v3/meta/revisions/settings/customerNotice',
      'v3/settings/customerNotice',
    ])
    expect(db.updateCalls[0]?.payload['v3/settings/customerNotice']).toEqual(NOTICE)
    expect(db.updateCalls[0]?.payloadSize).toBeLessThan(200)
    expect(await repository.readCustomerNotice()).toEqual(NOTICE)
  })

  it('reuses the cached notice while the revision is unchanged and refetches after it moves', async () => {
    const cacheStore = createMemoryPersistentCacheStore()
    const seed = {
      v3: { meta: { revisions: { settings: { customerNotice: 5 } } }, settings: { customerNotice: NOTICE } },
    }
    await createRepository(createDbStub(seed), cacheStore).readCustomerNotice()

    const warmDb = createDbStub(seed)
    expect(await createRepository(warmDb, cacheStore).readCustomerNotice()).toEqual(NOTICE)
    expect(warmDb.onceCalls).toEqual(['v3/meta/revisions/settings/customerNotice'])

    const changed = { ...NOTICE, message: '今日公休前最後點餐 20:30' }
    const changedDb = createDbStub({
      v3: { meta: { revisions: { settings: { customerNotice: 6 } } }, settings: { customerNotice: changed } },
    })
    expect(await createRepository(changedDb, cacheStore).readCustomerNotice()).toEqual(changed)
    expect(changedDb.onceCalls).toEqual(['v3/meta/revisions/settings/customerNotice', 'v3/settings/customerNotice'])
  })

  it('reads malformed stored fields as a disabled, empty notice', async () => {
    const db = createDbStub({ v3: { settings: { customerNotice: { enabled: 'yes', title: 3 } } } })

    expect(await createRepository(db).readCustomerNotice()).toEqual({ enabled: false, title: '', message: '' })
  })
})
