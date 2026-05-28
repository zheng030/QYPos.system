export const DATA_ROOT_KEYS = [
  'historyOrders',
  'tableTimers',
  'tableCarts',
  'tableStatuses',
  'tableCustomers',
  'tableSplitCounters',
  'itemCosts',
  'itemPrices',
  'inventory',
  'attendanceEmployees',
  'attendanceRecords',
  'incomingOrders',
  'tableBatchCounts',
  'ownerPasswords',
] as const

export const CUSTOMER_DATA_ROOT_KEYS = ['tableCarts', 'inventory', 'itemPrices', 'incomingOrders'] as const
export const ADMIN_BASE_ROOT_KEYS = ['incomingOrders', 'ownerPasswords'] as const
export const LOCAL_DATA_PREFIX = 'localData.'
export const LOCAL_REV_KEY = 'localRevisions'
export const REFRESH_UI_ROOTS = new Set([
  'historyOrders',
  'tableTimers',
  'tableCarts',
  'tableStatuses',
  'tableCustomers',
  'inventory',
  'incomingOrders',
])
