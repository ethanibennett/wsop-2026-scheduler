import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import Icon from './Icon.jsx';
import Avatar from './Avatar.jsx';
import CalendarEventRow from './CalendarEventRow.jsx';
import ScheduleExportModal from './ScheduleExportModal.jsx';
import {
  getVenueInfo, normaliseDate, getToday, fmtShortDate, formatBuyin, currencySymbol,
  parseTournamentTime, findClosestFlight, extractConditions, detectConflicts,
  measureStickyStack,
} from '../utils/utils.js';
import { useDisplayName } from '../contexts/DisplayNameContext.jsx';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Travel Day Picker ──
function TravelDayPicker({ onSave, onCancel }) {
  const [date, setDate] = useState('');
  const [depHour, setDepHour] = useState(8);
  const [depMinute, setDepMinute] = useState(0);
  const [depAmPm, setDepAmPm] = useState('AM');
  const [arrHour, setArrHour] = useState(2);
  const [arrMinute, setArrMinute] = useState(0);
  const [arrAmPm, setArrAmPm] = useState('PM');
  const dateRef = useRef(null);

  const hours = [1,2,3,4,5,6,7,8,9,10,11,12];
  const minutes = [0, 15, 30, 45];
  const fmtTime = (h, m, ap) => `${h}:${String(m).padStart(2,'0')} ${ap}`;

  const handleSave = () => {
    if (!date) return;
    const notes = `Depart ${fmtTime(depHour, depMinute, depAmPm)} → Arrive ${fmtTime(arrHour, arrMinute, arrAmPm)}`;
    onSave(date, notes);
  };

  const selectStyle = {
    padding: '6px 4px', fontSize: '0.85rem', borderRadius: '6px',
    border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text)', outline: 'none', cursor: 'pointer',
    WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none',
    textAlign: 'center', minWidth: '44px'
  };

  const TimeSelector = ({ hour, minute, amPm, onHour, onMinute, onAmPm, label }) => (
    <div>
      <div style={{fontSize:'0.72rem', color:'var(--text-muted)', marginBottom:'4px', fontWeight:600}}>{label}</div>
      <div style={{display:'flex', gap:'3px', alignItems:'center'}}>
        <select value={hour} onChange={e => onHour(Number(e.target.value))} style={selectStyle}>
          {hours.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <span style={{color:'var(--text-muted)', fontWeight:700}}>:</span>
        <select value={minute} onChange={e => onMinute(Number(e.target.value))} style={selectStyle}>
          {minutes.map(m => <option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}
        </select>
        <select value={amPm} onChange={e => onAmPm(e.target.value)} style={{...selectStyle, minWidth:'50px'}}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '10px', padding: '14px', marginBottom: '12px'
    }}>
      <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px'}}>
        <span style={{fontSize:'1rem'}}>&#9992;&#65039;</span>
        <span style={{fontWeight:700, fontSize:'0.88rem', color:'var(--text)'}}>Add Travel Day</span>
      </div>
      <div style={{marginBottom:'14px'}}>
        <div style={{fontSize:'0.72rem', color:'var(--text-muted)', marginBottom:'4px', fontWeight:600}}>Date</div>
        <input ref={dateRef} type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{
            padding:'6px 10px', fontSize:'0.85rem', borderRadius:'6px',
            border:'1px solid var(--border)', background:'var(--surface)',
            color:'var(--text)', outline:'none', width:'100%', boxSizing:'border-box'
          }}
        />
      </div>
      <div style={{display:'flex', gap:'16px', marginBottom:'14px', flexWrap:'wrap'}}>
        <TimeSelector label="DEPART" hour={depHour} minute={depMinute} amPm={depAmPm}
          onHour={setDepHour} onMinute={setDepMinute} onAmPm={setDepAmPm} />
        <div style={{display:'flex', alignItems:'flex-end', paddingBottom:'2px'}}>
          <span style={{color:'var(--text-muted)', fontSize:'0.9rem'}}>&rarr;</span>
        </div>
        <TimeSelector label="ARRIVE" hour={arrHour} minute={arrMinute} amPm={arrAmPm}
          onHour={setArrHour} onMinute={setArrMinute} onAmPm={setArrAmPm} />
      </div>
      <div style={{display:'flex', gap:'8px', justifyContent:'flex-end'}}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}
          style={{fontSize:'0.8rem'}}>Cancel</button>
        <button className="btn btn-sm" onClick={handleSave}
          style={{
            fontSize:'0.8rem', background:'var(--accent)', color:'#fff',
            border:'none', borderRadius:'6px', padding:'6px 16px', cursor:'pointer',
            opacity: date ? 1 : 0.4
          }}
          disabled={!date}>Save</button>
      </div>
    </div>
  );
}


export default function ScheduleView({
  mySchedule, onToggle, shareBuddies, pendingIncoming, lastSeenShares,
  onAcceptRequest, onRejectRequest, token, onSetCondition, onRemoveCondition,
  allTournaments, onToggleAnchor, onSetPlannedEntries,
  onAddPersonalEvent, onUpdatePersonalEvent,
  buddyEvents, buddyLiveUpdates, onBuddySwap, isAdmin, onAdminEdit
}) {
  const displayName = useDisplayName();
  const { conflicts, expectedConflicts } = useMemo(() => detectConflicts(mySchedule), [mySchedule]);
  const scheduleIds = useMemo(() => new Set(mySchedule.map(t => t.id)), [mySchedule]);
  const todayRef = useRef(null);
  const hasScrolled = useRef(false);
  const dayOffDateRef = useRef(null);
  const schedHeaderRef = useRef(null);
  const [focusEventId, setFocusEventId] = useState(null);
  const [showTravelPicker, setShowTravelPicker] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [schedDateTop, setSchedDateTop] = useState(0);
  const [listVisible, setListVisible] = useState(false);
  const fabContainerRef = useRef(null);

  useEffect(() => {
    const measure = () => {
      if (!schedHeaderRef.current) return;
      // Match TournamentsView: measure the sticky element's intrinsic height
      // plus its (negative) margin-top. getBoundingClientRect drifts because
      // the header is sticky and reports a different bottom once it pins,
      // which leaves a gap between the page header and the date break.
      const el = schedHeaderRef.current;
      const h = el.offsetHeight;
      const mt = parseFloat(getComputedStyle(el).marginTop) || 0;
      setSchedDateTop(Math.max(0, h + mt));
    };
    measure();
    const t = setTimeout(measure, 60);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
    };
  }, []);

  const todayISO = getToday();

  const sorted = useMemo(() =>
    [...mySchedule].sort((a, b) => {
      const da = parseTournamentTime(a);
      const db = parseTournamentTime(b);
      return da - db;
    }), [mySchedule]);

  // Today/Next FAB — mirrors TournamentsView. Renders a button into
  // fabContainerRef, then toggles its `.visible` class based on whether
  // the target group is on screen.
  useEffect(() => {
    const container = document.querySelector('.content-area');
    if (!container) return;
    const hasTodayEvents = sorted.some(t => normaliseDate(t.date) === todayISO);
    const findTarget = () => {
      if (hasTodayEvents) return container.querySelector('[data-today-scroll]');
      const groups = container.querySelectorAll('[data-date-group]');
      for (const g of groups) {
        if (g.getAttribute('data-date-group') >= todayISO) return g;
      }
      return groups.length ? groups[groups.length - 1] : null;
    };
    const fabLabel = hasTodayEvents ? 'Today' : 'Next';
    const fab = document.createElement('button');
    fab.className = 'back-to-today-fab';
    fab.dataset.dir = 'up';
    fab.innerHTML = '<svg class="fab-arrow-up" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polyline points="18 15 12 9 6 15"/></svg><svg class="fab-arrow-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polyline points="6 9 12 15 18 9"/></svg>' + fabLabel;
    fab.addEventListener('click', () => {
      const target = findTarget();
      if (!target) return;
      const stickyEl = container.querySelector('.schedule-sticky-header');
      const stickyH = stickyEl ? stickyEl.getBoundingClientRect().bottom - container.getBoundingClientRect().top : 0;
      const groupAbsTop = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
      container.scrollTo({ top: Math.max(0, groupAbsTop - stickyH), behavior: 'smooth' });
    });
    if (fabContainerRef.current) fabContainerRef.current.appendChild(fab);
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const target = findTarget();
        if (!target) { fab.classList.remove('visible'); return; }
        const rect = target.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const pastTarget = rect.bottom < containerRect.top + 120;
        const beforeTarget = rect.top > containerRect.bottom - 60;
        fab.dataset.dir = pastTarget ? 'up' : 'down';
        if (pastTarget || beforeTarget) fab.classList.add('visible');
        else fab.classList.remove('visible');
      });
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    requestAnimationFrame(() => onScroll());
    return () => {
      container.removeEventListener('scroll', onScroll);
      fab.remove();
    };
  }, [sorted, todayISO]);

  // Auto-scroll to today's date group. Mirrors TournamentsView's logic
  // exactly so the two views behave identically:
  //   groupAbsTop = group.top(relativeToContainer) + container.scrollTop
  //   container.scrollTop = groupAbsTop - sticky.visibleBottom
  // The RAF follow-up correction we used to have was double-bookkeeping
  // against the same sticky and could push the first date-break above the
  // viewport — removed.
  useLayoutEffect(() => {
    if (sorted.length === 0) { setListVisible(true); return; }
    if (hasScrolled.current) return;
    if (!todayRef.current) { setListVisible(true); return; }
    hasScrolled.current = true;
    const container = todayRef.current.closest('.content-area') || document.querySelector('.content-area');
    if (!container) { setListVisible(true); return; }
    const cRect = container.getBoundingClientRect();
    const sticky = container.querySelector('.schedule-sticky-header');
    const stickyBottom = sticky ? Math.max(0, sticky.getBoundingClientRect().bottom - cRect.top) : 0;
    const groupAbsTop = todayRef.current.getBoundingClientRect().top - cRect.top + container.scrollTop;
    container.scrollTop = Math.max(0, groupAbsTop - stickyBottom);
    setListVisible(true);
  }, [sorted]);

  function findBestFlightSchedule(eventNum, sat) {
    const flights = sorted.filter(t => t.event_number === eventNum);
    const best = findClosestFlight(flights, parseTournamentTime(sat));
    return best ? best.id : null;
  }

  return (
    <div>
      {pendingIncoming && pendingIncoming.length > 0 && (
        <div style={{marginBottom:'16px'}}>
          <div className="section-header">
            <h2>Share Requests</h2>
          </div>
          {pendingIncoming.map(req => (
            <div key={req.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',
              background:'var(--surface)',border:'1px solid var(--border)',
              borderRadius:'var(--radius-sm)',padding:'10px 12px',marginBottom:'8px',
              fontSize:'0.85rem',color:'var(--text)'}}>
              <span style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <Avatar src={req.avatar} username={req.username} size={26} />
                <strong>{displayName(req)}</strong>
                <span style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>wants to share schedules</span>
              </span>
              <span style={{display:'flex',gap:'6px'}}>
                <button className="btn btn-ghost btn-sm" style={{color:'#22c55e',padding:'4px 10px',fontWeight:600}} onClick={() => onAcceptRequest(req.id)}>Accept</button>
                <button className="btn btn-ghost btn-sm" style={{color:'#b91c1c',padding:'4px 8px'}} onClick={() => onRejectRequest(req.id)}>Decline</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="empty-state">
          <Icon.star />
          <h3>No events saved</h3>
          <p>Browse All Tournaments and tap "+ Add to My Schedule"</p>
        </div>
      ) : (
      <div style={{opacity: listVisible ? 1 : 0}}>
      <div className="schedule-sticky-header" ref={schedHeaderRef}>
        <div className="section-header" style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:0}}>
          <h2>My Schedule</h2>
          <span style={{fontSize:'0.82rem',color:'var(--text-muted)',flex:1}}>{sorted.filter(t => !t.is_restart).length} event{sorted.filter(t => !t.is_restart).length !== 1 ? 's' : ''}</span>
          <button className="btn btn-ghost btn-sm"
            style={{display:'inline-flex',alignItems:'center',gap:'4px',fontSize:'0.78rem',padding:'4px 10px'}}
            onClick={() => setShowExportModal(true)}
            title="Export schedule">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>
        </div>
      </div>
      {onAddPersonalEvent && (
        <>
          <div style={{display:'flex', gap:'8px', marginBottom: showTravelPicker ? '0' : '12px', padding:'0 2px'}}>
            <button className="btn btn-ghost btn-sm"
              style={{display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'0.8rem'}}
              onClick={() => setShowTravelPicker(v => !v)}>
              &#9992;&#65039; Travel Day
            </button>
            <button className="btn btn-ghost btn-sm"
              style={{display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'0.8rem'}}
              onClick={() => dayOffDateRef.current?.showPicker()}>
              &#127958;&#65039; Day Off
            </button>
            <input ref={dayOffDateRef} type="date"
              style={{position:'absolute', opacity:0, pointerEvents:'none', width:0, height:0}}
              onChange={e => { if (e.target.value) { onAddPersonalEvent(e.target.value, 'Day Off'); e.target.value = ''; }}} />
          </div>
          {showTravelPicker && (
            <div style={{padding:'0 2px', marginBottom:'12px'}}>
              <TravelDayPicker
                onSave={(date, notes) => {
                  onAddPersonalEvent(date, 'Travel Day', notes);
                  setShowTravelPicker(false);
                }}
                onCancel={() => setShowTravelPicker(false)}
              />
            </div>
          )}
        </>
      )}
      {conflicts.size > 0 && (
        <div className="alert alert-error" style={{marginBottom:'12px'}}>
          <Icon.warn /> {conflicts.size} event{conflicts.size !== 1 ? 's have' : ' has'} a time conflict
        </div>
      )}
      <div style={{minHeight:'100vh', paddingBottom:'60vh'}}>
        {(() => {
          const groups = [];
          let currentGroup = null;
          let globalIdx = 0;
          for (const t of sorted) {
            const d = normaliseDate(t.date);
            if (!currentGroup || currentGroup.date !== d) {
              currentGroup = { date: d, events: [] };
              groups.push(currentGroup);
            }
            currentGroup.events.push({ t, globalIdx });
            globalIdx++;
          }
          let scrollRefAssigned = false;
          return groups.map((group, gi) => {
            const isGroupToday = group.date === todayISO;
            const dateObj = new Date(group.date + 'T12:00:00');
            const monthAbbr = MONTHS[dateObj.getMonth()];
            const dayOfWeek = ['Su','M','Tu','W','Th','F','Sa'][dateObj.getDay()];
            const dayNum = String(dateObj.getDate()).padStart(2, '0');
            const past = group.date < todayISO;
            const needsRef = !scrollRefAssigned && group.date >= todayISO;
            if (needsRef) scrollRefAssigned = true;
            return (
              <div key={group.date} ref={needsRef ? todayRef : null} data-date-group={group.date} data-today-scroll={needsRef ? 'true' : undefined} style={{marginTop: gi === 0 ? 0 : '8px'}}>
                <div className="schedule-date-break" style={{
                  position: 'sticky', top: schedDateTop + 'px', zIndex: 5,
                  padding: '12px 12px 8px 2px',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontWeight: 700,
                  borderBottom: 'none',
                  display: 'flex', alignItems: 'baseline', gap: '4px'
                }}>
                  {isGroupToday ? (
                    <>
                      <span style={{
                        background: 'var(--accent)', display: 'inline-flex', alignItems: 'baseline', gap: '4px',
                        padding: '4px 12px', borderRadius: '999px'
                      }}>
                        <span style={{fontSize: '1.7rem', lineHeight: 1, fontFamily: "var(--serif)", color: 'var(--bg)'}}>{dayNum}</span>
                        <span style={{fontSize: '0.85rem', lineHeight: 1, fontFamily: "var(--serif)", textTransform: 'capitalize', color: 'var(--bg)'}}>{monthAbbr}</span>
                      </span>
                      <span style={{marginLeft: 'auto', fontSize: '0.85rem', lineHeight: 1, fontFamily: "var(--serif)"}}>{dayOfWeek}</span>
                    </>
                  ) : (
                    <>
                      <span style={{fontSize: '1.7rem', lineHeight: 1, fontFamily: "var(--serif)"}}>{dayNum}</span>
                      <span style={{fontSize: '0.85rem', lineHeight: 1, fontFamily: "var(--serif)", textTransform: 'capitalize'}}>{monthAbbr}</span>
                      <span style={{marginLeft: 'auto', fontSize: '0.85rem', lineHeight: 1, fontFamily: "var(--serif)"}}>{dayOfWeek}</span>
                    </>
                  )}
                </div>
                {group.events.map(({ t, globalIdx: gIdx }) => (
                  <div key={t.id} style={{contentVisibility:'auto', containIntrinsicSize:'auto 72px'}}>
                    <CalendarEventRow
                      tournament={t}
                      isInSchedule={true}
                      onToggle={onToggle}
                      isPast={past}
                      showMiniLateReg={isGroupToday}
                      focusEventId={focusEventId}
                      onNavigateToEvent={(num, sat) => {
                        const targetId = findBestFlightSchedule(num, sat);
                        if (targetId) { setFocusEventId(null); setTimeout(() => setFocusEventId(targetId), 0); }
                      }}
                      conditions={extractConditions(t)}
                      onSetCondition={onSetCondition}
                      onRemoveCondition={onRemoveCondition}
                      allTournaments={allTournaments}
                      isAnchor={!!t.is_anchor}
                      onToggleAnchor={onToggleAnchor}
                      plannedEntries={t.planned_entries || 1}
                      onSetPlannedEntries={onSetPlannedEntries}
                      onUpdatePersonalEvent={onUpdatePersonalEvent}
                      buddyEvents={buddyEvents}
                      buddyLiveUpdates={buddyLiveUpdates}
                      onBuddySwap={onBuddySwap}
                      scheduleIds={scheduleIds}
                      isAdmin={isAdmin}
                      onAdminEdit={onAdminEdit}
                    />
                  </div>
                ))}
              </div>
            );
          });
        })()}
      </div>
      </div>
      )}

      {showExportModal && <ScheduleExportModal events={sorted} onClose={() => setShowExportModal(false)} />}
      <div ref={fabContainerRef} />
    </div>
  );
}
