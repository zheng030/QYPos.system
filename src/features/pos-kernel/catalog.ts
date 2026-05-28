import type { FlavorSelection } from '@/shared/flavor'
import type {
  PosCartItem,
  PosInventoryMap,
  PosItemCostsMap,
  PosMenuData,
  PosMenuItem,
  PosMenuSection,
  PosMergedCartItem,
  PosOrder,
} from './types'

type CatalogHelpersDeps = {
  foodOptionVariants: Record<string, string[]>
  getInventory: () => PosInventoryMap
  getItemCosts: () => PosItemCostsMap
  menuData: PosMenuData
}

type ItemWithFlavor = {
  name?: string
  price?: number | string
  flavor?: FlavorSelection | null
  isTreat?: boolean
  batchIdx?: number
  batchId?: number | string
  sentAt?: number | string
  incomingIdx?: number
  isSent?: boolean
  count?: number
}

function isMenuItem(value: unknown): value is PosMenuItem {
  return Boolean(value && typeof value === 'object' && 'name' in value)
}

export function getMergedItems(items: ItemWithFlavor[]): PosMergedCartItem[] {
  if (!items || !Array.isArray(items)) return []

  const merged: PosMergedCartItem[] = []
  items.forEach((item) => {
    if (!item?.name || item.price === undefined) return

    const existing = merged.find(
      (candidate) =>
        candidate.name === item.name &&
        candidate.price === item.price &&
        JSON.stringify(candidate.flavor ?? null) === JSON.stringify(item.flavor ?? null) &&
        candidate.isTreat === item.isTreat &&
        candidate.batchIdx === item.batchIdx &&
        candidate.isSent === item.isSent
    )

    if (existing) {
      existing.count = (existing.count || 1) + 1
      return
    }

    const sentAt =
      typeof item.sentAt === 'number'
        ? item.sentAt
        : Number.isFinite(Number(item.sentAt))
          ? Number(item.sentAt)
          : undefined

    merged.push({
      ...item,
      name: item.name,
      price: item.price,
      sentAt,
      count: 1,
    })
  })

  return merged
}

export function getItemSignature(item: ItemWithFlavor) {
  const name = item?.name ? item.name : ''
  const price = item && item.price !== undefined ? item.price : ''
  const flavor = item?.flavor ? JSON.stringify(item.flavor) : ''
  const isTreat = item?.isTreat ? 1 : 0
  const batchIdx = item && item.batchIdx !== undefined ? item.batchIdx : ''
  const batchId = item && item.batchId !== undefined ? item.batchId : ''
  const sentAt = item && item.sentAt !== undefined ? item.sentAt : ''
  const incomingIdx = item && item.incomingIdx !== undefined ? item.incomingIdx : ''
  const isSent = item?.isSent ? 1 : 0

  return [name, price, flavor, isTreat, batchIdx, batchId, sentAt, incomingIdx, isSent].join('||')
}

export function getDeltaItems(currentCart: PosCartItem[], baseCart: PosCartItem[]) {
  const baseCounts = new Map<string, number>()

  baseCart.forEach((item) => {
    const key = getItemSignature(item)
    baseCounts.set(key, (baseCounts.get(key) || 0) + 1)
  })

  const delta: PosCartItem[] = []
  currentCart.forEach((item) => {
    const key = getItemSignature(item)
    const count = baseCounts.get(key) || 0

    if (count > 0) {
      baseCounts.set(key, count - 1)
      return
    }

    delta.push(item)
  })

  return delta
}

export function getDateFromOrder(order: Partial<PosOrder> | null | undefined) {
  if (!order) return new Date()
  if (order.timestamp) return new Date(order.timestamp)
  if (order.time) {
    const date = new Date(order.time)
    if (!Number.isNaN(date.getTime())) return date
  }
  return new Date()
}

export function getBusinessDate(dateObj: Date | string | number) {
  let date = new Date(dateObj)
  if (Number.isNaN(date.getTime())) date = new Date()
  if (date.getHours() < 5) date.setDate(date.getDate() - 1)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function normalizeItemNameForMatch(name: string) {
  if (!name) return ''
  return name.replace(' (招待)', '').trim()
}

export function stripHiddenTag(name: string) {
  if (!name) return ''
  const cleaned = name.replace(/\s*[(（]隱藏[)）]\s*/g, '').trim()
  return cleaned || name
}

export function shouldHideCustomerItemName(name: string) {
  return name.includes('(隱藏)')
}

export function createCatalogHelpers({ foodOptionVariants, getInventory, getItemCosts, menuData }: CatalogHelpersDeps) {
  function getItemCategoryType(itemName: string) {
    const normalizedName = itemName.trim()
    if (!normalizedName) return 'unknown'
    if (normalizedName === '奶茶') return 'bbq'

    const barCats = ['調酒', '純飲', 'shot', '啤酒', '咖啡', '飲料', '厚片', '甜點', '其他']
    const bbqCats = ['燒烤', '主餐', '炸物']

    for (const [category, content] of Object.entries(menuData)) {
      if (Array.isArray(content)) {
        if (content.some((item) => isMenuItem(item) && normalizedName.includes(item.name))) {
          if (barCats.includes(category)) return 'bar'
          if (bbqCats.includes(category)) return 'bbq'
        }
        continue
      }

      for (const subContent of Object.values(content as Record<string, PosMenuSection>)) {
        if (subContent.some((item) => isMenuItem(item) && normalizedName.includes(item.name))) {
          if (barCats.includes(category)) return 'bar'
          if (bbqCats.includes(category)) return 'bbq'
        }
      }
    }

    if (
      normalizedName.includes('雞') ||
      normalizedName.includes('豬') ||
      normalizedName.includes('牛') ||
      normalizedName.includes('飯') ||
      normalizedName.includes('麵')
    ) {
      return 'bbq'
    }

    return 'unknown'
  }

  function getCostByItemName(itemName: string, variant?: string) {
    const rawName = itemName || ''
    const variantMatch = rawName.match(/[（(]([^（）()]+)[)）]/)
    const variantFromName = variantMatch ? variantMatch[1].trim() : ''
    const normalizedName = rawName.trim()
    if (!normalizedName) return 0

    const cleanName = normalizedName.replace(' (招待)', '').trim()
    const finalVariant = (variant || variantFromName || '').trim()
    const allowedVariants = foodOptionVariants?.[cleanName] || null
    const itemCosts = getItemCosts()

    if (finalVariant && (!allowedVariants || allowedVariants.includes(finalVariant))) {
      const variantKey = `${cleanName}::${finalVariant}`
      if (itemCosts[variantKey] !== undefined) return itemCosts[variantKey]
    }

    if (itemCosts[cleanName] !== undefined) return itemCosts[cleanName]

    const baseName = cleanName.replace(/\s*[(（].*?[)）]$/, '').trim()
    if (itemCosts[baseName] !== undefined) return itemCosts[baseName]
    if (cleanName.includes('隱藏特調') && itemCosts.隱藏特調 !== undefined) {
      return itemCosts.隱藏特調
    }

    return 0
  }

  function getAvailableVariants(name: string) {
    const variants = foodOptionVariants[name]
    if (!variants) return null
    const inventory = getInventory()
    return variants.filter((option) => inventory[`${name}::${option}`] !== false)
  }

  function hasAvailableVariants(name: string) {
    const variants = foodOptionVariants[name]
    const inventory = getInventory()
    if (!variants) return inventory[name] !== false
    if (inventory[name] === false) return false
    return (getAvailableVariants(name)?.length || 0) > 0
  }

  return {
    getAvailableVariants,
    getCostByItemName,
    getItemCategoryType,
    hasAvailableVariants,
  }
}
