import { describe, expect, it } from 'vitest'

import { getBusinessDate, getDeltaItems, getItemSignature, getMergedItems } from '@/shared/order-utils'

describe('order-utils', () => {
  it('builds a stable item signature', () => {
    expect(
      getItemSignature({
        name: '高球',
        price: 250,
        isTreat: false,
        batchIdx: 1,
        batchId: 3,
        sentAt: 123,
        incomingIdx: 2,
        isSent: true,
      })
    ).toBe('高球||250||||0||1||3||123||2||1')
  })

  it('merges the same cart rows but keeps sent-state boundaries', () => {
    expect(
      getMergedItems([
        { name: '高球', price: 250, isSent: false },
        { name: '高球', price: 250, isSent: false },
        { name: '高球', price: 250, isSent: true },
      ])
    ).toEqual([
      { name: '高球', price: 250, isSent: false, count: 2 },
      { name: '高球', price: 250, isSent: true, count: 1 },
    ])
  })

  it('finds only newly added cart rows', () => {
    expect(
      getDeltaItems(
        [
          { name: '高球', price: 250 },
          { name: '高球', price: 250 },
          { name: '米血', price: 25 },
        ],
        [{ name: '高球', price: 250 }]
      )
    ).toEqual([
      { name: '高球', price: 250 },
      { name: '米血', price: 25 },
    ])
  })

  it('uses the previous day before 05:00', () => {
    const beforeFive = new Date('2026-05-26T04:59:00+08:00')
    const afterFive = new Date('2026-05-26T05:01:00+08:00')
    const expectedBeforeFive = new Date('2026-05-25T00:00:00+08:00').getTime()
    const expectedAfterFive = new Date('2026-05-26T00:00:00+08:00').getTime()

    expect(getBusinessDate(beforeFive)).toBe(expectedBeforeFive)
    expect(getBusinessDate(afterFive)).toBe(expectedAfterFive)
  })
})
