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
  Settings,
} from './types'

export const DB_NAME = 'wsop-console'
export const DB_VERSION = 1

interface ConsoleDB extends DBSchema {
  sessions: { key: string; value: Session; indexes: { date: string } }
  adjustments: { key: string; value: BankrollAdjustment; indexes: { date: string } }
  lifts: { key: string; value: LiftEntry; indexes: { date: string } }
  benchmarks: { key: string; value: Benchmark; indexes: { date: string } }
  prehab: { key: string; value: PrehabTick }
  routine: { key: string; value: RoutineLog }
  health: { key: string; value: HealthMetric; indexes: { date: string } }
  study: { key: string; value: StudyLog; indexes: { date: string } }
  reviews: { key: string; value: ReviewEntry; indexes: { date: string } }
  checklist: { key: string; value: ChecklistTick }
  settings: { key: string; value: Settings & { id: string } }
}

let _db: Promise<IDBPDatabase<ConsoleDB>> | null = null

export function getDB(): Promise<IDBPDatabase<ConsoleDB>> {
  if (!_db) {
    _db = openDB<ConsoleDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const byDate = { keyPath: 'id' as const }
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
      },
    })
  }
  return _db
}

// Stores that hold an array of id-keyed records.
export type ListStore =
  | 'sessions'
  | 'adjustments'
  | 'lifts'
  | 'benchmarks'
  | 'health'
  | 'study'
  | 'reviews'

// Stores keyed by `date` (one record per day).
export type DateStore = 'prehab' | 'routine' | 'checklist'

export async function getAll<T>(store: ListStore | DateStore): Promise<T[]> {
  const db = await getDB()
  return (await db.getAll(store as never)) as T[]
}

export async function putRecord<T>(store: ListStore | DateStore, value: T): Promise<void> {
  const db = await getDB()
  await db.put(store as never, value as never)
}

export async function deleteRecord(
  store: ListStore | DateStore,
  key: string,
): Promise<void> {
  const db = await getDB()
  await db.delete(store as never, key)
}

export const SETTINGS_KEY = 'app'

export async function loadSettings(): Promise<(Settings & { id: string }) | undefined> {
  const db = await getDB()
  return db.get('settings', SETTINGS_KEY)
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDB()
  await db.put('settings', { ...settings, id: SETTINGS_KEY })
}

// ── Bulk export / import (the only safety net for local-only data) ──
type StoreName =
  | 'sessions'
  | 'adjustments'
  | 'lifts'
  | 'benchmarks'
  | 'prehab'
  | 'routine'
  | 'health'
  | 'study'
  | 'reviews'
  | 'checklist'
  | 'settings'
const ALL_STORES: StoreName[] = [
  'sessions',
  'adjustments',
  'lifts',
  'benchmarks',
  'prehab',
  'routine',
  'health',
  'study',
  'reviews',
  'checklist',
  'settings',
]

export interface BackupBlob {
  app: 'wsop-console'
  version: number
  exportedAt: string
  data: Record<string, unknown[]>
}

export async function exportAll(exportedAt: string): Promise<BackupBlob> {
  const db = await getDB()
  const data: Record<string, unknown[]> = {}
  for (const store of ALL_STORES) {
    data[store] = await db.getAll(store)
  }
  return { app: 'wsop-console', version: DB_VERSION, exportedAt, data }
}

export async function importAll(blob: BackupBlob): Promise<void> {
  if (blob?.app !== 'wsop-console') {
    throw new Error('Not a WSOP Console backup file.')
  }
  const db = await getDB()
  const tx = db.transaction(ALL_STORES, 'readwrite')
  for (const store of ALL_STORES) {
    const rows = blob.data?.[store]
    if (!Array.isArray(rows)) continue
    const os = tx.objectStore(store)
    await os.clear()
    for (const row of rows) await os.put(row as never)
  }
  await tx.done
}
