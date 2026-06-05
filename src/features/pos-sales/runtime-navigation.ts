import type { PosDataService } from '@/features/pos-data/service'
import type { PosKernelService } from '@/features/pos-kernel/service'
import type { PosOrderEntry } from '@/features/pos-kernel/types'
import { findElement } from '@/shared/dom-helpers'
import { renderQrCode } from '@/shared/qrcode'
import { persistCustomerInfoSilently } from './runtime-support'
import { formatCurrency } from './runtime-utils'

type RuntimeNavigationDeps = {
  kernel: PosKernelService
  data: PosDataService
  maybeCurrentTable: () => string | null
  currentDraftEntries: () => PosOrderEntry[]
  readCustomerInfo: () => { name: string; phone: string; orderId: string | number | undefined }
}

export function createPosSalesNavigationModule({
  kernel,
  data,
  maybeCurrentTable,
  currentDraftEntries,
  readCustomerInfo,
}: RuntimeNavigationDeps) {
  async function showQrModal(table: string) {
    const modal = findElement('qrCodeModal')
    const container = findElement('qrcode')
    const title = findElement('qrTableTitle')
    if (!modal || !container || !title) return
    title.innerText = table
    const base = `${location.origin}${location.pathname}?table=${encodeURIComponent(table)}`
    await renderQrCode(container, base, 220)
    modal.style.display = 'flex'
  }

  function closeQrModal() {
    const modal = findElement('qrCodeModal')
    const container = findElement('qrcode')
    if (modal) modal.style.display = 'none'
    if (container) container.innerHTML = ''
  }

  function toggleQrMode() {
    kernel.state.isQrMode = !kernel.state.isQrMode
    document.body.classList.toggle('qr-select-mode', kernel.state.isQrMode)
  }

  function startClock() {
    const systemTime = findElement('systemTime')
    const seatTimer = findElement('seatTimer')
    const update = () => {
      if (systemTime) {
        systemTime.innerText = new Date().toLocaleString('zh-TW', { hour12: false })
      }
      if (!seatTimer || !kernel.state.selectedTable) {
        if (seatTimer) seatTimer.innerText = ''
        return
      }
      const startedAt = kernel.state.tableTimers[kernel.state.selectedTable]
      if (!startedAt) {
        seatTimer.innerText = ''
        return
      }
      const diffMinutes = Math.floor((Date.now() - startedAt) / 60000)
      seatTimer.innerText = `入座 ${diffMinutes} 分`
    }
    update()
    if (kernel.state.seatTimerInterval) {
      clearInterval(kernel.state.seatTimerInterval)
    }
    kernel.state.seatTimerInterval = setInterval(update, 1000)
  }

  async function updateCustomerInfoSilently() {
    const table = maybeCurrentTable()
    if (!table) return
    await persistCustomerInfoSilently({
      mode: kernel.state.currentMode,
      table,
      entries: currentDraftEntries(),
      customer: readCustomerInfo(),
      saveCustomerDraft: data.saveCustomerDraft,
      updateTableCustomer: data.updateTableCustomer,
    })
  }

  function closeSummaryModal() {
    const modal = findElement('summaryModal')
    if (modal) {
      modal.style.display = 'none'
    }
  }

  async function openCloseBusinessModal() {
    const modal = findElement('summaryModal')
    const orders = await data.listClosedOrdersForBusinessDay(new Date())
    const total = orders.reduce((sum, order) => sum + (order.total || 0), 0)
    const countEl = findElement('sumCount')
    const totalEl = findElement('sumTotal')
    if (countEl) countEl.innerText = `${orders.length} 單`
    if (totalEl) totalEl.innerText = formatCurrency(total)
    if (modal) {
      modal.style.display = 'flex'
    }
  }

  return {
    showQrModal,
    closeQrModal,
    toggleQrMode,
    startClock,
    updateCustomerInfoSilently,
    closeSummaryModal,
    openCloseBusinessModal,
  }
}
