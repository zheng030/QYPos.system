import { describe, expect, it } from 'vitest'

import { getBusinessDateKey, getBusinessDayRange, getBusinessMonthRange, toBusinessDate } from './business-day'

describe('business-day', () => {
  it('maps timestamps before 05:00 to the previous business date', () => {
    const businessDate = toBusinessDate('2026-05-31T02:30:00+08:00')

    expect(getBusinessDateKey('2026-05-31T02:30:00+08:00')).toBe('2026-05-30')
    expect(businessDate.getFullYear()).toBe(2026)
    expect(businessDate.getMonth()).toBe(4)
    expect(businessDate.getDate()).toBe(30)
  })

  it('returns a day range anchored at 05:00 for the resolved business day', () => {
    const earlyMorningRange = getBusinessDayRange('2026-05-31T02:30:00+08:00')
    const openingRange = getBusinessDayRange('2026-05-31T05:00:00+08:00')

    expect(earlyMorningRange.start.getTime()).toBe(new Date('2026-05-30T05:00:00+08:00').getTime())
    expect(earlyMorningRange.endExclusive.getTime()).toBe(new Date('2026-05-31T05:00:00+08:00').getTime())
    expect(openingRange.start.getTime()).toBe(new Date('2026-05-31T05:00:00+08:00').getTime())
  })

  it('builds business-month ranges from the resolved business date', () => {
    const monthRange = getBusinessMonthRange('2026-06-01T02:30:00+08:00')

    expect(monthRange.start.getTime()).toBe(new Date('2026-05-01T05:00:00+08:00').getTime())
    expect(monthRange.endExclusive.getTime()).toBe(new Date('2026-06-01T05:00:00+08:00').getTime())
  })
})
