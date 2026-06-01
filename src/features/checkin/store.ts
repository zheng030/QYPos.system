import type { AppShellService } from '@/shared/app-shell-service'
import type { AttendanceEmployeesMap, AttendanceRecordsMap, AttendanceService } from '@/shared/attendance-service'
import { BUSINESS_DAY_SHIFT_HOURS as SHARED_BUSINESS_DAY_SHIFT_HOURS } from '@/shared/business-day'

import type { CheckinModalState } from './types'

export const bridge: {
  attendance: AttendanceService | null
  appShell: AppShellService | null
} = {
  attendance: null,
  appShell: null,
}

export function initBridge({ attendance, appShell }: { attendance: AttendanceService; appShell: AppShellService }) {
  bridge.attendance = attendance
  bridge.appShell = appShell
}

export const CHECKIN_PAGE_ID = 'checkinPage'
export const CHECKIN_ROOT_ID = 'checkin-root'
export const CHECKIN_ROOTS = ['attendanceEmployees', 'attendanceRecords']
export const BUSINESS_DAY_SHIFT_HOURS = SHARED_BUSINESS_DAY_SHIFT_HOURS

export const UserRole = {
  ADMIN: 'ADMIN',
  EMPLOYEE: 'EMPLOYEE',
} as const

export const EmployeeStatus = {
  WORKING: 'WORKING',
  ON_BREAK: 'ON_BREAK',
  OFF_DUTY: 'OFF_DUTY',
} as const

export const AttendanceType = {
  CLOCK_IN: 'CLOCK_IN',
  CLOCK_OUT: 'CLOCK_OUT',
  BREAK_START: 'BREAK_START',
  BREAK_END: 'BREAK_END',
} as const

export const DEFAULT_ADMIN = {
  id: 'emp_admin',
  name: '管理員',
  role: UserRole.ADMIN,
  status: EmployeeStatus.OFF_DUTY,
}

export const DEFAULT_ADMIN_PASSWORD_RECORD = {
  passwordSalt: 'c2VlZC1kZWZhdWx0LWFkbWlu',
  passwordHash: 'dt9Ugup4GDkiT6z6rb9WzteDtCDEWW6ZaGI9HvjwMdk=',
}

export const AVATAR_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
]

export const ICONS = {
  layout: `<rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" />`,
  user: `<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />`,
  clock: `<circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />`,
  'file-bar': `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M8 13v5" /><path d="M12 11v7" /><path d="M16 15v3" />`,
  users: `<path d="M17 21v-2a4 4 0 0 0-3-3.87" /><path d="M7 21v-2a4 4 0 0 1 3-3.87" /><circle cx="9" cy="7" r="4" /><circle cx="17" cy="9" r="3" />`,
  lock: `<rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />`,
  logout: `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />`,
  login: `<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />`,
  play: `<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />`,
  square: `<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" stroke="currentColor" />`,
  coffee: `<path d="M17 8h1a4 4 0 1 1 0 8h-1" /><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" /><line x1="6" y1="2" x2="6" y2="4" /><line x1="10" y1="2" x2="10" y2="4" /><line x1="14" y1="2" x2="14" y2="4" />`,
  briefcase: `<rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><path d="M2 13h20" />`,
  calendar: `<rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />`,
  download: `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />`,
  filter: `<path d="M22 3H2l8 9v7l4 2v-9l8-9z" />`,
  edit: `<path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />`,
  save: `<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />`,
  close: `<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />`,
  trash: `<polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />`,
  plus: `<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />`,
  search: `<circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />`,
  check: `<polyline points="20 6 9 17 4 12" />`,
  alert: `<circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />`,
  'chevron-down': `<polyline points="6 9 12 15 18 9" />`,
  'chevron-left': `<polyline points="15 18 9 12 15 6" />`,
  'chevron-right': `<polyline points="9 18 15 12 9 6" />`,
  'arrow-left': `<line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />`,
  'arrow-right': `<line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />`,
  activity: `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />`,
  'bar-chart': `<line x1="6" y1="20" x2="6" y2="16" /><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="2" y1="20" x2="22" y2="20" />`,
  list: `<line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" />`,
}

export const state = {
  initialized: false,
  open: false,
  loading: true,
  employees: {} as AttendanceEmployeesMap,
  records: {} as AttendanceRecordsMap,
  currentUserId: null as string | null,
  currentView: 'clock',
  loginEmployeeId: null as string | null,
  loginError: '',
  passwordError: '',
  dashboardEmployeeId: null as string | null,
  viewMode: 'list',
  chartMode: 'week',
  calendarDate: new Date(),
  reportFilterType: 'all',
  reportEmployeeId: 'all',
  employeeSearch: '',
  modal: null as CheckinModalState,
}

export const runtime = {
  pageEl: null as HTMLElement | null,
  rootEl: null as HTMLElement | null,
  clockTimer: null as ReturnType<typeof setInterval> | null,
  stopAttendanceWatch: null as (() => void) | null,
  focusEmployeeSearch: false,
  isEmployeeSearchComposing: false,
  chartTooltipEl: null as HTMLElement | null,
  render: () => {},
}

export function setRender(renderFn: () => void) {
  runtime.render = renderFn
}

export function setState(patch: Partial<typeof state>) {
  Object.assign(state, patch)
  runtime.render()
}
