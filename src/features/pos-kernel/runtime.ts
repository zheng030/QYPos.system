import type { AppContext, FeatureRuntime } from '@/app/app-context'
import { createDatabaseCompat } from '@/shared/firebase-compat'

import { categories, FOOD_OPTION_VARIANTS, firebaseConfig, menuData, SYSTEM_PASSWORD, tables } from './data'
import {
  createCatalogHelpers,
  getBusinessDate,
  getDateFromOrder,
  getDeltaItems,
  getMergedItems,
  shouldHideCustomerItemName,
  stripHiddenTag,
} from './item-helpers'
import { POS_KERNEL_SERVICE_KEY, type PosKernelService } from './service'
import { state } from './state'

let booted = false

export function createPosKernelFeature(context: AppContext): FeatureRuntime {
  return {
    id: 'pos-kernel',
    async boot() {
      if (booted) {
        return
      }

      booted = true
      const db = createDatabaseCompat(firebaseConfig)
      const helpers = createCatalogHelpers({
        foodOptionVariants: FOOD_OPTION_VARIANTS,
        getInventory: () => state.inventory,
        getItemCosts: () => state.itemCosts,
        menuData,
      })

      const service: PosKernelService = {
        state,
        db,
        menuData,
        tables: [...tables],
        categories: [...categories],
        foodOptionVariants: FOOD_OPTION_VARIANTS,
        systemPassword: SYSTEM_PASSWORD,
        helpers,
        dates: {
          getBusinessDate,
          getDateFromOrder,
        },
        orderUtils: {
          getDeltaItems,
          getMergedItems,
          shouldHideCustomerItemName,
          stripHiddenTag,
        },
      }

      context.registerService(POS_KERNEL_SERVICE_KEY, service)
    },
  }
}
