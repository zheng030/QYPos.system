import type { PosDrinkTemperatureSwitch, PosMenuData, PosMenuItem, PosSelectionRule } from '@/features/pos-kernel/types'

type Inventory = Record<string, boolean | undefined>

export type StockStatus = 'available' | 'sold-out' | 'partial'

export type InventoryToggleGroup = {
  id: string
  label: string
  keys: string[]
}

export type InventoryToggleSection = {
  id: string
  title: string
  groups: InventoryToggleGroup[]
}

export type QuickToggleRow = InventoryToggleGroup & { checked: boolean; status: StockStatus }

export type QuickToggleSection = { id: string; title: string; rows: QuickToggleRow[] }

export type OptionStockRow = { inventoryKey: string; label: string; available: boolean }

export type ItemStockRow = { id: string; name: string; available: boolean; options: OptionStockRow[] }

export type CategoryStockPanel = { accordionId: string; label: string; items: ItemStockRow[] }

export type ProductManagementView = {
  quickSections: QuickToggleSection[]
  categories: CategoryStockPanel[]
}

export const QUICK_PANEL_ID = 'product-quick-panel'

function isAvailable(inventory: Inventory, inventoryKey: string) {
  return inventory[inventoryKey] !== false
}

function getGroupStatus(inventory: Inventory, keys: string[]): StockStatus {
  const availableCount = keys.filter((key) => isAvailable(inventory, key)).length
  if (availableCount === 0) return 'sold-out'
  return availableCount === keys.length ? 'available' : 'partial'
}

function getBundleSelectionRules(item: PosMenuItem) {
  return (item.kind === 'bundle' ? item.selections || [] : []).filter(
    (rule): rule is Extract<PosSelectionRule, { kind: 'single' }> =>
      rule.kind === 'single' && rule.tracksInventory && !rule.options.some((option) => option.targetItemId)
  )
}

function dedupeSortedKeys(keys: string[]) {
  return [...new Set(keys)].sort((left, right) => left.localeCompare(right))
}

export function buildBatchGroups(
  menuData: PosMenuData,
  drinkTemperatureSwitches: PosDrinkTemperatureSwitch[]
): InventoryToggleSection[] {
  const categories = Object.values(menuData).filter(Boolean)
  const categoryGroups: InventoryToggleGroup[] = categories
    .map((category) => ({
      id: `category.${category.key}`,
      label: category.label,
      keys: dedupeSortedKeys(category.sections.flatMap((section) => section.items.map((item) => item.inventoryKey))),
    }))
    .filter((group) => group.keys.length > 0)

  const selectionGroups = new Map<string, InventoryToggleGroup>()
  for (const item of categories.flatMap((category) => category.sections.flatMap((section) => section.items))) {
    for (const rule of getBundleSelectionRules(item)) {
      for (const option of rule.options) {
        const id = `selection.${rule.id}.${option.value}`
        const current = selectionGroups.get(id)
        if (current) {
          current.keys.push(option.inventoryKey)
        } else {
          selectionGroups.set(id, { id, label: `${rule.label} / ${option.label}`, keys: [option.inventoryKey] })
        }
      }
    }
  }

  const sortedSelectionGroups = [...selectionGroups.values()]
    .map((group) => ({ ...group, keys: dedupeSortedKeys(group.keys) }))
    .sort((left, right) => left.label.localeCompare(right.label, 'zh-Hant'))

  const temperatureGroups = drinkTemperatureSwitches.map((option) => ({
    id: option.soldOutKey,
    label: option.label,
    keys: [option.soldOutKey],
  }))

  return [
    { id: 'category', title: '菜單分類', groups: categoryGroups },
    { id: 'selection', title: '口味 / 主食', groups: sortedSelectionGroups },
    { id: 'drink-temperature', title: '飲品溫度', groups: temperatureGroups },
  ].filter((section) => section.groups.length > 0)
}

export function buildProductManagementView(
  menuData: PosMenuData,
  drinkTemperatureSwitches: PosDrinkTemperatureSwitch[],
  inventory: Inventory
): ProductManagementView {
  const quickSections = buildBatchGroups(menuData, drinkTemperatureSwitches).map((section) => ({
    id: section.id,
    title: section.title,
    rows: section.groups.map((group) => ({
      ...group,
      checked: group.keys.every((key) => isAvailable(inventory, key)),
      status: getGroupStatus(inventory, group.keys),
    })),
  }))

  const categories = Object.entries(menuData)
    .filter(([, category]) => Boolean(category))
    .map(([categoryKey, category], index) => ({
      accordionId: `mgmt-acc-${index + 1}`,
      label: category.label || categoryKey,
      items: category.sections
        .flatMap((section) => section.items)
        .map((item) => ({
          id: item.id,
          name: item.name,
          available: isAvailable(inventory, item.inventoryKey),
          options: getBundleSelectionRules(item).flatMap((rule) =>
            rule.options.map((option) => ({
              inventoryKey: option.inventoryKey,
              label: `${rule.label} / ${option.label}`,
              available: isAvailable(inventory, option.inventoryKey),
            }))
          ),
        })),
    }))

  return { quickSections, categories }
}
