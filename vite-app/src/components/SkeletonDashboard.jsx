import React from 'react';

export default function SkeletonDashboard() {
  return (
    <div className="dashboard-view" style={{gap: 16}}>
      <div className="dashboard-section">
        <div className="dashboard-section-header">
          <div className="skeleton skeleton-text" style={{width: 80, height: 14}} />
        </div>
        <div className="skeleton skeleton-card" style={{height: 180}}>
          <div className="skeleton-strip skeleton" style={{width: '100%'}} />
          <div className="skeleton-row">
            <div className="skeleton skeleton-text lg" />
          </div>
          <div className="skeleton-row" style={{gap: 6}}>
            <div className="skeleton skeleton-text sm" />
            <div className="skeleton skeleton-text sm" />
          </div>
          <div className="skeleton skeleton-btn" style={{width: '100%', background: 'transparent'}} />
        </div>
      </div>
      <div className="dashboard-section">
        <div className="dashboard-section-header">
          <div className="skeleton skeleton-text" style={{width: 70, height: 14}} />
        </div>
        <div className="skeleton" style={{height: 60, borderRadius: 'var(--radius-sm)'}} />
      </div>
      <div className="dashboard-section">
        <div className="dashboard-section-header">
          <div className="skeleton skeleton-text" style={{width: 100, height: 14}} />
        </div>
        <div className="skeleton" style={{height: 60, borderRadius: 'var(--radius-sm)'}} />
      </div>
    </div>
  );
}
