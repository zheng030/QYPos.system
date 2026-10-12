import { describe, expect, it, vi } from 'vitest'
import { createRtdbV3Repository } from './rtdb-v3-repository'
import { createDbStub, createEntry, createState, readAtPath } from './rtdb-v3-repository.test-support'

const table = '外帶2'

describe('idle table cleanup', () => {
  it('clears customer info, timer and an abandoned QR cart, so the next order gets a fresh display seq', async () => {
    const db = createDbStub({})
    const state = createState()
    const repository = createRtdbV3Repository({ db: db as never, state })
    const { displaySeqBase } = await repository.saveCustomerDraft(table, [createEntry()], { name: '客人', phone: '' })

    await repository.resetEmptyTable(table)
    expect(readAtPath(db.data, `v3/live/tables/${table}`)).toBeUndefined()
    expect(state.tableTimers[table]).toBeUndefined()
    expect(state.tableCustomers[table]).toBeUndefined()
    expect(state.tableDrafts[table]).toBeUndefined()

    const batch = await repository.createStaffBatch(table, [createEntry()], { name: '', phone: '' })
    expect(batch.requestLabel).toBe(`#${displaySeqBase + 1}-1`)
  })

  it('refuses to clear a table with accepted orders', async () => {
    const db = createDbStub({})
    const state = createState()
    const repository = createRtdbV3Repository({ db: db as never, state })
    await repository.createStaffBatch(table, [createEntry()], { name: '客人', phone: '' })
    await expect(repository.resetEmptyTable(table)).rejects.toThrow('桌位仍有訂單')
  })

  it('clears an order-free table left over from an earlier business day when it is opened', async () => {
    const db = createDbStub({})
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-10-11T20:00:00+08:00'))
      await createRtdbV3Repository({ db: db as never, state: createState() }).updateTableCustomer('A1', {
        name: '昨天客人',
        phone: '',
      })

      vi.setSystemTime(new Date('2026-10-12T12:00:00+08:00'))
      const state = createState()
      const repository = createRtdbV3Repository({ db: db as never, state })
      await repository.startTableLiveSession('staff', 'A1')
      expect(state.tableCustomers.A1).toBeUndefined()

      const a1 = await repository.createStaffBatch('A1', [createEntry()], { name: '', phone: '' })
      const b1 = await repository.createStaffBatch('B1', [createEntry()], { name: '', phone: '' })
      expect(a1.requestLabel).not.toBe(b1.requestLabel)
    } finally {
      vi.useRealTimers()
    }
  })
})
