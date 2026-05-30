import type {
  PosOrder,
  PosOrderBatch,
  PosOrderEntry,
  PosOwnerAuthRecord,
  PosTableCustomer,
  SyncLogRecord,
} from '@/features/pos-kernel/types'
import type { AttendanceService } from '@/shared/attendance-service'
import type {
  V3CatalogRevisionEvent,
  V3DailyItemStat,
  V3DailySummary,
  V3DailySummaryRangeEvent,
  V3HistoryRangeEvent,
  V3ItemStatsRangeEvent,
  V3OwnerAuthRevisionEvent,
} from './rtdb-v3-types'

export const POS_DATA_SERVICE_KEY = 'pos-data'

export type PosDataChangeEvent = {
  roots: string[]
}

export type PosDataService = {
  attendance: AttendanceService
  startStaffLive(): Promise<void>
  startTableLiveSession(mode: 'staff' | 'customer', table: string): Promise<void>
  stopTableLiveSession(): void
  ensureCatalog(): Promise<void>
  ensureOwnerAuth(): Promise<void>
  listClosedOrdersByDay(targetDate: Date): Promise<PosOrder[]>
  listClosedOrdersByRange(start: Date, endExclusive: Date): Promise<PosOrder[]>
  loadDailySummariesRange(start: Date, endExclusive: Date): Promise<Record<string, V3DailySummary>>
  loadItemStatsRange(start: Date, endExclusive: Date): Promise<Record<string, Record<string, V3DailyItemStat>>>
  watchCatalogRevision(listener: (event: V3CatalogRevisionEvent) => void): () => void
  watchOwnerAuthRevision(listener: (event: V3OwnerAuthRevisionEvent) => void): () => void
  watchClosedOrdersRange(start: Date, endExclusive: Date, listener: (event: V3HistoryRangeEvent) => void): () => void
  watchDailySummariesRange(
    start: Date,
    endExclusive: Date,
    listener: (event: V3DailySummaryRangeEvent) => void
  ): () => void
  watchItemStatsRange(start: Date, endExclusive: Date, listener: (event: V3ItemStatsRangeEvent) => void): () => void
  readDailySummariesRange(start: Date, endExclusive: Date): Record<string, V3DailySummary>
  readItemStatsRange(start: Date, endExclusive: Date): Record<string, Record<string, V3DailyItemStat>>
  saveCustomerDraft(
    table: string,
    entries: PosOrderEntry[],
    customer: PosTableCustomer
  ): Promise<{ displaySeqBase: number }>
  submitCustomerDraft(table: string, entries: PosOrderEntry[], customer: PosTableCustomer): Promise<PosOrderBatch>
  discardCustomerDraft(table: string): Promise<void>
  acceptPendingBatch(table: string, batchId: string): Promise<PosOrderBatch | null>
  rejectPendingBatch(table: string, batchId: string): Promise<void>
  saveStaffDraft(table: string, entries: PosOrderEntry[]): Promise<void>
  createStaffBatch(table: string, entries: PosOrderEntry[], customer?: PosTableCustomer): Promise<PosOrderBatch>
  updateSubmittedBatch(table: string, batchId: string, entries: PosOrderEntry[]): Promise<PosOrderBatch | null>
  checkoutSubmittedBatches(payload: {
    table: string
    entryIds?: string[]
    entries?: PosOrderEntry[]
    customer: PosTableCustomer | undefined
    paidTotal: number
    originalTotal: number
  }): Promise<PosOrder>
  deleteClosedOrder(order: PosOrder): Promise<void>
  setOwnerPassword(ownerName: string, record: PosOwnerAuthRecord): Promise<void>
  subscribe(listener: (event: PosDataChangeEvent) => void): () => void
  emitChange(roots: string[]): void
  toggleStockStatus(itemId: string, checked: boolean): Promise<void>
  toggleInventoryBatch(batch: Record<string, boolean>): Promise<void>
  toggleOptionStock(itemId: string, option: string, checked: boolean): Promise<void>
  updateItemData(itemId: string, type: string, value: string): Promise<void>
  checkLogin(): Promise<void>
  checkPendingBatches(): void
  downloadSyncLog(): void
  getSyncLog(): SyncLogRecord[]
}
