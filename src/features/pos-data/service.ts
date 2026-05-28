import type { PosOrder, PosRootName, SyncLogRecord } from '@/features/pos-kernel/types'
import type { AttendanceService } from '@/shared/attendance-service'

export const POS_DATA_SERVICE_KEY = 'pos-data'

export type PosDataChangeEvent = {
  roots: string[]
}

export type PosDataService = {
  attendance: AttendanceService
  ensureRoots(roots?: string[]): Promise<void>
  ensureDataSubscriptions(roots: string[]): Promise<void>
  initRealtimeData(): Promise<void>
  saveAllToCloud(updates: Record<string, unknown>): Promise<void>
  subscribe(listener: (event: PosDataChangeEvent) => void): () => void
  emitChange(roots: string[]): void
  getRootValue(root: PosRootName | string): unknown
  getVisibleOrders(): PosOrder[]
  getTodayMaxBaseSeq(): number
  getOrdersByDate(targetDate: Date): PosOrder[]
  toggleStockStatus(name: string, checked: boolean): Promise<void>
  toggleParentWithOptions(name: string, checked: boolean): Promise<void>
  toggleOptionStock(name: string, option: string, checked: boolean): Promise<void>
  updateItemData(name: string, type: string, value: string): Promise<void>
  checkLogin(): Promise<void>
  checkIncomingOrders(): void
  fixAllOrderIds(): Promise<void>
  downloadSyncLog(): void
  downloadLocalStorage(): void
  getSyncLog(): SyncLogRecord[]
}
