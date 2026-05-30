import type { CorePosState, PosIncomingOrder, PosSystemPasswordConfig } from '@/features/pos-kernel/types'
import type { AuthGate } from '@/shared/auth-gate'
import { findElement, requireInput } from '@/shared/dom-helpers'
import { getErrorMessage } from '@/shared/errors'

type UiBridgeDeps = {
  state: CorePosState
  systemPassword: PosSystemPasswordConfig
  getShowApp: () => (options?: { skipHome?: boolean; skipStaffLive?: boolean }) => Promise<void>
  renderTableGrid: () => Promise<void> | void
  renderCart: () => void
  showIncomingOrderModal: (table: string, orderData: PosIncomingOrder) => void
  closeIncomingOrderModal: () => void
  authGate: AuthGate
}

type RefreshUiOptions = {
  includeAnalytics?: boolean
  includeAdmin?: boolean
}

function normalizeCartCollection(cart: CorePosState['tableCarts'][string]) {
  if (Array.isArray(cart)) return [...cart]
  if (cart && typeof cart === 'object') return Object.values(cart)
  return []
}

function normalizeIncomingQueue(queue: CorePosState['incomingOrders'][string]) {
  if (Array.isArray(queue)) return [...queue]
  if (queue && typeof queue === 'object') return Object.values(queue)
  return []
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

    const table = deps.state.selectedTable
    const currentCart = normalizeCartCollection(deps.state.tableCarts[table])
    if (document.body.classList.contains('customer-mode')) {
      deps.state.sentItems = currentCart.map((item) => ({ ...item, isSent: true }))
      sessionStorage.setItem('sentItems', JSON.stringify(deps.state.sentItems))
      deps.state.entryCartSignature = JSON.stringify(deps.state.cart || [])
      deps.renderCart()
      return
    }

    deps.state.cart = currentCart
    deps.state.entryCartSignature = JSON.stringify(deps.state.cart || [])
    syncCurrentTableInputs()
    deps.renderCart()
  }

  async function refreshUiAfterDataChange(_options: RefreshUiOptions = {}) {
    const tableSelect = findElement('tableSelect')
    if (isVisible(tableSelect, 'block')) {
      await deps.renderTableGrid()
    }

    refreshOrderPageState()
  }

  function checkIncomingOrders() {
    for (const [table, queue] of Object.entries(deps.state.incomingOrders)) {
      const items = normalizeIncomingQueue(queue)
      if (items.length > 0) {
        deps.showIncomingOrderModal(table, items[0])
        return
      }
    }
    deps.closeIncomingOrderModal()
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
    checkIncomingOrders,
    checkLogin,
  }
}
