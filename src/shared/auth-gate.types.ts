import type { PosSystemPasswordConfig } from '@/features/pos-kernel/types'
import type { AttendanceEmployee } from '@/shared/attendance-service'

export type AuthGate = {
  getDevBypassNotice(): string
  verifyPosLogin(password: string, systemPassword: PosSystemPasswordConfig): Promise<boolean>
  verifyEmployeeLogin(password: string, employee: AttendanceEmployee | null): Promise<boolean>
  verifyEmployeePasswordChange(currentPassword: string, employee: AttendanceEmployee | null): Promise<boolean>
}
