import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { useToast } from '../components/Toast'
import { exportAll, importAll, getAll, type BackupBlob } from '../db/idb'
import { PHASES } from '../db/seed'
import { sessionsToCSV } from '../engine/csv'
import { nowISO, daysSince } from '../engine/format'

const BACKUP_STALE_DAYS = 14
import { pushSupported, isSubscribed, enablePush, disablePush } from '../push'

export function SettingsScreen() {
  const { settings, sessions, updateSettings, reloadAll, sync, syncState, lastSyncAt } = useStore()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const supported = pushSupported()
  useEffect(() => {
    void isSubscribed().then(setPushOn)
  }, [])

  const [counts, setCounts] = useState<{ label: string; n: number }[]>([])
  useEffect(() => {
    const stores = [
      ['sessions', 'Sessions'], ['adjustments', 'Adjustments'], ['expenses', 'Expenses'], ['health', 'Health logs'],
      ['lifts', 'Lifts'], ['benchmarks', 'Benchmarks'], ['study', 'Study logs'],
      ['reviews', 'Reviews'], ['routine', 'Routine days'],
    ] as const
    void Promise.all(stores.map(([s]) => getAll(s as never))).then((res) =>
      setCounts(stores.map(([, label], i) => ({ label, n: (res[i] as unknown[]).length }))),
    )
  }, [])

  const togglePush = async () => {
    setPushBusy(true)
    try {
      if (pushOn) {
        await disablePush()
        setPushOn(false)
        toast('Push disabled')
      } else {
        const r = await enablePush()
        if (r === 'ok') {
          setPushOn(true)
          toast('Push enabled — nudges will fire')
        } else if (r === 'denied') {
          toast('Notifications blocked — enable them for this site')
        } else if (r === 'unsupported') {
          toast('Push needs the installed app (iOS: Add to Home Screen)')
        } else {
          toast('Could not enable push')
        }
      }
    } finally {
      setPushBusy(false)
    }
  }

  const doExport = async () => {
    const blob = await exportAll(nowISO())
    const json = JSON.stringify(blob, null, 2)
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `wsop-console-backup-${nowISO().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    await updateSettings({ lastBackupAt: nowISO() })
    toast('Backup exported')
  }

  const doExportCSV = () => {
    if (sessions.length === 0) {
      toast('No sessions to export yet')
      return
    }
    const url = URL.createObjectURL(new Blob([sessionsToCSV(sessions)], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `wsop-sessions-${nowISO().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast('Sessions CSV exported')
  }

  const doImport = async (file: File) => {
    setBusy(true)
    try {
      const blob = JSON.parse(await file.text()) as BackupBlob
      await importAll(blob)
      await reloadAll()
      toast('Backup imported')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="screen">
      <h1 className="screen-title">Settings</h1>
      <div className="screen-sub">roll · rhythm · backup</div>

      <div className="card">
        <div className="card-label" style={{ marginBottom: 12 }}>Bankroll</div>
        <div className="field">
          <label>Starting roll</label>
          <input
            className="input"
            type="number"
            value={settings.startingRoll}
            onChange={(e) => updateSettings({ startingRoll: Number(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-label" style={{ marginBottom: 12 }}>Rhythm anchors</div>
        <div className="field-row">
          <div className="field">
            <label>Wake</label>
            <input
              className="input"
              type="time"
              value={settings.wakeTime}
              onChange={(e) => updateSettings({ wakeTime: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Cap (wind-down)</label>
            <input
              className="input"
              type="time"
              value={settings.capTime}
              onChange={(e) => updateSettings({ capTime: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Caffeine cutoff</label>
            <input
              className="input"
              type="time"
              value={settings.caffeineCutoff}
              onChange={(e) => updateSettings({ caffeineCutoff: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-label" style={{ marginBottom: 12 }}>Phase override</div>
        <div className="field">
          <label>Force a phase (for preview / off-schedule)</label>
          <select
            className="select"
            value={settings.phaseOverride ?? ''}
            onChange={(e) =>
              updateSettings({
                phaseOverride: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          >
            <option value="">Auto (by date)</option>
            {PHASES.map((p) => (
              <option key={p.id} value={p.id}>
                Phase {p.id} — {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          Phase dates come from the real plan schedule. Override to preview a phase today.
        </div>
      </div>

      <div className="card">
        <div className="row-split">
          <div>
            <div className="card-label" style={{ marginBottom: 4 }}>Cross-device sync</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {syncState === 'syncing'
                ? 'Syncing…'
                : syncState === 'error'
                  ? 'Sync failed — retries automatically. Check you’re online.'
                  : lastSyncAt
                    ? `Synced ${daysSince(lastSyncAt) === 0 ? 'today' : `${daysSince(lastSyncAt)}d ago`} · ${new Date(lastSyncAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                    : 'Not synced yet. Runs on open, on focus, and after edits.'}
            </div>
          </div>
          <button
            className="btn"
            disabled={syncState === 'syncing'}
            onClick={() => void sync()}
            style={{ flex: '0 0 auto' }}
          >
            {syncState === 'syncing' ? '…' : '⟳ Sync now'}
          </button>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Your data syncs across devices through your gated server. Local-first — the app works
          offline and reconciles when it reconnects.
        </div>
      </div>

      <div className="card">
        <div className="card-label" style={{ marginBottom: 12 }}>Backup (export / import)</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          All data lives local-first on this device. Export regularly — it’s the
          only safety net.
        </div>
        {(() => {
          const since = daysSince(settings.lastBackupAt)
          const stale = since == null || since >= BACKUP_STALE_DAYS
          const label =
            since == null
              ? 'Never backed up — export now to start the safety net.'
              : since === 0
                ? 'Last backup: today.'
                : `Last backup: ${since} day${since === 1 ? '' : 's'} ago${
                    stale ? ' — overdue, export now.' : '.'
                  }`
          return (
            <div
              className="backup-status"
              style={{
                fontSize: 13,
                marginBottom: 12,
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${stale ? 'var(--bad)' : 'var(--line)'}`,
                color: stale ? 'var(--bad)' : 'var(--muted)',
              }}
            >
              {stale ? '⚠ ' : '✓ '}
              {label}
            </div>
          )
        })()}
        <div className="field-row">
          <button className="btn btn-block" onClick={doExport} disabled={busy}>
            ↓ Export JSON
          </button>
          <button
            className="btn btn-block"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            ↑ Import JSON
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void doImport(f)
          }}
        />
        <button className="btn btn-ghost btn-block" onClick={doExportCSV} style={{ marginTop: 10 }}>
          ⊞ Export sessions CSV (for the CPA / spreadsheet)
        </button>
      </div>

      <div className="card">
        <div className="row-split">
          <div>
            <div className="card-label" style={{ marginBottom: 4 }}>
              Push notifications
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {supported
                ? pushOn
                  ? 'On — the ramped daily nudges fire on your phone.'
                  : 'Get the daily nudges as phone notifications. (They also mirror into Today.)'
                : 'Needs the installed app — on iOS, Add to Home Screen first, then enable here.'}
            </div>
          </div>
          <button
            className={`btn ${pushOn ? 'btn-danger' : 'btn-primary'}`}
            disabled={!supported || pushBusy}
            onClick={togglePush}
          >
            {pushBusy ? '…' : pushOn ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>

      {counts.length > 0 && (
        <div className="card">
          <div className="card-label" style={{ marginBottom: 10 }}>Your data</div>
          {counts.map((c) => (
            <div key={c.label} className="hl-row" style={{ padding: '4px 0', borderBottom: 'none' }}>
              <span className="muted">{c.label}</span>
              <span className="mono">{c.n}</span>
            </div>
          ))}
          <div className="divider" />
          <div className="hl-row" style={{ borderBottom: 'none' }}>
            <span style={{ fontWeight: 600 }}>Total records</span>
            <span className="mono" style={{ fontWeight: 700 }}>{counts.reduce((a, c) => a + c.n, 0)}</span>
          </div>
        </div>
      )}

      <div
        className="mono"
        style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 11, marginTop: 18 }}
      >
        WSOP 2027 Console · build {__BUILD_ID__}
      </div>
    </div>
  )
}
