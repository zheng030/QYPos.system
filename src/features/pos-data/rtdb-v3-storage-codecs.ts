import { sanitizeFirebaseValue } from '@/shared/firebase-payload'
import type { StorageCodec } from './rtdb-v3-cache'
import { decodeRtdbKeySegment, encodeRtdbKeySegment } from './rtdb-v3-key-codec'
import type {
  V3ClosedOrder,
  V3ClosedOrderEntry,
  V3ClosedOrderLine,
  V3DailyItemStat,
  V3DailySummary,
  V3LiveTable,
  V3OrderBatch,
  V3OrderEntry,
  V3OrderLine,
  V3PendingSummary,
  V3TableCustomer,
  V3TableSummary,
} from './rtdb-v3-types'

type StringMap = Record<string, string>

const ENTRY_STATUS_TO_CODE = {
  draft: 'd',
  pending: 'p',
  accepted: 'a',
} as const

const ENTRY_STATUS_FROM_CODE = {
  d: 'draft',
  p: 'pending',
  a: 'accepted',
} as const

const BATCH_SOURCE_TO_CODE = {
  customer: 'c',
  staff: 's',
} as const

const BATCH_SOURCE_FROM_CODE = {
  c: 'customer',
  s: 'staff',
} as const

const BATCH_STATUS_TO_CODE = {
  pending: 'p',
  accepted: 'a',
} as const

const BATCH_STATUS_FROM_CODE = {
  p: 'pending',
  a: 'accepted',
} as const

const LINE_ROLE_TO_CODE = {
  main: 'm',
  included: 'i',
  upgrade: 'u',
  standalone: 's',
} as const

const LINE_ROLE_FROM_CODE = {
  m: 'main',
  i: 'included',
  u: 'upgrade',
  s: 'standalone',
} as const

const COURSE_KIND_TO_CODE = {
  food: 'f',
  drink: 'd',
  addon: 'a',
} as const

const COURSE_KIND_FROM_CODE = {
  f: 'food',
  d: 'drink',
  a: 'addon',
} as const

const STATION_TO_CODE = {
  kitchen: 'k',
} as const

const STATION_FROM_CODE = {
  k: 'kitchen',
} as const

const SUMMARY_FIELD_KEY_MAP = {
  timerStartedAt: 't',
  displaySeqBase: 'd',
  draftEntryCount: 'de',
  pendingBatchCount: 'pb',
  submittedBatchCount: 'sb',
  nextRequestSeq: 'rq',
  nextSplitCounter: 'sc',
  customer: 'c',
  updatedAt: 'u',
} as const satisfies Record<keyof V3TableSummary, string>

export type V3StoredTableCustomer = {
  n?: string
  p?: string
}

export type V3StoredTableSummary = {
  t?: number | null
  d?: number | null
  de?: number
  pb?: number
  sb?: number
  rq?: number | null
  sc?: number | null
  c?: V3StoredTableCustomer
  u?: number
}

export type V3StoredPendingSummary = {
  p: number
  f: {
    b: string
    q: number
    a: number
    l: string
    v: Array<{
      t: string
      q: string
    }>
  } | null
}

export type V3StoredOrderLine = {
  i?: string
  g?: string
  p?: string
  r?: string
  k?: string
  v?: string
  n?: string
  h?: string
  c?: string
  s?: string
  o?: string
  q?: number
  u?: number
  d?: number
  t?: number
  x?: StringMap
  m?: string
  z?: boolean
  e?: string
}

export type V3StoredClosedOrderLine = V3StoredOrderLine & {
  w?: number
}

export type V3StoredOrderEntry = {
  i?: string
  g?: string
  m?: string
  k?: string
  v?: string
  n?: string
  h?: string
  c?: string
  q?: number
  s?: string
  o?: string
  a?: number
  u?: number
  x?: StringMap
  j?: Record<string, StringMap>
  z?: StringMap
  l?: Record<string, V3StoredOrderLine>
  t?: number
  y?: {
    t?: string
    s?: string
    q?: string
    p?: string
  }
}

export type V3StoredClosedOrderEntry = Omit<V3StoredOrderEntry, 'l'> & {
  l?: Record<string, V3StoredClosedOrderLine>
}

export type V3StoredOrderBatch = {
  i?: string
  o?: string
  s?: string
  t?: string
  c?: V3StoredTableCustomer
  a?: number
  u?: number
  x?: number
  q?: number
  l?: string
  e?: Record<string, V3StoredOrderEntry>
  p?: number
}

export type V3StoredClosedOrder = {
  i?: string
  d?: string
  m?: string
  a?: number
  x?: number
  t?: string
  q?: number
  s?: number | null
  l?: string
  c?: V3StoredTableCustomer
  p?: {
    p?: number
    o?: number
  }
  z?: string
  b?: string[]
  e?: Record<string, V3StoredClosedOrderEntry>
}

export type V3StoredDailySummary = {
  oc: number
  pt: number
  ot: number
  iq: number
  cr?: Record<string, number>
  cc?: Record<string, number>
  u: number
}

export type V3StoredDailyItemStat = {
  n: string
  c: string
  q: number
  r: number
  o: number
  u: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function cloneStringMap(value: Record<string, string> | null | undefined) {
  return { ...(value || {}) }
}

function cloneNestedStringMap(value: Record<string, Record<string, string>> | null | undefined) {
  return Object.fromEntries(Object.entries(value || {}).map(([key, entry]) => [key, cloneStringMap(entry)]))
}

function cloneNumberMap(value: Record<string, number> | null | undefined) {
  return { ...(value || {}) }
}

function encodeStoredValue<T>(value: T): T {
  return sanitizeFirebaseValue(value)
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const next = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  return Number.isFinite(next) ? next : null
}

function toNumber(value: unknown, fallback = 0) {
  const next = toNullableNumber(value)
  return next ?? fallback
}

function toStringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function toBoolean(value: unknown) {
  return value === true
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.hasOwn(value, key)
}

function pickAliasedValue(value: Record<string, unknown>, aliasedKey: string, legacyKey: string) {
  if (hasOwn(value, aliasedKey)) {
    return value[aliasedKey]
  }
  return value[legacyKey]
}

function encodeCustomer(customer: V3TableCustomer | null | undefined): V3StoredTableCustomer {
  return {
    n: customer?.name || '',
    p: customer?.phone || '',
  }
}

function decodeCustomer(value: unknown): V3TableCustomer {
  if (!isRecord(value)) {
    return { name: '', phone: '' }
  }

  return {
    name: toStringValue(value.n ?? value.name),
    phone: toStringValue(value.p ?? value.phone),
  }
}

function encodeEntrySummary(value: V3OrderEntry['summary']) {
  return {
    t: value.title,
    s: value.subtitle,
    q: value.quantityLabel,
    p: value.totalLabel,
  }
}

function decodeEntrySummary(value: unknown): V3OrderEntry['summary'] {
  if (!isRecord(value)) {
    return {
      title: '',
      subtitle: '',
      quantityLabel: '',
      totalLabel: '',
    }
  }

  return {
    title: toStringValue(value.t ?? value.title),
    subtitle: toStringValue(value.s ?? value.subtitle),
    quantityLabel: toStringValue(value.q ?? value.quantityLabel),
    totalLabel: toStringValue(value.p ?? value.totalLabel),
  }
}

function encodeLineRole(value: string) {
  return LINE_ROLE_TO_CODE[value as keyof typeof LINE_ROLE_TO_CODE] || value
}

function decodeLineRole(value: unknown) {
  const raw = toStringValue(value)
  return LINE_ROLE_FROM_CODE[raw as keyof typeof LINE_ROLE_FROM_CODE] || raw || 'main'
}

function encodeCourseKind(value: string) {
  return COURSE_KIND_TO_CODE[value as keyof typeof COURSE_KIND_TO_CODE] || value
}

function decodeCourseKind(value: unknown) {
  const raw = toStringValue(value)
  return COURSE_KIND_FROM_CODE[raw as keyof typeof COURSE_KIND_FROM_CODE] || raw || 'food'
}

function encodeStation(value: string) {
  return STATION_TO_CODE[value as keyof typeof STATION_TO_CODE] || value
}

function decodeStation(value: unknown) {
  const raw = toStringValue(value)
  return STATION_FROM_CODE[raw as keyof typeof STATION_FROM_CODE] || raw || 'kitchen'
}

function encodeEntryStatus(value: string) {
  return ENTRY_STATUS_TO_CODE[value as keyof typeof ENTRY_STATUS_TO_CODE] || value
}

function decodeEntryStatus(value: unknown) {
  const raw = toStringValue(value)
  return ENTRY_STATUS_FROM_CODE[raw as keyof typeof ENTRY_STATUS_FROM_CODE] || raw || 'draft'
}

function encodeBatchSource(value: string) {
  return BATCH_SOURCE_TO_CODE[value as keyof typeof BATCH_SOURCE_TO_CODE] || value
}

function decodeBatchSource(value: unknown) {
  const raw = toStringValue(value)
  return BATCH_SOURCE_FROM_CODE[raw as keyof typeof BATCH_SOURCE_FROM_CODE] || raw || 'customer'
}

function encodeBatchStatus(value: string) {
  return BATCH_STATUS_TO_CODE[value as keyof typeof BATCH_STATUS_TO_CODE] || value
}

function decodeBatchStatus(value: unknown) {
  const raw = toStringValue(value)
  return BATCH_STATUS_FROM_CODE[raw as keyof typeof BATCH_STATUS_FROM_CODE] || raw || 'pending'
}

function encodeOrderLineBase(value: V3OrderLine): V3StoredOrderLine {
  return {
    i: value.lineId,
    g: value.groupId,
    p: value.parentLineId || undefined,
    r: encodeLineRole(value.role),
    k: value.catalogKey,
    v: value.inventoryKey,
    n: value.displayName,
    h: value.shortName,
    c: value.categoryKey,
    s: encodeStation(value.station),
    o: encodeCourseKind(value.courseKind),
    q: value.quantity,
    u: value.unitPrice,
    d: value.priceDelta,
    t: value.lineTotal,
    x: value.selections && Object.keys(value.selections).length > 0 ? cloneStringMap(value.selections) : undefined,
    m: value.selectionSummary,
    z: value.isTreat,
    e: value.sourceEntryId,
  }
}

function decodeOrderLineBase(value: unknown): V3OrderLine {
  const raw = isRecord(value) ? value : {}
  return {
    lineId: toStringValue(raw.i ?? raw.lineId),
    groupId: toStringValue(raw.g ?? raw.groupId),
    parentLineId: toStringValue(raw.p ?? raw.parentLineId) || undefined,
    role: decodeLineRole(raw.r ?? raw.role),
    catalogKey: toStringValue(raw.k ?? raw.catalogKey),
    inventoryKey: toStringValue(raw.v ?? raw.inventoryKey),
    displayName: toStringValue(raw.n ?? raw.displayName),
    shortName: toStringValue(raw.h ?? raw.shortName),
    categoryKey: toStringValue(raw.c ?? raw.categoryKey),
    station: decodeStation(raw.s ?? raw.station),
    courseKind: decodeCourseKind(raw.o ?? raw.courseKind),
    quantity: toNumber(raw.q ?? raw.quantity),
    unitPrice: toNumber(raw.u ?? raw.unitPrice),
    priceDelta: toNumber(raw.d ?? raw.priceDelta),
    lineTotal: toNumber(raw.t ?? raw.lineTotal),
    selections: isRecord(raw.x ?? raw.selections)
      ? cloneStringMap((raw.x ?? raw.selections) as Record<string, string>)
      : undefined,
    selectionSummary: toStringValue(raw.m ?? raw.selectionSummary),
    isTreat: toBoolean(raw.z ?? raw.isTreat),
    sourceEntryId: toStringValue(raw.e ?? raw.sourceEntryId),
  }
}

function encodeOrderLine(value: V3OrderLine): V3StoredOrderLine {
  return encodeStoredValue(encodeOrderLineBase(value))
}

function decodeOrderLine(value: unknown): V3OrderLine {
  return decodeOrderLineBase(value)
}

function encodeClosedOrderLine(value: V3ClosedOrderLine): V3StoredClosedOrderLine {
  return encodeStoredValue({
    ...encodeOrderLineBase(value),
    w: value.unitCost,
  })
}

function decodeClosedOrderLine(value: unknown): V3ClosedOrderLine {
  const line = decodeOrderLineBase(value)
  const raw = isRecord(value) ? value : {}
  return {
    ...line,
    unitCost: toNumber(raw.w ?? raw.unitCost),
  }
}

function encodeOrderLineMap<TDomain extends V3OrderLine, TStored extends V3StoredOrderLine>(
  value: Record<string, TDomain>,
  encodeLine: (line: TDomain) => TStored
) {
  return encodeStoredValue(
    Object.fromEntries(Object.entries(value || {}).map(([key, line]) => [key, encodeLine(line)]))
  )
}

function decodeOrderLineMap<TDomain extends V3OrderLine>(value: unknown, decodeLine: (line: unknown) => TDomain) {
  if (!isRecord(value)) {
    return {}
  }
  return Object.fromEntries(Object.entries(value).map(([key, line]) => [key, decodeLine(line)]))
}

function encodeOrderEntryValue(value: V3OrderEntry): V3StoredOrderEntry {
  return encodeStoredValue({
    i: value.entryId,
    g: value.groupId,
    m: value.itemId,
    k: value.catalogKey,
    v: value.inventoryKey,
    n: value.itemName,
    h: value.shortName,
    c: value.categoryKey,
    q: value.quantity,
    s: encodeEntryStatus(value.status),
    o: encodeBatchSource(value.source),
    a: value.createdAt,
    u: value.updatedAt,
    x: Object.keys(value.selections || {}).length > 0 ? cloneStringMap(value.selections) : undefined,
    j:
      Object.keys(value.includeSelections || {}).length > 0 ? cloneNestedStringMap(value.includeSelections) : undefined,
    z: Object.keys(value.upgradeSelections || {}).length > 0 ? cloneStringMap(value.upgradeSelections) : undefined,
    l: encodeOrderLineMap(value.lines || {}, encodeOrderLine),
    t: value.subtotal,
    y: encodeEntrySummary(value.summary),
  })
}

function decodeOrderEntryValue(value: unknown): V3OrderEntry {
  const raw = isRecord(value) ? value : {}
  return {
    entryId: toStringValue(raw.i ?? raw.entryId),
    groupId: toStringValue(raw.g ?? raw.groupId),
    itemId: toStringValue(raw.m ?? raw.itemId),
    catalogKey: toStringValue(raw.k ?? raw.catalogKey),
    inventoryKey: toStringValue(raw.v ?? raw.inventoryKey),
    itemName: toStringValue(raw.n ?? raw.itemName),
    shortName: toStringValue(raw.h ?? raw.shortName),
    categoryKey: toStringValue(raw.c ?? raw.categoryKey),
    quantity: toNumber(raw.q ?? raw.quantity),
    status: decodeEntryStatus(raw.s ?? raw.status) as V3OrderEntry['status'],
    source: decodeBatchSource(raw.o ?? raw.source) as V3OrderEntry['source'],
    createdAt: toNumber(raw.a ?? raw.createdAt),
    updatedAt: toNumber(raw.u ?? raw.updatedAt),
    selections: isRecord(raw.x ?? raw.selections)
      ? cloneStringMap((raw.x ?? raw.selections) as Record<string, string>)
      : {},
    includeSelections: isRecord(raw.j ?? raw.includeSelections)
      ? cloneNestedStringMap((raw.j ?? raw.includeSelections) as Record<string, Record<string, string>>)
      : {},
    upgradeSelections: isRecord(raw.z ?? raw.upgradeSelections)
      ? cloneStringMap((raw.z ?? raw.upgradeSelections) as Record<string, string>)
      : {},
    lines: decodeOrderLineMap(raw.l ?? raw.lines, decodeOrderLine),
    subtotal: toNumber(raw.t ?? raw.subtotal),
    summary: decodeEntrySummary(raw.y ?? raw.summary),
  }
}

function encodeClosedOrderEntryValue(value: V3ClosedOrderEntry): V3StoredClosedOrderEntry {
  return encodeStoredValue({
    ...encodeOrderEntryValue(value),
    l: encodeOrderLineMap(value.lines || {}, encodeClosedOrderLine),
  })
}

function decodeClosedOrderEntryValue(value: unknown): V3ClosedOrderEntry {
  const entry = decodeOrderEntryValue(value)
  const raw = isRecord(value) ? value : {}
  return {
    ...entry,
    lines: decodeOrderLineMap(raw.l ?? raw.lines, decodeClosedOrderLine),
  }
}

function encodeOrderBatchValue(value: V3OrderBatch): V3StoredOrderBatch {
  return encodeStoredValue({
    i: value.batchId,
    o: encodeBatchSource(value.source),
    s: encodeBatchStatus(value.status),
    t: value.table,
    c: encodeCustomer(value.customer),
    a: value.createdAt,
    u: value.updatedAt,
    x: value.acceptedAt,
    q: value.requestSeq,
    l: value.requestLabel,
    e: Object.fromEntries(
      Object.entries(value.entries || {}).map(([key, entry]) => [key, encodeOrderEntryValue(entry)])
    ),
    p: value.subtotal,
  })
}

function decodeOrderBatchValue(value: unknown): V3OrderBatch {
  const raw = isRecord(value) ? value : {}
  return {
    batchId: toStringValue(raw.i ?? raw.batchId),
    source: decodeBatchSource(raw.o ?? raw.source) as V3OrderBatch['source'],
    status: decodeBatchStatus(raw.s ?? raw.status) as V3OrderBatch['status'],
    table: toStringValue(raw.t ?? raw.table),
    customer: decodeCustomer(raw.c ?? raw.customer),
    createdAt: toNumber(raw.a ?? raw.createdAt),
    updatedAt: toNumber(raw.u ?? raw.updatedAt),
    acceptedAt: toNullableNumber(raw.x ?? raw.acceptedAt) ?? undefined,
    requestSeq: toNullableNumber(raw.q ?? raw.requestSeq) ?? undefined,
    requestLabel: toStringValue(raw.l ?? raw.requestLabel),
    entries: Object.fromEntries(
      Object.entries(isRecord(raw.e ?? raw.entries) ? ((raw.e ?? raw.entries) as Record<string, unknown>) : {}).map(
        ([key, entry]) => [key, decodeOrderEntryValue(entry)]
      )
    ),
    subtotal: toNumber(raw.p ?? raw.subtotal),
  }
}

function encodeClosedOrderValue(value: V3ClosedOrder): V3StoredClosedOrder {
  return encodeStoredValue({
    i: value.orderId,
    d: value.bizDate,
    m: value.monthKey,
    a: value.createdAt,
    x: value.closedAt,
    t: value.tableLabel,
    q: value.displaySeqBase,
    s: value.splitCounter ?? null,
    l: value.displaySeqLabel,
    c: encodeCustomer(value.customer),
    p: {
      p: value.totals.paid,
      o: value.totals.original,
    },
    z: value.status === 'closed' ? undefined : value.status,
    b: [...(value.batchIds || [])],
    e: Object.fromEntries(
      Object.entries(value.entries || {}).map(([key, entry]) => [key, encodeClosedOrderEntryValue(entry)])
    ),
  })
}

function decodeClosedOrderValue(value: unknown): V3ClosedOrder {
  const raw = isRecord(value) ? value : {}
  return {
    orderId: toStringValue(raw.i ?? raw.orderId),
    bizDate: toStringValue(raw.d ?? raw.bizDate) as V3ClosedOrder['bizDate'],
    monthKey: toStringValue(raw.m ?? raw.monthKey) as V3ClosedOrder['monthKey'],
    createdAt: toNumber(raw.a ?? raw.createdAt),
    closedAt: toNumber(raw.x ?? raw.closedAt),
    tableLabel: toStringValue(raw.t ?? raw.tableLabel),
    displaySeqBase: toNumber(raw.q ?? raw.displaySeqBase),
    splitCounter: toNullableNumber(raw.s ?? raw.splitCounter),
    displaySeqLabel: toStringValue(raw.l ?? raw.displaySeqLabel),
    customer: decodeCustomer(raw.c ?? raw.customer),
    totals: {
      paid: toNumber((isRecord(raw.p) ? raw.p.p : undefined) ?? (isRecord(raw.totals) ? raw.totals.paid : undefined)),
      original: toNumber(
        (isRecord(raw.p) ? raw.p.o : undefined) ?? (isRecord(raw.totals) ? raw.totals.original : undefined)
      ),
    },
    status: toStringValue(raw.z ?? raw.status, 'closed') as V3ClosedOrder['status'],
    batchIds: Array.isArray(raw.b ?? raw.batchIds) ? [...((raw.b ?? raw.batchIds) as string[])] : [],
    entries: Object.fromEntries(
      Object.entries(isRecord(raw.e ?? raw.entries) ? ((raw.e ?? raw.entries) as Record<string, unknown>) : {}).map(
        ([key, entry]) => [key, decodeClosedOrderEntryValue(entry)]
      )
    ),
  }
}

function createMapCodec<TDomain, TStored>(
  encodeValue: (value: TDomain) => TStored,
  decodeValue: (value: unknown) => TDomain
): StorageCodec<Record<string, TDomain>, Record<string, TStored>> {
  return {
    encode(value) {
      return Object.fromEntries(Object.entries(value || {}).map(([key, entry]) => [key, encodeValue(entry)]))
    },
    decode(value) {
      return Object.fromEntries(Object.entries(value || {}).map(([key, entry]) => [key, decodeValue(entry)]))
    },
  }
}

function encodeDailyItemStat(value: V3DailyItemStat): V3StoredDailyItemStat {
  return {
    n: value.displayName,
    c: value.categoryKey,
    q: value.qty,
    r: value.revenue,
    o: value.cost,
    u: value.updatedAt,
  }
}

function decodeDailyItemStat(value: V3StoredDailyItemStat): V3DailyItemStat {
  return {
    displayName: value.n || '',
    categoryKey: value.c || '',
    qty: Number(value.q || 0),
    revenue: Number(value.r || 0),
    cost: Number(value.o || 0),
    updatedAt: Number(value.u || 0),
  }
}

export function getStoredTableSummaryFieldKey(field: keyof V3TableSummary) {
  return SUMMARY_FIELD_KEY_MAP[field]
}

export function encodeStoredTableSummaryField(field: keyof V3TableSummary, value: unknown) {
  if (field === 'customer') {
    return value ? encodeCustomer(value as V3TableCustomer) : null
  }
  return value ?? null
}

export const tableSummaryStorageCodec: StorageCodec<V3TableSummary | null, V3StoredTableSummary | null> = {
  encode(value) {
    if (!value) {
      return null
    }
    return encodeStoredValue({
      t: value.timerStartedAt,
      d: value.displaySeqBase,
      de: value.draftEntryCount,
      pb: value.pendingBatchCount,
      sb: value.submittedBatchCount,
      rq: value.nextRequestSeq,
      sc: value.nextSplitCounter,
      c: encodeCustomer(value.customer),
      u: value.updatedAt,
    })
  },
  decode(value) {
    if (!value) {
      return null
    }
    const raw = value as V3StoredTableSummary & Record<string, unknown>
    const nextRequestSeq = hasOwn(raw, 'rq')
      ? toNullableNumber(raw.rq)
      : hasOwn(raw, 'nextRequestSeq')
        ? toNullableNumber(raw.nextRequestSeq)
        : undefined
    const nextSplitCounter = hasOwn(raw, 'sc')
      ? toNullableNumber(raw.sc)
      : hasOwn(raw, 'nextSplitCounter')
        ? toNullableNumber(raw.nextSplitCounter)
        : undefined
    const decoded: V3TableSummary = {
      timerStartedAt: toNullableNumber(pickAliasedValue(raw, 't', 'timerStartedAt')),
      displaySeqBase: toNullableNumber(pickAliasedValue(raw, 'd', 'displaySeqBase')),
      draftEntryCount: toNumber(pickAliasedValue(raw, 'de', 'draftEntryCount')),
      pendingBatchCount: toNumber(pickAliasedValue(raw, 'pb', 'pendingBatchCount')),
      submittedBatchCount: toNumber(pickAliasedValue(raw, 'sb', 'submittedBatchCount')),
      customer: decodeCustomer(pickAliasedValue(raw, 'c', 'customer')),
      updatedAt: toNumber(pickAliasedValue(raw, 'u', 'updatedAt')),
    }
    if (nextRequestSeq !== undefined) {
      decoded.nextRequestSeq = nextRequestSeq
    }
    if (nextSplitCounter !== undefined) {
      decoded.nextSplitCounter = nextSplitCounter
    }
    return decoded
  },
}

export const pendingSummaryStorageCodec: StorageCodec<V3PendingSummary | null, V3StoredPendingSummary | null> = {
  encode(value) {
    if (!value) {
      return null
    }
    return encodeStoredValue({
      p: value.pendingCount,
      f: value.firstBatch
        ? {
            b: value.firstBatch.batchId,
            q: value.firstBatch.requestSeq,
            a: value.firstBatch.createdAt,
            l: value.firstBatch.requestLabel,
            v: value.firstBatch.itemPreview.map((item) => ({
              t: item.title,
              q: item.quantityLabel,
            })),
          }
        : null,
    })
  },
  decode(value) {
    if (!value) {
      return null
    }
    const raw = value as V3StoredPendingSummary & Record<string, unknown>
    const firstBatchValue = pickAliasedValue(raw, 'f', 'firstBatch')
    const firstBatch = isRecord(firstBatchValue) ? firstBatchValue : null
    return {
      pendingCount: toNumber(pickAliasedValue(raw, 'p', 'pendingCount')),
      firstBatch: firstBatch
        ? {
            batchId: toStringValue(pickAliasedValue(firstBatch, 'b', 'batchId')),
            requestSeq: toNumber(pickAliasedValue(firstBatch, 'q', 'requestSeq')),
            createdAt: toNumber(pickAliasedValue(firstBatch, 'a', 'createdAt')),
            requestLabel: toStringValue(pickAliasedValue(firstBatch, 'l', 'requestLabel')),
            itemPreview: Array.isArray(pickAliasedValue(firstBatch, 'v', 'itemPreview'))
              ? (pickAliasedValue(firstBatch, 'v', 'itemPreview') as Array<unknown>).map((item) => {
                  if (!isRecord(item)) {
                    return { title: '', quantityLabel: '' }
                  }
                  return {
                    title: toStringValue(pickAliasedValue(item, 't', 'title')),
                    quantityLabel: toStringValue(pickAliasedValue(item, 'q', 'quantityLabel')),
                  }
                })
              : [],
          }
        : null,
    }
  },
}

export const orderEntryStorageCodec: StorageCodec<V3OrderEntry, V3StoredOrderEntry> = {
  encode: encodeOrderEntryValue,
  decode: decodeOrderEntryValue,
}

export const orderEntryMapStorageCodec = createMapCodec<V3OrderEntry, V3StoredOrderEntry>(
  encodeOrderEntryValue,
  decodeOrderEntryValue
) satisfies StorageCodec<Record<string, V3OrderEntry>, Record<string, V3StoredOrderEntry>>

export const orderBatchStorageCodec: StorageCodec<V3OrderBatch, V3StoredOrderBatch> = {
  encode: encodeOrderBatchValue,
  decode: decodeOrderBatchValue,
}

export const orderBatchMapStorageCodec = createMapCodec<V3OrderBatch, V3StoredOrderBatch>(
  encodeOrderBatchValue,
  decodeOrderBatchValue
) satisfies StorageCodec<Record<string, V3OrderBatch>, Record<string, V3StoredOrderBatch>>

export const closedOrderStorageCodec: StorageCodec<V3ClosedOrder, V3StoredClosedOrder> = {
  encode: encodeClosedOrderValue,
  decode: decodeClosedOrderValue,
}

export const closedOrderMapStorageCodec = createMapCodec<V3ClosedOrder, V3StoredClosedOrder>(
  encodeClosedOrderValue,
  decodeClosedOrderValue
) satisfies StorageCodec<Record<string, V3ClosedOrder>, Record<string, V3StoredClosedOrder>>

export function encodeLiveTableShardValue<K extends keyof V3LiveTable>(shard: K, value: V3LiveTable[K]) {
  switch (shard) {
    case 'summary':
      return tableSummaryStorageCodec.encode(value as V3LiveTable['summary'])
    case 'draft':
      return orderEntryMapStorageCodec.encode(value as V3LiveTable['draft'])
    case 'pendingBatches':
      return orderBatchMapStorageCodec.encode(value as V3LiveTable['pendingBatches'])
    case 'submittedBatches':
      return orderBatchMapStorageCodec.encode(value as V3LiveTable['submittedBatches'])
    default:
      return value
  }
}

export function decodeLiveTableShardValue<K extends keyof V3LiveTable>(shard: K, value: unknown): V3LiveTable[K] {
  switch (shard) {
    case 'summary':
      return tableSummaryStorageCodec.decode(value as V3StoredTableSummary | null) as V3LiveTable[K]
    case 'draft':
      return orderEntryMapStorageCodec.decode(value as Record<string, V3StoredOrderEntry>) as V3LiveTable[K]
    case 'pendingBatches':
      return orderBatchMapStorageCodec.decode(value as Record<string, V3StoredOrderBatch>) as V3LiveTable[K]
    case 'submittedBatches':
      return orderBatchMapStorageCodec.decode(value as Record<string, V3StoredOrderBatch>) as V3LiveTable[K]
    default:
      return value as V3LiveTable[K]
  }
}

export const dailySummaryStorageCodec: StorageCodec<V3DailySummary | null, V3StoredDailySummary | null> = {
  encode(value) {
    if (!value) {
      return null
    }
    return encodeStoredValue({
      oc: value.orderCount,
      pt: value.paidTotal,
      ot: value.originalTotal,
      iq: value.itemQtyTotal,
      cr: Object.keys(value.categoryRevenue || {}).length > 0 ? cloneNumberMap(value.categoryRevenue) : undefined,
      cc: Object.keys(value.categoryCost || {}).length > 0 ? cloneNumberMap(value.categoryCost) : undefined,
      u: value.updatedAt,
    })
  },
  decode(value) {
    if (!value) {
      return null
    }
    return {
      orderCount: Number(value.oc || 0),
      paidTotal: Number(value.pt || 0),
      originalTotal: Number(value.ot || 0),
      itemQtyTotal: Number(value.iq || 0),
      categoryRevenue: cloneNumberMap(value.cr),
      categoryCost: cloneNumberMap(value.cc),
      updatedAt: Number(value.u || 0),
    }
  },
}

export const itemStatsStorageCodec: StorageCodec<
  Record<string, V3DailyItemStat>,
  Record<string, V3StoredDailyItemStat>
> = {
  encode(value) {
    return encodeStoredValue(
      Object.fromEntries(
        Object.entries(value || {}).map(([key, entry]) => [encodeRtdbKeySegment(key), encodeDailyItemStat(entry)])
      )
    )
  },
  decode(value) {
    return Object.fromEntries(
      Object.entries(value || {}).map(([key, entry]) => [decodeRtdbKeySegment(key), decodeDailyItemStat(entry)])
    )
  },
}
