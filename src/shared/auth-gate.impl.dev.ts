import type { AuthGate } from './auth-gate.types'

const DEV_AUTH_NOTICE = '開發模式：登入驗證已略過'

export const authGate: AuthGate = {
  getDevBypassNotice() {
    return DEV_AUTH_NOTICE
  },
  async verifyPosLogin() {
    return true
  },
  async verifyEmployeeLogin() {
    return true
  },
  async verifyEmployeePasswordChange() {
    return true
  },
}
