import { reactive } from 'vue'

import { shouldShowCustomerNotice } from '@/features/pos-kernel/customer-notice'
import type { PosCustomerNotice } from '@/features/pos-kernel/types'

export type CustomerNoticeGate = ReturnType<typeof createCustomerNoticeGate>

// Covers the menu from the first frame of a QR visit until the shop notice is read and confirmed.
export function createCustomerNoticeGate(readNotice: () => Promise<PosCustomerNotice | null>) {
  const state = reactive({ open: false, notice: null as PosCustomerNotice | null })

  async function openForCustomer() {
    state.open = true
    state.notice = null
    // A failed read must not keep customers out of the menu.
    const notice = await readNotice().catch(() => null)
    if (shouldShowCustomerNotice(notice)) {
      state.notice = notice
    } else {
      state.open = false
    }
  }

  function preview(notice: PosCustomerNotice) {
    state.notice = notice
    state.open = true
  }

  function confirm() {
    state.open = false
    state.notice = null
  }

  return { state, openForCustomer, preview, confirm }
}
