    // ── Haptic feedback ──
    function haptic(ms = 15) {
      try { if (navigator.vibrate) navigator.vibrate(ms); } catch {}
    }

    let _debugNow = localStorage.getItem('debugNow') || '';
    function setDebugNow(v) { _debugNow = v || ''; localStorage.setItem('debugNow', _debugNow); }
    function getToday() { return _debugNow ? _debugNow.slice(0, 10) : new Date().toISOString().slice(0, 10); }
    function getNow() { return _debugNow ? new Date(_debugNow).getTime() : Date.now(); }

    // ── Variant Color Map ─────────────────────────────────────
    const VARIANT_COLORS = {
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
    function getVariantColor(v) { return VARIANT_COLORS[v] ?? '#808080'; }

    // ── Multi-game variant expansion ─────────────────────────
    const MULTI_GAME_MAP = {
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

    const PILL_DISPLAY = {
      "Limit Hold'em": 'LHE', '7-Card Stud': 'Stud Hi',
      '2-7 Triple Draw': '2-7 TD', 'NL 2-7 Single Draw': 'NL 2-7 SD',
    };
    function pillName(g) { return PILL_DISPLAY[g] || g; }

    function getGamePills(gameVariant, eventName) {
      if (!gameVariant) return [];
      // Check predefined mixes first
      if (MULTI_GAME_MAP[gameVariant]) return MULTI_GAME_MAP[gameVariant];
      // Parse from event name for "Mixed" variants
      if (gameVariant === 'Mixed' && eventName) {
        const base = eventName.replace(/ - Day \d+$/, '').replace(/ - Flight [A-Z]$/, '');
        // Known named events
        if (/Poker Players Championship/i.test(base))
          return ['NLH', 'PLO', '2-7 TD', 'LHE', 'O8', 'Razz', 'Stud Hi', 'Stud 8', 'NL 2-7 SD', 'PLO8'];
        if (/Mixed Big Bet/i.test(base))
          return ['NLH', 'PLO', 'PLO8', 'Big O', 'PL 2-7 TD', 'NL 2-7 SD', 'PL 5CD Hi'];
        // "Mixed: PLO8, O8, Big O"
        const colonMatch = base.match(/Mixed:\s*(.+)/i);
        if (colonMatch) return colonMatch[1].split(/,\s*/).map(s => s.trim()).filter(Boolean);
        // "NLH / PLO Mixed" or "PLO/NLH Mixed"
        const slashMatch = base.match(/^([\w']+)\s*\/\s*([\w']+)/);
        if (slashMatch) return [slashMatch[1], slashMatch[2]];
        // "Mixed O8, Stud 8"
        const mixedPrefix = base.match(/^Mixed\s+(.+)/i);
        if (mixedPrefix) return mixedPrefix[1].split(/,\s*/).map(s => pillName(s.trim())).filter(Boolean);
      }
      return [pillName(gameVariant)];
    }

    const HAND_CONFIG_DEFAULT = { heroCards: 2, hasBoard: true, boardMax: 5, betting: 'nl', heroPlaceholder: 'AKhd', boardPlaceholder: 'QJ6hch' };
    // betting: 'nl' = no-limit, 'pl' = pot-limit, 'fl' = fixed-limit
    // flSmallStreets: which street indices use the small bet (rest use big bet)
    // raiseCap: max raises per street (0 = uncapped)
    const HAND_CONFIG = {
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
      // No-Limit stud variants
      'NL Stud Hi':  { heroCards: 7, hasBoard: false, boardMax: 0, betting: 'nl', isStud: true, heroPlaceholder: 'A9xxAKQJThdcsx' },
      'NL Stud 8':   { heroCards: 7, hasBoard: false, boardMax: 0, betting: 'nl', isStud: true, heroPlaceholder: 'A234567hdcshds' },
      'NL Razz':     { heroCards: 7, hasBoard: false, boardMax: 0, betting: 'nl', isStud: true, heroPlaceholder: 'A23x4567xhdscx' },
      // Pot-Limit stud variants
      'PL Stud Hi':  { heroCards: 7, hasBoard: false, boardMax: 0, betting: 'pl', isStud: true, heroPlaceholder: 'A9xxAKQJThdcsx' },
      'PL Stud 8':   { heroCards: 7, hasBoard: false, boardMax: 0, betting: 'pl', isStud: true, heroPlaceholder: 'A234567hdcshds' },
      'PL Razz':     { heroCards: 7, hasBoard: false, boardMax: 0, betting: 'pl', isStud: true, heroPlaceholder: 'A23x4567xhdscx' },
    };

    // ── Venue Color + Abbreviation Map ───────────────────────
    const VENUE_MAP = {
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
    function getVenueInfo(v) {
      return VENUE_MAP[v] ?? { abbr: v ? v.slice(0, 4).toUpperCase() : '?', color: '#808080', longName: v || '' };
    }

    // Actual branded pill colors for mini late-reg bar
    const VENUE_BRAND_VAR = {
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
    function getVenueBrandColor(abbr) {
      let cssVar = VENUE_BRAND_VAR[abbr];
      if (!cssVar) {
        cssVar = `--venue-${abbr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`;
        VENUE_BRAND_VAR[abbr] = cssVar;
      }
      return `var(${cssVar}, ${(VENUE_MAP[Object.keys(VENUE_MAP).find(k => VENUE_MAP[k].abbr === abbr)] || {}).color || '#808080'})`;
    }

    // ── Bracelet Event Detection ──────────────────────────────
    // Only Horseshoe/Paris events can be bracelet events.
    // Satellites and side events at HS/Paris are excluded by keyword.
    const NON_BRACELET_KEYWORDS = ['satellite', 'mega sat', 'super sat', 'qualifier', 'freeroll', 'charity', 'side event'];
    function isBraceletEvent(t) {
      if (t.is_satellite) return false;
      if (t.is_restart) return false;
      if ((t.category || '').toLowerCase() === 'side') return false;
      const v = (t.venue || '').toLowerCase();
      if (!v.includes('horseshoe') && !v.includes('paris') && v !== 'wsop europe') return false;
      const name = (t.event_name || '').toLowerCase();
      if (name.includes('circuit') && v !== 'wsop europe') return false;
      return !NON_BRACELET_KEYWORDS.some(kw => name.includes(kw));
    }

    // ── Venue → CSS class map (for row/card backgrounds) ──────
    const VENUE_CLASS_MAP = {
      'Horseshoe / Paris Las Vegas': 'venue-hs',
      'Horseshoe Las Vegas':         'venue-hs',
      'Paris Las Vegas':             'venue-hs',
      'Wynn Las Vegas':              'venue-wynn',
      'Wynn':                        'venue-wynn',
      'Aria':                        'venue-aria',
      'Aria Resort & Casino':        'venue-aria',
      'Golden Nugget':               'venue-gn',
    };
    function getVenueClass(t) {
      return VENUE_CLASS_MAP[t.venue] || '';
    }

    // Parse reentry string to max allowed entries (initial + re-entries)
    function getMaxEntries(reentry) {
      if (!reentry || reentry === 'N/A') return 1;
      if (/unlimited/i.test(reentry)) return 99;
      const num = parseInt(reentry);
      if (!isNaN(num)) return num + 1;
      return 2; // Bust-A-Play-B etc: treat as 1 re-entry
    }

    // ── Venue Timezone Mapping ─────────────────────────────
    var VENUE_TIMEZONES = {
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

    function getVenueTimezone(venue) {
      return VENUE_TIMEZONES[venue] || 'America/Los_Angeles';
    }

    // ── Venue GPS Coordinates ─────────────────────────────────
    const VENUE_COORDS = {
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

    // ── Haversine distance (miles) ────────────────────────────
    function haversineDistance(lat1, lon1, lat2, lon2) {
      const R = 3958.8; // Earth radius in miles
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function getVenueTzAbbr(venue) {
      var tz = getVenueTimezone(venue);
      try {
        var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date());
        var tzPart = parts.find(function(p) { return p.type === 'timeZoneName'; });
        return tzPart ? tzPart.value : '';
      } catch(e) { return ''; }
    }

    // Parse a date+time in the venue's timezone, returning a UTC ms timestamp
    function parseDateTimeInTz(date, time, venue) {
      if (!date) return NaN;
      var t = (time && time !== 'TBD') ? time : '12:00 AM';
      var tz = getVenueTimezone(venue);
      // Normalize date to ISO
      var isoDate = normaliseDate(date);
      if (!isoDate) return NaN;
      // Parse 12h time to 24h
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
      // Use Intl to find the UTC offset for this timezone at this date/time
      // Create a date string and parse in the venue TZ
      var dtStr = isoDate + 'T' + String(h).padStart(2, '0') + ':' + min + ':00';
      // Use a trick: format the date in the target TZ and compare to UTC
      try {
        // Create date assuming UTC, then adjust
        var naive = new Date(dtStr + 'Z');
        var utcStr = naive.toLocaleString('en-US', { timeZone: 'UTC' });
        var tzStr = naive.toLocaleString('en-US', { timeZone: tz });
        var utcMs = new Date(utcStr).getTime();
        var tzMs = new Date(tzStr).getTime();
        var offset = utcMs - tzMs; // offset in ms from TZ to UTC
        // The actual UTC time is: naive + offset
        return naive.getTime() + offset;
      } catch(e) {
        return new Date(dtStr).getTime();
      }
    }

    // ── Helpers ──────────────────────────────────────────────

    function normaliseDate(d) {
      if (!d) return '';
      if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
      var dt = new Date(d + ' 12:00:00');
      if (isNaN(dt.getTime())) return '';
      var y = dt.getFullYear();
      var m = String(dt.getMonth() + 1).padStart(2, '0');
      var day = String(dt.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    }

    function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
    function addDays(dateStr, n) { const d = new Date(dateStr); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
    function fmtShortDate(d) { const dt = new Date(d + 'T12:00:00'); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

    // Parse a tournament's date + time into a ms timestamp for comparison
    function parseTournamentTime(t) {
      const time = (t.time && t.time !== 'TBD') ? t.time : '12:00 AM';
      return parseDateTime(t.date, time);
    }

    // Safely parse a date + time into a ms timestamp.
    // Handles both ISO ("2026-03-26") and human ("March 26, 2026") dates,
    // and both 12h ("1:00 PM") and 24h ("13:00") times.
    function parseDateTime(date, time) {
      if (!date) return NaN;
      const t = (time && time !== 'TBD') ? time : '12:00 AM';
      // If date is already ISO, combine properly
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        // Convert 12h time to 24h for ISO format
        const m24 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (m24) {
          let h = parseInt(m24[1]);
          if (m24[3].toUpperCase() === 'PM' && h !== 12) h += 12;
          if (m24[3].toUpperCase() === 'AM' && h === 12) h = 0;
          return new Date(`${date}T${String(h).padStart(2,'0')}:${m24[2]}:00`).getTime();
        }
        // Already 24h
        return new Date(`${date}T${t}:00`).getTime();
      }
      // Human-readable date — space-separated parsing works
      return new Date(`${date} ${t}`).getTime();
    }

    // Parse a late_reg_end value into a ms timestamp.
    // WSOP stores full ISO ("2026-05-26T18:00:00"), IPO stores bare time ("16:00").
    function parseLateRegEnd(lateRegEnd, eventDate) {
      if (!lateRegEnd) return NaN;
      // If it looks like a full datetime, parse directly
      if (lateRegEnd.length > 10) return new Date(lateRegEnd).getTime();
      // Bare time like "16:00" — combine with the event date
      const isoDate = normaliseDate(eventDate);
      if (isoDate) return new Date(`${isoDate}T${lateRegEnd}:00`).getTime();
      return NaN;
    }

    // Find the best flight of a multi-flight event: the first flight strictly after satDateTime
    function findClosestFlight(flights, satTimestamp) {
      if (flights.length === 0) return null;
      const withTime = flights
        .map(f => ({ id: f.id, date: normaliseDate(f.date), ts: parseTournamentTime(f) }))
        .sort((a, b) => a.ts - b.ts);
      // First flight strictly after the satellite
      const after = withTime.find(f => f.ts > satTimestamp);
      if (after) return after;
      // Fallback: last flight (all are before/concurrent — shouldn't happen in practice)
      return withTime[withTime.length - 1];
    }

    // Returns earlier events on the user's schedule that may still be running
    // when this event starts — i.e. events the user could bust from to play this one.
    function getIfIBustEvents(event, allTournaments, scheduleIds) {
      if (!event || !allTournaments || !scheduleIds) return [];
      var eventStart = parseDateTime(event.date, event.time);
      if (isNaN(eventStart)) return [];
      var sameDate = normaliseDate(event.date);
      return allTournaments.filter(function(t) {
        if (t.id === event.id) return false;
        if (t.venue !== event.venue) return false;
        // Must be on the user's schedule
        if (!scheduleIds.has(t.id)) return false;
        var tDate = normaliseDate(t.date);
        if (tDate !== sameDate) return false;
        var tStart = parseDateTime(t.date, t.time);
        if (isNaN(tStart)) return false;
        // Must start before this event (earlier in the day)
        if (tStart >= eventStart) return false;
        return true;
      }).sort(function(a, b) {
        return parseDateTime(a.date, a.time) - parseDateTime(b.date, b.time);
      });
    }

    function formatBuyin(val, venue) {
      if (!val && val !== 0) return '—';
      return currencySymbol(venue || '') + Number(val).toLocaleString();
    }

    function calculateCountdown(date, time, venue) {
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

    function getOrdinal(n) {
      const s = ['th','st','nd','rd'];
      const v = n % 100;
      return s[(v - 20) % 10] || s[v] || s[0];
    }

    // ── POY Points ────────────────────────────────────────────
    const NON_POY_KEYWORDS = ['senior', 'super senior', 'ladies', 'tag team',
                              'industry', 'employees', 'online'];

    function isPOYEligible(t) {
      if (!isBraceletEvent(t)) return false;
      const name = (t.event_name || '').toLowerCase();
      return !NON_POY_KEYWORDS.some(kw => name.includes(kw));
    }

    function isSixMax(eventName) {
      return /6[- ]?handed|6[- ]?max/i.test(eventName || '');
    }

    function calculatePOYPoints(buyin, finishPlace, totalEntries, cashed, eventName) {
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

    function extractConditions(t, sharedView) {
      if (!t.conditions_json) return [];
      const isPublic = !!t.condition_is_public;
      if (sharedView && !isPublic) return [];
      try {
        const conditions = JSON.parse(t.conditions_json);
        return Array.isArray(conditions) ? conditions : [];
      } catch { return []; }
    }

    function formatConditionLabel(c, allTournaments) {
      if (c.type === 'PROFIT_THRESHOLD') return `If up $${Number(c.profitThreshold).toLocaleString()}`;
      const dep = allTournaments && allTournaments.find(t => t.id === c.dependsOnId);
      const num = dep ? dep.event_number : '?';
      return c.type === 'IF_WIN_SEAT' ? `If seat #${num}` : `If no seat #${num}`;
    }

    function formatConditionBadge(c, allTournaments) {
      if (c.type === 'PROFIT_THRESHOLD') return `💰 If up $${Number(c.profitThreshold).toLocaleString()}`;
      const dep = allTournaments && allTournaments.find(t => t.id === c.dependsOnId);
      const num = dep ? dep.event_number : '?';
      return c.type === 'IF_WIN_SEAT' ? `🎯 If seat from #${num}` : `🔄 If no seat from #${num}`;
    }

    function detectConflicts(schedule) {
      // Returns { conflicts, expectedConflicts } — Sets of tournament ids
      // expectedConflicts: overlaps involving at least one conditional event (no warning)
      // conflicts: overlaps between two firm events (show warning)
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


    window.haptic = haptic;
    window.setDebugNow = setDebugNow;
    window.getToday = getToday;
    window.getNow = getNow;
    window.VARIANT_COLORS = VARIANT_COLORS;
    window.getVariantColor = getVariantColor;
    window.MULTI_GAME_MAP = MULTI_GAME_MAP;
    window.PILL_DISPLAY = PILL_DISPLAY;
    window.pillName = pillName;
    window.getGamePills = getGamePills;
    window.HAND_CONFIG_DEFAULT = HAND_CONFIG_DEFAULT;
    window.HAND_CONFIG = HAND_CONFIG;
    window.VENUE_MAP = VENUE_MAP;
    window.getVenueInfo = getVenueInfo;
    window.VENUE_BRAND_VAR = VENUE_BRAND_VAR;
    window.getVenueBrandColor = getVenueBrandColor;
    window.NON_BRACELET_KEYWORDS = NON_BRACELET_KEYWORDS;
    window.isBraceletEvent = isBraceletEvent;
    window.VENUE_CLASS_MAP = VENUE_CLASS_MAP;
    window.getVenueClass = getVenueClass;
    window.getMaxEntries = getMaxEntries;
    window.VENUE_TIMEZONES = VENUE_TIMEZONES;
    window.VENUE_COORDS = VENUE_COORDS;
    window.haversineDistance = haversineDistance;
    window.getVenueTimezone = getVenueTimezone;
    window.getVenueTzAbbr = getVenueTzAbbr;
    window.parseDateTimeInTz = parseDateTimeInTz;
    window.normaliseDate = normaliseDate;
    window.daysBetween = daysBetween;
    window.addDays = addDays;
    window.fmtShortDate = fmtShortDate;
    window.parseTournamentTime = parseTournamentTime;
    window.parseDateTime = parseDateTime;
    window.parseLateRegEnd = parseLateRegEnd;
    window.findClosestFlight = findClosestFlight;
    window.getIfIBustEvents = getIfIBustEvents;
    window.formatBuyin = formatBuyin;
    window.calculateCountdown = calculateCountdown;
    window.getOrdinal = getOrdinal;
    window.NON_POY_KEYWORDS = NON_POY_KEYWORDS;
    window.isPOYEligible = isPOYEligible;
    window.isSixMax = isSixMax;
    window.calculatePOYPoints = calculatePOYPoints;
    window.extractConditions = extractConditions;
    window.formatConditionLabel = formatConditionLabel;
    window.formatConditionBadge = formatConditionBadge;
    window.detectConflicts = detectConflicts;
