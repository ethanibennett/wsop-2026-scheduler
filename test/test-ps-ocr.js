#!/usr/bin/env node
/**
 * Test script for PS Live OCR parsing
 * Creates a synthetic PS Live screenshot and tests OCR + parsing
 */
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// ── Expected data ──
const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'ps-live-expected.json'), 'utf8'));

// ── Player rows (mimicking PS Live format) ──
const ROWS = [
  { pos: 72,  name: 'Conrad',              country: 'United Kingdom', chips: '26,500',  seat: '2-4' },
  { pos: 8,   name: 'Andree Borrmann',     country: 'Germany',        chips: '120,000', seat: '2-5' },
  { pos: 80,  name: 'Lee Horton',          country: 'England',        chips: '17,000',  seat: '2-6' },
  { pos: 73,  name: 'John Jude Hardie',    country: 'United Kingdom', chips: '26,000',  seat: '3-2' },
  { pos: 23,  name: 'Daniel Efeturk',      country: 'England',        chips: '85,000',  seat: '3-3' },
  { pos: 13,  name: 'Ethan Bennett',       country: 'England',        chips: '106,000', seat: '3-4', highlight: true },
  { pos: 11,  name: 'Conor Hugh Murphy',   country: 'Ireland',        chips: '110,000', seat: '3-5' },
  { pos: 25,  name: 'Luc Jozef Boeckx',   country: 'Belgium',        chips: '80,000',  seat: '3-6' },
  { pos: 65,  name: 'Kimberly Durham',     country: 'United Kingdom', chips: '30,000',  seat: '4-1' },
  { pos: 76,  name: 'John Murray',         country: 'Ireland',        chips: '23,000',  seat: '4-3' },
  { pos: 54,  name: 'Rodolphe Zagoury',    country: 'France',         chips: '35,000',  seat: '4-4' },
  { pos: 15,  name: 'Matthew Westerheide', country: 'Germany',        chips: '100,000', seat: '4-5' },
];

// ── Create synthetic PS Live screenshot ──
function createPSLiveImage() {
  const W = 430;  // iPhone-like width
  const rowHeight = 65;
  const headerHeight = 50;
  const statusBarHeight = 50;
  const bottomNavHeight = 60;
  const H = statusBarHeight + headerHeight + ROWS.length * rowHeight + bottomNavHeight;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Dark background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  // Status bar (dark)
  ctx.fillStyle = '#0f0f1a';
  ctx.fillRect(0, 0, W, statusBarHeight);
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px sans-serif';
  ctx.fillText('9:41', 15, 32);
  ctx.fillText('100%', W - 55, 32);

  // Header
  let y = statusBarHeight;
  ctx.fillStyle = '#2a1a4e';
  ctx.fillRect(0, y, W, headerHeight);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Seating', W / 2 - 30, y + 30);
  y += headerHeight;

  // Column headers
  ctx.fillStyle = '#333355';
  ctx.fillRect(0, y, W, 25);
  ctx.fillStyle = '#888888';
  ctx.font = '11px sans-serif';
  ctx.fillText('Pos.', 10, y + 17);
  ctx.fillText('Player', 55, y + 17);
  ctx.fillText('Chips', 290, y + 17);
  ctx.fillText('Seat', 375, y + 17);
  y += 25;

  // Player rows
  for (const row of ROWS) {
    // Row background
    if (row.highlight) {
      ctx.fillStyle = '#4a2080';  // Purple highlight
    } else {
      ctx.fillStyle = '#1a1a2e';
    }
    ctx.fillRect(0, y, W, rowHeight);

    // Separator line
    ctx.strokeStyle = '#333355';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y + rowHeight);
    ctx.lineTo(W, y + rowHeight);
    ctx.stroke();

    // Position number
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '13px sans-serif';
    ctx.fillText(String(row.pos), 15, y + 25);

    // Player name (white, bold)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(row.name, 55, y + 25);

    // Country (smaller, gray)
    ctx.fillStyle = '#999999';
    ctx.font = '12px sans-serif';
    ctx.fillText(row.country, 55, y + 45);

    // Chips (white)
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px sans-serif';
    ctx.fillText(row.chips, 290, y + 35);

    // Seat assignment (white)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(row.seat, 385, y + 35);

    y += rowHeight;
  }

  // Bottom nav bar
  ctx.fillStyle = '#0f0f1a';
  ctx.fillRect(0, y, W, bottomNavHeight);

  return canvas;
}

// ── Copy of the parser function from app.jsx (for Node.js testing) ──
const PS_COUNTRIES = new Set([
  'argentina','australia','austria','bahamas','belgium','brazil','bulgaria',
  'canada','chile','china','colombia','croatia','czech republic','czechia',
  'denmark','egypt','england','estonia','finland','france','germany','greece',
  'hungary','iceland','india','indonesia','iran','ireland','israel','italy',
  'japan','kazakhstan','korea','latvia','lebanon','lithuania','luxembourg',
  'malaysia','mexico','monaco','morocco','netherlands','new zealand','nigeria',
  'norway','pakistan','peru','philippines','poland','portugal','romania',
  'russia','scotland','serbia','singapore','slovakia','slovenia','south africa',
  'south korea','spain','sweden','switzerland','taiwan','thailand','turkey',
  'ukraine','united kingdom','united states','uruguay','venezuela','vietnam',
  'wales','uk','us','usa','uae',
]);

const PS_COUNTRY_CODES = new Set([
  'ar','au','at','bs','be','br','bg','ca','cl','cn','co','hr','cz','dk',
  'eg','ee','fi','fr','de','gr','hu','is','in','id','ir','ie','il','it',
  'jp','kz','kr','lv','lb','lt','lu','my','mx','mc','ma','nl','nz','ng',
  'no','pk','pe','ph','pl','pt','ro','ru','rs','sg','sk','si','za','es',
  'se','ch','tw','th','tr','ua','gb','us','uy','ve','vn',
]);

const WSOP_UI_NOISE = new Set([
  'table','day','players','player','largest','smallest','stack',
  'reg','closed','open','main','story','blinds','tabs','buy',
  'buyin','start','late','nlh','plo','gtd','flight','event',
  'monster','bounty','mystery','sat','mon','tue','wed','thu',
  'fri','sat','sun','jan','feb','mar','apr','may','jun','jul',
  'aug','sep','oct','nov','dec','the','and','for','lest',
  'hold','holdem','omaha','stud','razz','draw','mixed',
  'championship','deep','turbo','mega','super','hyper',
  'level','break','ante','big','small','blind','pot','limit',
  'seat','seats','chip','chips','round','final','heads','tag',
  'team','ladies','senior','employee','daily','special',
  'payouts','payout','structure','lobby','chat','cashier',
  'rebuy','addon','tournament','dealer','fold','check',
  'call','raise','hand','history','settings','menu',
  'seating','pos',
]);

const COMMON_FIRST_NAMES = new Set([
  'aaron','adam','adrian','alan','albert','alex','alexander','alfred',
  'allen','andree','andrew','angel','anthony','antonio','arthur','austin',
  'barry','ben','benjamin','bernard','bill','billy','bobby','brad',
  'bradley','brandon','brian','bruce','bryan','carl','carlos','chad',
  'charles','charlie','chris','christian','christopher','clarence',
  'claude','clifford','cody','cole','colin','connor','conor','corey','craig',
  'dale','dan','daniel','danny','darren','dave','david','dean','dennis',
  'derek','derrick','dino','dom','dominic','don','donald','dong','doug',
  'douglas','drew','dustin','dwight','dylan','earl','eddie','edward',
  'edwin','eli','elias','elliot','eric','erik','ernest','ethan','eugene',
  'evan','felix','fernando','frank','fred','frederick','gabriel','gary',
  'gene','george','gerald','glen','glenn','gordon','grant','greg',
  'gregory','guy','hank','harold','harry','harvey','hector','henry',
  'herbert','herman','howard','hugh','ian','isaac','ivan','jack',
  'jacob','jake','james','jamie','jared','jason','jay','jeff','jeffrey',
  'jeremy','jerome','jerry','jesse','jim','jimmy','joe','joel','john',
  'johnny','jon','jonathan','jordan','jorge','jose','joseph','josh',
  'joshua','juan','julian','justin','karl','keith','kelly','ken',
  'kenneth','kevin','kimberly','kirk','kyle','lance','larry','lawrence','lee',
  'leon','leonard','lester','lewis','liam','logan','lonnie','louis',
  'luc','lucas','luis','luke','marcus','mario','mark','marshall','martin',
  'marvin','mason','matt','matthew','maurice','max','michael','miguel',
  'mike','miles','mitchell','mohammad','morris','murray','nathan',
  'nathaniel','neil','nelson','nicholas','nick','noah','norman','oliver',
  'omar','oscar','owen','pablo','patrick','paul','pedro','perry','pete',
  'peter','phil','philip','phillip','pierre','raj','ralph','ramon',
  'randy','ray','raymond','ricardo','rich','richard','rick','ricky',
  'rob','robert','robin','rod','rodney','rodolphe','roger','roland','roman','ron',
  'ronald','ross','roy','ruben','russell','ryan','sam','samuel','scott',
  'sean','sergio','seth','shane','shaun','shawn','simon','spencer',
  'stanley','stephen','steve','steven','stuart','ted','terry','thomas',
  'tim','timothy','todd','tom','tommy','tony','travis','trevor','troy',
  'tyler','victor','vincent','virgil','wade','walter','warren','wayne',
  'wesley','will','william','willie','zachary',
]);

const OCR_SUBS = [
  ['w', 'v'],  ['v', 'w'],
  ['rn', 'm'], ['m', 'rn'],
  ['cl', 'd'], ['d', 'cl'],
  ['li', 'h'], ['h', 'li'],
  ['l', 'i'],  ['i', 'l'],
  ['0', 'o'],  ['o', '0'],
  ['1', 'l'],  ['l', '1'],
  ['ii', 'n'], ['n', 'ii'],
  ['vv', 'w'], ['w', 'vv'],
];

function ocrCorrectFirstName(word) {
  const lower = word.toLowerCase();
  if (COMMON_FIRST_NAMES.has(lower)) return word;
  for (const [from, to] of OCR_SUBS) {
    let idx = 0;
    while ((idx = lower.indexOf(from, idx)) !== -1) {
      const candidate = lower.slice(0, idx) + to + lower.slice(idx + from.length);
      if (COMMON_FIRST_NAMES.has(candidate)) {
        return candidate.charAt(0).toUpperCase() + candidate.slice(1);
      }
      idx++;
    }
  }
  return word;
}

// Parser from app.jsx
function parsePokerStarsTable(ocrText) {
  const players = [];
  const seen = new Set();

  let cleanedText = ocrText
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, ' ')
    .replace(/[\u{1F600}-\u{1F64F}]/gu, ' ')
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, ' ')
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, ' ')
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, ' ')
    .replace(/[\u{2600}-\u{26FF}]/gu, ' ')
    .replace(/[\u{2700}-\u{27BF}]/gu, ' ')
    .replace(/[^\x00-\x7F]/g, ' ')
    .replace(/\t/g, '  ')
    .replace(/  +/g, '  ');

  const fullText = cleanedText.replace(/\n/g, '  ');
  const lines = cleanedText.split('\n').map(l => l.trim()).filter(Boolean);

  console.log('[PSParser] Lines:', lines.length);
  console.log('[PSParser] First 500 chars:', cleanedText.substring(0, 500));

  function extractName(text) {
    let nameArea = text
      .replace(/\$\s*[\d,]+(?:\.\d{2})?/g, ' ')
      .replace(/\b\d{1,3}(?:,\d{3})+\b/g, ' ')
      .replace(/\b\d{4,}\b/g, ' ')
      .replace(/^\s*\d{1,3}\s+/, '')
      .replace(/[^A-Za-z\s'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!nameArea) return null;
    const segments = nameArea.split(/\s{2,}/).filter(Boolean);

    for (const segment of segments) {
      const words = segment.trim().split(/\s+/).filter(w => w.length >= 2);
      if (words.length === 0 || words.length > 5) continue;

      const fullPhrase = words.join(' ').toLowerCase()
        .replace(/lnited/g, 'united').replace(/lreland/g, 'ireland')
        .replace(/kingdorn/g, 'kingdom').replace(/gerrnany/g, 'germany')
        .replace(/engIand/gi, 'england');
      if (PS_COUNTRIES.has(fullPhrase)) continue;

      if (words.every(w => {
        const wl = w.toLowerCase();
        return PS_COUNTRIES.has(wl) || PS_COUNTRY_CODES.has(wl) || WSOP_UI_NOISE.has(wl);
      })) continue;

      let nameWords = [...words];
      if (nameWords.length >= 3) {
        const c2 = nameWords.slice(-2).join(' ').toLowerCase()
          .replace(/lnited/g, 'united').replace(/kingdorn/g, 'kingdom');
        if (PS_COUNTRIES.has(c2)) nameWords = nameWords.slice(0, -2);
      }
      if (nameWords.length >= 2) {
        const c1 = nameWords[nameWords.length - 1].toLowerCase()
          .replace(/lnited/g, 'united').replace(/engIand/gi, 'england');
        if (PS_COUNTRIES.has(c1) || PS_COUNTRY_CODES.has(c1)) nameWords = nameWords.slice(0, -1);
      }

      if (nameWords.length >= 1) {
        const name = nameWords.map(w =>
          w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        ).join(' ');
        if (name.length >= 3) return name;
      }
    }

    const allWords = nameArea.split(/\s+/).filter(w => w.length >= 2 && !/^\d+$/.test(w));
    while (allWords.length > 1) {
      const last = allWords[allWords.length - 1].toLowerCase()
        .replace(/lnited/g, 'united').replace(/kingdorn/g, 'kingdom');
      if (PS_COUNTRIES.has(last) || PS_COUNTRY_CODES.has(last) || WSOP_UI_NOISE.has(last)) {
        allWords.pop();
      } else break;
    }
    while (allWords.length > 1) {
      const first = allWords[0].toLowerCase();
      if (WSOP_UI_NOISE.has(first)) { allWords.shift(); } else break;
    }

    if (allWords.length >= 1 && allWords.length <= 4) {
      const name = allWords.map(w =>
        w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      ).join(' ');
      if (name.length >= 3) return name;
    }
    return null;
  }

  function extractChips(text) {
    const commaMatch = text.match(/\b(\d{1,3}(?:,\d{3})+)\b/);
    if (commaMatch) {
      const raw = parseInt(commaMatch[1].replace(/,/g, ''));
      if (raw >= 1000) {
        if (raw >= 1000000) return (raw / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        return Math.round(raw / 1000) + 'K';
      }
    }
    const plainMatch = text.match(/\b(\d{4,})\b/);
    if (plainMatch) {
      const raw = parseInt(plainMatch[1]);
      if (raw >= 1000 && raw < 100000000) {
        if (raw >= 1000000) return (raw / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        return Math.round(raw / 1000) + 'K';
      }
    }
    return null;
  }

  // Approach 1: Line-based
  for (let i = 0; i < lines.length; i++) {
    const candidates = [lines[i]];
    if (i + 1 < lines.length) candidates.push(lines[i] + '  ' + lines[i + 1]);
    if (i + 2 < lines.length) candidates.push(lines[i] + '  ' + lines[i + 1] + '  ' + lines[i + 2]);

    for (const line of candidates) {
      const seatRe = /(\d{1,2})\s*[-\u2013\u2014]\s*(\d{1,2})/g;
      let lastMatch = null;
      let m;
      while ((m = seatRe.exec(line)) !== null) {
        const tbl = parseInt(m[1]);
        const st = parseInt(m[2]);
        if (tbl >= 1 && tbl <= 99 && st >= 1 && st <= 10) {
          lastMatch = { match: m, tbl, st };
        }
      }
      if (!lastMatch) continue;

      const seatAssignment = lastMatch.tbl + '-' + lastMatch.st;
      const beforeSeat = line.substring(0, lastMatch.match.index);
      const chips = extractChips(beforeSeat);

      let nameText = beforeSeat;
      if (chips) {
        nameText = nameText.replace(/\b\d{1,3}(?:,\d{3})+\b/, ' ').replace(/\b\d{4,}\b/, ' ');
      }

      let playerName = extractName(nameText);
      if (!playerName || playerName.length < 3) continue;

      const nw = playerName.split(/\s+/);
      nw[0] = ocrCorrectFirstName(nw[0]);
      playerName = nw.join(' ');

      if (seen.has('seat:' + seatAssignment)) continue;
      if (seen.has('name:' + playerName.toLowerCase())) continue;
      seen.add('seat:' + seatAssignment);
      seen.add('name:' + playerName.toLowerCase());

      players.push({
        name: playerName, chips, seat: seatAssignment,
        prize: null, country: null, position: players.length + 1, px: null, py: null,
      });
      break;
    }
  }

  // Approach 2: full-text scan
  if (players.length < 3) {
    console.log('[PSParser] Approach 1 found only', players.length, ', trying full-text scan...');
    const seatRe = /(\d{1,2})\s*[-\u2013\u2014]\s*(\d{1,2})/g;
    let m;
    while ((m = seatRe.exec(fullText)) !== null) {
      const tbl = parseInt(m[1]);
      const st = parseInt(m[2]);
      if (tbl < 1 || tbl > 99 || st < 1 || st > 10) continue;
      const seat = tbl + '-' + st;
      if (seen.has('seat:' + seat)) continue;

      const before = fullText.substring(Math.max(0, m.index - 300), m.index);
      const nameMatches = before.match(/[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{1,}){0,3}/g);
      if (!nameMatches || nameMatches.length === 0) continue;

      let playerName = nameMatches[nameMatches.length - 1].trim();
      const nw = playerName.split(/\s+/);
      while (nw.length > 1 && (PS_COUNTRIES.has(nw[nw.length-1].toLowerCase()) || PS_COUNTRY_CODES.has(nw[nw.length-1].toLowerCase()))) {
        nw.pop();
      }
      playerName = nw.join(' ');
      if (nw.length < 1 || playerName.length < 3) continue;

      const fullLower = playerName.toLowerCase().replace(/lnited/g, 'united').replace(/kingdorn/g, 'kingdom');
      if (PS_COUNTRIES.has(fullLower)) continue;

      nw[0] = ocrCorrectFirstName(nw[0]);
      playerName = nw.join(' ');

      if (seen.has('seat:' + seat)) continue;
      if (seen.has('name:' + playerName.toLowerCase())) continue;
      seen.add('seat:' + seat);
      seen.add('name:' + playerName.toLowerCase());

      const nearby = fullText.substring(Math.max(0, m.index - 150), m.index + 20);
      const chips = extractChips(nearby);

      players.push({
        name: playerName, chips, seat, prize: null, country: null,
        position: players.length + 1, px: null, py: null,
      });
    }
  }

  console.log('[PSParser] Final result:', players.length, 'players');
  return players;
}


// ── Test with simulated OCR output ──
// Since we know the PS Live format, simulate what Tesseract might produce
// from a well-preprocessed image

// Test 1: Perfect OCR (best case)
console.log('\n=== Test 1: Perfect OCR output ===');
const perfectOCR = ROWS.map(r =>
  `${r.pos}  ${r.name}  ${r.country}  ${r.chips}  ${r.seat}`
).join('\n');
console.log('Input:\n' + perfectOCR);
const result1 = parsePokerStarsTable(perfectOCR);
console.log('\nResult:', result1.length, 'players');
result1.forEach(p => console.log(`  ${p.name} | ${p.chips} | ${p.seat}`));

// Test 2: Noisy OCR (realistic case)
console.log('\n=== Test 2: Noisy OCR output ===');
const noisyOCR = `Pos. Player Chips Seat
72 Conrad United Kingdom 26,500 2-4
8 Andree Borrmann Germany 120,000 2-5
80 Lee Horton England 17,000 2-6
73 John Jude Hardie United Kingdom 26,000 3-2
23 Daniel Efeturk England 85,000 3-3
13 Ethan Bennett England 106,000 3-4
11 Conor Hugh Murphy lreland 110,000 3-5
25 Luc Jozef Boeckx Belgium 80,000 3-6
65 Kimberly Durham United Kingdom 30,000 4-1
76 John Murray lreland 23,000 4-3
54 Rodolphe Zagoury France 35,000 4-4
15 Matthew Westerheide Germany 100,000 4-5`;
const result2 = parsePokerStarsTable(noisyOCR);
console.log('\nResult:', result2.length, 'players');
result2.forEach(p => console.log(`  ${p.name} | ${p.chips} | ${p.seat}`));

// Test 3: Very noisy OCR (multi-line splits, garbled text)
console.log('\n=== Test 3: Very noisy OCR ===');
const veryNoisyOCR = `Pos. Player Chips Seat
72 Conrad
United Kingdom 26,500 2-4
8 Andree Borrmann
Germany 120,000 2-5
80 Lee Horton England 17,000 2-6
73 John Jude Hardie
United Kingdom 26,000 3-2
23 Daniel Efeturk  England
85,000 3-3
13 Ethan Bennett England 106,000 3-4
11 Conor Hugh Murphy lreland 110,000 3-5
25 Luc Jozef Boeckx Belgium 80,000 3-6
65 Kimberly Durham
United Kingdom 30,000 4-1
76 John Murray lreland 23,000 4-3
54 Rodolphe Zagoury France 35,000 4-4
15 Matthew Westerheide
Germany 100,000 4-5`;
const result3 = parsePokerStarsTable(veryNoisyOCR);
console.log('\nResult:', result3.length, 'players');
result3.forEach(p => console.log(`  ${p.name} | ${p.chips} | ${p.seat}`));

// ── Validate against expected ──
console.log('\n=== Validation ===');
function validate(result, label) {
  let matched = 0;
  for (const exp of expected.players) {
    const found = result.find(p => p.seat === exp.seat);
    if (found) {
      // Check if name is close enough (first name matches)
      const expFirst = exp.name.split(' ')[0].toLowerCase();
      const foundFirst = found.name.split(' ')[0].toLowerCase();
      if (expFirst === foundFirst) {
        matched++;
        console.log(`  OK: ${exp.seat} ${exp.name} -> ${found.name} (${found.chips})`);
      } else {
        console.log(`  WRONG NAME: ${exp.seat} expected "${exp.name}" got "${found.name}"`);
      }
    } else {
      console.log(`  MISSING: ${exp.seat} ${exp.name}`);
    }
  }
  console.log(`${label}: ${matched}/${expected.players.length} players matched`);
  return matched;
}

console.log('\nTest 1 (perfect):');
const score1 = validate(result1, 'Perfect');
console.log('\nTest 2 (noisy):');
const score2 = validate(result2, 'Noisy');
console.log('\nTest 3 (very noisy):');
const score3 = validate(result3, 'Very Noisy');

// ── Now test with actual Tesseract OCR on synthetic image ──
async function testWithTesseract() {
  let Tesseract;
  try {
    Tesseract = require('tesseract.js');
  } catch(e) {
    console.log('\nTesseract.js not installed, skipping OCR test.');
    console.log('Install with: npm install tesseract.js');
    return;
  }

  console.log('\n=== Test 4: Actual Tesseract OCR on synthetic image ===');

  // Create the image
  const canvas = createPSLiveImage();
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(__dirname, 'ps-live-synthetic.png'), buffer);
  console.log('Saved synthetic image to test/ps-live-synthetic.png');

  // Also create preprocessed versions
  // Version A: Simple invert
  const invertCanvas = createCanvas(canvas.width * 3, canvas.height * 3);
  const invertCtx = invertCanvas.getContext('2d');
  invertCtx.drawImage(canvas, 0, 0, invertCanvas.width, invertCanvas.height);
  const imgData = invertCtx.getImageData(0, 0, invertCanvas.width, invertCanvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i+1], b = d[i+2];
    const isPurple = r > 60 && b > 60 && g < r * 0.8 && g < b * 0.8;
    let gray;
    if (isPurple) gray = Math.min(r, g, b) * 0.3;
    else gray = 0.299 * r + 0.587 * g + 0.114 * b;
    d[i] = d[i+1] = d[i+2] = 255 - gray;
  }

  // Otsu threshold
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) histogram[d[i]]++;
  const totalPixels = d.length / 4;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let sumB = 0, wB = 0, wF = 0, maxVariance = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    wF = totalPixels - wB;
    if (wF === 0) break;
    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > maxVariance) { maxVariance = variance; threshold = t; }
  }
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] < threshold ? 0 : 255;
    d[i] = d[i+1] = d[i+2] = v;
  }
  invertCtx.putImageData(imgData, 0, 0);
  const invertBuffer = invertCanvas.toBuffer('image/png');
  fs.writeFileSync(path.join(__dirname, 'ps-live-preprocessed.png'), invertBuffer);
  console.log('Saved preprocessed image to test/ps-live-preprocessed.png');

  // Run OCR
  const worker = await Tesseract.createWorker('eng');

  const psmModes = [
    { psm: '6', label: 'SINGLE_BLOCK' },
    { psm: '4', label: 'SINGLE_COLUMN' },
    { psm: '3', label: 'AUTO' },
    { psm: '11', label: 'SPARSE' },
  ];

  let bestResult = [];
  let bestLabel = '';

  for (const mode of psmModes) {
    await worker.setParameters({ tessedit_pageseg_mode: mode.psm });

    // Test preprocessed version
    const result = await worker.recognize(invertBuffer);
    console.log(`\n--- OCR (preprocessed/${mode.label}) ---`);
    console.log(result.data.text.substring(0, 600));

    const parsed = parsePokerStarsTable(result.data.text);
    console.log(`Parsed: ${parsed.length} players`);

    if (parsed.length > bestResult.length) {
      bestResult = parsed;
      bestLabel = `preprocessed/${mode.label}`;
    }
  }

  await worker.terminate();

  console.log(`\nBest OCR result (${bestLabel}): ${bestResult.length} players`);
  bestResult.forEach(p => console.log(`  ${p.name} | ${p.chips} | ${p.seat}`));

  console.log('\nValidation:');
  validate(bestResult, 'Tesseract OCR');
}

// Run pure parsing tests first (synchronous)
console.log('\n=== SUMMARY ===');
console.log(`Test 1 (perfect): ${score1}/12`);
console.log(`Test 2 (noisy): ${score2}/12`);
console.log(`Test 3 (very noisy): ${score3}/12`);

// Then run Tesseract test
testWithTesseract().catch(e => console.error('Tesseract test failed:', e));
