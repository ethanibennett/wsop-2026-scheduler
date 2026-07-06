// Phase B — sync the localStorage-backed state (Home lists, balances, presets,
// admin checklist, staking, intentions). Each key is a record in a synthetic
// 'local' store; a companion meta map stamps updatedAt so last-write-wins
// applies. Values are always whole-blob overwrites (features write empty
// arrays/objects rather than removing keys), so no tombstones are needed here.

import type { SyncRecord } from './sync'
import { useCallback, useEffect, useState } from 'react'

export const LOCAL_STORE = 'local'
const META_KEY = 'wsop-local-meta' // { [key]: updatedAt }
export const LOCAL_UPDATED_EVENT = 'wsop-local-updated'

// The keys that sync. Deliberately excludes device-local state: the live
// session (you play on one device), climb-seen (celebration UI), and the
// sync bookkeeping itself.
export const SYNCED_LOCAL_KEYS = [
  'wsop-home-done',
  'wsop-home-regular',
  'wsop-home-backlog',
  'wsop-admin-checklist',
  'wsop-admin-taxrate',
  'wsop-staking',
  'wsop-balances',
  'wsop-nut-shop',
  'wsop-session-presets',
  'wsop-intention',
  'wsop-notified-sessions',
]

function readMeta(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || '{}')
  } catch {
    return {}
  }
}
function writeMeta(m: Record<string, number>): void {
  localStorage.setItem(META_KEY, JSON.stringify(m))
}

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/** Write a synced key (stamps updatedAt). Own writes update React state
 *  directly, so this does NOT fire the update event (only remote-apply does). */
export function writeLocal<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
  const m = readMeta()
  m[key] = Date.now()
  writeMeta(m)
}

/** All synced localStorage keys as SyncRecords for the full-state push. */
export function collectLocalRecords(): SyncRecord[] {
  const meta = readMeta()
  const out: SyncRecord[] = []
  for (const key of SYNCED_LOCAL_KEYS) {
    const raw = localStorage.getItem(key)
    if (raw == null) continue
    out.push({ store: LOCAL_STORE, id: key, data: raw, updatedAt: meta[key] ?? 0 })
  }
  return out
}

/** Apply remote 'local' records; returns how many changed and notifies UI. */
export function applyLocalRecords(records: SyncRecord[]): number {
  const meta = readMeta()
  let changed = 0
  for (const r of records) {
    if (r.store !== LOCAL_STORE || !SYNCED_LOCAL_KEYS.includes(r.id)) continue
    if (r.data == null) {
      localStorage.removeItem(r.id)
    } else {
      localStorage.setItem(r.id, r.data)
    }
    meta[r.id] = r.updatedAt
    changed++
  }
  if (changed) {
    writeMeta(meta)
    window.dispatchEvent(new Event(LOCAL_UPDATED_EVENT))
  }
  return changed
}

/**
 * A synced-localStorage state hook: like useState but persisted + stamped, and
 * it re-reads when a remote sync updates the key underneath.
 */
export function useSyncedLocal<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => readLocal(key, fallback))
  useEffect(() => {
    const h = () => setVal(readLocal(key, fallback))
    window.addEventListener(LOCAL_UPDATED_EVENT, h)
    return () => window.removeEventListener(LOCAL_UPDATED_EVENT, h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const set = useCallback(
    (v: T) => {
      setVal(v)
      writeLocal(key, v)
    },
    [key],
  )
  return [val, set]
}
