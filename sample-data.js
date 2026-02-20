// WSOP 2026 Official Schedule - 57th Annual World Series of Poker
// May 26 - July 15, 2026 | Horseshoe / Paris Las Vegas
// Source: wsop.com/tournaments/2026-57th-annual-world-series-of-poker/

const wsop2026 = require('./wsop-2026-official.json');
const { getWSOPRake } = require('./parsers/wsop-parser');

// Normalize to the shape the DB insert expects
const sampleTournaments = wsop2026.map(t => {
  const rake = getWSOPRake(t.buyin, t.eventNumber);
  return {
    eventNumber:   t.eventNumber,
    eventName:     t.eventName,
    date:          t.date,
    time:          t.time,
    buyin:         t.buyin,
    startingChips: t.startingChips,
    levelDuration: t.levelDuration,
    reentry:       t.reentry,
    lateReg:       t.lateReg,
    lateRegEnd:    t.lateRegEnd || null,
    gameVariant:   t.gameVariant,
    venue:         t.venue || 'Horseshoe / Paris Las Vegas',
    notes:         t.notes || '',
    category:      t.category || null,
    isSatellite:   t.isSatellite || false,
    targetEvent:   t.targetEvent || null,
    isRestart:     t.isRestart || false,
    parentEvent:   t.parentEvent || null,
    prizePool:     rake.prizePool,
    houseFee:      rake.houseFee,
    optAddOn:      rake.optAddOn,
    rakePct:       rake.rakePct,
    rakeDollars:   rake.rakeDollars
  };
});

module.exports = sampleTournaments;
