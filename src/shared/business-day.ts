function pad(value: number) {
  return String(value).padStart(2, '0')
}

export const BUSINESS_DAY_START_HOUR = 5
export const BUSINESS_DAY_SHIFT_HOURS = BUSINESS_DAY_START_HOUR

export function toBusinessDate(value: Date | string | number) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${String(value)}`)
  }
  date.setHours(date.getHours() - BUSINESS_DAY_SHIFT_HOURS)
  return date
}

export function getBusinessDateKey(value: Date | string | number) {
  const date = toBusinessDate(value)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function getBusinessDayRange(value: Date | string | number) {
  const businessDate = toBusinessDate(value)
  const start = new Date(
    businessDate.getFullYear(),
    businessDate.getMonth(),
    businessDate.getDate(),
    BUSINESS_DAY_START_HOUR,
    0,
    0,
    0
  )
  const endExclusive = new Date(start)
  endExclusive.setDate(endExclusive.getDate() + 1)
  return { start, endExclusive }
}

export function getBusinessWeekRange(value: Date | string | number) {
  const businessDate = toBusinessDate(value)
  const isoDay = businessDate.getDay() || 7
  const firstBusinessDay = new Date(businessDate)
  firstBusinessDay.setDate(firstBusinessDay.getDate() - (isoDay - 1))
  const start = new Date(
    firstBusinessDay.getFullYear(),
    firstBusinessDay.getMonth(),
    firstBusinessDay.getDate(),
    BUSINESS_DAY_START_HOUR,
    0,
    0,
    0
  )
  const endExclusive = new Date(start)
  endExclusive.setDate(endExclusive.getDate() + 7)
  return { start, endExclusive }
}

export function getBusinessMonthRange(value: Date | string | number) {
  const businessDate = toBusinessDate(value)
  const start = new Date(businessDate.getFullYear(), businessDate.getMonth(), 1, BUSINESS_DAY_START_HOUR, 0, 0, 0)
  const endExclusive = new Date(start)
  endExclusive.setMonth(endExclusive.getMonth() + 1)
  return { start, endExclusive }
}

export function toBusinessDateStartTimestamp(value: Date | string | number) {
  const businessDate = toBusinessDate(value)
  businessDate.setHours(0, 0, 0, 0)
  return businessDate.getTime()
}
