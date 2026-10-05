import { createDatabaseCompat } from '@/shared/firebase-compat'

import { drinkTemperatureSwitches, firebaseConfig, menuMeta, SYSTEM_PASSWORD, tables } from './data'
import {
  createCatalogHelpers,
  getBusinessDate,
  getCanonicalDraftEntries,
  getDateFromOrder,
  getDeltaEntries,
  getMergedEntries,
} from './item-helpers'
import type { PosKernelService } from './service'
import { createPosKernelState } from './state'

export function createPosKernel(): PosKernelService {
  const state = createPosKernelState()
  const helpers = createCatalogHelpers({
    getInventory: () => state.inventory,
    getItemCosts: () => state.itemCosts,
    getItemPrices: () => state.itemPrices,
    menuMeta,
  })

  return {
    state,
    db: createDatabaseCompat(firebaseConfig),
    menuData: menuMeta.categories,
    menuMeta,
    drinkTemperatureSwitches,
    tables: [...tables],
    categories: [...menuMeta.orderedCategoryKeys],
    systemPassword: SYSTEM_PASSWORD,
    helpers,
    dates: {
      getBusinessDate,
      getDateFromOrder,
    },
    orderUtils: {
      getCanonicalDraftEntries,
      getDeltaEntries,
      getMergedEntries,
      getMergedItems: getMergedEntries,
    },
  }
}
