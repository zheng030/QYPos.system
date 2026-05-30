import type { PosOwnerAuthMap, PosOwnerName, PosSystemPasswordConfig } from '@/features/pos-kernel/types'
import type { AttendanceEmployee } from '@/shared/attendance-service'

export type AuthGate = {
  getDevBypassNotice(): string
  verifyPosLogin(password: string, systemPassword: PosSystemPasswordConfig): Promise<boolean>
  verifyOwnerLogin(ownerName: PosOwnerName, password: string, ownerPasswords: PosOwnerAuthMap): Promise<boolean>
  verifyEmployeeLogin(password: string, employee: AttendanceEmployee | null): Promise<boolean>
  verifyOwnerPasswordChange(
    ownerName: PosOwnerName,
    oldPassword: string,
    ownerPasswords: PosOwnerAuthMap
  ): Promise<boolean>
  verifyEmployeePasswordChange(currentPassword: string, employee: AttendanceEmployee | null): Promise<boolean>
}
