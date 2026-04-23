import React from 'react';
import Icon from './Icon.jsx';
import { haptic } from '../utils/utils.js';

export default function BottomNav({ current, onChange, scheduleCount, newShareCount }) {
  const tabs = [
    { id: 'tournaments', label: 'Schedule', icon: Icon.calendar },
    { id: 'social', label: 'Social', icon: Icon.people },
    { id: 'dashboard', label: 'Dashboard', icon: Icon.home, center: true },
    { id: 'staking', label: 'Staking', icon: Icon.handshake },
    { id: 'more', label: 'More', icon: Icon.dots },
  ];

  return (
    <nav className="bottom-nav">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`nav-tab ${current === tab.id ? 'active' : ''}${tab.center ? ' nav-tab-center' : ''}`}
          onClick={() => { haptic(10); onChange(tab.id); }}
          style={{position:'relative'}}
        >
          <tab.icon />
          {tab.label}
          {tab.badge > 0 && (
            <span style={{
              position:'absolute', top:'4px', right:'50%', marginRight:'-16px',
              background:'#ef4444', color:'#fff', fontSize:'0.55rem', fontWeight:700,
              width:'14px', height:'14px', borderRadius:'50%',
              display:'flex', alignItems:'center', justifyContent:'center',
              lineHeight:1
            }}>{tab.badge}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
