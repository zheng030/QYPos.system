import { computed, reactive, shallowRef } from 'vue'

import type { LiveState } from '@/app/live-state'
import type { PageRouter } from '@/app/page-router'
import type { PosDataService } from '@/features/pos-data/service'
import { EMPTY_CUSTOMER_NOTICE, hasCustomerNoticeContent } from '@/features/pos-kernel/customer-notice'
import type { PosKernelService } from '@/features/pos-kernel/service'
import type { PosCustomerNotice, PosFinanceMode } from '@/features/pos-kernel/types'
import { getErrorMessage } from '@/shared/errors'
import { downloadBlob } from '@/shared/ui/download'
import type { ToastService } from '@/shared/ui/toast'

import { createOwnerFinance } from './owner-finance'
import { buildProductManagementView } from './product-management'

type AdminStoreDeps = {
  kernel: PosKernelService
  data: PosDataService
  live: LiveState
  router: PageRouter
  toast: ToastService
}

export type AdminStore = ReturnType<typeof createAdminStore>

export function createAdminStore({ kernel, data, live, router, toast }: AdminStoreDeps) {
  const finance = createOwnerFinance({ kernel, data })
  let stopCatalogWatch: (() => void) | null = null

  // Accordion open state survives re-renders and page visits.
  const openPanels = reactive(new Set<string>())

  const productView = computed(() =>
    buildProductManagementView(kernel.menuData, kernel.drinkTemperatureSwitches, live.state().inventory)
  )

  function toggleAccordion(id: string) {
    if (!openPanels.delete(id)) {
      openPanels.add(id)
    }
  }

  function stopCatalog() {
    stopCatalogWatch?.()
    stopCatalogWatch = null
  }

  function watchProductInventory() {
    stopCatalog()
    stopCatalogWatch = data.watchCatalogRevision((event) => {
      if (event.changedSegments.includes('inventory')) {
        live.touch()
      }
    })
  }

  function watchCostEditor() {
    stopCatalog()
    stopCatalogWatch = data.watchCatalogRevision((event) => {
      if (event.changedSegments.some((segment) => segment === 'prices' || segment === 'costs')) {
        finance.renderCostEditor()
      }
    })
  }

  async function openFinancePage(mode: PosFinanceMode) {
    router.showPage('confidentialPage')
    await finance.openFinancePage(mode)
    if (router.activePage.value === 'confidentialPage') {
      watchCostEditor()
    }
  }

  async function openProductPage() {
    await data.ensureCatalog()
    router.showPage('productPage')
  }

  // ---- scan notice editor ----

  const noticeForm = reactive({ ...EMPTY_CUSTOMER_NOTICE })
  // null until the saved notice is loaded, so typing cannot race the load.
  const savedNotice = shallowRef<PosCustomerNotice | null>(null)
  const noticeSaving = shallowRef(false)

  function noticeDraft(): PosCustomerNotice {
    return { enabled: noticeForm.enabled, title: noticeForm.title.trim(), message: noticeForm.message.trim() }
  }

  const noticeEditor = computed(() => {
    const saved = savedNotice.value
    const draft = noticeDraft()
    const hasContent = hasCustomerNoticeContent(draft)
    const dirty =
      saved !== null &&
      (draft.enabled !== saved.enabled || draft.title !== saved.title || draft.message !== saved.message)
    return {
      loaded: saved !== null,
      saving: noticeSaving.value,
      hasContent,
      dirty,
      missingContent: draft.enabled && !hasContent,
      canSave: dirty && !noticeSaving.value && (!draft.enabled || hasContent),
    }
  })

  async function loadCustomerNotice() {
    savedNotice.value = null
    const notice = (await data.readCustomerNotice()) ?? EMPTY_CUSTOMER_NOTICE
    Object.assign(noticeForm, notice)
    savedNotice.value = notice
  }

  async function saveCustomerNotice() {
    if (!noticeEditor.value.canSave) return
    const notice = noticeDraft()
    noticeSaving.value = true
    try {
      await data.saveCustomerNotice(notice)
      Object.assign(noticeForm, notice)
      savedNotice.value = notice
      toast.show('已儲存掃碼提示')
    } catch (error) {
      alert(`儲存失敗：${getErrorMessage(error)}`)
    } finally {
      noticeSaving.value = false
    }
  }

  async function openSettingsPage() {
    router.showPage('settingsPage')
    if (!noticeSaving.value) await loadCustomerNotice()
  }

  function downloadSyncLog() {
    const log = kernel.state.syncLog
    if (log.length === 0) {
      alert('目前沒有同步紀錄')
      return
    }
    downloadBlob(new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' }), 'log.json')
  }

  function toggleStockStatus(itemId: string, checked: boolean) {
    return data.toggleStockStatus(itemId, checked)
  }

  function toggleInventoryBatch(keys: string[], checked: boolean) {
    return data.toggleInventoryBatch(Object.fromEntries(keys.map((key) => [key, checked])))
  }

  function toggleOptionStock(itemId: string, inventoryKey: string, checked: boolean) {
    return data.toggleOptionStock(itemId, inventoryKey, checked)
  }

  router.onLeave(() => {
    stopCatalog()
    finance.stopAllWatches()
  })

  router.onEnter((pageId) => {
    if (pageId === 'productPage') {
      watchProductInventory()
    }
  })

  return {
    finance,
    openPanels,
    productView,
    toggleAccordion,
    openFinancePage,
    openProductPage,
    openSettingsPage,
    noticeForm,
    noticeEditor,
    noticeDraft,
    saveCustomerNotice,
    downloadSyncLog,
    toggleStockStatus,
    toggleInventoryBatch,
    toggleOptionStock,
  }
}
