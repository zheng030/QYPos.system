import type { AttendanceEmployeesMap, AttendanceRecordsMap } from '@/shared/attendance-service'
import type { FlavorSelection } from '@/shared/flavor'

export type PosPrice = number | string
export type PosInventoryMap = Record<string, boolean | undefined>
export type PosItemCostsMap = Record<string, number | undefined>
export type PosItemPricesMap = Record<string, PosPrice | undefined>
export type PosOwnerPasswordsMap = Record<string, string>
export type PosTableStatusMap = Record<string, string | undefined>
export type PosTableTimerMap = Record<string, number | undefined>
export type PosTableSplitCounterMap = Record<string, number | undefined>
export type PosTableBatchCountMap = Record<string, number | undefined>
export type SyncLogRecord = Record<string, unknown>
export type PosSystemPasswordConfig = {
  passwordSalt: string
  passwordHash: string
}
export type PosRootName =
  | 'historyOrders'
  | 'tableTimers'
  | 'tableCarts'
  | 'tableStatuses'
  | 'tableCustomers'
  | 'tableSplitCounters'
  | 'itemCosts'
  | 'itemPrices'
  | 'inventory'
  | 'attendanceEmployees'
  | 'attendanceRecords'
  | 'incomingOrders'
  | 'tableBatchCounts'
  | 'ownerPasswords'
export type PosReportRange = 'day' | 'week' | 'month' | 'custom' | 'specific'
export type PosOwnerName = '景偉' | '小飛' | '威志'
export type PosOwnerMode = 'cost' | 'finance'

export type PosMenuItem = {
  name: string
  price: PosPrice
}

export type PosMenuSection = PosMenuItem[]
export type PosMenuCategory = PosMenuSection | Record<string, PosMenuSection>
export type PosMenuData = Record<string, PosMenuCategory>

export type PosDiscount = {
  type: 'none' | 'percent' | 'amount'
  value: number
}

export type PosTableCustomer = {
  name?: string
  phone?: string
  orderId?: number | string
  [key: string]: unknown
}

export type PosTableCustomersMap = Record<string, PosTableCustomer | undefined>

export type PosCartItem = PosMenuItem & {
  type?: string
  variant?: string
  flavor?: FlavorSelection | null
  isNew?: boolean
  isTreat?: boolean
  batchIdx?: number
  batchId?: number | string
  sentAt?: number
  incomingIdx?: number
  isSent?: boolean
  count?: number
  [key: string]: unknown
}

export type PosMergedCartItem = PosCartItem & {
  count: number
}

export type PosCartCollection = PosCartItem[] | Record<string, PosCartItem>
export type PosTableCartsMap = Record<string, PosCartCollection | undefined>

export type PosOrder = {
  seat?: string
  table?: string
  formattedSeq?: number | string
  seq?: number | string
  time: string
  timestamp?: number
  items: PosCartItem[]
  total: number
  originalTotal?: number
  original?: number
  customerName?: string
  customerPhone?: string
  isClosed?: boolean
  [key: string]: unknown
}

export type PosIncomingOrder = {
  items: PosCartItem[]
  customer?: PosTableCustomer
  batchId?: number
  timestamp?: number
  [key: string]: unknown
}

export type PosIncomingOrderQueue = PosIncomingOrder[] | Record<string, PosIncomingOrder>
export type PosIncomingOrdersMap = Record<string, PosIncomingOrderQueue | undefined>

export type PosCustomItemState = {
  name: string
  price: number
  type?: string
} | null

export type PosRevenueDetailItem = {
  name?: string
  price?: number
  cost?: number
  amount?: number
  seat?: string
  seq?: number | string
  time?: string
}

export type PosRevenueDetails = Record<'bar' | 'bbq' | 'unknown' | 'extra', PosRevenueDetailItem[]>

export type PosFinanceStats = {
  barRev: number
  barCost: number
  bbqRev: number
  bbqCost: number
  unknownRev: number
  unknownCost: number
  extraRev: number
  totalRev: number
}

export type PosRevenueBucket = keyof PosRevenueDetails

export type PosRootValueMap = {
  historyOrders: PosOrder[]
  tableTimers: PosTableTimerMap
  tableCarts: PosTableCartsMap
  tableStatuses: PosTableStatusMap
  tableCustomers: PosTableCustomersMap
  tableSplitCounters: PosTableSplitCounterMap
  itemCosts: PosItemCostsMap
  itemPrices: PosItemPricesMap
  inventory: PosInventoryMap
  attendanceEmployees: AttendanceEmployeesMap
  attendanceRecords: AttendanceRecordsMap
  incomingOrders: PosIncomingOrdersMap
  tableBatchCounts: PosTableBatchCountMap
  ownerPasswords: PosOwnerPasswordsMap
}

export type PosReceiptData = {
  seq: number | string
  table?: string
  time: string
  items: PosCartItem[] | PosMergedCartItem[] | Record<string, PosCartItem>
  original: number
  total: number
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

export type AddToCartOptions = {
  variant?: string
  flavor?: FlavorSelection | null
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
  historyOrders: PosOrder[]
  tableTimers: PosTableTimerMap
  tableCarts: PosTableCartsMap
  tableStatuses: PosTableStatusMap
  tableCustomers: PosTableCustomersMap
  tableSplitCounters: PosTableSplitCounterMap
  itemCosts: PosItemCostsMap
  itemPrices: PosItemPricesMap
  inventory: PosInventoryMap
  attendanceEmployees: AttendanceEmployeesMap
  attendanceRecords: AttendanceRecordsMap
  ownerPasswords: PosOwnerPasswordsMap
  incomingOrders: PosIncomingOrdersMap
  tableBatchCounts: PosTableBatchCountMap
  selectedTable: string | null
  cart: PosCartItem[]
  sentItems: PosCartItem[]
  seatTimerInterval: ReturnType<typeof setInterval> | null
  tempCustomItem: PosCustomItemState
  isExtraShot: boolean
  tempLeftList: PosCartItem[]
  tempRightList: PosCartItem[]
  currentOriginalTotal: number
  finalTotal: number
  currentDiscount: PosDiscount
  discountedTotal: number
  isServiceFeeEnabled: boolean
  isQrMode: boolean
  currentIncomingTable: string | null
  entryCartSignature: string
  historyViewDate: Date
  isCartSimpleMode: boolean
  isHistorySimpleMode: boolean
  currentCategory: string | null
  currentFlavorSelection: FlavorSelection
  latestVisibleOrders: PosOrder[] | null
  reprintItemsForModal: PosMergedCartItem[] | null
  syncLog: SyncLogRecord[]
}
