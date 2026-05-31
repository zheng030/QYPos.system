import type { PosOwnerAuthMap, PosOwnerAuthRecord } from '@/features/pos-kernel/types'
import type { AttendanceEmployee } from '@/shared/attendance-service'
import type { RtdbV3RepositoryContext } from './rtdb-v3-repository-context'
import { decodeCatalogRecord, encodeCatalogKey } from './rtdb-v3-repository-context'
import type { V3CatalogRevisionEvent, V3CatalogSegment, V3OwnerAuthRevisionEvent } from './rtdb-v3-types'
import { RTDB_V3_ROOT } from './rtdb-v3-types'

export function createRtdbV3RepositoryCatalogModule(ctx: RtdbV3RepositoryContext) {
  async function fetchCatalogSegment(segment: V3CatalogSegment) {
    const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/catalog/${segment}`).once('value')
    const value = snapshot.val() || {}
    if (segment === 'inventory') {
      ctx.state.inventory = decodeCatalogRecord(value as Record<string, boolean>)
    } else if (segment === 'prices') {
      ctx.state.itemPrices = Object.fromEntries(
        Object.entries(decodeCatalogRecord(value as Record<string, number | string>)).map(([key, entry]) => [
          key,
          Number(entry),
        ])
      )
    } else {
      ctx.state.itemCosts = decodeCatalogRecord(value as Record<string, number>)
    }
    ctx.loadedCatalogSegments.add(segment)
  }

  async function ensureCatalogSegment(segment: V3CatalogSegment) {
    if (ctx.loadedCatalogSegments.has(segment)) {
      return
    }
    const existingLoad = ctx.catalogSegmentLoads.get(segment)
    if (existingLoad) {
      await existingLoad
      return
    }
    const load = fetchCatalogSegment(segment).finally(() => {
      ctx.catalogSegmentLoads.delete(segment)
    })
    ctx.catalogSegmentLoads.set(segment, load)
    await load
  }

  async function ensureCatalog() {
    await Promise.all([
      ensureCatalogSegment('inventory'),
      ensureCatalogSegment('prices'),
      ensureCatalogSegment('costs'),
    ])
  }

  async function fetchOwnerAuth() {
    const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/auth/owners`).once('value')
    ctx.state.ownerPasswords = { ...((snapshot.val() || {}) as PosOwnerAuthMap) }
    ctx.ownerAuthLoaded = true
  }

  async function ensureOwnerAuth() {
    if (ctx.ownerAuthLoaded) return
    ctx.ownerAuthLoad ||= fetchOwnerAuth().finally(() => {
      ctx.ownerAuthLoad = null
    })
    await ctx.ownerAuthLoad
  }

  async function fetchAttendanceEmployees() {
    const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/attendance/employees`).once('value')
    ctx.state.attendanceEmployees = { ...((snapshot.val() || {}) as Record<string, AttendanceEmployee>) }
  }

  function watchCatalogRevision(listener: (event: V3CatalogRevisionEvent) => void) {
    const stops = [
      ctx.db.ref(`${RTDB_V3_ROOT}/meta/revisions/catalog/inventory`).on('value', () => {
        ctx.loadedCatalogSegments.delete('inventory')
        void ensureCatalogSegment('inventory').then(() => {
          listener({ kind: 'catalog', changedSegments: ['inventory'] })
        })
      }) as () => void,
      ctx.db.ref(`${RTDB_V3_ROOT}/meta/revisions/catalog/prices`).on('value', () => {
        ctx.loadedCatalogSegments.delete('prices')
        void ensureCatalogSegment('prices').then(() => {
          listener({ kind: 'catalog', changedSegments: ['prices'] })
        })
      }) as () => void,
      ctx.db.ref(`${RTDB_V3_ROOT}/meta/revisions/catalog/costs`).on('value', () => {
        ctx.loadedCatalogSegments.delete('costs')
        void ensureCatalogSegment('costs').then(() => {
          listener({ kind: 'catalog', changedSegments: ['costs'] })
        })
      }) as () => void,
    ]
    return () => {
      stops.forEach((stop) => {
        stop()
      })
    }
  }

  function watchOwnerAuthRevision(listener: (event: V3OwnerAuthRevisionEvent) => void) {
    return ctx.db.ref(`${RTDB_V3_ROOT}/meta/revisions/auth/owners`).on('value', () => {
      ctx.ownerAuthLoaded = false
      void ensureOwnerAuth().then(() => {
        listener({ kind: 'owner-auth' })
      })
    }) as () => void
  }

  async function setOwnerPassword(ownerName: string, record: PosOwnerAuthRecord) {
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/auth/owners/${ownerName}`]: record,
    }
    ctx.touchRevision('auth/owners', payload)
    await ctx.updateRoot(payload)
    ctx.state.ownerPasswords[ownerName] = record
  }

  async function updateInventory(itemId: string, checked: boolean) {
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/catalog/inventory/${encodeCatalogKey(itemId)}`]: checked,
    }
    ctx.touchRevision('catalog/inventory', payload)
    await ctx.updateRoot(payload)
    ctx.state.inventory[itemId] = checked
  }

  async function updateInventoryBatch(batch: Record<string, boolean>) {
    const payload: Record<string, unknown> = {}
    Object.entries(batch).forEach(([itemId, checked]) => {
      payload[`${RTDB_V3_ROOT}/catalog/inventory/${encodeCatalogKey(itemId)}`] = checked
      ctx.state.inventory[itemId] = checked
    })
    ctx.touchRevision('catalog/inventory', payload)
    await ctx.updateRoot(payload)
  }

  async function updateItemPrice(itemId: string, value: number) {
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/catalog/prices/${encodeCatalogKey(itemId)}`]: value,
    }
    ctx.touchRevision('catalog/prices', payload)
    await ctx.updateRoot(payload)
    ctx.state.itemPrices[itemId] = value
  }

  async function updateItemCost(itemId: string, value: number) {
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/catalog/costs/${encodeCatalogKey(itemId)}`]: value,
    }
    ctx.touchRevision('catalog/costs', payload)
    await ctx.updateRoot(payload)
    ctx.state.itemCosts[itemId] = value
  }

  return {
    fetchAttendanceEmployees,
    ensureCatalog,
    ensureOwnerAuth,
    watchCatalogRevision,
    watchOwnerAuthRevision,
    setOwnerPassword,
    updateInventory,
    updateInventoryBatch,
    updateItemPrice,
    updateItemCost,
  }
}
