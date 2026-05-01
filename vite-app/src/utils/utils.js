// ── Utils ─────────────────────────────────────────────────
// Converted from public/js/utils.js — window globals removed, ES module exports added

// ── Haptic feedback ──
export function haptic(ms = 15) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch(e) { /* ignore */ }
}

let _debugNow = localStorage.getItem('debugNow') || '';
export function getDebugNow() { return _debugNow; }
export function setDebugNow(v) { _debugNow = v || ''; localStorage.setItem('debugNow', _debugNow); }
export function getToday() { return _debugNow ? _debugNow.slice(0, 10) : new Date().toISOString().slice(0, 10); }
export function getNow() { return _debugNow ? new Date(_debugNow).getTime() : Date.now(); }

// ── Variant Color Map ─────────────────────────────────────
export const VARIANT_COLORS = {
  'NLH':                '#808080',
  'PLO':                '#999999',
  'PLO8':               '#8a8a8a',
  'O8':                 '#7a7a7a',
  'Limit Hold\'em':     '#6a6a6a',
  'Big O':              '#909090',
  '7-Card Stud':        '#757575',
  'Stud 8':              '#858585',
  'Razz':               '#707070',
  'HORSE':              '#9a9a9a',
  'TORSE':              '#8f8f8f',
  '2-7 Triple Draw':    '#787878',
  'NL 2-7 Single Draw': '#888888',
  'Badugi':             '#959595',
  "Dealer's Choice":    '#a0a0a0',
  'Mixed':              '#7f7f7f',
  '9-Game Mix':         '#8b8b8b',
  '8-Game Mix':         '#868686',
  '8-Game Mix (Chainsaw)': '#868686',
  'Mixed Triple Draw':  '#7c7c7c',
  'Mixed Triple Draw (x5)': '#7c7c7c',
  'OE':                 '#858585',
  'TOE':                '#808080',
  '5-Card PLO':         '#999999',
  "Big Bet Dealer's Choice": '#a0a0a0',
  'PLO/NLH Mix':        '#8a8a8a',
  'Mixed PLO':          '#909090',
  '10-Game Mix':        '#8b8b8b',
};
export function getVariantColor(v) { return VARIANT_COLORS[v] ?? '#808080'; }

// ── Multi-game variant expansion ─────────────────────────
export const MULTI_GAME_MAP = {
  'HORSE':            ['LHE', 'O8', 'Razz', 'Stud Hi', 'Stud 8'],
  'OE':               ['O8', 'Stud 8'],
  'TOE':              ['2-7 TD', 'O8', 'Stud 8'],
  'TORSE':            ['2-7 TD', 'O8', 'Razz', 'Stud Hi', 'Stud 8'],
  '8-Game Mix':       ['NLH', 'PLO', '2-7 TD', 'LHE', 'O8', 'Razz', 'Stud Hi', 'Stud 8'],
  '8-Game Mix (Chainsaw)': ['NLH', 'PLO', '2-7 TD', 'LHE', 'O8', 'Razz', 'Stud Hi', 'Stud 8', 'PLO8', 'Big O'],
  '9-Game Mix':       ['NLH', 'PLO', '2-7 TD', 'LHE', 'O8', 'Razz', 'Stud Hi', 'Stud 8', 'NL 2-7 SD'],
  'Mixed Triple Draw': ['2-7 TD', 'A-5 TD', 'Badugi'],
  'Mixed Triple Draw (x5)': ['2-7 TD', 'A-5 TD', 'Badugi', 'Badeucy', 'Badacy'],
  '10-Game Mix':      ['LHE', 'O8', 'Razz', 'Stud Hi', 'Stud 8', 'NLH', 'PLO', '2-7 TD', 'Badugi', 'NL 2-7 SD'],
  'Mixed PLO':        ['PLO', 'PLO8', 'Big O'],
  'PLO/NLH Mix':      ['PLO', 'NLH'],
  "Big Bet Dealer's Choice": ['NLH', 'PLO', 'PLO8', 'Big O', 'PL 2-7 TD', 'NL 2-7 SD', 'NL 5CD'],
  "Dealer's Choice":  [
    'NLH', 'LHE', 'Razz', 'Stud Hi', 'Stud 8', 'Stud Hi-Lo',
    'PLH', 'PLO', 'PLO8', 'PL 2-7 TD', 'Big O', 'LO Hi',
    'O8', 'L 2-7 TD', 'A-5 TD', 'Badugi', 'Badeucy', 'Badacy',
    'NL 2-7 SD', 'PL 5CD Hi', '2-7 Razz'
  ],
};

export const PILL_DISPLAY = {
  "Limit Hold'em": 'LHE', '7-Card Stud': 'Stud Hi',
  '2-7 Triple Draw': '2-7 TD', 'NL 2-7 Single Draw': 'NL 2-7 SD',
};
export function pillName(g) { return PILL_DISPLAY[g] || g; }

export function getGamePills(gameVariant, eventName) {
  if (!gameVariant) return [];
  if (MULTI_GAME_MAP[gameVariant]) return MULTI_GAME_MAP[gameVariant];
  if (gameVariant === 'Mixed' && eventName) {
    const base = eventName.replace(/ - Day \d+$/, '').replace(/ - Flight [A-Z]$/, '');
    if (/Poker Players Championship/i.test(base))
      return ['NLH', 'PLO', '2-7 TD', 'LHE', 'O8', 'Razz', 'Stud Hi', 'Stud 8', 'NL 2-7 SD', 'PLO8'];
    if (/Mixed Big Bet/i.test(base))
      return ['NLH', 'PLO', 'PLO8', 'Big O', 'PL 2-7 TD', 'NL 2-7 SD', 'PL 5CD Hi'];
    const colonMatch = base.match(/Mixed:\s*(.+)/i);
    if (colonMatch) return colonMatch[1].split(/,\s*/).map(s => s.trim()).filter(Boolean);
    const slashMatch = base.match(/^([\w']+)\s*\/\s*([\w']+)/);
    if (slashMatch) return [slashMatch[1], slashMatch[2]];
    const mixedPrefix = base.match(/^Mixed\s+(.+)/i);
    if (mixedPrefix) return mixedPrefix[1].split(/,\s*/).map(s => pillName(s.trim())).filter(Boolean);
  }
  return [pillName(gameVariant)];
}

export const HAND_CONFIG_DEFAULT = { heroCards: 2, hasBoard: true, boardMax: 5, betting: 'nl', heroPlaceholder: 'AKhd', boardPlaceholder: 'QJ6hch' };

export const HAND_CONFIG = {
  'NLH':      { heroCards: 2, hasBoard: true, boardMax: 5, betting: 'nl', heroPlaceholder: 'AKhd', boardPlaceholder: 'QJ6hch' },
  'LHE':      { heroCards: 2, hasBoard: true, boardMax: 5, betting: 'fl', flSmallStreets: [0, 1], raiseCap: 4, heroPlaceholder: 'AKhd', boardPlaceholder: 'QJ6hch' },
  'PLO':      { heroCards: 4, hasBoard: true, boardMax: 5, betting: 'pl', heroPlaceholder: 'AKQ9hdcs', boardPlaceholder: 'J72hds' },
  'PLO8':     { heroCards: 4, hasBoard: true, boardMax: 5, betting: 'pl', heroPlaceholder: 'A2KQhdcs', boardPlaceholder: 'J72hds' },
  'O8':       { heroCards: 4, hasBoard: true, boardMax: 5, betting: 'fl', flSmallStreets: [0, 1], raiseCap: 4, heroPlaceholder: 'A2KQhdcs', boardPlaceholder: 'J72hds' },
  'Big O':    { heroCards: 5, hasBoard: true, boardMax: 5, betting: 'pl', heroPlaceholder: 'AK2Q9hdcsd', boardPlaceholder: 'J72hds' },
  'Razz':     { heroCards: 7, hasBoard: false, boardMax: 0, betting: 'fl', flSmallStreets: [0, 1], raiseCap: 4, isStud: true, heroPlaceholder: 'A23x4567xhdscx' },
  'Stud Hi':  { heroCards: 7, hasBoard: false, boardMax: 0, betting: 'fl', flSmallStreets: [0, 1], raiseCap: 4, isStud: true, heroPlaceholder: 'A9xxAKQJThdcsx' },
  'Stud 8':   { heroCards: 7, hasBoard: false, boardMax: 0, betting: 'fl', flSmallStreets: [0, 1], raiseCap: 4, isStud: true, heroPlaceholder: 'A234567hdcshds' },
  '2-7 TD':   { heroCards: 5, hasBoard: false, boardMax: 0, betting: 'fl', flSmallStreets: [0, 1], raiseCap: 4, heroPlaceholder: '23457hdcss' },
  'NL 2-7 SD':{ heroCards: 5, hasBoard: false, boardMax: 0, betting: 'nl', heroPlaceholder: '23457hdcss' },
  'Badugi':   { heroCards: 4, hasBoard: false, boardMax: 0, betting: 'fl', flSmallStreets: [0, 1], raiseCap: 4, heroPlaceholder: 'A234hdcs' },
  'A-5 TD':   { heroCards: 5, hasBoard: false, boardMax: 0, betting: 'fl', flSmallStreets: [0, 1], raiseCap: 4, heroPlaceholder: 'A2345hdcss' },
  'OFC Pineapple': { heroCards: 13, hasBoard: false, boardMax: 0, betting: 'nl', heroPlaceholder: 'AKQ...' },
  'OFC':          { heroCards: 13, hasBoard: false, boardMax: 0, isStud: false, category: 'ofc', heroPlaceholder: '' },
  'PLH':      { heroCards: 2, hasBoard: true, boardMax: 5, betting: 'pl', heroPlaceholder: 'AKhd', boardPlaceholder: 'QJ6hch' },
  'Stud Hi-Lo': { heroCards: 7, hasBoard: false, boardMax: 0, betting: 'fl', flSmallStreets: [0, 1], raiseCap: 4, isStud: true, heroPlaceholder: 'A234567hdcshds' },
  'LO Hi':    { heroCards: 4, hasBoard: true, boardMax: 5, betting: 'fl', flSmallStreets: [0, 1], raiseCap: 4, heroPlaceholder: 'AKQ9hdcs', boardPlaceholder: 'J72hds' },
  'PL 2-7 TD':{ heroCards: 5, hasBoard: false, boardMax: 0, betting: 'pl', heroPlaceholder: '23457hdcss' },
  'L 2-7 TD': { heroCards: 5, hasBoard: false, boardMax: 0, betting: 'fl', flSmallStreets: [0, 1], raiseCap: 4, heroPlaceholder: '23457hdcss' },
  'Badeucy':  { heroCards: 5, hasBoard: false, boardMax: 0, betting: 'fl', flSmallStreets: [0, 1], raiseCap: 4, heroPlaceholder: '23457hdcss' },
  'Badacy':   { heroCards: 5, hasBoard: false, boardMax: 0, betting: 'fl', flSmallStreets: [0, 1], raiseCap: 4, heroPlaceholder: 'A2345hdcss' },
  'PL 5CD Hi':{ heroCards: 5, hasBoard: false, boardMax: 0, betting: 'pl', heroPlaceholder: 'AKQJT hdcss' },
  '2-7 Razz': { heroCards: 7, hasBoard: false, boardMax: 0, betting: 'fl', flSmallStreets: [0, 1], raiseCap: 4, isStud: true, heroPlaceholder: '23x45x7TKhdscx' },
  'NL Stud Hi':  { heroCards: 7, hasBoard: false, boardMax: 0, betting: 'nl', isStud: true, heroPlaceholder: 'A9xxAKQJThdcsx' },
  'NL Stud 8':   { heroCards: 7, hasBoard: false, boardMax: 0, betting: 'nl', isStud: true, heroPlaceholder: 'A234567hdcshds' },
  'NL Razz':     { heroCards: 7, hasBoard: false, boardMax: 0, betting: 'nl', isStud: true, heroPlaceholder: 'A23x4567xhdscx' },
  'PL Stud Hi':  { heroCards: 7, hasBoard: false, boardMax: 0, betting: 'pl', isStud: true, heroPlaceholder: 'A9xxAKQJThdcsx' },
  'PL Stud 8':   { heroCards: 7, hasBoard: false, boardMax: 0, betting: 'pl', isStud: true, heroPlaceholder: 'A234567hdcshds' },
  'PL Razz':     { heroCards: 7, hasBoard: false, boardMax: 0, betting: 'pl', isStud: true, heroPlaceholder: 'A23x4567xhdscx' },
};

// ── Venue Color + Abbreviation Map ───────────────────────
export const VENUE_MAP = {
  'Horseshoe / Paris Las Vegas': { abbr: 'WSOP',  color: '#a0a0a0', longName: 'WSOP Horseshoe / Paris' },
  'Horseshoe Las Vegas':         { abbr: 'WSOP',  color: '#a0a0a0', longName: 'WSOP Horseshoe' },
  'Paris Las Vegas':             { abbr: 'PRS',   color: '#909090', longName: 'Paris Las Vegas' },
  'Wynn Las Vegas':              { abbr: 'WYNN',  color: '#cc0000', longName: 'Wynn Summer Classic' },
  'Wynn':                        { abbr: 'WYNN',  color: '#cc0000', longName: 'Wynn Summer Classic' },
  'Aria':                        { abbr: 'ARIA',  color: '#999999', longName: 'Aria Resort & Casino' },
  'Aria Resort & Casino':        { abbr: 'ARIA',  color: '#999999', longName: 'Aria Resort & Casino' },
  'Resorts World':               { abbr: 'RESORTS WORLD', color: '#7a7a7a', longName: 'Resorts World Las Vegas' },
  'Venetian':                    { abbr: 'VENETIAN',   color: '#3b0a0a', longName: 'Venetian Poker Series' },
  'Venetian DeepStack Extravaganza': { abbr: 'VENETIAN', color: '#3b0a0a', longName: 'Venetian DeepStack Extravaganza' },
  'Golden Nugget':               { abbr: 'GOLDEN NUGGET', color: '#92700a', longName: 'Golden Nugget' },
  'South Point':                 { abbr: 'SOUTH POINT', color: '#6b4226', longName: 'South Point Hotel & Casino' },
  'Orleans':                     { abbr: 'ORLEANS', color: '#c2410c', longName: 'The Orleans' },
  'MGM Grand':                   { abbr: 'MGM GRAND', color: '#15803d', longName: 'MGM Grand' },
  'MGM National Harbor':         { abbr: 'MGM NH',    color: '#b8860b', longName: 'MGM National Harbor' },
  'Irish Poker Open':            { abbr: 'IPO',       color: '#1a6b3c', longName: 'Irish Poker Open' },
  'Personal':                    { abbr: 'PERSONAL',  color: '#4a9eff', longName: 'Personal' },
  'Turning Stone Casino':        { abbr: 'TURNING STONE', color: '#8b0000', longName: 'WSOPC Turning Stone' },
  'Texas Card House':            { abbr: 'TCH', color: '#a0522d', longName: 'WSOPC Austin' },
  'Caesars Palace':              { abbr: 'CAESARS', color: '#b8962e', longName: 'Caesars Palace' },
  'Seminole Hard Rock':          { abbr: 'HARD ROCK', color: '#1a9e9e', longName: 'Seminole Hard Rock' },
  'WSOP Europe':                 { abbr: 'WSOPE', color: '#1a3c6e', longName: 'WSOP Europe' },
  'Borgata':                     { abbr: 'BORGATA', color: '#6b21a8', longName: 'Borgata Spring Poker Open' },
  'Foxwoods':                    { abbr: 'FOXWOODS', color: '#4a2d7a', longName: 'Foxwoods Poker Classic' },
  'Thunder Valley':              { abbr: 'THUNDER VALLEY', color: '#d4a017', longName: 'Thunder Valley Poker Series' },
  'Bellagio':                    { abbr: 'BELLAGIO', color: '#c9a867', longName: 'Bellagio' },
  'Lodge Poker Club':            { abbr: 'LODGE', color: '#2d5a27', longName: 'Lodge Championship Series' },
  'bestbet Jacksonville':        { abbr: 'BESTBET', color: '#1a73e8', longName: 'bestbet Jacksonville' },
  "Bally's Lake Tahoe":          { abbr: 'BALLY\'S', color: '#b91c1c', longName: 'WSOPC Lake Tahoe' },
  "Harrah's Cherokee":           { abbr: 'CHEROKEE', color: '#e91e90', longName: 'WSOPC Cherokee' },
  'WSOPC Cherokee':              { abbr: 'CHEROKEE', color: '#e91e90', longName: 'WSOPC Cherokee' },
  'Choctaw Casino':              { abbr: 'CHOCTAW', color: '#dc2626', longName: 'WSOPC Choctaw' },
  'Horseshoe Tunica':            { abbr: 'TUNICA', color: '#0d6efd', longName: 'WSOPC Tunica' },
  'WSOPC Horseshoe Las Vegas':   { abbr: 'WSOPC-LV', color: '#d4a017', longName: 'WSOPC Horseshoe LV' },
};
export function getVenueInfo(v) {
  return VENUE_MAP[v] ?? { abbr: v ? v.slice(0, 4).toUpperCase() : '?', color: '#808080', longName: v || '' };
}

// Actual branded pill colors for mini late-reg bar
export const VENUE_BRAND_VAR = {
  'WSOP':          '--venue-wsop',
  'IPO':           '--venue-ipo',
  'PERSONAL':      '--venue-personal',
  'WYNN':          '--venue-wynn',
  'ARIA':          '--venue-aria',
  'GOLDEN NUGGET': '--venue-golden-nugget',
  'RESORTS WORLD': '--venue-resorts-world',
  'SOUTH POINT':   '--venue-south-point',
  'ORLEANS':       '--venue-orleans',
  'MGM GRAND':     '--venue-mgm-grand',
  'MGM NH':        '--venue-mgm-nh',
  'TURNING STONE': '--venue-ts',
  'TCH':           '--venue-tch',
  'CAESARS':        '--venue-caesars',
  'HARD ROCK':      '--venue-hardrock',
  'WSOPE':          '--venue-wsope',
  'VENETIAN':       '--venue-venetian',
  'BORGATA':        '--venue-borgata',
  'FOXWOODS':       '--venue-foxwoods',
  'THUNDER VALLEY': '--venue-thunder-valley',
  'BELLAGIO':       '--venue-bellagio',
  'LODGE':          '--venue-lodge',
  'BESTBET':        '--venue-bestbet',
  'BALLY\'S':       '--venue-ballys',
  'CHEROKEE':       '--venue-cherokee',
  'CHOCTAW':        '--venue-choctaw',
  'TUNICA':         '--venue-tunica',
  'PRS':            '--venue-prs',
  'WSOPC-LV':       '--venue-wsopc-lv',
};
export function getVenueBrandColor(abbr) {
  let cssVar = VENUE_BRAND_VAR[abbr];
  if (!cssVar) {
    cssVar = `--venue-${abbr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`;
    VENUE_BRAND_VAR[abbr] = cssVar;
  }
  return `var(${cssVar}, ${(VENUE_MAP[Object.keys(VENUE_MAP).find(k => VENUE_MAP[k].abbr === abbr)] || {}).color || '#808080'})`;
}

// ── Bracelet Event Detection ──────────────────────────────
export const NON_BRACELET_KEYWORDS = ['satellite', 'mega sat', 'super sat', 'qualifier', 'freeroll', 'charity', 'side event'];
export function isBraceletEvent(t) {
  if (t.is_satellite) return false;
  if (t.is_restart) return false;
  if ((t.category || '').toLowerCase() === 'side') return false;
  const v = (t.venue || '').toLowerCase();
  if (!v.includes('horseshoe') && !v.includes('paris') && v !== 'wsop europe') return false;
  const name = (t.event_name || '').toLowerCase();
  if (name.includes('circuit') && v !== 'wsop europe') return false;
  const info = getVenueInfo(t.venue);
  if (/^WSOPC/.test(info.longName)) return false;
  return !NON_BRACELET_KEYWORDS.some(kw => name.includes(kw));
}

// ── Venue CSS class map ──────
export const VENUE_CLASS_MAP = {
  'Horseshoe / Paris Las Vegas': 'venue-hs',
  'Horseshoe Las Vegas':         'venue-hs',
  'Paris Las Vegas':             'venue-hs',
  'Wynn Las Vegas':              'venue-wynn',
  'Wynn':                        'venue-wynn',
  'Aria':                        'venue-aria',
  'Aria Resort & Casino':        'venue-aria',
  'Golden Nugget':               'venue-gn',
};
export function getVenueClass(t) {
  return VENUE_CLASS_MAP[t.venue] || '';
}

export function getMaxEntries(reentry) {
  if (!reentry || reentry === 'N/A') return 1;
  if (/unlimited/i.test(reentry)) return 99;
  const num = parseInt(reentry);
  if (!isNaN(num)) return num + 1;
  return 2;
}

// ── Venue Timezone Mapping ─────────────────────────────
export const VENUE_TIMEZONES = {
  'Horseshoe / Paris Las Vegas': 'America/Los_Angeles',
  'Caesars Palace': 'America/Los_Angeles',
  'Irish Poker Open': 'Europe/Dublin',
  'WSOP Europe': 'Europe/Prague',
  'Seminole Hard Rock': 'America/New_York',
  'Texas Card House': 'America/Chicago',
  'Turning Stone Casino': 'America/New_York',
  'Foxwoods': 'America/New_York',
  'Thunder Valley': 'America/Los_Angeles',
  'Bellagio': 'America/Los_Angeles',
  'Lodge Poker Club': 'America/Chicago',
  'bestbet Jacksonville': 'America/New_York',
  "Bally's Lake Tahoe": 'America/Los_Angeles',
  "Harrah's Cherokee": 'America/New_York',
  'WSOPC Cherokee': 'America/New_York',
  'Choctaw Casino': 'America/Chicago',
  'Horseshoe Tunica': 'America/Chicago',
  'Borgata': 'America/New_York',
  'MGM National Harbor': 'America/New_York',
};

export function getVenueTimezone(venue) {
  return VENUE_TIMEZONES[venue] || 'America/Los_Angeles';
}

// ── Venue GPS Coordinates ─────────────────────────────────
export const VENUE_COORDS = {
  'Horseshoe / Paris Las Vegas': { lat: 36.1162, lng: -115.1745 },
  'Horseshoe Las Vegas':         { lat: 36.1162, lng: -115.1745 },
  'Paris Las Vegas':             { lat: 36.1162, lng: -115.1745 },
  'Wynn Las Vegas':              { lat: 36.1267, lng: -115.1624 },
  'Wynn':                        { lat: 36.1267, lng: -115.1624 },
  'Aria':                        { lat: 36.1073, lng: -115.1765 },
  'Aria Resort & Casino':        { lat: 36.1073, lng: -115.1765 },
  'Resorts World':               { lat: 36.1247, lng: -115.1697 },
  'Venetian':                    { lat: 36.1212, lng: -115.1696 },
  'Golden Nugget':               { lat: 36.1711, lng: -115.1447 },
  'South Point':                 { lat: 36.0118, lng: -115.1720 },
  'Orleans':                     { lat: 36.1020, lng: -115.2013 },
  'MGM Grand':                   { lat: 36.1024, lng: -115.1696 },
  'MGM National Harbor':         { lat: 38.7828, lng: -77.0189 },
  'Irish Poker Open':            { lat: 53.3438, lng: -6.2530 },
  'Turning Stone Casino':        { lat: 43.1215, lng: -75.5130 },
  'Texas Card House':            { lat: 30.3553, lng: -97.7069 },
  'Caesars Palace':              { lat: 36.1162, lng: -115.1745 },
  'Seminole Hard Rock':          { lat: 26.0512, lng: -80.2109 },
  'WSOP Europe':                 { lat: 50.0880, lng: 14.4208 },
  'Borgata':                     { lat: 39.3772, lng: -74.4378 },
  'Foxwoods':                    { lat: 41.4719, lng: -71.9699 },
  'Thunder Valley':              { lat: 38.8023, lng: -121.2268 },
  'Bellagio':                    { lat: 36.1129, lng: -115.1765 },
  'Lodge Poker Club':            { lat: 30.6023, lng: -97.8603 },
  'bestbet Jacksonville':        { lat: 30.3568, lng: -81.6085 },
  "Bally's Lake Tahoe":          { lat: 38.9574, lng: -119.9459 },
  "Harrah's Cherokee":           { lat: 35.4617, lng: -83.3225 },
  'WSOPC Cherokee':              { lat: 35.4617, lng: -83.3225 },
  'Choctaw Casino':              { lat: 34.0289, lng: -96.3931 },
  'Horseshoe Tunica':            { lat: 34.6965, lng: -90.3398 },
};

// ── Location Regions ─────────────────────────────────────
export const LOCATION_REGIONS = {
  lasvegas: { label: 'Las Vegas', test: (c) => haversineDistance(36.115, -115.17, c.lat, c.lng) <= 30 },
  texas: { label: 'Texas', test: (c) => c.lat >= 25.8 && c.lat <= 36.5 && c.lng >= -106.6 && c.lng <= -93.5 },
  florida: { label: 'Florida', test: (c) => c.lat >= 24.5 && c.lat <= 31 && c.lng >= -87.6 && c.lng <= -80 },
  europe: { label: 'Europe', test: (c) => c.lng >= -25 && c.lng <= 40 && c.lat >= 35 && c.lat <= 72 },
  northeast: { label: 'Northeast US', test: (c) => c.lat >= 38.5 && c.lat <= 45 && c.lng >= -80 && c.lng <= -70 },
};

// ── Haversine distance (miles) ────────────────────────────
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getVenueTzAbbr(venue) {
  var tz = getVenueTimezone(venue);
  try {
    var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date());
    var tzPart = parts.find(function(p) { return p.type === 'timeZoneName'; });
    return tzPart ? tzPart.value : '';
  } catch(e) { return ''; }
}

export function parseDateTimeInTz(date, time, venue) {
  if (!date) return NaN;
  var t = (time && time !== 'TBD') ? time : '12:00 AM';
  var tz = getVenueTimezone(venue);
  var isoDate = normaliseDate(date);
  if (!isoDate) return NaN;
  var m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  var h, min;
  if (m) {
    h = parseInt(m[1]);
    if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
    min = m[2];
  } else {
    var m24 = t.match(/^(\d{1,2}):(\d{2})$/);
    h = m24 ? parseInt(m24[1]) : 12;
    min = m24 ? m24[2] : '00';
  }
  var dtStr = isoDate + 'T' + String(h).padStart(2, '0') + ':' + min + ':00';
  try {
    var naive = new Date(dtStr + 'Z');
    var utcStr = naive.toLocaleString('en-US', { timeZone: 'UTC' });
    var tzStr = naive.toLocaleString('en-US', { timeZone: tz });
    var utcMs = new Date(utcStr).getTime();
    var tzMs = new Date(tzStr).getTime();
    var offset = utcMs - tzMs;
    return naive.getTime() + offset;
  } catch(e) {
    return new Date(dtStr).getTime();
  }
}

// ── Helpers ──────────────────────────────────────────────
export function normaliseDate(d) {
  if (!d) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  var dt = new Date(d + ' 12:00:00');
  if (isNaN(dt.getTime())) return '';
  var y = dt.getFullYear();
  var m = String(dt.getMonth() + 1).padStart(2, '0');
  var day = String(dt.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

export function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
export function addDays(dateStr, n) { const d = new Date(dateStr); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
export function fmtShortDate(d) { const dt = new Date(d + 'T12:00:00'); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

export function parseTournamentTime(t) {
  const time = (t.time && t.time !== 'TBD') ? t.time : '12:00 AM';
  return parseDateTime(t.date, time);
}

export function parseDateTime(date, time) {
  if (!date) return NaN;
  const t = (time && time !== 'TBD') ? time : '12:00 AM';
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const m24 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (m24) {
      let h = parseInt(m24[1]);
      if (m24[3].toUpperCase() === 'PM' && h !== 12) h += 12;
      if (m24[3].toUpperCase() === 'AM' && h === 12) h = 0;
      return new Date(`${date}T${String(h).padStart(2,'0')}:${m24[2]}:00`).getTime();
    }
    return new Date(`${date}T${t}:00`).getTime();
  }
  return new Date(`${date} ${t}`).getTime();
}

export function parseLateRegEnd(lateRegEnd, eventDate) {
  if (!lateRegEnd) return NaN;
  if (lateRegEnd.length > 10) return new Date(lateRegEnd).getTime();
  const isoDate = normaliseDate(eventDate);
  if (isoDate) return new Date(`${isoDate}T${lateRegEnd}:00`).getTime();
  return NaN;
}

export function findClosestFlight(flights, satTimestamp) {
  if (flights.length === 0) return null;
  const withTime = flights
    .map(f => ({ id: f.id, date: normaliseDate(f.date), ts: parseTournamentTime(f) }))
    .sort((a, b) => a.ts - b.ts);
  const after = withTime.find(f => f.ts > satTimestamp);
  if (after) return after;
  return withTime[withTime.length - 1];
}

export function getIfIBustEvents(event, allTournaments, scheduleIds) {
  if (!event || !allTournaments || !scheduleIds) return [];
  var eventStart = parseDateTime(event.date, event.time);
  if (isNaN(eventStart)) return [];
  var sameDate = normaliseDate(event.date);
  return allTournaments.filter(function(t) {
    if (t.id === event.id) return false;
    if (t.venue !== event.venue) return false;
    if (!scheduleIds.has(t.id)) return false;
    var tDate = normaliseDate(t.date);
    if (tDate !== sameDate) return false;
    var tStart = parseDateTime(t.date, t.time);
    if (isNaN(tStart)) return false;
    if (tStart >= eventStart) return false;
    return true;
  }).sort(function(a, b) {
    return parseDateTime(a.date, a.time) - parseDateTime(b.date, b.time);
  });
}

// Candidates for an "If I Bag" condition: scheduled events ending on or
// before this event's date that have a corresponding restart (Day 2). The
// idea is that you'd commit to playing this event only if you bagged from a
// prior multi-day event and now have time/energy to play.
export function getIfIBagEvents(event, allTournaments, scheduleIds) {
  if (!event || !allTournaments || !scheduleIds) return [];
  var thisDate = normaliseDate(event.date);
  // Identify event_numbers that are known multi-day (have a restart row)
  var restartNumbers = new Set();
  for (var i = 0; i < allTournaments.length; i++) {
    var t = allTournaments[i];
    if (t.is_restart && t.event_number) restartNumbers.add(String(t.event_number));
  }
  return allTournaments.filter(function(t) {
    if (t.id === event.id) return false;
    if (!scheduleIds.has(t.id)) return false;
    if (t.is_restart) return false; // candidate is the Day 1, not the restart
    if (!t.event_number || !restartNumbers.has(String(t.event_number))) return false;
    var tDate = normaliseDate(t.date);
    if (!tDate || tDate > thisDate) return false;
    return true;
  }).sort(function(a, b) {
    return parseDateTime(a.date, a.time) - parseDateTime(b.date, b.time);
  });
}

export function formatBuyin(val, venue) {
  if (!val && val !== 0) return '\u2014';
  return currencySymbol(venue || '') + Number(val).toLocaleString();
}

export function calculateCountdown(date, time, venue) {
  const d = venue ? parseDateTimeInTz(date, time, venue) : parseDateTime(date, time);
  const diff = d - getNow();
  if (diff < 0) return null;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function getOrdinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ── POY Points ────────────────────────────────────────────
export const NON_POY_KEYWORDS = ['senior', 'super senior', 'ladies', 'tag team',
                            'industry', 'employees', 'online'];

export function isPOYEligible(t) {
  if (!isBraceletEvent(t)) return false;
  const name = (t.event_name || '').toLowerCase();
  return !NON_POY_KEYWORDS.some(kw => name.includes(kw));
}

export function isSixMax(eventName) {
  return /6[- ]?handed|6[- ]?max/i.test(eventName || '');
}

export function calculatePOYPoints(buyin, finishPlace, totalEntries, cashed, eventName) {
  if (!totalEntries || totalEntries < 1) return null;
  if (cashed && !finishPlace) return null;

  let rankRatio;
  if (!cashed) {
    rankRatio = 1;
  } else {
    rankRatio = finishPlace / totalEntries;
    if (rankRatio <= 0) rankRatio = 1 / totalEntries;
    if (rankRatio > 1) rankRatio = 1;
  }

  let C;
  if (!cashed) {
    C = 1;
  } else if (finishPlace === 1) {
    C = 6;
  } else {
    const ftCutoff = isSixMax(eventName) ? 6 : 9;
    C = finishPlace <= ftCutoff ? 4 : 2;
  }

  const buyinRoot = Math.pow(buyin, 1 / 4.5);
  const lnAbs = Math.abs(Math.log(rankRatio));
  const lnPow = Math.pow(lnAbs, 1.7);
  return Math.round(C * buyinRoot * lnPow * 10) / 10;
}

export function extractConditions(t, sharedView) {
  if (!t.conditions_json) return [];
  const isPublic = !!t.condition_is_public;
  if (sharedView && !isPublic) return [];
  try {
    const conditions = JSON.parse(t.conditions_json);
    return Array.isArray(conditions) ? conditions : [];
  } catch(e) { return []; }
}

export function formatConditionLabel(c, allTournaments) {
  if (c.type === 'PROFIT_THRESHOLD') return `If up $${Number(c.profitThreshold).toLocaleString()}`;
  const dep = allTournaments && allTournaments.find(t => t.id === c.dependsOnId);
  const num = dep ? dep.event_number : '?';
  if (c.type === 'IF_WIN_SEAT') return `If seat #${num}`;
  if (c.type === 'IF_NO_SEAT') return `If no seat #${num}`;
  if (c.type === 'IF_BUST') return `If bust #${num}`;
  if (c.type === 'IF_BAG') return `If bag #${num}`;
  return '';
}

export function formatConditionBadge(c, allTournaments) {
  if (c.type === 'PROFIT_THRESHOLD') return `\u{1F4B0} If up $${Number(c.profitThreshold).toLocaleString()}`;
  const dep = allTournaments && allTournaments.find(t => t.id === c.dependsOnId);
  const num = dep ? dep.event_number : '?';
  if (c.type === 'IF_WIN_SEAT') return `\u{1F3AF} If seat from #${num}`;
  if (c.type === 'IF_NO_SEAT') return `\u{1F504} If no seat from #${num}`;
  if (c.type === 'IF_BUST') return `\u{1F4A5} If bust from #${num}`;
  if (c.type === 'IF_BAG') return `\u{1F392} If bag from #${num}`;
  return '';
}

export function detectConflicts(schedule) {
  const conflicts = new Set();
  const expectedConflicts = new Set();
  const sorted = [...schedule].filter(t => t.venue !== 'Personal').sort((a, b) => parseDateTime(a.date, a.time) - parseDateTime(b.date, b.time));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      if (a.date !== b.date) break;
      if (a.time === b.time) {
        if (extractConditions(a).length > 0 || extractConditions(b).length > 0) {
          expectedConflicts.add(a.id);
          expectedConflicts.add(b.id);
        } else {
          conflicts.add(a.id);
          conflicts.add(b.id);
        }
      }
    }
  }
  return { conflicts, expectedConflicts };
}

// ── Currency helpers ────────────────────────────────────────
export const VENUE_CURRENCY = { 'Irish Poker Open': 'EUR', 'WSOP Europe': 'EUR' };
export function nativeCurrency(venue) { return VENUE_CURRENCY[venue] || 'USD'; }
export const CURRENCY_CONFIG = {
  USD: { symbol: '$', pos: 'pre', label: 'US Dollar' },
  EUR: { symbol: '\u20ac', pos: 'pre', label: 'Euro' },
  GBP: { symbol: '\u00a3', pos: 'pre', label: 'British Pound' },
  CAD: { symbol: 'C$', pos: 'pre', label: 'Canadian Dollar' },
  AUD: { symbol: 'A$', pos: 'pre', label: 'Australian Dollar' },
  JPY: { symbol: '\u00a5', pos: 'pre', label: 'Japanese Yen' },
  CHF: { symbol: 'CHF', pos: 'pre', label: 'Swiss Franc' },
  SEK: { symbol: 'kr', pos: 'suf', label: 'Swedish Krona' },
  DKK: { symbol: 'kr', pos: 'suf', label: 'Danish Krone' },
  NOK: { symbol: 'kr', pos: 'suf', label: 'Norwegian Krone' },
  CZK: { symbol: 'K\u010d', pos: 'suf', label: 'Czech Koruna' },
  PLN: { symbol: 'z\u0142', pos: 'suf', label: 'Polish Z\u0142oty' },
  HKD: { symbol: 'HK$', pos: 'pre', label: 'Hong Kong Dollar' },
  SGD: { symbol: 'S$', pos: 'pre', label: 'Singapore Dollar' },
  BRL: { symbol: 'R$', pos: 'pre', label: 'Brazilian Real' },
  MXN: { symbol: 'MX$', pos: 'pre', label: 'Mexican Peso' },
  INR: { symbol: '\u20b9', pos: 'pre', label: 'Indian Rupee' },
  CNY: { symbol: '\u00a5', pos: 'pre', label: 'Chinese Yuan' },
};
export function currencySymbol(venue) { return (CURRENCY_CONFIG[nativeCurrency(venue)] || CURRENCY_CONFIG.USD).symbol; }
export function formatCurrencyAmount(val, currCode) {
  if (!val && val !== 0) return '\u2014';
  const cfg = CURRENCY_CONFIG[currCode] || CURRENCY_CONFIG.USD;
  const num = Math.round(Math.abs(val)).toLocaleString();
  const sign = val < 0 ? '-' : '';
  return cfg.pos === 'suf' ? sign + num + ' ' + cfg.symbol : sign + cfg.symbol + num;
}
export function convertAmount(amount, fromCurr, toCurr, rates) {
  if (!amount || !rates || fromCurr === toCurr) return amount;
  const inUSD = fromCurr === 'USD' ? amount : amount / (rates[fromCurr] || 1);
  return toCurr === 'USD' ? inUSD : inUSD * (rates[toCurr] || 1);
}

// ── Venue to Series name ────────────────────────────────
export const VENUE_TO_SERIES = {
  'Aria Resort & Casino': 'Aria Poker Classic',
  'Golden Nugget': 'Golden Nugget Grand',
  'Horseshoe / Paris Las Vegas': 'WSOP',
  'Irish Poker Open': 'Irish Poker Open',
  'MGM Grand': 'MGM Grand Championship',
  'Orleans': 'Orleans Open',
  'Resorts World': 'Resorts World Summer Series',
  'South Point': 'South Point Summer Poker',
  'Texas Card House': 'WSOPC Austin',
  'Turning Stone Casino': 'WSOPC Turning Stone',
  'Borgata': 'Borgata Spring Poker Open',
  'Venetian': 'Venetian Poker Series',
  'Wynn Las Vegas': 'Wynn Summer Classic',
  'Foxwoods': 'Foxwoods Poker Classic',
  'Thunder Valley': 'Thunder Valley Poker Series',
  'Bellagio': 'Bellagio',
  'Lodge Poker Club': 'Lodge Championship Series',
  'bestbet Jacksonville': 'bestbet Jacksonville',
  "Bally's Lake Tahoe": 'WSOPC Lake Tahoe',
  "Harrah's Cherokee": 'WSOPC Cherokee',
  'WSOPC Cherokee': 'WSOPC Cherokee',
  'Choctaw Casino': 'WSOPC Choctaw',
  'Horseshoe Tunica': 'WSOPC Tunica',
  'Caesars Palace': 'Caesars Palace',
  'Seminole Hard Rock': 'Seminole Hard Rock',
  'WSOP Europe': 'WSOP Europe',
  'MGM National Harbor': 'MGM National Harbor'
};

// ── Format chips ──
export function formatChips(n) {
  if (n == null) return '';
  n = Number(n);
  if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(n);
}

// ── Estimate blind level ──
export function estimateBlindLevel(startTime, levelDurationMins) {
  const now = getNow();
  if (!startTime || isNaN(startTime) || now < startTime) return null;

  const elapsedMs = now - startTime;
  const levelMs = (levelDurationMins || 40) * 60 * 1000;
  const currentLevel = Math.floor(elapsedMs / levelMs) + 1;
  const elapsedInLevel = elapsedMs % levelMs;
  const remainingInLevel = Math.max(0, levelMs - elapsedInLevel);

  const blindStructure = [
    { sb: 100,   bb: 200,    ante: 200 },
    { sb: 200,   bb: 300,    ante: 300 },
    { sb: 200,   bb: 400,    ante: 400 },
    { sb: 300,   bb: 600,    ante: 600 },
    { sb: 400,   bb: 800,    ante: 800 },
    { sb: 500,   bb: 1000,   ante: 1000 },
    { sb: 600,   bb: 1200,   ante: 1200 },
    { sb: 800,   bb: 1600,   ante: 1600 },
    { sb: 1000,  bb: 2000,   ante: 2000 },
    { sb: 1200,  bb: 2400,   ante: 2400 },
    { sb: 1500,  bb: 3000,   ante: 3000 },
    { sb: 2000,  bb: 4000,   ante: 4000 },
    { sb: 2500,  bb: 5000,   ante: 5000 },
    { sb: 3000,  bb: 6000,   ante: 6000 },
    { sb: 4000,  bb: 8000,   ante: 8000 },
    { sb: 5000,  bb: 10000,  ante: 10000 },
    { sb: 6000,  bb: 12000,  ante: 12000 },
    { sb: 8000,  bb: 16000,  ante: 16000 },
    { sb: 10000, bb: 20000,  ante: 20000 },
    { sb: 15000, bb: 30000,  ante: 30000 },
    { sb: 20000, bb: 40000,  ante: 40000 },
    { sb: 25000, bb: 50000,  ante: 50000 },
    { sb: 30000, bb: 60000,  ante: 60000 },
    { sb: 40000, bb: 80000,  ante: 80000 },
    { sb: 50000, bb: 100000, ante: 100000 },
  ];

  const idx = Math.min(currentLevel - 1, blindStructure.length - 1);
  const blinds = blindStructure[idx];

  return {
    level: currentLevel,
    sb: blinds.sb,
    bb: blinds.bb,
    ante: blinds.ante,
    remainingMs: remainingInLevel,
    remainingMin: Math.floor(remainingInLevel / 60000),
    remainingSec: Math.floor((remainingInLevel % 60000) / 1000),
  };
}

// ── Measure combined height of sticky elements ──
export function measureStickyStack(container) {
  const caTop = container.getBoundingClientRect().top;
  let bottom = 0;
  const sticky = container.querySelector('.sticky-filters') || container.querySelector('.schedule-sticky-header') || container.querySelector('.gto-sticky-header');
  if (sticky) bottom = sticky.getBoundingClientRect().bottom - caTop;
  container.querySelectorAll('.schedule-date-break').forEach(db => {
    const dbTop = db.getBoundingClientRect().top - caTop;
    if (dbTop < bottom + 5) {
      const dbBottom = db.getBoundingClientRect().bottom - caTop;
      if (dbBottom > bottom) bottom = dbBottom;
    }
  });
  return bottom;
}

// ── Parse shorthand like "275k" -> 275000, "1.2M" -> 1200000 ──
export function parseShorthand(str) {
  if (!str) return '';
  str = String(str).trim().replace(/,/g, '');
  const m = str.match(/^(\d+\.?\d*)\s*([kKmM]?)$/);
  if (!m) return str;
  let num = parseFloat(m[1]);
  const suffix = m[2].toLowerCase();
  if (suffix === 'k') num *= 1000;
  else if (suffix === 'm') num *= 1000000;
  return String(Math.round(num));
}

// ── Ordinal suffix ──
export function ordinalSuffix(n) {
  const s = ['th','st','nd','rd'], v = n % 100;
  return (s[(v-20)%10] || s[v] || s[0]);
}

// ── Format live update ──
export function formatLiveUpdate(u) {
  if (!u) return '';
  const parts = [];
  if (u.stack) {
    let s = formatChips(u.stack);
    if (u.sb || u.bb) {
      const blindParts = [u.sb ? formatChips(u.sb) : null, u.bb ? formatChips(u.bb) : null].filter(Boolean);
      if (u.bb_ante || u.bbAnte) blindParts.push(formatChips(u.bb_ante || u.bbAnte));
      if (blindParts.length) s += ' @ ' + blindParts.join('/');
    }
    const bbVal = Number(u.bb || 0);
    if (bbVal > 0) {
      const bbCount = (Number(u.stack) / bbVal).toFixed(1).replace(/\.0$/, '');
      s += ' (' + bbCount + 'bb)';
    }
    parts.push(s);
  }
  const bub = u.bubble;
  if (bub && !(u.is_itm || u.isItm)) parts.push(bub + ' from money');
  if (u.is_itm || u.isItm) {
    const locked = u.locked_amount || u.lockedAmount;
    parts.push('ITM' + (locked ? ' ($' + Number(locked).toLocaleString() + ' locked)' : ''));
  }
  const ft = u.is_final_table || u.isFinalTable;
  if (ft) {
    let ftStr = 'FT';
    const pl = u.places_left || u.placesLeft;
    if (pl) ftStr += ' (' + pl + ' left)';
    const fp = u.first_place_prize || u.firstPlacePrize;
    if (fp) ftStr += ' 1st: $' + Number(fp).toLocaleString();
    parts.push(ftStr);
  }
  const deal = u.is_deal || u.isDeal;
  if (deal) {
    let dStr = 'Deal';
    const dp = u.deal_place || u.dealPlace;
    if (dp) dStr += ' ' + dp + ordinalSuffix(dp);
    const dpay = u.deal_payout || u.dealPayout;
    if (dpay) dStr += ' $' + Number(dpay).toLocaleString();
    parts.push(dStr);
  }
  if (u.is_busted || u.isBusted) parts.push('Busted');
  const entries = u.total_entries || u.totalEntries;
  if (entries) parts.push(Number(entries).toLocaleString() + ' entries');
  const bagged = u.is_bagged || u.isBagged;
  const day = u.bag_day || u.bagDay;
  if (bagged) parts.push('Bagged' + (day ? ' Day ' + day : ''));
  return parts.join(' · ');
}

// ── Theme constants ──
export const THEME_ORDER = ['dark', 'dusk', 'light', 'cloudy'];
export const isDarkTheme = (t) => t === 'dark' || t === 'dusk';
export const THEME_ICON = { dark: 'moon', dusk: 'sunset', light: 'sun', cloudy: 'cloud' };
export const THEME_LABEL = { dark: 'Dark', dusk: 'Dusk', light: 'Light', cloudy: 'Cloudy' };
export const THEME_META = { dark: '#111111', dusk: '#0d1525', light: '#f5f5f5', cloudy: '#cbcbcb' };
