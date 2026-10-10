import type { AttendanceEmployee } from '@/shared/attendance-service'
import type { RtdbV3RepositoryContext } from './rtdb-v3-repository-context'
import { decodeCatalogRecord, encodeCatalogKey } from './rtdb-v3-repository-context'
import { getStaticDescriptorOrThrow, RTDB_V3_RESOURCE_KEYS } from './rtdb-v3-resource-registry'
import type { V3CatalogRevisionEvent, V3CatalogSegment } from './rtdb-v3-types'
import { RTDB_V3_ROOT } from './rtdb-v3-types'

export function createRtdbV3RepositoryCatalogModule(ctx: RtdbV3RepositoryContext) {
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
  }

  async function readInventoryRemote() {
    const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/${inventoryDescriptor.remotePath}`).once('value')
    return (snapshot.val() || {}) as Record<string, boolean>
  }

  async function readPricesRemote() {
    const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/${pricesDescriptor.remotePath}`).once('value')
    return (snapshot.val() || {}) as Record<string, number | string>
  }

  async function readCostsRemote() {
    const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/${costsDescriptor.remotePath}`).once('value')
    return (snapshot.val() || {}) as Record<string, number>
  }

  async function ensureInventorySegment() {
    const existingLoad = ctx.catalogSegmentLoads.get('inventory')
    if (existingLoad) {
      await existingLoad
      return
    }
    const load = ctx
      .ensureManagedResource({
        descriptor: inventoryDescriptor,
        readMemory: () => {
          return { ...ctx.state.inventory }
        },
        writeMemory: (value) => {
          applyCatalogSegment('inventory', value)
        },
        clearMemory: () => {
          ctx.state.inventory = {}
        },
        readRemote: readInventoryRemote,
      })
      .finally(() => {
        ctx.catalogSegmentLoads.delete('inventory')
      })
    ctx.catalogSegmentLoads.set('inventory', load)
    await load
  }

  async function ensurePricesSegment() {
    const existingLoad = ctx.catalogSegmentLoads.get('prices')
    if (existingLoad) {
      await existingLoad
      return
    }
    const load = ctx
      .ensureManagedResource({
        descriptor: pricesDescriptor,
        readMemory: () => {
          return Object.fromEntries(
            Object.entries(ctx.state.itemPrices).filter(([, value]) => value !== undefined)
          ) as Record<string, number | string>
        },
        writeMemory: (value) => {
          applyCatalogSegment('prices', value)
        },
        clearMemory: () => {
          ctx.state.itemPrices = {}
        },
        readRemote: readPricesRemote,
      })
      .finally(() => {
        ctx.catalogSegmentLoads.delete('prices')
      })
    ctx.catalogSegmentLoads.set('prices', load)
    await load
  }

  async function ensureCostsSegment() {
    const existingLoad = ctx.catalogSegmentLoads.get('costs')
    if (existingLoad) {
      await existingLoad
      return
    }
    const load = ctx
      .ensureManagedResource({
        descriptor: costsDescriptor,
        readMemory: () => {
          return Object.fromEntries(
            Object.entries(ctx.state.itemCosts).filter(([, value]) => value !== undefined)
          ) as Record<string, number>
        },
        writeMemory: (value) => {
          applyCatalogSegment('costs', value)
        },
        clearMemory: () => {
          ctx.state.itemCosts = {}
        },
        readRemote: readCostsRemote,
      })
      .finally(() => {
        ctx.catalogSegmentLoads.delete('costs')
      })
    ctx.catalogSegmentLoads.set('costs', load)
    await load
  }

  async function ensureCatalogSegment(segment: V3CatalogSegment) {
    if (segment === 'inventory') {
      await ensureInventorySegment()
      return
    }
    if (segment === 'prices') {
      await ensurePricesSegment()
      return
    }
    await ensureCostsSegment()
  }

  async function ensureCatalog() {
    await Promise.all([
      ensureCatalogSegment('inventory'),
      ensureCatalogSegment('prices'),
      ensureCatalogSegment('costs'),
    ])
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
    const value = await ctx.ensureManagedResource({
      descriptor,
      readMemory: () => {
        const employees = ctx.state.attendanceEmployees
        return Object.keys(employees).length > 0 ? { ...employees } : undefined
      },
      writeMemory: (next) => {
        ctx.state.attendanceEmployees = { ...next }
      },
      clearMemory: () => {
        ctx.state.attendanceEmployees = {}
      },
      readRemote: fetchAttendanceEmployees,
    })
    ctx.state.attendanceEmployees = { ...value }
  }

  function watchCatalogRevision(listener: (event: V3CatalogRevisionEvent) => void) {
    const stops = [
      ctx.watchManagedResource({
        descriptor: inventoryDescriptor,
        readMemory: () => {
          return { ...ctx.state.inventory }
        },
        writeMemory: (value) => {
          applyCatalogSegment('inventory', value)
        },
        clearMemory: () => {
          ctx.state.inventory = {}
        },
        readRemote: readInventoryRemote,
        onChange: () => {
          listener({ kind: 'catalog', changedSegments: ['inventory'] })
        },
      }),
      ctx.watchManagedResource({
        descriptor: pricesDescriptor,
        readMemory: () => {
          return Object.fromEntries(
            Object.entries(ctx.state.itemPrices).filter(([, value]) => value !== undefined)
          ) as Record<string, number | string>
        },
        writeMemory: (value) => {
          applyCatalogSegment('prices', value)
        },
        clearMemory: () => {
          ctx.state.itemPrices = {}
        },
        readRemote: readPricesRemote,
        onChange: () => {
          listener({ kind: 'catalog', changedSegments: ['prices'] })
        },
      }),
      ctx.watchManagedResource({
        descriptor: costsDescriptor,
        readMemory: () => {
          return Object.fromEntries(
            Object.entries(ctx.state.itemCosts).filter(([, value]) => value !== undefined)
          ) as Record<string, number>
        },
        writeMemory: (value) => {
          applyCatalogSegment('costs', value)
        },
        clearMemory: () => {
          ctx.state.itemCosts = {}
        },
        readRemote: readCostsRemote,
        onChange: () => {
          listener({ kind: 'catalog', changedSegments: ['costs'] })
        },
      }),
    ]
    return () => {
      stops.forEach((stop) => {
        stop()
      })
    }
  }

  async function updateInventory(itemId: string, checked: boolean) {
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/${inventoryDescriptor.remotePath}/${encodeCatalogKey(itemId)}`]: checked,
    }
    ctx.touchRevision('catalog/inventory', payload)
    await ctx.updateRoot(payload)
    ctx.state.inventory[itemId] = checked
    await ctx.writeManagedResourceCache(
      inventoryDescriptor,
      Object.fromEntries(Object.entries(ctx.state.inventory).map(([key, value]) => [encodeCatalogKey(key), value]))
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
    await ctx.writeManagedResourceCache(
      inventoryDescriptor,
      Object.fromEntries(Object.entries(ctx.state.inventory).map(([key, value]) => [encodeCatalogKey(key), value]))
    )
  }

  async function updateItemPrice(itemId: string, value: number) {
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/${pricesDescriptor.remotePath}/${encodeCatalogKey(itemId)}`]: value,
    }
    ctx.touchRevision('catalog/prices', payload)
    await ctx.updateRoot(payload)
    ctx.state.itemPrices[itemId] = value
    await ctx.writeManagedResourceCache(
      pricesDescriptor,
      Object.fromEntries(
        Object.entries(ctx.state.itemPrices)
          .filter(([, entry]) => entry !== undefined)
          .map(([key, entry]) => [encodeCatalogKey(key), entry as number])
      )
    )
  }

  async function updateItemCost(itemId: string, value: number) {
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/${costsDescriptor.remotePath}/${encodeCatalogKey(itemId)}`]: value,
    }
    ctx.touchRevision('catalog/costs', payload)
    await ctx.updateRoot(payload)
    ctx.state.itemCosts[itemId] = value
    await ctx.writeManagedResourceCache(
      costsDescriptor,
      Object.fromEntries(
        Object.entries(ctx.state.itemCosts)
          .filter(([, entry]) => entry !== undefined)
          .map(([key, entry]) => [encodeCatalogKey(key), entry as number])
      )
    )
  }

  return {
    fetchAttendanceEmployees: ensureAttendanceEmployeesCatalogCache,
    ensureCatalog,
    watchCatalogRevision,
    updateInventory,
    updateInventoryBatch,
    updateItemPrice,
    updateItemCost,
  }
}
