import { describe, expect, it, vi } from 'vitest'

import type { AppContext } from '@/app/app-context'
import type { PosUiService } from '@/features/pos-shell/service'
import type { PosPageId } from '@/shared/pos-page'
import { registerPosSalesBindings } from './runtime-bindings'

function createDeps() {
  const handlers = new Map<string, (event: Event, element: HTMLElement) => void>()
  const context = {
    root: {} as HTMLElement,
    registerService: vi.fn(() => vi.fn()),
    getService: vi.fn(),
  } satisfies AppContext
  const ui = {
    on: vi.fn((type: string, action: string, handler: (event: Event, element: HTMLElement) => void) => {
      handlers.set(`${type}:${action}`, handler)
    }),
    startRouter: vi.fn(),
    showToast: vi.fn(),
    hideAll: vi.fn(),
    showPage: vi.fn(),
    activatePage: vi.fn(),
    showHome: vi.fn(),
    getActivePage: (() => 'home') as () => PosPageId,
    registerHideHook: vi.fn(() => vi.fn()),
    subscribePage: vi.fn(() => vi.fn()),
  } satisfies PosUiService

  return {
    handlers,
    deps: {
      context,
      ui,
      kernel: {
        state: {
          currentMode: 'staff' as const,
          menuFilter: {
            activeTab: 'menu' as const,
            activeCategoryKey: 'pasta_risotto' as const,
          },
          currentBuilder: null,
          staffWorkspace: {
            expanded: false,
            serviceFeeEnabled: false,
          },
        },
      },
      openTableSelect: vi.fn(async () => {}),
      goHome: vi.fn(),
      openOrderPage: vi.fn(async () => {}),
      toggleQrMode: vi.fn(),
      closeQrModal: vi.fn(),
      renderMenuCategoryChips: vi.fn(),
      renderMenuGrid: vi.fn(),
      setOrderTab: vi.fn(),
      openBuilder: vi.fn(),
      editDraftEntry: vi.fn(async () => {}),
      removeDraftEntry: vi.fn(async () => {}),
      toggleDraftEntryTreat: vi.fn(async () => {}),
      confirmClearDraft: vi.fn(),
      confirmSubmitDraft: vi.fn(),
      openReprintModal: vi.fn(async () => {}),
      closeOrderActionConfirmModal: vi.fn(),
      confirmPendingOrderAction: vi.fn(async () => {}),
      closeBuilder: vi.fn(),
      updateBuilderQuantity: vi.fn(),
      updateBuilderSelection: vi.fn(),
      renderBuilder: vi.fn(),
      commitBuilder: vi.fn(async () => {}),
      openPaymentModal: vi.fn(),
      closeCheckoutModal: vi.fn(),
      recalcFinalPay: vi.fn(),
      checkoutAll: vi.fn(async () => {}),
      acceptPendingBatchFromOverlay: vi.fn(async () => {}),
      rejectPendingBatchFromOverlay: vi.fn(async () => {}),
      editSubmittedBatch: vi.fn(async () => {}),
      editSubmittedEntry: vi.fn(async () => {}),
      toggleSubmittedEntryTreat: vi.fn(async () => {}),
      removeSubmittedEntry: vi.fn(async () => {}),
      reprintSubmittedBatch: vi.fn(async () => {}),
      updateFloatingActions: vi.fn(),
      openStaffDiscountModal: vi.fn(),
      closeStaffDiscountModal: vi.fn(),
      previewStaffDiscount: vi.fn(),
      confirmStaffDiscount: vi.fn(),
      resetStaffDiscount: vi.fn(),
      saveAndExitStaffOrder: vi.fn(async () => {}),
      closeReprintModal: vi.fn(),
      confirmReprintSelection: vi.fn(async () => {}),
      toggleAllReprint: vi.fn(),
      updateCustomerInfoSilently: vi.fn(async () => {}),
      openCloseBusinessModal: vi.fn(async () => {}),
      openSplitCheckoutModal: vi.fn(),
      checkoutSplitSelection: vi.fn(async () => {}),
      recalcSplitTotal: vi.fn(),
      closeSplitCheckoutModal: vi.fn(),
      moveSplitEntry: vi.fn(),
      closeSummaryModal: vi.fn(),
      stopInventoryRevisionWatch: vi.fn(),
      syncInventoryRevisionWatch: vi.fn(),
    },
  }
}

describe('pos-sales runtime-bindings', () => {
  it('re-renders menu category chips and grid when switching categories', () => {
    const { deps, handlers } = createDeps()

    registerPosSalesBindings(deps)

    const handler = handlers.get('click:open-menu-category')
    expect(handler).toBeTypeOf('function')

    const button = {
      dataset: {
        category: 'grill',
      },
    } as unknown as HTMLElement

    handler?.(new Event('click'), button)

    expect(deps.kernel.state.menuFilter.activeCategoryKey).toBe('grill')
    expect(deps.renderMenuCategoryChips).toHaveBeenCalledTimes(1)
    expect(deps.renderMenuGrid).toHaveBeenCalledTimes(1)
  })
})
