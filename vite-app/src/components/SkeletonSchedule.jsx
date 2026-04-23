import React from 'react';

export default function SkeletonSchedule() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
      {[0,1,2].map(g => (
        <div key={g}>
          <div style={{display: 'flex', alignItems: 'baseline', gap: 4, padding: '12px 12px 8px 2px'}}>
            <div className="skeleton" style={{width: 30, height: 24, borderRadius: 4}} />
            <div className="skeleton skeleton-text" style={{width: 28, height: 12}} />
          </div>
          {[0,1,2].map(i => (
            <div key={i} className="skeleton" style={{height: 52, marginBottom: 4, borderRadius: 'var(--radius-sm)'}} />
          ))}
        </div>
      ))}
    </div>
  );
}
