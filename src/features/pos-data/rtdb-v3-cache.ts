import { RTDB_V3_SCHEMA_VERSION } from './rtdb-v3-types'

export type StorageCodec<TDomain, TStored = TDomain> = {
  encode(value: TDomain): TStored
  decode(value: TStored): TDomain
}

export type RevisionAddress = {
  path: string
}

export type ResourceKey = string

export type ResourceDescriptor<TDomain, TStored = TDomain> = {
  resourceKey: ResourceKey
  remotePath: string
  revision: RevisionAddress
  codec: StorageCodec<TDomain, TStored>
}

export const REGISTERED_RESOURCE_DESCRIPTOR: unique symbol = Symbol('rtdb-v3-resource-descriptor')

export type RegisteredResourceDescriptor<TDomain, TStored = TDomain> = ResourceDescriptor<TDomain, TStored> & {
  [REGISTERED_RESOURCE_DESCRIPTOR]: true
}

export type CacheManifestRecord = {
  schemaVersion: number
  resourceKey: ResourceKey
  revision: number
  updatedAt: number
  payloadSize: number
  payloadHash: string
}

export type PersistentCacheStore = {
  readManifest(resourceKey: ResourceKey): Promise<CacheManifestRecord | null>
  writeManifest(record: CacheManifestRecord): Promise<void>
  deleteManifest(resourceKey: ResourceKey): Promise<void>
  readBody<TStored>(resourceKey: ResourceKey): Promise<TStored | null>
  writeBody<TStored>(resourceKey: ResourceKey, body: TStored): Promise<void>
  deleteBody(resourceKey: ResourceKey): Promise<void>
  clearNamespace(): Promise<void>
}

const CACHE_NAMESPACE = 'qys:rtdb-v3-cache'
const DB_NAME = 'qypos-rtdb-v3-cache'
const DB_VERSION = 1
const BODY_STORE = 'resourceBodies'
const SCHEMA_VERSION_STORAGE_KEY = `${CACHE_NAMESPACE}:schema-version`

function getManifestStorageKey(resourceKey: ResourceKey) {
  return `${CACHE_NAMESPACE}:manifest:${resourceKey}`
}

function isRecordShape(value: unknown): value is CacheManifestRecord {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as CacheManifestRecord).schemaVersion === 'number' &&
      typeof (value as CacheManifestRecord).resourceKey === 'string' &&
      typeof (value as CacheManifestRecord).revision === 'number' &&
      typeof (value as CacheManifestRecord).updatedAt === 'number' &&
      typeof (value as CacheManifestRecord).payloadSize === 'number' &&
      typeof (value as CacheManifestRecord).payloadHash === 'string'
  )
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`
}

export function createPayloadHash(value: unknown) {
  const serialized = stableSerialize(value)
  let hash = 2166136261
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function canUseLocalStorage() {
  return typeof globalThis.localStorage !== 'undefined'
}

function canUseIndexedDb() {
  return typeof globalThis.indexedDB !== 'undefined'
}

function readNamespaceSchemaVersion(raw: string | null) {
  if (!raw) return null
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) ? value : null
}

async function requestToPromise<T>(request: IDBRequest<T>) {
  return await new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      reject(request.error || new Error('IndexedDB request failed'))
    }
  })
}

async function transactionDone(transaction: IDBTransaction) {
  return await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve()
    }
    transaction.onabort = () => {
      reject(transaction.error || new Error('IndexedDB transaction aborted'))
    }
    transaction.onerror = () => {
      reject(transaction.error || new Error('IndexedDB transaction failed'))
    }
  })
}

export function createIdentityCodec<T>(): StorageCodec<T> {
  return {
    encode(value) {
      return value
    },
    decode(value) {
      return value
    },
  }
}

export function registerResourceDescriptor<TDomain, TStored = TDomain>(
  descriptor: ResourceDescriptor<TDomain, TStored>
): RegisteredResourceDescriptor<TDomain, TStored> {
  return {
    ...descriptor,
    [REGISTERED_RESOURCE_DESCRIPTOR]: true,
  }
}

export function isRegisteredResourceDescriptor<TDomain, TStored = TDomain>(
  descriptor: ResourceDescriptor<TDomain, TStored>
): descriptor is RegisteredResourceDescriptor<TDomain, TStored> {
  return Boolean((descriptor as RegisteredResourceDescriptor<TDomain, TStored>)[REGISTERED_RESOURCE_DESCRIPTOR])
}

export function createPersistentCacheStore(): PersistentCacheStore {
  if (!canUseLocalStorage() || !canUseIndexedDb()) {
    return createMemoryPersistentCacheStore()
  }

  const memoryFallback = createMemoryPersistentCacheStore()
  let dbLoad: Promise<IDBDatabase> | null = null
  let fallbackMode = false

  function shouldUseFallback() {
    return fallbackMode
  }

  function enableFallback() {
    fallbackMode = true
  }

  async function openDb() {
    if (shouldUseFallback()) {
      throw new Error('Persistent cache store fallback active')
    }
    try {
      dbLoad ||= new Promise<IDBDatabase>((resolve, reject) => {
        const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION)
        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains(BODY_STORE)) {
            db.createObjectStore(BODY_STORE)
          }
        }
        request.onsuccess = () => {
          resolve(request.result)
        }
        request.onerror = () => {
          reject(request.error || new Error('IndexedDB open failed'))
        }
      })
      return await dbLoad
    } catch (error) {
      dbLoad = null
      enableFallback()
      throw error
    }
  }

  async function runWithFallback<T>(work: () => Promise<T>, fallback: () => Promise<T>) {
    if (shouldUseFallback()) {
      return await fallback()
    }
    try {
      return await work()
    } catch {
      enableFallback()
      return await fallback()
    }
  }

  async function clearNamespaceData() {
    if (shouldUseFallback()) {
      await memoryFallback.clearNamespace()
      return
    }
    const manifestKeys = []
    for (let index = 0; index < globalThis.localStorage.length; index += 1) {
      const key = globalThis.localStorage.key(index)
      if (key?.startsWith(`${CACHE_NAMESPACE}:manifest:`)) {
        manifestKeys.push(key)
      }
    }
    manifestKeys.forEach((key) => {
      globalThis.localStorage.removeItem(key)
    })
    const db = await openDb()
    const transaction = db.transaction(BODY_STORE, 'readwrite')
    transaction.objectStore(BODY_STORE).clear()
    await transactionDone(transaction)
  }

  async function ensureNamespaceSchemaVersion() {
    if (shouldUseFallback()) {
      return
    }
    const raw = globalThis.localStorage.getItem(SCHEMA_VERSION_STORAGE_KEY)
    const namespaceSchemaVersion = readNamespaceSchemaVersion(raw)
    if (namespaceSchemaVersion === RTDB_V3_SCHEMA_VERSION) {
      return
    }

    const hasLegacyManifests = (() => {
      for (let index = 0; index < globalThis.localStorage.length; index += 1) {
        const key = globalThis.localStorage.key(index)
        if (key?.startsWith(`${CACHE_NAMESPACE}:manifest:`)) {
          return true
        }
      }
      return false
    })()

    if (raw !== null || hasLegacyManifests) {
      await clearNamespaceData()
    }
    globalThis.localStorage.setItem(SCHEMA_VERSION_STORAGE_KEY, String(RTDB_V3_SCHEMA_VERSION))
  }

  return {
    async readManifest(resourceKey) {
      return await runWithFallback(
        async () => {
          await ensureNamespaceSchemaVersion()
          const raw = globalThis.localStorage.getItem(getManifestStorageKey(resourceKey))
          if (!raw) return null
          try {
            const parsed = JSON.parse(raw) as unknown
            if (!isRecordShape(parsed)) {
              globalThis.localStorage.removeItem(getManifestStorageKey(resourceKey))
              return null
            }
            if (parsed.schemaVersion !== RTDB_V3_SCHEMA_VERSION) {
              await this.clearNamespace()
              return null
            }
            return parsed
          } catch {
            globalThis.localStorage.removeItem(getManifestStorageStorageKeySafe(resourceKey))
            await this.deleteBody(resourceKey)
            return null
          }
        },
        async () => await memoryFallback.readManifest(resourceKey)
      )
    },
    async writeManifest(record) {
      await runWithFallback(
        async () => {
          globalThis.localStorage.setItem(SCHEMA_VERSION_STORAGE_KEY, String(record.schemaVersion))
          globalThis.localStorage.setItem(getManifestStorageKey(record.resourceKey), JSON.stringify(record))
        },
        async () => await memoryFallback.writeManifest(record)
      )
    },
    async deleteManifest(resourceKey) {
      await runWithFallback(
        async () => {
          await ensureNamespaceSchemaVersion()
          globalThis.localStorage.removeItem(getManifestStorageKey(resourceKey))
        },
        async () => await memoryFallback.deleteManifest(resourceKey)
      )
    },
    async readBody<TStored>(resourceKey: ResourceKey) {
      return await runWithFallback(
        async () => {
          await ensureNamespaceSchemaVersion()
          const db = await openDb()
          const transaction = db.transaction(BODY_STORE, 'readonly')
          const store = transaction.objectStore(BODY_STORE)
          const value = await requestToPromise(store.get(resourceKey))
          await transactionDone(transaction)
          return (value as TStored | undefined) ?? null
        },
        async () => await memoryFallback.readBody<TStored>(resourceKey)
      )
    },
    async writeBody(resourceKey, body) {
      await runWithFallback(
        async () => {
          await ensureNamespaceSchemaVersion()
          const db = await openDb()
          const transaction = db.transaction(BODY_STORE, 'readwrite')
          transaction.objectStore(BODY_STORE).put(body, resourceKey)
          await transactionDone(transaction)
        },
        async () => await memoryFallback.writeBody(resourceKey, body)
      )
    },
    async deleteBody(resourceKey) {
      await runWithFallback(
        async () => {
          await ensureNamespaceSchemaVersion()
          const db = await openDb()
          const transaction = db.transaction(BODY_STORE, 'readwrite')
          transaction.objectStore(BODY_STORE).delete(resourceKey)
          await transactionDone(transaction)
        },
        async () => await memoryFallback.deleteBody(resourceKey)
      )
    },
    async clearNamespace() {
      await runWithFallback(
        async () => {
          await clearNamespaceData()
          globalThis.localStorage.setItem(SCHEMA_VERSION_STORAGE_KEY, String(RTDB_V3_SCHEMA_VERSION))
        },
        async () => await memoryFallback.clearNamespace()
      )
    },
  }
}

function getManifestStorageStorageKeySafe(resourceKey: ResourceKey) {
  return getManifestStorageKey(resourceKey)
}

export function createMemoryPersistentCacheStore(): PersistentCacheStore {
  const manifests = new Map<ResourceKey, CacheManifestRecord>()
  const bodies = new Map<ResourceKey, unknown>()
  let namespaceSchemaVersion: number | null = null

  async function ensureNamespaceSchemaVersion() {
    if (namespaceSchemaVersion === RTDB_V3_SCHEMA_VERSION) {
      return
    }
    if (namespaceSchemaVersion !== null || manifests.size > 0 || bodies.size > 0) {
      manifests.clear()
      bodies.clear()
    }
    namespaceSchemaVersion = RTDB_V3_SCHEMA_VERSION
  }

  return {
    async readManifest(resourceKey) {
      await ensureNamespaceSchemaVersion()
      const record = manifests.get(resourceKey) || null
      if (!record) return null
      if (record.schemaVersion !== RTDB_V3_SCHEMA_VERSION) {
        await this.clearNamespace()
        return null
      }
      return structuredClone(record)
    },
    async writeManifest(record) {
      namespaceSchemaVersion = record.schemaVersion
      manifests.set(record.resourceKey, structuredClone(record))
    },
    async deleteManifest(resourceKey) {
      await ensureNamespaceSchemaVersion()
      manifests.delete(resourceKey)
    },
    async readBody<TStored>(resourceKey: ResourceKey) {
      await ensureNamespaceSchemaVersion()
      if (!bodies.has(resourceKey)) {
        return null
      }
      return structuredClone(bodies.get(resourceKey) as TStored)
    },
    async writeBody(resourceKey, body) {
      await ensureNamespaceSchemaVersion()
      bodies.set(resourceKey, structuredClone(body))
    },
    async deleteBody(resourceKey) {
      await ensureNamespaceSchemaVersion()
      bodies.delete(resourceKey)
    },
    async clearNamespace() {
      manifests.clear()
      bodies.clear()
      namespaceSchemaVersion = RTDB_V3_SCHEMA_VERSION
    },
  }
}

export function createResourceRegistry(descriptors: ResourceDescriptor<unknown, unknown>[]) {
  const registeredDescriptors = descriptors.map((descriptor) =>
    isRegisteredResourceDescriptor(descriptor) ? descriptor : registerResourceDescriptor(descriptor)
  )
  const byKey = new Map<ResourceKey, RegisteredResourceDescriptor<unknown, unknown>>()
  const byRevisionPath = new Map<string, RegisteredResourceDescriptor<unknown, unknown>>()
  const byRemotePath = new Map<string, RegisteredResourceDescriptor<unknown, unknown>>()

  registeredDescriptors.forEach((descriptor) => {
    if (byKey.has(descriptor.resourceKey)) {
      throw new Error(`Duplicate resource key: ${descriptor.resourceKey}`)
    }
    if (byRevisionPath.has(descriptor.revision.path)) {
      throw new Error(`Duplicate revision path: ${descriptor.revision.path}`)
    }
    if (byRemotePath.has(descriptor.remotePath)) {
      throw new Error(`Duplicate remote path: ${descriptor.remotePath}`)
    }
    byKey.set(descriptor.resourceKey, descriptor)
    byRevisionPath.set(descriptor.revision.path, descriptor)
    byRemotePath.set(descriptor.remotePath, descriptor)
  })

  return {
    descriptors: registeredDescriptors,
    getByKey<TDomain, TStored = TDomain>(resourceKey: ResourceKey) {
      return byKey.get(resourceKey) as RegisteredResourceDescriptor<TDomain, TStored> | undefined
    },
    getByRevisionPath<TDomain, TStored = TDomain>(path: string) {
      return byRevisionPath.get(path) as RegisteredResourceDescriptor<TDomain, TStored> | undefined
    },
    getByRemotePath<TDomain, TStored = TDomain>(path: string) {
      return byRemotePath.get(path) as RegisteredResourceDescriptor<TDomain, TStored> | undefined
    },
    hasRevisionPath(path: string) {
      return byRevisionPath.has(path)
    },
    hasRemotePath(path: string) {
      return byRemotePath.has(path)
    },
  }
}

export type ResourceRegistry = ReturnType<typeof createResourceRegistry>
