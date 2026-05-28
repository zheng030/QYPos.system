import {
  renderAdminDashboard,
  renderClockView,
  renderHeader,
  renderIndividualDashboard,
  renderLogin,
} from './render-panels'
import { renderChangePassword, renderEmployees, renderModal, renderReports } from './render-shell'
import { runtime, state } from './store'
import { startClockTimer } from './utils'

function renderView() {
  switch (state.currentView) {
    case 'dashboard':
      return renderAdminDashboard()
    case 'individual':
      return renderIndividualDashboard()
    case 'reports':
      return renderReports()
    case 'employees':
      return renderEmployees()
    case 'password':
      return renderChangePassword()
    default:
      return renderClockView()
  }
}

export function render() {
  if (!runtime.rootEl) return
  if (state.loading) {
    runtime.rootEl.innerHTML = `<div class="checkin-loading">載入中...</div>`
    return
  }
  if (!state.currentUserId) {
    runtime.rootEl.innerHTML = renderLogin()
    return
  }
  runtime.rootEl.innerHTML = `${renderHeader()}<div class="checkin-content">${renderView()}</div>${renderModal()}`
  startClockTimer()
  if (state.currentView === 'individual' && state.chartMode === 'month') {
    requestAnimationFrame(() => {
      const scroller = runtime.rootEl?.querySelector('.checkin-chart-scroll.is-scrollable')
      if (scroller) scroller.scrollLeft = scroller.scrollWidth
    })
  }
  if (runtime.focusEmployeeSearch && state.currentView === 'employees') {
    runtime.focusEmployeeSearch = false
    requestAnimationFrame(() => {
      const input = runtime.rootEl?.querySelector<HTMLInputElement>('[data-action="employee-search"]')
      if (!input) return
      input.focus()
      const len = input.value.length
      if (typeof input.setSelectionRange === 'function') input.setSelectionRange(len, len)
    })
  }
}
