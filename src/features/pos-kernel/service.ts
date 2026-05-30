import type { DatabaseCompat } from '@/shared/firebase-compat'
import type { PosGroupedOrderLine } from '@/shared/grouped-order-lines'
import type {
  buildFinanceStatsTemplate,
  buildRevenueDetailsTemplate,
  buildSelectionSummary,
  getBusinessDate,
  getDateFromOrder,
  getDeltaEntries,
  getMergedEntries,
} from './item-helpers'
import type { CorePosState, PosMenuCategoryKey, PosMenuMeta, PosSystemPasswordConfig } from './types'

export const POS_KERNEL_SERVICE_KEY = 'pos-kernel'

export type PosCatalogHelpers = {
  buildFinanceStatsTemplate: typeof buildFinanceStatsTemplate
  buildRevenueDetailsTemplate: typeof buildRevenueDetailsTemplate
  buildSelectionSummary: typeof buildSelectionSummary
  flattenEntryLines(entry: import('./types').PosOrderEntry): import('./types').PosOrderLine[]
  groupOrderLines(lines: import('./types').PosOrderLine[] | undefined): PosGroupedOrderLine[]
  getCostByItemId(itemId: string): number
  getDeltaEntries: typeof getDeltaEntries
  getEntrySubtotal(entry: import('./types').PosOrderEntry): number
  getItemById(itemId: string): import('./types').PosMenuItem | null
  getMenuItemsByMode(mode: import('./types').PosBatchSource): import('./types').PosMenuItem[]
  getItemCategoryType(itemIdOrName: string): import('./types').PosCategoryKey
  getItemDisplayPrice(itemId: string): number
  getItemPrice(itemId: string): number | null
  getMergedEntries: typeof getMergedEntries
  getOwnedSelectionInventoryKeys(itemId: string): string[]
  isItemSoldOut(itemId: string): boolean
  isInventoryKeySoldOut(inventoryKey: string): boolean
  resolveSelectionLabel(itemId: string, ruleId: string, value: string): string
  sumLines(lines: import('./types').PosOrderLine[]): number
  validateSelections(itemId: string, selections: import('./types').PosBuilderSelectionMap): string[]
}

export type PosKernelService = {
  state: CorePosState
  db: DatabaseCompat
  menuData: import('./types').PosMenuData
  menuMeta: PosMenuMeta
  tables: string[]
  categories: PosMenuCategoryKey[]
  systemPassword: PosSystemPasswordConfig
  helpers: PosCatalogHelpers
  dates: {
    getBusinessDate: typeof getBusinessDate
    getDateFromOrder: typeof getDateFromOrder
  }
  orderUtils: {
    getDeltaEntries: typeof getDeltaEntries
    getMergedEntries: typeof getMergedEntries
    getMergedItems: typeof getMergedEntries
  }
}
