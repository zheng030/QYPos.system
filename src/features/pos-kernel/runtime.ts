import type { AppContext, FeatureRuntime } from '@/app/app-context'
import { createDatabaseCompat } from '@/shared/firebase-compat'

import { firebaseConfig, menuMeta, SYSTEM_PASSWORD, tables } from './data'
import {
  createCatalogHelpers,
  getBusinessDate,
  getCanonicalDraftEntries,
  getDateFromOrder,
  getDeltaEntries,
  getMergedEntries,
} from './item-helpers'
import { POS_KERNEL_SERVICE_KEY, type PosKernelService } from './service'
import { state } from './state'

let booted = false

export function createPosKernelFeature(context: AppContext): FeatureRuntime {
  return {
    id: 'pos-kernel',
    async boot() {
      if (booted) return
      booted = true

      const db = createDatabaseCompat(firebaseConfig)
      const helpers = createCatalogHelpers({
        getInventory: () => state.inventory,
        getItemCosts: () => state.itemCosts,
        getItemPrices: () => state.itemPrices,
        menuMeta,
      })

      const service: PosKernelService = {
        state,
        db,
        menuData: menuMeta.categories,
        menuMeta,
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

      context.registerService(POS_KERNEL_SERVICE_KEY, service)
    },
  }
}
