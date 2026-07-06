// Cross-device sync client — full-state push/merge/apply against the gated
// /console/api/sync endpoint. Local-first: this only reconciles; the app never
// waits on it to write. Requests carry the Basic-Auth cookie the browser
// already holds for /console, so no credentials live in JS.

import { collectSyncRecords, applySyncRecords } from './idb'
import { collectLocalRecords, applyLocalRecords, LOCAL_STORE } from './syncLocal'
import { recordsToApply, toMap, type SyncRecord } from './sync'

export type SyncOutcome =
  | { ok: true; pushed: number; applied: number }
  | { ok: false; error: string }

const SYNC_URL = '/console/api/sync'

export async function runSync(): Promise<SyncOutcome> {
  let local: SyncRecord[]
  try {
    local = [...(await collectSyncRecords()), ...collectLocalRecords()]
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'collect failed' }
  }

  let remote: SyncRecord[]
  try {
    const res = await fetch(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ records: local }),
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const json = (await res.json()) as { records?: SyncRecord[] }
    remote = Array.isArray(json.records) ? json.records : []
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' }
  }

  const apply = recordsToApply(toMap(local), remote)
  if (apply.length) {
    try {
      await applySyncRecords(apply.filter((r) => r.store !== LOCAL_STORE)) // IndexedDB
      applyLocalRecords(apply.filter((r) => r.store === LOCAL_STORE)) // localStorage
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'apply failed' }
    }
  }
  return { ok: true, pushed: local.length, applied: apply.length }
}
