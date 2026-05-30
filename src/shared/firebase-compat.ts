import { type FirebaseApp, getApps, initializeApp } from 'firebase/app'
import {
  type Database,
  type DatabaseReference,
  type DataSnapshot,
  get,
  getDatabase,
  increment,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  onValue,
  ref,
  runTransaction,
  update,
} from 'firebase/database'

type FirebaseConfig = {
  apiKey: string
  authDomain: string
  databaseURL: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId?: string
}

export type DatabaseCompatSnapshot = {
  val(): unknown
  key(): string | null
}

type ValueListener = (snapshot: DatabaseCompatSnapshot) => void
type DatabaseCompatEventName = 'value' | 'child_added' | 'child_changed' | 'child_removed'

function wrapSnapshot(snapshot: DataSnapshot): DatabaseCompatSnapshot {
  return {
    val() {
      return snapshot.val()
    },
    key() {
      return snapshot.key
    },
  }
}

export class DatabaseRefCompat {
  constructor(
    private readonly database: Database,
    private readonly path: string
  ) {}

  async once(eventName: 'value') {
    if (eventName !== 'value') {
      throw new Error(`Unsupported event: ${eventName}`)
    }

    const snapshot = await get(this.getRef())
    return wrapSnapshot(snapshot)
  }

  on(eventName: DatabaseCompatEventName, listener: ValueListener) {
    if (eventName === 'value') {
      return onValue(this.getRef(), (snapshot) => {
        listener(wrapSnapshot(snapshot))
      })
    }

    if (eventName === 'child_added') {
      return onChildAdded(this.getRef(), (snapshot) => {
        listener(wrapSnapshot(snapshot))
      })
    }

    if (eventName === 'child_changed') {
      return onChildChanged(this.getRef(), (snapshot) => {
        listener(wrapSnapshot(snapshot))
      })
    }

    if (eventName === 'child_removed') {
      return onChildRemoved(this.getRef(), (snapshot) => {
        listener(wrapSnapshot(snapshot))
      })
    }

    throw new Error(`Unsupported event: ${eventName}`)
  }

  async update(payload: Record<string, unknown>) {
    await update(this.getRef(), payload)
  }

  async transaction<T>(updater: (currentValue: T | null) => T) {
    const result = await runTransaction(this.getRef(), (currentValue) => updater((currentValue as T | null) ?? null))

    return {
      committed: result.committed,
      snapshot: wrapSnapshot(result.snapshot),
    }
  }

  private getRef(): DatabaseReference {
    if (!this.path || this.path === '/') {
      return ref(this.database)
    }

    return ref(this.database, this.path.replace(/^\/+/, ''))
  }
}

export class DatabaseCompat {
  constructor(private readonly database: Database) {}

  ref(path = '/') {
    return new DatabaseRefCompat(this.database, path)
  }
}

export function dbIncrement(delta: number) {
  return increment(delta)
}

function getOrCreateApp(config: FirebaseConfig): FirebaseApp {
  return getApps()[0] ?? initializeApp(config)
}

export function createDatabaseCompat(config: FirebaseConfig) {
  const app = getOrCreateApp(config)
  const database = getDatabase(app)
  return new DatabaseCompat(database)
}
