import type { AppContext } from '@/app/app-context'
import { APP_SHELL_SERVICE_KEY, type AppShellService } from '@/shared/app-shell-service'
import { ATTENDANCE_SERVICE_KEY, type AttendanceService } from '@/shared/attendance-service'
import { CHECKIN_PAGE_SERVICE_KEY, type CheckinPageService } from '@/shared/checkin-page-service'

import { init, openCheckinPage } from './handlers'
import { bridge, initBridge, state } from './store'
import { logout } from './utils'

export async function bootCheckinApp(context: AppContext) {
  const attendance = context.getService<AttendanceService>(ATTENDANCE_SERVICE_KEY)
  const appShell = context.getService<AppShellService>(APP_SHELL_SERVICE_KEY)
  if (!attendance || !appShell) {
    throw new Error('Checkin dependencies are not ready')
  }

  initBridge({ attendance, appShell })
  if (!state.initialized) {
    await init({})
  }

  const service: CheckinPageService = {
    open: openCheckinPage,
  }

  context.registerService<CheckinPageService>(CHECKIN_PAGE_SERVICE_KEY, service)

  return {
    handleCheckinBack() {
      logout()
      bridge.appShell?.showHome()
    },
  }
}
