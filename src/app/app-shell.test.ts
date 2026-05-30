import { describe, expect, it } from 'vitest'

import { appShellHtml } from './app-shell'

describe('app-shell', () => {
  it('restores legacy home icon hooks and settings styling contracts', () => {
    expect(appShellHtml).toContain('<span class="menu-icon">🕒</span>')
    expect(appShellHtml).toContain('data-action="open-settings-page"')
    expect(appShellHtml).toContain('class="settings-card danger-zone"')
    expect(appShellHtml).toContain('class="btn-effect owner-btn btn-owner-blue"')
    expect(appShellHtml).toContain('class="btn-effect danger-btn-blue"')
  })

  it('restores modal wrapper classes expected by legacy styles without removing new hooks', () => {
    expect(appShellHtml).toContain('id="ownerLoginModal" class="modal"')
    expect(appShellHtml).toContain('class="modal-content modal-content-owner"')
    expect(appShellHtml).toContain('class="btn-effect owner-btn owner-login-btn btn-owner-pink"')
    expect(appShellHtml).toContain('class="pwd-input-container"')
    expect(appShellHtml).toContain('class="btn-effect confirm-primary" data-action="confirm-change-password"')
  })

  it('renders the customer long-page order structure with sticky-tab anchors and floating draft bar', () => {
    expect(appShellHtml).toContain('id="orderToolbarTabs"')
    expect(appShellHtml).toContain('class="order-page-body" id="orderPageBody"')
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

  it('renders the customer order confirmation modal for clear/submit actions', () => {
    expect(appShellHtml).toContain('id="orderActionConfirmModal" class="modal"')
    expect(appShellHtml).toContain('id="orderActionConfirmTitle"')
    expect(appShellHtml).toContain('id="orderActionConfirmMessage"')
    expect(appShellHtml).toContain('data-action="confirm-order-action"')
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
