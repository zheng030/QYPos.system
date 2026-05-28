import type {
  CorePosState,
  PosIncomingOrder,
  PosMenuCategory,
  PosMenuData,
  PosMenuItem,
  PosMergedCartItem,
  PosToastOptions,
} from '@/features/pos-kernel/types'
import { findElement, requireElement, requireInput } from '@/shared/dom-helpers'
import {
  DEFAULT_FLAVOR_SELECTION,
  FLAVOR_LEMON_OPTIONS,
  FLAVOR_SPICE_OPTIONS,
  type FlavorSelection,
  formatFlavorBadgeHtml,
  isFlavorCategory,
} from '@/shared/flavor'
import type { PosPageId } from '@/shared/pos-page'

type WorkspaceUiDeps = {
  state: CorePosState
  tables: string[]
  categories: string[]
  menuData: PosMenuData
  hideAllHooks: Set<() => void>
  hideAll: () => void
  showHome: () => void
  activatePage: (pageId: PosPageId, display?: 'grid' | 'block') => void
  renderQrCode: (container: HTMLElement, text: string, size?: number) => Promise<void>
  hasAvailableVariants: (itemName: string) => boolean
  shouldHideCustomerItemName: (name: string) => boolean
  getMergedItems: (items: CorePosState['cart']) => PosMergedCartItem[]
  ensureDataSubscriptions: (roots: string[]) => Promise<void>
  initRealtimeData: () => Promise<void>
  saveAllToCloud: (updates: Record<string, unknown>) => Promise<void>
  showToast: (message: string, options?: PosToastOptions) => void
  setCurrentCategory: (category: string | null) => void
}

export function createWorkspaceUiModule(deps: WorkspaceUiDeps) {
  const flatListCategories = ['純飲', 'shot', '啤酒', '咖啡', '飲料', '主餐', '炸物', '厚片', '甜點', '其他']

  function getCartArray(table: string) {
    const cartData = deps.state.tableCarts[table]
    if (Array.isArray(cartData)) return cartData
    if (cartData && typeof cartData === 'object') return Object.values(cartData)
    return []
  }

  function getIncomingItems(orderData: PosIncomingOrder) {
    return Array.isArray(orderData.items) ? orderData.items : []
  }

  function getMenuItems(categoryData: PosMenuCategory) {
    return Array.isArray(categoryData) ? categoryData : null
  }

  function getMenuSections(categoryData: PosMenuCategory) {
    return Array.isArray(categoryData) ? null : categoryData
  }

  function getNumericPrice(price: PosMenuItem['price']) {
    return typeof price === 'number' ? price : Number(price) || 0
  }

  function createFlavorSelectorHtml() {
    return `
      <div id="flavor-selector-container">
        <div class="flavor-section">
          <div class="flavor-label">
            <span class="flavor-icon">🌶️</span>
            <span>辣度選擇</span>
          </div>
          <div class="flavor-options" id="spice-options">
            ${FLAVOR_SPICE_OPTIONS.map(
              (option) =>
                `<button type="button" class="flavor-btn" data-flavor-type="spice" data-value="${option}">${option}</button>`
            ).join('')}
          </div>
        </div>
        <div class="flavor-section">
          <div class="flavor-label">
            <span class="flavor-icon">🍋</span>
            <span>檸檬汁</span>
          </div>
          <div class="flavor-options" id="lemon-options">
            ${FLAVOR_LEMON_OPTIONS.map(
              (option) =>
                `<button type="button" class="flavor-btn" data-flavor-type="lemon" data-value="${option}">${option === '要' ? '要檸檬' : '不要檸檬'}</button>`
            ).join('')}
          </div>
        </div>
      </div>
    `
  }

  function ensureFlavorSelector() {
    const cartContainer = findElement('cart-container')
    if (!cartContainer) return null

    let container = findElement('flavor-selector-container')
    if (!container) {
      cartContainer.insertAdjacentHTML('beforebegin', createFlavorSelectorHtml())
      container = findElement('flavor-selector-container')
      container?.addEventListener('click', (event) => {
        const target = event.target
        if (!(target instanceof HTMLElement)) return
        const button = target.closest<HTMLButtonElement>('[data-flavor-type]')
        if (!button) return
        const flavorType = button.dataset.flavorType
        const value = button.dataset.value
        if (!flavorType || !value) return
        deps.state.currentFlavorSelection = {
          ...deps.state.currentFlavorSelection,
          [flavorType]: value,
        }
        updateFlavorSelector()
      })
    }

    updateFlavorSelector()
    return container
  }

  function updateFlavorSelector() {
    const container = findElement('flavor-selector-container')
    if (!container) return
    container.classList.toggle('active', isFlavorCategory(deps.state.currentCategory))
    const flavor = (deps.state.currentFlavorSelection || DEFAULT_FLAVOR_SELECTION) as FlavorSelection

    container.querySelectorAll<HTMLButtonElement>('[data-flavor-type]').forEach((button) => {
      const flavorType = button.dataset.flavorType as keyof FlavorSelection | undefined
      const value = button.dataset.value
      const isSelected = Boolean(flavorType && value && flavor[flavorType] === value)
      button.classList.toggle('selected', isSelected)
      button.classList.toggle('spice-selected', isSelected && flavorType === 'spice')
      button.classList.toggle('lemon-selected', isSelected && flavorType === 'lemon')
    })
  }

  function resetFlavorSelection() {
    deps.state.currentFlavorSelection = { ...DEFAULT_FLAVOR_SELECTION }
    updateFlavorSelector()
  }

  async function ensureSubscriptions(roots: string[]) {
    await deps.ensureDataSubscriptions(roots)
  }

  async function showApp(options: { skipHome?: boolean } = {}) {
    const { skipHome = false } = options
    const loginScreen = document.getElementById('login-screen')
    const appContainer = document.getElementById('app-container')
    if (loginScreen) loginScreen.style.display = 'none'
    if (appContainer) appContainer.style.display = 'block'
    await deps.initRealtimeData()
    if (!skipHome) deps.showHome()
  }

  function goHome() {
    deps.showHome()
  }

  async function openTableSelect() {
    deps.hideAll()
    deps.setCurrentCategory(null)
    await ensureSubscriptions([
      'tableTimers',
      'tableCarts',
      'tableStatuses',
      'tableCustomers',
      'tableSplitCounters',
      'tableBatchCounts',
    ])
    deps.activatePage('tableSelect')
    await renderTableGrid()
  }

  async function openSettingsPage() {
    deps.hideAll()
    await ensureSubscriptions(['ownerPasswords'])
    deps.activatePage('settingsPage')
  }

  function toggleQrMode() {
    deps.state.isQrMode = !deps.state.isQrMode
    const grid = document.getElementById('tableSelectGrid')
    if (!grid) return
    if (deps.state.isQrMode) {
      grid.classList.add('qr-select-mode')
      deps.showToast('📲 請點擊桌號以顯示 QR Code')
    } else {
      grid.classList.remove('qr-select-mode')
    }
  }

  function showQrModal(table: string) {
    const modal = requireElement('qrCodeModal')
    const title = requireElement('qrTableTitle')
    const qrContainer = requireElement('qrcode')
    title.innerText = `桌號：${table}`
    qrContainer.innerHTML = ''
    const baseUrl = location.href.split('?')[0]
    const orderUrl = `${baseUrl}?table=${encodeURIComponent(table)}`
    void deps.renderQrCode(qrContainer, orderUrl, 200)
    modal.style.display = 'flex'
  }

  function closeQrModal() {
    const qrCodeModal = document.getElementById('qrCodeModal')
    if (qrCodeModal) qrCodeModal.style.display = 'none'
  }

  function showIncomingOrderModal(table: string, orderData: PosIncomingOrder) {
    deps.state.currentIncomingTable = table
    const modal = requireElement('incomingOrderModal')
    const title = requireElement('incomingTableTitle')
    const list = requireElement('incomingList')
    title.innerText = `桌號：${table}`
    list.innerHTML = ''
    getIncomingItems(orderData).forEach((item) => {
      list.innerHTML += `<div style="padding:5px 0; border-bottom:1px solid #ffccd5; display:flex; justify-content:space-between;">
                <span style="font-weight:bold; color:#333;">${item.name}</span>
                <span style="color:#ef476f;">$${item.price}</span>
            </div>`
    })
    modal.style.display = 'flex'
  }

  function closeIncomingOrderModal() {
    const incomingOrderModal = document.getElementById('incomingOrderModal')
    if (incomingOrderModal) incomingOrderModal.style.display = 'none'
    deps.state.currentIncomingTable = null
  }

  async function renderTableGrid() {
    const grid = document.getElementById('tableSelectGrid')
    if (!grid) return
    grid.innerHTML = ''
    const pendingSaves: Promise<void>[] = []
    deps.tables.forEach((table) => {
      const button = document.createElement('div')
      button.className = 'tableBtn btn-effect'
      let status = deps.state.tableStatuses[table]
      const cartData = deps.state.tableCarts[table]
      let hasCart = false
      if (Array.isArray(cartData)) {
        hasCart = cartData.length > 0
      } else if (cartData && typeof cartData === 'object') {
        hasCart = Object.keys(cartData).length > 0
      }
      if (status !== 'yellow' && !hasCart && deps.state.tableTimers[table]) {
        delete deps.state.tableTimers[table]
        pendingSaves.push(deps.saveAllToCloud({ [`tableTimers/${table}`]: null }))
      }
      if (status === 'yellow' && !hasCart) {
        delete deps.state.tableTimers[table]
        delete deps.state.tableStatuses[table]
        delete deps.state.tableCarts[table]
        delete deps.state.tableCustomers[table]
        delete deps.state.tableSplitCounters[table]
        delete deps.state.tableBatchCounts[table]
        pendingSaves.push(
          deps.saveAllToCloud({
            [`tableTimers/${table}`]: null,
            [`tableStatuses/${table}`]: null,
            [`tableCarts/${table}`]: null,
            [`tableCustomers/${table}`]: null,
            [`tableSplitCounters/${table}`]: null,
            [`tableBatchCounts/${table}`]: null,
          })
        )
        status = undefined
      }

      if (status === 'red') {
        button.classList.add('status-red')
        button.innerHTML = `<b>${table}</b>`
      } else if (status === 'yellow') {
        button.classList.add('status-yellow')
        button.innerHTML = `<b>${table}</b>`
      } else {
        button.classList.add('status-white')
        button.innerHTML = `<b>${table}</b><br><span style="font-size:14px;">(空桌)</span>`
      }

      button.dataset.action = 'select-table'
      button.dataset.table = table
      grid.appendChild(button)
    })
    await Promise.all(pendingSaves)
  }

  const openOrderPageLogic = async function openOrderPageLogic(table: string) {
    deps.setCurrentCategory(null)
    deps.state.selectedTable = table
    requireElement('seatLabel').innerHTML = `（${table}）`
    deps.hideAll()
    deps.activatePage('orderPage')
    await ensureSubscriptions(['inventory', 'itemPrices'])
    await ensureSubscriptions([
      'tableTimers',
      'tableCarts',
      'tableStatuses',
      'tableCustomers',
      'tableSplitCounters',
      'tableBatchCounts',
    ])

    if (deps.state.tableTimers[table]) {
      startSeatTimerDisplay()
    } else {
      requireElement('seatTimer').innerText = '⏳ 尚未計時'
      if (deps.state.seatTimerInterval) clearInterval(deps.state.seatTimerInterval)
    }

    deps.state.cart = getCartArray(table)
    deps.state.entryCartSignature = JSON.stringify(deps.state.cart || [])
    const info = deps.state.tableCustomers[table] || { name: '', phone: '' }
    requireInput('custName').value = info.name || ''
    requireInput('custPhone').value = info.phone || ''
    const saveBtn = document.querySelector('.save-btn') as HTMLButtonElement | null
    if (saveBtn) {
      saveBtn.innerText = '📝 暫存'
      saveBtn.dataset.action = 'save-order-manual'
    }

    deps.state.currentDiscount = { type: 'none', value: 0 }
    deps.state.isServiceFeeEnabled = false

    if (!document.body.classList.contains('customer-mode')) {
      deps.state.sentItems = []
      sessionStorage.removeItem('sentItems')
    }

    buildCategories()
    ensureFlavorSelector()
    resetFlavorSelection()
    renderCart()
  }

  function startSeatTimerDisplay() {
    updateSeatTimerText()
    deps.state.seatTimerInterval = setInterval(updateSeatTimerText, 1000)
  }

  function updateSeatTimerText() {
    if (!deps.state.selectedTable) return
    const startTime = deps.state.tableTimers[deps.state.selectedTable]
    if (!startTime) return
    const diff = Math.floor((Date.now() - startTime) / 1000)
    const hours = Math.floor(diff / 3600)
      .toString()
      .padStart(2, '0')
    const minutes = Math.floor((diff % 3600) / 60)
      .toString()
      .padStart(2, '0')
    const seconds = (diff % 60).toString().padStart(2, '0')
    requireElement('seatTimer').innerText = `⏳ 已入座：${hours}:${minutes}:${seconds}`
  }

  const buildCategories = function buildCategories() {
    deps.setCurrentCategory(null)
    ensureFlavorSelector()
    updateFlavorSelector()
    const grid = requireElement('menuGrid')
    grid.innerHTML = ''
    let listToRender = deps.categories
    if (document.body.classList.contains('customer-mode')) {
      listToRender = deps.categories.filter((category) => category !== '甜點' && category !== '其他')
    }
    listToRender.forEach((category) => {
      const box = document.createElement('div')
      box.className = 'categoryBtn btn-effect'
      box.innerText = category
      if (deps.menuData[category]) {
        box.dataset.action = 'open-menu-category'
        box.dataset.category = category
      } else {
        box.style.opacity = '0.5'
      }
      grid.appendChild(box)
    })
  }

  const openItems = function openItems(category: string) {
    deps.setCurrentCategory(category)
    ensureFlavorSelector()
    updateFlavorSelector()
    const data = deps.menuData[category]
    const backBtn = `<button class="back-to-cat btn-effect" data-action="build-categories">⬅ 返回 ${category} 分類</button>`
    const shouldHide = document.body.classList.contains('customer-mode') ? deps.shouldHideCustomerItemName : () => false

    const createItemHtml = (item: PosMenuItem, isFlat = false) => {
      if (shouldHide(item.name)) return ''
      let actionsHtml = ''
      const priceLabel = typeof item.price === 'string' ? item.price : `$${item.price}`
      const priceArg = typeof item.price === 'string' ? JSON.stringify(item.price) : item.price
      let nameHtml = `<span>${item.name} <b>${priceLabel}</b></span>`
      let itemClass = isFlat ? 'item list-mode' : 'item shot-item'

      const isSoldOut = deps.state.inventory[item.name] === false || !deps.hasAvailableVariants(item.name)
      if (isSoldOut) itemClass += ' sold-out'

      if (item.name === '隱藏啤酒') {
        nameHtml = `<span style="font-weight:bold; color:var(--primary-color);">🍺 隱藏啤酒</span>`
        actionsHtml = `<input id="hbName" class="inline-input" placeholder="品名" style="width:100px;"><input type="number" id="hbPrice" class="inline-input" placeholder="時價" style="width:70px;"><button data-action="add-inline-hidden-beer">加入</button>`
      } else {
        actionsHtml = `<button data-action="check-item-type" data-name="${item.name}" data-price="${String(priceArg).replace(/"/g, '&quot;')}" data-category="${category}">加入</button>`
        if (category === 'shot') {
          actionsHtml += `<button data-action="add-shot-set" data-name="${item.name}" data-price="${item.price}" class="set-btn btn-effect" style="margin-left:5px; background:var(--secondary-color);">🔥 一組</button>`
        }
      }
      return `<div class="${itemClass}">${nameHtml}<div class="shot-actions">${actionsHtml}</div></div>`
    }

    let html = backBtn
    const grid = requireElement('menuGrid')

    const categoryItems = getMenuItems(data)
    if (categoryItems) {
      if (flatListCategories.includes(category)) {
        html += `<div class="sub-cat-title">${category}</div>`
      }
      categoryItems.forEach((item) => {
        html += createItemHtml(item, true)
      })
    } else {
      const sections = getMenuSections(data)
      if (!sections) return
      Object.keys(sections).forEach((subCategory, index) => {
        const items = sections[subCategory]
        if (flatListCategories.includes(category)) {
          html += `<div class="sub-cat-title">${subCategory}</div>`
          items.forEach((item) => {
            html += createItemHtml(item, true)
          })
        } else {
          const visibleItems = items.filter((item) => !shouldHide(item.name))
          if (visibleItems.length === 0) return
          const accId = `acc-${index}`
          html += `<button class="accordion-header btn-effect" data-action="toggle-accordion" data-id="${accId}">${subCategory} <span class="arrow">▼</span></button><div id="${accId}" class="accordion-content">`
          visibleItems.forEach((item) => {
            html += createItemHtml(item, false)
          })
          html += '</div>'
        }
      })
    }
    grid.innerHTML = html
  }

  function toggleCartView() {
    deps.state.isCartSimpleMode = !deps.state.isCartSimpleMode
    renderCart()
  }

  function toggleServiceFee() {
    deps.state.isServiceFeeEnabled = !deps.state.isServiceFeeEnabled
    renderCart()
  }

  function renderCart() {
    const cartList = requireElement('cart-list')
    const totalText = requireElement('total')
    cartList.innerHTML = ''
    deps.state.currentOriginalTotal = 0
    const isCustomerMode = document.body.classList.contains('customer-mode')

    const svcBtn = document.getElementById('svcBtn')
    if (svcBtn) {
      if (deps.state.isServiceFeeEnabled) {
        svcBtn.classList.add('active')
        svcBtn.innerHTML = '✅ 收 10% 服務費'
      } else {
        svcBtn.classList.remove('active')
        svcBtn.innerHTML = '◻️ 收 10% 服務費'
      }
    }

    let displayItems: PosMergedCartItem[] = []
    if (deps.state.sentItems.length > 0) {
      deps.state.sentItems.forEach((item) => {
        displayItems.push({ ...item, isSent: true, count: 1 })
      })
    }

    const currentCartItems = deps.state.isCartSimpleMode
      ? deps.getMergedItems(deps.state.cart)
      : deps.state.cart.map((item) => ({ ...item, count: 1 }))
    displayItems = [...displayItems, ...currentCartItems]

    if (displayItems.length === 0) {
      cartList.innerHTML = `<div style="text-align:center; color:#ccc; padding:20px;">購物車空空的</div>`
    }

    const lastBatchShown: Record<string, boolean> = {}
    displayItems.forEach((item, index) => {
      const count = item.count || 1
      const numericPrice = getNumericPrice(item.price)
      const itemTotal = (item.isTreat ? 0 : numericPrice) * count
      if (!item.isSent) {
        deps.state.currentOriginalTotal += itemTotal
      }
      const shouldHideForCustomer = isCustomerMode && deps.shouldHideCustomerItemName(item.name)
      if (shouldHideForCustomer) return

      const treatClass = item.isTreat ? 'treat-btn active btn-effect' : 'treat-btn btn-effect'
      const treatText = item.isTreat ? '已招待' : '🎁 招待'
      let priceHtml = ''
      let nameHtml = ''
      let rowClass = 'cart-item-row'
      let batchBadge = ''

      if (typeof item.batchId !== 'undefined' && lastBatchShown[item.batchId] === undefined) {
        let minutesAgo = ''
        if (item.sentAt) {
          const diffMs = Date.now() - item.sentAt
          minutesAgo = `${Math.max(0, Math.floor(diffMs / 60000))}`
        }
        batchBadge = `<div class="batch-badge">顧客訂單#${item.batchId} - ${minutesAgo} 分鐘前</div>`
        lastBatchShown[item.batchId] = true
      }

      if (item.isSent) {
        nameHtml = `<div class="cart-item-name" style="color:#adb5bd;">${item.name} <small>(已下單)</small></div>`
        priceHtml = `<span style="color:#adb5bd;">$${itemTotal}</span>`
        rowClass += ' sent-item'
      } else {
        if (typeof item.batchIdx !== 'undefined') {
          if (item.batchIdx === 0) rowClass += ' batch-blue'
          else if (item.batchIdx === 1) rowClass += ' batch-red'
          else if (item.batchIdx === 2) rowClass += ' batch-green'
        }

        const flavorHtml = formatFlavorBadgeHtml(item.flavor)
        if (deps.state.isCartSimpleMode && count > 1) {
          nameHtml = `<div class="cart-item-name">${item.name}${flavorHtml ? ` ${flavorHtml}` : ''} <span style="color:#ef476f; font-weight:bold;">x${count}</span></div>`
          priceHtml = item.isTreat
            ? `<span style='text-decoration:line-through; color:#999;'>$${numericPrice * count}</span> <span style='color:#06d6a0; font-weight:bold;'>$0</span>`
            : `$${itemTotal}`
        } else {
          nameHtml = `<div class="cart-item-name">${item.name}${flavorHtml ? ` ${flavorHtml}` : ''}</div>`
          priceHtml = item.isTreat
            ? `<span style='text-decoration:line-through; color:#999;'>$${item.price}</span> <span style='color:#06d6a0; font-weight:bold;'>$0</span>`
            : `$${item.price}`
        }
      }

      let actionButtons = ''
      if (item.isSent) {
        actionButtons = `<small style="color:#ccc;">已傳送</small>`
      } else {
        const realCartIndex = index - (typeof deps.state.sentItems !== 'undefined' ? deps.state.sentItems.length : 0)
        actionButtons = !deps.state.isCartSimpleMode
          ? `<button class="${treatClass}" data-action="toggle-treat" data-index="${realCartIndex}">${treatText}</button><button class="del-btn btn-effect" data-action="remove-cart-item" data-index="${realCartIndex}">刪除</button>`
          : `<small style="color:#888;">(切換檢視操作)</small>`
      }

      cartList.innerHTML += `${batchBadge}<div class="${rowClass}">${nameHtml}<div class="cart-item-price">${priceHtml}</div><div style="display:flex; gap:5px; justify-content:flex-end;">${actionButtons}</div></div>`
    })

    deps.state.discountedTotal = deps.state.currentOriginalTotal
    if (deps.state.currentDiscount.type === 'percent') {
      deps.state.discountedTotal = Math.round(
        deps.state.currentOriginalTotal * (deps.state.currentDiscount.value / 100)
      )
    } else if (deps.state.currentDiscount.type === 'amount') {
      deps.state.discountedTotal = deps.state.currentOriginalTotal - deps.state.currentDiscount.value
      if (deps.state.discountedTotal < 0) deps.state.discountedTotal = 0
    }

    let serviceFee = 0
    if (deps.state.isServiceFeeEnabled) {
      serviceFee = Math.round(deps.state.currentOriginalTotal * 0.1)
      deps.state.discountedTotal += serviceFee
    }

    let finalHtml = '總金額：'
    if (deps.state.currentDiscount.type !== 'none' || deps.state.isServiceFeeEnabled) {
      finalHtml += `<span style="text-decoration:line-through; color:#999; font-size:16px;">$${deps.state.currentOriginalTotal}</span> `
    }
    finalHtml += `<span style="color:#ef476f;">$${deps.state.discountedTotal}</span>`

    const noteText: string[] = []
    if (deps.state.currentDiscount.type === 'percent') {
      noteText.push(`折扣 ${deps.state.currentDiscount.value}%`)
    }
    if (deps.state.currentDiscount.type === 'amount') {
      noteText.push(`折讓 -${deps.state.currentDiscount.value}`)
    }
    if (deps.state.isServiceFeeEnabled) noteText.push(`含服務費 +$${serviceFee}`)

    if (noteText.length > 0) {
      finalHtml += ` <small style="color:#555;">(${noteText.join(', ')})</small>`
    }
    totalText.innerHTML = finalHtml

    const saveBtn = document.querySelector('.save-btn')
    if (saveBtn) {
      if (deps.state.cart.length > 0) {
        saveBtn.classList.add('active')
      } else {
        saveBtn.classList.remove('active')
      }
    }
  }

  async function startCorePosApp() {
    const urlParams = new URLSearchParams(location.search)
    const tableParam = urlParams.get('table')
    const storedCustomerMode = sessionStorage.getItem('customerMode') === 'true'
    if (tableParam) {
      document.body.classList.add('customer-mode')
      sessionStorage.setItem('customerMode', 'true')
      sessionStorage.setItem('isLoggedIn', 'true')
      await ensureSubscriptions(['tableCarts', 'inventory', 'itemPrices'])
      await showApp({ skipHome: true })
      deps.state.selectedTable = decodeURIComponent(tableParam)
      deps.hideAll()
      deps.activatePage('orderPage')
      requireElement('seatLabel').innerText = `（${deps.state.selectedTable}）`
      const saveBtn = document.querySelector('.save-btn') as HTMLButtonElement | null
      if (saveBtn) {
        saveBtn.innerText = '🚀 送出廚房'
        saveBtn.dataset.action = 'customer-submit-order'
      }
      const seatTimer = document.getElementById('seatTimer')
      if (seatTimer) seatTimer.style.display = 'none'
      buildCategories()
      ensureFlavorSelector()
      resetFlavorSelection()
      deps.state.sentItems = getCartArray(deps.state.selectedTable).map((item) => ({
        ...item,
        isSent: true,
      }))
      sessionStorage.setItem('sentItems', JSON.stringify(deps.state.sentItems))
      deps.state.cart = []
      renderCart()
      return
    }

    if (storedCustomerMode) {
      sessionStorage.removeItem('isLoggedIn')
      sessionStorage.removeItem('customerMode')
      const loginScreen = document.getElementById('login-screen')
      const appContainer = document.getElementById('app-container')
      if (loginScreen) loginScreen.style.display = 'block'
      if (appContainer) appContainer.style.display = 'none'
      return
    }

    if (sessionStorage.getItem('isLoggedIn') === 'true') {
      await showApp()
    }
  }

  return {
    buildCategories,
    closeIncomingOrderModal,
    closeQrModal,
    ensureSubscriptions,
    goHome,
    openItems,
    openOrderPageLogic,
    openSettingsPage,
    openTableSelect,
    renderCart,
    renderTableGrid,
    showApp,
    showIncomingOrderModal,
    showQrModal,
    startCorePosApp,
    startSeatTimerDisplay,
    toggleCartView,
    toggleQrMode,
    toggleServiceFee,
    updateSeatTimerText,
  }
}
