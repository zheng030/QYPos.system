import { authGate } from '@/shared/auth-gate'
import { toBusinessDate as toSharedBusinessDate } from '@/shared/business-day'
import { pbkdf2Hash, randomSaltBase64 } from '@/shared/password'
import { createAttendanceRecordId } from '@/shared/rtdb-entity-id'
import {
  AttendanceType,
  AVATAR_COLORS,
  bridge,
  CHECKIN_PAGE_ID,
  CHECKIN_ROOT_ID,
  DEFAULT_ADMIN,
  DEFAULT_ADMIN_PASSWORD_RECORD,
  EmployeeStatus,
  ICONS,
  runtime,
  setState,
  state,
  UserRole,
} from './store'
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

export function icon(name: string, size?: number, className?: string) {
  const svg = (ICONS as Record<string, string>)[name]
  if (!svg) return ''
  const classes = ['checkin-icon']
  if (className) classes.push(className)
  const finalSize = size || 18
  return `<svg class="${classes.join(' ')}" width="${finalSize}" height="${finalSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${svg}</svg>`
}

export function getAvatarColor(name: string) {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function renderAvatar(name: string, className?: string) {
  const safeName = name || '?'
  const initial = safeName.charAt(0)
  const color = getAvatarColor(safeName)
  const classes = ['checkin-avatar']
  if (className) classes.push(className)
  return `<div class="${classes.join(' ')}" style="background:${color}">${initial}</div>`
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

export function renderStatusBadge(status: string, empId: string, labelOverride?: string) {
  const label = labelOverride || getStatusLabel(status, empId)
  return `<span class="checkin-badge ${getStatusClass(status)}">${label}</span>`
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

export function getEmployeesArray() {
  return Object.values(state.employees || {}).sort((left, right) => left.name.localeCompare(right.name, 'zh-Hant'))
}

export function getRecordsArray() {
  return Object.values(state.records || {}).sort(
    (left, right) => (toDate(right.ts)?.getTime() || 0) - (toDate(left.ts)?.getTime() || 0)
  )
}

export function getEmployeeById(id: string | null) {
  return id && state.employees[id] ? state.employees[id] : null
}

export function isAdmin() {
  const user = getEmployeeById(state.currentUserId)
  return user && user.role === UserRole.ADMIN
}

export function hasRecordToday(empId: string) {
  const todayKey = formatDateKey(new Date())
  return getRecordsArray().some((record) => {
    if (record.eid !== empId) return false
    const date = toDate(record.ts)
    return date && formatDateKey(date) === todayKey
  })
}

export function getStatusLabel(status: string, empId: string) {
  switch (status) {
    case EmployeeStatus.WORKING:
      return '工作中'
    case EmployeeStatus.ON_BREAK:
      return '休息中'
    default:
      return hasRecordToday(empId) ? '已下班' : '未上班'
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

export function getUserRecords(empId: string) {
  const all = getRecordsArray().filter((record) => record.eid === empId)
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

export async function ensureData() {
  if (!bridge.attendance) {
    throw new Error('Attendance service is not ready')
  }
  const monthKeys = getWindowMonthKeys(state.calendarDate)
  await bridge.attendance.ensureWindow(monthKeys)
  const applySnapshot = () => {
    const snapshot = bridge.attendance?.getSnapshot()
    state.employees = normalizeEmployees(snapshot?.employees || {})
    state.records = normalizeRecords(snapshot?.records || {})
  }
  applySnapshot()
  runtime.stopAttendanceWatch?.()
  runtime.stopAttendanceWatch = bridge.attendance.watchWindow(monthKeys)
  bridge.attendance.subscribe(() => {
    applySnapshot()
    if (!state.loading) {
      runtime.render()
    }
  })
  if (!state.employees || Object.keys(state.employees).length === 0) await seedDefaultAdmin()
  state.loading = false
  runtime.render()
}

export async function seedDefaultAdmin() {
  try {
    const employee = { ...DEFAULT_ADMIN, ...DEFAULT_ADMIN_PASSWORD_RECORD }
    await bridge.attendance?.save({ [`attendanceEmployees/${employee.id}`]: employee })
  } catch (error) {
    console.warn('CheckIn: failed to seed default admin', error)
  }
}

export function ensureContainer(mountId?: string) {
  const mount = document.getElementById(mountId || 'app-container')
  if (!mount) return null
  let page = document.getElementById(CHECKIN_PAGE_ID)
  if (!page) {
    page = document.createElement('div')
    page.id = CHECKIN_PAGE_ID
    mount.appendChild(page)
  }
  if (!(page instanceof HTMLElement)) return null

  page.style.display = page.style.display || 'none'
  page.classList.add('checkin-page')

  let shell = page.querySelector('.checkin-shell')
  if (!shell) {
    shell = document.createElement('div')
    shell.className = 'checkin-shell'
    page.prepend(shell)
  }

  let backButton = shell.querySelector('[data-action="checkin-back"]')
  if (!backButton) {
    backButton = document.createElement('button')
    backButton.className = 'back btn-effect checkin-back-btn'
    backButton.setAttribute('data-action', 'checkin-back')
    backButton.textContent = '⬅ 返回主畫面'
    shell.prepend(backButton)
  }

  let root = page.querySelector(`#${CHECKIN_ROOT_ID}`)
  if (!root) {
    root = document.createElement('div')
    root.id = CHECKIN_ROOT_ID
    page.appendChild(root)
  }

  runtime.pageEl = page as HTMLElement
  runtime.rootEl = root as HTMLElement
  return page
}

export function wrapHideAll() {
  return
}

export function startClockTimer() {
  if (runtime.clockTimer) return
  runtime.clockTimer = setInterval(() => {
    const now = new Date()
    const timeEl = runtime.rootEl?.querySelector('[data-role=checkin-time]') as HTMLElement | null
    if (timeEl) timeEl.textContent = formatTime(now)
    const dateEl = runtime.rootEl?.querySelector('[data-role=checkin-date]') as HTMLElement | null
    if (dateEl) dateEl.textContent = formatDate(now)
  }, 1000)
}

export function open() {
  state.open = true
  bridge.appShell?.showPage(CHECKIN_PAGE_ID)
  const page = document.getElementById(CHECKIN_PAGE_ID)
  if (page) page.style.display = 'block'
  runtime.render()
}

export function watchAttendanceWindowScope(date = state.calendarDate) {
  const monthKeys = getWindowMonthKeys(date)
  runtime.stopAttendanceWatch?.()
  runtime.stopAttendanceWatch = bridge.attendance?.watchWindow(monthKeys) || null
}

export function watchAttendanceFullHistoryScope() {
  runtime.stopAttendanceWatch?.()
  runtime.stopAttendanceWatch = bridge.attendance?.watchFullHistory() || null
}

export function stopAttendanceScopeWatch() {
  runtime.stopAttendanceWatch?.()
  runtime.stopAttendanceWatch = null
}

export function logout() {
  setState({
    currentUserId: null,
    currentView: 'clock',
    loginEmployeeId: null,
    loginError: '',
    passwordError: '',
    dashboardEmployeeId: null,
    reportEmployeeId: 'all',
    employeeSearch: '',
  })
}
