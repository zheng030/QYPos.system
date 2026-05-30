import type { PosReceiptData } from '@/features/pos-kernel/types'

export const POS_SALES_SERVICE_KEY = 'pos-sales'

export type PosSalesService = {
  showApp(options?: { skipHome?: boolean; skipStaffLive?: boolean }): Promise<void>
  openTableSelect(): Promise<void>
  openSettingsPage(): Promise<void>
  goHome(): void
  renderMenu(): void
  renderCart(): void
  renderTableGrid(): Promise<void>
  showPendingBatchOverlay(): void
  closePendingBatchOverlay(): void
  closeCheckoutModal(): void
  printReceipt(data: PosReceiptData, isTicket?: boolean): Promise<void>
}
