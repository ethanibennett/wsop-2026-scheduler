import React from 'react';
import Icon from './Icon.jsx';

export default function MoreView({ onNavigate, onExport, hasSchedule, isAdmin, handReplayerAccess }) {
  return (
    <div className="more-menu">
      <button className="more-menu-item" onClick={() => onNavigate('schedule')}>
        <Icon.user />
        <div>
          My Schedule
          <div className="menu-item-desc">View your saved events</div>
        </div>
      </button>
      <button className="more-menu-item" onClick={() => onNavigate('tracking')}>
        <Icon.tracking />
        <div>
          Results & Tracking
          <div className="menu-item-desc">Log buy-ins, cashes, and track your P&L</div>
        </div>
      </button>
      <button className="more-menu-item" onClick={() => onNavigate('calendar')}>
        <Icon.calendar />
        <div>
          Calendar View
          <div className="menu-item-desc">See your schedule day by day</div>
        </div>
      </button>
      {(handReplayerAccess || isAdmin) && (
      <button className="more-menu-item" onClick={() => onNavigate('hands')}>
        <Icon.cards />
        <div>
          Hand Replayer
          <div className="menu-item-desc">Record and replay poker hands</div>
        </div>
      </button>
      )}
      <button className="more-menu-item" onClick={onExport} disabled={!hasSchedule} style={!hasSchedule ? {opacity:0.4, cursor:'default'} : undefined}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <div>
          Export Schedule
          <div className="menu-item-desc">{hasSchedule ? 'Download PDF or share images of your schedule' : 'Save events to your schedule first'}</div>
        </div>
      </button>
      <button className="more-menu-item" onClick={() => onNavigate('settings')}>
        <Icon.gear />
        <div>
          Settings
          <div className="menu-item-desc">Account, sharing, appearance</div>
        </div>
      </button>
      <button className="more-menu-item" onClick={() => { window.location.reload(); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
        </svg>
        <div>
          Refresh
          <div className="menu-item-desc">Reload the app and fetch latest data</div>
        </div>
      </button>
      {isAdmin && (
        <button className="more-menu-item" onClick={() => onNavigate('admin')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
          <div>
            Admin
            <div className="menu-item-desc">User accounts & management</div>
          </div>
        </button>
      )}
    </div>
  );
}
