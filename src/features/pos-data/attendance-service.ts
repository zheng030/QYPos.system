import type { AttendanceService, AttendanceSnapshot } from '@/shared/attendance-service'

type AttendanceServiceDeps = {
  ensureDataSubscriptions: (roots: string[]) => Promise<void>
  saveAllToCloud: (updates: Record<string, unknown>) => Promise<void>
  getEmployees: () => Record<string, unknown>
  getRecords: () => Record<string, unknown>
}

const ATTENDANCE_ROOTS = ['attendanceEmployees', 'attendanceRecords']

export function createAttendanceService(deps: AttendanceServiceDeps): AttendanceService {
  const listeners = new Set<(snapshot: AttendanceSnapshot) => void>()

  function getSnapshot(): AttendanceSnapshot {
    return {
      employees: deps.getEmployees() as AttendanceSnapshot['employees'],
      records: deps.getRecords() as AttendanceSnapshot['records'],
    }
  }

  function emit() {
    const snapshot = getSnapshot()
    listeners.forEach((listener) => {
      listener(snapshot)
    })
  }

  return {
    async ensureLoaded() {
      await deps.ensureDataSubscriptions(ATTENDANCE_ROOTS)
      emit()
    },
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener)
      listener(getSnapshot())
      return () => {
        listeners.delete(listener)
      }
    },
    async save(updates) {
      await deps.saveAllToCloud(updates)
      emit()
    },
  }
}
