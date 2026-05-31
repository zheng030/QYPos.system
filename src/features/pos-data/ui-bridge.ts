import type { CorePosState, PosSystemPasswordConfig } from '@/features/pos-kernel/types'
import type { AuthGate } from '@/shared/auth-gate'
import { findElement, requireInput } from '@/shared/dom-helpers'
import { getErrorMessage } from '@/shared/errors'

type UiBridgeDeps = {
  state: CorePosState
  systemPassword: PosSystemPasswordConfig
  getShowApp: () => (options?: { skipHome?: boolean; skipStaffLive?: boolean }) => Promise<void>
  renderTableGrid: () => Promise<void> | void
  renderMenu: () => void
  renderCart: () => void
  renderProductManagement: () => void
  showPendingBatchOverlay: () => void
  closePendingBatchOverlay: () => void
  authGate: AuthGate
}

type RefreshUiOptions = {
  includeAnalytics?: boolean
  includeAdmin?: boolean
}

function isVisible(element: HTMLElement | null, display: string) {
  return element?.style.display === display
}

function setInputValue(id: string, value: string) {
  const element = findElement<HTMLInputElement>(id)
  if (element) element.value = value
}

export function createUiBridgeModule(deps: UiBridgeDeps) {
  function syncCurrentTableInputs() {
    const table = deps.state.selectedTable
    if (!table) return
    const info = deps.state.tableCustomers[table] || { name: '', phone: '' }
    setInputValue('custName', info.name || '')
    setInputValue('custPhone', info.phone || '')
  }

  function refreshOrderPageState() {
    const orderPage = findElement('orderPage')
    if (!isVisible(orderPage, 'block') || !deps.state.selectedTable) {
      return
    }

    deps.renderMenu()

    if (document.body.classList.contains('customer-mode')) {
      deps.renderCart()
      return
    }

    syncCurrentTableInputs()
    deps.renderCart()
  }

  function refreshAdminState(options: RefreshUiOptions) {
    if (options.includeAdmin === false) return
    const productPage = findElement('productPage')
    if (isVisible(productPage, 'block')) {
      deps.renderProductManagement()
    }
  }

  async function refreshUiAfterDataChange(options: RefreshUiOptions = {}) {
    const tableSelect = findElement('tableSelect')
    if (isVisible(tableSelect, 'block')) {
      await deps.renderTableGrid()
    }

    refreshOrderPageState()
    refreshAdminState(options)
  }

  function checkPendingBatches() {
    for (const [_table, batches] of Object.entries(deps.state.pendingBatchPreviews)) {
      const firstBatch = batches?.[0]
      if (firstBatch) {
        deps.showPendingBatchOverlay()
        return
      }
    }
    deps.closePendingBatchOverlay()
  }

  async function checkLogin() {
    try {
      const input = requireInput('loginPass').value
      const passed = await deps.authGate.verifyPosLogin(input, deps.systemPassword)
      if (passed) {
        sessionStorage.setItem('isLoggedIn', 'true')
        const loginError = findElement('loginError')
        if (loginError) loginError.style.display = 'none'
        await deps.getShowApp()()
        return
      }

      const loginError = findElement('loginError')
      if (loginError) loginError.style.display = 'block'
      requireInput('loginPass').value = ''
    } catch (error) {
      alert(`登入錯誤: ${getErrorMessage(error)}`)
    }
  }

  return {
    refreshUiAfterDataChange,
    checkPendingBatches,
    checkLogin,
  }
}
