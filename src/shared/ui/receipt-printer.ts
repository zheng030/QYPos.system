import { nextTick, shallowRef } from 'vue'

import type { PosReceiptData } from '@/features/pos-kernel/types'

export type ReceiptJob = {
  data: PosReceiptData
  title: string
}

const PRINT_FALLBACK_MS = 2000

// Renders one receipt into the print area, opens the browser print dialog, and clears the area once
// the dialog closes (or after a fallback timeout on browsers without afterprint).
export function createReceiptPrinter() {
  const job = shallowRef<ReceiptJob | null>(null)
  let cleanupTimer: number | null = null
  let removeListener: (() => void) | null = null

  function reset() {
    if (cleanupTimer !== null) {
      window.clearTimeout(cleanupTimer)
      cleanupTimer = null
    }
    removeListener?.()
    removeListener = null
    job.value = null
  }

  async function print(data: PosReceiptData, isTicket = false) {
    reset()
    job.value = { data, title: isTicket ? 'Kitchen 工作單' : '結帳明細' }
    await nextTick()

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finalize = () => {
        if (settled) {
          return
        }
        settled = true
        reset()
        resolve()
      }

      window.addEventListener('afterprint', finalize, { once: true })
      removeListener = () => {
        window.removeEventListener('afterprint', finalize)
      }
      cleanupTimer = window.setTimeout(finalize, PRINT_FALLBACK_MS)

      try {
        window.print()
      } catch (error) {
        reset()
        reject(error)
      }
    })
  }

  return { job, print }
}

export type ReceiptPrinter = ReturnType<typeof createReceiptPrinter>
