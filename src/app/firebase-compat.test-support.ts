import { createDbStub, readAtPath } from '@/features/pos-data/rtdb-v3-repository.test-support'

// Stands in for `@/shared/firebase-compat` in component tests: like RTDB, every write notifies the value listeners.
export function createDatabaseCompat() {
  const db = createDbStub({})
  const notify = () => {
    for (const path of new Set(db.onCalls.filter((call) => call.eventName === 'value').map((call) => call.path))) {
      db.emit(path, 'value', readAtPath(db.data, path))
    }
  }
  return {
    ref(path?: string) {
      const ref = db.ref(path)
      return {
        ...ref,
        async update(payload: Record<string, unknown>) {
          await ref.update(payload)
          notify()
        },
        async transaction<T>(updater: (currentValue: T | null) => T) {
          const result = await ref.transaction(updater)
          notify()
          return result
        },
      }
    },
  }
}

export const dbIncrement = (delta: number) => ({ '.sv': { increment: delta } })
