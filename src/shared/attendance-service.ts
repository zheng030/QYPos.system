export const ATTENDANCE_SERVICE_KEY = 'attendance'

export type AttendanceEmployee = {
  id: string
  name: string
  role: string
  status: string
  passwordHash?: string
  passwordSalt?: string
  [key: string]: unknown
}

export type AttendanceRecord = {
  id: string
  eid: string
  type: string
  ts: number
  notes?: string
  [key: string]: unknown
}

export type AttendanceEmployeesMap = Record<string, AttendanceEmployee>
export type AttendanceRecordsMap = Record<string, AttendanceRecord>

export type AttendanceSnapshot = {
  employees: AttendanceEmployeesMap
  records: AttendanceRecordsMap
}

export type AttendanceService = {
  ensureLoaded(): Promise<void>
  getSnapshot(): AttendanceSnapshot
  subscribe(listener: (snapshot: AttendanceSnapshot) => void): () => void
  save(updates: Record<string, unknown>): Promise<void>
}
