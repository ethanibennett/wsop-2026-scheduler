import React from 'react';

// Shared playing-card chip for the solver views. Matches the app's
// suit colors (see HandReplayerView) and uses theme CSS variables.

const SUIT_GLYPHS = { h: '♥', d: '♦', c: '♣', s: '♠' };
const SUIT_COLORS = { h: '#ef4444', d: '#3b82f6', c: '#22c55e', s: '#a78bfa' };

export default function SolverCard({ str, faceDown, dim, size = 'md' }) {
  const dims = size === 'sm'
    ? { w: 28, h: 38, r: '0.8rem', s: '0.62rem' }
    : { w: 34, h: 46, r: '0.95rem', s: '0.8rem' };

  if (faceDown) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: dims.w, height: dims.h, borderRadius: 6, margin: '0 2px',
        background: 'repeating-linear-gradient(45deg, var(--surface-alt, #2a2a33), var(--surface-alt, #2a2a33) 4px, var(--border) 4px, var(--border) 5px)',
        border: '1px solid var(--border)', fontSize: '0.7rem', color: 'var(--text-muted)',
      }}>?</span>
    );
  }
  const rank = str[0], suit = str[1];
  return (
    <span style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: dims.w, height: dims.h, borderRadius: 6, margin: '0 2px',
      background: 'var(--surface)',
      border: '1px solid ' + (dim ? 'var(--border)' : 'var(--text-muted)'),
      opacity: dim ? 0.78 : 1,
      fontWeight: 700, fontSize: dims.r, color: SUIT_COLORS[suit], lineHeight: 1,
    }}>
      <span>{rank}</span>
      <span style={{ fontSize: dims.s }}>{SUIT_GLYPHS[suit]}</span>
    </span>
  );
}
