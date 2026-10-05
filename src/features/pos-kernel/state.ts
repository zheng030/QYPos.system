import type { CorePosState } from './types'

export function createPosKernelState(): CorePosState {
  return {
    tableTimers: {},
    tableStatuses: {},
    tableCustomers: {},
    itemCosts: {},
    itemPrices: {},
    inventory: {},
    attendanceEmployees: {},
    attendanceRecords: {},
    tableDrafts: {},
    pendingBatchPreviews: {},
    pendingBatches: {},
    submittedBatches: {},
    staffDrafts: {},
    selectedTable: null,
    currentMode: 'staff',
    activeDraftEntries: [],
    activePendingBatches: [],
    activeSubmittedBatches: [],
    tableSplitCounters: {},
    syncLog: [],
  }
}
