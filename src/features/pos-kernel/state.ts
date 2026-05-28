import { DEFAULT_FLAVOR_SELECTION } from '@/shared/flavor'

import { defaultOwnerPasswords } from './data'
import type { CorePosState, PosCartItem } from './types'

function readSentItems() {
  try {
    const raw = sessionStorage.getItem('sentItems')
    return raw ? (JSON.parse(raw) as PosCartItem[]) : []
  } catch {
    return []
  }
}

export const state: CorePosState = {
  historyOrders: [],
  tableTimers: {},
  tableCarts: {},
  tableStatuses: {},
  tableCustomers: {},
  tableSplitCounters: {},
  itemCosts: {},
  itemPrices: {},
  inventory: {},
  attendanceEmployees: {},
  attendanceRecords: {},
  ownerPasswords: { ...defaultOwnerPasswords },
  incomingOrders: {},
  tableBatchCounts: {},
  selectedTable: null,
  cart: [],
  sentItems: readSentItems(),
  seatTimerInterval: null,
  tempCustomItem: null,
  isExtraShot: false,
  tempLeftList: [],
  tempRightList: [],
  currentOriginalTotal: 0,
  finalTotal: 0,
  currentDiscount: { type: 'none', value: 0 },
  discountedTotal: 0,
  isServiceFeeEnabled: false,
  isQrMode: false,
  currentIncomingTable: null,
  entryCartSignature: '[]',
  historyViewDate: new Date(),
  isCartSimpleMode: false,
  isHistorySimpleMode: false,
  currentCategory: null,
  currentFlavorSelection: { ...DEFAULT_FLAVOR_SELECTION },
  latestVisibleOrders: null,
  reprintItemsForModal: null,
  syncLog: [],
}
