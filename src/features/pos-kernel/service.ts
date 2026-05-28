import type { DatabaseCompat } from '@/shared/firebase-compat'
import type { getDeltaItems, getMergedItems, shouldHideCustomerItemName, stripHiddenTag } from './item-helpers'
import type { CorePosState, PosMenuData, PosRootName, PosSystemPasswordConfig } from './types'

export const POS_KERNEL_SERVICE_KEY = 'pos-kernel'

export type PosCatalogHelpers = {
  getAvailableVariants(name: string): string[] | null
  getCostByItemName(name: string, variant?: string): number
  getItemCategoryType(name: string): string
  hasAvailableVariants(name: string): boolean
}

export type PosKernelService = {
  state: CorePosState
  db: DatabaseCompat
  menuData: PosMenuData
  tables: string[]
  categories: string[]
  foodOptionVariants: Record<string, string[]>
  systemPassword: PosSystemPasswordConfig
  dataRootKeys: readonly PosRootName[]
  customerDataRootKeys: readonly string[]
  adminBaseRootKeys: readonly string[]
  localDataPrefix: string
  localRevisionKey: string
  refreshUiRoots: ReadonlySet<string>
  helpers: PosCatalogHelpers
  dates: {
    getBusinessDate(value: Date | string | number): number
    getDateFromOrder(value: unknown): Date
  }
  orderUtils: {
    getDeltaItems: typeof getDeltaItems
    getMergedItems: typeof getMergedItems
    shouldHideCustomerItemName: typeof shouldHideCustomerItemName
    stripHiddenTag: typeof stripHiddenTag
  }
}
