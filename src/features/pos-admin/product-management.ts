import type { PosMenuData, PosMenuItem, PosMenuSection } from '@/features/pos-kernel/types'

type ProductManagementDeps = {
  inventory: () => Record<string, boolean | undefined>
  menuData: PosMenuData
  foodOptionVariants: Record<string, string[]>
  hasAvailableVariants: (name: string) => boolean
}

export function renderProductManagement({
  inventory,
  menuData,
  foodOptionVariants,
  hasAvailableVariants,
}: ProductManagementDeps) {
  const container = document.getElementById('productManagementList')
  if (!container) return
  const openStates: Record<string, boolean> = {}
  container.querySelectorAll('.accordion-content').forEach((element) => {
    if (element.classList.contains('show')) openStates[(element as HTMLElement).id] = true
  })
  container.innerHTML = ''
  let index = 0
  for (const [category, content] of Object.entries(menuData)) {
    if (category === '其他') continue
    index += 1
    const accId = `mgmt-acc-${index}`
    const isOpen = openStates[accId] ? 'show' : ''
    const isActive = openStates[accId] ? 'active' : ''
    let itemsHtml = ''
    let items: PosMenuItem[] = []
    if (Array.isArray(content)) items = content
    else {
      for (const subItems of Object.values(content as Record<string, PosMenuSection>)) items = items.concat(subItems)
    }
    items.forEach((item) => {
      const isSpecial = Boolean(foodOptionVariants[item.name])
      const isAvailable = isSpecial ? hasAvailableVariants(item.name) : inventory()[item.name] !== false
      const checked = isAvailable ? 'checked' : ''
      const statusText = isAvailable
        ? `<span id="status-main-${item.name}" style="color:#06d6a0; font-weight:bold;">有貨</span>`
        : `<span id="status-main-${item.name}" style="color:#ef476f; font-weight:bold;">售完</span>`
      itemsHtml += `<div class="product-mgmt-row"><span style="font-size:16px; font-weight:500;">${item.name}</span><div style="display:flex; align-items:center; gap:10px;">${statusText}<label class="toggle-switch"><input type="checkbox" ${checked} data-action="${isSpecial ? 'toggle-parent-with-options' : 'toggle-stock-status'}" data-name="${item.name}"><span class="slider"></span></label></div></div>`
      if (isSpecial) {
        foodOptionVariants[item.name].forEach((option) => {
          const optionKey = `${item.name}::${option}`
          const optionAvailable = inventory()[optionKey] !== false
          const optionChecked = optionAvailable ? 'checked' : ''
          const optionStatus = optionAvailable
            ? `<span id="status-opt-${optionKey}" style="color:#06d6a0; font-weight:bold;">顯示</span>`
            : `<span id="status-opt-${optionKey}" style="color:#ef476f; font-weight:bold;">隱藏</span>`
          itemsHtml += `<div class="product-mgmt-row" style="padding-left:20px; list-style: none;"><li style="font-size:14px; color:#555; list-style: disc;">${option}</li><div style="display:flex; align-items:center; gap:10px;">${optionStatus}<label class="toggle-switch"><input type="checkbox" ${optionChecked} data-action="toggle-option-stock" data-name="${item.name}" data-option="${option}"><span class="slider"></span></label></div></div>`
        })
      }
    })
    container.innerHTML += `<button class="accordion-header-mgmt btn-effect ${isActive}" data-action="toggle-accordion" data-id="${accId}"><span>📂 ${category}</span><span class="arrow">▼</span></button><div id="${accId}" class="accordion-content ${isOpen}">${itemsHtml}</div>`
  }
}

export function downloadSyncLog(log: Record<string, unknown>[]) {
  if (log.length === 0) {
    alert('Sync log is empty.')
    return
  }
  const payload = JSON.stringify(log, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'log.json'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadLocalStorage() {
  try {
    const data: Record<string, string | null> = {}
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key) continue
      data[key] = localStorage.getItem(key)
    }
    const payload = JSON.stringify(data, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'localstorage.json'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    alert(`匯出 localStorage 失敗: ${message}`)
  }
}

export function closeSummaryModal() {
  const element = document.getElementById('summaryModal')
  if (element) {
    element.style.display = 'none'
  }
}
