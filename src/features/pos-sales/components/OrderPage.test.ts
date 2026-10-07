// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clickText, findByText, mountApp, mountLoggedInApp } from '@/app/app.test-support'

vi.mock('@/shared/firebase-compat', () => import('@/app/firebase-compat.test-support'))

async function openStaffOrder() {
  const app = await mountLoggedInApp()
  await clickText('#home .menu-btn', '點餐系統')
  await clickText('#tableSelectGrid .tableBtn', '01桌')
  return app
}

function builderGroup(groupId: string) {
  return document.querySelector(`#builderHost [data-builder-group="${groupId}"]`)
}

beforeEach(() => {
  sessionStorage.clear()
  vi.stubGlobal('alert', vi.fn())
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true)
  )
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('OrderPage', () => {
  it('switches the menu chips and grid together', async () => {
    await openStaffOrder()

    await clickText('#menuCategoryChips button', '飲品')

    expect(document.querySelector('#menuCategoryChips button.active')?.textContent?.trim()).toBe('飲品')
    expect(document.querySelector('#menuGrid .sub-cat-title')?.textContent).toBe('飲品')
    expect(findByText('#menuGrid .item', '肯尼亞紅茶')).toBeTruthy()
  })

  it('shows menu images only for image-backed items and keeps sold-out items disabled', async () => {
    const { runtime } = await openStaffOrder()
    await runtime.data.toggleStockStatus('brunch.garden-breakfast', false)
    await runtime.data.toggleStockStatus('brunch.garden-smoked-salmon', false)
    await clickText('#menuCategoryChips button', '早午餐')

    const imageCard = findByText('#menuGrid article.menu-item-card', '花園早餐（無肉）')
    expect(imageCard.className).toBe('menu-item-card sold-out')
    expect(imageCard.querySelector('.menu-card-image.menu-image-button img')?.getAttribute('src')).toBe(
      '/menu-img/brunch/garden-breakfast.jpg'
    )
    expect(imageCard.querySelector<HTMLButtonElement>('.item.menu-item-main')?.disabled).toBe(true)

    const plainButton = findByText<HTMLButtonElement>('#menuGrid > button.item', '花園燻鮭魚')
    expect(plainButton.className).toBe('item btn-effect sold-out')
    expect(plainButton.disabled).toBe(true)
    expect(document.querySelector('#menuGrid')?.textContent).not.toContain('無圖')
  })

  it('opens the image preview from a menu thumbnail and closes it with Escape', async () => {
    await openStaffOrder()
    await clickText('#menuCategoryChips button', '早午餐')

    findByText('#menuGrid article.menu-item-card', '花園早餐（無肉）')
      .querySelector<HTMLElement>('.menu-card-image')
      ?.click()
    await flushPromises()

    const preview = document.querySelector('#imagePreviewHost .image-preview-backdrop.show img')
    expect(preview?.getAttribute('src')).toBe('/menu-img/brunch/garden-breakfast.jpg')
    expect(preview?.getAttribute('alt')).toBe('花園早餐（無肉）')
    expect(document.querySelector('#builderHost .builder-modal-shell')).toBeNull()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(document.querySelector('#imagePreviewHost .image-preview-backdrop')).toBeNull()
  })

  it('reveals texture after base and keeps confirm disabled until required choices are made', async () => {
    await openStaffOrder()
    await clickText('#menuCategoryChips button', '義大利麵 / 燉飯')
    await clickText('#menuGrid .item', '雞胸')

    expect(document.querySelector('#builderHost .builder-modal-card')).not.toBeNull()
    expect(document.querySelector('#builderHost [data-builder-block="main-base"]')).not.toBeNull()
    expect(builderGroup('base')).not.toBeNull()
    expect(builderGroup('texture')).toBeNull()
    expect(document.querySelector('#builderHost')?.textContent).not.toContain('子項明細')
    expect(document.querySelector('.builder-close')).toBeNull()
    const confirm = findByText<HTMLButtonElement>('#builderHost .builder-confirm-btn', '加入購物車')
    expect(confirm.disabled).toBe(true)

    await clickText('#builderHost [data-builder-group="base"] .builder-option-btn', '義大利麵')
    expect(builderGroup('texture')).not.toBeNull()
    expect(findByText('#builderHost .builder-section', '附飲 / 換購')).toBeTruthy()
  })

  it('lets staff pause hot drinks from the drink menu for every drink', async () => {
    const { runtime } = await openStaffOrder()
    await clickText('#menuCategoryChips button', '甜點')
    expect(document.getElementById('drinkTemperatureBar')).toBeNull()

    await clickText('#menuCategoryChips button', '飲品')
    const hotSwitch = document.querySelector<HTMLInputElement>('#drinkTemperatureBar input[aria-label="熱飲"]')
    expect(hotSwitch?.checked).toBe(true)
    hotSwitch?.click()
    await flushPromises()

    expect(runtime.kernel.state.inventory['drink-temperature.hot']).toBe(false)
    expect(findByText('#drinkTemperatureBar .drink-temperature-switch', '熱飲').className).toContain('paused')
    expect(findByText('#drinkTemperatureBar .drink-temperature-switch', '熱飲').textContent).toContain('熱飲暫停')

    await clickText('#menuGrid .item', '美式咖啡')
    const temperatureOptions = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '#builderHost [data-builder-group="temperature"] .builder-option-btn'
      ),
    ].map((button) => [button.textContent?.trim(), button.disabled])
    expect(temperatureOptions).toEqual([
      ['冰', false],
      ['熱', true],
    ])
    await clickText('#builderHost .builder-cancel-btn', '取消')

    document.querySelector<HTMLInputElement>('#drinkTemperatureBar input[aria-label="熱飲"]')?.click()
    await flushPromises()
    expect(runtime.kernel.state.inventory['drink-temperature.hot']).toBe(true)
  })

  it('tells customers which drink temperature is paused without offering the switch', async () => {
    history.replaceState(null, '', '/?table=01%E6%A1%8C')
    try {
      const { runtime } = await mountApp()
      await runtime.data.toggleInventoryBatch({ 'drink-temperature.hot': false })
      await clickText('#menuCategoryChips button', '飲品')

      expect(document.getElementById('drinkTemperatureBar')).toBeNull()
      expect(document.getElementById('drinkTemperatureNotice')?.textContent?.trim()).toBe('目前暫停供應熱飲')
    } finally {
      history.replaceState(null, '', '/')
    }
  })

  it.each([
    ['customer', false],
    ['staff', false],
    ['staff', true],
  ] as const)('preserves a paused drink in the %s cart (save and exit: %s)', async (mode, saveAndExit) => {
    const { runtime } = await mountApp()
    vi.stubGlobal('print', vi.fn())
    await runtime.sales.openOrderPage('01桌', { mode })
    runtime.sales.selectMenuItem('drink.latte')
    runtime.sales.selectBuilderMain('temperature', 'hot')
    await runtime.sales.commitBuilder()
    const snapshot = structuredClone(
      mode === 'customer' ? runtime.kernel.state.activeDraftEntries : runtime.kernel.state.staffDrafts['01桌']
    )
    await runtime.data.toggleInventoryBatch({ 'drink-temperature.hot': false })
    runtime.sales.setOrderTab('menu')
    if (saveAndExit) await runtime.sales.saveAndExitStaffOrder()
    else {
      runtime.sales.runFloatingPrimary('submit-draft')
      await runtime.sales.runConfirmedAction()
    }
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('拿鐵（熱飲）'))
    expect(
      mode === 'customer' ? runtime.kernel.state.activeDraftEntries : runtime.kernel.state.staffDrafts['01桌']
    ).toEqual(snapshot)
    expect(runtime.router.activePage.value).toBe('orderPage')
    if (mode === 'customer') expect(runtime.sales.activeTab.value).toBe('cart')
    expect(runtime.kernel.state.activePendingBatches).toHaveLength(0)
    expect(runtime.kernel.state.activeSubmittedBatches).toHaveLength(0)
    expect(window.print).not.toHaveBeenCalled()
  })
})
