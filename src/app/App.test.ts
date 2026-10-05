// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createEntry } from '@/features/pos-data/rtdb-v3-repository.test-support'
import { mockAudioContext } from '@/shared/ui/sound-player.test-support'

import { clickText, display, findByText, login, mountApp, mountLoggedInApp } from './app.test-support'

vi.mock('@/shared/firebase-compat', () => import('./firebase-compat.test-support'))

beforeEach(() => {
  sessionStorage.clear()
  mockAudioContext()
  vi.stubGlobal('alert', vi.fn())
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true)
  )
})

afterEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('App', () => {
  it('keeps the app hidden until the staff login succeeds', async () => {
    const { wrapper } = await mountApp()

    expect(display('#login-screen')).toBe('')
    expect(display('#app-container')).toBe('none')
    expect(display('#loginError')).toBe('')

    await login(wrapper)

    expect(sessionStorage.getItem('isLoggedIn')).toBe('true')
    expect(display('#login-screen')).toBe('none')
    expect(display('#loginError')).toBe('none')
    expect(display('#app-container')).toBe('block')
    expect(display('#home')).toBe('grid')
    expect([...document.querySelectorAll('#home .menu-btn')].map((button) => button.textContent?.trim())).toEqual([
      '🛒點餐系統',
      '📋今日訂單',
      '📊營業報表',
      '🕒打卡系統',
      '🤫成本輸入',
      '🔐財務/詳單',
      '🛠️系統設定',
      '📦商品庫存',
      '📈歷史銷量',
    ])
  })

  it('renders pages and modals in the legacy document order', async () => {
    await mountApp()

    expect([...document.querySelectorAll('#app-container > div')].map((page) => page.id)).toEqual([
      'home',
      'tableSelect',
      'orderPage',
      'historyPage',
      'reportPage',
      'confidentialPage',
      'settingsPage',
      'productPage',
      'itemStatsPage',
      'checkinPage',
    ])
    expect([...document.querySelectorAll('.modal, .pending-overlay')].map((modal) => modal.id)).toEqual([
      'summaryModal',
      'orderActionConfirmModal',
      'paymentModal',
      'checkoutModal',
      'reprintSelectionModal',
      'staffDiscountModal',
      'qrCodeModal',
      'pendingBatchOverlay',
      'revenueDetailModal',
      'customerNoticeModal',
    ])
    expect(document.getElementById('ownerLoginModal')).toBeNull()
    expect(document.getElementById('changePasswordModal')).toBeNull()
    expect(display('#checkinPage')).toBe('none')
  })

  it('opens settings and finance pages from home and returns home', async () => {
    await mountLoggedInApp()

    await clickText('#home .menu-btn', '系統設定')
    expect(display('#settingsPage')).toBe('block')
    expect(display('#home')).toBe('none')
    expect(
      [...document.querySelectorAll('#settingsPage .settings-header')].map((header) => header.textContent)
    ).toEqual(['顧客點餐', '這台裝置', '資料與維護'])
    expect(
      [...document.querySelectorAll('#settingsPage .settings-row-text strong')].map((title) => title.textContent)
    ).toEqual(['掃碼提示視窗', '新訂單鈴聲', '鈴聲音量', '同步紀錄'])
    await clickText('#settingsPage button', '匯出')
    expect(alert).toHaveBeenCalledWith('目前沒有同步紀錄')

    await clickText('#settingsPage .back', '返回主畫面')
    expect(display('#home')).toBe('grid')
    expect(display('#settingsPage')).toBe('none')

    expect(document.getElementById('confidentialTitle')?.textContent).toBe('財務 / 詳單')
    await clickText('#home .menu-btn', '財務/詳單')
    expect(display('#confidentialPage')).toBe('block')
    expect(document.getElementById('confidentialTitle')?.textContent).toBe('財務與詳細訂單')
  })

  it('opens a staff order with the collapsed floating workspace', async () => {
    await mountLoggedInApp()

    await clickText('#home .menu-btn', '點餐系統')
    expect(display('#tableSelect')).toBe('block')
    await clickText('#tableSelectGrid .tableBtn', '01桌')

    expect(display('#orderPage')).toBe('block')
    expect(document.getElementById('seatLabel')?.textContent).toContain('01桌')
    expect(
      [...document.querySelectorAll('#orderToolbarTabs button')].map((tab) => tab.textContent?.trim())
    ).toHaveLength(3)
    expect(document.querySelectorAll('#menuCategoryChips button').length).toBeGreaterThan(0)
    expect(document.getElementById('orderMenuPanel')?.classList.contains('order-panel')).toBe(true)
    expect(document.getElementById('draftPanelTitle')?.textContent).toBe('購物車')
    expect(document.getElementById('submittedPanelTitle')?.textContent).toBe('訂單紀錄')

    const workspace = document.getElementById('staffFloatingWorkspace')
    expect(workspace?.className).toBe('floating-bar-staff is-collapsed')
    expect(workspace?.style.display).toBe('flex')
    expect(document.getElementById('customerFloatingMain')?.style.display).toBe('none')
    expect(document.getElementById('staffWorkspaceToggleButton')?.getAttribute('role')).toBe('button')
    expect(document.getElementById('staffWorkspaceToggleLabel')?.textContent).toBe('展開明細')
    expect(
      [...document.querySelectorAll('.staff-workspace-toolbar button')].map((button) => button.textContent?.trim())
    ).toEqual(['📝 暫存', '🖨️ 補單', '💳 全結', '✂️ 拆單'])

    await clickText('#staffWorkspaceToggleButton', '展開明細')
    expect(workspace?.className).toBe('floating-bar-staff is-expanded')
    expect(document.getElementById('staffWorkspaceToggleLabel')?.textContent).toBe('收合明細')
  })

  it('shows the checkin login with the seeded default admin', async () => {
    await mountLoggedInApp()

    await clickText('#home .menu-btn', '打卡系統')

    expect(display('#checkinPage')).toBe('block')
    expect(document.querySelector('.checkin-back-btn')?.textContent).toBe('⬅ 返回主畫面')
    await vi.waitFor(() => expect(document.querySelector('.checkin-card--select')?.textContent).toContain('管理員'))

    await clickText('.checkin-back-btn', '返回主畫面')
    expect(display('#checkinPage')).toBe('none')
    expect(display('#home')).toBe('grid')
  })

  it('rings the staff device once for each order a customer submits', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.stubGlobal('print', vi.fn())
    const { runtime } = await mountLoggedInApp()
    expect(play).not.toHaveBeenCalled()

    await runtime.data.submitCustomerDraft('01桌', [createEntry()], {})
    await flushPromises()

    expect(document.getElementById('pendingBatchOverlay')?.classList.contains('show')).toBe(true)
    expect(play).toHaveBeenCalledTimes(1)
    expect((play.mock.contexts[0] as HTMLAudioElement).src).toContain('sounds/new-order.mp3')

    await clickText('#pendingBatchOverlay button', '接單')
    expect(document.getElementById('pendingBatchOverlay')?.classList.contains('show')).toBe(false)
    expect(play).toHaveBeenCalledTimes(1)

    await clickText('#home .menu-btn', '系統設定')
    findCheckbox('#newOrderBellToggle').click()
    await flushPromises()
    await runtime.data.submitCustomerDraft('02桌', [createEntry({ entryId: 'e_2' })], {})
    await flushPromises()
    expect(document.getElementById('pendingBatchOverlay')?.classList.contains('show')).toBe(true)
    expect(play).toHaveBeenCalledTimes(1)

    await clickText('#settingsPage button', '試聽')
    expect(play).toHaveBeenCalledTimes(2)
  })

  it('keeps the customer phone silent when it submits its own order', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    history.replaceState(null, '', '/?table=01%E6%A1%8C')
    try {
      const { runtime } = await mountApp()
      expect(display('#orderPage')).toBe('block')
      document.dispatchEvent(new Event('pointerdown'))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))

      await runtime.data.submitCustomerDraft('01桌', [createEntry()], {})
      await flushPromises()

      expect(runtime.kernel.state.pendingBatches['01桌']).toHaveLength(1)
      expect(play).not.toHaveBeenCalled()
    } finally {
      history.replaceState(null, '', '/')
    }
  })

  it('adjusts the bell volume in settings and restores it after reopening the app', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const { wrapper, runtime } = await mountLoggedInApp()
    await runtime.admin.openSettingsPage()
    await wrapper.get('#newOrderBellVolume').setValue('35')
    expect(runtime.bell.volume.value).toBe(35)
    expect(wrapper.get('output[for="newOrderBellVolume"]').text()).toBe('35%')
    expect(play).not.toHaveBeenCalled()
    await clickText('#settingsPage button', '試聽')
    expect(play).toHaveBeenCalledTimes(1)
    await wrapper.get('#newOrderBellVolume').setValue('0')
    expect(runtime.bell.volume.value).toBe(0)
    expect(play).toHaveBeenCalledTimes(1)
    expect(runtime.bell.playing.value).toBe(true)
    await wrapper.get('#newOrderBellVolume').setValue('65')
    wrapper.unmount()
    const reopened = await mountLoggedInApp()
    await reopened.runtime.admin.openSettingsPage()
    await flushPromises()
    expect((reopened.wrapper.get('#newOrderBellVolume').element as HTMLInputElement).value).toBe('65')
    expect(reopened.wrapper.get('output[for="newOrderBellVolume"]').text()).toBe('65%')
  })

  it('shows the saved scan notice before the customer menu and lets the customer in on confirm', async () => {
    history.replaceState(null, '', '/?table=01%E6%A1%8C')
    try {
      await mountApp({
        beforeStart: (runtime) =>
          runtime.data.saveCustomerNotice({
            enabled: true,
            title: '用餐須知',
            message: '每人低消一杯飲品\n用餐 90 分鐘',
          }),
      })

      expect(display('#orderPage')).toBe('block')
      expect(display('#customerNoticeModal')).toBe('flex')
      expect(document.getElementById('customerNoticeHeading')?.textContent).toBe('用餐須知')
      expect(document.querySelector('#customerNoticeModal .customer-notice-message')?.textContent).toBe(
        '每人低消一杯飲品\n用餐 90 分鐘'
      )

      await clickText('#customerNoticeModal button', '確認')
      expect(display('#customerNoticeModal')).toBe('')
    } finally {
      history.replaceState(null, '', '/')
    }
  })

  it('opens the customer menu directly while the scan notice is off', async () => {
    history.replaceState(null, '', '/?table=01%E6%A1%8C')
    try {
      await mountApp({
        beforeStart: (runtime) => runtime.data.saveCustomerNotice({ enabled: false, title: '用餐須知', message: '' }),
      })

      expect(display('#orderPage')).toBe('block')
      expect(display('#customerNoticeModal')).toBe('')
    } finally {
      history.replaceState(null, '', '/')
    }
  })

  it('edits, previews and saves the scan notice from settings', async () => {
    const { runtime, wrapper } = await mountLoggedInApp()
    await clickText('#home .menu-btn', '系統設定')

    const saveButton = () => findByText<HTMLButtonElement>('#settingsPage button', '儲存')
    const previewButton = () => findByText<HTMLButtonElement>('#settingsPage button', '預覽')
    expect(findCheckbox('#customerNoticeToggle').disabled).toBe(false)
    expect(saveButton().disabled).toBe(true)
    expect(previewButton().disabled).toBe(true)

    await wrapper.get('#customerNoticeToggle').setValue(true)
    expect(document.querySelector('#settingsPage .settings-form-hint')?.textContent).toBe('開啟時需要標題或內容')
    expect(saveButton().disabled).toBe(true)

    await wrapper.get('#customerNoticeTitleInput').setValue('  用餐須知 ')
    await wrapper.get('#customerNoticeMessageInput').setValue('用餐時間 90 分鐘')
    expect(document.querySelector('#settingsPage .settings-form-hint')?.textContent).toBe('尚未儲存')

    previewButton().click()
    await flushPromises()
    expect(display('#customerNoticeModal')).toBe('flex')
    expect(document.getElementById('customerNoticeHeading')?.textContent).toBe('用餐須知')
    await clickText('#customerNoticeModal button', '確認')

    saveButton().click()
    await flushPromises()
    expect(await runtime.data.readCustomerNotice()).toEqual({
      enabled: true,
      title: '用餐須知',
      message: '用餐時間 90 分鐘',
    })
    expect(runtime.toast.items.map((item) => item.text)).toEqual(['已儲存掃碼提示'])
    expect(saveButton().disabled).toBe(true)
    expect(document.querySelector('#settingsPage .settings-form-hint')).toBeNull()
  })

  it.each(['success', 'failure'])('locks the scan notice during save and unlocks on %s', async (outcome) => {
    const { runtime, wrapper } = await mountLoggedInApp()
    await runtime.admin.openSettingsPage()
    await wrapper.get('#customerNoticeTitleInput').setValue('用餐須知')
    let resolve!: () => void
    let reject!: (error: Error) => void
    vi.spyOn(runtime.data, 'saveCustomerNotice').mockImplementationOnce(
      () =>
        new Promise<void>((done, fail) => {
          resolve = done
          reject = fail
        })
    )
    const read = vi.spyOn(runtime.data, 'readCustomerNotice')
    const saving = runtime.admin.saveCustomerNotice()
    await flushPromises()
    expect(runtime.admin.noticeEditor.value.saving).toBe(true)
    for (const selector of ['#customerNoticeToggle', '#customerNoticeTitleInput', '#customerNoticeMessageInput']) {
      expect((wrapper.get(selector).element as HTMLInputElement).disabled).toBe(true)
    }
    expect(findByText<HTMLButtonElement>('#settingsPage button', '預覽').disabled).toBe(true)
    expect(findByText<HTMLButtonElement>('#settingsPage button', '儲存中…').disabled).toBe(true)
    runtime.shell.goHome()
    await runtime.admin.openSettingsPage()
    expect(read).not.toHaveBeenCalled()
    expect(runtime.admin.noticeForm.title).toBe('用餐須知')
    if (outcome === 'success') resolve()
    else reject(new Error('offline'))
    await saving
    await flushPromises()
    expect(runtime.admin.noticeEditor.value.saving).toBe(false)
    expect(findCheckbox('#customerNoticeToggle').disabled).toBe(false)
    expect(runtime.admin.noticeForm.title).toBe('用餐須知')
    expect(runtime.admin.noticeEditor.value.canSave).toBe(outcome === 'failure')
    if (outcome === 'failure') expect(alert).toHaveBeenCalledWith('儲存失敗：offline')
  })

  it('unlocks sound inside the first staff gesture and removes listeners on unmount', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const { runtime, wrapper } = await mountApp()
    document.dispatchEvent(new Event('pointerdown'))
    expect(play).toHaveBeenCalledTimes(1)
    expect((play.mock.contexts[0] as HTMLAudioElement).muted).toBe(true)
    expect(display('#app-container')).toBe('none')
    await flushPromises()
    expect(runtime.bell.playing.value).toBe(false)
    expect(pause).toHaveBeenCalledTimes(1)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(play).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    document.dispatchEvent(new Event('pointerdown'))
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('offers a direct playback retry when blocked, and stops before settling orders', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValue()
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const { runtime } = await mountLoggedInApp()
    await runtime.data.submitCustomerDraft('01桌', [createEntry()], {})
    await flushPromises()
    expect(runtime.bell.blocked.value).toBe(true)
    await clickText('#pendingBatchOverlay button', '啟用鈴聲')
    expect(runtime.bell.playing.value).toBe(true)
    await clickText('#pendingBatchOverlay button', '停止鈴聲')
    expect(runtime.bell.playing.value).toBe(false)
    expect(runtime.bell.enabled.value).toBe(true)
    for (const action of ['acceptPendingBatch', 'rejectPendingBatch'] as const) {
      let resolve!: () => void
      const completion = new Promise<void>((done) => {
        resolve = done
      })
      if (action === 'acceptPendingBatch') {
        vi.spyOn(runtime.data, action).mockImplementationOnce(async () => {
          await completion
          return null
        })
      } else {
        vi.spyOn(runtime.data, action).mockImplementationOnce(() => completion)
      }
      await runtime.bell.preview()
      pause.mockClear()
      const settling = runtime.sales[action]()
      expect(pause).toHaveBeenCalledTimes(1)
      expect(runtime.bell.playing.value).toBe(false)
      resolve()
      await settling
      await flushPromises()
    }
    expect(play).toHaveBeenCalledTimes(4)
  })
})

function findCheckbox(selector: string) {
  const input = document.querySelector<HTMLInputElement>(selector)
  if (!input) throw new Error(`Missing ${selector}`)
  return input
}
