import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  getAll,
  putRecord,
  deleteRecord,
  loadSettings,
  saveSettings,
  type ListStore,
  type DateStore,
} from './db/idb'
import { runSync } from './db/syncClient'
import type {
  Session,
  BankrollAdjustment,
  RoutineLog,
  ReviewEntry,
  ChecklistTick,
  Settings,
} from './db/types'

const DEFAULT_SETTINGS: Settings = {
  startingRoll: 50000,
  wakeTime: '10:00', // the real anchor clock (wake 10:00 / cap 01:30 / caffeine 18:00)
  capTime: '01:30',
  caffeineCutoff: '18:00',
}

interface StoreData {
  ready: boolean
  sessions: Session[]
  adjustments: BankrollAdjustment[]
  routine: RoutineLog[]
  reviews: ReviewEntry[]
  checklist: ChecklistTick[]
  settings: Settings
}

export type SyncState = 'idle' | 'syncing' | 'ok' | 'error'

interface StoreApi extends StoreData {
  // generic id-keyed list mutations
  put: <T extends { id?: string; date?: string }>(store: ListStore, value: T) => Promise<void>
  remove: (store: ListStore, id: string) => Promise<void>
  // date-keyed (one per day) mutations
  putByDate: <T extends { date: string }>(store: DateStore, value: T) => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  reloadAll: () => Promise<void>
  // cross-device sync
  sync: () => Promise<void>
  syncState: SyncState
  lastSyncAt: string | null
}

const LAST_SYNC_KEY = 'wsop-last-sync'

const Ctx = createContext<StoreApi | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StoreData>({
    ready: false,
    sessions: [],
    adjustments: [],
    routine: [],
    reviews: [],
    checklist: [],
    settings: DEFAULT_SETTINGS,
  })

  const reloadAll = useCallback(async () => {
    const [sessions, adjustments, routine, reviews, checklist, settings] =
      await Promise.all([
        getAll<Session>('sessions'),
        getAll<BankrollAdjustment>('adjustments'),
        getAll<RoutineLog>('routine'),
        getAll<ReviewEntry>('reviews'),
        getAll<ChecklistTick>('checklist'),
        loadSettings(),
      ])
    setData({
      ready: true,
      sessions: sessions.sort((a, b) => b.date.localeCompare(a.date)),
      adjustments: adjustments.sort((a, b) => b.date.localeCompare(a.date)),
      routine,
      reviews: reviews.sort((a, b) => b.date.localeCompare(a.date)),
      checklist,
      settings: settings ? stripId(settings) : DEFAULT_SETTINGS,
    })
  }, [])

  // ── Cross-device sync ──
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => localStorage.getItem(LAST_SYNC_KEY))
  const syncing = useRef(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sync = useCallback(async () => {
    if (syncing.current) return
    syncing.current = true
    setSyncState('syncing')
    const r = await runSync()
    syncing.current = false
    if (r.ok) {
      if (r.applied > 0) await reloadAll() // remote changes landed → refresh UI
      const now = new Date().toISOString()
      localStorage.setItem(LAST_SYNC_KEY, now)
      setLastSyncAt(now)
      setSyncState('ok')
    } else {
      setSyncState('error')
    }
  }, [reloadAll])

  // Debounced sync after local mutations (batches a burst of edits).
  const scheduleSync = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => void sync(), 2500)
  }, [sync])

  useEffect(() => {
    void reloadAll()
  }, [reloadAll])

  // Sync on first load, on focus, and on a 2-min backstop (catches writes that
  // go through putRecord directly, e.g. Today's checklist / live session).
  useEffect(() => {
    void sync()
    const onFocus = () => void sync()
    const onVis = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)
    const interval = setInterval(() => void sync(), 120_000)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
      clearInterval(interval)
    }
  }, [sync])

  const put = useCallback(
    async (store: ListStore, value: { id?: string }) => {
      await putRecord(store, value)
      await reloadAll()
      scheduleSync()
    },
    [reloadAll, scheduleSync],
  )

  const remove = useCallback(
    async (store: ListStore, id: string) => {
      await deleteRecord(store, id)
      await reloadAll()
      scheduleSync()
    },
    [reloadAll, scheduleSync],
  )

  const putByDate = useCallback(
    async (store: DateStore, value: { date: string }) => {
      await putRecord(store, value)
      await reloadAll()
      scheduleSync()
    },
    [reloadAll, scheduleSync],
  )

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...data.settings, ...patch }
      await saveSettings(next)
      setData((d) => ({ ...d, settings: next }))
      scheduleSync()
    },
    [data.settings, scheduleSync],
  )

  const api = useMemo<StoreApi>(
    () => ({ ...data, put, remove, putByDate, updateSettings, reloadAll, sync, syncState, lastSyncAt }),
    [data, put, remove, putByDate, updateSettings, reloadAll, sync, syncState, lastSyncAt],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

function stripId(s: Settings & { id: string }): Settings {
  const { id: _id, ...rest } = s
  return rest
}

export function useStore(): StoreApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
