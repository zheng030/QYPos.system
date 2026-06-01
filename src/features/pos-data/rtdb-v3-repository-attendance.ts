import type { AttendanceEmployee, AttendanceRecord } from '@/shared/attendance-service'
import { getMonthKey } from './rtdb-v3-mapper'
import type { RtdbV3RepositoryContext } from './rtdb-v3-repository-context'
import {
  createAttendanceMonthDescriptor,
  getStaticDescriptorOrThrow,
  RTDB_V3_RESOURCE_KEYS,
} from './rtdb-v3-resource-registry'
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
    ctx.attendanceEmployeesRev = await ctx.readRevision(
      getStaticDescriptorOrThrow<Record<string, AttendanceEmployee>>(RTDB_V3_RESOURCE_KEYS.attendanceEmployees).revision
        .path
    )
  }

  async function ensureAttendanceMonthIndex() {
    const descriptor = getStaticDescriptorOrThrow<Record<string, true>>(RTDB_V3_RESOURCE_KEYS.attendanceMonthIndex)
    return await ctx.loadCacheFirstResource({
      descriptor,
      readRemote: async () => {
        const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/${descriptor.remotePath}`).once('value')
        return { ...((snapshot.val() || {}) as Record<string, true>) }
      },
    })
  }

  async function refreshAttendanceMonthIndex() {
    const descriptor = getStaticDescriptorOrThrow<Record<string, true>>(RTDB_V3_RESOURCE_KEYS.attendanceMonthIndex)
    const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/${descriptor.remotePath}`).once('value')
    const value = { ...((snapshot.val() || {}) as Record<string, true>) }
    await ctx.saveCachedResource(descriptor, ctx.revisionCache.get(descriptor.revision.path) || 0, value)
    return value
  }

  async function ensureAttendanceMonth(monthKey: V3MonthKey) {
    if (ctx.attendanceMonthCache.has(monthKey)) {
      return
    }
    const descriptor = createAttendanceMonthDescriptor(monthKey)
    const value = await ctx.loadCacheFirstResource({
      descriptor,
      readRemote: async () => {
        const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/${descriptor.remotePath}`).once('value')
        return { ...((snapshot.val() || {}) as AttendanceMonthMap) }
      },
    })
    replaceAttendanceMonth(monthKey, value)
  }

  async function refreshAttendanceMonth(monthKey: V3MonthKey) {
    const descriptor = createAttendanceMonthDescriptor(monthKey)
    const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/${descriptor.remotePath}`).once('value')
    const value = { ...((snapshot.val() || {}) as AttendanceMonthMap) }
    replaceAttendanceMonth(monthKey, value)
    await ctx.saveCachedResource(descriptor, ctx.revisionCache.get(`attendance/recordsByMonth/${monthKey}`) || 0, value)
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
    const monthIndex = await ensureAttendanceMonthIndex()
    const monthKeys = Object.keys(monthIndex) as V3MonthKey[]
    await Promise.all(monthKeys.map((monthKey) => ensureAttendanceMonth(monthKey)))
    ctx.activeAttendanceMonths = new Set(monthKeys)
    rebuildAttendanceState()
  }

  function watchAttendanceWindow(monthKeys: string[], onInvalidate: (event: V3AttendanceWindowEvent) => void) {
    const normalized = [...new Set(monthKeys.filter(Boolean))] as V3MonthKey[]
    ctx.activeAttendanceMonths = new Set(normalized)
    rebuildAttendanceState()
    const employeesDescriptor = getStaticDescriptorOrThrow<Record<string, AttendanceEmployee>>(
      RTDB_V3_RESOURCE_KEYS.attendanceEmployees
    )
    const stops = [
      ctx.watchRevision(employeesDescriptor.revision.path, () => {
        void deps.fetchAttendanceEmployees().then(() => {
          ctx.attendanceEmployeesRev = ctx.revisionCache.get(employeesDescriptor.revision.path) || 0
          onInvalidate({
            kind: 'attendance-window',
            changedMonthKeys: [],
            employeesChanged: true,
          })
        })
      }),
      ...normalized.map((monthKey) => {
        const descriptor = createAttendanceMonthDescriptor(monthKey)
        return ctx.watchRevision(descriptor.revision.path, () => {
          void refreshAttendanceMonth(monthKey).then(() => {
            rebuildAttendanceState()
            onInvalidate({
              kind: 'attendance-window',
              changedMonthKeys: [monthKey],
              employeesChanged: false,
            })
          })
        })
      }),
    ]
    return () => {
      stops.forEach((stop) => {
        stop()
      })
    }
  }

  function watchAttendanceFullHistory(onInvalidate: (event: V3AttendanceWindowEvent) => void) {
    let stopWindowWatch = () => {}
    let stopMonthIndexWatch = () => {}
    let activeMonthKeys = [] as V3MonthKey[]

    const syncWindowWatch = (monthKeys: V3MonthKey[]) => {
      const nextKeys = [...new Set(monthKeys)].sort()
      const currentKeys = [...activeMonthKeys].sort()
      if (JSON.stringify(nextKeys) === JSON.stringify(currentKeys)) {
        return
      }
      activeMonthKeys = nextKeys
      stopWindowWatch()
      stopWindowWatch = watchAttendanceWindow(nextKeys, onInvalidate)
    }

    void ensureAttendanceMonthIndex().then((monthIndex) => {
      syncWindowWatch(Object.keys(monthIndex) as V3MonthKey[])
    })

    const monthIndexDescriptor = getStaticDescriptorOrThrow<Record<string, true>>(
      RTDB_V3_RESOURCE_KEYS.attendanceMonthIndex
    )
    stopMonthIndexWatch = ctx.watchRevision(monthIndexDescriptor.revision.path, () => {
      void refreshAttendanceMonthIndex().then((monthIndex) => {
        const monthKeys = Object.keys(monthIndex) as V3MonthKey[]
        void Promise.all(monthKeys.map((monthKey) => ensureAttendanceMonth(monthKey))).then(() => {
          ctx.activeAttendanceMonths = new Set(monthKeys)
          rebuildAttendanceState()
          syncWindowWatch(monthKeys)
          onInvalidate({
            kind: 'attendance-window',
            changedMonthKeys: monthKeys,
            employeesChanged: false,
          })
        })
      })
    })

    return () => {
      stopMonthIndexWatch()
      stopWindowWatch()
    }
  }

  async function saveAttendanceUpdates(updates: Record<string, unknown>) {
    const payload: Record<string, unknown> = {}
    const employeeUpdates = new Map<string, AttendanceEmployee | null>()
    const monthUpdates = new Map<V3MonthKey, AttendanceMonthMap>()
    const touchedMonths = new Set<V3MonthKey>()
    const monthIndexDescriptor = getStaticDescriptorOrThrow<Record<string, true>>(
      RTDB_V3_RESOURCE_KEYS.attendanceMonthIndex
    )
    const monthIndexUpdates = new Map<V3MonthKey, true | null>()
    let touchedEmployees = false
    const employeesDescriptor = getStaticDescriptorOrThrow<Record<string, AttendanceEmployee>>(
      RTDB_V3_RESOURCE_KEYS.attendanceEmployees
    )

    for (const [path, value] of Object.entries(updates)) {
      const [root, key] = path.split('/')
      if (!key) continue

      if (root === 'attendanceEmployees') {
        payload[`${RTDB_V3_ROOT}/${employeesDescriptor.remotePath}/${key}`] = value
        employeeUpdates.set(key, value === null ? null : (value as AttendanceEmployee))
        touchedEmployees = true
        continue
      }

      if (root !== 'attendanceRecords') continue
      const existing = ctx.state.attendanceRecords[key]
      const oldMonthKey = ctx.attendanceRecordLocationCache.get(key) || (existing ? getMonthKey(existing.ts) : null)

      if (value === null) {
        if (!oldMonthKey) continue
        payload[`${RTDB_V3_ROOT}/${createAttendanceMonthDescriptor(oldMonthKey).remotePath}/${key}`] = null
        const monthRecords = { ...(monthUpdates.get(oldMonthKey) || ctx.attendanceMonthCache.get(oldMonthKey) || {}) }
        delete monthRecords[key]
        monthUpdates.set(oldMonthKey, monthRecords)
        touchedMonths.add(oldMonthKey)
        continue
      }

      const record = value as AttendanceRecord
      const newMonthKey = getMonthKey(record.ts)
      if (oldMonthKey && oldMonthKey !== newMonthKey) {
        payload[`${RTDB_V3_ROOT}/${createAttendanceMonthDescriptor(oldMonthKey).remotePath}/${key}`] = null
        const oldMonthRecords = {
          ...(monthUpdates.get(oldMonthKey) || ctx.attendanceMonthCache.get(oldMonthKey) || {}),
        }
        delete oldMonthRecords[key]
        monthUpdates.set(oldMonthKey, oldMonthRecords)
        touchedMonths.add(oldMonthKey)
      }

      payload[`${RTDB_V3_ROOT}/${createAttendanceMonthDescriptor(newMonthKey).remotePath}/${key}`] = record
      const newMonthRecords = { ...(monthUpdates.get(newMonthKey) || ctx.attendanceMonthCache.get(newMonthKey) || {}) }
      newMonthRecords[key] = record
      monthUpdates.set(newMonthKey, newMonthRecords)
      touchedMonths.add(newMonthKey)
      monthIndexUpdates.set(newMonthKey, true)
    }

    monthUpdates.forEach((records, monthKey) => {
      if (Object.keys(records).length === 0) {
        monthIndexUpdates.set(monthKey, null)
      } else {
        monthIndexUpdates.set(monthKey, true)
      }
    })

    if (touchedEmployees) {
      ctx.touchRevision('attendance/employees', payload)
    }
    touchedMonths.forEach((monthKey) => {
      ctx.touchRevision(`attendance/recordsByMonth/${monthKey}`, payload)
    })
    if (monthIndexUpdates.size > 0) {
      monthIndexUpdates.forEach((value, monthKey) => {
        payload[`${RTDB_V3_ROOT}/${monthIndexDescriptor.remotePath}/${monthKey}`] = value
      })
      ctx.touchRevision(monthIndexDescriptor.revision.path, payload)
    }
    await ctx.updateRoot(payload)

    employeeUpdates.forEach((employee, key) => {
      if (employee === null) delete ctx.state.attendanceEmployees[key]
      else ctx.state.attendanceEmployees[key] = employee
    })
    monthUpdates.forEach((records, monthKey) => {
      replaceAttendanceMonth(monthKey, records)
    })
    if (touchedEmployees) {
      await ctx.saveCachedResource(
        employeesDescriptor,
        ctx.revisionCache.get('attendance/employees') || 0,
        ctx.state.attendanceEmployees
      )
    }
    await Promise.all(
      [...monthUpdates.entries()].map(async ([monthKey, records]) => {
        await ctx.saveCachedResource(
          createAttendanceMonthDescriptor(monthKey),
          ctx.revisionCache.get(`attendance/recordsByMonth/${monthKey}`) || 0,
          records
        )
      })
    )
    if (monthIndexUpdates.size > 0) {
      const currentMonthIndex = await ensureAttendanceMonthIndex()
      monthIndexUpdates.forEach((value, monthKey) => {
        if (value) {
          currentMonthIndex[monthKey] = true
        } else {
          delete currentMonthIndex[monthKey]
        }
      })
      await ctx.saveCachedResource(
        monthIndexDescriptor,
        ctx.revisionCache.get(monthIndexDescriptor.revision.path) || 0,
        currentMonthIndex
      )
    }
    rebuildAttendanceState()
  }

  return {
    ensureAttendanceFullHistory,
    ensureAttendanceWindow,
    watchAttendanceFullHistory,
    watchAttendanceWindow,
    saveAttendanceUpdates,
  }
}
