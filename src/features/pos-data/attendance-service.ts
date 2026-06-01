import type { AttendanceService, AttendanceSnapshot } from '@/shared/attendance-service'

type AttendanceServiceDeps = {
  ensureWindow: (monthKeys: string[]) => Promise<void>
  ensureFullHistory: () => Promise<void>
  watchWindow: (monthKeys: string[], onChange: () => void) => () => void
  watchFullHistory: (onChange: () => void) => () => void
  save: (updates: Record<string, unknown>) => Promise<void>
  getEmployees: () => Record<string, unknown>
  getRecords: () => Record<string, unknown>
}

export function createAttendanceService(deps: AttendanceServiceDeps): AttendanceService {
  const listeners = new Set<(snapshot: AttendanceSnapshot) => void>()
  let stopWatchingScope: (() => void) | null = null

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
    async ensureWindow(monthKeys) {
      await deps.ensureWindow(monthKeys)
      emit()
    },
    async ensureFullHistory() {
      await deps.ensureFullHistory()
      emit()
    },
    watchWindow(monthKeys) {
      stopWatchingScope?.()
      stopWatchingScope = deps.watchWindow(monthKeys, emit)
      return () => {
        stopWatchingScope?.()
        stopWatchingScope = null
      }
    },
    watchFullHistory() {
      stopWatchingScope?.()
      stopWatchingScope = deps.watchFullHistory(emit)
      return () => {
        stopWatchingScope?.()
        stopWatchingScope = null
      }
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
      await deps.save(updates)
      emit()
    },
  }
}
