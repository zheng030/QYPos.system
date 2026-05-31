import type { PosOwnerAuthMap, PosOwnerAuthRecord } from '@/features/pos-kernel/types'
import type { AttendanceEmployee } from '@/shared/attendance-service'
import type { RtdbV3RepositoryContext } from './rtdb-v3-repository-context'
import { decodeCatalogRecord, encodeCatalogKey } from './rtdb-v3-repository-context'
import { getStaticDescriptorOrThrow, RTDB_V3_RESOURCE_KEYS } from './rtdb-v3-resource-registry'
import type { V3CatalogRevisionEvent, V3CatalogSegment, V3OwnerAuthRevisionEvent } from './rtdb-v3-types'
import { RTDB_V3_ROOT } from './rtdb-v3-types'

export function createRtdbV3RepositoryCatalogModule(ctx: RtdbV3RepositoryContext) {
  function toRevisionValue(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  }

  const inventoryDescriptor = getStaticDescriptorOrThrow<Record<string, boolean>>(
    RTDB_V3_RESOURCE_KEYS.catalogInventory
  )
  const pricesDescriptor = getStaticDescriptorOrThrow<Record<string, number | string>>(
    RTDB_V3_RESOURCE_KEYS.catalogPrices
  )
  const costsDescriptor = getStaticDescriptorOrThrow<Record<string, number>>(RTDB_V3_RESOURCE_KEYS.catalogCosts)

  function applyCatalogSegment(segment: V3CatalogSegment, value: unknown) {
    if (segment === 'inventory') {
      ctx.state.inventory = decodeCatalogRecord((value || {}) as Record<string, boolean>)
    } else if (segment === 'prices') {
      ctx.state.itemPrices = Object.fromEntries(
        Object.entries(decodeCatalogRecord((value || {}) as Record<string, number | string>)).map(([key, entry]) => [
          key,
          Number(entry),
        ])
      )
    } else {
      ctx.state.itemCosts = decodeCatalogRecord((value || {}) as Record<string, number>)
    }
    ctx.loadedCatalogSegments.add(segment)
  }

  async function fetchCatalogSegment(segment: V3CatalogSegment) {
    const descriptor =
      segment === 'inventory' ? inventoryDescriptor : segment === 'prices' ? pricesDescriptor : costsDescriptor
    const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/${descriptor.remotePath}`).once('value')
    const value = snapshot.val() || {}
    applyCatalogSegment(segment, value)
    return value
  }

  async function refreshCatalogSegment(segment: V3CatalogSegment) {
    const value = await fetchCatalogSegment(segment)
    if (segment === 'inventory') {
      await ctx.saveCachedResource(inventoryDescriptor, ctx.revisionCache.get('catalog/inventory') || 0, value)
    } else if (segment === 'prices') {
      await ctx.saveCachedResource(pricesDescriptor, ctx.revisionCache.get('catalog/prices') || 0, value)
    } else {
      await ctx.saveCachedResource(costsDescriptor, ctx.revisionCache.get('catalog/costs') || 0, value)
    }
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
    const load = (
      segment === 'inventory'
        ? ctx.loadCacheFirstResource({
            descriptor: inventoryDescriptor,
            readRemote: () => fetchCatalogSegment(segment),
          })
        : segment === 'prices'
          ? ctx.loadCacheFirstResource({
              descriptor: pricesDescriptor,
              readRemote: () => fetchCatalogSegment(segment),
            })
          : ctx.loadCacheFirstResource({
              descriptor: costsDescriptor,
              readRemote: () => fetchCatalogSegment(segment),
            })
    )
      .then((value) => {
        applyCatalogSegment(segment, value)
      })
      .finally(() => {
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
    const descriptor = getStaticDescriptorOrThrow<PosOwnerAuthMap>(RTDB_V3_RESOURCE_KEYS.authOwners)
    const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/${descriptor.remotePath}`).once('value')
    const value = { ...((snapshot.val() || {}) as PosOwnerAuthMap) }
    ctx.state.ownerPasswords = value
    ctx.ownerAuthLoaded = true
    return value
  }

  async function ensureOwnerAuth() {
    if (ctx.ownerAuthLoaded) return
    ctx.ownerAuthLoad ||= ctx
      .loadCacheFirstResource({
        descriptor: getStaticDescriptorOrThrow<PosOwnerAuthMap>(RTDB_V3_RESOURCE_KEYS.authOwners),
        readRemote: fetchOwnerAuth,
      })
      .then((value) => {
        ctx.state.ownerPasswords = { ...(value || {}) }
        ctx.ownerAuthLoaded = true
      })
      .finally(() => {
        ctx.ownerAuthLoad = null
      })
    await ctx.ownerAuthLoad
  }

  async function fetchAttendanceEmployees() {
    const descriptor = getStaticDescriptorOrThrow<Record<string, AttendanceEmployee>>(
      RTDB_V3_RESOURCE_KEYS.attendanceEmployees
    )
    const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/${descriptor.remotePath}`).once('value')
    const value = { ...((snapshot.val() || {}) as Record<string, AttendanceEmployee>) }
    ctx.state.attendanceEmployees = value
    return value
  }

  async function ensureAttendanceEmployeesCatalogCache() {
    const descriptor = getStaticDescriptorOrThrow<Record<string, AttendanceEmployee>>(
      RTDB_V3_RESOURCE_KEYS.attendanceEmployees
    )
    const value = await ctx.loadCacheFirstResource({
      descriptor,
      readRemote: fetchAttendanceEmployees,
    })
    ctx.state.attendanceEmployees = { ...value }
  }

  function watchCatalogRevision(listener: (event: V3CatalogRevisionEvent) => void) {
    const stops = [
      ctx.db.ref(`${RTDB_V3_ROOT}/meta/revisions/${inventoryDescriptor.revision.path}`).on('value', (snapshot) => {
        const revision = toRevisionValue(snapshot.val())
        const previousRevision = ctx.revisionCache.get(inventoryDescriptor.revision.path)
        ctx.revisionCache.set(inventoryDescriptor.revision.path, revision)
        if (previousRevision === revision) {
          return
        }
        ctx.loadedCatalogSegments.delete('inventory')
        void refreshCatalogSegment('inventory').then(() => {
          listener({ kind: 'catalog', changedSegments: ['inventory'] })
        })
      }) as () => void,
      ctx.db.ref(`${RTDB_V3_ROOT}/meta/revisions/${pricesDescriptor.revision.path}`).on('value', (snapshot) => {
        const revision = toRevisionValue(snapshot.val())
        const previousRevision = ctx.revisionCache.get(pricesDescriptor.revision.path)
        ctx.revisionCache.set(pricesDescriptor.revision.path, revision)
        if (previousRevision === revision) {
          return
        }
        ctx.loadedCatalogSegments.delete('prices')
        void refreshCatalogSegment('prices').then(() => {
          listener({ kind: 'catalog', changedSegments: ['prices'] })
        })
      }) as () => void,
      ctx.db.ref(`${RTDB_V3_ROOT}/meta/revisions/${costsDescriptor.revision.path}`).on('value', (snapshot) => {
        const revision = toRevisionValue(snapshot.val())
        const previousRevision = ctx.revisionCache.get(costsDescriptor.revision.path)
        ctx.revisionCache.set(costsDescriptor.revision.path, revision)
        if (previousRevision === revision) {
          return
        }
        ctx.loadedCatalogSegments.delete('costs')
        void refreshCatalogSegment('costs').then(() => {
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
    const descriptor = getStaticDescriptorOrThrow<PosOwnerAuthMap>(RTDB_V3_RESOURCE_KEYS.authOwners)
    return ctx.db.ref(`${RTDB_V3_ROOT}/meta/revisions/${descriptor.revision.path}`).on('value', (snapshot) => {
      const revision = toRevisionValue(snapshot.val())
      const previousRevision = ctx.revisionCache.get(descriptor.revision.path)
      ctx.revisionCache.set(descriptor.revision.path, revision)
      if (previousRevision === revision) {
        return
      }
      ctx.ownerAuthLoaded = false
      void fetchOwnerAuth()
        .then(async (value) => {
          await ctx.saveCachedResource(descriptor, ctx.revisionCache.get(descriptor.revision.path) || 0, value)
        })
        .then(() => {
          listener({ kind: 'owner-auth' })
        })
    }) as () => void
  }

  async function setOwnerPassword(ownerName: string, record: PosOwnerAuthRecord) {
    const descriptor = getStaticDescriptorOrThrow<PosOwnerAuthMap>(RTDB_V3_RESOURCE_KEYS.authOwners)
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/${descriptor.remotePath}/${ownerName}`]: record,
    }
    ctx.touchRevision('auth/owners', payload)
    await ctx.updateRoot(payload)
    ctx.state.ownerPasswords[ownerName] = record
    await ctx.saveCachedResource(descriptor, ctx.revisionCache.get('auth/owners') || 0, ctx.state.ownerPasswords)
  }

  async function updateInventory(itemId: string, checked: boolean) {
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/${inventoryDescriptor.remotePath}/${encodeCatalogKey(itemId)}`]: checked,
    }
    ctx.touchRevision('catalog/inventory', payload)
    await ctx.updateRoot(payload)
    ctx.state.inventory[itemId] = checked
    await ctx.saveCachedResource(
      inventoryDescriptor,
      ctx.revisionCache.get('catalog/inventory') || 0,
      Object.fromEntries(
        Object.entries(ctx.state.inventory).filter(([, value]) => typeof value === 'boolean')
      ) as Record<string, boolean>
    )
  }

  async function updateInventoryBatch(batch: Record<string, boolean>) {
    const payload: Record<string, unknown> = {}
    Object.entries(batch).forEach(([itemId, checked]) => {
      payload[`${RTDB_V3_ROOT}/${inventoryDescriptor.remotePath}/${encodeCatalogKey(itemId)}`] = checked
      ctx.state.inventory[itemId] = checked
    })
    ctx.touchRevision('catalog/inventory', payload)
    await ctx.updateRoot(payload)
    await ctx.saveCachedResource(
      inventoryDescriptor,
      ctx.revisionCache.get('catalog/inventory') || 0,
      Object.fromEntries(
        Object.entries(ctx.state.inventory).filter(([, value]) => typeof value === 'boolean')
      ) as Record<string, boolean>
    )
  }

  async function updateItemPrice(itemId: string, value: number) {
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/${pricesDescriptor.remotePath}/${encodeCatalogKey(itemId)}`]: value,
    }
    ctx.touchRevision('catalog/prices', payload)
    await ctx.updateRoot(payload)
    ctx.state.itemPrices[itemId] = value
    await ctx.saveCachedResource(
      pricesDescriptor,
      ctx.revisionCache.get('catalog/prices') || 0,
      Object.fromEntries(
        Object.entries(ctx.state.itemPrices).filter(([, entry]) => typeof entry !== 'undefined')
      ) as Record<string, number | string>
    )
  }

  async function updateItemCost(itemId: string, value: number) {
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/${costsDescriptor.remotePath}/${encodeCatalogKey(itemId)}`]: value,
    }
    ctx.touchRevision('catalog/costs', payload)
    await ctx.updateRoot(payload)
    ctx.state.itemCosts[itemId] = value
    await ctx.saveCachedResource(
      costsDescriptor,
      ctx.revisionCache.get('catalog/costs') || 0,
      Object.fromEntries(
        Object.entries(ctx.state.itemCosts).filter(([, entry]) => typeof entry !== 'undefined')
      ) as Record<string, number>
    )
  }

  return {
    fetchAttendanceEmployees: ensureAttendanceEmployeesCatalogCache,
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
