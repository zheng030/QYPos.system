import type { PosMenuData, PosMenuItem, PosSelectionRule } from '@/features/pos-kernel/types'

type ProductManagementDeps = {
  inventory: () => Record<string, boolean | undefined>
  menuData: PosMenuData
}

type InventoryToggleGroup = {
  id: string
  label: string
  keys: string[]
}

type InventoryToggleSection = {
  id: string
  title: string
  groups: InventoryToggleGroup[]
}

type ProductManagementOpenState = {
  quickPanelOpen: boolean
  categoryAccordions: Record<string, boolean>
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isAvailable(inventory: Record<string, boolean | undefined>, inventoryKey: string) {
  return inventory[inventoryKey] !== false
}

function buildStatusText(available: boolean) {
  return available
    ? `<span style="color:#06d6a0; font-weight:bold;">有貨</span>`
    : `<span style="color:#ef476f; font-weight:bold;">售完</span>`
}

function buildGroupStatusText(inventory: Record<string, boolean | undefined>, keys: string[]) {
  const availableCount = keys.filter((key) => isAvailable(inventory, key)).length
  if (availableCount === 0) {
    return `<span style="color:#ef476f; font-weight:bold;">售完</span>`
  }
  if (availableCount === keys.length) {
    return `<span style="color:#06d6a0; font-weight:bold;">有貨</span>`
  }
  return `<span style="color:#f59e0b; font-weight:bold;">部分售完</span>`
}

function getBundleSelectionRules(item: PosMenuItem) {
  return (item.kind === 'bundle' ? item.selections || [] : []).filter(
    (rule): rule is Extract<PosSelectionRule, { kind: 'single' }> =>
      rule.kind === 'single' && rule.tracksInventory && !rule.options.some((option) => option.targetItemId)
  )
}

function getAllItems(menuData: PosMenuData) {
  return Object.values(menuData).flatMap((category) => category?.sections.flatMap((section) => section.items) || [])
}

function dedupeSortedKeys(keys: string[]) {
  return [...new Set(keys)].sort((left, right) => left.localeCompare(right))
}

function buildBatchGroups(menuData: PosMenuData): InventoryToggleSection[] {
  const items = getAllItems(menuData)
  const categoryGroups: InventoryToggleGroup[] = Object.values(menuData)
    .filter(Boolean)
    .map((category) => ({
      id: `category.${category.key}`,
      label: category.label,
      keys: dedupeSortedKeys(category.sections.flatMap((section) => section.items.map((item) => item.inventoryKey))),
    }))
    .filter((group) => group.keys.length > 0)

  const selectionGroups = new Map<string, InventoryToggleGroup>()

  items.forEach((item) => {
    getBundleSelectionRules(item).forEach((rule) => {
      rule.options.forEach((option) => {
        const mapKey = `selection.${rule.id}.${option.value}`
        const current = selectionGroups.get(mapKey)
        if (current) {
          current.keys.push(option.inventoryKey)
          return
        }
        selectionGroups.set(mapKey, {
          id: mapKey,
          label: `${rule.label} / ${option.label}`,
          keys: [option.inventoryKey],
        })
      })
    })
  })

  const normalizedSelectionGroups = [...selectionGroups.values()]
    .map((group) => ({ ...group, keys: dedupeSortedKeys(group.keys) }))
    .sort((left, right) => left.label.localeCompare(right.label, 'zh-Hant'))

  return [
    { id: 'category', title: '菜單分類', groups: categoryGroups },
    { id: 'selection', title: '口味 / 主食', groups: normalizedSelectionGroups },
  ].filter((section) => section.groups.length > 0)
}

function renderBatchToggleGroup(
  title: string,
  groups: InventoryToggleGroup[],
  inventory: Record<string, boolean | undefined>
) {
  if (groups.length === 0) return ''
  return `
    <section class="product-mgmt-quick-group">
      <h3>${escapeHtml(title)}</h3>
      <div class="product-mgmt-quick-list">
        ${groups
          .map((group) => {
            const checked = group.keys.every((key) => isAvailable(inventory, key))
            return `
              <div class="product-mgmt-row">
                <span style="font-size:14px; color:#555;">${escapeHtml(group.label)}</span>
                <div style="display:flex; align-items:center; gap:10px;">
                  ${buildGroupStatusText(inventory, group.keys)}
                  <label class="toggle-switch">
                    <input
                      type="checkbox"
                      ${checked ? 'checked' : ''}
                      data-action="toggle-inventory-batch"
                      data-batch-keys="${escapeHtml(group.keys.join(','))}"
                    >
                    <span class="slider"></span>
                  </label>
                </div>
              </div>
            `
          })
          .join('')}
      </div>
    </section>
  `
}

function renderBundleRuleRows(item: PosMenuItem, inventory: Record<string, boolean | undefined>) {
  const rows: string[] = []
  getBundleSelectionRules(item).forEach((rule) => {
    rule.options.forEach((option) => {
      const available = isAvailable(inventory, option.inventoryKey)
      rows.push(`
        <div class="product-mgmt-row" style="padding-left:20px;">
          <span style="font-size:14px; color:#555;">${escapeHtml(rule.label)} / ${escapeHtml(option.label)}</span>
          <div style="display:flex; align-items:center; gap:10px;">
            ${buildStatusText(available)}
            <label class="toggle-switch">
              <input
                type="checkbox"
                ${available ? 'checked' : ''}
                data-action="toggle-option-stock"
                data-name="${escapeHtml(item.id)}"
                data-option="${escapeHtml(option.inventoryKey)}"
              >
              <span class="slider"></span>
            </label>
          </div>
        </div>
      `)
    })
  })
  return rows.join('')
}

function renderItemRow(item: PosMenuItem, inventory: Record<string, boolean | undefined>) {
  const available = isAvailable(inventory, item.inventoryKey)
  const ruleRows = renderBundleRuleRows(item, inventory)
  return `
    <div class="product-mgmt-row">
      <span style="font-size:16px; font-weight:500;">${escapeHtml(item.name)}</span>
      <div style="display:flex; align-items:center; gap:10px;">
        ${buildStatusText(available)}
        <label class="toggle-switch">
          <input
            type="checkbox"
            ${available ? 'checked' : ''}
            data-action="toggle-stock-status"
            data-name="${escapeHtml(item.id)}"
          >
          <span class="slider"></span>
        </label>
      </div>
    </div>
    ${ruleRows}
  `
}

export function renderProductManagement({ inventory, menuData }: ProductManagementDeps) {
  const container = document.getElementById('productManagementList')
  if (!container) return
  const openState: ProductManagementOpenState = {
    quickPanelOpen: false,
    categoryAccordions: {},
  }
  const quickPanel = container.querySelector<HTMLElement>('[data-product-quick-panel]')
  openState.quickPanelOpen = quickPanel?.classList.contains('show') || false
  container.querySelectorAll('.accordion-content').forEach((element) => {
    if (element.classList.contains('show')) openState.categoryAccordions[(element as HTMLElement).id] = true
  })

  const inventoryState = inventory()
  const batchGroups = buildBatchGroups(menuData)
  container.innerHTML = `
    <button class="accordion-header-mgmt btn-effect ${openState.quickPanelOpen ? 'active' : ''}" data-action="toggle-accordion" data-id="product-quick-panel">
      <span>⚡ 快速切換</span>
      <span class="arrow">▼</span>
    </button>
    <div id="product-quick-panel" data-product-quick-panel class="accordion-content ${openState.quickPanelOpen ? 'show' : ''}">
      <div class="product-mgmt-quick-panel">
        ${batchGroups.map((section) => renderBatchToggleGroup(section.title, section.groups, inventoryState)).join('')}
      </div>
    </div>
  `

  let index = 0
  for (const [categoryKey, category] of Object.entries(menuData)) {
    if (!category) continue
    index += 1
    const accId = `mgmt-acc-${index}`
    const isOpen = openState.categoryAccordions[accId] ? 'show' : ''
    const isActive = openState.categoryAccordions[accId] ? 'active' : ''
    const items = category.sections.flatMap((section) => section.items)
    const itemsHtml = items.map((item) => renderItemRow(item, inventoryState)).join('')
    container.innerHTML += `<button class="accordion-header-mgmt btn-effect ${isActive}" data-action="toggle-accordion" data-id="${accId}"><span>📂 ${escapeHtml(category.label || categoryKey)}</span><span class="arrow">▼</span></button><div id="${accId}" class="accordion-content ${isOpen}">${itemsHtml}</div>`
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
