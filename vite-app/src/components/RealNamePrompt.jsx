import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { API_URL } from '../utils/api.js';

export default function RealNamePrompt({ onSave, onDismiss, token }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true); setErr('');
    try {
      const res = await fetch(`${API_URL}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ realName: name.trim() })
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'Failed to save'); setSaving(false); return; }
      onSave(data.realName);
    } catch (e) { console.error('Profile save:', e); setErr('Network error'); setSaving(false); }
  };

  return ReactDOM.createPortal(
    <div className="modal-backdrop" onClick={onDismiss}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '380px' }}>
        <h3 style={{ marginBottom: '4px' }}>What's your name?</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
          Your connections and group members will see this.
        </p>
        {err && <div className="alert alert-error" style={{ marginBottom: '12px' }}>{err}</div>}
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Your real name"
          maxLength={40}
          autoFocus
          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.95rem', boxSizing: 'border-box' }}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) handleSave(); }}
        />
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onDismiss}>Later</button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
