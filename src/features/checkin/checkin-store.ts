import { computed, reactive, shallowRef } from 'vue'

import type { PageRouter } from '@/app/page-router'
import type { AttendanceService } from '@/shared/attendance-service'
import { downloadBlob } from '@/shared/ui/download'

import { AttendanceType, DEFAULT_ADMIN, DEFAULT_ADMIN_PASSWORD_RECORD, EmployeeStatus, UserRole } from './constants'
import type { AttendanceEmployeesMap, AttendanceRecordsMap, CheckinModalState } from './types'
import {
  buildAttendanceCsv,
  getNextEmployeeId,
  getNextRecordId,
  getWindowMonthKeys,
  makePasswordRecord,
  normalizeEmployees,
  normalizeRecords,
  sortEmployees,
  sortRecords,
  verifyPassword,
  verifyPasswordChangeCurrent,
} from './utils'

export type CheckinView = 'clock' | 'dashboard' | 'individual' | 'reports' | 'employees' | 'password'

export type EmployeeForm = { name: string; role: string; password: string }

export type RecordForm = { type: string; ts: string; notes: string }

export type PasswordForm = { current: string; next: string; confirm: string }

type CheckinStoreDeps = {
  attendance: AttendanceService
  router: PageRouter
}

export type CheckinStore = ReturnType<typeof createCheckinStore>

export function createCheckinStore({ attendance, router }: CheckinStoreDeps) {
  const state = reactive({
    loading: true,
    currentUserId: null as string | null,
    currentView: 'clock' as CheckinView,
    loginEmployeeId: null as string | null,
    loginError: '',
    passwordError: '',
    dashboardEmployeeId: null as string | null,
    viewMode: 'list' as 'list' | 'calendar',
    chartMode: 'week' as 'week' | 'month',
    calendarDate: new Date(),
    reportFilterType: 'all',
    reportEmployeeId: 'all',
    employeeSearch: '',
    modal: null as CheckinModalState,
  })
  const employees = shallowRef<AttendanceEmployeesMap>({})
  const records = shallowRef<AttendanceRecordsMap>({})
  let stopAttendanceWatch: (() => void) | null = null

  const employeeList = computed(() => sortEmployees(employees.value))
  const recordList = computed(() => sortRecords(records.value))
  const currentUser = computed(() => (state.currentUserId ? employees.value[state.currentUserId] || null : null))
  const isAdmin = computed(() => currentUser.value?.role === UserRole.ADMIN)

  // The attendance cache mutates its maps in place, so copy them for the shallow refs to see a change.
  function applySnapshot() {
    const snapshot = attendance.getSnapshot()
    employees.value = { ...normalizeEmployees(snapshot.employees) }
    records.value = { ...normalizeRecords(snapshot.records) }
  }

  function watchWindowScope(date = state.calendarDate) {
    stopAttendanceWatch?.()
    stopAttendanceWatch = attendance.watchWindow(getWindowMonthKeys(date))
  }

  function watchFullHistoryScope() {
    stopAttendanceWatch?.()
    stopAttendanceWatch = attendance.watchFullHistory()
  }

  function stopScopeWatch() {
    stopAttendanceWatch?.()
    stopAttendanceWatch = null
  }

  async function seedDefaultAdmin() {
    try {
      const employee = { ...DEFAULT_ADMIN, ...DEFAULT_ADMIN_PASSWORD_RECORD }
      await attendance.save({ [`attendanceEmployees/${employee.id}`]: employee })
    } catch (error) {
      console.warn('CheckIn: failed to seed default admin', error)
    }
  }

  async function ensureData() {
    const monthKeys = getWindowMonthKeys(state.calendarDate)
    await attendance.ensureWindow(monthKeys)
    applySnapshot()
    stopAttendanceWatch?.()
    stopAttendanceWatch = attendance.watchWindow(monthKeys)
    attendance.subscribe(applySnapshot)
    if (Object.keys(employees.value).length === 0) {
      await seedDefaultAdmin()
    }
    state.loading = false
  }

  function open() {
    router.showPage('checkinPage')
  }

  function logout() {
    Object.assign(state, {
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

  function leave() {
    stopScopeWatch()
    logout()
    router.showPage('home')
  }

  function selectLoginEmployee(employeeId: string | null) {
    state.loginEmployeeId = employeeId
    state.loginError = ''
  }

  async function login(password: string) {
    const employee = state.loginEmployeeId ? employees.value[state.loginEmployeeId] : undefined
    if (!employee) return
    if (!(await verifyPassword(password, employee))) {
      state.loginError = '密碼錯誤，請重試'
      return
    }
    Object.assign(state, {
      currentUserId: employee.id,
      currentView: 'clock',
      loginEmployeeId: null,
      loginError: '',
      passwordError: '',
      dashboardEmployeeId: employee.id,
      reportEmployeeId: employee.role === UserRole.ADMIN ? 'all' : employee.id,
    })
  }

  function navigate(view: CheckinView) {
    if (view === 'reports') {
      void attendance.ensureFullHistory().then(() => {
        watchFullHistoryScope()
        state.currentView = view
      })
      return
    }
    watchWindowScope(state.calendarDate)
    state.currentView = view
  }

  function shiftCalendar(offset: number) {
    const date = new Date(state.calendarDate)
    date.setMonth(date.getMonth() + offset)
    void attendance.ensureWindow(getWindowMonthKeys(date))
    watchWindowScope(date)
    state.calendarDate = date
  }

  async function clockAction(type: string) {
    const user = currentUser.value
    if (!user) return
    const recordId = getNextRecordId()
    const nextStatus =
      type === AttendanceType.CLOCK_IN
        ? EmployeeStatus.WORKING
        : type === AttendanceType.CLOCK_OUT
          ? EmployeeStatus.OFF_DUTY
          : type === AttendanceType.BREAK_START
            ? EmployeeStatus.ON_BREAK
            : EmployeeStatus.WORKING
    await attendance.save({
      [`attendanceEmployees/${user.id}`]: { ...user, status: nextStatus },
      [`attendanceRecords/${recordId}`]: { id: recordId, eid: user.id, type, ts: Date.now() },
    })
  }

  function openModal(modal: CheckinModalState) {
    state.modal = modal
  }

  async function addEmployee(form: EmployeeForm) {
    const name = form.name.trim()
    if (!name || !form.password) return
    const id = getNextEmployeeId(employees.value)
    const passwordRecord = await makePasswordRecord(form.password)
    state.modal = null
    await attendance.save({
      [`attendanceEmployees/${id}`]: { id, name, role: form.role, status: EmployeeStatus.OFF_DUTY, ...passwordRecord },
    })
  }

  async function saveEmployeeEdit(employeeId: string, form: EmployeeForm) {
    const employee = employees.value[employeeId]
    const name = form.name.trim()
    if (!employee || !name) return
    const passwordRecord = form.password ? await makePasswordRecord(form.password) : {}
    state.modal = null
    await attendance.save({
      [`attendanceEmployees/${employeeId}`]: { ...employee, name, role: form.role, ...passwordRecord },
    })
  }

  async function deleteEmployee(employeeId: string) {
    if (!employees.value[employeeId]) return
    if (!confirm('確定要刪除此員工嗎？此操作無法復原。')) return
    await attendance.save({ [`attendanceEmployees/${employeeId}`]: null })
  }

  async function saveRecord(recordId: string, form: RecordForm) {
    const record = records.value[recordId]
    if (!record) return
    state.modal = null
    await attendance.save({
      [`attendanceRecords/${recordId}`]: {
        ...record,
        type: form.type,
        ts: new Date(form.ts).getTime(),
        notes: form.notes.trim(),
      },
    })
  }

  async function deleteRecord(recordId: string) {
    if (!confirm('確定要刪除此筆記錄嗎？此操作無法復原。')) return
    await attendance.save({ [`attendanceRecords/${recordId}`]: null })
  }

  async function changePassword(form: PasswordForm) {
    const user = currentUser.value
    if (!user) return
    if (!(await verifyPasswordChangeCurrent(form.current, user))) {
      state.passwordError = '目前密碼不正確'
      return
    }
    if (!form.next) {
      state.passwordError = '請輸入新密碼'
      return
    }
    if (form.next !== form.confirm) {
      state.passwordError = '確認密碼與新密碼不符'
      return
    }
    const passwordRecord = await makePasswordRecord(form.next)
    state.passwordError = ''
    await attendance.save({ [`attendanceEmployees/${user.id}`]: { ...user, ...passwordRecord } })
    alert('✅ 密碼已更新')
  }

  function filterReportRecords(employeeId: string) {
    return recordList.value.filter(
      (record) =>
        (state.reportFilterType === 'all' || record.type === state.reportFilterType) &&
        (employeeId === 'all' || record.eid === employeeId)
    )
  }

  async function exportCsv() {
    if (!isAdmin.value) return
    await attendance.ensureFullHistory()
    const csv = buildAttendanceCsv(filterReportRecords(state.reportEmployeeId), employees.value)
    downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      `打卡紀錄-${new Date().toISOString().slice(0, 10)}.csv`,
      0
    )
  }

  router.onEnter((pageId) => {
    if (pageId === 'checkinPage') {
      watchWindowScope(state.calendarDate)
      return
    }
    stopScopeWatch()
  })

  return {
    state,
    employees,
    records,
    employeeList,
    recordList,
    currentUser,
    isAdmin,
    ensureData,
    open,
    leave,
    logout,
    selectLoginEmployee,
    login,
    navigate,
    shiftCalendar,
    clockAction,
    openModal,
    addEmployee,
    saveEmployeeEdit,
    deleteEmployee,
    saveRecord,
    deleteRecord,
    changePassword,
    filterReportRecords,
    exportCsv,
  }
}
