import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const RTDB_ROOT = 'v3'
const LEGACY_ROOTS = [
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

function parseArgs(argv) {
  const args = {
    mode: 'dry-run',
    serviceAccount: '',
    outDir: '',
    databaseURL: '',
    frontendData: path.resolve('frontend/data.js'),
  }
  for (const raw of argv) {
    if (raw.startsWith('--mode=')) args.mode = raw.slice('--mode='.length)
    else if (raw.startsWith('--service-account=')) args.serviceAccount = raw.slice('--service-account='.length)
    else if (raw.startsWith('--out-dir=')) args.outDir = raw.slice('--out-dir='.length)
    else if (raw.startsWith('--database-url=')) args.databaseURL = raw.slice('--database-url='.length)
    else if (raw.startsWith('--frontend-data=')) args.frontendData = path.resolve(raw.slice('--frontend-data='.length))
  }
  return args
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function getMigrationId() {
  const now = new Date()
  return `migration-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

async function ensureOutDir(outDir) {
  await fs.mkdir(outDir, { recursive: true })
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function base64Url(input) {
  return Buffer.from(input).toString('base64url')
}

async function createAccessToken(serviceAccountPath) {
  const serviceAccount = JSON.parse(await fs.readFile(serviceAccountPath, 'utf8'))
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claimSet = base64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
      aud: serviceAccount.token_uri,
      iat: now,
      exp: now + 3600,
    })
  )
  const unsigned = `${header}.${claimSet}`
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const signature = signer.sign(serviceAccount.private_key, 'base64url')
  const assertion = `${unsigned}.${signature}`

  const response = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch OAuth token: ${response.status} ${await response.text()}`)
  }
  const payload = await response.json()
  return payload.access_token
}

async function rtdbRequest({ databaseURL, accessToken, method, pathName, body }) {
  const url = new URL(`${databaseURL.replace(/\/+$/, '')}/${pathName.replace(/^\/+/, '')}.json`)
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`RTDB ${method} ${pathName} failed: ${response.status} ${await response.text()}`)
  }
  if (response.status === 204) return null
  return response.json()
}

async function readDatabaseRoots(databaseURL, accessToken) {
  const root = (await rtdbRequest({ databaseURL, accessToken, method: 'GET', pathName: '/' })) || {}
  const legacy = {}
  for (const key of LEGACY_ROOTS) legacy[key] = root[key] ?? null
  return {
    legacy,
    v2: root.v2 ?? null,
    v3: root.v3 ?? null,
  }
}

async function loadFrontendData(frontendDataPath) {
  const source = await fs.readFile(frontendDataPath, 'utf8')
  const sanitized = source.replace(/\bconst\b/g, 'var').replace(/\blet\b/g, 'var')
  const context = vm.createContext({})
  vm.runInContext(sanitized, context, { filename: frontendDataPath })
  return {
    firebaseConfig: context.firebaseConfig || {},
    menuData: context.menuData || {},
    foodOptionVariants: context.FOOD_OPTION_VARIANTS || {},
    ownerPasswords: context.OWNER_PASSWORDS || context.defaultOwnerPasswords || {},
  }
}

function normalizeHistoryOrders(value) {
  if (!value) return []
  const rawHistory = Array.isArray(value) ? value : Object.values(value)
  return rawHistory.filter((order) => order && typeof order === 'object' && Array.isArray(order.items) && 'total' in order)
}

function normalizeCartCollection(value) {
  if (Array.isArray(value)) return [...value]
  if (value && typeof value === 'object') return Object.values(value)
  return []
}

function normalizeIncomingQueue(value) {
  if (Array.isArray(value)) return [...value]
  if (value && typeof value === 'object') return Object.values(value)
  return []
}

function getBizDateKey(value) {
  const date = new Date(value)
  if (date.getHours() < 5) date.setDate(date.getDate() - 1)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function getMonthKey(value) {
  return getBizDateKey(value).slice(0, 7)
}

function stripHiddenTag(name) {
  return String(name || '').replace(/\(隱藏\)/g, '').trim()
}

function getCatalogKey(name, variant) {
  const baseName = stripHiddenTag(String(name || '').replace(/\s*\(招待\)$/, '').trim())
  return variant ? `${baseName}::${variant}` : baseName
}

function normalizeCustomer(customer) {
  return {
    name: customer?.name || '',
    phone: customer?.phone || '',
  }
}

function buildCartLines(items) {
  const lines = {}
  items.forEach((item, index) => {
    lines[`line_${index + 1}`] = {
      position: index,
      displayName: item.name,
      catalogKey: getCatalogKey(item.name, item.variant),
      type: item.type || 'unknown',
      variant: item.variant,
      flavor: item.flavor ?? null,
      unitPrice: item.price,
      isTreat: Boolean(item.isTreat),
      batchId: item.batchId,
      batchIdx: item.batchIdx,
      sentAt: item.sentAt,
      incomingIdx: item.incomingIdx,
      isSent: item.isSent,
    }
  })
  return lines
}

function buildTableSummary({ cart, status, timerStartedAt, splitCounter, batchCount, customer, updatedAt }) {
  const orderId = customer?.orderId
  return {
    status: status || null,
    timerStartedAt: timerStartedAt ?? null,
    displaySeqBase:
      typeof orderId === 'number' ? orderId : typeof orderId === 'string' ? parseInt(orderId, 10) || null : null,
    splitCounter: splitCounter ?? 1,
    batchCount: batchCount ?? 0,
    customer: normalizeCustomer(customer),
    updatedAt,
  }
}

function incomingOrderRecordToHead(order) {
  return {
    requestId: order.requestId,
    createdAt: order.createdAt,
    batchId: order.batchId,
    customer: normalizeCustomer(order.customer),
    previewItems: buildIncomingPreviewItems(
      Object.values(order.items || {})
        .sort((left, right) => (left.position || 0) - (right.position || 0))
        .map((line) => mapStoredCartLine(line))
    ),
  }
}

function buildLiveTable({ cart = [], incomingOrders = [], status, timerStartedAt, splitCounter, batchCount, customer, updatedAt }) {
  const liveTable = {
    summary: null,
    cart: cart.length > 0 ? buildCartLines(cart) : {},
    incomingOrders: {},
  }

  incomingOrders.forEach((entry, index) => {
    const requestId = entry.requestId || `req_${entry.timestamp || updatedAt}_${String(index + 1).padStart(4, '0')}`
    liveTable.incomingOrders[requestId] = buildIncomingOrderRecord(requestId, entry)
  })

  if (
    cart.length > 0 ||
    status ||
    timerStartedAt ||
    (customer?.orderId ?? null) !== null ||
    batchCount ||
    Object.keys(liveTable.incomingOrders).length > 0
  ) {
    liveTable.summary = buildTableSummary({
      cart,
      status,
      timerStartedAt,
      splitCounter,
      batchCount,
      customer,
      updatedAt,
    })
  }

  return liveTable
}

function buildRevisionTree(dataset, migratedAt) {
  const historyOrdersByDay = {}
  const dailyByDay = {}
  const itemStatsByDay = {}
  const attendanceRecordsByMonth = {}

  Object.keys(dataset.history.ordersByMonth || {}).forEach((monthKey) => {
    Object.keys(dataset.history.ordersByMonth[monthKey] || {}).forEach((bizDate) => {
      historyOrdersByDay[bizDate] = migratedAt
    })
  })
  Object.keys(dataset.reports.dailyByMonth || {}).forEach((monthKey) => {
    Object.keys(dataset.reports.dailyByMonth[monthKey] || {}).forEach((bizDate) => {
      dailyByDay[bizDate] = migratedAt
    })
  })
  Object.keys(dataset.reports.itemStatsByMonth || {}).forEach((monthKey) => {
    Object.keys(dataset.reports.itemStatsByMonth[monthKey] || {}).forEach((bizDate) => {
      itemStatsByDay[bizDate] = migratedAt
    })
  })
  Object.keys(dataset.attendance.recordsByMonth || {}).forEach((monthKey) => {
    attendanceRecordsByMonth[monthKey] = migratedAt
  })

  return {
    catalog: {
      inventory: migratedAt,
      prices: migratedAt,
      costs: migratedAt,
    },
    auth: {
      owners: migratedAt,
    },
    history: {
      ordersByDay: historyOrdersByDay,
    },
    reports: {
      dailyByDay,
      itemStatsByDay,
    },
    attendance: {
      employees: migratedAt,
      recordsByMonth: attendanceRecordsByMonth,
    },
  }
}

function buildIncomingOrderHead(requestId, entry) {
  return {
    requestId,
    createdAt: entry.timestamp || Date.now(),
    batchId: Number(entry.batchId) || 1,
    customer: normalizeCustomer(entry.customer),
    previewItems: buildIncomingPreviewItems(Array.isArray(entry.items) ? entry.items : []),
  }
}

function buildPendingSummary(orders) {
  const queue = Object.values(orders || {}).sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0))
  if (queue.length === 0) return null
  return {
    pendingCount: queue.length,
    firstOrder: incomingOrderRecordToHead(queue[0]),
  }
}

function buildIncomingOrderRecord(requestId, entry) {
  return {
    requestId,
    createdAt: entry.timestamp || Date.now(),
    batchId: Number(entry.batchId) || 1,
    customer: normalizeCustomer(entry.customer),
    items: buildCartLines(Array.isArray(entry.items) ? entry.items : []),
  }
}

function buildIncomingPreviewItems(items) {
  const preview = {}
  ;(items || []).forEach((item, index) => {
    preview[`item_${index + 1}`] = {
      position: index,
      displayName: item.name,
      unitPrice: item.price,
    }
  })
  return preview
}

function getMergedItems(items) {
  const map = new Map()
  for (const item of items || []) {
    const flavorKey = JSON.stringify(item.flavor ?? null)
    const key = [item.name, item.price, item.variant || '', item.type || '', item.isTreat ? '1' : '0', flavorKey].join('::')
    const current = map.get(key)
    if (current) current.count += item.count || 1
    else map.set(key, { ...item, count: item.count || 1 })
  }
  return Array.from(map.values())
}

function getItemCost(costs, item) {
  const variantKey = getCatalogKey(item.name, item.variant)
  const baseKey = getCatalogKey(item.name)
  return Number(costs[variantKey] ?? costs[baseKey] ?? 0)
}

function createDailySummary() {
  return {
    orderCount: 0,
    paidTotal: 0,
    originalTotal: 0,
    itemQtyTotal: 0,
    barRevenue: 0,
    bbqRevenue: 0,
    unknownRevenue: 0,
    extraRevenue: 0,
    barCost: 0,
    bbqCost: 0,
    unknownCost: 0,
    updatedAt: 0,
  }
}

function cloneItemStat(displayName, type) {
  return {
    displayName,
    type,
    qty: 0,
    treatQty: 0,
    revenue: 0,
    cost: 0,
    updatedAt: 0,
  }
}

function buildClosedOrder(order, itemCosts, sourceIndex, warnings) {
  const closedAt = order.timestamp || new Date(order.time).getTime() || Date.now()
  const bizDate = getBizDateKey(closedAt)
  const monthKey = bizDate.slice(0, 7)
  const formatted = String(order.formattedSeq ?? order.seq ?? '').trim()
  const [basePart, splitPart] = formatted.split('-')
  const displaySeqBase = parseInt(basePart, 10) || 0
  if (!displaySeqBase) {
    warnings.push({ type: 'missing-display-seq', sourceIndex, time: order.time })
  }
  const splitCounter = splitPart ? parseInt(splitPart, 10) || null : null
  const displaySeqLabel = splitCounter ? `${displaySeqBase}-${splitCounter}` : String(displaySeqBase || sourceIndex + 1)
  const orderId = `ord_${closedAt}_${String(sourceIndex + 1).padStart(4, '0')}`
  const merged = getMergedItems(order.items || [])
  const items = {}

  merged.forEach((item, index) => {
    const qty = item.count || 1
    const displayName = stripHiddenTag(item.name)
    const type = item.type || 'unknown'
    const unitCost = getItemCost(itemCosts, item)
    const unitPrice = typeof item.price === 'number' ? item.price : Number(item.price) || 0
    const paidQty = item.isTreat ? 0 : qty
    items[`item_${index + 1}`] = {
      position: index,
      displayName,
      catalogKey: getCatalogKey(displayName, item.variant),
      type,
      variant: item.variant,
      flavor: item.flavor ?? null,
      qty,
      unitPrice,
      unitCost,
      lineTotal: unitPrice * paidQty,
      isTreat: Boolean(item.isTreat),
    }
  })

  return {
    orderId,
    bizDate,
    monthKey,
    createdAt: closedAt,
    closedAt,
    tableLabel: order.seat || order.table || '',
    displaySeqBase: displaySeqBase || sourceIndex + 1,
    splitCounter,
    displaySeqLabel,
    customer: {
      name: order.customerName || '',
      phone: order.customerPhone || '',
    },
    totals: {
      paid: Number(order.total || 0),
      original: Number(order.originalTotal ?? order.original ?? order.total ?? 0),
    },
    status: 'closed',
    items,
  }
}

function buildAttendanceRecordsByMonth(records) {
  const recordsByMonth = {}
  for (const [recordId, record] of Object.entries(records || {})) {
    const monthKey = getMonthKey(record.ts)
    if (!recordsByMonth[monthKey]) recordsByMonth[monthKey] = {}
    recordsByMonth[monthKey][recordId] = { ...record }
  }
  return recordsByMonth
}

function hashOwnerPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64')
  const hash = crypto.pbkdf2Sync(password, Buffer.from(salt, 'base64'), 100000, 32, 'sha256').toString('base64')
  return {
    passwordSalt: salt,
    passwordHash: hash,
    updatedAt: Date.now(),
  }
}

function collectV3HistoryOrders(v3) {
  return Object.values(v3?.history?.ordersByMonth || {}).flatMap((month) =>
    Object.values(month || {}).flatMap((day) =>
      Object.values(day || {}).map((order) => ({
        seat: order.tableLabel,
        table: order.tableLabel,
        formattedSeq: order.displaySeqLabel,
        seq: order.displaySeqBase,
        time: new Date(order.closedAt || order.createdAt).toLocaleString('zh-TW', { hour12: false }),
        timestamp: order.closedAt || order.createdAt,
        items: Object.values(order.items || {}).map((item) => ({
          name: item.displayName,
          price: item.unitPrice,
          type: item.type,
          variant: item.variant,
          flavor: item.flavor ?? null,
          isTreat: item.isTreat,
          count: item.qty,
        })),
        total: order.totals?.paid || 0,
        originalTotal: order.totals?.original || order.totals?.paid || 0,
        customerName: order.customer?.name || '',
        customerPhone: order.customer?.phone || '',
      }))
    )
  )
}

function mapStoredCartLine(line) {
  return {
    name: line.displayName,
    price: line.unitPrice,
    type: line.type,
    variant: line.variant,
    flavor: line.flavor ?? null,
    isTreat: Boolean(line.isTreat),
    batchId: line.batchId,
    batchIdx: line.batchIdx,
    sentAt: line.sentAt,
    incomingIdx: line.incomingIdx,
    isSent: line.isSent,
  }
}

function buildV3Dataset({ source, frontendData, migrationId, migratedAt }) {
  const warnings = []
  const currentV3 = source.v3 || {}
  const v2 = source.v2 || {}
  const legacy = source.legacy || {}

  const catalog = {
    inventory: { ...((currentV3.catalog?.inventory || v2.catalog?.inventory || legacy.inventory || {})) },
    prices: { ...((currentV3.catalog?.prices || v2.catalog?.prices || legacy.itemPrices || {})) },
    costs: { ...((currentV3.catalog?.costs || v2.catalog?.costs || legacy.itemCosts || {})) },
  }

  const attendance = {
    employees: { ...((currentV3.attendance?.employees || v2.attendance?.employees || legacy.attendanceEmployees || {})) },
    recordsByMonth:
      currentV3.attendance?.recordsByMonth ||
      buildAttendanceRecordsByMonth(
        v2.attendance?.recordsByMonth
          ? Object.values(v2.attendance.recordsByMonth).reduce((acc, month) => Object.assign(acc, month), {})
          : legacy.attendanceRecords || {}
      ),
  }

  const sourceHistoryOrders =
    currentV3.history?.ordersByMonth
      ? collectV3HistoryOrders(currentV3)
      : v2.history?.ordersByMonth
      ? Object.values(v2.history.ordersByMonth).flatMap((month) =>
          Object.values(month || {}).flatMap((day) =>
            Object.values(day || {}).map((order) => ({
              seat: order.tableLabel,
              table: order.tableLabel,
              formattedSeq: order.displaySeqLabel,
              seq: order.displaySeqBase,
              time: new Date(order.closedAt || order.createdAt).toLocaleString('zh-TW', { hour12: false }),
              timestamp: order.closedAt || order.createdAt,
              items: Object.values(order.items || {}).map((item) => ({
                name: item.displayName,
                price: item.unitPrice,
                type: item.type,
                variant: item.variant,
                flavor: item.flavor ?? null,
                isTreat: item.isTreat,
                count: item.qty,
              })),
              total: order.totals?.paid || 0,
              originalTotal: order.totals?.original || order.totals?.paid || 0,
              customerName: order.customer?.name || '',
              customerPhone: order.customer?.phone || '',
            }))
          )
        )
      : normalizeHistoryOrders(legacy.historyOrders)

  const liveTables = new Set([
    ...Object.keys(currentV3.live?.tableSummaries || {}),
    ...Object.keys(v2.live?.tableSummaries || {}),
    ...Object.keys(legacy.tableCarts || {}),
    ...Object.keys(legacy.tableStatuses || {}),
    ...Object.keys(legacy.tableCustomers || {}),
    ...Object.keys(legacy.tableTimers || {}),
    ...Object.keys(legacy.tableSplitCounters || {}),
    ...Object.keys(legacy.tableBatchCounts || {}),
    ...Object.keys(legacy.incomingOrders || {}),
  ])

  const dataset = {
    meta: {
      schemaVersion: 3,
      cutoverState: 'migrating',
      migratedAt,
      migrationId,
      revisions: {
        catalog: {
          inventory: migratedAt,
          prices: migratedAt,
          costs: migratedAt,
        },
        auth: { owners: migratedAt },
        history: { ordersByDay: {} },
        reports: { dailyByDay: {}, itemStatsByDay: {} },
        attendance: { employees: migratedAt, recordsByMonth: {} },
      },
    },
    live: {
      tables: {},
      tableSummaries: {},
      pendingSummaries: {},
    },
    history: {
      ordersByMonth: {},
      sequenceByDate: {},
    },
    reports: {
      dailyByMonth: {},
      itemStatsByMonth: {},
    },
    catalog,
    attendance,
    auth: {
      owners: {},
    },
  }

  for (const table of liveTables) {
    const currentV3LiveTable = currentV3.live?.tables?.[table]
    const currentV3Cart = currentV3LiveTable?.cart
      ? Object.values(currentV3LiveTable.cart).map((line) => mapStoredCartLine(line))
      : null
    const v2Cart = v2.live?.tableCarts?.[table]
      ? Object.values(v2.live.tableCarts[table]).map((line) => mapStoredCartLine(line))
      : null
    const cart = normalizeCartCollection(currentV3Cart || v2Cart || legacy.tableCarts?.[table] || [])

    const currentV3Queue = currentV3LiveTable?.incomingOrders
      ? Object.values(currentV3LiveTable.incomingOrders).map((entry) => ({
          requestId: entry.requestId,
          items: Object.values(entry.items || {})
            .sort((left, right) => (left.position || 0) - (right.position || 0))
            .map((line) => mapStoredCartLine(line)),
          customer: normalizeCustomer(entry.customer),
          batchId: Number(entry.batchId) || 1,
          timestamp: entry.createdAt,
        }))
      : []
    const legacyQueue = currentV3Queue.length > 0 ? currentV3Queue : normalizeIncomingQueue(legacy.incomingOrders?.[table])

    const summary =
      currentV3LiveTable?.summary ||
      currentV3.live?.tableSummaries?.[table] ||
      v2.live?.tableSummaries?.[table] ||
      buildTableSummary({
        cart,
        status: legacy.tableStatuses?.[table],
        timerStartedAt: legacy.tableTimers?.[table],
        splitCounter: legacy.tableSplitCounters?.[table],
        batchCount: legacy.tableBatchCounts?.[table],
        customer: legacy.tableCustomers?.[table],
        updatedAt: migratedAt,
      })

    const liveTable = buildLiveTable({
      cart,
      incomingOrders: legacyQueue,
      status: summary?.status || undefined,
      timerStartedAt: summary?.timerStartedAt || undefined,
      splitCounter: summary?.splitCounter || undefined,
      batchCount: summary?.batchCount || undefined,
      customer: {
        ...(legacy.tableCustomers?.[table] || {}),
        name: summary?.customer?.name || legacy.tableCustomers?.[table]?.name || '',
        phone: summary?.customer?.phone || legacy.tableCustomers?.[table]?.phone || '',
        orderId: summary?.displaySeqBase ?? legacy.tableCustomers?.[table]?.orderId,
      },
      updatedAt: summary?.updatedAt || migratedAt,
    })

    if (
      liveTable.summary ||
      Object.keys(liveTable.cart).length > 0 ||
      Object.keys(liveTable.incomingOrders).length > 0
    ) {
      dataset.live.tables[table] = liveTable
      if (liveTable.summary) dataset.live.tableSummaries[table] = liveTable.summary
      const pendingSummary = buildPendingSummary(liveTable.incomingOrders)
      if (pendingSummary) {
        dataset.live.pendingSummaries[table] = pendingSummary
      }
    }
  }

  sourceHistoryOrders.forEach((order, index) => {
    const closedOrder = buildClosedOrder(order, dataset.catalog.costs, index, warnings)
    if (!dataset.history.ordersByMonth[closedOrder.monthKey]) dataset.history.ordersByMonth[closedOrder.monthKey] = {}
    if (!dataset.history.ordersByMonth[closedOrder.monthKey][closedOrder.bizDate]) {
      dataset.history.ordersByMonth[closedOrder.monthKey][closedOrder.bizDate] = {}
    }
    dataset.history.ordersByMonth[closedOrder.monthKey][closedOrder.bizDate][closedOrder.orderId] = closedOrder

    if (!dataset.reports.dailyByMonth[closedOrder.monthKey]) dataset.reports.dailyByMonth[closedOrder.monthKey] = {}
    if (!dataset.reports.dailyByMonth[closedOrder.monthKey][closedOrder.bizDate]) {
      dataset.reports.dailyByMonth[closedOrder.monthKey][closedOrder.bizDate] = createDailySummary()
    }
    if (!dataset.reports.itemStatsByMonth[closedOrder.monthKey]) dataset.reports.itemStatsByMonth[closedOrder.monthKey] = {}
    if (!dataset.reports.itemStatsByMonth[closedOrder.monthKey][closedOrder.bizDate]) {
      dataset.reports.itemStatsByMonth[closedOrder.monthKey][closedOrder.bizDate] = {}
    }

    const summary = dataset.reports.dailyByMonth[closedOrder.monthKey][closedOrder.bizDate]
    summary.orderCount += 1
    summary.paidTotal += closedOrder.totals.paid
    summary.originalTotal += closedOrder.totals.original
    summary.updatedAt = migratedAt

    let categorizedRevenue = 0
    Object.values(closedOrder.items).forEach((item) => {
      const stats = dataset.reports.itemStatsByMonth[closedOrder.monthKey][closedOrder.bizDate]
      const key = item.catalogKey
      if (!stats[key]) stats[key] = cloneItemStat(item.displayName, item.type)
      stats[key].qty += item.qty
      stats[key].treatQty += item.isTreat ? item.qty : 0
      stats[key].revenue += item.lineTotal
      stats[key].cost += item.unitCost * item.qty
      stats[key].updatedAt = migratedAt

      summary.itemQtyTotal += item.qty
      categorizedRevenue += item.lineTotal
      if (item.type === 'bar') {
        summary.barRevenue += item.lineTotal
        summary.barCost += item.unitCost * item.qty
      } else if (item.type === 'bbq') {
        summary.bbqRevenue += item.lineTotal
        summary.bbqCost += item.unitCost * item.qty
      } else {
        summary.unknownRevenue += item.lineTotal
        summary.unknownCost += item.unitCost * item.qty
      }
    })
    summary.extraRevenue += closedOrder.totals.paid - categorizedRevenue

    const nextSeq = (dataset.history.sequenceByDate[closedOrder.bizDate]?.nextDisplaySeq || 1)
    dataset.history.sequenceByDate[closedOrder.bizDate] = {
      nextDisplaySeq: Math.max(nextSeq, closedOrder.displaySeqBase + 1),
    }
  })

  const ownerSource = currentV3.auth?.owners || v2.auth?.owners || legacy.ownerPasswords || frontendData.ownerPasswords || {}
  for (const [ownerName, value] of Object.entries(ownerSource)) {
    if (value && typeof value === 'object' && value.passwordHash && value.passwordSalt) {
      dataset.auth.owners[ownerName] = value
    } else if (typeof value === 'string') {
      dataset.auth.owners[ownerName] = hashOwnerPassword(value)
    }
  }

  dataset.meta.revisions = buildRevisionTree(dataset, migratedAt)

  return { dataset, warnings }
}

function flattenDataset(dataset) {
  return {
    [`${RTDB_ROOT}/meta`]: dataset.meta,
    [`${RTDB_ROOT}/live/tables`]: dataset.live.tables,
    [`${RTDB_ROOT}/live/tableSummaries`]: dataset.live.tableSummaries,
    [`${RTDB_ROOT}/live/pendingSummaries`]: dataset.live.pendingSummaries,
    [`${RTDB_ROOT}/history/ordersByMonth`]: dataset.history.ordersByMonth,
    [`${RTDB_ROOT}/history/sequenceByDate`]: dataset.history.sequenceByDate,
    [`${RTDB_ROOT}/reports/dailyByMonth`]: dataset.reports.dailyByMonth,
    [`${RTDB_ROOT}/reports/itemStatsByMonth`]: dataset.reports.itemStatsByMonth,
    [`${RTDB_ROOT}/catalog/inventory`]: dataset.catalog.inventory,
    [`${RTDB_ROOT}/catalog/prices`]: dataset.catalog.prices,
    [`${RTDB_ROOT}/catalog/costs`]: dataset.catalog.costs,
    [`${RTDB_ROOT}/attendance/employees`]: dataset.attendance.employees,
    [`${RTDB_ROOT}/attendance/recordsByMonth`]: dataset.attendance.recordsByMonth,
    [`${RTDB_ROOT}/auth/owners`]: dataset.auth.owners,
  }
}

function buildVerification(source, dataset) {
  const legacyHistory = normalizeHistoryOrders(source.legacy.historyOrders)
  let migratedOrderCount = 0
  let migratedPaid = 0
  for (const month of Object.values(dataset.history.ordersByMonth)) {
    for (const day of Object.values(month)) {
      for (const order of Object.values(day)) {
        migratedOrderCount += 1
        migratedPaid += order.totals.paid
      }
    }
  }

  return {
    legacyOrderCount: legacyHistory.length,
    migratedOrderCount,
    legacyPaidTotal: legacyHistory.reduce((sum, order) => sum + Number(order.total || 0), 0),
    migratedPaidTotal: migratedPaid,
    liveTableCount: Object.keys(dataset.live.tables).length,
    pendingRequestCount: Object.values(dataset.live.pendingSummaries).reduce(
      (sum, summary) => sum + Number(summary?.pendingCount || 0),
      0
    ),
    ownerCount: Object.keys(dataset.auth.owners).length,
    previewHeadCount: Object.values(dataset.live.pendingSummaries).reduce(
      (sum, summary) =>
        sum + (summary?.firstOrder && Object.keys(summary.firstOrder.previewItems || {}).length > 0 ? 1 : 0),
      0
    ),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const frontendData = await loadFrontendData(args.frontendData)
  const databaseURL = args.databaseURL || frontendData.firebaseConfig.databaseURL || process.env.FIREBASE_DATABASE_URL
  if (!databaseURL) {
    throw new Error('Missing database URL. Use --database-url or frontend/data.js firebaseConfig.databaseURL')
  }
  if (!args.serviceAccount) {
    throw new Error('Missing --service-account for standalone migration script')
  }

  const migrationId = getMigrationId()
  const outDir = path.resolve(args.outDir || path.join('artifacts', 'rtdb-v3-migration', migrationId))
  await ensureOutDir(outDir)

  const accessToken = await createAccessToken(args.serviceAccount)
  const source = await readDatabaseRoots(databaseURL, accessToken)
  await writeJson(path.join(outDir, 'source-snapshot.json'), source)

  const normalizedSource = {
    legacyHistoryOrderCount: normalizeHistoryOrders(source.legacy.historyOrders).length,
    legacyIncomingTableCount: Object.keys(source.legacy.incomingOrders || {}).length,
    v2Present: Boolean(source.v2),
    v3Present: Boolean(source.v3),
  }
  await writeJson(path.join(outDir, 'normalized-source.json'), normalizedSource)

  const migratedAt = Date.now()
  const transformed = buildV3Dataset({
    source,
    frontendData,
    migrationId,
    migratedAt,
  })
  const verification = buildVerification(source, transformed.dataset)

  await writeJson(path.join(outDir, 'v3-dataset.json'), transformed.dataset)
  await writeJson(path.join(outDir, 'verification.json'), verification)
  await writeJson(path.join(outDir, 'warnings.json'), transformed.warnings)
  await writeJson(path.join(outDir, 'rollback-snapshot.json'), { v3: source.v3 ?? null })

  if (args.mode === 'dry-run') {
    console.log(JSON.stringify({ mode: 'dry-run', outDir, verification, warningCount: transformed.warnings.length }, null, 2))
    return
  }

  if (args.mode === 'apply') {
    await rtdbRequest({
      databaseURL,
      accessToken,
      method: 'PATCH',
      pathName: '/',
      body: flattenDataset(transformed.dataset),
    })
    console.log(JSON.stringify({ mode: 'apply', outDir, verification, warningCount: transformed.warnings.length }, null, 2))
    return
  }

  if (args.mode === 'verify') {
    const liveV3 = await rtdbRequest({ databaseURL, accessToken, method: 'GET', pathName: `/${RTDB_ROOT}` })
    const result = {
      hasMeta: Boolean(liveV3?.meta),
      hasLiveTables: Boolean(liveV3?.live?.tables),
      hasLiveSummaries: Boolean(liveV3?.live?.tableSummaries),
      hasReports: Boolean(liveV3?.reports?.dailyByMonth),
      hasAuth: Boolean(liveV3?.auth?.owners),
      hasPendingSummaries: Object.values(liveV3?.live?.pendingSummaries || {}).every((summary) =>
        !summary?.firstOrder || Object.keys(summary.firstOrder.previewItems || {}).length > 0
      ),
    }
    console.log(JSON.stringify({ mode: 'verify', outDir, verification, live: result }, null, 2))
    return
  }

  if (args.mode === 'rollback') {
    const rollbackSnapshot = JSON.parse(await fs.readFile(path.join(outDir, 'rollback-snapshot.json'), 'utf8'))
    await rtdbRequest({
      databaseURL,
      accessToken,
      method: 'PATCH',
      pathName: '/',
      body: { [`${RTDB_ROOT}`]: rollbackSnapshot.v3 ?? null },
    })
    console.log(JSON.stringify({ mode: 'rollback', outDir }, null, 2))
    return
  }

  throw new Error(`Unsupported mode: ${args.mode}`)
}

const isDirectRun = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false

if (isDirectRun) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

export { buildRevisionTree, buildV3Dataset }
