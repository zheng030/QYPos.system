import type {
  AddToCartOptions,
  CorePosState,
  PosCartItem,
  PosMenuData,
  PosOrder,
  PosReceiptData,
  PosTableCustomer,
  PosToastOptions,
} from '@/features/pos-kernel/types'
import { findElement, requireElement, requireInput } from '@/shared/dom-helpers'
import { getErrorMessage, toNumberValue } from '@/shared/errors'
import { DEFAULT_FLAVOR_SELECTION, formatFlavorText, isFlavorCategory, normalizeFlavorSelection } from '@/shared/flavor'

type ServiceFlowDeps = {
  state: CorePosState
  menuData: PosMenuData
  getDeltaItems: (currentCart: PosCartItem[], baseCart: PosCartItem[]) => PosCartItem[]
  getItemCategoryType: (name: string) => string
  stripHiddenTag: (name: string) => string
  saveTableDraft: (
    table: string,
    cart: PosCartItem[],
    customer: PosTableCustomer
  ) => Promise<{ displaySeqBase: number }>
  submitIncomingOrder: (table: string, cart: PosCartItem[], customer: PosTableCustomer) => Promise<void>
  acceptIncomingOrder: (
    table: string,
    requestId: string
  ) => Promise<{
    customer: PosTableCustomer
    items: PosCartItem[]
    sentAt: number
    displaySeqBase: number
  } | null>
  rejectIncomingOrder: (table: string, requestId: string) => Promise<void>
  checkoutTable: (payload: {
    table: string
    cart: PosCartItem[]
    customer: PosTableCustomer | undefined
    paidTotal: number
    originalTotal: number
    splitCounter: number | null
  }) => Promise<PosOrder>
  checkoutSplit: (payload: {
    table: string
    cart: PosCartItem[]
    customer: PosTableCustomer | undefined
    paidTotal: number
    originalTotal: number
    splitCounter: number | null
    remainingCart: PosCartItem[]
    nextSplitCounter: number
  }) => Promise<PosOrder>
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

      const draft = await deps.saveTableDraft(table, itemsToSave, customer)
      customer.orderId = draft.displaySeqBase

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
    try {
      await deps.submitIncomingOrder(table, deps.state.cart, readCustomerInfo())
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

    const table = deps.state.currentIncomingTable
    const currentIncoming = Array.isArray(deps.state.incomingOrders[table])
      ? deps.state.incomingOrders[table]?.[0]
      : null
    const requestId = String(currentIncoming?.requestId || '')
    if (!requestId) {
      deps.closeIncomingOrderModal()
      deps.checkIncomingOrders()
      return
    }

    const accepted = await deps.acceptIncomingOrder(table, requestId)
    if (!accepted) {
      deps.closeIncomingOrderModal()
      deps.checkIncomingOrders()
      return
    }

    const targetCustomer = ensureTableCustomer(deps.state, table)
    const { customer, items, sentAt, displaySeqBase } = accepted
    if (customer.name) targetCustomer.name = customer.name
    if (customer.phone) targetCustomer.phone = customer.phone
    targetCustomer.orderId = displaySeqBase

    await printReceipt(
      {
        seq: displaySeqBase || '?',
        table,
        time: new Date(sentAt).toLocaleString('zh-TW', { hour12: false }),
        items,
        original: 0,
        total: 0,
      },
      true
    )

    deps.closeIncomingOrderModal()
    deps.checkIncomingOrders()
    deps.getShowToast()(`✅ 已接收 ${table} 的訂單`)
    if (deps.state.selectedTable === table) deps.renderCart()
  }

  async function rejectIncomingOrder() {
    if (!deps.state.currentIncomingTable) return
    if (!confirm('確定要忽略這筆訂單嗎？')) return
    const table = deps.state.currentIncomingTable
    const currentIncoming = Array.isArray(deps.state.incomingOrders[table])
      ? deps.state.incomingOrders[table]?.[0]
      : null
    const requestId = String(currentIncoming?.requestId || '')
    if (!requestId) {
      deps.closeIncomingOrderModal()
      deps.checkIncomingOrders()
      return
    }
    await deps.rejectIncomingOrder(table, requestId)
    deps.closeIncomingOrderModal()
    deps.checkIncomingOrders()
  }

  async function checkoutAll(manualFinal?: number) {
    const table = ensureSelectedTable(deps.state)
    const payingTotal = manualFinal !== undefined ? manualFinal : deps.state.discountedTotal
    const originalTotal = deps.state.currentOriginalTotal
    const info = ensureTableCustomer(deps.state, table)
    const currentSplitCounter = deps.state.tableSplitCounters[table] || 1

    delete deps.state.tableCarts[table]
    delete deps.state.tableTimers[table]
    delete deps.state.tableStatuses[table]
    delete deps.state.tableCustomers[table]
    delete deps.state.tableSplitCounters[table]
    delete deps.state.tableBatchCounts[table]
    deps.state.sentItems = []
    sessionStorage.removeItem('sentItems')

    if (originalTotal > 0 || payingTotal > 0) {
      const processedItems = deps.state.cart.map((item) =>
        buildProcessedItem(item, deps.stripHiddenTag, deps.getItemCategoryType)
      )
      await deps.checkoutTable({
        table,
        cart: processedItems,
        customer: info,
        paidTotal: payingTotal,
        originalTotal,
        splitCounter: currentSplitCounter > 1 ? currentSplitCounter : null,
      })
    }
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
    alert('一鍵重整已停用，請改用 v3 單日重編流程')
  }

  function updateSystemTime() {
    const element = findElement('systemTime')
    if (element) element.innerText = `🕒 ${new Date().toLocaleString('zh-TW', { hour12: false })}`
  }

  async function confirmPayment() {
    if (deps.state.tempRightList.length === 0) {
      alert('請先將品項移至右側再結帳')
      return
    }

    const table = ensureSelectedTable(deps.state)
    const finalSplit = calcSplitTotal()
    if (!confirm(`確認收款 $${finalSplit} 嗎？`)) return

    const info = ensureTableCustomer(deps.state, table)
    const splitNum = deps.state.tableSplitCounters[table] || 1
    const processedItems = deps.state.tempRightList.map((item) =>
      buildProcessedItem(item, deps.stripHiddenTag, deps.getItemCategoryType)
    )
    const originalSplitTotal = deps.state.tempRightList.reduce(
      (sum, item) => sum + (item.isTreat ? 0 : toNumberValue(item.price)),
      0
    )

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

    await deps.checkoutSplit({
      table,
      cart: processedItems,
      customer: info,
      paidTotal: finalSplit,
      originalTotal: originalSplitTotal,
      splitCounter: splitNum,
      remainingCart: deps.state.cart,
      nextSplitCounter: splitNum + 1,
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
    printReceipt,
    rejectIncomingOrder,
    removeItem,
    saveAndExit,
    saveOrderManual,
    toggleTreat,
    updateSystemTime,
  }
}
