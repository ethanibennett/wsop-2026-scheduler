// IndexedDB layer (offline-first local storage). Replaces the prototypes'
// Claude-artifact `window.storage` API, which does NOT exist in a real PWA.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  Session,
  BankrollAdjustment,
  LiftEntry,
  Benchmark,
  PrehabTick,
  RoutineLog,
  HealthMetric,
  StudyLog,
  ReviewEntry,
  ChecklistTick,
  Expense,
  Settings,
} from './types'
import type { Backer } from './backers'
import { recKey, type SyncRecord } from './sync'

export const DB_NAME = 'wsop-console'
export const DB_VERSION = 4 // v2: expenses · v3: tombstones · v4: backers

interface Tombstone {
  key: string // recKey(store, id)
  store: string
  id: string
  updatedAt: number
}

interface ConsoleDB extends DBSchema {
  sessions: { key: string; value: Session; indexes: { date: string } }
  adjustments: { key: string; value: BankrollAdjustment; indexes: { date: string } }
  expenses: { key: string; value: Expense; indexes: { date: string } }
  lifts: { key: string; value: LiftEntry; indexes: { date: string } }
  benchmarks: { key: string; value: Benchmark; indexes: { date: string } }
  prehab: { key: string; value: PrehabTick }
  routine: { key: string; value: RoutineLog }
  health: { key: string; value: HealthMetric; indexes: { date: string } }
  study: { key: string; value: StudyLog; indexes: { date: string } }
  reviews: { key: string; value: ReviewEntry; indexes: { date: string } }
  checklist: { key: string; value: ChecklistTick }
  settings: { key: string; value: Settings & { id: string } }
  backers: { key: string; value: Backer }
  tombstones: { key: string; value: Tombstone }
}

let _db: Promise<IDBPDatabase<ConsoleDB>> | null = null

export function getDB(): Promise<IDBPDatabase<ConsoleDB>> {
  if (!_db) {
    _db = openDB<ConsoleDB>(DB_NAME, DB_VERSION, {
      // Guard each version's stores on oldVersion — an unconditional create
      // would throw ConstraintError when an existing (v1) device upgrades.
      upgrade(db, oldVersion) {
        const byDate = { keyPath: 'id' as const }
        if (oldVersion < 1) {
          const s = db.createObjectStore('sessions', byDate)
          s.createIndex('date', 'date')
          const a = db.createObjectStore('adjustments', byDate)
          a.createIndex('date', 'date')
          const l = db.createObjectStore('lifts', byDate)
          l.createIndex('date', 'date')
          const b = db.createObjectStore('benchmarks', byDate)
          b.createIndex('date', 'date')
          db.createObjectStore('prehab', { keyPath: 'date' })
          db.createObjectStore('routine', { keyPath: 'date' })
          const h = db.createObjectStore('health', byDate)
          h.createIndex('date', 'date')
          const st = db.createObjectStore('study', byDate)
          st.createIndex('date', 'date')
          const r = db.createObjectStore('reviews', byDate)
          r.createIndex('date', 'date')
          db.createObjectStore('checklist', { keyPath: 'date' })
          db.createObjectStore('settings', { keyPath: 'id' })
        }
        if (oldVersion < 2) {
          const e = db.createObjectStore('expenses', byDate)
          e.createIndex('date', 'date')
        }
        if (oldVersion < 3) {
          db.createObjectStore('tombstones', { keyPath: 'key' })
        }
        if (oldVersion < 4) {
          db.createObjectStore('backers', { keyPath: 'id' })
        }
      },
    })
  }
  return _db
}

// Stores that hold an array of id-keyed records.
export type ListStore =
  | 'sessions'
  | 'adjustments'
  | 'expenses'
  | 'lifts'
  | 'benchmarks'
  | 'health'
  | 'study'
  | 'reviews'
  | 'backers'

// Stores keyed by `date` (one record per day).
export type DateStore = 'prehab' | 'routine' | 'checklist'

export async function getAll<T>(store: ListStore | DateStore): Promise<T[]> {
  const db = await getDB()
  return (await db.getAll(store as never)) as T[]
}

function recId(v: unknown): string | undefined {
  const o = v as { id?: string; date?: string }
  return o.id ?? o.date
}

// App writes stamp `updatedAt` (drives last-write-wins sync) and clear any
// tombstone for the key (a re-created record is alive again).
export async function putRecord<T>(store: ListStore | DateStore, value: T): Promise<void> {
  const db = await getDB()
  const stamped = { ...(value as object), updatedAt: Date.now() } as T
  await db.put(store as never, stamped as never)
  const id = recId(stamped)
  if (id) await db.delete('tombstones', recKey(store, id))
}

/** Fetch a single record by key (used for race-free read-merge-write). */
export async function getRecord<T>(
  store: DateStore,
  key: string,
): Promise<T | undefined> {
  const db = await getDB()
  return (await db.get(store as never, key)) as T | undefined
}

// App deletes leave a tombstone so the delete propagates to other devices.
export async function deleteRecord(
  store: ListStore | DateStore,
  key: string,
): Promise<void> {
  const db = await getDB()
  await db.delete(store as never, key)
  await db.put('tombstones', { key: recKey(store, key), store, id: key, updatedAt: Date.now() })
}

export const SETTINGS_KEY = 'app'

export async function loadSettings(): Promise<(Settings & { id: string }) | undefined> {
  const db = await getDB()
  return db.get('settings', SETTINGS_KEY)
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDB()
  await db.put('settings', { ...settings, id: SETTINGS_KEY, updatedAt: Date.now() } as never)
}

// ── Cross-device sync IO (raw = apply remote changes without re-stamping) ──
const SYNC_STORES = [
  'sessions', 'adjustments', 'expenses', 'lifts', 'benchmarks',
  'prehab', 'routine', 'health', 'study', 'reviews', 'checklist', 'settings',
  'backers',
] as const

/** Gather every local record + tombstone as SyncRecords for a full-state push. */
export async function collectSyncRecords(): Promise<SyncRecord[]> {
  const db = await getDB()
  const out: SyncRecord[] = []
  for (const store of SYNC_STORES) {
    const rows = (await db.getAll(store)) as unknown[]
    for (const row of rows) {
      const id = recId(row)
      if (id == null) continue
      const ts = Number((row as { updatedAt?: unknown }).updatedAt) || 0
      out.push({ store, id, data: JSON.stringify(row), updatedAt: ts })
    }
  }
  for (const t of await db.getAll('tombstones')) {
    out.push({ store: t.store, id: t.id, data: null, updatedAt: t.updatedAt, deleted: true })
  }
  return out
}

/** Apply remote-winning records locally (no re-stamp; preserves their updatedAt). */
export async function applySyncRecords(records: SyncRecord[]): Promise<void> {
  const db = await getDB()
  for (const r of records) {
    const known = (SYNC_STORES as readonly string[]).includes(r.store)
    if (!known) continue
    if (r.deleted || r.data == null) {
      await db.delete(r.store as never, r.id)
      await db.put('tombstones', { key: recKey(r.store, r.id), store: r.store, id: r.id, updatedAt: r.updatedAt })
    } else {
      try {
        await db.put(r.store as never, JSON.parse(r.data) as never)
        await db.delete('tombstones', recKey(r.store, r.id))
      } catch {
        /* skip a malformed remote record rather than break the whole sync */
      }
    }
  }
}

// ── Bulk export / import (the only safety net for local-only data) ──
type StoreName =
  | 'sessions'
  | 'adjustments'
  | 'expenses'
  | 'lifts'
  | 'benchmarks'
  | 'prehab'
  | 'routine'
  | 'health'
  | 'study'
  | 'reviews'
  | 'checklist'
  | 'settings'
  | 'backers'
const ALL_STORES: StoreName[] = [
  'sessions',
  'adjustments',
  'expenses',
  'lifts',
  'benchmarks',
  'prehab',
  'routine',
  'health',
  'study',
  'reviews',
  'checklist',
  'settings',
  'backers',
]

export interface BackupBlob {
  app: 'wsop-console'
  version: number
  exportedAt: string
  data: Record<string, unknown[]>
}

// Derive the store list from the live DB so a newly-added store can never
// silently drop out of backups (vs. a hand-maintained ALL_STORES that drifts).
function storeNames(db: IDBPDatabase<ConsoleDB>): StoreName[] {
  const live = (Array.from(db.objectStoreNames) as string[]).filter(
    (s) => s !== 'tombstones', // sync plumbing, not user data — keep out of backups
  ) as StoreName[]
  return live.length ? live : ALL_STORES
}

export async function exportAll(exportedAt: string): Promise<BackupBlob> {
  const db = await getDB()
  const data: Record<string, unknown[]> = {}
  for (const store of storeNames(db)) {
    data[store] = await db.getAll(store)
  }
  return { app: 'wsop-console', version: DB_VERSION, exportedAt, data }
}

export async function importAll(blob: BackupBlob): Promise<void> {
  if (blob?.app !== 'wsop-console') {
    throw new Error('Not a WSOP Console backup file.')
  }
  // Refuse backups from a newer schema — restoring them into older code could
  // write records that don't match the current stores' keyPaths.
  if (typeof blob.version === 'number' && blob.version > DB_VERSION) {
    throw new Error(
      `Backup is from a newer app version (v${blob.version}); update the app before importing.`,
    )
  }
  const db = await getDB()
  const stores = storeNames(db)
  const tx = db.transaction(stores, 'readwrite')
  for (const store of stores) {
    const rows = blob.data?.[store]
    if (!Array.isArray(rows)) continue
    const os = tx.objectStore(store)
    await os.clear()
    for (const row of rows) await os.put(row as never)
  }
  await tx.done
}
