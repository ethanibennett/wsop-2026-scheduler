import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  wakeTime: '07:00',
  capTime: '23:00',
  caffeineCutoff: '14:00',
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

interface StoreApi extends StoreData {
  // generic id-keyed list mutations
  put: <T extends { id?: string; date?: string }>(store: ListStore, value: T) => Promise<void>
  remove: (store: ListStore, id: string) => Promise<void>
  // date-keyed (one per day) mutations
  putByDate: <T extends { date: string }>(store: DateStore, value: T) => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  reloadAll: () => Promise<void>
}

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

  useEffect(() => {
    void reloadAll()
  }, [reloadAll])

  const put = useCallback(
    async (store: ListStore, value: { id?: string }) => {
      await putRecord(store, value)
      await reloadAll()
    },
    [reloadAll],
  )

  const remove = useCallback(
    async (store: ListStore, id: string) => {
      await deleteRecord(store, id)
      await reloadAll()
    },
    [reloadAll],
  )

  const putByDate = useCallback(
    async (store: DateStore, value: { date: string }) => {
      await putRecord(store, value)
      await reloadAll()
    },
    [reloadAll],
  )

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...data.settings, ...patch }
      await saveSettings(next)
      setData((d) => ({ ...d, settings: next }))
    },
    [data.settings],
  )

  const api = useMemo<StoreApi>(
    () => ({ ...data, put, remove, putByDate, updateSettings, reloadAll }),
    [data, put, remove, putByDate, updateSettings, reloadAll],
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
