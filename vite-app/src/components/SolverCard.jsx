import React from 'react';

// Shared playing-card for the solver views. Renders the same card-face
// SVGs the Hand Replayer uses (/cards/cards_gui_<rank><suit>.svg) so the
// solver shows hands graphically and consistently with the replayer.
// Card strings match the asset names directly: 'Ah' -> cards_gui_Ah.svg.

export default function SolverCard({ str, faceDown, dim, size = 'md', raised }) {
  const h = size === 'sm' ? 34 : size === 'lg' ? 56 : 44;
  // stud upcards sit raised above the hole cards, matching the replayer's board layout
  const raise = raised ? 'translateY(-11px)' : undefined;

  if (faceDown || !str) {
    return (
      <span style={{
        display: 'inline-block', height: h, width: Math.round(h * 0.7),
        borderRadius: Math.round(h * 0.09), margin: '0 1.5px', verticalAlign: 'middle', transform: raise,
        background: 'repeating-linear-gradient(45deg, var(--accent), var(--accent) 4px, color-mix(in srgb, var(--accent) 60%, #000) 4px, color-mix(in srgb, var(--accent) 60%, #000) 8px)',
        border: '1px solid rgba(255,255,255,0.25)', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
      }} />
    );
  }

  return (
    <img
      className="card-img"
      src={`/cards/cards_gui_${str}.svg`}
      alt={str}
      loading="eager"
      style={{
        height: h, width: 'auto', margin: '0 1.5px', verticalAlign: 'middle', transform: raise,
        borderRadius: Math.round(h * 0.09),
        opacity: dim ? 0.5 : 1,
        filter: dim ? 'grayscale(0.4)' : 'none',
        boxShadow: dim ? 'none' : '0 1px 3px rgba(0,0,0,0.35)',
      }}
    />
  );
}
