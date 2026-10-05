import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AttendanceType, EmployeeStatus, UserRole } from './constants'
import type { AttendanceEmployee, AttendanceRecord } from './types'
import {
  buildAdminDashboard,
  buildAttendanceCalendar,
  buildAttendanceCsv,
  buildWorkHoursChart,
  getNextEmployeeId,
  getStatusLabel,
  groupRecordsByDay,
  sortEmployees,
  sortRecords,
} from './utils'

function createEmployee(overrides: Partial<AttendanceEmployee> = {}): AttendanceEmployee {
  return { id: 'emp_1', name: '小明', role: UserRole.EMPLOYEE, status: EmployeeStatus.OFF_DUTY, ...overrides }
}

function createRecord(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return { id: 'rec_1', eid: 'emp_1', type: AttendanceType.CLOCK_IN, ts: Date.now(), ...overrides }
}

// 2026-05-20 is a Wednesday; noon keeps every record inside one business day.
const NOW = new Date('2026-05-20T12:00:00+08:00')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('checkin utils', () => {
  it('sorts employees by name and records newest first', () => {
    const employees = sortEmployees({
      emp_2: createEmployee({ id: 'emp_2', name: 'Bob' }),
      emp_1: createEmployee({ id: 'emp_1', name: 'Amy' }),
    })
    const records = sortRecords({
      rec_1: createRecord({ id: 'rec_1', ts: NOW.getTime() - 2000 }),
      rec_2: createRecord({ id: 'rec_2', ts: NOW.getTime() - 1000 }),
    })

    expect(employees.map((employee) => employee.id)).toEqual(['emp_1', 'emp_2'])
    expect(records.map((record) => record.id)).toEqual(['rec_2', 'rec_1'])
  })

  it('picks the next numeric employee id and ignores foreign ids', () => {
    expect(getNextEmployeeId({})).toBe('emp_1')
    expect(
      getNextEmployeeId({
        admin: createEmployee({ id: 'admin' }),
        emp_3: createEmployee({ id: 'emp_3' }),
        emp_10: createEmployee({ id: 'emp_10' }),
      })
    ).toBe('emp_11')
  })

  it('labels off-duty employees by whether they clocked today', () => {
    const records = [createRecord({ eid: 'emp_1' })]

    expect(getStatusLabel(EmployeeStatus.WORKING, 'emp_1', records)).toBe('工作中')
    expect(getStatusLabel(EmployeeStatus.ON_BREAK, 'emp_1', records)).toBe('休息中')
    expect(getStatusLabel(EmployeeStatus.OFF_DUTY, 'emp_1', records)).toBe('已下班')
    expect(getStatusLabel(EmployeeStatus.OFF_DUTY, 'emp_2', records)).toBe('未上班')
  })

  it('counts dashboard statuses and keeps the ten newest records', () => {
    const employees = [
      createEmployee({ id: 'emp_1', status: EmployeeStatus.WORKING }),
      createEmployee({ id: 'emp_2', status: EmployeeStatus.ON_BREAK }),
      createEmployee({ id: 'emp_3' }),
      createEmployee({ id: 'emp_4' }),
    ]
    const records = Array.from({ length: 12 }, (_, index) =>
      createRecord({ id: `rec_${index}`, eid: 'emp_3', ts: NOW.getTime() - index * 1000 })
    )

    const dashboard = buildAdminDashboard(employees, records)

    expect(dashboard.statCards[0]).toMatchObject({ label: '總員工數', value: 4 })
    expect(dashboard.statusCards.map((card) => [card.label, card.value])).toEqual([
      ['未上班', 1],
      ['工作中', 1],
      ['休息中', 1],
      ['已下班', 1],
    ])
    expect(dashboard.recent.map((record) => record.id)).toEqual(records.slice(0, 10).map((record) => record.id))
  })

  it('builds week chart bars scaled to the busiest day', () => {
    const daily = groupRecordsByDay([
      createRecord({ id: 'in', type: AttendanceType.CLOCK_IN, ts: NOW.getTime() - 90 * 60_000 }),
      createRecord({ id: 'out', type: AttendanceType.CLOCK_OUT, ts: NOW.getTime() - 30 * 60_000 }),
    ])

    const bars = buildWorkHoursChart(daily, 'week')

    expect(bars).toHaveLength(7)
    expect(bars[6]).toMatchObject({ hours: 1, heightPercent: 100, label: '週三' })
    expect(bars[5]).toMatchObject({ hours: 0, heightPercent: 0 })
    expect(buildWorkHoursChart(daily, 'month')[29].label).toBe('5/20')
  })

  it('builds the month calendar with leading blanks, weekends, and worked hours', () => {
    const daily = groupRecordsByDay([
      createRecord({ id: 'in', type: AttendanceType.CLOCK_IN, ts: NOW.getTime() - 3 * 3600_000 }),
      createRecord({ id: 'out', type: AttendanceType.CLOCK_OUT, ts: NOW.getTime() - 3600_000 }),
    ])

    const calendar = buildAttendanceCalendar(NOW, daily)

    expect(calendar.title).toBe('2026 年 5 月')
    expect(calendar.leadingBlanks).toBe(5)
    expect(calendar.days).toHaveLength(31)
    expect(calendar.days[19]).toEqual({ day: 20, isToday: true, isWeekend: false, hours: 2 })
    expect(calendar.days[22]).toMatchObject({ isWeekend: true, hours: null })
  })

  it('exports CSV rows with quoted cells and employee names', () => {
    const csv = buildAttendanceCsv(
      [
        createRecord({ eid: 'emp_1', type: AttendanceType.BREAK_START, notes: '說 "嗨"' }),
        createRecord({ eid: 'gone' }),
      ],
      { emp_1: createEmployee() }
    )

    const [header, first, second] = csv.split('\n')
    expect(header).toBe('"員工","員工ID","日期","時間","類型","備註"')
    expect(first).toBe('"小明","emp_1","2026/5/20","12:00:00","開始休息","說 ""嗨"""')
    expect(second).toBe('"","gone","2026/5/20","12:00:00","上班",""')
  })
})
