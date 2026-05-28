import type { PosIncomingOrder } from '@/features/pos-kernel/types'

export const POS_SALES_SERVICE_KEY = 'pos-sales'

export type PosSalesService = {
  showApp(options?: { skipHome?: boolean }): Promise<void>
  openTableSelect(): Promise<void>
  goHome(): void
  renderCart(): void
  renderTableGrid(): Promise<void>
  showIncomingOrderModal(table: string, orderData: PosIncomingOrder): void
  closeIncomingOrderModal(): void
  closeCheckoutModal(): void
  fixAllOrderIds(): Promise<void>
}
