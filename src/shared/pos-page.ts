export const POS_PAGE_IDS = [
  'home',
  'orderPage',
  'historyPage',
  'tableSelect',
  'reportPage',
  'confidentialPage',
  'settingsPage',
  'pastHistoryPage',
  'productPage',
  'itemStatsPage',
  'checkinPage',
] as const

export type PosPageId = (typeof POS_PAGE_IDS)[number]
