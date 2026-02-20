// WSOP PDF Parser
// Strategy: The PDF extracts as columns, but we know the structure:
// Each page has a fixed number of rows, and columns are in fixed order

// ── WSOP 2026 Rake Table by Buy-In Tier ────────────────────
// Source: Official WSOP 2026 structure sheets PDF
// Entry Fee = house/registration fee; Dealer/Staff = tokes/gratuity
// Both are withheld from total entry pool (the full buy-in amount)
// Ratio is consistently ~70/30 (entry fees to dealer/staff) across all tiers
const WSOP_RAKE_BY_BUYIN = {
  300:    { entryFeePct: 12.6, dealerStaffPct: 5.4, totalPct: 18.0 },
  400:    { entryFeePct: 12.25, dealerStaffPct: 5.25, totalPct: 17.5 },
  500:    { entryFeePct: 11.9, dealerStaffPct: 5.1, totalPct: 17.0 },
  550:    { entryFeePct: 11.9, dealerStaffPct: 5.1, totalPct: 17.0 },
  600:    { entryFeePct: 11.2, dealerStaffPct: 4.8, totalPct: 16.0 },
  800:    { entryFeePct: 8.75, dealerStaffPct: 3.75, totalPct: 12.5 },
  1000:   { entryFeePct: 8.4,  dealerStaffPct: 3.6, totalPct: 12.0 },
  1500:   { entryFeePct: 8.05, dealerStaffPct: 3.45, totalPct: 11.5 },
  1700:   { entryFeePct: 8.05, dealerStaffPct: 3.45, totalPct: 11.5 },
  2000:   { entryFeePct: 7.7,  dealerStaffPct: 3.3, totalPct: 11.0 },
  2500:   { entryFeePct: 7.7,  dealerStaffPct: 3.3, totalPct: 11.0 },
  3000:   { entryFeePct: 7.7,  dealerStaffPct: 3.3, totalPct: 11.0 },
  5000:   { entryFeePct: 5.6,  dealerStaffPct: 2.4, totalPct: 8.0 },
  10000:  { entryFeePct: 4.9,  dealerStaffPct: 2.1, totalPct: 7.0 },
  25000:  { entryFeePct: 4.2,  dealerStaffPct: 1.8, totalPct: 6.0 },
  50000:  { entryFeePct: 3.5,  dealerStaffPct: 1.5, totalPct: 5.0 },
  100000: { entryFeePct: 2.8,  dealerStaffPct: 1.2, totalPct: 4.0 },
  250000: { entryFeePct: 1.4,  dealerStaffPct: 0.6, totalPct: 2.0 },
};

// Special-case events with non-standard rake
const WSOP_RAKE_OVERRIDES = {
  // Event #59 Salute to Warriors ($500) — charity event, reduced rake
  '59': { entryFeePct: 7.0, dealerStaffPct: 3.0, totalPct: 10.0 },
};

/**
 * Look up rake for a WSOP event by buy-in amount and optional event number.
 * Returns { rakePct, rakeDollars, prizePool, houseFee, optAddOn } or nulls if unknown.
 */
function getWSOPRake(buyin, eventNumber) {
  // Check for event-specific override first
  if (eventNumber && WSOP_RAKE_OVERRIDES[eventNumber]) {
    const override = WSOP_RAKE_OVERRIDES[eventNumber];
    const rakeDollars = Math.round(buyin * override.totalPct / 100);
    const houseFee = Math.round(buyin * override.entryFeePct / 100);
    const dealerStaff = Math.round(buyin * override.dealerStaffPct / 100);
    return {
      rakePct: override.totalPct,
      rakeDollars: rakeDollars,
      prizePool: buyin - rakeDollars,
      houseFee: houseFee,
      optAddOn: dealerStaff  // WSOP calls it "dealer/staff" but maps to our optAddOn field
    };
  }

  // Look up by buy-in tier
  const tier = WSOP_RAKE_BY_BUYIN[buyin];
  if (tier) {
    const rakeDollars = Math.round(buyin * tier.totalPct / 100);
    const houseFee = Math.round(buyin * tier.entryFeePct / 100);
    const dealerStaff = Math.round(buyin * tier.dealerStaffPct / 100);
    return {
      rakePct: tier.totalPct,
      rakeDollars: rakeDollars,
      prizePool: buyin - rakeDollars,
      houseFee: houseFee,
      optAddOn: dealerStaff
    };
  }

  // Fallback: find the nearest tier (lower preferred, smallest if below all tiers)
  const tiers = Object.keys(WSOP_RAKE_BY_BUYIN).map(Number).sort((a, b) => a - b);
  let bestTier = null;
  for (const t of tiers) {
    if (t <= buyin) bestTier = t;
    else break;
  }
  // If buyin is below all tiers, use the lowest tier (e.g. $300 for satellites < $300)
  if (bestTier === null && tiers.length > 0) {
    bestTier = tiers[0];
  }
  if (bestTier !== null) {
    const tier = WSOP_RAKE_BY_BUYIN[bestTier];
    const rakeDollars = Math.round(buyin * tier.totalPct / 100);
    const houseFee = Math.round(buyin * tier.entryFeePct / 100);
    const dealerStaff = Math.round(buyin * tier.dealerStaffPct / 100);
    return {
      rakePct: tier.totalPct,
      rakeDollars: rakeDollars,
      prizePool: buyin - rakeDollars,
      houseFee: houseFee,
      optAddOn: dealerStaff
    };
  }

  return { rakePct: null, rakeDollars: null, prizePool: null, houseFee: null, optAddOn: null };
}

function parseWSOP2025Schedule(text, year = 2026) {
  const tournaments = [];
  const pages = text.split(/-- \d+ of \d+ --/).filter(p => p.trim());

  for (const page of pages) {
    // Skip info pages
    if (page.includes('Consult structure sheets') ||
        page.includes('Specialty Landmark') ||
        page.includes('Take-Out Percentages')) {
      continue;
    }

    const pageTournaments = parsePage(page, year);
    tournaments.push(...pageTournaments);
  }

  return tournaments;
}

function parsePage(pageText, year) {
  const lines = pageText.split('\n').map(l => l.trim()).filter(l => l);

  // Find each column's data by looking for section headers
  const sections = findSections(lines);

  if (!sections.eventNumbers || sections.eventNumbers.length === 0) {
    return [];
  }

  // The key insight: event numbers and event names are 1:1
  // Everything else needs to be mapped via position

  const numEvents = sections.eventNumbers.length;
  const tournaments = [];

  // Build a mapping: which buy-in rows are actual tournaments vs skipped rows
  // A row is skipped if it has "-" for buy-in (like Registration Opens or MAIN EVENT days)
  const validBuyinIndices = [];
  sections.allBuyins.forEach((b, idx) => {
    if (b !== null) validBuyinIndices.push(idx);
  });

  for (let i = 0; i < numEvents; i++) {
    const eventNum = sections.eventNumbers[i];
    const eventName = sections.eventNames[i] || '';

    // Skip MAIN EVENT continuation days that slipped through
    if (eventName.match(/^MAIN EVENT\s*-\s*(Day\s+\d|Day\s+Off|Plays|Final)/i)) {
      continue;
    }

    // Get the row index for this event in the full table
    const rowIdx = validBuyinIndices[i];

    if (rowIdx === undefined) continue;

    const buyin = sections.allBuyins[rowIdx];
    if (!buyin || buyin < 100) continue;

    // Look up rake for this event
    const rake = getWSOPRake(buyin, eventNum);

    tournaments.push({
      eventNumber: eventNum,
      eventName: eventName,
      date: sections.dates[rowIdx] ? `${sections.dates[rowIdx]}, ${year}` : '',
      time: sections.times[rowIdx] || 'TBD',
      buyin: buyin,
      prizePool: rake.prizePool,
      houseFee: rake.houseFee,
      optAddOn: rake.optAddOn,
      rakePct: rake.rakePct,
      rakeDollars: rake.rakeDollars,
      startingChips: sections.chips[i] || null,
      levelDuration: sections.durations[i] || '',
      reentry: sections.reentries[i] || '',
      lateReg: sections.lateRegs[i] || '',
      gameVariant: classifyGameVariant(eventName),
      venue: 'WSOP Las Vegas'
    });
  }

  return tournaments;
}

function findSections(lines) {
  const result = {
    dates: [],
    times: [],
    allBuyins: [],  // includes nulls for "-"
    chips: [],
    durations: [],
    reentries: [],
    lateRegs: [],
    eventNames: [],
    eventNumbers: []
  };

  let section = null;
  let eventNameBuffer = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect section transitions
    if (line.includes('EVENT NAME') && line.includes('DATE')) { section = 'dates'; continue; }
    if (line === 'DAY') { section = 'days'; continue; }
    if (line === 'TIME') { section = 'times'; continue; }
    if (line === 'BUY-IN') { section = 'buyins'; continue; }
    if (line === 'STARTING') { section = 'chips'; continue; }
    if (line === 'CHIPS') { continue; }
    if (line === 'LVL') { section = 'durations'; continue; }
    if (line === 'DURATION' || line === '(MINUTES)') { continue; }
    if (line === 'RE-ENTRY') { section = 'reentries'; continue; }
    if (line === 'LATE') { section = 'lateRegs'; continue; }
    if (line === 'REG.') { continue; }
    if (line === 'EV#') {
      // Flush event name buffer before switching
      if (eventNameBuffer.length > 0) {
        result.eventNames.push(eventNameBuffer.join(' '));
        eventNameBuffer = [];
      }
      section = 'eventNumbers';
      continue;
    }

    // Skip page numbers like "1/10"
    if (line.match(/^\d+\/\d+$/)) continue;
    // Skip header text
    if (line === 'WOHLD SERIES' || line === 'PDi<ER') continue;

    // Collect data based on section
    if (section === 'dates' && line.match(/^(May|June|July)\s+\d+$/i)) {
      result.dates.push(line);
    }
    else if (section === 'days') {
      // Skip days, we don't need them
    }
    else if (section === 'times') {
      if (line.match(/^\d{1,2}(:\d{2})?\s*(AM|PM)$/i) || line === 'TBD') {
        result.times.push(line.replace(/\s+/g, '').toUpperCase());
      }
    }
    else if (section === 'buyins') {
      if (line === '-') {
        result.allBuyins.push(null);
      } else if (line.match(/^\$/)) {
        const m = line.match(/\$([\d,]+)/);
        result.allBuyins.push(m ? parseInt(m[1].replace(/,/g, '')) : null);
      }
    }
    else if (section === 'chips') {
      if (line.match(/^[\d,]+$/) || line === '-') {
        result.chips.push(line === '-' ? null : parseInt(line.replace(/,/g, '')));
      }
    }
    else if (section === 'durations') {
      if (line.match(/^[\d\s\/]+$/) || line === '-') {
        result.durations.push(line === '-' ? '' : line);
      }
    }
    else if (section === 'reentries') {
      if (line.match(/^\d+$/) || line.match(/^\d+\s*\/\s*flight/i) ||
          line.toLowerCase().includes('unlimited') ||
          line.toLowerCase().includes('bust') || line === '0') {
        result.reentries.push(line);
      }
    }
    else if (section === 'lateRegs') {
      if (line.match(/^\d+\s*levels?$/i) || line.match(/^First/i)) {
        result.lateRegs.push(line);
      } else {
        // This line doesn't match late reg pattern, must be start of event names
        section = 'eventNames';
        // Fall through to process this line as event name
      }
    }

    if (section === 'eventNames') {
      // Check if this starts a new event
      if (isNewEventName(line, eventNameBuffer)) {
        if (eventNameBuffer.length > 0) {
          result.eventNames.push(eventNameBuffer.join(' '));
        }
        eventNameBuffer = [line];
      } else {
        eventNameBuffer.push(line);
      }
    }
    else if (section === 'eventNumbers') {
      if (line.match(/^\d{1,3}[A-E]?$/)) {
        result.eventNumbers.push(line);
      }
    }
  }

  // Flush final event name
  if (eventNameBuffer.length > 0) {
    result.eventNames.push(eventNameBuffer.join(' '));
  }

  // Filter event names to remove non-tournament entries
  const filteredNames = result.eventNames.filter(n => {
    if (n.toLowerCase().includes('registration opens')) return false;
    if (n.match(/^MAIN EVENT\s*-\s*(Day\s+\d|Day\s+Off|Plays|Final)/i)) return false;
    return true;
  });

  // Always use filtered names - they should match event numbers
  // If they don't match, there's a parsing issue but filtered is still more accurate
  result.eventNames = filteredNames;

  return result;
}

function isNewEventName(line, buffer) {
  if (buffer.length === 0) return true;

  // If we're in the middle of a game list (semicolons), don't split
  const bufferText = buffer.join(' ');
  if (bufferText.includes(';') && !bufferText.match(/\(\d+-day event\)\s*$/i)) {
    return false;
  }

  // Common event name starters
  const starters = [
    /^Mystery/i, /^Industry/i, /^\d+-Handed/i, /^Omaha Hi-Lo/i, /^Pot-Limit/i,
    /^Seven Card Stud\s+\(/i, /^Heads Up/i, /^Dealers Choice/i, /^No-Limit/i,
    /^COLOSSUS/i, /^SHOOTOUT/i, /^High Roller/i, /^Badugi\s+\(/i, /^Big O/i,
    /^Mixed[:\s]/i, /^Super Turbo/i, /^Freezeout/i, /^MONSTER/i, /^Seniors/i,
    /^SENIORS/i, /^MILLIONAIRE/i, /^Battle/i, /^SUPER SENIORS/i,
    /^TAG TEAM/i, /^Poker Players/i, /^Gladiators/i, /^LADIES/i,
    /^Limit 2-7/i, /^Limit Hold/i, /^MINI/i, /^Pokernews/i, /^Summer/i,
    /^MAIN EVENT/i, /^Ultra Stack/i, /^Mid-Stakes/i, /^Lucky/i,
    /^Poker Hall/i, /^T\.O\.R\.S\.E/i, /^The Closer/i, /^H\.O\.R\.S\.E/i,
    /^Razz\s+\(/i, /^SALUTE/i, /^6-Handed/i, /^8-Handed/i
  ];

  return starters.some(p => p.test(line));
}

function classifyGameVariant(eventName) {
  // Get just the main event name (before semicolons listing included games)
  let main = eventName;
  const semi = eventName.indexOf(';');
  if (semi > 0) main = eventName.substring(0, semi);

  const lower = main.toLowerCase();

  // Mixed games first — but check "mixed plo" before generic "mixed" to avoid misclassification
  if (lower.includes('dealers choice')) return 'Dealers Choice';
  if (lower.includes('8-game') || lower.includes('8 game mix') || lower.includes('nine game')) return 'Mixed Games';
  if (lower.includes('h.o.r.s.e')) return 'H.O.R.S.E.';
  if (/\bt\.?o\.?r\.?s\.?e\.?\b/i.test(lower) || lower.includes('torse')) return 'T.O.R.S.E.';
  if (lower.includes('mixed plo')) return 'PLO'; // Must come before generic "mixed" check

  // Specific games — order matters (more specific patterns first)
  if (/^mixed[:\s]/i.test(lower) || /\bmixed game/i.test(lower)) return 'Mixed Games';
  if (lower.includes('pot-limit omaha hi-lo') || lower.includes('plo hi-lo')) return 'PLO Hi-Lo';
  if (/\bplo\s*8\b/i.test(lower) || lower.includes('plo hi/lo')) return 'PLO Hi-Lo';
  if (lower.includes('5 card plo') || lower.includes('5-card plo')) return '5-Card PLO';
  if (lower.includes('pot-limit omaha') || /\bplo\b/i.test(lower)) return 'PLO';
  if (/\bbig[- ]?o\b/i.test(lower)) return 'Big O';
  if (lower.includes('omaha hi-lo')) return 'Omaha Hi-Lo';
  if (lower.includes('2-7') && lower.includes('triple draw')) return '2-7 Triple Draw';
  if (lower.includes('2-7') && lower.includes('lowball')) return '2-7 Lowball';
  if (lower.includes('stud hi-lo')) return 'Stud Hi-Lo';
  if (lower.includes('seven card stud')) return '7-Card Stud';
  if (lower.includes('razz')) return 'Razz';
  if (lower.includes('badugi')) return 'Badugi';
  if (lower.includes('limit hold') && !lower.includes('no-limit')) return 'Limit Holdem';

  return 'NLHE';
}

module.exports = { parseWSOP2025Schedule, classifyGameVariant, getWSOPRake, WSOP_RAKE_BY_BUYIN };
