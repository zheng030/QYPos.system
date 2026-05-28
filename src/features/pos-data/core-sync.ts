import type {
  CorePosState,
  PosIncomingOrder,
  PosIncomingOrderQueue,
  PosOrder,
  PosRootName,
  PosRootValueMap,
  PosSyncRecord,
  PosSystemPasswordConfig,
  PosTableCustomer,
} from '@/features/pos-kernel/types'
import { findElement, findSelector, requireInput } from '@/shared/dom-helpers'
import { getErrorMessage } from '@/shared/errors'
import type { DatabaseCompatSnapshot } from '@/shared/firebase-compat'

type DataSyncInstance = {
  db: {
    ref(path: string): {
      once(eventName: 'value'): Promise<DatabaseCompatSnapshot>
      on(eventName: 'value', listener: (snapshot: DatabaseCompatSnapshot) => void): unknown
      update(payload: Record<string, unknown>): Promise<void>
    }
  }
  subscribedRoots: Set<string>
  initLocal: (roots?: string[]) => void
  setRemoteRevisions: (revisions?: Record<string, number> | null) => void
  shouldApplyRemote: (root: string) => boolean
  applyRemoteValue: (root: string, value: unknown) => Promise<void>
  subscribeRoots: (roots?: string[]) => Promise<void>
  ensureRoots: (roots?: string[]) => Promise<void>
  getRootKey: (path: string) => string
  bumpRevisionsForPayload: (payload: Record<string, unknown>, roots: string[]) => void
}

type CoreSyncDeps = {
  state: CorePosState
  dataSync: () => DataSyncInstance
  localDataPrefix: string
  customerDataRootKeys: string[]
  adminBaseRootKeys: string[]
  systemPassword: PosSystemPasswordConfig
  foodOptionVariants: Record<string, string[]>
  getBusinessDate: (value: Date | string | number) => number
  getDateFromOrder: (order: PosOrder) => Date
  getShowApp: () => (options?: { skipHome?: boolean }) => Promise<void>
  renderTableGrid: () => Promise<void> | void
  renderCart: () => void
  showHistory: () => void
  generateReport: (type: string) => void
  renderCalendar: () => void
  renderItemStats: (range: string) => void
  renderPublicStats: () => void
  updateFinancialPage: (ownerName: string) => void
  renderConfidentialCalendar: (ownerName: string) => void
  showIncomingOrderModal: (table: string, orderData: PosIncomingOrder) => void
  closeIncomingOrderModal: () => void
  pbkdf2Hash: (password: string, salt: string) => Promise<string>
}

const rootNames: PosRootName[] = [
  'historyOrders',
  'tableTimers',
  'tableCarts',
  'tableStatuses',
  'tableCustomers',
  'tableSplitCounters',
  'itemCosts',
  'itemPrices',
  'inventory',
  'attendanceEmployees',
  'attendanceRecords',
  'incomingOrders',
  'tableBatchCounts',
  'ownerPasswords',
]

function cloneValue<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return value
  }
}

function isRootName(value: string): value is PosRootName {
  return rootNames.includes(value as PosRootName)
}

function normalizeCartCollection(cart: CorePosState['tableCarts'][string]) {
  if (Array.isArray(cart)) return [...cart]
  if (cart && typeof cart === 'object') return Object.values(cart)
  return []
}

function normalizeIncomingQueue(queue: PosIncomingOrderQueue | undefined) {
  if (Array.isArray(queue)) return [...queue]
  if (queue && typeof queue === 'object') return Object.values(queue)
  return []
}

function isVisible(element: HTMLElement | null, display: string) {
  return element?.style.display === display
}

function setText(id: string, text: string, color?: string) {
  const element = findElement(id)
  if (!element) return
  element.innerText = text
  if (color) {
    element.style.color = color
  }
}

function setInputValue(id: string, value: string) {
  const element = findElement<HTMLInputElement>(id)
  if (element) {
    element.value = value
  }
}

function getCheckedInputWithin(element: Element | null) {
  const checkbox = element?.querySelector('input')
  return checkbox instanceof HTMLInputElement ? checkbox : null
}

function normalizeHistoryOrders(value: unknown) {
  const rawHistory = value ? (Array.isArray(value) ? value : Object.values(value as Record<string, unknown>)) : []
  return rawHistory.filter((order): order is PosOrder => {
    return !!order && typeof order === 'object' && Array.isArray((order as PosOrder).items) && 'total' in order
  })
}

export function createCoreSyncModule(deps: CoreSyncDeps) {
  function ensureSyncLog() {
    return deps.state.syncLog
  }

  function pushSyncRecord(record: Record<string, unknown>) {
    const log = ensureSyncLog()
    log.push(record as PosSyncRecord)
    if (log.length > 1000) {
      log.shift()
    }
  }

  function getCallerName() {
    try {
      const stack = new Error().stack || ''
      const lines = stack.split('\n').map((line) => line.trim())
      for (const line of lines) {
        if (line.includes('saveAllToCloud') || line.includes('getCallerName') || line === 'Error') {
          continue
        }
        const match = line.match(/at\s+([^\s(]+)/)
        if (match?.[1]) {
          return match[1]
        }
      }
    } catch {}

    return 'unknown'
  }

  function getRootValue(root: string) {
    if (!isRootName(root)) {
      return null
    }
    return deps.state[root]
  }

  function normalizeRootValue<K extends PosRootName>(root: K, value: unknown): PosRootValueMap[K] {
    if (root === 'historyOrders') {
      return normalizeHistoryOrders(value) as PosRootValueMap[K]
    }
    if (root === 'ownerPasswords') {
      return ((value && typeof value === 'object' ? value : {}) as PosRootValueMap[K]) || ({} as PosRootValueMap[K])
    }
    return ((value && typeof value === 'object' ? value : {}) as PosRootValueMap[K]) || ({} as PosRootValueMap[K])
  }

  function applyRootValue(root: string, value: unknown) {
    if (!isRootName(root)) {
      return
    }
    Object.assign(deps.state, { [root]: normalizeRootValue(root, value) })
  }

  function getCachedRootValue(root: string) {
    try {
      const raw = localStorage.getItem(`${deps.localDataPrefix}${root}`)
      return raw ? (JSON.parse(raw) as unknown) : null
    } catch {
      return null
    }
  }

  function getValueAtPath(rootValue: unknown, path: string) {
    if (!path) return null
    const parts = path.split('/')
    if (parts.length === 1) return rootValue
    let current: unknown = rootValue
    for (let index = 1; index < parts.length; index += 1) {
      if (!current || typeof current !== 'object') {
        return null
      }
      current = (current as Record<string, unknown>)[parts[index]]
    }
    return current
  }

  function getTodayMaxBaseSeq() {
    const currentBizDate = deps.getBusinessDate(new Date())
    let maxSeq = 0
    deps.state.historyOrders.forEach((order) => {
      if (deps.getBusinessDate(deps.getDateFromOrder(order)) !== currentBizDate) {
        return
      }

      let base = 0
      if (order.formattedSeq) {
        const parts = String(order.formattedSeq).split('-')
        base = parseInt(parts[0], 10) || 0
      } else if (order.seq) {
        base = parseInt(String(order.seq), 10) || 0
      }
      if (base > maxSeq) {
        maxSeq = base
      }
    })
    return maxSeq
  }

  function getVisibleOrders() {
    try {
      const currentBizDate = deps.getBusinessDate(new Date())
      return deps.state.historyOrders
        .filter((order) => deps.getBusinessDate(deps.getDateFromOrder(order)) === currentBizDate)
        .reverse()
    } catch (error) {
      alert(`getVisibleOrders Error:\n${getErrorMessage(error)}`)
      return []
    }
  }

  function syncCurrentTableInputs(info: PosTableCustomer) {
    setInputValue('custName', info.name || '')
    setInputValue('custPhone', info.phone || '')
  }

  function refreshOrderPageState() {
    const orderPage = findElement('orderPage')
    if (!isVisible(orderPage, 'block') || !deps.state.selectedTable) {
      return
    }

    const table = deps.state.selectedTable
    const currentCart = normalizeCartCollection(deps.state.tableCarts[table])
    if (document.body.classList.contains('customer-mode')) {
      deps.state.sentItems = currentCart.map((item) => ({ ...item, isSent: true }))
      sessionStorage.setItem('sentItems', JSON.stringify(deps.state.sentItems))
      deps.state.entryCartSignature = JSON.stringify(deps.state.cart || [])
      deps.renderCart()
      return
    }

    deps.state.cart = currentCart
    deps.state.entryCartSignature = JSON.stringify(deps.state.cart || [])
    syncCurrentTableInputs(deps.state.tableCustomers[table] || { name: '', phone: '' })
    deps.renderCart()
  }

  function refreshOwnerPage() {
    const currentOwner = findElement('ownerWelcome')?.innerText || ''
    const confidentialPage = findElement('confidentialPage')
    if (!currentOwner || !isVisible(confidentialPage, 'block')) {
      return
    }

    const savedMode = sessionStorage.getItem('ownerMode') || 'finance'
    if (savedMode === 'cost') {
      deps.updateFinancialPage(currentOwner)
    } else {
      deps.renderConfidentialCalendar(currentOwner)
    }
  }

  async function refreshUiAfterDataChange() {
    const tableSelect = findElement('tableSelect')
    if (isVisible(tableSelect, 'block')) {
      await deps.renderTableGrid()
    }

    refreshOrderPageState()

    setTimeout(() => {
      if (isVisible(findElement('historyPage'), 'block')) {
        deps.showHistory()
      }

      if (isVisible(findElement('reportPage'), 'block')) {
        const activeOption = findSelector<HTMLElement>('.segment-option.active')
        const type = activeOption?.innerText === '本周' ? 'week' : activeOption?.innerText === '當月' ? 'month' : 'day'
        deps.generateReport(type)
        deps.renderCalendar()
      }

      if (isVisible(findElement('itemStatsModal'), 'flex')) {
        const activeBtn = findSelector<HTMLElement>('.report-controls button.active')
        let range = 'day'
        if (activeBtn?.id === 'statBtnWeek') range = 'week'
        if (activeBtn?.id === 'statBtnMonth') range = 'month'
        deps.renderItemStats(range)
      }

      if (isVisible(findElement('pastHistoryPage'), 'block')) {
        deps.renderPublicStats()
      }
    }, 50)

    refreshOwnerPage()
  }

  function normalizeHistoryData(value: unknown) {
    deps.state.historyOrders = normalizeHistoryOrders(value)
  }

  async function initRealtimeData() {
    const dataSync = deps.dataSync()
    const isCustomerMode =
      sessionStorage.getItem('customerMode') === 'true' || document.body.classList.contains('customer-mode')
    const activeRoots = isCustomerMode ? deps.customerDataRootKeys : deps.adminBaseRootKeys
    dataSync.initLocal(activeRoots)
    await refreshUiAfterDataChange()

    dataSync.db.ref('revisions').on('value', (snapshot) => {
      const revisions = (snapshot.val() || {}) as Record<string, number>
      dataSync.setRemoteRevisions(revisions)
      dataSync.subscribedRoots.forEach(async (root) => {
        if (!dataSync.shouldApplyRemote(root)) {
          return
        }

        try {
          const snap = await dataSync.db.ref(root).once('value')
          await dataSync.applyRemoteValue(root, snap.val())
        } catch {}
      })
    })

    await dataSync.subscribeRoots(activeRoots)
  }

  async function ensureDataSubscriptions(roots: string[]) {
    const dataSync = deps.dataSync()
    dataSync.initLocal(roots)
    return dataSync.ensureRoots(roots)
  }

  async function ensureRoots(roots: string[]) {
    const dataSync = deps.dataSync()
    dataSync.initLocal(roots)
    await dataSync.ensureRoots(roots)
  }

  function checkIncomingOrders() {
    for (const [table, queue] of Object.entries(deps.state.incomingOrders)) {
      const items = normalizeIncomingQueue(queue)
      if (items.length > 0) {
        deps.showIncomingOrderModal(table, items[0])
        return
      }
    }
    deps.closeIncomingOrderModal()
  }

  async function saveAllToCloud(updates: Record<string, unknown>) {
    const dataSync = deps.dataSync()
    if (Object.keys(updates).length === 0) {
      return
    }

    const payload: Record<string, unknown> = {}
    const touchedRoots = new Set<string>()
    for (const [path, value] of Object.entries(updates)) {
      payload[path] = value === undefined ? null : value
      const root = dataSync.getRootKey(path)
      if (root) {
        touchedRoots.add(root)
      }
    }

    const roots = Array.from(touchedRoots)
    const caller = getCallerName()
    const beforeByPath: Record<string, unknown> = {}
    const afterByPath: Record<string, unknown> = {}
    for (const path of Object.keys(payload)) {
      const root = dataSync.getRootKey(path)
      const cachedRoot = root ? getCachedRootValue(root) : null
      const currentRoot = root ? getRootValue(root) : null
      beforeByPath[path] = cloneValue(getValueAtPath(cachedRoot, path))
      afterByPath[path] = cloneValue(getValueAtPath(currentRoot, path))
    }

    const record: PosSyncRecord = {
      ts: Date.now(),
      type: 'saveAllToCloud',
      caller,
      roots,
      paths: Object.keys(payload),
      beforeValues: beforeByPath,
      afterValues: afterByPath,
      status: 'pending',
    }
    pushSyncRecord(record)
    dataSync.bumpRevisionsForPayload(payload, roots)

    try {
      await dataSync.db.ref('/').update(payload)
      record.status = 'ok'
      record.doneTs = Date.now()
    } catch (error) {
      record.status = 'error'
      record.doneTs = Date.now()
      record.error = getErrorMessage(error)
      alert(JSON.stringify(error))
    }
  }

  async function verifySystemPassword(password: string) {
    if (!deps.systemPassword?.passwordSalt || !deps.systemPassword.passwordHash) {
      return false
    }
    const computed = await deps.pbkdf2Hash(password, deps.systemPassword.passwordSalt)
    return computed === deps.systemPassword.passwordHash
  }

  async function checkLogin() {
    try {
      const input = requireInput('loginPass').value
      if (await verifySystemPassword(input)) {
        sessionStorage.setItem('isLoggedIn', 'true')
        const loginError = findElement('loginError')
        if (loginError) loginError.style.display = 'none'
        await deps.getShowApp()()
      } else {
        const loginError = findElement('loginError')
        if (loginError) loginError.style.display = 'block'
        requireInput('loginPass').value = ''
      }
    } catch (error) {
      alert(`登入錯誤: ${getErrorMessage(error)}`)
    }
  }

  async function updateItemData(name: string, type: string, value: string) {
    let numericValue = parseInt(value, 10)
    if (Number.isNaN(numericValue)) {
      numericValue = 0
    }
    if (type === 'cost') deps.state.itemCosts[name] = numericValue
    else if (type === 'price') deps.state.itemPrices[name] = numericValue

    const path = type === 'cost' ? `itemCosts/${name}` : `itemPrices/${name}`
    await saveAllToCloud({ [path]: numericValue })
  }

  async function toggleStockStatus(name: string, isAvailable: boolean) {
    deps.state.inventory[name] = isAvailable
    setText(`status-main-${name}`, isAvailable ? '有貨' : '售完', isAvailable ? '#06d6a0' : '#ef476f')
    await saveAllToCloud({ [`inventory/${name}`]: isAvailable })
  }

  async function toggleOptionStock(name: string, option: string, isAvailable: boolean) {
    deps.state.inventory[`${name}::${option}`] = isAvailable
    setText(`status-opt-${name}::${option}`, isAvailable ? '顯示' : '隱藏', isAvailable ? '#06d6a0' : '#ef476f')

    if (deps.foodOptionVariants[name]) {
      const hasAny = deps.foodOptionVariants[name].some(
        (variant) => deps.state.inventory[`${name}::${variant}`] !== false
      )
      deps.state.inventory[name] = hasAny

      const parentEl = findElement(`status-main-${name}`)
      if (parentEl) {
        parentEl.innerText = hasAny ? '有貨' : '售完'
        parentEl.style.color = hasAny ? '#06d6a0' : '#ef476f'
        const checkbox = getCheckedInputWithin(parentEl.nextElementSibling)
        if (checkbox) {
          checkbox.checked = hasAny
        }
      }
    }

    const updates: Record<string, boolean> = { [`inventory/${name}::${option}`]: isAvailable }
    if (deps.foodOptionVariants[name]) {
      updates[`inventory/${name}`] = deps.foodOptionVariants[name].some(
        (variant) => deps.state.inventory[`${name}::${variant}`] !== false
      )
    }
    await saveAllToCloud(updates)
  }

  async function toggleParentWithOptions(name: string, isAvailable: boolean) {
    deps.state.inventory[name] = isAvailable
    setText(`status-main-${name}`, isAvailable ? '有貨' : '售完', isAvailable ? '#06d6a0' : '#ef476f')

    if (deps.foodOptionVariants[name]) {
      deps.foodOptionVariants[name].forEach((option) => {
        deps.state.inventory[`${name}::${option}`] = isAvailable
        setText(`status-opt-${name}::${option}`, isAvailable ? '顯示' : '隱藏', isAvailable ? '#06d6a0' : '#ef476f')
        const optionElement = findElement(`status-opt-${name}::${option}`)
        const checkbox = getCheckedInputWithin(optionElement?.nextElementSibling || null)
        if (checkbox) {
          checkbox.checked = isAvailable
        }
      })
    }

    const updates: Record<string, boolean> = { [`inventory/${name}`]: isAvailable }
    deps.foodOptionVariants[name]?.forEach((option) => {
      updates[`inventory/${name}::${option}`] = isAvailable
    })
    await saveAllToCloud(updates)
  }

  return {
    applyRootValue,
    checkIncomingOrders,
    checkLogin,
    cloneValue,
    ensureDataSubscriptions,
    ensureRoots,
    ensureSyncLog,
    getCachedRootValue,
    getCallerName,
    getRootValue,
    getTodayMaxBaseSeq,
    getValueAtPath,
    getVisibleOrders,
    initRealtimeData,
    normalizeHistoryData,
    pushSyncRecord,
    refreshUiAfterDataChange,
    saveAllToCloud,
    toggleOptionStock,
    toggleParentWithOptions,
    toggleStockStatus,
    updateItemData,
    verifySystemPassword,
  }
}
