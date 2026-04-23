import React from 'react';
import ReactDOM from 'react-dom';
import { drawMilestoneImage, shareOrDownloadCanvas } from '../utils/export.js';

export default function MilestoneCelebration({ milestone, onShare, onDismiss }) {
  if (!milestone) return null;

  const icons = {
    'break-even': '\u2696\uFE0F',
    'first-profit': '\uD83D\uDCB0',
    'career-high': '\uD83C\uDFC6',
    'game-best': '\uD83C\uDFAF'
  };

  const handleShare = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    drawMilestoneImage(ctx, 1080, 1080, milestone);
    await shareOrDownloadCanvas(canvas, 'milestone.png');
    if (onShare) onShare();
  };

  return ReactDOM.createPortal(
    <div className="milestone-modal-backdrop" onClick={onDismiss}>
      <div className="milestone-modal" onClick={e => e.stopPropagation()}>
        <div className="milestone-icon">{icons[milestone.type] || '\u2B50'}</div>
        <div className="milestone-title">{milestone.title}</div>
        <div className="milestone-desc">{milestone.description}</div>
        {milestone.value && (
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#22c55e', fontFamily: "'Univers Condensed','Univers',sans-serif", marginBottom: '16px' }}>
            {milestone.value}
          </div>
        )}
        <div className="milestone-actions">
          <button className="btn btn-primary btn-sm" onClick={handleShare}>Share</button>
          <button className="btn btn-ghost btn-sm" onClick={onDismiss}>Dismiss</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
