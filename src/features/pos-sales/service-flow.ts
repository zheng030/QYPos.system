import type {
  AddToCartOptions,
  CorePosState,
  PosCartItem,
  PosIncomingOrder,
  PosMenuData,
  PosOrder,
  PosReceiptData,
  PosToastOptions,
} from '@/features/pos-kernel/types'
import { findElement, requireElement, requireInput } from '@/shared/dom-helpers'
import { getErrorMessage, toNumberValue } from '@/shared/errors'
import type { DatabaseCompat, DatabaseCompatSnapshot } from '@/shared/firebase-compat'
import { DEFAULT_FLAVOR_SELECTION, formatFlavorText, isFlavorCategory, normalizeFlavorSelection } from '@/shared/flavor'

type ServiceFlowDeps = {
  state: CorePosState
  db: DatabaseCompat
  menuData: PosMenuData
  getBusinessDate: (value: Date | string | number) => number
  getDateFromOrder: (order: PosOrder) => Date
  getDeltaItems: (currentCart: PosCartItem[], baseCart: PosCartItem[]) => PosCartItem[]
  getItemCategoryType: (name: string) => string
  getTodayMaxBaseSeq: () => number
  stripHiddenTag: (name: string) => string
  ensureRoots: (roots: string[]) => Promise<void>
  saveAllToCloud: (updates: Record<string, unknown>) => Promise<void>
  renderCart: () => void
  openTableSelect: () => Promise<void>
  goHome: () => void
  closeIncomingOrderModal: () => void
  checkIncomingOrders: () => void
  closeCheckoutModal: () => void
  getShowToast: () => (message: string, options?: PosToastOptions) => void
}

type ReceiptItem = PosCartItem & {
  count?: number
}

const kitchenCategories = ['燒烤', '主餐', '炸物', '厚片']

function parseStoredCart(signature: string) {
  try {
    const parsed = JSON.parse(signature || '[]')
    return Array.isArray(parsed) ? (parsed as PosCartItem[]) : []
  } catch {
    return []
  }
}

function normalizeIncomingQueue(queue: CorePosState['incomingOrders'][string]) {
  if (Array.isArray(queue)) return [...queue]
  if (queue && typeof queue === 'object') return Object.values(queue)
  return []
}

function normalizeCartCollection(cart: CorePosState['tableCarts'][string]) {
  if (Array.isArray(cart)) return [...cart]
  if (cart && typeof cart === 'object') return Object.values(cart)
  return []
}

function ensureSelectedTable(state: CorePosState) {
  if (!state.selectedTable) {
    throw new Error('No selected table')
  }
  return state.selectedTable
}

function ensureTableCustomer(state: CorePosState, table: string) {
  if (!state.tableCustomers[table]) {
    state.tableCustomers[table] = {}
  }
  return state.tableCustomers[table]
}

function buildProcessedItem(
  item: PosCartItem,
  stripHiddenTag: (name: string) => string,
  getItemCategoryType: (name: string) => string
) {
  let name = stripHiddenTag(item.name)
  let price: PosCartItem['price'] = item.price
  const type = item.type || getItemCategoryType(name)
  if (item.isTreat) {
    if (!name.includes('(招待)')) name = `${name} (招待)`
    price = 0
  }
  return { ...item, name, price, type }
}

function getTodayOrderCount(
  state: CorePosState,
  getBusinessDate: ServiceFlowDeps['getBusinessDate'],
  getDateFromOrder: ServiceFlowDeps['getDateFromOrder']
) {
  const currentBizDate = getBusinessDate(new Date())
  return state.historyOrders.filter((order) => getBusinessDate(getDateFromOrder(order)) === currentBizDate).length
}

function readCustomerInfo() {
  return {
    name: requireInput('custName').value || '',
    phone: requireInput('custPhone').value || '',
  }
}

export function createServiceFlowModule(deps: ServiceFlowDeps) {
  const addToCart = function addToCart(name: string, price: number | string, options: AddToCartOptions = {}) {
    let finalPrice = price
    if (price === '自訂') {
      const input = prompt('請輸入金額', '')
      if (input === null) return
      const parsed = parseInt(input, 10)
      if (Number.isNaN(parsed) || parsed < 0) {
        alert('金額錯誤')
        return
      }
      finalPrice = parsed
    }

    const item: PosCartItem = {
      name,
      price: finalPrice,
      isNew: true,
      isTreat: false,
    }
    if (options.variant) item.variant = options.variant
    if (isFlavorCategory(deps.state.currentCategory)) {
      const flavor = normalizeFlavorSelection(
        options.flavor ?? deps.state.currentFlavorSelection ?? DEFAULT_FLAVOR_SELECTION
      )
      if (flavor) item.flavor = flavor
    }

    deps.state.cart.push(item)
    const sameCount = deps.state.cart.filter(
      (cartItem) =>
        cartItem.name === name &&
        cartItem.price === finalPrice &&
        JSON.stringify(cartItem.flavor ?? null) === JSON.stringify(item.flavor ?? null) &&
        !cartItem.isTreat
    ).length
    const flavorText = formatFlavorText(item.flavor)
    deps.getShowToast()(`✅ 已加入：${name}${flavorText ? ` (${flavorText})` : ''}`, { count: sameCount })
    deps.renderCart()
  }

  function toggleTreat(index: number) {
    const item = deps.state.cart[index]
    if (!item) return
    item.isTreat = !item.isTreat
    deps.renderCart()
  }

  function removeItem(index: number) {
    deps.state.cart.splice(index, 1)
    deps.renderCart()
  }

  async function saveOrderManual() {
    try {
      await deps.ensureRoots(['historyOrders'])
      if (deps.state.cart.length === 0) {
        deps.getShowToast()('購物車是空的，訂單未成立。')
        await saveAndExit()
        return
      }

      const table = ensureSelectedTable(deps.state)
      const customer = ensureTableCustomer(deps.state, table)
      if (!deps.state.tableTimers[table] || !customer.orderId) {
        deps.state.tableTimers[table] = Date.now()
        deps.state.tableSplitCounters[table] = 1
        customer.orderId = getTodayOrderCount(deps.state, deps.getBusinessDate, deps.getDateFromOrder) + 1
      }

      const itemsToSave = deps.state.cart.map((item) => {
        const nextItem = { ...item }
        delete nextItem.isNew
        return nextItem
      })
      const baseCart = parseStoredCart(deps.state.entryCartSignature)
      const newItems = deps.getDeltaItems(deps.state.cart, baseCart)

      deps.state.tableCarts[table] = itemsToSave
      deps.state.tableStatuses[table] = 'yellow'
      const info = readCustomerInfo()
      customer.name = info.name
      customer.phone = info.phone

      await deps.saveAllToCloud({
        [`tableCarts/${table}`]: itemsToSave,
        [`tableStatuses/${table}`]: 'yellow',
        [`tableCustomers/${table}`]: customer,
        [`tableTimers/${table}`]: deps.state.tableTimers[table],
        [`tableSplitCounters/${table}`]: deps.state.tableSplitCounters[table],
      })

      const shouldPrintItems = baseCart.length > 0 ? newItems : deps.state.cart
      if (shouldPrintItems.length > 0 && customer.orderId !== undefined) {
        void printReceipt(
          {
            seq: customer.orderId,
            table,
            time: new Date().toLocaleString('zh-TW', { hour12: false }),
            items: shouldPrintItems,
            original: 0,
            total: 0,
          },
          true
        )
      }

      deps.getShowToast()(`✔ 訂單已送出 (單號 #${customer.orderId})！`)
      await deps.openTableSelect()
    } catch (error) {
      alert(`出單發生錯誤: ${getErrorMessage(error)}`)
    }
  }

  async function saveAndExit() {
    try {
      const hasChanges = JSON.stringify(deps.state.cart) !== deps.state.entryCartSignature
      if (hasChanges) {
        const confirmed = confirm('⚠️ 本次點餐有變更，確定要離開嗎？\n(離開後，這些未送出的商品將被清空)')
        if (!confirmed) return
      }
      deps.state.cart = []
      deps.state.entryCartSignature = '[]'
      deps.state.currentDiscount = { type: 'none', value: 0 }
      deps.state.isServiceFeeEnabled = false
      deps.state.tempCustomItem = null
      await deps.openTableSelect()
    } catch (error) {
      alert(`返回錯誤:\n${getErrorMessage(error)}`)
      await deps.openTableSelect()
    }
  }

  function closeBusiness() {
    if (!confirm('確定要結束營業並清空今日資料嗎？')) return
    deps.goHome()
  }

  async function customerSubmitOrder() {
    if (deps.state.cart.length === 0) {
      alert('目前購物車內無新增品項！')
      return
    }

    const table = ensureSelectedTable(deps.state)
    let nextBatch = 1
    try {
      const txResult = await deps.db
        .ref(`tableBatchCounts/${table}`)
        .transaction<number>((current: number | null) => (current || 0) + 1)
      if (!txResult.committed) throw new Error('批次編號更新失敗')
      nextBatch = Number(txResult.snapshot.val()) || 1
      deps.state.tableBatchCounts[table] = nextBatch
    } catch (error) {
      alert(`取得批次編號失敗，請稍後再試：${getErrorMessage(error)}`)
      return
    }

    const batchColorIdx = (nextBatch - 1) % 3
    const itemsToSend: PosCartItem[] = deps.state.cart.map((item, index) => ({
      ...item,
      isNew: true,
      batchIdx: batchColorIdx,
      incomingIdx: index,
    }))
    const pendingList = normalizeIncomingQueue(
      await deps.db
        .ref(`incomingOrders/${table}`)
        .once('value')
        .then((snapshot: DatabaseCompatSnapshot) => snapshot.val() as CorePosState['incomingOrders'][string])
        .catch(() => undefined)
    )
    pendingList.push({
      items: itemsToSend,
      customer: readCustomerInfo(),
      batchId: nextBatch,
      timestamp: Date.now(),
    })

    try {
      await deps.saveAllToCloud({
        [`incomingOrders/${table}`]: pendingList,
      })
      alert('✅ 點餐成功！\n\n您的訂單已傳送至櫃台，\n服務人員確認後將為您準備餐點。')
      const justSent = deps.state.cart.map((item) => ({ ...item, isSent: true }))
      deps.state.sentItems = [...deps.state.sentItems, ...justSent]
      sessionStorage.setItem('sentItems', JSON.stringify(deps.state.sentItems))
      deps.state.cart = []
      deps.renderCart()
    } catch (error) {
      alert(`傳送失敗，請通知服務人員：${getErrorMessage(error)}`)
    }
  }

  async function confirmIncomingOrder() {
    if (!deps.state.currentIncomingTable) return
    await deps.ensureRoots([
      'incomingOrders',
      'tableBatchCounts',
      'tableCarts',
      'tableStatuses',
      'tableCustomers',
      'tableTimers',
      'tableSplitCounters',
      'historyOrders',
    ])

    const table = deps.state.currentIncomingTable
    const pendingQueue = normalizeIncomingQueue(deps.state.incomingOrders[table])
    if (!pendingQueue.length) {
      delete deps.state.incomingOrders[table]
      await deps.saveAllToCloud({ [`incomingOrders/${table}`]: null })
      deps.closeIncomingOrderModal()
      deps.checkIncomingOrders()
      return
    }

    const pendingData = pendingQueue.shift() as PosIncomingOrder
    const sentAt = pendingData.timestamp || Date.now()
    const batchId = pendingData.batchId || 0
    const items = (Array.isArray(pendingData.items) ? pendingData.items : [])
      .filter(Boolean)
      .map((item, index) => ({
        ...item,
        batchId,
        sentAt,
        incomingIdx: item.incomingIdx !== undefined ? item.incomingIdx : index,
      }))
      .sort((left, right) => (left.incomingIdx || 0) - (right.incomingIdx || 0))
    const customer = pendingData.customer || {}

    deps.state.tableBatchCounts[table] = batchId
    const currentCart = normalizeCartCollection(deps.state.tableCarts[table])
    const newCart = currentCart.concat(items)
    deps.state.tableCarts[table] = newCart
    const isViewingSameTable = deps.state.selectedTable === table
    if (isViewingSameTable) {
      deps.state.cart = newCart
      deps.state.entryCartSignature = JSON.stringify(deps.state.cart)
    }

    deps.state.tableStatuses[table] = 'yellow'
    const targetCustomer = ensureTableCustomer(deps.state, table)
    if (customer.name) targetCustomer.name = customer.name
    if (!deps.state.tableTimers[table] || !targetCustomer.orderId) {
      deps.state.tableTimers[table] = Date.now()
      deps.state.tableSplitCounters[table] = 1
      targetCustomer.orderId = getTodayOrderCount(deps.state, deps.getBusinessDate, deps.getDateFromOrder) + 1
    }

    await printReceipt(
      {
        seq: targetCustomer.orderId || '?',
        table,
        time: new Date(sentAt).toLocaleString('zh-TW', { hour12: false }),
        items,
        original: 0,
        total: 0,
      },
      true
    )

    delete deps.state.incomingOrders[table]
    if (pendingQueue.length > 0) {
      deps.state.incomingOrders[table] = pendingQueue
    }

    await deps.saveAllToCloud({
      [`incomingOrders/${table}`]: pendingQueue.length > 0 ? pendingQueue : null,
      [`tableBatchCounts/${table}`]: batchId,
      [`tableCarts/${table}`]: newCart,
      [`tableStatuses/${table}`]: 'yellow',
      [`tableCustomers/${table}`]: targetCustomer,
      [`tableTimers/${table}`]: deps.state.tableTimers[table],
      [`tableSplitCounters/${table}`]: deps.state.tableSplitCounters[table],
    })

    deps.closeIncomingOrderModal()
    deps.checkIncomingOrders()
    deps.getShowToast()(`✅ 已接收 ${table} 的訂單`)
    if (isViewingSameTable) deps.renderCart()
  }

  async function rejectIncomingOrder() {
    if (!deps.state.currentIncomingTable) return
    if (!confirm('確定要忽略這筆訂單嗎？')) return
    const table = deps.state.currentIncomingTable
    const pendingQueue = normalizeIncomingQueue(deps.state.incomingOrders[table])
    if (pendingQueue.length > 0) pendingQueue.shift()
    if (pendingQueue.length === 0) delete deps.state.incomingOrders[table]
    else deps.state.incomingOrders[table] = pendingQueue
    await deps.saveAllToCloud({
      [`incomingOrders/${table}`]: pendingQueue.length === 0 ? null : pendingQueue,
    })
    deps.closeIncomingOrderModal()
    deps.checkIncomingOrders()
  }

  async function checkoutAll(manualFinal?: number) {
    await deps.ensureRoots(['historyOrders'])
    const table = ensureSelectedTable(deps.state)
    const payingTotal = manualFinal !== undefined ? manualFinal : deps.state.discountedTotal
    const originalTotal = deps.state.currentOriginalTotal
    const info = ensureTableCustomer(deps.state, table)
    if (!info.orderId || info.orderId === '?' || info.orderId === 'T') {
      info.orderId = getTodayOrderCount(deps.state, deps.getBusinessDate, deps.getDateFromOrder) + 1
    }

    if (originalTotal > 0 || payingTotal > 0) {
      const splitNum = deps.state.tableSplitCounters[table]
      const displaySeq = splitNum && splitNum > 1 ? `${info.orderId}-${splitNum}` : info.orderId
      const displaySeat = splitNum && splitNum > 1 ? `${table} (拆單)` : table
      const processedItems = deps.state.cart.map((item) =>
        buildProcessedItem(item, deps.stripHiddenTag, deps.getItemCategoryType)
      )
      deps.state.historyOrders.push({
        seat: displaySeat,
        formattedSeq: displaySeq,
        time: new Date().toLocaleString('zh-TW', { hour12: false }),
        timestamp: Date.now(),
        items: processedItems,
        total: payingTotal,
        originalTotal,
        customerName: info.name || '',
        customerPhone: info.phone || '',
        isClosed: false,
      })
    }

    delete deps.state.tableCarts[table]
    delete deps.state.tableTimers[table]
    delete deps.state.tableStatuses[table]
    delete deps.state.tableCustomers[table]
    delete deps.state.tableSplitCounters[table]
    delete deps.state.tableBatchCounts[table]
    deps.state.sentItems = []
    sessionStorage.removeItem('sentItems')

    await deps.saveAllToCloud({
      historyOrders: deps.state.historyOrders,
      [`tableCarts/${table}`]: null,
      [`tableTimers/${table}`]: null,
      [`tableStatuses/${table}`]: null,
      [`tableCustomers/${table}`]: null,
      [`tableSplitCounters/${table}`]: null,
      [`tableBatchCounts/${table}`]: null,
    })
    deps.state.cart = []
    deps.state.currentDiscount = { type: 'none', value: 0 }
    deps.state.isServiceFeeEnabled = false
    alert(`💰 結帳完成！實收 $${payingTotal} \n(如需明細，請至「今日訂單」補印)`)
    await deps.openTableSelect()
  }

  function calcFinalPay() {
    const allowance = parseInt(requireInput('payAllowance').value, 10) || 0
    deps.state.finalTotal = Math.max(0, deps.state.discountedTotal - allowance)
    requireInput('payFinal').value = String(deps.state.finalTotal)
  }

  function calcSplitTotal() {
    const baseTotal = deps.state.tempRightList.reduce(
      (sum, item) => sum + (item.isTreat ? 0 : toNumberValue(item.price)),
      0
    )
    const disc = parseFloat(requireInput('splitDisc').value)
    const allow = parseInt(requireInput('splitAllow').value, 10)
    let finalSplit = baseTotal
    if (!Number.isNaN(disc) && disc > 0 && disc <= 100) finalSplit = Math.round(baseTotal * (disc / 100))
    if (!Number.isNaN(allow) && allow > 0) finalSplit -= allow
    finalSplit = Math.max(0, finalSplit)
    requireElement('payTotal').innerText = `$${finalSplit}`
    return finalSplit
  }

  async function fixAllOrderIds() {
    await deps.ensureRoots(['historyOrders', 'tableCustomers', 'tableStatuses'])
    if (
      !confirm(
        '⚠️ 確定要執行「一鍵重整」嗎？\n\n1. 將所有歷史訂單依照日期重新編號 (#1, #2...)\n2. 修正目前桌上未結帳訂單的錯誤單號'
      )
    ) {
      return
    }

    deps.state.historyOrders.sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime())
    const dateCounters: Record<string, number> = {}
    deps.state.historyOrders.forEach((order) => {
      const date = new Date(order.time)
      if (date.getHours() < 5) date.setDate(date.getDate() - 1)
      const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
      dateCounters[dateKey] = (dateCounters[dateKey] || 0) + 1
      order.formattedSeq = dateCounters[dateKey]
      order.seq = dateCounters[dateKey]
    })

    const now = new Date()
    if (now.getHours() < 5) now.setDate(now.getDate() - 1)
    const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
    let currentMaxSeq = dateCounters[todayKey] || 0
    Object.keys(deps.state.tableCustomers).forEach((table) => {
      const customer = deps.state.tableCustomers[table]
      if (customer && deps.state.tableStatuses[table] === 'yellow') {
        currentMaxSeq += 1
        customer.orderId = currentMaxSeq
      }
    })

    const updates: Record<string, unknown> = { historyOrders: deps.state.historyOrders }
    Object.keys(deps.state.tableCustomers).forEach((table) => {
      if (deps.state.tableCustomers[table] && deps.state.tableStatuses[table] === 'yellow') {
        updates[`tableCustomers/${table}`] = deps.state.tableCustomers[table]
      }
    })
    await deps.saveAllToCloud(updates)
    alert('✅ 修復完成！\n歷史訂單已重整，目前桌位單號已校正。\n網頁將自動重新整理。')
    location.reload()
  }

  function initHistoryDate() {
    const now = new Date()
    if (now.getHours() < 5) now.setDate(now.getDate() - 1)
    deps.state.historyViewDate = new Date(now)
  }

  function getOrdersByDate(targetDate: Date) {
    const start = new Date(targetDate)
    start.setHours(5, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return deps.state.historyOrders.filter((order) => {
      const time = deps.getDateFromOrder(order)
      return time >= start && time < end
    })
  }

  function updateSystemTime() {
    const element = findElement('systemTime')
    if (element) element.innerText = `🕒 ${new Date().toLocaleString('zh-TW', { hour12: false })}`
  }

  async function confirmPayment() {
    await deps.ensureRoots(['historyOrders'])
    if (deps.state.tempRightList.length === 0) {
      alert('請先將品項移至右側再結帳')
      return
    }

    const table = ensureSelectedTable(deps.state)
    const finalSplit = calcSplitTotal()
    if (!confirm(`確認收款 $${finalSplit} 嗎？`)) return

    const info = ensureTableCustomer(deps.state, table)
    if (!info.orderId || info.orderId === '?' || info.orderId === 'T') {
      info.orderId = deps.getTodayMaxBaseSeq() + 1
    }

    const splitNum = deps.state.tableSplitCounters[table] || 1
    const processedItems = deps.state.tempRightList.map((item) =>
      buildProcessedItem(item, deps.stripHiddenTag, deps.getItemCategoryType)
    )
    const originalSplitTotal = deps.state.tempRightList.reduce(
      (sum, item) => sum + (item.isTreat ? 0 : toNumberValue(item.price)),
      0
    )

    deps.state.historyOrders.push({
      seat: `${table} (拆單)`,
      formattedSeq: `${info.orderId}-${splitNum}`,
      time: new Date().toLocaleString('zh-TW', { hour12: false }),
      timestamp: Date.now(),
      items: processedItems,
      total: finalSplit,
      originalTotal: originalSplitTotal,
      customerName: info.name || '',
      customerPhone: info.phone || '',
      isClosed: false,
    })

    deps.state.cart = [...deps.state.tempLeftList]
    deps.state.tableCarts[table] = deps.state.cart
    deps.state.tableSplitCounters[table] = splitNum + 1
    if (deps.state.cart.length === 0) {
      delete deps.state.tableCarts[table]
      delete deps.state.tableTimers[table]
      delete deps.state.tableStatuses[table]
      delete deps.state.tableCustomers[table]
      delete deps.state.tableSplitCounters[table]
      delete deps.state.tableBatchCounts[table]
      deps.state.sentItems = []
      sessionStorage.removeItem('sentItems')
    }

    await deps.saveAllToCloud({
      historyOrders: deps.state.historyOrders,
      [`tableCarts/${table}`]: deps.state.cart.length === 0 ? null : deps.state.cart,
      [`tableTimers/${table}`]: deps.state.cart.length === 0 ? null : deps.state.tableTimers[table],
      [`tableStatuses/${table}`]: deps.state.cart.length === 0 ? null : deps.state.tableStatuses[table] || 'yellow',
      [`tableCustomers/${table}`]: deps.state.cart.length === 0 ? null : deps.state.tableCustomers[table],
      [`tableSplitCounters/${table}`]: deps.state.cart.length === 0 ? null : deps.state.tableSplitCounters[table],
      [`tableBatchCounts/${table}`]: deps.state.cart.length === 0 ? null : deps.state.tableBatchCounts[table],
    })
    deps.renderCart()
    deps.closeCheckoutModal()
    deps.getShowToast()(`✅ 已結帳 $${finalSplit}${deps.state.cart.length === 0 ? '，此桌已清空' : ''}`)
  }

  async function printReceipt(data: PosReceiptData, isTicket = false) {
    const printArea = requireElement('receipt-print-area')
    const styleOverride = `<style>
@media print {
  .receipt-section { text-align: left !important; }
  .receipt-items { text-align: left !important; }
  .receipt-item span:first-child { text-align: left !important; }
  .receipt-item span:last-child { text-align: right !important; }
  .receipt-item.kitchen-item { display: flex; justify-content: space-between; }
}
</style>`

    const normalizeItems = (items: PosReceiptData['items']): ReceiptItem[] =>
      Array.isArray(items) ? [...items] : Object.values(items || {})

    const sortItems = (items: ReceiptItem[]) =>
      items.sort((left, right) => {
        const leftSentAt = left.sentAt || 0
        const rightSentAt = right.sentAt || 0
        if (leftSentAt !== rightSentAt) return leftSentAt - rightSentAt
        const leftBatch = typeof left.batchId === 'number' ? left.batchId : Number(left.batchId) || 0
        const rightBatch = typeof right.batchId === 'number' ? right.batchId : Number(right.batchId) || 0
        if (leftBatch !== rightBatch) return leftBatch - rightBatch
        return (left.incomingIdx || 0) - (right.incomingIdx || 0)
      })

    const getItemCategory = (itemName: string) => {
      for (const [category, content] of Object.entries(deps.menuData)) {
        if (Array.isArray(content)) {
          if (content.some((entry) => itemName.includes(entry.name))) return category
          continue
        }
        for (const subContent of Object.values(content)) {
          if (subContent.some((entry) => itemName.includes(entry.name))) return category
        }
      }
      return ''
    }

    const splitByStation = (items: ReceiptItem[]) => {
      const barItems: ReceiptItem[] = []
      const kitchenItems: ReceiptItem[] = []
      items.forEach((item) => {
        const itemCategory = getItemCategory(item.name)
        if (kitchenCategories.includes(itemCategory)) kitchenItems.push(item)
        else barItems.push(item)
      })
      return { barItems, kitchenItems }
    }

    const buildItemsHtml = (items: ReceiptItem[], isFullReceipt: boolean) =>
      items
        .map((item) => {
          let displayName = item.name
          const flavorText = formatFlavorText(item.flavor)
          if (flavorText) displayName += ` (${flavorText})`
          if (item.isTreat && !displayName.includes('(招待)')) displayName += ' (招待)'
          if (!isTicket && item.count && item.count > 1) displayName += ` x${item.count} `
          const count = item.count || 1
          const priceStr = isFullReceipt ? (item.isTreat ? '$0' : `$${toNumberValue(item.price) * count}`) : ''
          return isFullReceipt
            ? `<div class="receipt-item kitchen-item"><span>${displayName}</span><span>${priceStr}</span></div>`
            : `<div class="receipt-item kitchen-item"><span>${displayName}</span><span>x${count}</span></div>`
        })
        .join('')

    const buildFooterHtml = () =>
      `<div class="receipt-footer"><div class="row"><span>原價：</span><span>$${data.original}</span></div><div class="row"><span>總計：</span><span class="total">$${data.total}</span></div></div>`

    const generateHtml = (title: string, items: ReceiptItem[], isFullReceipt: boolean) => {
      const headerAlign = isFullReceipt ? 'center' : 'left'
      const footerHtml = isFullReceipt ? buildFooterHtml() : ''
      return `${styleOverride}<div class="receipt-section" style="text-align: ${headerAlign};"><div class="receipt-header"><h2 class="store-name" style="text-align: ${headerAlign};">${title}</h2><div class="receipt-info" style="text-align: ${headerAlign};"><p>單號：${data.seq}</p><p>桌號：${data.table || ''}</p><p>時間：${data.time}</p></div></div><hr class="dashed-line"><div class="receipt-items">${buildItemsHtml(items, isFullReceipt)}</div><hr class="dashed-line">${footerHtml}</div>`
    }

    const performPrint = (htmlContent: string) =>
      new Promise<void>((resolve) => {
        printArea.innerHTML = htmlContent
        printArea.style.position = 'static'
        printArea.style.width = 'auto'
        printArea.style.height = 'auto'
        setTimeout(() => {
          globalThis.print()
          printArea.style.position = 'absolute'
          printArea.style.width = '0'
          printArea.style.height = '0'
          setTimeout(resolve, 500)
        }, 500)
      })

    const itemsOrdered = sortItems(normalizeItems(data.items))
    if (!isTicket) {
      await performPrint(generateHtml('結帳收據', itemsOrdered, true))
      return
    }

    const { barItems, kitchenItems } = splitByStation(itemsOrdered)
    const queue: string[] = []
    if (barItems.length > 0) queue.push(generateHtml('吧檯工作單', barItems, false))
    if (kitchenItems.length > 0) queue.push(generateHtml('廚房工作單', kitchenItems, false))
    for (const content of queue) {
      await performPrint(content)
    }
  }

  setInterval(updateSystemTime, 1000)

  return {
    addToCart,
    calcFinalPay,
    calcSplitTotal,
    checkoutAll,
    closeBusiness,
    confirmIncomingOrder,
    confirmPayment,
    customerSubmitOrder,
    fixAllOrderIds,
    getOrdersByDate,
    initHistoryDate,
    printReceipt,
    rejectIncomingOrder,
    removeItem,
    saveAndExit,
    saveOrderManual,
    toggleTreat,
    updateSystemTime,
  }
}
