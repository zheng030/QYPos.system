import type { FlavorSelection } from '@/shared/flavor'

export type CartItem = {
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

export function getItemSignature(item: CartItem) {
  const name = item?.name ?? ''
  const price = item?.price ?? ''
  const flavor = item?.flavor ? JSON.stringify(item.flavor) : ''
  const isTreat = item?.isTreat ? 1 : 0
  const batchIdx = item?.batchIdx ?? ''
  const batchId = item?.batchId ?? ''
  const sentAt = item?.sentAt ?? ''
  const incomingIdx = item?.incomingIdx ?? ''
  const isSent = item?.isSent ? 1 : 0

  return [name, price, flavor, isTreat, batchIdx, batchId, sentAt, incomingIdx, isSent].join('||')
}

export function getMergedItems(items: CartItem[]) {
  if (!Array.isArray(items)) {
    return []
  }

  const merged: Array<CartItem & { count: number }> = []
  items.forEach((item) => {
    if (!item) {
      return
    }

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
      existing.count += 1
      return
    }

    merged.push({ ...item, count: 1 })
  })

  return merged
}

export function getDeltaItems(currentCart: CartItem[], baseCart: CartItem[]) {
  const baseCounts = new Map<string, number>()

  baseCart.forEach((item) => {
    const key = getItemSignature(item)
    baseCounts.set(key, (baseCounts.get(key) ?? 0) + 1)
  })

  const delta: CartItem[] = []

  currentCart.forEach((item) => {
    const key = getItemSignature(item)
    const count = baseCounts.get(key) ?? 0

    if (count > 0) {
      baseCounts.set(key, count - 1)
      return
    }

    delta.push(item)
  })

  return delta
}

export function getBusinessDate(date: Date) {
  const businessDate = new Date(date)
  if (Number.isNaN(businessDate.getTime())) {
    return new Date().setHours(0, 0, 0, 0)
  }

  if (businessDate.getHours() < 5) {
    businessDate.setDate(businessDate.getDate() - 1)
  }

  businessDate.setHours(0, 0, 0, 0)
  return businessDate.getTime()
}
