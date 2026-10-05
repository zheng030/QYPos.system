import { effectScope, type InjectionKey, inject } from 'vue'

import { createCheckinStore } from '@/features/checkin/checkin-store'
import { createAdminStore } from '@/features/pos-admin/admin-store'
import { createPosDataService } from '@/features/pos-data/runtime'
import { createPosKernel } from '@/features/pos-kernel/runtime'
import { createReportingStore } from '@/features/pos-reporting/reporting-store'
import { createNewOrderBell, NEW_ORDER_SOUND_URL } from '@/features/pos-sales/new-order-bell'
import { createSalesStore } from '@/features/pos-sales/sales-store'
import { createShellStore } from '@/features/pos-shell/shell-store'
import { bindBodyClass } from '@/shared/ui/body-class'
import { createImagePreview } from '@/shared/ui/image-preview'
import { createReceiptPrinter } from '@/shared/ui/receipt-printer'
import { createSoundPlayer } from '@/shared/ui/sound-player'
import { createToastService } from '@/shared/ui/toast'

import { createLiveState } from './live-state'
import { createPageRouter } from './page-router'

function createRuntime() {
  const kernel = createPosKernel()
  const data = createPosDataService(kernel)
  const router = createPageRouter()
  const live = createLiveState(kernel.state, data)
  const printer = createReceiptPrinter()
  const imagePreview = createImagePreview()
  const toast = createToastService()
  const bell = createNewOrderBell(createSoundPlayer(NEW_ORDER_SOUND_URL))

  bindBodyClass('receipt-printing', () => printer.job.value !== null)

  // Store creation order is also the order their page hooks run in.
  const shell = createShellStore({ kernel, data, router })
  const sales = createSalesStore({ kernel, data, live, router, printer, bell })
  const reporting = createReportingStore({ kernel, data, router, printReceipt: printer.print })
  const admin = createAdminStore({ kernel, data, live, router, toast })
  const checkin = createCheckinStore({ attendance: data.attendance, router })

  async function start() {
    const table = new URLSearchParams(location.search).get('table')
    if (table) {
      sessionStorage.removeItem('isLoggedIn')
      sales.setCustomerMode('customer')
      await shell.showApp({ skipHome: true, skipStaffLive: true })
      await Promise.all([
        sales.customerNotice.openForCustomer(),
        sales.openOrderPage(decodeURIComponent(table), { mode: 'customer' }),
      ])
    } else {
      sessionStorage.removeItem('customerMode')
      if (sessionStorage.getItem('isLoggedIn') === 'true') {
        await shell.showApp()
      }
    }
    await checkin.ensureData()
  }

  return { kernel, data, router, printer, imagePreview, toast, bell, shell, sales, reporting, admin, checkin, start }
}

export type PosRuntime = ReturnType<typeof createRuntime>

export const POS_RUNTIME_KEY: InjectionKey<PosRuntime> = Symbol('pos-runtime')

// The runtime lives for the whole page, so its effects run in a detached scope instead of a component.
export function createPosRuntime(): PosRuntime {
  const runtime = effectScope(true).run(createRuntime)
  if (!runtime) {
    throw new Error('Failed to create POS runtime')
  }
  return runtime
}

export function usePosRuntime() {
  const runtime = inject(POS_RUNTIME_KEY)
  if (!runtime) {
    throw new Error('POS runtime is not provided')
  }
  return runtime
}
