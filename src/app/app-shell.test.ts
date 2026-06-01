import { describe, expect, it } from 'vitest'

import { appShellHtml } from './app-shell'

describe('app-shell', () => {
  it('restores legacy home icon hooks and settings styling contracts', () => {
    expect(appShellHtml).toContain('<span class="menu-icon">🕒</span>')
    expect(appShellHtml).toContain('data-action="open-settings-page"')
    expect(appShellHtml).toContain('class="settings-card danger-zone"')
    expect(appShellHtml).toContain('class="btn-effect danger-btn-blue"')
  })

  it('exposes direct finance entry points without owner auth modals', () => {
    expect(appShellHtml).toContain('data-action="open-finance-page" data-mode="cost"')
    expect(appShellHtml).toContain('data-action="open-finance-page" data-mode="finance"')
    expect(appShellHtml).toContain('id="confidentialTitle">財務 / 詳單<')
    expect(appShellHtml).not.toContain('id="ownerLoginModal" class="modal"')
    expect(appShellHtml).not.toContain('id="changePasswordModal" class="modal"')
  })

  it('renders the customer long-page order structure with sticky-tab anchors and floating draft bar', () => {
    expect(appShellHtml).toContain('id="orderToolbarTabs"')
    expect(appShellHtml).toContain('class="order-page-body" id="orderPageBody"')
    expect(appShellHtml).toContain('id="customerOrderShell"')
    expect(appShellHtml).toContain('data-action="set-order-tab" data-tab="menu"')
    expect(appShellHtml).toContain('data-action="set-order-tab" data-tab="cart"')
    expect(appShellHtml).toContain('data-action="set-order-tab" data-tab="orders"')
    expect(appShellHtml).toContain('id="menuCategoryChips"')
    expect(appShellHtml).toContain('data-order-panel="menu"')
    expect(appShellHtml).toContain('data-order-panel="cart"')
    expect(appShellHtml).toContain('data-order-panel="orders"')
    expect(appShellHtml).toContain('id="customerFloatingBar"')
    expect(appShellHtml).toContain('id="floatingDraftSummary"')
    expect(appShellHtml).toContain('id="floatingClearBtn"')
    expect(appShellHtml).toContain('id="draftPanelTitle">購物車<')
    expect(appShellHtml).toContain('id="submittedPanelTitle">訂單紀錄<')
    expect(appShellHtml).not.toContain('class="panel-actions"')
  })

  it('renders the staff floating workspace with collapsible summary, toolbar actions, and discount modal', () => {
    expect(appShellHtml).toContain('id="staffFloatingWorkspace" class="floating-bar-staff is-collapsed"')
    expect(appShellHtml).toContain('data-action="toggle-staff-workspace"')
    expect(appShellHtml).toContain('data-action="toggle-staff-service-fee"')
    expect(appShellHtml).toContain('data-action="open-staff-discount-modal"')
    expect(appShellHtml).toContain('data-action="staff-save-and-exit"')
    expect(appShellHtml).toContain('data-action="open-split-checkout"')
    expect(appShellHtml).toContain('id="staffWorkspaceStreamList"')
    expect(appShellHtml).toContain('id="staffWorkspaceMeta"')
    expect(appShellHtml).toContain('id="staffWorkspaceTotal"')
    expect(appShellHtml).toContain('id="staffWorkspaceToggleButton"')
    expect(appShellHtml).toContain('role="button"')
    expect(appShellHtml).toContain('class="staff-workspace-toggle-tools"')
    expect(appShellHtml).toContain('id="staffWorkspaceToggleLabel">展開明細<')
    expect(appShellHtml).not.toContain('class="staff-workspace-stream-head"')
    expect(appShellHtml).not.toContain('staffWorkspaceSummary')
    expect(appShellHtml).not.toContain('工作台')
    expect(appShellHtml).toContain('📝 暫存')
    expect(appShellHtml).toContain('🖨️ 補單')
    expect(appShellHtml).toContain('💳 全結')
    expect(appShellHtml).toContain('✂️ 拆單')
    expect(appShellHtml).toContain('id="staffDiscountModal" class="modal"')
    expect(appShellHtml).toContain('id="staffDiscountInput"')
    expect(appShellHtml).toContain('id="payDiscountRow"')
    expect(appShellHtml).toContain('class="modal-content modal-sheet modal-sheet-wide split-modal"')
  })

  it('renders the customer order confirmation modal for clear/submit actions', () => {
    expect(appShellHtml).toContain('id="orderActionConfirmModal" class="modal"')
    expect(appShellHtml).toContain('id="orderActionConfirmTitle"')
    expect(appShellHtml).toContain('id="orderActionConfirmMessage"')
    expect(appShellHtml).toContain('data-action="confirm-order-action"')
  })

  it('uses the shared scroll-frame contract for list-heavy modals', () => {
    expect(appShellHtml).toContain(
      'class="modal-content modal-sheet modal-sheet-compact modal-scroll-frame reprint-modal"'
    )
    expect(appShellHtml).toContain('class="modal-body modal-list-body"')
    expect(appShellHtml).toContain('id="reprintSelectionList" class="reprint-list"')
    expect(appShellHtml).toContain('class="modal-content modal-sheet modal-sheet-compact modal-scroll-frame"')
    expect(appShellHtml).toContain('class="modal-body modal-list-body detail-list" id="revenueDetailList"')
  })

  it('renders the fullscreen pending-batch overlay with explicit accept and reject actions', () => {
    expect(appShellHtml).toContain('id="pendingBatchOverlay" class="pending-overlay"')
    expect(appShellHtml).toContain('id="pendingOverlayTitle"')
    expect(appShellHtml).toContain('id="pendingOverlayList"')
    expect(appShellHtml).toContain('data-action="reject-pending-batch"')
    expect(appShellHtml).toContain('data-action="accept-pending-batch"')
  })

  it('does not ship an empty static checkin page placeholder', () => {
    expect(appShellHtml).not.toContain('id="checkinPage"')
  })
})
