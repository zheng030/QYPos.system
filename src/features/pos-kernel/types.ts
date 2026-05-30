import type { AttendanceEmployeesMap, AttendanceRecordsMap } from '@/shared/attendance-service'

export type PosPrice = number
export type PosItemId = string
export const MENU_CATEGORY_KEYS = [
  'pasta_risotto',
  'bread_set',
  'salad',
  'plated_main',
  'a_la_carte',
  'soup',
  'drink',
] as const
export const POS_CATEGORY_KEYS = [...MENU_CATEGORY_KEYS, 'other', 'extra'] as const
export type PosMenuCategoryKey = (typeof MENU_CATEGORY_KEYS)[number]
export type PosCategoryKey = (typeof POS_CATEGORY_KEYS)[number]
export const POS_CATEGORY_LABELS: Record<PosCategoryKey, string> = {
  pasta_risotto: '義大利麵 / 燉飯',
  bread_set: '麵包餐',
  salad: '沙拉',
  plated_main: '排餐',
  a_la_carte: '單品',
  soup: '湯品',
  drink: '飲品',
  other: '其他 / 未知',
  extra: '整單調整',
}
export type PosKitchenStation = 'kitchen'
export type PosCourseKind = 'food' | 'drink' | 'addon'
export type PosItemKind = 'bundle' | 'single'
export type PosSelectionValue = string
export type PosEntryStatus = 'draft' | 'pending' | 'accepted'
export type PosBatchSource = 'customer' | 'staff'
export type PosLineRole = 'main' | 'included' | 'upgrade' | 'standalone'
export type PosBatchStatus = 'pending' | 'accepted'
export type PosOwnerName = '景偉' | '小飛' | '威志'
export type PosOwnerMode = 'cost' | 'finance'
export type PosReportRange = 'day' | 'week' | 'month' | 'custom' | 'specific'

export type PosInventoryMap = Record<string, boolean | undefined>
export type PosItemCostsMap = Record<string, number | undefined>
export type PosItemPricesMap = Record<string, PosPrice | undefined>
export type PosTableStatusMap = Record<string, string | undefined>
export type PosTableTimerMap = Record<string, number | undefined>
export type PosTableSplitCounterMap = Record<string, number | undefined>
export type PosRootName =
  | 'historyOrders'
  | 'tableTimers'
  | 'tableStatuses'
  | 'tableCustomers'
  | 'itemCosts'
  | 'itemPrices'
  | 'inventory'
  | 'attendanceEmployees'
  | 'attendanceRecords'
  | 'ownerPasswords'

export type PosOwnerAuthRecord = {
  passwordHash: string
  passwordSalt: string
  updatedAt?: number
}

export type PosOwnerAuthMap = Record<string, PosOwnerAuthRecord | undefined>
export type PosOwnerPasswordLegacyMap = Record<string, string>
export type SyncLogRecord = Record<string, unknown>

export type PosSystemPasswordConfig = {
  passwordSalt: string
  passwordHash: string
}

export type PosSelectionOption = {
  optionKey: string
  value: PosSelectionValue
  label: string
  priceDelta: number
  targetItemId?: PosItemId
  inventoryKey: string
  categoryKey: PosCategoryKey
  station: PosKitchenStation
  soldOutKey?: string
}

export type PosSelectionRule =
  | {
      id: string
      kind: 'single'
      label: string
      required: boolean
      summaryLabel?: string
      options: PosSelectionOption[]
    }
  | {
      id: string
      kind: 'text'
      label: string
      required: boolean
      summaryLabel?: string
      placeholder?: string
    }

export type PosBundleIncludeRule = {
  id: string
  label: string
  itemId: PosItemId
  inventoryKey: string
  categoryKey: PosCategoryKey
  upgradeGroupId?: string
  defaultSelections?: Record<string, PosSelectionValue>
}

export type PosBundleUpgradeGroup = {
  id: string
  label: string
  required: boolean
  summaryLabel?: string
  options: PosSelectionOption[]
}

export type PosMenuItem = {
  id: PosItemId
  productKey: PosItemId
  inventoryKey: string
  name: string
  shortName?: string
  categoryKey: PosCategoryKey
  kind: PosItemKind
  basePrice: PosPrice
  price?: PosPrice
  station: PosKitchenStation
  courseKind: PosCourseKind
  menuModes?: PosBatchSource[]
  soldOutKey?: string
  tags?: string[]
  selections?: PosSelectionRule[]
  includes?: PosBundleIncludeRule[]
  upgradeGroups?: PosBundleUpgradeGroup[]
}

export type PosMenuSection = {
  id: string
  label: string
  items: PosMenuItem[]
}

export type PosMenuCategory = {
  key: PosMenuCategoryKey
  label: string
  shortLabel: string
  description?: string
  sections: PosMenuSection[]
  [key: string]: unknown
}

export type PosMenuData = Partial<Record<PosMenuCategoryKey, PosMenuCategory>> & Record<string, PosMenuCategory>

export type PosMenuMeta = {
  orderedCategoryKeys: PosMenuCategoryKey[]
  categories: PosMenuData
  itemsById: Record<PosItemId, PosMenuItem>
}

export type PosBuilderSelectionMap = Record<string, PosSelectionValue>

export type PosBuilderState = {
  itemId: PosItemId
  quantity: number
  selections: PosBuilderSelectionMap
  includeSelections: Record<string, PosBuilderSelectionMap>
  upgradeSelections: Record<string, PosSelectionValue>
  editingEntryId: string | null
  target: 'customer-draft' | 'staff-draft' | 'submitted-batch'
  batchId?: string
}

export type PosEntrySummary = {
  title: string
  subtitle: string
  quantityLabel: string
  totalLabel: string
}

export type PosOrderLine = {
  lineId: string
  groupId: string
  parentLineId?: string
  role: PosLineRole
  catalogKey: PosItemId
  inventoryKey: string
  categoryKey: PosCategoryKey
  displayName: string
  shortName: string
  station: PosKitchenStation
  courseKind: PosCourseKind
  quantity: number
  unitPrice: number
  priceDelta: number
  lineTotal: number
  selections?: Record<string, PosSelectionValue>
  selectionSummary: string
  isTreat: boolean
  unitCost?: number
  sourceEntryId: string
}

export type PosOrderGroup = {
  entryId: string
  groupId: string
  itemId: PosItemId
  catalogKey: PosItemId
  inventoryKey: string
  itemName: string
  shortName: string
  categoryKey: PosCategoryKey
  quantity: number
  status: PosEntryStatus
  source: PosBatchSource
  createdAt: number
  updatedAt: number
  selections: PosBuilderSelectionMap
  includeSelections: Record<string, PosBuilderSelectionMap>
  upgradeSelections: Record<string, PosSelectionValue>
  lines: PosOrderLine[]
  subtotal: number
  summary: PosEntrySummary
}

export type PosOrderEntry = PosOrderGroup

export type PosOrderBatch = {
  batchId: string
  source: PosBatchSource
  status: PosBatchStatus
  table: string
  customer: PosTableCustomer
  createdAt: number
  updatedAt: number
  acceptedAt?: number
  requestLabel: string
  entries: PosOrderEntry[]
  subtotal: number
}

export type PosReceiptData = {
  seq: number | string
  table?: string
  time: string
  lines: PosOrderLine[]
  original: number
  total: number
}

export type PosTableCustomer = {
  name?: string
  phone?: string
  orderId?: number | string
  [key: string]: unknown
}

export type PosTableCustomersMap = Record<string, PosTableCustomer | undefined>
export type PosLiveTableDraftMap = Record<string, PosOrderEntry[] | undefined>
export type PosLivePendingBatchMap = Record<string, PosOrderBatch[] | undefined>
export type PosLiveSubmittedBatchMap = Record<string, PosOrderBatch[] | undefined>
export type PosStaffDraftMap = Record<string, PosOrderEntry[] | undefined>

export type PosBatchListItem = {
  batchId: string
  label: string
  statusLabel: string
  subtitle: string
  total: number
  count: number
  createdAt: number
}

export type PosMenuFilterState = {
  activeTab: 'menu' | 'cart' | 'orders'
  activeCategoryKey: PosMenuCategoryKey
}

export type PosOrder = {
  orderId?: string
  bizDateKey?: string
  monthKey?: string
  table?: string
  formattedSeq?: string
  seq?: number
  time: string
  timestamp?: number
  customerName?: string
  customerPhone?: string
  splitCounter?: number
  subtotal?: number
  total: number
  batchIds?: string[]
  entries?: PosOrderGroup[]
  lines?: PosOrderLine[]
  seat?: string
  originalTotal?: number
  isClosed?: boolean
  [key: string]: unknown
}

export type PosRevenueDetailItem = {
  name?: string
  categoryLabel?: string
  price?: number
  cost?: number
  qty?: number
  amount?: number
  seat?: string
  seq?: number | string
  time?: string
}

export type PosRevenueDetails = Record<PosCategoryKey | 'total', PosRevenueDetailItem[]>

export type PosFinanceCategoryStats = {
  revenue: number
  cost: number
}

export type PosFinanceStats = {
  totalRevenue: number
  totalCost: number
  byCategory: Record<PosCategoryKey, PosFinanceCategoryStats>
}

export type PosRevenueBucket = keyof PosRevenueDetails

export type PosRootValueMap = {
  tableTimers: PosTableTimerMap
  tableStatuses: PosTableStatusMap
  tableCustomers: PosTableCustomersMap
  itemCosts: PosItemCostsMap
  itemPrices: PosItemPricesMap
  inventory: PosInventoryMap
  attendanceEmployees: AttendanceEmployeesMap
  attendanceRecords: AttendanceRecordsMap
  ownerPasswords: PosOwnerAuthMap
}

export type PosSyncRecord = {
  ts: number
  type: string
  caller?: string
  roots?: string[]
  paths?: string[]
  beforeValues?: Record<string, unknown>
  afterValues?: Record<string, unknown>
  beforeValue?: unknown
  afterValue?: unknown
  beforeRev?: number | null
  afterRev?: number | null
  status?: 'pending' | 'ok' | 'error'
  doneTs?: number
  error?: string
  root?: string
}

export type PosToastOptions = {
  count?: number
}

export type PosToastItemState = {
  count: number
  el: HTMLElement
  hideTimer: ReturnType<typeof setTimeout> | null
  removeTimer: ReturnType<typeof setTimeout> | null
}

export type PosToastState = {
  items: Map<string, PosToastItemState>
}

export type CorePosState = {
  tableTimers: PosTableTimerMap
  tableStatuses: PosTableStatusMap
  tableCustomers: PosTableCustomersMap
  itemCosts: PosItemCostsMap
  itemPrices: PosItemPricesMap
  inventory: PosInventoryMap
  attendanceEmployees: AttendanceEmployeesMap
  attendanceRecords: AttendanceRecordsMap
  ownerPasswords: PosOwnerAuthMap
  tableDrafts: PosLiveTableDraftMap
  pendingBatches: PosLivePendingBatchMap
  submittedBatches: PosLiveSubmittedBatchMap
  staffDrafts: PosStaffDraftMap
  selectedTable: string | null
  currentMode: 'staff' | 'customer'
  activeDraftEntries: PosOrderEntry[]
  activePendingBatches: PosOrderBatch[]
  activeSubmittedBatches: PosOrderBatch[]
  tableBatchCounts: Record<string, number | undefined>
  tableSplitCounters: Record<string, number | undefined>
  seatTimerInterval: ReturnType<typeof setInterval> | null
  currentBuilder: PosBuilderState | null
  currentPendingBatchId: string | null
  currentPendingTable: string | null
  isQrMode: boolean
  isHistorySimpleMode: boolean
  menuFilter: PosMenuFilterState
  syncLog: SyncLogRecord[]
}
