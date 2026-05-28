import type {
  CorePosState,
  PosCartItem,
  PosMergedCartItem,
  PosPrice,
  PosReceiptData,
} from '@/features/pos-kernel/types'
import { requireCheckedInput, requireElement, requireInput } from '@/shared/dom-helpers'
import { getErrorMessage } from '@/shared/errors'
import { formatFlavorText } from '@/shared/flavor'
import { getLegacyElement } from '@/shared/legacy-dom'

type MenuModalDeps = {
  state: CorePosState
  itemPrices: () => Record<string, PosPrice | undefined>
  foodOptionVariants: Record<string, string[]>
  getAvailableVariants: (name: string) => string[] | null
  getMergedItems: (items: PosCartItem[]) => PosMergedCartItem[]
  getAddToCart: () => (name: string, price: PosPrice, options?: { variant?: string }) => void
  calcSplitTotal: () => number
  checkoutAll: (manualFinal?: number) => Promise<void>
  printReceipt: (data: PosReceiptData, isTicket?: boolean) => Promise<void>
  renderCart: () => void
}

export function createMenuModalModule(deps: MenuModalDeps) {
  function addInlineHiddenBeer() {
    let name = requireInput('hbName').value.trim()
    const price = parseInt(requireInput('hbPrice').value, 10)
    if (!name) name = '隱藏啤酒'
    if (Number.isNaN(price) || price < 0) {
      alert('請輸入正確價格')
      return
    }
    deps.getAddToCart()(name, price)
  }

  function checkItemType(name: string, price: number | string, categoryName: string) {
    if (name === '隱藏特調') {
      if (typeof price === 'number') {
        openCustomModal(name, price)
      }
      return
    }
    const priceOverride = deps.itemPrices()[name]
    const realPrice = priceOverride !== undefined ? priceOverride : price
    if (name === '隱藏啤酒') {
      deps.getAddToCart()(name, realPrice)
      return
    }
    if (categoryName === '咖啡') {
      openDrinkModal(name, realPrice as number, 'coffee')
      return
    }
    if (categoryName === '飲料') {
      if (name.includes('茶')) openDrinkModal(name, realPrice as number, 'tea')
      else openDrinkModal(name, realPrice as number, 'drink')
      return
    }
    if (categoryName === '主餐') {
      if (name === '炒飯') {
        openFoodModal(name, realPrice as number, 'friedRice')
        return
      }
      if (name === '日式炒烏龍麵' || name === '親子丼') {
        openFoodModal(name, realPrice as number, 'meatOnly')
        return
      }
    }
    deps.getAddToCart()(name, realPrice)
  }

  function addShotSet(name: string, price: number) {
    deps.getAddToCart()(`${name} <small style='color:#06d6a0'>[買5送1]</small>`, price * 5)
  }

  function openFoodModal(name: string, price: number, type: string) {
    deps.state.tempCustomItem = { name, price, type }
    requireElement('foodTitle').innerText = name
    const meatOptions = requireElement('meatOptions')
    let variants = deps.foodOptionVariants[name] || []
    const available = deps.getAvailableVariants(name)
    if (available) variants = available
    if (variants.length === 0) {
      alert('此品項的子選項已全部下架，無法選擇')
      return
    }
    meatOptions.innerHTML = variants
      .map(
        (option, index) =>
          `<label class="radio-box"><input type="radio" name="meat" value="${option}" ${index === 0 ? 'checked' : ''}><div class="radio-btn btn-effect">${option}${type === 'friedRice' ? ` ($${price})` : ''}</div></label>`
      )
      .join('')
    getLegacyElement('foodOptionModal').style.display = 'flex'
  }

  function closeFoodModal() {
    getLegacyElement('foodOptionModal').style.display = 'none'
    deps.state.tempCustomItem = null
  }

  function confirmFoodItem() {
    try {
      if (!deps.state.tempCustomItem) return
      const meat = requireCheckedInput('meat').value
      deps.getAddToCart()(
        `${deps.state.tempCustomItem.name} <small style='color:#666'>(${meat})</small>`,
        deps.state.tempCustomItem.price,
        { variant: meat }
      )
      closeFoodModal()
    } catch (error) {
      alert(`加入餐點失敗: ${getErrorMessage(error)}`)
    }
  }

  function openDrinkModal(name: string, price: number, type: string) {
    deps.state.tempCustomItem = { name, price, type }
    requireElement('drinkTitle').innerText = name
    const simpleTemp = requireElement('simpleTempSection')
    const advTemp = requireElement('advanceTempSection')
    const sugar = requireElement('sugarSection')
    const simpleDefault = document.querySelector<HTMLInputElement>('input[name="simpleTemp"][value="冰"]')
    const advDefault = document.querySelector<HTMLInputElement>('input[name="advTemp"][value="去冰"]')
    const sugarDefault = document.querySelector<HTMLInputElement>('input[name="sugar"][value="無糖"]')
    if (simpleDefault) simpleDefault.checked = true
    if (advDefault) advDefault.checked = true
    if (sugarDefault) sugarDefault.checked = true
    if (type === 'coffee') {
      simpleTemp.style.display = 'block'
      advTemp.style.display = 'none'
      sugar.style.display = 'none'
    } else if (type === 'drink') {
      simpleTemp.style.display = 'none'
      advTemp.style.display = 'block'
      sugar.style.display = 'none'
    } else if (type === 'tea') {
      simpleTemp.style.display = 'none'
      advTemp.style.display = 'block'
      sugar.style.display = 'block'
    }
    getLegacyElement('drinkModal').style.display = 'flex'
  }

  function closeDrinkModal() {
    getLegacyElement('drinkModal').style.display = 'none'
    deps.state.tempCustomItem = null
  }

  function confirmDrinkItem() {
    try {
      if (!deps.state.tempCustomItem) return
      let note = ''
      if (deps.state.tempCustomItem.type === 'coffee') {
        const temp = requireCheckedInput('simpleTemp').value
        note = `<small style='color:#666'>(${temp})</small>`
      } else {
        const temp = requireCheckedInput('advTemp').value
        if (deps.state.tempCustomItem.type === 'tea') {
          const sugar = requireCheckedInput('sugar').value
          note = `<small style='color:#666'>(${temp} / ${sugar})</small>`
        } else {
          note = `<small style='color:#666'>(${temp})</small>`
        }
      }
      deps.getAddToCart()(`${deps.state.tempCustomItem.name} ${note}`, deps.state.tempCustomItem.price)
      closeDrinkModal()
    } catch (error) {
      alert(`加入飲料失敗: ${getErrorMessage(error)}`)
    }
  }

  function openCustomModal(name: string, price: number) {
    deps.state.tempCustomItem = { name, price }
    const flavorDefault = document.querySelector<HTMLInputElement>('input[name="flavor"][value="花香調"]')
    const tasteDefault = document.querySelector<HTMLInputElement>('input[name="taste"][value="偏酸"]')
    if (flavorDefault) flavorDefault.checked = true
    if (tasteDefault) tasteDefault.checked = true
    const alcoholSec = requireElement('modalAlcoholSection')
    const noteSec = requireElement('modalNoteSection')
    const title = requireElement('customTitle')
    if (price === 280) {
      title.innerText = '隱藏特調'
      alcoholSec.style.display = 'block'
      noteSec.style.display = 'none'
      deps.state.isExtraShot = false
      document.getElementById('extraShotBtn')?.classList.remove('active')
      requireInput('alcoholRange').value = '0'
      requireElement('alcoholVal').innerText = '0'
    } else if (price === 300) {
      title.innerText = '隱藏特調'
      alcoholSec.style.display = 'none'
      noteSec.style.display = 'block'
      requireInput('customNote').value = ''
    }
    getLegacyElement('customModal').style.display = 'flex'
  }

  function toggleExtraShot() {
    deps.state.isExtraShot = !deps.state.isExtraShot
    document.getElementById('extraShotBtn')?.classList.toggle('active')
  }

  function closeCustomModal() {
    getLegacyElement('customModal').style.display = 'none'
    deps.state.tempCustomItem = null
  }

  function confirmCustomItem() {
    try {
      if (!deps.state.tempCustomItem) return
      const flavor = requireCheckedInput('flavor').value
      const taste = requireCheckedInput('taste').value
      let extraStr = ''
      let finalPrice = deps.state.tempCustomItem.price
      if (deps.state.tempCustomItem.price === 280) {
        const alcohol = requireInput('alcoholRange').value
        if (deps.state.isExtraShot) {
          finalPrice += 40
          extraStr += "<br><b style='color:#d33;'>🔥 濃度升級 (+$40)</b>"
        }
        extraStr += `<br><small style='color:#666'>(${flavor} / ${taste} / 濃度+${alcohol}%)</small>`
      } else {
        const note = requireInput('customNote').value.trim()
        if (note) {
          extraStr += `<br><span style='color:#007bff; font-size:14px;'>📝 ${note}</span>`
        }
        extraStr += `<br><small style='color:#666'>(${flavor} / ${taste})</small>`
      }
      deps.getAddToCart()(`${deps.state.tempCustomItem.name} ${extraStr}`, finalPrice)
      closeCustomModal()
    } catch (error) {
      alert(`加入特調失敗: ${getErrorMessage(error)}`)
    }
  }

  function openDiscountModal() {
    getLegacyElement('discountModal').style.display = 'flex'
  }

  function closeDiscountModal() {
    getLegacyElement('discountModal').style.display = 'none'
  }

  function confirmDiscount() {
    const value = parseFloat(requireInput('discInput').value)
    if (Number.isNaN(value) || value <= 0 || value > 100) {
      alert('請輸入正確折數 (1-100)')
      return
    }
    deps.state.currentDiscount = { type: 'percent', value }
    deps.renderCart()
    closeDiscountModal()
  }

  function openAllowanceModal() {
    getLegacyElement('allowanceModal').style.display = 'flex'
  }

  function closeAllowanceModal() {
    getLegacyElement('allowanceModal').style.display = 'none'
  }

  function confirmAllowance() {
    const value = parseInt(requireInput('allowInput').value, 10)
    if (Number.isNaN(value) || value < 0) {
      alert('請輸入正確金額')
      return
    }
    deps.state.currentDiscount = { type: 'amount', value }
    deps.renderCart()
    closeAllowanceModal()
  }

  async function openPaymentModal() {
    if (deps.state.cart.length === 0) {
      if (!confirm('購物車是空的，確定要直接清桌嗎？')) return
      await deps.checkoutAll(0)
      return
    }
    requireElement('payOriginal').innerText = `$${deps.state.discountedTotal}`
    const labels: string[] = []
    if (deps.state.currentDiscount.type === 'percent') labels.push(`${deps.state.currentDiscount.value} 折`)
    if (deps.state.currentDiscount.type === 'amount') labels.push(`折讓 ${deps.state.currentDiscount.value}`)
    if (deps.state.isServiceFeeEnabled) labels.push('10% 服務費')
    requireElement('payDiscLabel').innerText = labels.length > 0 ? `(${labels.join(' + ')})` : ''
    requireInput('payAllowance').value = ''
    requireInput('payFinal').value = String(deps.state.discountedTotal)
    deps.state.finalTotal = deps.state.discountedTotal
    getLegacyElement('paymentModal').style.display = 'flex'
  }

  function closePaymentModal() {
    getLegacyElement('paymentModal').style.display = 'none'
  }

  async function confirmCheckout() {
    const finalAmount = parseInt(requireInput('payFinal').value, 10)
    if (Number.isNaN(finalAmount) || finalAmount < 0) {
      alert('金額錯誤！')
      return
    }
    await deps.checkoutAll(finalAmount)
    closePaymentModal()
  }

  function openSplitCheckout() {
    if (deps.state.cart.length === 0) {
      alert('購物車是空的，無法拆單！')
      return
    }
    deps.state.tempLeftList = [...deps.state.cart]
    deps.state.tempRightList = []
    const splitDisc = document.getElementById('splitDisc') as HTMLInputElement | null
    const splitAllow = document.getElementById('splitAllow') as HTMLInputElement | null
    if (splitDisc) splitDisc.value = ''
    if (splitAllow) splitAllow.value = ''
    renderCheckoutLists()
    getLegacyElement('checkoutModal').style.display = 'flex'
  }

  function renderCheckoutLists() {
    let leftHTML = ''
    let rightHTML = ''
    if (deps.state.tempLeftList.length === 0) {
      leftHTML = "<div class='empty-hint'>已無剩餘項目</div>"
    } else {
      deps.state.tempLeftList.forEach((item, index) => {
        const price = item.isTreat ? 0 : item.price
        const priceHtml = item.isTreat ? `<span style="color:#06d6a0; font-weight:700;">$0</span>` : `$${price}`
        leftHTML += `<div class="checkout-item" data-action="move-to-pay" data-index="${index}"><span>${item.name}${item.isTreat && !item.name.includes('(招待)') ? ' (招待)' : ''}</span><span>${priceHtml}</span></div>`
      })
    }

    if (deps.state.tempRightList.length === 0) {
      rightHTML = "<div class='empty-hint'>點擊左側加入</div>"
    } else {
      deps.state.tempRightList.forEach((item, index) => {
        const price = item.isTreat ? 0 : item.price
        const priceHtml = item.isTreat ? `<span style="color:#06d6a0; font-weight:700;">$0</span>` : `$${price}`
        rightHTML += `<div class="checkout-item" data-action="remove-from-pay" data-index="${index}"><span>${item.name}${item.isTreat && !item.name.includes('(招待)') ? ' (招待)' : ''}</span><span>${priceHtml}</span></div>`
      })
    }
    requireElement('unpaidList').innerHTML = leftHTML
    requireElement('payingList').innerHTML = rightHTML
    deps.calcSplitTotal()
  }

  function moveToPay(index: number) {
    const item = deps.state.tempLeftList.splice(index, 1)[0]
    deps.state.tempRightList.push(item)
    renderCheckoutLists()
  }

  function removeFromPay(index: number) {
    const item = deps.state.tempRightList.splice(index, 1)[0]
    deps.state.tempLeftList.push(item)
    renderCheckoutLists()
  }

  function closeCheckoutModal() {
    getLegacyElement('checkoutModal').style.display = 'none'
  }

  function updateDiscPreview() {
    const value = parseFloat(requireInput('discInput').value)
    if (Number.isNaN(value) || value <= 0 || value > 100) {
      requireElement('discPreviewText').innerText = ''
      return
    }
    const discounted = Math.round(deps.state.currentOriginalTotal * (value / 100))
    requireElement('discPreviewText').innerText = `原價 $${deps.state.currentOriginalTotal} ➡ 折後 $${discounted}`
  }

  function openReprintModal() {
    if (deps.state.cart.length === 0) {
      alert('購物車是空的')
      return
    }
    const list = requireElement('reprintList')
    list.innerHTML = ''
    const reprintItems = deps.state.isCartSimpleMode
      ? deps.getMergedItems(deps.state.cart)
      : deps.state.cart.map((item) => ({ ...item, count: item.count || 1 }))
    deps.state.reprintItemsForModal = reprintItems
    list.innerHTML = `<label class="checkout-item reprint-select-all" style="justify-content: flex-start; gap: 10px;"><input type="checkbox" id="selectAllReprint" checked data-action="toggle-all-reprint"><span>全選 / 取消全選</span></label><hr style="margin: 5px 0;">`
    reprintItems.forEach((item, index) => {
      const price = item.isTreat ? 0 : item.price
      const countText = item.count && item.count > 1 ? ` x${item.count}` : ''
      const flavorText = formatFlavorText(item.flavor)
      const itemLabel = `${item.name}${flavorText ? ` (${flavorText})` : ''}`
      const priceText = price === 0 ? `<span style="color:#06d6a0; font-weight:700;">$0</span>` : `$${price}`
      list.innerHTML += `<label class="checkout-item" style="justify-content: space-between; gap: 10px;"><div style="display:flex; align-items:center; gap:10px;"><input type="checkbox" class="reprint-checkbox" id="reprint-item-${index}" checked><span>${itemLabel}${item.isTreat && !item.name.includes('(招待)') ? ' (招待)' : ''}${countText}</span></div><span style="color:#475569;">${priceText}</span></label>`
    })
    getLegacyElement('reprintSelectionModal').style.display = 'flex'
  }

  function toggleAllReprint(source: HTMLInputElement) {
    document.querySelectorAll('.reprint-checkbox').forEach((checkbox) => {
      ;(checkbox as HTMLInputElement).checked = source.checked
    })
  }

  function closeReprintModal() {
    getLegacyElement('reprintSelectionModal').style.display = 'none'
  }

  function confirmReprintSelection() {
    try {
      const selectedItems: PosCartItem[] = []
      const sourceItems = deps.state.reprintItemsForModal || deps.state.cart
      sourceItems.forEach((item, index) => {
        const checkbox = findReprintCheckbox(index)
        if (checkbox?.checked) selectedItems.push(item)
      })
      if (selectedItems.length === 0) {
        alert('請至少選擇一個項目')
        return
      }
      selectedItems.sort((left, right) => {
        const leftSentAt = left.sentAt || 0
        const rightSentAt = right.sentAt || 0
        if (leftSentAt === rightSentAt) return 0
        return leftSentAt - rightSentAt
      })
      let seqNum: string | number = '補'
      const selectedTable = deps.state.selectedTable
      const selectedCustomer = selectedTable ? deps.state.tableCustomers[selectedTable] : null
      if (selectedCustomer?.orderId !== undefined) {
        seqNum = selectedCustomer.orderId
      }
      const printTime = selectedItems[0].sentAt ? new Date(selectedItems[0].sentAt) : new Date()
      void deps.printReceipt(
        {
          seq: seqNum,
          table: deps.state.selectedTable || undefined,
          time: printTime.toLocaleString('zh-TW', { hour12: false }),
          items: selectedItems,
          original: 0,
          total: 0,
        },
        true
      )
      closeReprintModal()
    } catch (error) {
      alert(`補單發生錯誤: ${getErrorMessage(error)}`)
    }
  }

  function findReprintCheckbox(index: number) {
    const checkbox = document.getElementById(`reprint-item-${index}`)
    return checkbox instanceof HTMLInputElement ? checkbox : null
  }

  return {
    addInlineHiddenBeer,
    addShotSet,
    checkItemType,
    closeAllowanceModal,
    closeCheckoutModal,
    closeCustomModal,
    closeDiscountModal,
    closeDrinkModal,
    closeFoodModal,
    closePaymentModal,
    closeReprintModal,
    confirmAllowance,
    confirmCheckout,
    confirmCustomItem,
    confirmDiscount,
    confirmDrinkItem,
    confirmFoodItem,
    confirmReprintSelection,
    moveToPay,
    openAllowanceModal,
    openCustomModal,
    openDiscountModal,
    openDrinkModal,
    openFoodModal,
    openPaymentModal,
    openReprintModal,
    openSplitCheckout,
    removeFromPay,
    renderCheckoutLists,
    toggleAllReprint,
    toggleExtraShot,
    updateDiscPreview,
  }
}
