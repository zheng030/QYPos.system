import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPageRouter } from '@/app/page-router'
import type { AttendanceService, AttendanceSnapshot } from '@/shared/attendance-service'
import { downloadBlob } from '@/shared/ui/download'
import { createCheckinStore } from './checkin-store'
import { AttendanceType, EmployeeStatus, UserRole } from './constants'

vi.mock('@/shared/auth-gate', () => ({
  authGate: {
    getDevBypassNotice: () => '',
    verifyPosLogin: async () => true,
    verifyEmployeeLogin: async (password: string) => password === 'ok',
    verifyEmployeePasswordChange: async (password: string) => password === 'ok',
  },
}))

vi.mock('@/shared/ui/download', () => ({ downloadBlob: vi.fn() }))

function createFakeAttendance(initial: AttendanceSnapshot = { employees: {}, records: {} }) {
  const snapshot = structuredClone(initial)
  const listeners = new Set<(value: AttendanceSnapshot) => void>()
  const stops = vi.fn()
  const service = {
    ensureWindow: vi.fn(async () => {}),
    ensureFullHistory: vi.fn(async () => {}),
    watchWindow: vi.fn((_monthKeys: string[]) => stops),
    watchFullHistory: vi.fn(() => stops),
    getSnapshot: () => snapshot,
    subscribe(listener: (value: AttendanceSnapshot) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    save: vi.fn(async (updates: Record<string, unknown>) => {
      for (const [path, value] of Object.entries(updates)) {
        const [root, id] = path.split('/')
        const bucket = (root === 'attendanceEmployees' ? snapshot.employees : snapshot.records) as Record<
          string,
          unknown
        >
        if (value === null) delete bucket[id]
        else bucket[id] = value
      }
      for (const listener of listeners) listener(snapshot)
    }),
  } satisfies AttendanceService
  return { service, stops }
}

function lastSave(service: ReturnType<typeof createFakeAttendance>['service']) {
  return service.save.mock.calls.at(-1)?.[0] as Record<string, Record<string, unknown> | null>
}

async function createLoggedInStore(initial?: AttendanceSnapshot) {
  const attendance = createFakeAttendance(initial)
  const router = createPageRouter()
  const checkin = createCheckinStore({ attendance: attendance.service, router })
  await checkin.ensureData()
  checkin.selectLoginEmployee('emp_admin')
  await checkin.login('ok')
  return { ...attendance, router, checkin }
}

beforeEach(() => {
  vi.stubGlobal('alert', vi.fn())
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true)
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(downloadBlob).mockClear()
})

describe('checkin store', () => {
  it('seeds the default admin when no employee exists', async () => {
    const { service } = createFakeAttendance()
    const checkin = createCheckinStore({ attendance: service, router: createPageRouter() })

    expect(checkin.state.loading).toBe(true)
    await checkin.ensureData()

    expect(checkin.state.loading).toBe(false)
    expect(service.save).toHaveBeenCalledTimes(1)
    expect(lastSave(service)['attendanceEmployees/emp_admin']).toMatchObject({
      name: '管理員',
      role: UserRole.ADMIN,
      passwordHash: expect.any(String),
    })
    expect(checkin.employeeList.value.map((employee) => employee.id)).toEqual(['emp_admin'])
  })

  it('rejects a wrong password and logs the selected employee in', async () => {
    const { service } = createFakeAttendance()
    const checkin = createCheckinStore({ attendance: service, router: createPageRouter() })
    await checkin.ensureData()

    checkin.selectLoginEmployee('emp_admin')
    await checkin.login('bad')
    expect(checkin.state.loginError).toBe('密碼錯誤，請重試')
    expect(checkin.currentUser.value).toBeNull()

    await checkin.login('ok')
    expect(checkin.currentUser.value?.id).toBe('emp_admin')
    expect(checkin.isAdmin.value).toBe(true)
    expect(checkin.state).toMatchObject({
      currentView: 'clock',
      loginEmployeeId: null,
      loginError: '',
      dashboardEmployeeId: 'emp_admin',
      reportEmployeeId: 'all',
    })
  })

  it('writes each clock action with the matching employee status', async () => {
    const { service, checkin } = await createLoggedInStore()

    for (const [type, status] of [
      [AttendanceType.CLOCK_IN, EmployeeStatus.WORKING],
      [AttendanceType.BREAK_START, EmployeeStatus.ON_BREAK],
      [AttendanceType.BREAK_END, EmployeeStatus.WORKING],
      [AttendanceType.CLOCK_OUT, EmployeeStatus.OFF_DUTY],
    ]) {
      await checkin.clockAction(type)
      const payload = lastSave(service)
      const [recordPath] = Object.keys(payload).filter((path) => path.startsWith('attendanceRecords/'))
      expect(payload['attendanceEmployees/emp_admin']?.status).toBe(status)
      expect(payload[recordPath]).toMatchObject({ eid: 'emp_admin', type })
      expect(checkin.currentUser.value?.status).toBe(status)
    }
    expect(checkin.recordList.value).toHaveLength(4)
  })

  it('watches only the attendance scope the visible view needs', async () => {
    const { service, stops, router, checkin } = await createLoggedInStore()
    service.watchWindow.mockClear()

    checkin.open()
    expect(router.activePage.value).toBe('checkinPage')
    expect(service.watchWindow).toHaveBeenCalledTimes(1)

    checkin.navigate('reports')
    await vi.waitFor(() => expect(checkin.state.currentView).toBe('reports'))
    expect(service.ensureFullHistory).toHaveBeenCalled()
    expect(service.watchFullHistory).toHaveBeenCalledTimes(1)

    checkin.navigate('clock')
    expect(checkin.state.currentView).toBe('clock')
    expect(service.watchWindow).toHaveBeenCalledTimes(2)

    stops.mockClear()
    checkin.leave()
    expect(stops).toHaveBeenCalled()
    expect(router.activePage.value).toBe('home')
    expect(checkin.currentUser.value).toBeNull()
  })

  it('validates a password change before saving a new hash', async () => {
    const { service, checkin } = await createLoggedInStore()
    const before = structuredClone(checkin.currentUser.value)
    service.save.mockClear()

    await checkin.changePassword({ current: 'bad', next: 'n', confirm: 'n' })
    expect(checkin.state.passwordError).toBe('目前密碼不正確')
    await checkin.changePassword({ current: 'ok', next: '', confirm: '' })
    expect(checkin.state.passwordError).toBe('請輸入新密碼')
    await checkin.changePassword({ current: 'ok', next: 'n', confirm: 'x' })
    expect(checkin.state.passwordError).toBe('確認密碼與新密碼不符')
    expect(service.save).not.toHaveBeenCalled()

    await checkin.changePassword({ current: 'ok', next: 'n', confirm: 'n' })
    expect(checkin.state.passwordError).toBe('')
    expect(checkin.currentUser.value?.passwordHash).not.toBe(before?.passwordHash)
    expect(alert).toHaveBeenCalledWith('✅ 密碼已更新')
  })

  it('adds, edits, and deletes employees', async () => {
    const { service, checkin } = await createLoggedInStore()
    checkin.openModal({ type: 'addEmployee' })

    await checkin.addEmployee({ name: ' 小明 ', role: UserRole.EMPLOYEE, password: 'pw' })
    expect(checkin.state.modal).toBeNull()
    const added = checkin.employees.value.emp_1
    expect(added).toMatchObject({ name: '小明', role: UserRole.EMPLOYEE, status: EmployeeStatus.OFF_DUTY })

    await checkin.saveEmployeeEdit('emp_1', { name: '小華', role: UserRole.ADMIN, password: '' })
    expect(checkin.employees.value.emp_1).toMatchObject({
      name: '小華',
      role: UserRole.ADMIN,
      passwordHash: added.passwordHash,
    })

    vi.mocked(confirm).mockReturnValueOnce(false)
    service.save.mockClear()
    await checkin.deleteEmployee('emp_1')
    expect(service.save).not.toHaveBeenCalled()

    await checkin.deleteEmployee('emp_1')
    expect(lastSave(service)).toEqual({ 'attendanceEmployees/emp_1': null })
    expect(checkin.employees.value.emp_1).toBeUndefined()
  })

  it('edits a record and exports the filtered report', async () => {
    const ts = new Date('2026-05-20T09:00:00+08:00').getTime()
    const { checkin } = await createLoggedInStore({
      employees: {},
      records: {
        r1: { id: 'r1', eid: 'emp_admin', type: AttendanceType.CLOCK_IN, ts },
        r2: { id: 'r2', eid: 'emp_admin', type: AttendanceType.CLOCK_OUT, ts: ts + 3600_000 },
      },
    })

    await checkin.saveRecord('r1', { type: AttendanceType.CLOCK_IN, ts: '2026-05-20T08:30', notes: ' 遲到 ' })
    expect(checkin.records.value.r1).toMatchObject({ ts: new Date('2026-05-20T08:30').getTime(), notes: '遲到' })

    checkin.state.reportFilterType = AttendanceType.CLOCK_IN
    expect(checkin.filterReportRecords('all').map((record) => record.id)).toEqual(['r1'])
    expect(checkin.filterReportRecords('emp_other')).toEqual([])

    await checkin.exportCsv()
    const [blob, fileName, revokeDelay] = vi.mocked(downloadBlob).mock.calls[0]
    expect(fileName).toMatch(/^打卡紀錄-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(revokeDelay).toBe(0)
    expect((await blob.text()).split('\n')).toHaveLength(2)
  })
})
