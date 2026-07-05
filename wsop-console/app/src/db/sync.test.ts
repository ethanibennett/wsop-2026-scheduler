import { describe, it, expect } from 'vitest'
import { recKey, toMap, recordsToApply, mergeInto, type SyncRecord } from './sync'

const r = (store: string, id: string, updatedAt: number, extra: Partial<SyncRecord> = {}): SyncRecord => ({
  store, id, data: `{"v":${updatedAt}}`, updatedAt, ...extra,
})

describe('recordsToApply (client: apply remote over local)', () => {
  it('applies strictly-newer remote records only', () => {
    const local = toMap([r('sessions', 'a', 5), r('sessions', 'b', 3)])
    const remote = [
      r('sessions', 'a', 4), // older → skip
      r('sessions', 'b', 3), // equal → skip
      r('sessions', 'c', 1), // new → apply
      r('health', 'x', 9), // new store → apply
    ]
    const apply = recordsToApply(local, remote)
    expect(apply.map((x) => x.id).sort()).toEqual(['c', 'x'])
  })
  it('applies a newer tombstone (remote delete wins)', () => {
    const local = toMap([r('adjustments', 'a', 2)])
    const remote = [{ store: 'adjustments', id: 'a', data: null, updatedAt: 5, deleted: true }]
    expect(recordsToApply(local, remote)).toHaveLength(1)
  })
  it('ignores a stale tombstone (local edit is newer)', () => {
    const local = toMap([r('adjustments', 'a', 9)])
    const remote = [{ store: 'adjustments', id: 'a', data: null, updatedAt: 5, deleted: true }]
    expect(recordsToApply(local, remote)).toHaveLength(0)
  })
})

describe('mergeInto (server: fold pushed into stored)', () => {
  it('keeps the newest, idempotent on equal timestamps', () => {
    const stored = toMap([r('sessions', 'a', 5)])
    const merged = mergeInto(stored, [r('sessions', 'a', 5), r('sessions', 'a', 7), r('sessions', 'b', 1)])
    expect(merged.get(recKey('sessions', 'a'))!.updatedAt).toBe(7)
    expect(merged.get(recKey('sessions', 'b'))!.updatedAt).toBe(1)
  })
  it('a delete tombstone supersedes an older record', () => {
    const stored = toMap([r('expenses', 'e', 3)])
    const merged = mergeInto(stored, [{ store: 'expenses', id: 'e', data: null, updatedAt: 8, deleted: true }])
    expect(merged.get(recKey('expenses', 'e'))!.deleted).toBe(true)
  })
})

describe('recKey', () => {
  it('separates store and id without collision', () => {
    expect(recKey('sessions', 'a')).not.toBe(recKey('session', 'sa'))
  })
})
