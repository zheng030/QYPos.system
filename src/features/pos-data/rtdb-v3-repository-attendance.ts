import type { AttendanceEmployee, AttendanceRecord } from '@/shared/attendance-service'
import { getMonthKey } from './rtdb-v3-mapper'
import type { RtdbV3RepositoryContext } from './rtdb-v3-repository-context'
import type { V3AttendanceWindowEvent, V3MonthKey } from './rtdb-v3-types'
import { RTDB_V3_ROOT } from './rtdb-v3-types'

type AttendanceMonthMap = Record<string, AttendanceRecord>

export function createRtdbV3RepositoryAttendanceModule(
  ctx: RtdbV3RepositoryContext,
  deps: { fetchAttendanceEmployees: () => Promise<void> }
) {
  function replaceAttendanceMonth(monthKey: V3MonthKey, records: AttendanceMonthMap) {
    const previous = ctx.attendanceMonthCache.get(monthKey) || {}
    for (const recordId of Object.keys(previous)) {
      if (!(recordId in records)) {
        ctx.attendanceRecordLocationCache.delete(recordId)
      }
    }
    for (const recordId of Object.keys(records)) {
      ctx.attendanceRecordLocationCache.set(recordId, monthKey)
    }
    ctx.attendanceMonthCache.set(monthKey, records)
  }

  function rebuildAttendanceState() {
    ctx.state.attendanceRecords = {}
    for (const monthKey of ctx.activeAttendanceMonths) {
      Object.assign(ctx.state.attendanceRecords, ctx.attendanceMonthCache.get(monthKey) || {})
    }
  }

  async function ensureAttendanceEmployees() {
    if (ctx.attendanceEmployeesRev >= 0 || Object.keys(ctx.state.attendanceEmployees).length > 0) {
      return
    }
    await deps.fetchAttendanceEmployees()
    ctx.attendanceEmployeesRev = Date.now()
  }

  async function ensureAttendanceMonth(monthKey: V3MonthKey) {
    if (ctx.attendanceMonthCache.has(monthKey)) {
      return
    }
    const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/attendance/recordsByMonth/${monthKey}`).once('value')
    replaceAttendanceMonth(monthKey, { ...((snapshot.val() || {}) as AttendanceMonthMap) })
  }

  async function ensureAttendanceWindow(monthKeys: string[]) {
    await ensureAttendanceEmployees()
    const normalized = [...new Set(monthKeys.filter(Boolean))] as V3MonthKey[]
    await Promise.all(normalized.map((monthKey) => ensureAttendanceMonth(monthKey)))
    ctx.activeAttendanceMonths = new Set(normalized)
    rebuildAttendanceState()
  }

  async function ensureAttendanceFullHistory() {
    await ensureAttendanceEmployees()
    const revisionSnapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/meta/revisions/attendance/recordsByMonth`).once('value')
    const monthKeys = Object.keys((revisionSnapshot.val() || {}) as Record<string, unknown>) as V3MonthKey[]
    await Promise.all(monthKeys.map((monthKey) => ensureAttendanceMonth(monthKey)))
    ctx.activeAttendanceMonths = new Set(monthKeys)
    rebuildAttendanceState()
  }

  function watchAttendanceWindow(monthKeys: string[], onInvalidate: (event: V3AttendanceWindowEvent) => void) {
    const normalized = [...new Set(monthKeys.filter(Boolean))] as V3MonthKey[]
    ctx.activeAttendanceMonths = new Set(normalized)
    rebuildAttendanceState()
    const stops = [
      ctx.db.ref(`${RTDB_V3_ROOT}/meta/revisions/attendance/employees`).on('value', () => {
        void deps.fetchAttendanceEmployees().then(() => {
          ctx.attendanceEmployeesRev = Date.now()
          onInvalidate({
            kind: 'attendance-window',
            changedMonthKeys: [],
            employeesChanged: true,
          })
        })
      }) as () => void,
      ...normalized.map(
        (monthKey) =>
          ctx.db.ref(`${RTDB_V3_ROOT}/meta/revisions/attendance/recordsByMonth/${monthKey}`).on('value', () => {
            void ctx.db
              .ref(`${RTDB_V3_ROOT}/attendance/recordsByMonth/${monthKey}`)
              .once('value')
              .then((snapshot) => {
                replaceAttendanceMonth(monthKey, { ...((snapshot.val() || {}) as AttendanceMonthMap) })
              })
              .then(() => {
                rebuildAttendanceState()
                onInvalidate({
                  kind: 'attendance-window',
                  changedMonthKeys: [monthKey],
                  employeesChanged: false,
                })
              })
          }) as () => void
      ),
    ]
    return () => {
      stops.forEach((stop) => {
        stop()
      })
    }
  }

  async function saveAttendanceUpdates(updates: Record<string, unknown>) {
    const payload: Record<string, unknown> = {}
    const employeeUpdates = new Map<string, AttendanceEmployee | null>()
    const monthUpdates = new Map<V3MonthKey, AttendanceMonthMap>()
    const touchedMonths = new Set<V3MonthKey>()
    let touchedEmployees = false

    for (const [path, value] of Object.entries(updates)) {
      const [root, key] = path.split('/')
      if (!key) continue

      if (root === 'attendanceEmployees') {
        payload[`${RTDB_V3_ROOT}/attendance/employees/${key}`] = value
        employeeUpdates.set(key, value === null ? null : (value as AttendanceEmployee))
        touchedEmployees = true
        continue
      }

      if (root !== 'attendanceRecords') continue
      const existing = ctx.state.attendanceRecords[key]
      const oldMonthKey = ctx.attendanceRecordLocationCache.get(key) || (existing ? getMonthKey(existing.ts) : null)

      if (value === null) {
        if (!oldMonthKey) continue
        payload[`${RTDB_V3_ROOT}/attendance/recordsByMonth/${oldMonthKey}/${key}`] = null
        const monthRecords = { ...(monthUpdates.get(oldMonthKey) || ctx.attendanceMonthCache.get(oldMonthKey) || {}) }
        delete monthRecords[key]
        monthUpdates.set(oldMonthKey, monthRecords)
        touchedMonths.add(oldMonthKey)
        continue
      }

      const record = value as AttendanceRecord
      const newMonthKey = getMonthKey(record.ts)
      if (oldMonthKey && oldMonthKey !== newMonthKey) {
        payload[`${RTDB_V3_ROOT}/attendance/recordsByMonth/${oldMonthKey}/${key}`] = null
        const oldMonthRecords = {
          ...(monthUpdates.get(oldMonthKey) || ctx.attendanceMonthCache.get(oldMonthKey) || {}),
        }
        delete oldMonthRecords[key]
        monthUpdates.set(oldMonthKey, oldMonthRecords)
        touchedMonths.add(oldMonthKey)
      }

      payload[`${RTDB_V3_ROOT}/attendance/recordsByMonth/${newMonthKey}/${key}`] = record
      const newMonthRecords = { ...(monthUpdates.get(newMonthKey) || ctx.attendanceMonthCache.get(newMonthKey) || {}) }
      newMonthRecords[key] = record
      monthUpdates.set(newMonthKey, newMonthRecords)
      touchedMonths.add(newMonthKey)
    }

    if (touchedEmployees) {
      ctx.touchRevision('attendance/employees', payload)
    }
    touchedMonths.forEach((monthKey) => {
      ctx.touchRevision(`attendance/recordsByMonth/${monthKey}`, payload)
    })
    await ctx.updateRoot(payload)

    employeeUpdates.forEach((employee, key) => {
      if (employee === null) delete ctx.state.attendanceEmployees[key]
      else ctx.state.attendanceEmployees[key] = employee
    })
    monthUpdates.forEach((records, monthKey) => {
      replaceAttendanceMonth(monthKey, records)
    })
    rebuildAttendanceState()
  }

  return {
    ensureAttendanceFullHistory,
    ensureAttendanceWindow,
    watchAttendanceWindow,
    saveAttendanceUpdates,
  }
}
