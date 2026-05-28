import { type FirebaseApp, getApps, initializeApp } from 'firebase/app'
import {
  type Database,
  type DatabaseReference,
  type DataSnapshot,
  get,
  getDatabase,
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
}

type ValueListener = (snapshot: DatabaseCompatSnapshot) => void

function wrapSnapshot(snapshot: DataSnapshot): DatabaseCompatSnapshot {
  return {
    val() {
      return snapshot.val()
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

  on(eventName: 'value', listener: ValueListener) {
    if (eventName !== 'value') {
      throw new Error(`Unsupported event: ${eventName}`)
    }

    return onValue(this.getRef(), (snapshot) => {
      listener(wrapSnapshot(snapshot))
    })
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

function getOrCreateApp(config: FirebaseConfig): FirebaseApp {
  return getApps()[0] ?? initializeApp(config)
}

export function createDatabaseCompat(config: FirebaseConfig) {
  const app = getOrCreateApp(config)
  const database = getDatabase(app)
  return new DatabaseCompat(database)
}
