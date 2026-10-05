// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPosKernel } from '@/features/pos-kernel/runtime'
import { createBuilderState, finalizeBuilderEntry, updateBuilderSelection } from '@/features/pos-sales/builder'
import { createDbStub, setAtPath } from './rtdb-v3-repository.test-support'
import { encodeCatalogKey } from './rtdb-v3-repository-context'
import { createPosDataService } from './runtime'

vi.mock('@/shared/firebase-compat', () => import('@/app/firebase-compat.test-support'))

beforeEach(() => localStorage.clear())

function setup() {
  const db = createDbStub({})
  const kernel = createPosKernel()
  kernel.db = db as never
  return { db, kernel, data: createPosDataService(kernel) }
}

function drinkEntry(kernel: ReturnType<typeof createPosKernel>, temperature: 'hot' | 'ice', bundled = false) {
  let state = createBuilderState(bundled ? 'brunch.garden-chicken-leg' : 'drink.latte', 'customer-draft')
  if (bundled) {
    state = updateBuilderSelection(state, 'upgrade', 'bundle-drink-upgrade', 'latte')
    state = updateBuilderSelection(state, 'include', 'included-drink', temperature, 'temperature')
  } else {
    state = updateBuilderSelection(state, 'main', 'temperature', temperature)
  }
  const result = finalizeBuilderEntry({ state, helpers: kernel.helpers, source: 'customer', status: 'draft' })
  if (!result.ok) throw new Error('Expected valid drink entry')
  return result.entry
}

describe('submission availability', () => {
  it.each([
    ['customer', 'hot', false],
    ['staff', 'hot', false],
    ['customer', 'ice', true],
    ['staff', 'hot', true],
  ] as const)('blocks %s %s drinks (bundled: %s) and permits submission after reopening', async (mode, temperature, bundled) => {
    const { db, kernel, data } = setup()
    const entries = [drinkEntry(kernel, temperature, bundled)]
    if (mode === 'customer') await data.saveCustomerDraft('01桌', entries, {})
    else await data.saveStaffDraft('01桌', entries)
    const snapshot = structuredClone(entries)
    const savedDraft = structuredClone(
      mode === 'customer' ? kernel.state.tableDrafts['01桌'] : kernel.state.staffDrafts['01桌']
    )
    await data.ensureInventory()
    const inventoryPath = `v3/catalog/inventory/${encodeCatalogKey(`drink-temperature.${temperature}`)}`
    setAtPath(db.data, inventoryPath, false)
    setAtPath(db.data, 'v3/meta/revisions/catalog/inventory', 10)
    const writes = db.updateCalls.length
    const transactions = db.transactionCalls.length
    const submit = () =>
      mode === 'customer' ? data.submitCustomerDraft('01桌', entries, {}) : data.createStaffBatch('01桌', entries)
    await expect(submit()).rejects.toThrow(`拿鐵（${temperature === 'hot' ? '熱飲' : '冷飲'}）`)
    expect(db.updateCalls).toHaveLength(writes)
    expect(db.transactionCalls).toHaveLength(transactions)
    expect(entries).toEqual(snapshot)
    expect(mode === 'customer' ? kernel.state.tableDrafts['01桌'] : kernel.state.staffDrafts['01桌']).toEqual(
      savedDraft
    )
    setAtPath(db.data, inventoryPath, true)
    setAtPath(db.data, 'v3/meta/revisions/catalog/inventory', 11)
    const batch = await submit()
    expect(batch.entries[0]?.lines.map((line) => [line.displayName, line.unitPrice])).toEqual(
      snapshot[0]?.lines.map((line) => [line.displayName, line.unitPrice])
    )
  })

  it('reads only the inventory revision unless inventory changed, without refreshing prices or costs', async () => {
    const { db, kernel, data } = setup()
    const entry = drinkEntry(kernel, 'hot')
    await data.ensureInventory()
    db.onceCalls.length = 0
    await data.ensureInventory()
    expect(db.onceCalls).toEqual(['v3/meta/revisions/catalog/inventory'])
    setAtPath(db.data, 'v3/meta/revisions/catalog/inventory', 1)
    setAtPath(db.data, `v3/catalog/inventory/${encodeCatalogKey('drink-temperature.hot')}`, false)
    db.onceCalls.length = 0
    await expect(data.createStaffBatch('01桌', [entry])).rejects.toThrow('暫停供應')
    expect(db.onceCalls).toEqual(['v3/meta/revisions/catalog/inventory', 'v3/catalog/inventory'])
  })

  it('blocks the whole batch and lists standalone and default included drinks together', async () => {
    const { db, kernel, data } = setup()
    const state = updateBuilderSelection(
      createBuilderState('brunch.garden-chicken-leg', 'customer-draft'),
      'upgrade',
      'bundle-drink-upgrade',
      'black-tea'
    )
    const result = finalizeBuilderEntry({ state, helpers: kernel.helpers, source: 'customer', status: 'draft' })
    if (!result.ok) throw new Error('Expected valid included drink')
    const includedDrink = result.entry.lines.find((line) => line.role === 'included')
    expect(includedDrink?.selections?.temperature).toBe('ice')
    const entries = [drinkEntry(kernel, 'hot'), result.entry]
    await data.toggleInventoryBatch({ 'drink-temperature.hot': false, 'drink-temperature.ice': false })
    const writes = db.updateCalls.length
    await expect(data.submitCustomerDraft('01桌', entries, {})).rejects.toThrow(
      `拿鐵（熱飲）、${includedDrink?.shortName}（冷飲）`
    )
    expect(db.updateCalls).toHaveLength(writes)
    expect(db.transactionCalls).toHaveLength(0)
  })

  it('blocks writes when inventory cannot be verified and preserves the saved draft', async () => {
    const { db, kernel, data } = setup()
    const entries = [drinkEntry(kernel, 'hot')]
    await data.saveStaffDraft('01桌', entries)
    const savedDraft = structuredClone(kernel.state.staffDrafts['01桌'])
    const writes = db.updateCalls.length
    const ref = db.ref.bind(db)
    vi.spyOn(db, 'ref').mockImplementation((path) => {
      const result = ref(path)
      if (path === 'v3/meta/revisions/catalog/inventory')
        result.once = async () => {
          throw new Error('offline')
        }
      return result
    })
    await expect(data.createStaffBatch('01桌', entries)).rejects.toThrow('offline')
    expect(db.updateCalls).toHaveLength(writes)
    expect(kernel.state.staffDrafts['01桌']).toEqual(savedDraft)
  })
})
