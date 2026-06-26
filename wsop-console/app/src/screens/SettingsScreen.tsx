import { useRef, useState } from 'react'
import { useStore } from '../store'
import { useToast } from '../components/Toast'
import { exportAll, importAll, type BackupBlob } from '../db/idb'
import { PHASES } from '../db/seed'
import { nowISO } from '../engine/format'

export function SettingsScreen() {
  const { settings, updateSettings, reloadAll } = useStore()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const doExport = async () => {
    const blob = await exportAll(nowISO())
    const json = JSON.stringify(blob, null, 2)
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `wsop-console-backup-${nowISO().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast('Backup exported')
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
        <div className="card-label" style={{ marginBottom: 12 }}>Backup (export / import)</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          All data lives local-first on this device. Export regularly — it’s the
          only safety net.
        </div>
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
      </div>

      <div className="placeholder-note">
        <strong>Push notifications</strong> (M2) plug in here — stand up the
        <code> push-service/</code> (web-push + VAPID + node-cron from the zip)
        and add an enable toggle. Nudges already mirror into Today, so the app
        works without push.
      </div>
    </div>
  )
}
