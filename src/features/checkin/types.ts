import type {
  AttendanceEmployee,
  AttendanceEmployeesMap,
  AttendanceRecord,
  AttendanceRecordsMap,
} from '@/shared/attendance-service'

export type { AttendanceEmployee, AttendanceEmployeesMap, AttendanceRecord, AttendanceRecordsMap }

export type CheckinModalState =
  | null
  | { type: 'addEmployee' }
  | { type: 'editEmployee'; empId: string }
  | { type: 'editRecord'; recordId: string }
