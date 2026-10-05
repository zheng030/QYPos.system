import { authGate } from '@/shared/auth-gate'
import { toBusinessDate as toSharedBusinessDate } from '@/shared/business-day'
import { pbkdf2Hash, randomSaltBase64 } from '@/shared/password'
import { createAttendanceRecordId } from '@/shared/rtdb-entity-id'
import { AttendanceType, AVATAR_COLORS, type CheckinIconName, EmployeeStatus, UserRole } from './constants'
import type { AttendanceEmployee, AttendanceEmployeesMap, AttendanceRecord, AttendanceRecordsMap } from './types'

function padMonth(value: number) {
  return String(value).padStart(2, '0')
}

export function toAttendanceMonthKey(date: Date | string | number) {
  const nextDate = toSharedBusinessDate(date)
  return `${nextDate.getFullYear()}-${padMonth(nextDate.getMonth() + 1)}`
}

export function getWindowMonthKeys(anchor = new Date()) {
  const current = toSharedBusinessDate(anchor)
  const previous = new Date(current)
  previous.setMonth(previous.getMonth() - 1)
  return [toAttendanceMonthKey(previous), toAttendanceMonthKey(current)]
}

export async function makePasswordRecord(password: string) {
  const salt = randomSaltBase64(16)
  const hash = await pbkdf2Hash(password, salt)
  return { passwordHash: hash, passwordSalt: salt }
}

export async function verifyPassword(password: string, employee: AttendanceEmployee | null) {
  return authGate.verifyEmployeeLogin(password, employee)
}

export async function verifyPasswordChangeCurrent(password: string, employee: AttendanceEmployee | null) {
  return authGate.verifyEmployeePasswordChange(password, employee)
}

export function getAuthNotice() {
  return authGate.getDevBypassNotice()
}

export function getAvatarColor(name: string) {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function getRoleLabel(role: string) {
  return role === UserRole.ADMIN ? '管理員' : '員工'
}

export function getStatusClass(status: string) {
  switch (status) {
    case EmployeeStatus.WORKING:
      return 'checkin-badge--working'
    case EmployeeStatus.ON_BREAK:
      return 'checkin-badge--break'
    default:
      return 'checkin-badge--off'
  }
}

export function getStatusDotClass(status: string) {
  switch (status) {
    case EmployeeStatus.WORKING:
      return 'is-working'
    case EmployeeStatus.ON_BREAK:
      return 'is-break'
    default:
      return 'is-off'
  }
}

export function getStatusDotVariant(status: string) {
  switch (status) {
    case EmployeeStatus.WORKING:
      return 'checkin-dot--green'
    case EmployeeStatus.ON_BREAK:
      return 'checkin-dot--orange'
    default:
      return 'checkin-dot--slate'
  }
}

export function getRecordMeta(type: string) {
  switch (type) {
    case AttendanceType.CLOCK_IN:
      return {
        tagClass: 'checkin-tag checkin-tag--brand',
        dotClass: 'checkin-dot checkin-dot--brand',
        textClass: 'checkin-text--brand',
        logDotClass: 'checkin-dot--brand',
      }
    case AttendanceType.CLOCK_OUT:
      return {
        tagClass: 'checkin-tag checkin-tag--slate',
        dotClass: 'checkin-dot checkin-dot--slate',
        textClass: 'checkin-text--slate',
        logDotClass: 'checkin-dot--slate',
      }
    case AttendanceType.BREAK_START:
      return {
        tagClass: 'checkin-tag checkin-tag--orange',
        dotClass: 'checkin-dot checkin-dot--orange',
        textClass: 'checkin-text--orange',
        logDotClass: 'checkin-dot--orange',
      }
    case AttendanceType.BREAK_END:
      return {
        tagClass: 'checkin-tag checkin-tag--green',
        dotClass: 'checkin-dot checkin-dot--green',
        textClass: 'checkin-text--green',
        logDotClass: 'checkin-dot--green',
      }
    default:
      return {
        tagClass: 'checkin-tag checkin-tag--slate',
        dotClass: 'checkin-dot checkin-dot--slate',
        textClass: 'checkin-text--slate',
        logDotClass: 'checkin-dot--slate',
      }
  }
}

export function toDate(value: unknown) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatTime(date: Date | null) {
  if (!date) return '--:--:--'
  return date.toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatShortTime(date: Date | null) {
  if (!date) return '--:--'
  return date.toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function toBusinessDate(date: Date | string | number) {
  return toSharedBusinessDate(date)
}

export function formatDate(date: Date | string | number) {
  return toBusinessDate(date).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

export function formatBusinessDateOnly(date: Date | string | number) {
  return toBusinessDate(date).toLocaleDateString('zh-TW')
}

export function formatDateKey(date: Date | string | number) {
  const shifted = toSharedBusinessDate(date)
  return shifted.toDateString()
}

export function formatDateInput(date: Date | string | number) {
  const nextDate = toDate(date)
  if (!nextDate) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-${pad(nextDate.getDate())}T${pad(nextDate.getHours())}:${pad(nextDate.getMinutes())}`
}

export function normalizeEmployees(data: unknown): AttendanceEmployeesMap {
  if (!data) return {}
  if (Array.isArray(data)) {
    const map: AttendanceEmployeesMap = {}
    data.forEach((employee) => {
      if (employee && typeof employee === 'object' && 'id' in employee) {
        const typedEmployee = employee as AttendanceEmployee
        if (typedEmployee.id) map[typedEmployee.id] = typedEmployee
      }
    })
    return map
  }
  return data as AttendanceEmployeesMap
}

export function normalizeRecords(data: unknown): AttendanceRecordsMap {
  if (!data) return {}
  if (Array.isArray(data)) {
    const map: AttendanceRecordsMap = {}
    data.forEach((record) => {
      if (record && typeof record === 'object' && 'id' in record) {
        const typedRecord = record as AttendanceRecord
        if (typedRecord.id) map[typedRecord.id] = typedRecord
      }
    })
    return map
  }
  return data as AttendanceRecordsMap
}

export function sortEmployees(employees: AttendanceEmployeesMap) {
  return Object.values(employees).sort((left, right) => left.name.localeCompare(right.name, 'zh-Hant'))
}

export function sortRecords(records: AttendanceRecordsMap) {
  return Object.values(records).sort(
    (left, right) => (toDate(right.ts)?.getTime() || 0) - (toDate(left.ts)?.getTime() || 0)
  )
}

export function hasRecordToday(records: AttendanceRecord[], empId: string) {
  const todayKey = formatDateKey(new Date())
  return records.some((record) => {
    if (record.eid !== empId) return false
    const date = toDate(record.ts)
    return date && formatDateKey(date) === todayKey
  })
}

export function getStatusLabel(status: string, empId: string, records: AttendanceRecord[]) {
  switch (status) {
    case EmployeeStatus.WORKING:
      return '工作中'
    case EmployeeStatus.ON_BREAK:
      return '休息中'
    default:
      return hasRecordToday(records, empId) ? '已下班' : '未上班'
  }
}

export function getRecordLabel(type: string) {
  switch (type) {
    case AttendanceType.CLOCK_IN:
      return '上班'
    case AttendanceType.CLOCK_OUT:
      return '下班'
    case AttendanceType.BREAK_START:
      return '開始休息'
    case AttendanceType.BREAK_END:
      return '結束休息'
    default:
      return type
  }
}

export function calculateWorkHours(records: AttendanceRecord[], now?: Date) {
  if (!records || records.length === 0) return 0
  const sorted = [...records].sort(
    (left, right) => (toDate(left.ts)?.getTime() || 0) - (toDate(right.ts)?.getTime() || 0)
  )
  let totalMs = 0
  let workStart: number | null = null
  sorted.forEach((record) => {
    if (record.type === AttendanceType.CLOCK_IN || record.type === AttendanceType.BREAK_END) {
      if (workStart === null) workStart = toDate(record.ts)?.getTime() || null
    } else if (record.type === AttendanceType.CLOCK_OUT || record.type === AttendanceType.BREAK_START) {
      if (workStart !== null) {
        totalMs += (toDate(record.ts)?.getTime() || 0) - workStart
        workStart = null
      }
    }
  })
  const lastRecord = sorted[sorted.length - 1]
  const isWorking =
    lastRecord && (lastRecord.type === AttendanceType.CLOCK_IN || lastRecord.type === AttendanceType.BREAK_END)
  if (isWorking && workStart !== null) totalMs += (now ? now.getTime() : Date.now()) - workStart
  return Number((totalMs / (1000 * 60 * 60)).toFixed(1))
}

export function getUserRecords(records: AttendanceRecord[], empId: string) {
  const all = records.filter((record) => record.eid === empId)
  const todayKey = formatDateKey(new Date())
  const todayRecords = all.filter((record) => {
    const date = toDate(record.ts)
    return date && formatDateKey(date) === todayKey
  })
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
  const weeklyRecords = all.filter((record) => {
    const date = toDate(record.ts)
    return date && date >= oneWeekAgo
  })
  return { todayRecords, weeklyRecords }
}

export function groupRecordsByDay(records: AttendanceRecord[]) {
  const grouped: Record<
    string,
    {
      date: Date
      records: AttendanceRecord[]
      sessions: Array<{ start: Date; end: Date | null; duration: number; type: 'WORK' }>
      totalHours: number
    }
  > = {}
  records.forEach((record) => {
    const dateObj = toDate(record.ts)
    if (!dateObj) return
    const businessDate = toSharedBusinessDate(dateObj)
    const key = businessDate.toDateString()
    if (!grouped[key]) {
      grouped[key] = { date: new Date(businessDate), records: [], sessions: [], totalHours: 0 }
    }
    grouped[key].records.push(record)
  })
  Object.values(grouped).forEach((day) => {
    const sorted = [...day.records].sort(
      (left, right) => (toDate(left.ts)?.getTime() || 0) - (toDate(right.ts)?.getTime() || 0)
    )
    let workStart: number | null = null
    let dailyMs = 0
    sorted.forEach((record) => {
      const ts = toDate(record.ts)?.getTime() || 0
      if (record.type === AttendanceType.CLOCK_IN || record.type === AttendanceType.BREAK_END) {
        if (workStart === null) workStart = ts
      } else if (record.type === AttendanceType.CLOCK_OUT || record.type === AttendanceType.BREAK_START) {
        if (workStart !== null) {
          const duration = ts - workStart
          dailyMs += duration
          day.sessions.push({ start: new Date(workStart), end: new Date(ts), duration, type: 'WORK' })
          workStart = null
        }
      }
    })
    const isToday = formatDateKey(new Date()) === formatDateKey(day.date)
    if (isToday && workStart !== null) {
      const duration = Date.now() - workStart
      dailyMs += duration
      day.sessions.push({ start: new Date(workStart), end: null, duration, type: 'WORK' })
    }
    day.totalHours = Number((dailyMs / (1000 * 60 * 60)).toFixed(1))
    day.sessions.sort((left, right) => left.start.getTime() - right.start.getTime())
    day.records.sort((left, right) => (toDate(right.ts)?.getTime() || 0) - (toDate(left.ts)?.getTime() || 0))
  })
  return Object.values(grouped).sort((left, right) => right.date.getTime() - left.date.getTime())
}

export function getNextRecordId() {
  return createAttendanceRecordId()
}

export function getNextEmployeeId(employees: AttendanceEmployeesMap) {
  let maxId = 0
  for (const existingId of Object.keys(employees)) {
    const match = /^emp_(\d+)$/.exec(existingId)
    if (match) maxId = Math.max(maxId, Number(match[1]))
  }
  return `emp_${maxId + 1}`
}

export type DailyRecordGroup = ReturnType<typeof groupRecordsByDay>[number]

function averageClockedHours(employees: AttendanceEmployee[], records: AttendanceRecord[], days: number) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const validRecords = records.filter((record) => {
    const date = toDate(record.ts)
    return date && date >= cutoff
  })
  let totalMs = 0
  for (const employee of employees) {
    const employeeRecords = validRecords
      .filter((record) => record.eid === employee.id)
      .sort((left, right) => (toDate(left.ts)?.getTime() || 0) - (toDate(right.ts)?.getTime() || 0))
    let start: number | null = null
    for (const record of employeeRecords) {
      if (record.type === AttendanceType.CLOCK_IN) start = toDate(record.ts)?.getTime() || null
      if (record.type === AttendanceType.CLOCK_OUT && start !== null) {
        totalMs += (toDate(record.ts)?.getTime() || 0) - start
        start = null
      }
    }
  }
  const employeeDays = new Set<string>()
  for (const record of validRecords) {
    const date = toDate(record.ts)
    if (date) employeeDays.add(`${record.eid}_${formatDateKey(date)}`)
  }
  return employeeDays.size > 0 ? (totalMs / (1000 * 60 * 60) / employeeDays.size).toFixed(1) : '0.0'
}

export type DashboardCard = { label: string; value: string | number; icon: CheckinIconName; variant: string }

export function buildAdminDashboard(employees: AttendanceEmployee[], records: AttendanceRecord[]) {
  const todayKey = formatDateKey(new Date())
  const employeesWithRecords = new Set(
    records
      .filter((record) => {
        const date = toDate(record.ts)
        return date && formatDateKey(date) === todayKey
      })
      .map((record) => record.eid)
  )
  let working = 0
  let onBreak = 0
  let clockedOut = 0
  let notClockedIn = 0
  for (const employee of employees) {
    if (employee.status === EmployeeStatus.WORKING) working += 1
    else if (employee.status === EmployeeStatus.ON_BREAK) onBreak += 1
    else if (employeesWithRecords.has(employee.id)) clockedOut += 1
    else notClockedIn += 1
  }
  const statCards: DashboardCard[] = [
    { label: '總員工數', value: employees.length, icon: 'users', variant: 'blue' },
    {
      label: '平均工時 (7天)',
      value: `${averageClockedHours(employees, records, 7)} hr`,
      icon: 'clock',
      variant: 'purple',
    },
    {
      label: '平均工時 (30天)',
      value: `${averageClockedHours(employees, records, 30)} hr`,
      icon: 'calendar',
      variant: 'purple',
    },
  ]
  const statusCards: DashboardCard[] = [
    { label: '未上班', value: notClockedIn, icon: 'login', variant: 'slate' },
    { label: '工作中', value: working, icon: 'briefcase', variant: 'green' },
    { label: '休息中', value: onBreak, icon: 'coffee', variant: 'orange' },
    { label: '已下班', value: clockedOut, icon: 'logout', variant: 'slate' },
  ]
  return { statCards, statusCards, recent: records.slice(0, 10) }
}

export function buildWorkHoursChart(dailyData: DailyRecordGroup[], chartMode: 'week' | 'month') {
  const now = new Date()
  const range = chartMode === 'week' ? 7 : 30
  const bars = Array.from({ length: range }, (_, offset) => {
    const date = new Date(now)
    date.setDate(date.getDate() - (range - 1 - offset))
    const key = formatDateKey(date)
    const businessDate = toBusinessDate(date)
    const found = dailyData.find((item) => formatDateKey(item.date) === key)
    return {
      label:
        chartMode === 'week'
          ? businessDate.toLocaleDateString('zh-TW', { weekday: 'short' })
          : `${businessDate.getMonth() + 1}/${businessDate.getDate()}`,
      hours: found ? found.totalHours : 0,
      date: businessDate.toLocaleDateString('zh-TW'),
    }
  })
  const maxHours = Math.max(1, ...bars.map((bar) => bar.hours))
  return bars.map((bar) => ({ ...bar, heightPercent: (bar.hours / maxHours) * 100 }))
}

export function buildAttendanceCalendar(calendarDate: Date, dailyData: DailyRecordGroup[]) {
  const year = calendarDate.getFullYear()
  const month = calendarDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = toBusinessDate(new Date())
  return {
    title: `${year} 年 ${month + 1} 月`,
    leadingBlanks: firstDay,
    days: Array.from({ length: daysInMonth }, (_, index) => {
      const date = new Date(year, month, index + 1)
      const dayData = dailyData.find((item) => item.date.toDateString() === date.toDateString())
      return {
        day: index + 1,
        isToday: date.toDateString() === today.toDateString(),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
        hours: dayData ? dayData.totalHours : null,
      }
    }),
  }
}

export function buildAttendanceCsv(records: AttendanceRecord[], employees: AttendanceEmployeesMap) {
  const header = ['員工', '員工ID', '日期', '時間', '類型', '備註']
  const rows = records.map((record) => {
    const employee = employees[record.eid]
    const date = toDate(record.ts)
    return [
      employee ? employee.name : '',
      record.eid || '',
      date ? formatBusinessDateOnly(date) : '',
      date ? formatShortTime(date) : '',
      getRecordLabel(record.type),
      record.notes || '',
    ]
  })
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
}
