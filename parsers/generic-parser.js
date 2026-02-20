// Generic Tournament Schedule PDF Parser
// Handles tabular poker schedule PDFs from any venue (MGM, WPT, Wynn, etc.)
// Row-based parsing strategy: detects row boundaries via day-of-week + date patterns,
// accumulates multi-line rows, then extracts fields from each row.

const { classifyGameVariant } = require('./wsop-parser');

const DAYS_RE = /\b(MON|TUES|WED|THURS|FRI|SAT|SUN)\b/i;
const MONTHS_RE = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i;
const MONTH_FULL = {
  JAN: 'January', FEB: 'February', MAR: 'March', APR: 'April',
  MAY: 'May', JUN: 'June', JUL: 'July', AUG: 'August',
  SEP: 'September', OCT: 'October', NOV: 'November', DEC: 'December'
};

// Detect whether a line starts a new table row:
// Must contain a day-of-week AND a month+day, with optional leading event number
const ROW_START_RE = /^(\d{1,3}[A-G]?\s+)?(MON|TUES|WED|THURS|FRI|SAT|SUN)\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2}\b/i;

// Known venue names to auto-detect from PDF text
const KNOWN_VENUES = [
  'MGM NATIONAL HARBOR', 'MGM GRAND', 'WYNN', 'ENCORE', 'VENETIAN',
  'ARIA', 'BELLAGIO', 'RESORTS WORLD', 'GOLDEN NUGGET', 'SOUTH POINT',
  'ORLEANS', 'HORSESHOE', 'PARIS LAS VEGAS', 'SEMINOLE HARD ROCK',
  'BORGATA', 'FOXWOODS', 'MOHEGAN SUN', 'THUNDER VALLEY',
  'CHOCTAW', 'BIKE', 'COMMERCE', 'HARD ROCK HOLLYWOOD'
];

// Footer/disclaimer patterns to strip
const FOOTER_RE = /MUST BE 21\+|PLEASE PLAY RESPONSIBLY|GAMBLER|GAMBLING ?HELP|NO LONGER WITHHOLDS|AUTO-GRATUITY|OPTIONAL ADD-ON|STRUCTURE SHEETS FOR A COMPLETE/i;

function parseGenericSchedule(text, options = {}) {
  const pages = text.split(/-- \d+ of \d+ --/).filter(p => p.trim());
  const allText = pages.join('\n');

  // ── Step 1: Extract metadata from headers ─────────────────
  const year = detectYear(allText);
  const venue = options.venue || detectVenue(allText);
  const seriesName = detectSeriesName(allText);

  // ── Step 2: Collect all data lines (skip headers & footers) ──
  const dataLines = [];
  let pastHeader = false;

  for (const page of pages) {
    const lines = page.split('\n');
    let pageHeaderDone = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Skip footer/disclaimer lines
      if (FOOTER_RE.test(line)) continue;

      // Detect column header row — skip it but mark that we're past it
      if (isColumnHeaderLine(line)) {
        pageHeaderDone = true;
        continue;
      }

      // Skip pre-header metadata lines (venue name, series title, date range)
      if (!pageHeaderDone) {
        // Also skip lines that are part of the page header area
        if (isMetadataLine(line, year)) continue;
        // If we haven't seen a header yet but this looks like data, force past
        if (ROW_START_RE.test(line)) {
          pageHeaderDone = true;
        } else {
          continue;
        }
      }

      dataLines.push(line);
    }
  }

  // ── Step 3: Group lines into rows ─────────────────────────
  const rows = groupIntoRows(dataLines);

  // ── Step 4: Parse each row into a tournament object ───────
  const tournaments = [];
  for (const row of rows) {
    const parsed = parseRow(row, year, venue);
    if (parsed) {
      tournaments.push(parsed);
    }
  }

  // ── Step 5: Post-process — link restarts to parents ───────
  linkRestartsToParents(tournaments);

  return tournaments;
}

// ── Header / metadata detection ─────────────────────────────

function isColumnHeaderLine(line) {
  const lower = line.toLowerCase().trim();
  // Column header fragments from multi-line table headers
  // These are standalone lines like "Event", "# Day  Date  Time  Event Total", "Entry", "Prize", "Pool", etc.
  // Must NOT match actual data rows (which start with day-of-week + date)
  if (ROW_START_RE.test(line)) return false;

  // Exact single-word header fragments
  const headerFragments = [
    /^event$/i, /^#\s*day\b/i, /^entry$/i, /^prize$/i, /^pool$/i,
    /^house$/i, /^fee$/i, /^opt$/i, /^add-on\b/i, /^chips$/i, /^levels$/i,
    /^buy-in$/i, /^total$/i
  ];
  if (headerFragments.some(re => re.test(lower))) return true;

  // Multi-word header line containing tab-separated column names
  // e.g., "# Day \tDate \tTime \tEvent Total"
  if (/^#\s*Day\s/i.test(line) && /Date/i.test(line) && /Time/i.test(line)) return true;

  return false;
}

function isMetadataLine(line, year) {
  // Series name, venue name, date range lines
  if (/^\d{4}\s+POTOMAC|POKER OPEN|WINTER|SUMMER|SPRING|CLASSIC|CHAMPIONSHIP/i.test(line)) return true;
  if (/^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d/i.test(line)) return true;
  if (new RegExp(`\\b${year}\\b`).test(line) && !ROW_START_RE.test(line)) return true;
  if (KNOWN_VENUES.some(v => line.toUpperCase().includes(v)) && !ROW_START_RE.test(line)) return true;
  if (/^PRESENTED BY/i.test(line)) return true;
  return false;
}

// ── Year detection ──────────────────────────────────────────

function detectYear(text) {
  // Look for a 4-digit year in header area (first ~500 chars)
  const header = text.slice(0, 500);
  const m = header.match(/\b(202\d|203\d)\b/);
  if (m) return parseInt(m[1]);
  // Fallback: current year
  return new Date().getFullYear();
}

// ── Venue detection ─────────────────────────────────────────

// Proper display names for known venues
const VENUE_DISPLAY = {
  'MGM NATIONAL HARBOR': 'MGM National Harbor',
  'MGM GRAND': 'MGM Grand',
  'WYNN': 'Wynn Las Vegas',
  'ENCORE': 'Wynn Las Vegas',
  'VENETIAN': 'Venetian',
  'ARIA': 'Aria',
  'BELLAGIO': 'Bellagio',
  'RESORTS WORLD': 'Resorts World',
  'GOLDEN NUGGET': 'Golden Nugget',
  'SOUTH POINT': 'South Point',
  'ORLEANS': 'Orleans',
  'HORSESHOE': 'Horseshoe / Paris Las Vegas',
  'PARIS LAS VEGAS': 'Horseshoe / Paris Las Vegas',
  'SEMINOLE HARD ROCK': 'Seminole Hard Rock',
  'BORGATA': 'Borgata',
  'FOXWOODS': 'Foxwoods',
  'MOHEGAN SUN': 'Mohegan Sun',
  'THUNDER VALLEY': 'Thunder Valley',
  'CHOCTAW': 'Choctaw',
  'BIKE': 'The Bicycle Casino',
  'COMMERCE': 'Commerce Casino',
  'HARD ROCK HOLLYWOOD': 'Hard Rock Hollywood',
};

function detectVenue(text) {
  const upper = text.toUpperCase();
  for (const v of KNOWN_VENUES) {
    if (upper.includes(v)) {
      return VENUE_DISPLAY[v] || v;
    }
  }
  return 'Unknown Venue';
}

// ── Series name detection ───────────────────────────────────

function detectSeriesName(text) {
  const header = text.slice(0, 500);
  // Look for lines with POKER OPEN, CLASSIC, CHAMPIONSHIP, etc.
  const m = header.match(/(\w[\w\s]*(?:POKER OPEN|CLASSIC|CHAMPIONSHIP|SERIES|FESTIVAL|OPEN|CIRCUIT))/i);
  return m ? m[1].trim() : null;
}

// ── Group lines into rows ───────────────────────────────────

function groupIntoRows(lines) {
  const rows = [];
  let currentRow = null;

  for (const line of lines) {
    if (ROW_START_RE.test(line)) {
      // Start a new row
      if (currentRow) rows.push(currentRow);
      currentRow = [line];
    } else if (currentRow) {
      // Continuation of current row
      currentRow.push(line);
    }
    // Lines before first row boundary are ignored
  }
  if (currentRow) rows.push(currentRow);

  return rows;
}

// ── Parse a single row (array of lines) into tournament obj ─

function parseRow(rowLines, year, venue) {
  // Join all lines with space for field extraction
  // But keep original lines for event name reconstruction
  const joined = rowLines.join(' ').replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();
  const firstLine = rowLines[0].replace(/\t+/g, ' ');

  // ── Extract event number (optional, at start of first line)
  let eventNumber = '';
  const evNumMatch = firstLine.match(/^(\d{1,3}[A-G]?)\s+(MON|TUES|WED|THURS|FRI|SAT|SUN)/i);
  if (evNumMatch) {
    eventNumber = evNumMatch[1];
  }

  // ── Extract day + date
  const dateMatch = joined.match(/(MON|TUES|WED|THURS|FRI|SAT|SUN)\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2})/i);
  if (!dateMatch) return null;

  const monthAbbr = dateMatch[2].toUpperCase();
  const day = parseInt(dateMatch[3]);
  const fullMonth = MONTH_FULL[monthAbbr] || monthAbbr;
  const dateStr = `${fullMonth} ${day}, ${year}`;

  // ── Extract time
  const timeMatch = joined.match(/\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\b/i);
  const time = timeMatch ? timeMatch[1].replace(/\s+/g, '').toUpperCase() : 'TBD';

  // ── Extract dollar amounts (Total Entry, Prize Pool, House Fee, Opt Add-On)
  const dollarAmounts = [];
  const dollarRe = /\$[\d,]+/g;
  let dm;
  // We need to be careful: guaranteed amounts like "$500,000" appear in event names
  // Find ALL dollar matches, then separate name-embedded ones from column values
  const allDollars = [];
  while ((dm = dollarRe.exec(joined)) !== null) {
    allDollars.push({ value: parseInt(dm[0].replace(/[$,]/g, '')), index: dm.index, raw: dm[0] });
  }

  // Dollar amounts in the "column" area are the ones at/after the event name section
  // Heuristic: the "total entry" price is usually <= $10,000 and appears near the end
  // Guaranteed amounts are >= $10,000 and appear in the event name
  // Better approach: find the time position, then the event name, then column values

  // Strategy: after the time, find the event name region, then column values
  const timeEndIdx = timeMatch ? timeMatch.index + timeMatch[0].length : 0;

  // Find where column dollar values start by looking for the pattern of consecutive $ amounts
  // Column values are tightly packed: $600 $505 $55 $40
  // Guaranteed amounts are followed by "GUARANTEED" text

  const columnDollars = [];
  const nameDollars = [];

  for (const d of allDollars) {
    // Check if this dollar amount is followed by "GUARANTEED" or "guaranteed" or preceded by ","
    // or is inside the event name (before the column region)
    const afterText = joined.slice(d.index + d.raw.length, d.index + d.raw.length + 15);
    const beforeText = joined.slice(Math.max(0, d.index - 5), d.index);

    if (/^\s*GUARANTEED/i.test(afterText) || /,\s*$/.test(beforeText)) {
      nameDollars.push(d);
    } else if (d.index > timeEndIdx) {
      columnDollars.push(d);
    }
  }

  // Also handle special case: "$300 PER TEAM" or "$150 PER PLAYER" or "$140 REBUYS"
  // These are name-embedded dollar amounts
  const filteredColumnDollars = columnDollars.filter(d => {
    const after = joined.slice(d.index + d.raw.length, d.index + d.raw.length + 20);
    return !/^\s*(PER |REBUY|GUARANTEE)/i.test(after);
  });

  // Total Entry = first column dollar, Prize Pool = second, House Fee = third, Opt Add-On = fourth
  const totalEntry = filteredColumnDollars[0] ? filteredColumnDollars[0].value : 0;
  const prizePool = filteredColumnDollars[1] ? filteredColumnDollars[1].value : null;
  const houseFee = filteredColumnDollars[2] ? filteredColumnDollars[2].value : null;
  const optAddOn = filteredColumnDollars[3] ? filteredColumnDollars[3].value : null;

  // ── Extract chips (pattern: \d+K)
  const chipsMatch = joined.match(/\b(\d+)K\b/i);
  const startingChips = chipsMatch ? parseInt(chipsMatch[1]) * 1000 : null;

  // ── Extract levels (trailing number, possibly with comma like "30,40")
  // Levels is the last numeric value in the row, after chips
  let levelDuration = '';
  const levelsMatch = joined.match(/\b(\d{1,2}(?:\s*,\s*\d{1,2})?)\s*$/);
  if (levelsMatch) {
    levelDuration = levelsMatch[1].replace(/\s/g, '');
  }

  // ── Extract event name — everything between time and the first column dollar amount
  let eventName = '';
  if (timeMatch && filteredColumnDollars.length > 0) {
    const nameStart = timeMatch.index + timeMatch[0].length;
    const nameEnd = filteredColumnDollars[0].index;
    eventName = joined.slice(nameStart, nameEnd).trim();
  } else if (timeMatch) {
    // No column dollars (restart/freeroll) — name is everything after time, minus chips/levels at end
    const nameStart = timeMatch.index + timeMatch[0].length;
    let raw = joined.slice(nameStart).trim();
    // Remove trailing chips and levels: "... 10K 20" or just "RESTART"
    raw = raw.replace(/\s+\d+K\s+\d{1,2}(?:,\d{1,2})?\s*$/, '').trim();
    raw = raw.replace(/\s+\d+K\s*$/, '').trim();
    eventName = raw;
  }

  // Clean up event name
  eventName = eventName
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove trailing/leading punctuation artifacts
  eventName = eventName.replace(/^[\s\t]+|[\s\t]+$/g, '');

  // ── Detect restart
  const isRestart = /\bRESTART\b/i.test(eventName) || /\bFINAL TABLE\b/i.test(eventName);

  // ── Detect satellite
  const isSatellite = /\bSATELLITE\b/i.test(eventName) || /\bSUPER SAT/i.test(eventName);

  // ── Detect freeroll
  const isFreeroll = /\bFREEROLL\b/i.test(eventName) || /\bINVITE\s*ONLY\b/i.test(joined);

  // ── Extract guarantee info for notes
  const notes = [];
  const guarMatch = joined.match(/\$([\d,]+)\s*GUARANTEED/i);
  if (guarMatch) notes.push(`$${guarMatch[1]} Guaranteed`);
  if (/\bBOUNTY\b/i.test(eventName)) notes.push('Bounty');
  if (/\bFREEZEOUT\b/i.test(eventName)) notes.push('Freezeout');
  if (/\bTURBO\b/i.test(eventName)) notes.push('Turbo');
  const multiDayMatch = eventName.match(/\((\d)-DAY EVENT\)/i);
  if (multiDayMatch) notes.push(`${multiDayMatch[1]}-Day Event`);
  if (/\bSINGLE RE-ENTRY\b/i.test(eventName)) notes.push('Single Re-Entry');

  // ── Extract target event for satellites
  let targetEvent = null;
  if (isSatellite) {
    // "EVENT 1 MILESTONE SATELLITE" → target = "1"
    // "MAIN EVENT SUPER SATELLITE" → target = "MAIN EVENT"
    // "EVENT 14 MILESTONE SATELLITE" → target = "14"
    const satTargetMatch = eventName.match(/EVENT\s+(\d+)\s+.*SATELLITE/i);
    if (satTargetMatch) {
      targetEvent = satTargetMatch[1];
    } else if (/MAIN EVENT/i.test(eventName)) {
      targetEvent = 'MAIN EVENT';
    }
  }

  // ── Extract parent event for restarts
  let parentEvent = null;
  if (isRestart) {
    // "EVENT 1 NLH OPENER DAY 2 RESTART" → parent = "1"
    // "EVENT 13 DOUBLE STACK NLH DAY 2 RESTART" → parent = "13"
    // "NLH MAIN EVENT DAY 2 RESTART" → parent = "MAIN EVENT"
    // "EVENT 21 NLH DAY 2 RESTART" → parent = "21"
    const parentMatch = eventName.match(/EVENT\s+(\d+)/i);
    if (parentMatch) {
      parentEvent = parentMatch[1];
    } else if (/MAIN EVENT/i.test(eventName)) {
      parentEvent = 'MAIN EVENT';
    }
  }

  // ── Determine buy-in
  // For restarts, there's no buy-in (it's a continuation)
  // For freerolls, buy-in is 0
  // For "INVITE ONLY" with an add-on amount, use the add-on as pseudo buy-in (or 0)
  let buyin = totalEntry;
  if (isRestart) buyin = 0;
  if (isFreeroll) buyin = 0;

  // ── Compute rake
  // Rake = everything that doesn't go to the prize pool
  // House Fee is the explicit house take; Opt Add-On is staff gratuity (not in prize pool).
  // Rake % = (Total Entry - Prize Pool) / Total Entry
  // Fine print note: MGM says "no longer withholds auto-gratuity from buy-in... each event
  // will offer an optional add-on, included in the total buy-in." So the add-on is included
  // in Total Entry and does NOT go into the prize pool — it's part of the effective rake.
  let rakePercent = null;
  let rakeDollars = null;
  if (totalEntry > 0 && prizePool !== null && prizePool > 0) {
    rakeDollars = totalEntry - prizePool;
    rakePercent = Math.round((rakeDollars / totalEntry) * 1000) / 10; // one decimal
  }

  // ── Classify game variant
  const gameVariant = classifyGameVariant(eventName);

  return {
    eventNumber: eventNumber,
    eventName: cleanEventName(eventName),
    date: dateStr,
    time: time,
    buyin: buyin,
    prizePool: prizePool,
    houseFee: houseFee,
    optAddOn: optAddOn,
    rakePct: rakePercent,
    rakeDollars: rakeDollars,
    startingChips: startingChips,
    levelDuration: levelDuration,
    reentry: null, // Generic PDFs often don't have a re-entry column
    lateReg: null,  // Generic PDFs often don't have a late-reg column
    gameVariant: gameVariant,
    venue: venue,
    notes: notes.length > 0 ? notes.join(', ') : null,
    isSatellite: isSatellite,
    isRestart: isRestart,
    targetEvent: targetEvent,
    parentEvent: parentEvent
  };
}

// ── Clean up event name for display ─────────────────────────

function cleanEventName(name) {
  return name
    // Remove guarantee text (it's in notes)
    .replace(/\$[\d,]+\s*GUARANTEED\s*/gi, '')
    // Remove trailing quote artifacts
    .replace(/[""]$/g, '')
    // Remove stray "INVITE ONLY" that got mixed in
    .replace(/\s*INVITE\s*ONLY\s*/gi, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Link restart events to their parent events ──────────────

function linkRestartsToParents(tournaments) {
  // Build a map of event numbers to find the parent
  const eventMap = {};
  for (const t of tournaments) {
    if (t.eventNumber && !t.isRestart) {
      // Strip flight letter for base event number: "1A" → "1"
      const base = t.eventNumber.replace(/[A-G]$/i, '');
      if (!eventMap[base]) eventMap[base] = t;
    }
  }

  // For restarts without a parentEvent, try to infer from event name
  for (const t of tournaments) {
    if (t.isRestart && !t.parentEvent) {
      // Try to match event name patterns
      for (const [num, parent] of Object.entries(eventMap)) {
        // Check if the restart name references this event number or name
        if (t.eventName.includes(`EVENT ${num} `) ||
            t.eventName.includes(`EVENT ${num}\t`)) {
          t.parentEvent = num;
          break;
        }
      }
    }
  }
}

// ── Format auto-detection ───────────────────────────────────

function detectFormat(pdfText) {
  // WSOP column-layout format: has specific section headers
  if (pdfText.includes('EV#') && pdfText.includes('LVL') &&
      (pdfText.includes('RE-ENTRY') || pdfText.includes('LATE'))) {
    return 'wsop';
  }

  // Generic table format: has day-of-week + date patterns in data rows
  if (ROW_START_RE.test(pdfText)) {
    return 'generic';
  }

  return 'generic'; // default fallback
}

module.exports = { parseGenericSchedule, detectFormat };
