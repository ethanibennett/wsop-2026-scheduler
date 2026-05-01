import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import Icon from './Icon.jsx';
import CalendarEventRow from './CalendarEventRow.jsx';
import {
  getVenueInfo, normaliseDate, parseDateTime, parseTournamentTime, parseDateTimeInTz,
  getToday, getNow, fmtShortDate, addDays, daysBetween,
  isBraceletEvent, extractConditions, detectConflicts, findClosestFlight,
  haptic, VENUE_MAP, getVenueBrandColor, VENUE_COORDS, haversineDistance,
  VENUE_TO_SERIES, LOCATION_REGIONS,
} from '../utils/utils.js';
import { API_URL } from '../utils/api.js';

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const GAME_GROUPS = [
  { label: 'NLH', variants: ['NLH'] },
  { label: 'PLO', variants: ['PLO'] },
  { label: 'Omaha', variants: ['O8', 'PLO8', 'Big O'] },
  { label: 'Stud', variants: ['7-Card Stud', 'Razz', 'Stud 8'] },
  { label: 'Draw', variants: ['2-7 Triple Draw', 'Mixed Triple Draw', 'NL 2-7 Single Draw', 'Badugi'] },
  { label: 'Mixed', variants: ['8-Game Mix', '9-Game Mix', 'HORSE', 'TORSE', 'Mixed', "Dealer's Choice", 'Limit Hold\'em'] },
];

function buildAllDates(tournaments) {
  if (!tournaments || tournaments.length === 0) return [];
  let min = null, max = null;
  for (const t of tournaments) {
    const d = normaliseDate(t.date);
    if (!d) continue;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }
  if (!min || !max) return [];
  const dates = [];
  for (let d = new Date(min + 'T12:00:00'); d <= new Date(max + 'T12:00:00'); d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// ── Inline Filters component (matches original exactly) ──
function Filters({ filters, setFilters, gameVariants, venues, buyinOptions, tournaments }) {
  const panelRef = useRef(null);
  const toggleRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [whereOpen, setWhereOpen] = useState(false);
  const [howMuchOpen, setHowMuchOpen] = useState(false);
  const [whichOpen, setWhichOpen] = useState(false);
  const [specialOpen, setSpecialOpen] = useState(false);
  const [search, setSearch] = useState('');

  const dateBounds = useMemo(() => {
    const today = getToday();
    let earliest = null, latestDay1 = null;
    for (const t of (tournaments || [])) {
      const d = normaliseDate(t.date);
      if (!d) continue;
      if (!earliest || d < earliest) earliest = d;
      if (!t.is_restart && (!latestDay1 || d > latestDay1)) latestDay1 = d;
    }
    const minDate = (!earliest || earliest < today) ? today : earliest;
    const maxDate = latestDay1 || today;
    const totalDays = daysBetween(minDate, maxDate);
    return { minDate, maxDate, totalDays };
  }, [tournaments]);

  const availableVenues = useMemo(() => {
    const today = getToday();
    const countMap = {};
    (tournaments || []).forEach(t => {
      const d = normaliseDate(t.date);
      if (d < today) return;
      if (filters.dateFrom && d < filters.dateFrom) return;
      if (filters.dateTo && d > filters.dateTo) return;
      countMap[t.venue] = (countMap[t.venue] || 0) + 1;
    });
    return Object.keys(countMap)
      .sort((a, b) => countMap[b] - countMap[a])
      .map(v => ({ venue: v, series: VENUE_TO_SERIES[v] || v, count: countMap[v] }));
  }, [tournaments, filters.dateFrom, filters.dateTo]);

  const availableGameVariants = useMemo(() => {
    const variantSet = new Set();
    (tournaments || []).forEach(t => {
      const d = normaliseDate(t.date);
      if (filters.dateFrom && d < filters.dateFrom) return;
      if (filters.dateTo && d > filters.dateTo) return;
      if (t.game_variant) variantSet.add(t.game_variant);
    });
    return variantSet;
  }, [tournaments, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && panelRef.current.contains(e.target)) return;
      if (toggleRef.current && toggleRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const hasActive = filters.minBuyin || filters.maxBuyin || (filters.buyinRanges && filters.buyinRanges.length > 0) || (filters.rakeRanges && filters.rakeRanges.length > 0) ||
    filters.selectedGames.length > 0 || (filters.hiddenVenues && filters.hiddenVenues.length > 0) || filters.bountyOnly || filters.mysteryBountyOnly || filters.headsUpOnly || filters.tagTeamOnly || filters.employeesOnly || !filters.hideSatellites || !filters.hideRestarts || !filters.hideSideEvents || filters.ladiesOnly || filters.seniorsOnly || filters.mixedOnly || filters.dateFrom || filters.dateTo || filters.maxDistance || filters.locationRegion || filters.userLocation;

  return (
    <>
      <div className="filter-row" style={{gap:'8px',marginBottom:'0',width:'100%',alignItems:'center'}}>
        <div style={{flex:1,display:'flex',alignItems:'center',gap:'8px',justifyContent:'flex-end'}}>
          {filters.selectedGames.length > 0 && (
            <span className="filter-chip active">
              {filters.selectedGames.length === 1 ? filters.selectedGames[0] : `${filters.selectedGames.length} games`}
              <span style={{marginLeft:'4px',cursor:'pointer'}} onClick={() => setFilters(f => ({...f, selectedGames:[]}))}>&#10005;</span>
            </span>
          )}
          {filters.buyinRanges && filters.buyinRanges.length > 0 && (
            <span className="filter-chip active">
              {filters.buyinRanges.length === 1 ? ({'0-500':'< $500','500-1500':'$500\u2013$1.5K','1500-5000':'$1.5K\u2013$5K','5000-10000':'$5K\u2013$10K','10000+':'$10K+'})[filters.buyinRanges[0]] : `${filters.buyinRanges.length} buy-ins`}
              <span style={{marginLeft:'4px',cursor:'pointer'}} onClick={() => setFilters(f => ({...f, buyinRanges:[]}))}>&#10005;</span>
            </span>
          )}
          {filters.rakeRanges && filters.rakeRanges.length > 0 && (
            <span className="filter-chip active">
              {filters.rakeRanges.length === 1 ? ({'0-5':'< 5%','5-8':'5\u20138%','8-10':'8\u201310%','10-13':'10\u201313%','13+':'13%+'})[filters.rakeRanges[0]] : `${filters.rakeRanges.length} rake ranges`}
              <span style={{marginLeft:'4px',cursor:'pointer'}} onClick={() => setFilters(f => ({...f, rakeRanges:[]}))}>&#10005;</span>
            </span>
          )}
          {filters.bountyOnly && (
            <span className="filter-chip active">
              Bounty
              <span style={{marginLeft:'4px',cursor:'pointer'}} onClick={() => setFilters(f => ({...f, bountyOnly:false}))}>&#10005;</span>
            </span>
          )}
          {filters.mysteryBountyOnly && (
            <span className="filter-chip active">
              Mystery Bounty
              <span style={{marginLeft:'4px',cursor:'pointer'}} onClick={() => setFilters(f => ({...f, mysteryBountyOnly:false}))}>&#10005;</span>
            </span>
          )}
          {filters.headsUpOnly && (
            <span className="filter-chip active">
              Heads Up
              <span style={{marginLeft:'4px',cursor:'pointer'}} onClick={() => setFilters(f => ({...f, headsUpOnly:false}))}>&#10005;</span>
            </span>
          )}
          {filters.tagTeamOnly && (
            <span className="filter-chip active">
              Tag Team
              <span style={{marginLeft:'4px',cursor:'pointer'}} onClick={() => setFilters(f => ({...f, tagTeamOnly:false}))}>&#10005;</span>
            </span>
          )}
          {filters.employeesOnly && (
            <span className="filter-chip active">
              Employees
              <span style={{marginLeft:'4px',cursor:'pointer'}} onClick={() => setFilters(f => ({...f, employeesOnly:false}))}>&#10005;</span>
            </span>
          )}
          {filters.hiddenVenues && filters.hiddenVenues.length > 0 && (
            <span className="filter-chip active">
              {availableVenues.length - filters.hiddenVenues.filter(v => availableVenues.some(av => av.venue === v)).length} of {availableVenues.length} venues
              <span style={{marginLeft:'4px',cursor:'pointer'}} onClick={() => setFilters(f => ({...f, hiddenVenues:[]}))}>&#10005;</span>
            </span>
          )}
          {filters.ladiesOnly && (
            <span className="filter-chip active">
              Ladies Only
              <span style={{marginLeft:'4px',cursor:'pointer'}} onClick={() => setFilters(f => ({...f, ladiesOnly:false}))}>&#10005;</span>
            </span>
          )}
          {filters.seniorsOnly && (
            <span className="filter-chip active">
              Seniors Only
              <span style={{marginLeft:'4px',cursor:'pointer'}} onClick={() => setFilters(f => ({...f, seniorsOnly:false}))}>&#10005;</span>
            </span>
          )}
          {filters.mixedOnly && (
            <span className="filter-chip active">
              Mixed
              <span style={{marginLeft:'4px',cursor:'pointer'}} onClick={() => setFilters(f => ({...f, mixedOnly:false}))}>&#10005;</span>
            </span>
          )}
          {(filters.dateFrom || filters.dateTo) && (
            <span className="filter-chip active">
              {filters.dateFrom && filters.dateTo ? `${fmtShortDate(filters.dateFrom)} \u2014 ${fmtShortDate(filters.dateTo)}` : filters.dateFrom ? `From ${fmtShortDate(filters.dateFrom)}` : `Until ${fmtShortDate(filters.dateTo)}`}
              <span style={{marginLeft:'4px',cursor:'pointer'}} onClick={() => setFilters(f => ({...f, dateFrom:'', dateTo:''}))}>&#10005;</span>
            </span>
          )}
          <button
            ref={toggleRef}
            className={`filter-chip ${open ? 'active' : ''}`}
            onClick={() => setOpen(o => !o)}
            style={{flexShrink:0,height:'28px'}}
          >
            <Icon.filter />
          </button>
        </div>
      </div>

      {open && ReactDOM.createPortal(
        <div className="dropdown-backdrop" onClick={() => setOpen(false)} />,
        document.body
      )}
      {open && ReactDOM.createPortal(
        <div ref={panelRef} className="filter-panel" style={(() => {
          const r = toggleRef.current?.getBoundingClientRect();
          if (!r) return { top: 60, left: 8, right: 8 };
          const vh = window.innerHeight || document.documentElement.clientHeight || 700;
          return { top: r.bottom + 10, left: 8, right: 8, maxHeight: vh - r.bottom - 22 };
        })()}>
          {/* Quick filter pills */}
          {(() => {
            const quickFilters = [
              { label: 'NLH', isActive: filters.selectedGames.includes('NLH'),
                toggle: () => setFilters(f => ({ ...f, selectedGames: f.selectedGames.includes('NLH') ? f.selectedGames.filter(g => g !== 'NLH') : [...f.selectedGames, 'NLH'] })) },
              { label: 'PLO', isActive: filters.selectedGames.includes('PLO'),
                toggle: () => setFilters(f => ({ ...f, selectedGames: f.selectedGames.includes('PLO') ? f.selectedGames.filter(g => g !== 'PLO') : [...f.selectedGames, 'PLO'] })) },
              { label: 'Mixed', isActive: !!filters.mixedOnly,
                toggle: () => setFilters(f => ({ ...f, mixedOnly: !f.mixedOnly })) },
              { label: 'Ladies', isActive: !!filters.ladiesOnly,
                toggle: () => setFilters(f => ({ ...f, ladiesOnly: !f.ladiesOnly })) },
              { label: 'Seniors', isActive: !!filters.seniorsOnly,
                toggle: () => setFilters(f => ({ ...f, seniorsOnly: !f.seniorsOnly })) },
            ];
            return (
              <div style={{display:'flex',gap:'6px',marginBottom:'10px',gridColumn:'1 / -1'}}>
                {quickFilters.map(qf => (
                  <button key={qf.label} className={`filter-chip ${qf.isActive ? 'active' : ''}`}
                    style={{flex:'1 1 0',minWidth:0,justifyContent:'center',textAlign:'center'}}
                    onClick={qf.toggle}
                  >{qf.label}</button>
                ))}
              </div>
            );
          })()}

          {/* Search */}
          {/* Search — full-width row above the 4-col section row */}
          <div className="filter-group filter-row" style={{marginBottom:'6px'}}>
            <div className="search-bar" style={{marginBottom:0,height:'32px'}}>
              <Icon.search />
              <input
                type="text"
                placeholder={"Search events, games\u2026"}
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{padding:'4px 0'}}
              />
              {search && (
                <button onClick={() => setSearch('')}
                  style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:'1rem',padding:'0 2px'}}>&#10005;</button>
              )}
            </div>
          </div>

          {/* Date Range Slider */}
          {dateBounds.totalDays > 0 && (() => {
            const { minDate, maxDate, totalDays } = dateBounds;
            const fromIdx = filters.dateFrom ? Math.max(0, daysBetween(minDate, filters.dateFrom)) : 0;
            const toIdx = filters.dateTo ? Math.min(totalDays, daysBetween(minDate, filters.dateTo)) : totalDays;
            const fromDate = addDays(minDate, fromIdx);
            const toDate = addDays(minDate, toIdx);
            const pctL = (fromIdx / totalDays) * 100;
            const pctR = (toIdx / totalDays) * 100;
            return (
              <div className="filter-group filter-row" style={{marginBottom:'6px'}}>
                <label style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:'6px',display:'block',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Date Range</label>
                <div style={{padding:'0 6px'}}>
                  <div className="date-slider-wrap">
                    <div className="date-slider-track" />
                    <div className="date-slider-fill" style={{left: pctL + '%', right: (100 - pctR) + '%'}} />
                    <input type="range" className="date-slider-input" min={0} max={totalDays} value={fromIdx}
                      onChange={e => {
                        const v = Math.min(Number(e.target.value), toIdx);
                        setFilters(f => ({...f, dateFrom: v <= 0 ? '' : addDays(minDate, v)}));
                      }}
                    />
                    <input type="range" className="date-slider-input" min={0} max={totalDays} value={toIdx}
                      onChange={e => {
                        const v = Math.max(Number(e.target.value), fromIdx);
                        setFilters(f => ({...f, dateTo: v >= totalDays ? '' : addDays(minDate, v)}));
                      }}
                    />
                  </div>
                  <div className="date-slider-labels">
                    <label className="date-slider-date-link">
                      {fmtShortDate(fromDate)}
                      <input type="date" value={fromDate} min={minDate} max={toDate}
                        onChange={e => {
                          const v = e.target.value;
                          if (!v) { setFilters(f => ({...f, dateFrom: ''})); return; }
                          const idx = daysBetween(minDate, v);
                          setFilters(f => ({...f, dateFrom: idx <= 0 ? '' : v}));
                        }}
                      />
                    </label>
                    <label className="date-slider-date-link">
                      {fmtShortDate(toDate)}
                      <input type="date" value={toDate} min={fromDate} max={maxDate}
                        onChange={e => {
                          const v = e.target.value;
                          if (!v) { setFilters(f => ({...f, dateTo: ''})); return; }
                          const idx = daysBetween(minDate, v);
                          setFilters(f => ({...f, dateTo: idx >= totalDays ? '' : v}));
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Series */}
          <div className="filter-group filter-span2">
            <label style={{cursor:'pointer',display:'flex',alignItems:'center',gap:'6px'}} onClick={() => setWhereOpen(w => !w)}>
              Series
              <span style={{fontSize:'0.7rem',transition:'transform 0.15s',transform: whereOpen ? 'rotate(180deg)' : 'rotate(0deg)'}}>{'\u25BC'}</span>
            </label>
            {whereOpen && (<div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
              <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:600,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                <input type="checkbox"
                  checked={!filters.hiddenVenues || filters.hiddenVenues.length === 0}
                  ref={el => { if (el) el.indeterminate = filters.hiddenVenues && filters.hiddenVenues.length > 0 && filters.hiddenVenues.length < availableVenues.length; }}
                  onChange={e => setFilters(f => ({...f, hiddenVenues: e.target.checked ? [] : availableVenues.map(v => v.venue)}))}
                  style={{marginTop:'1px'}}
                /> All
              </label>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'4px 12px'}}>
                {availableVenues.map(({ venue, series, count }) => {
                  const hidden = (filters.hiddenVenues || []).includes(venue);
                  return (
                    <label key={venue} style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                      <input type="checkbox" checked={!hidden}
                        onChange={e => setFilters(f => {
                          const hv = f.hiddenVenues || [];
                          return {...f, hiddenVenues: e.target.checked ? hv.filter(v => v !== venue) : [...hv, venue]};
                        })}
                        style={{marginTop:'1px',flexShrink:0}}
                      />
                      <span style={{lineHeight:1.3}}>{series}</span>
                    </label>
                  );
                })}
              </div>
            </div>)}
          </div>

          {/* Buy-in / Rake */}
          <div className="filter-group filter-span2">
            <label style={{cursor:'pointer',display:'flex',alignItems:'center',gap:'6px'}} onClick={() => setHowMuchOpen(h => !h)}>
              Buy-in / Rake
              <span style={{fontSize:'0.7rem',transition:'transform 0.15s',transform: howMuchOpen ? 'rotate(180deg)' : 'rotate(0deg)'}}>{'\u25BC'}</span>
            </label>
            {howMuchOpen && (() => {
              const buyinOpts = [
                { key: '0-500', label: 'Under $500' },
                { key: '500-1500', label: '$500 \u2013 $1.5K' },
                { key: '1500-5000', label: '$1.5K \u2013 $5K' },
                { key: '5000-10000', label: '$5K \u2013 $10K' },
                { key: '10000+', label: '$10K+' },
              ];
              const rakeOpts = [
                { key: '0-5', label: 'Under 5%' },
                { key: '5-8', label: '5% \u2013 8%' },
                { key: '8-10', label: '8% \u2013 10%' },
                { key: '10-13', label: '10% \u2013 13%' },
                { key: '13+', label: '13%+' },
              ];
              const toggleArr = (arr, key) => arr.includes(key) ? arr.filter(k => k !== key) : [...arr, key];
              const allBuyinChecked = (filters.buyinRanges || []).length === 0;
              const allRakeChecked = (filters.rakeRanges || []).length === 0;
              return (<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
                <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                  <label style={{fontSize:'0.75rem',color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'2px'}}>Buy-in</label>
                  <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'0.82rem',fontWeight:600,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                    <input type="checkbox" checked={allBuyinChecked}
                      onChange={() => setFilters(f => ({...f, buyinRanges: [], minBuyin: '', maxBuyin: ''}))}
                      style={{marginTop:'1px',flexShrink:0}}
                    />
                    <span>All</span>
                  </label>
                  {buyinOpts.map(opt => (
                    <label key={opt.key} style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                      <input type="checkbox" checked={(filters.buyinRanges || []).includes(opt.key)}
                        onChange={() => setFilters(f => ({...f, buyinRanges: toggleArr(f.buyinRanges || [], opt.key), minBuyin: '', maxBuyin: ''}))}
                        style={{marginTop:'1px',flexShrink:0}}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                  <label style={{fontSize:'0.75rem',color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'2px'}}>Rake</label>
                  <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'0.82rem',fontWeight:600,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                    <input type="checkbox" checked={allRakeChecked}
                      onChange={() => setFilters(f => ({...f, rakeRanges: []}))}
                      style={{marginTop:'1px',flexShrink:0}}
                    />
                    <span>All</span>
                  </label>
                  {rakeOpts.map(opt => (
                    <label key={opt.key} style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                      <input type="checkbox" checked={(filters.rakeRanges || []).includes(opt.key)}
                        onChange={() => setFilters(f => ({...f, rakeRanges: toggleArr(f.rakeRanges || [], opt.key)}))}
                        style={{marginTop:'1px',flexShrink:0}}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>);
            })()}
          </div>

          {/* Variant */}
          <div className="filter-group filter-span2">
            <label style={{cursor:'pointer',display:'flex',alignItems:'center',gap:'6px'}} onClick={() => setWhichOpen(w => !w)}>
              Variant
              <span style={{fontSize:'0.7rem',transition:'transform 0.15s',transform: whichOpen ? 'rotate(180deg)' : 'rotate(0deg)'}}>{'\u25BC'}</span>
            </label>
            {whichOpen && (() => {
              const allSelected = filters.selectedGames.length === 0;
              const toggleVariant = (v, checked) => {
                setFilters(f => ({...f, selectedGames: checked ? [...f.selectedGames, v] : f.selectedGames.filter(g => g !== v)}));
              };
              return (<div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:600,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                  <input type="checkbox" checked={allSelected}
                    onChange={() => setFilters(f => ({...f, selectedGames:[]}))}
                    style={{marginTop:'1px'}}
                  /> All
                </label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'4px 12px',paddingLeft:'21px'}}>
                {GAME_GROUPS.map(group => {
                  const availVars = group.variants.filter(v => availableGameVariants.has(v));
                  if (availVars.length === 0) return null;
                  const isSingle = availVars.length === 1 && group.variants.length === 1;
                  const groupChecked = availVars.every(v => filters.selectedGames.includes(v));
                  const groupPartial = availVars.some(v => filters.selectedGames.includes(v)) && !groupChecked;
                  if (isSingle) {
                    const v = availVars[0];
                    return (
                      <label key={group.label} style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)',marginBottom:'6px'}}>
                        <input type="checkbox" checked={filters.selectedGames.includes(v)}
                          onChange={e => toggleVariant(v, e.target.checked)}
                          style={{marginTop:'1px'}}
                        /> {group.label}
                      </label>
                    );
                  }
                  const needsTopGap = group.label === 'Draw' || group.label === 'Mixed';
                  return (
                    <div key={group.label} style={needsTopGap ? {marginTop:'6px'} : undefined}>
                      <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:600,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                        <input type="checkbox" checked={groupChecked}
                          ref={el => { if (el) el.indeterminate = groupPartial; }}
                          onChange={e => {
                            const checked = e.target.checked;
                            setFilters(f => {
                              const without = f.selectedGames.filter(v => !availVars.includes(v));
                              return {...f, selectedGames: checked ? [...without, ...availVars] : without};
                            });
                          }}
                          style={{marginTop:'1px'}}
                        /> {group.label}
                      </label>
                      <div style={{display:'flex',flexDirection:'column',gap:'2px',paddingLeft:'21px',marginTop:'2px'}}>
                        {availVars.map(v => (
                          <label key={v} style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.78rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text-muted)'}}>
                            <input type="checkbox" checked={filters.selectedGames.includes(v)}
                              onChange={e => toggleVariant(v, e.target.checked)}
                              style={{marginTop:'1px'}}
                            /> {v}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>);
            })()}
          </div>

          {/* Special */}
          <div className="filter-group filter-span2">
            <label style={{cursor:'pointer',display:'flex',alignItems:'center',gap:'6px'}} onClick={() => setSpecialOpen(s => !s)}>
              Special
              <span style={{fontSize:'0.7rem',transition:'transform 0.15s',transform: specialOpen ? 'rotate(180deg)' : 'rotate(0deg)'}}>{'\u25BC'}</span>
            </label>
            {specialOpen && (
              <div style={{display:'flex',flexDirection:'column',gap:'4px',marginTop:'4px'}}>
                <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                  <input type="checkbox" checked={!!filters.ladiesOnly}
                    onChange={() => setFilters(f => ({...f, ladiesOnly:!f.ladiesOnly}))}
                    style={{marginTop:'1px'}}
                  /> Ladies
                </label>
                <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                  <input type="checkbox" checked={!!filters.seniorsOnly}
                    onChange={() => setFilters(f => ({...f, seniorsOnly:!f.seniorsOnly}))}
                    style={{marginTop:'1px'}}
                  /> Seniors
                </label>
                <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                  <input type="checkbox" checked={filters.bountyOnly}
                    onChange={e => setFilters(f => ({...f, bountyOnly:e.target.checked}))}
                    style={{marginTop:'1px'}}
                  /> Bounty
                </label>
                <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                  <input type="checkbox" checked={filters.mysteryBountyOnly}
                    onChange={e => setFilters(f => ({...f, mysteryBountyOnly:e.target.checked}))}
                    style={{marginTop:'1px'}}
                  /> Mystery Bounty
                </label>
                <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                  <input type="checkbox" checked={filters.headsUpOnly}
                    onChange={e => setFilters(f => ({...f, headsUpOnly:e.target.checked}))}
                    style={{marginTop:'1px'}}
                  /> Heads Up
                </label>
                <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                  <input type="checkbox" checked={filters.tagTeamOnly}
                    onChange={e => setFilters(f => ({...f, tagTeamOnly:e.target.checked}))}
                    style={{marginTop:'1px'}}
                  /> Tag Team
                </label>
                <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                  <input type="checkbox" checked={filters.employeesOnly}
                    onChange={e => setFilters(f => ({...f, employeesOnly:e.target.checked}))}
                    style={{marginTop:'1px'}}
                  /> Casino Employees
                </label>
              </div>
            )}
          </div>

          {/* Clear all + Save & Close */}
          <div className="filter-group filter-actions" style={{gridColumn:'1 / -1',display:'flex',flexDirection:'row',gap:'8px',justifyContent:'flex-end',alignItems:'center',marginTop:'4px'}}>
            {hasActive && (
              <button className="btn btn-ghost btn-sm" onClick={() =>
                setFilters({minBuyin:'',maxBuyin:'',buyinRanges:[],rakeRanges:[],selectedGames:[],hiddenVenues:[],bountyOnly:false,mysteryBountyOnly:false,headsUpOnly:false,tagTeamOnly:false,employeesOnly:false,hideSatellites:true,hideRestarts:true,hideSideEvents:true,hiddenMonths:[],ladiesOnly:false,seniorsOnly:false,mixedOnly:false,dateFrom:'',dateTo:'',maxDistance:'',userLocation:null,locationRegion:null})
              }>Clear all filters</button>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>Save &amp; Close</button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default function CalendarView({ allTournaments, mySchedule, onToggle, gameVariants, venues, onSetCondition, onRemoveCondition, onToggleAnchor, onSetPlannedEntries, buddyEvents, buddyLiveUpdates }) {
  const allDates = useMemo(() => buildAllDates(allTournaments), [allTournaments]);
  const today = getToday();
  const defaultDate = allDates.includes(today) ? today : allDates[0] || today;
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const activeDateRef = useRef(null);
  const [focusEventId, setFocusEventId] = useState(null);

  // Always snap to today when the tab is visited
  useEffect(() => {
    const t = getToday();
    if (allDates.includes(t)) setSelectedDate(t);
  }, []);

  // Scroll the active date button into view in the carousel
  useEffect(() => {
    if (activeDateRef.current) {
      activeDateRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [selectedDate]);

  const [filters, setFilters] = useState(() => {
    // Restore previously-chosen location from localStorage so users don't have
    // to re-enter distance/region on every launch.
    let savedLoc = {};
    try {
      const raw = localStorage.getItem('savedLocation');
      if (raw) savedLoc = JSON.parse(raw);
    } catch(e) {}
    return {
      minBuyin: '', maxBuyin: '', buyinRanges: [], rakeRanges: [], selectedGames: [],
      hiddenVenues: [], bountyOnly: false, mysteryBountyOnly: false, headsUpOnly: false,
      tagTeamOnly: false, employeesOnly: false, hideSatellites: true, hideRestarts: true,
      hideSideEvents: false,
      maxDistance: savedLoc.maxDistance || '',
      userLocation: savedLoc.userLocation || null,
      locationRegion: savedLoc.locationRegion || null,
      locationLabel: savedLoc.locationLabel || null,
    };
  });
  // Persist location selection across sessions
  useEffect(() => {
    const { userLocation, locationRegion, maxDistance, locationLabel } = filters;
    if (userLocation || locationRegion) {
      localStorage.setItem('savedLocation', JSON.stringify({ userLocation, locationRegion, maxDistance, locationLabel }));
    } else {
      localStorage.removeItem('savedLocation');
    }
  }, [filters.userLocation, filters.locationRegion, filters.maxDistance, filters.locationLabel]);

  const buyinOptions = useMemo(() =>
    [...new Set(allTournaments.map(t => parseInt(t.buyin, 10)).filter(n => n > 0 && !isNaN(n)))].sort((a, b) => a - b),
    [allTournaments]
  );

  // Map normalised date -> all tournaments
  const byDate = useMemo(() => {
    const map = {};
    for (const t of allTournaments) {
      const key = normaliseDate(t.date);
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [allTournaments]);

  const scheduleIds = useMemo(() => new Set(mySchedule.map(t => t.id)), [mySchedule]);
  const anchorSet = useMemo(() => new Set(mySchedule.filter(t => t.is_anchor).map(t => t.id)), [mySchedule]);
  const plannedEntriesMap = useMemo(() => {
    const m = {};
    for (const t of mySchedule) m[t.id] = t.planned_entries || 1;
    return m;
  }, [mySchedule]);
  const conditionMap = useMemo(() => {
    const m = {};
    for (const t of mySchedule) {
      const c = extractConditions(t);
      if (c.length > 0) m[t.id] = c;
    }
    return m;
  }, [mySchedule]);

  // Hide series that have ended (2 days after their last Day 1 / flight)
  const calEndedVenues = useMemo(() => {
    const todayISO = getToday();
    const lastDay1ByVenue = {};
    for (const t of allTournaments) {
      if (t.is_restart || t.is_satellite) continue;
      const d = normaliseDate(t.date);
      if (!d) continue;
      if (!lastDay1ByVenue[t.venue] || d > lastDay1ByVenue[t.venue]) lastDay1ByVenue[t.venue] = d;
    }
    const ended = new Set();
    for (const [venue, lastDate] of Object.entries(lastDay1ByVenue)) {
      const cutoff = new Date(lastDate + 'T00:00:00');
      cutoff.setDate(cutoff.getDate() + 2);
      if (todayISO > cutoff.toISOString().slice(0, 10)) ended.add(venue);
    }
    return ended;
  }, [allTournaments]);

  const selDateObj = new Date(selectedDate + 'T12:00:00');
  const todayEvents = byDate[selectedDate] || [];

  // Filter + sort by time
  const sortedEvents = useMemo(() => {
    return [...todayEvents]
      .filter(t => {
        if (calEndedVenues.has(t.venue)) return false;
        if (filters.minBuyin && t.buyin < Number(filters.minBuyin)) return false;
        if (filters.maxBuyin && t.buyin > Number(filters.maxBuyin)) return false;
        if (filters.buyinRanges && filters.buyinRanges.length > 0) {
          const b = Number(t.buyin) || 0;
          const matchesBuyin = filters.buyinRanges.some(r => {
            if (r === '0-500') return b < 500;
            if (r === '500-1500') return b >= 500 && b < 1500;
            if (r === '1500-5000') return b >= 1500 && b < 5000;
            if (r === '5000-10000') return b >= 5000 && b <= 10000;
            if (r === '10000+') return b > 10000;
            return true;
          });
          if (!matchesBuyin) return false;
        }
        if (filters.rakeRanges && filters.rakeRanges.length > 0) {
          if (t.rake_pct == null) return false;
          const r = Number(t.rake_pct);
          const matchesRake = filters.rakeRanges.some(rng => {
            if (rng === '0-5') return r < 5;
            if (rng === '5-8') return r >= 5 && r < 8;
            if (rng === '8-10') return r >= 8 && r < 10;
            if (rng === '10-13') return r >= 10 && r < 13;
            if (rng === '13+') return r >= 13;
            return true;
          });
          if (!matchesRake) return false;
        }
        if (filters.selectedGames.length > 0 && !filters.selectedGames.includes(t.game_variant)) return false;
        if (filters.hiddenVenues && filters.hiddenVenues.length > 0 && filters.hiddenVenues.includes(t.venue)) return false;
        if (filters.maxDistance && filters.userLocation) {
          const coords = VENUE_COORDS[t.venue];
          if (coords) {
            const dist = haversineDistance(filters.userLocation.lat, filters.userLocation.lng, coords.lat, coords.lng);
            if (dist > Number(filters.maxDistance)) return false;
          }
        }
        if (filters.locationRegion) {
          const coords = VENUE_COORDS[t.venue];
          const regionDef = typeof LOCATION_REGIONS !== 'undefined' && LOCATION_REGIONS[filters.locationRegion];
          if (regionDef) { if (!coords || !regionDef.test(coords)) return false; }
        }
        {
          const specialActive = filters.bountyOnly || filters.mysteryBountyOnly || filters.headsUpOnly || filters.tagTeamOnly || filters.employeesOnly || filters.ladiesOnly || filters.seniorsOnly;
          if (specialActive) {
            let matchesSpecial = false;
            if (filters.bountyOnly && /bounty|mystery millions/i.test(t.event_name)) matchesSpecial = true;
            if (filters.mysteryBountyOnly && /mystery bounty|mystery millions/i.test(t.event_name)) matchesSpecial = true;
            if (filters.headsUpOnly && /heads.up/i.test(t.event_name)) matchesSpecial = true;
            if (filters.tagTeamOnly && /tag.team/i.test(t.event_name)) matchesSpecial = true;
            if (filters.employeesOnly && /employee/i.test(t.event_name)) matchesSpecial = true;
            if (filters.ladiesOnly && /women|ladies/i.test(t.event_name)) matchesSpecial = true;
            if (filters.seniorsOnly && /senior/i.test(t.event_name)) matchesSpecial = true;
            if (!matchesSpecial) return false;
          }
        }
        if (filters.hideSatellites && t.is_satellite) return false;
        if (filters.hideRestarts && t.is_restart) return false;
        if (filters.hideSideEvents && t.category === 'side') return false;
        return true;
      })
      .sort((a, b) => {
        const ta = a.venue ? parseDateTimeInTz(a.date, a.time, a.venue) : parseDateTime(a.date, (a.time || '').replace(/\s*GMT\s*$/i, ''));
        const tb = b.venue ? parseDateTimeInTz(b.date, b.time, b.venue) : parseDateTime(b.date, (b.time || '').replace(/\s*GMT\s*$/i, ''));
        if (ta !== tb) return ta - tb;
        const na = (a.event_number || '').startsWith('SAT') ? 10000 + parseInt((a.event_number || '').slice(4)) : (parseInt(a.event_number) || 9999);
        const nb = (b.event_number || '').startsWith('SAT') ? 10000 + parseInt((b.event_number || '').slice(4)) : (parseInt(b.event_number) || 9999);
        return na - nb;
      });
  }, [todayEvents, filters, calEndedVenues]);

  const myTodayCount = sortedEvents.filter(t => scheduleIds.has(t.id)).length;

  // Split events for "My Events" section on today's date
  const isToday = selectedDate === getToday();
  const myEvents = useMemo(() => sortedEvents.filter(t => scheduleIds.has(t.id)), [sortedEvents, scheduleIds]);
  const otherEvents = useMemo(() => sortedEvents.filter(t => !scheduleIds.has(t.id)), [sortedEvents, scheduleIds]);
  const showMySection = isToday && myEvents.length > 0;

  const renderEvent = (t) => (
    <CalendarEventRow
      key={t.id}
      tournament={t}
      isInSchedule={scheduleIds.has(t.id)}
      onToggle={onToggle}
      showMiniLateReg={selectedDate === today}
      focusEventId={focusEventId}
      onNavigateToEvent={(num, sat) => {
        const flights = allTournaments.filter(f => f.event_number === num);
        const best = findClosestFlight(flights, parseTournamentTime(sat));
        if (best) {
          if (best.date !== selectedDate) setSelectedDate(best.date);
          setFocusEventId(null);
          setTimeout(() => setFocusEventId(best.id), 50);
        }
      }}
      conditions={conditionMap[t.id] || []}
      onSetCondition={onSetCondition}
      onRemoveCondition={onRemoveCondition}
      allTournaments={allTournaments}
      isAnchor={anchorSet.has(t.id)}
      onToggleAnchor={onToggleAnchor}
      plannedEntries={plannedEntriesMap[t.id] || 1}
      onSetPlannedEntries={onSetPlannedEntries}
      buddyEvents={buddyEvents}
      buddyLiveUpdates={buddyLiveUpdates}
      scheduleIds={scheduleIds}
    />
  );

  function move(dir) {
    const idx = allDates.indexOf(selectedDate);
    const next = idx + dir;
    if (next >= 0 && next < allDates.length) setSelectedDate(allDates[next]);
  }

  return (
    <div>
      <div className="sticky-filters">
        {/* Date navigation header */}
        <div className="calendar-nav">
          <button className="cal-nav-btn" onClick={() => move(-1)}>
            <Icon.chevLeft />
          </button>
          <div className="cal-date-label">
            <div className="day-name">{DOW[selDateObj.getDay()]}</div>
            <div className="day-full">
              {MONTHS[selDateObj.getMonth()]} {selDateObj.getDate()}, {selDateObj.getFullYear()}
            </div>
          </div>
          <button className="cal-nav-btn" onClick={() => move(1)}>
            <Icon.chevRight />
          </button>
        </div>

        {/* Scrollable date strip */}
        <div className="cal-date-strip">
          {allDates.map(d => {
            const dObj = new Date(d + 'T12:00:00');
            const hasEv = (byDate[d] || []).length > 0;
            const isSel = d === selectedDate;
            return (
              <button
                key={d}
                ref={isSel ? activeDateRef : null}
                className={`cal-date-btn ${isSel ? 'active' : ''} ${hasEv && !isSel ? 'has-events' : ''}`}
                onClick={() => setSelectedDate(d)}
              >
                <span className="dow">{DOW[dObj.getDay()]}</span>
                <span className="dom">{dObj.getDate()}</span>
                {hasEv && <span className="ev-dot" />}
              </button>
            );
          })}
        </div>

        <Filters filters={filters} setFilters={setFilters} gameVariants={gameVariants || []} venues={venues || []} buyinOptions={buyinOptions} tournaments={allTournaments} />

        {/* Summary row */}
        <p className="cal-event-count">
          {sortedEvents.length} event{sortedEvents.length !== 1 ? 's' : ''}
          {myTodayCount > 0 && ` \u00b7 ${myTodayCount} in my schedule`}
        </p>
      </div>

      {sortedEvents.length === 0 ? (
        <div className="empty-state" style={{padding:'40px 24px'}}>
          <Icon.empty />
          <h3>No events</h3>
          <p>No tournaments scheduled for this date</p>
        </div>
      ) : showMySection ? (
        <div style={{minHeight:'100vh'}}>
          <div className="section-header" style={{marginTop:'8px'}}>
            <h2>My Events</h2>
            <span style={{fontSize:'0.82rem',color:'var(--text-muted)'}}>{myEvents.length} event{myEvents.length !== 1 ? 's' : ''}</span>
          </div>
          {myEvents.map(renderEvent)}

          {otherEvents.length > 0 && (
            <React.Fragment>
              <div className="section-header" style={{marginTop:'16px'}}>
                <h2>All Events</h2>
                <span style={{fontSize:'0.82rem',color:'var(--text-muted)'}}>{otherEvents.length} event{otherEvents.length !== 1 ? 's' : ''}</span>
              </div>
              {otherEvents.map(renderEvent)}
            </React.Fragment>
          )}
        </div>
      ) : (
        <div style={{minHeight:'100vh'}}>
          {sortedEvents.map(renderEvent)}
        </div>
      )}
    </div>
  );
}
