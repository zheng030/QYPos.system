import { pbkdf2Hash } from '@/shared/password'

import type { AuthGate } from './auth-gate.types'

async function verifyHashPassword(password: string, salt: string, hash: string) {
  const computed = await pbkdf2Hash(password, salt)
  return computed === hash
}

export const authGate: AuthGate = {
  getDevBypassNotice() {
    return ''
  },
  async verifyPosLogin(password, systemPassword) {
    if (!systemPassword.passwordSalt || !systemPassword.passwordHash) {
      return false
    }
    return verifyHashPassword(password, systemPassword.passwordSalt, systemPassword.passwordHash)
  },
  async verifyEmployeeLogin(password, employee) {
    if (!employee?.passwordHash || !employee.passwordSalt) {
      return false
    }
    return verifyHashPassword(password, employee.passwordSalt, employee.passwordHash)
  },
  async verifyEmployeePasswordChange(currentPassword, employee) {
    if (!employee?.passwordHash || !employee.passwordSalt) {
      return false
    }
    return verifyHashPassword(currentPassword, employee.passwordSalt, employee.passwordHash)
  },
}
