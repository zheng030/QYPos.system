import { shallowRef } from 'vue'

import type { PageRouter } from '@/app/page-router'
import type { PosDataService } from '@/features/pos-data/service'
import type { PosKernelService } from '@/features/pos-kernel/service'
import { authGate } from '@/shared/auth-gate'
import { getErrorMessage } from '@/shared/errors'

type ShellStoreDeps = {
  kernel: PosKernelService
  data: PosDataService
  router: PageRouter
}

export type ShowAppOptions = {
  skipHome?: boolean
  skipStaffLive?: boolean
}

export type ShellStore = ReturnType<typeof createShellStore>

export function createShellStore({ kernel, data, router }: ShellStoreDeps) {
  const appVisible = shallowRef(false)
  const loginPassword = shallowRef('')
  const loginErrorVisible = shallowRef<boolean | null>(null)
  const systemTime = shallowRef('載入中...')
  const seatTimer = shallowRef('')
  let clockTimer: ReturnType<typeof setInterval> | null = null

  // The clock texts only refresh on the one-second tick, like a wall clock.
  function tickClock() {
    systemTime.value = new Date().toLocaleString('zh-TW', { hour12: false })
    const table = kernel.state.selectedTable
    const startedAt = table ? kernel.state.tableTimers[table] : undefined
    seatTimer.value = startedAt ? `入座 ${Math.floor((Date.now() - startedAt) / 60000)} 分` : ''
  }

  function startClock() {
    tickClock()
    if (clockTimer) {
      clearInterval(clockTimer)
    }
    clockTimer = setInterval(tickClock, 1000)
  }

  async function showApp(options: ShowAppOptions = {}) {
    appVisible.value = true
    startClock()
    if (!options.skipStaffLive) {
      await data.startStaffLive()
    }
    if (!options.skipHome) {
      router.showPage('home')
    }
  }

  async function checkLogin() {
    try {
      const passed = await authGate.verifyPosLogin(loginPassword.value, kernel.systemPassword)
      if (passed) {
        sessionStorage.setItem('isLoggedIn', 'true')
        loginErrorVisible.value = false
        await showApp()
        return
      }
      loginErrorVisible.value = true
      loginPassword.value = ''
    } catch (error) {
      alert(`登入錯誤: ${getErrorMessage(error)}`)
    }
  }

  function goHome() {
    router.showPage('home')
  }

  return {
    appVisible,
    loginPassword,
    loginErrorVisible,
    systemTime,
    seatTimer,
    showApp,
    checkLogin,
    goHome,
  }
}
