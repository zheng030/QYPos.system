export const FLAVOR_SERVICE_CATEGORIES = ['燒烤', '炸物', '主餐'] as const
export const FLAVOR_SPICE_OPTIONS = ['不辣', '小辣', '中辣', '大辣'] as const
export const FLAVOR_LEMON_OPTIONS = ['要', '不要'] as const

export type FlavorSpice = (typeof FLAVOR_SPICE_OPTIONS)[number]
export type FlavorLemon = (typeof FLAVOR_LEMON_OPTIONS)[number]

export type FlavorSelection = {
  spice: FlavorSpice
  lemon: FlavorLemon
}

export const DEFAULT_FLAVOR_SELECTION: FlavorSelection = {
  spice: '不辣',
  lemon: '不要',
}

export function isFlavorCategory(category: string | null | undefined) {
  if (!category) {
    return false
  }

  return FLAVOR_SERVICE_CATEGORIES.includes(category as (typeof FLAVOR_SERVICE_CATEGORIES)[number])
}

export function normalizeFlavorSelection(value: unknown): FlavorSelection | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const spice = (value as { spice?: unknown }).spice
  const lemon = (value as { lemon?: unknown }).lemon
  if (!FLAVOR_SPICE_OPTIONS.includes(spice as FlavorSpice) || !FLAVOR_LEMON_OPTIONS.includes(lemon as FlavorLemon)) {
    return null
  }

  return {
    spice: spice as FlavorSpice,
    lemon: lemon as FlavorLemon,
  }
}

export function hasCustomFlavor(flavor: FlavorSelection | null | undefined) {
  if (!flavor) {
    return false
  }

  return flavor.spice !== DEFAULT_FLAVOR_SELECTION.spice || flavor.lemon !== DEFAULT_FLAVOR_SELECTION.lemon
}

export function formatFlavorText(flavor: FlavorSelection | null | undefined) {
  if (!hasCustomFlavor(flavor)) {
    return ''
  }

  const parts: string[] = []
  if (flavor && flavor.spice !== DEFAULT_FLAVOR_SELECTION.spice) {
    parts.push(flavor.spice)
  }
  if (flavor && flavor.lemon !== DEFAULT_FLAVOR_SELECTION.lemon) {
    parts.push('要檸檬')
  }
  return parts.join(' / ')
}

export function formatFlavorBadgeHtml(flavor: FlavorSelection | null | undefined) {
  if (!hasCustomFlavor(flavor) || !flavor) {
    return ''
  }

  const tags: string[] = []
  if (flavor.spice !== DEFAULT_FLAVOR_SELECTION.spice) {
    tags.push(`<span class="flavor-tag spice spice-${flavor.spice}">${flavor.spice}</span>`)
  }
  if (flavor.lemon !== DEFAULT_FLAVOR_SELECTION.lemon) {
    tags.push('<span class="flavor-tag lemon lemon-要">要檸檬</span>')
  }
  return tags.join('')
}
