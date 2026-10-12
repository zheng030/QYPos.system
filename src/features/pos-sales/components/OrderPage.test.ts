// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clickText, findByText, mountLoggedInApp } from '@/app/app.test-support'

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

  it('lets staff clear customer info and timer of a table without orders', async () => {
    const { runtime } = await openStaffOrder()
    await runtime.sales.setCustomerField('name', '舊客人')
    await runtime.sales.setCustomerField('phone', '0900')
    await flushPromises()
    await clickText('#resetEmptyTableBtn', '清除桌位資料')
    await runtime.sales.runConfirmedAction()
    await flushPromises()
    expect(runtime.kernel.state.tableCustomers['01桌']).toBeUndefined()
    expect(runtime.kernel.state.tableTimers['01桌']).toBeUndefined()
    expect(document.querySelector<HTMLInputElement>('#custName')?.value).toBe('')
    expect(document.getElementById('resetEmptyTableBtn')).toBeNull()
  })

  it('lets staff clear a customer name by emptying its input', async () => {
    const { runtime } = await openStaffOrder()
    await runtime.sales.setCustomerField('name', 'A')
    await runtime.sales.setCustomerField('name', '')
    await flushPromises()
    expect(runtime.kernel.state.tableCustomers['01桌']?.name).toBe('')
    expect(document.querySelector<HTMLInputElement>('#custName')?.value).toBe('')
  })
})
