import { describe, expect, it } from 'vitest'

import type { PosCustomerNotice } from '@/features/pos-kernel/types'

import { createCustomerNoticeGate } from './customer-notice-gate'

const NOTICE: PosCustomerNotice = { enabled: true, title: '用餐須知', message: '用餐時間 90 分鐘' }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

describe('customer notice gate', () => {
  it('covers the menu while reading, then shows an enabled notice until confirmed', async () => {
    const read = deferred<PosCustomerNotice | null>()
    const gate = createCustomerNoticeGate(() => read.promise)

    const opening = gate.openForCustomer()
    expect(gate.state).toEqual({ open: true, notice: null })

    read.resolve(NOTICE)
    await opening
    expect(gate.state).toEqual({ open: true, notice: NOTICE })

    gate.confirm()
    expect(gate.state).toEqual({ open: false, notice: null })
  })

  it.each([
    ['never saved', null],
    ['turned off', { ...NOTICE, enabled: false }],
    ['left blank', { enabled: true, title: ' ', message: '\n' }],
  ])('lets customers straight into the menu when the notice is %s', async (_label, notice) => {
    const gate = createCustomerNoticeGate(async () => notice)

    await gate.openForCustomer()

    expect(gate.state).toEqual({ open: false, notice: null })
  })

  it('does not lock customers out when the notice cannot be read', async () => {
    const gate = createCustomerNoticeGate(async () => {
      throw new Error('offline')
    })

    await gate.openForCustomer()

    expect(gate.state.open).toBe(false)
  })

  it('previews a draft without reading the saved notice', () => {
    const gate = createCustomerNoticeGate(() => Promise.reject(new Error('unused')))

    gate.preview({ ...NOTICE, enabled: false })

    expect(gate.state).toEqual({ open: true, notice: { ...NOTICE, enabled: false } })
  })
})
