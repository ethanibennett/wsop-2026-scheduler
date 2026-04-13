var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var { useState, useEffect, useMemo, useCallback, useRef } = React;
const { createPortal } = ReactDOM;
function computeDrawHand(originalCards, draws, upToStreetIdx) {
  if (!originalCards) return "";
  var current = originalCards;
  for (var si = 0; si <= upToStreetIdx; si++) {
    if (!draws || !draws[si]) continue;
    var draw = draws[si];
    if (!draw || draw.discarded === 0) continue;
    if (draw.discardedCards) {
      var discarded = parseCardNotation(draw.discardedCards);
      var currentParsed = parseCardNotation(current);
      var remaining = [];
      var discardSet = {};
      discarded.forEach(function(c) {
        discardSet[c.rank + c.suit] = (discardSet[c.rank + c.suit] || 0) + 1;
      });
      currentParsed.forEach(function(c) {
        var key = c.rank + c.suit;
        if (discardSet[key] && discardSet[key] > 0) {
          discardSet[key]--;
        } else {
          remaining.push(c);
        }
      });
      current = remaining.map(function(c) {
        return c.rank + c.suit;
      }).join("");
    } else {
      var parsed = parseCardNotation(current);
      var keep = Math.max(0, parsed.length - draw.discarded);
      current = parsed.slice(0, keep).map(function(c) {
        return c.rank + c.suit;
      }).join("");
    }
    if (draw.newCards) {
      current += draw.newCards;
    }
  }
  return current;
}
__name(computeDrawHand, "computeDrawHand");
function getPlayerDrawsByStreet(hand, playerIdx) {
  var result = {};
  hand.streets.forEach(function(s, si) {
    if (!s.draws) return;
    var d = s.draws.find(function(d2) {
      return d2.player === playerIdx;
    });
    if (d) result[si] = d;
  });
  return result;
}
__name(getPlayerDrawsByStreet, "getPlayerDrawsByStreet");
function getGameCategory(gameType) {
  const cfg = HAND_CONFIG[gameType];
  if (!cfg) return "community";
  if (gameType === "OFC") return "ofc";
  if (cfg.isStud) return "stud";
  if (cfg.hasBoard) return "community";
  if (["2-7 TD", "PL 2-7 TD", "L 2-7 TD", "A-5 TD", "Badeucy", "Badacy"].includes(gameType)) return "draw_triple";
  if (["NL 2-7 SD", "PL 5CD Hi"].includes(gameType)) return "draw_single";
  if (gameType === "Badugi") return "draw_triple";
  if (!cfg.hasBoard && !cfg.isStud) {
    const customDef = STREET_DEFS["custom_" + gameType];
    if (customDef && customDef.streets.length > 3) return "draw_triple";
    if (customDef && customDef.streets.length <= 3) return "draw_single";
  }
  return "community";
}
__name(getGameCategory, "getGameCategory");
function getStreetDef(gameType) {
  const customDef = STREET_DEFS["custom_" + gameType];
  if (customDef) return customDef;
  return STREET_DEFS[getGameCategory(gameType)] || STREET_DEFS.community;
}
__name(getStreetDef, "getStreetDef");
function getPositionLabels(numPlayers) {
  if (numPlayers <= 2) return ["BTN/SB", "BB"];
  if (numPlayers === 3) return ["BTN", "SB", "BB"];
  var middle = ["UTG", "UTG+1", "MP1", "MP2", "LJ", "HJ", "CO"];
  var need = numPlayers - 3;
  var picked = middle.slice(Math.max(0, middle.length - need));
  return picked.concat(["BTN", "SB", "BB"]);
}
__name(getPositionLabels, "getPositionLabels");
function getActionOrder(players, isPreflop, studInfo) {
  var n = players.length;
  if (n <= 0) return [];
  var indices = [];
  if (studInfo && studInfo.isStud) {
    var startIdx = studInfo.is3rdStreet ? studInfo.bringInIdx : studInfo.bestBoardIdx;
    if (startIdx >= 0) {
      for (var i = 0; i < n; i++) {
        indices.push((startIdx + i) % n);
      }
      return indices;
    }
    for (var i = 0; i < n; i++) indices.push(i);
    return indices;
  }
  var btnIdx = n <= 3 ? 0 : n - 3;
  var sbIdx = n <= 3 ? n <= 2 ? 0 : 1 : n - 2;
  var bbIdx = n <= 2 ? 1 : n - 1;
  if (n === 2) {
    indices = isPreflop ? [0, 1] : [1, 0];
  } else if (isPreflop) {
    for (var i = 0; i < n; i++) indices.push(i);
  } else {
    indices.push(sbIdx);
    indices.push(bbIdx);
    for (var i = 0; i < btnIdx; i++) indices.push(i);
    indices.push(btnIdx);
  }
  return indices.filter(function(i2) {
    return i2 < n;
  });
}
__name(getActionOrder, "getActionOrder");
function findStudBringIn(hand, isRazz) {
  var heroIdx = hand.heroIdx != null ? hand.heroIdx : 0;
  var oppCards = hand.streets[0] && hand.streets[0].cards.opponents || [];
  var heroCards = parseCardNotation(hand.streets[0] && hand.streets[0].cards.hero || "");
  var rankBadness = isRazz ? { "A": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6, "8": 7, "9": 8, "T": 9, "J": 10, "Q": 11, "K": 12 } : { "A": 0, "K": 1, "Q": 2, "J": 3, "T": 4, "9": 5, "8": 6, "7": 7, "6": 8, "5": 9, "4": 10, "3": 11, "2": 12 };
  var suitBadness = isRazz ? { "c": 0, "d": 1, "h": 2, "s": 3 } : { "s": 0, "h": 1, "d": 2, "c": 3 };
  var worstIdx = -1;
  var worstRank = -1;
  var worstSuit = -1;
  for (var pi = 0; pi < hand.players.length; pi++) {
    var doorCard;
    if (pi === heroIdx) {
      doorCard = heroCards.length >= 3 ? heroCards[2] : null;
    } else {
      var oppSlot = pi < heroIdx ? pi : pi - 1;
      var oCards = parseCardNotation(oppCards[oppSlot] || "");
      doorCard = oCards.length ? oCards[0] : null;
    }
    if (!doorCard || doorCard.suit === "x") continue;
    var rv = rankBadness[doorCard.rank] || 0;
    var sv = suitBadness[doorCard.suit] || 0;
    if (worstIdx === -1 || rv > worstRank || rv === worstRank && sv > worstSuit) {
      worstIdx = pi;
      worstRank = rv;
      worstSuit = sv;
    }
  }
  return worstIdx;
}
__name(findStudBringIn, "findStudBringIn");
function scoreStudBoard(cards) {
  var rankValues = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "T": 10, "J": 11, "Q": 12, "K": 13, "A": 14 };
  if (!cards.length) return 0;
  var counts = {};
  cards.forEach(function(c) {
    var r = rankValues[c.rank] || 0;
    counts[r] = (counts[r] || 0) + 1;
  });
  var pairs = [], trips = [], quads = [], kickers = [];
  Object.keys(counts).forEach(function(r) {
    var rv = parseInt(r);
    if (counts[r] === 4) quads.push(rv);
    else if (counts[r] === 3) trips.push(rv);
    else if (counts[r] === 2) pairs.push(rv);
    else kickers.push(rv);
  });
  pairs.sort(function(a, b) {
    return b - a;
  });
  trips.sort(function(a, b) {
    return b - a;
  });
  kickers.sort(function(a, b) {
    return b - a;
  });
  var score = 0;
  if (quads.length) {
    score = 7e6 + quads[0] * 100;
  } else if (trips.length && pairs.length) {
    score = 6e6 + trips[0] * 100 + pairs[0];
  } else if (trips.length) {
    score = 5e6 + trips[0] * 100;
  } else if (pairs.length >= 2) {
    score = 4e6 + pairs[0] * 100 + pairs[1];
  } else if (pairs.length === 1) {
    score = 3e6 + pairs[0] * 100 + (kickers[0] || 0);
  } else {
    var allRanks = Object.keys(counts).map(Number).sort(function(a, b) {
      return b - a;
    });
    score = 1e6;
    for (var i = 0; i < allRanks.length; i++) {
      score += allRanks[i] * Math.pow(100, 4 - i);
    }
  }
  return score;
}
__name(scoreStudBoard, "scoreStudBoard");
function findStudBestBoard(hand, streetIdx, foldedSet, isLowGame) {
  var heroIdx = hand.heroIdx != null ? hand.heroIdx : 0;
  var maxVisibleStreet = Math.min(streetIdx, 3);
  var bestIdx = -1;
  var bestScore = isLowGame ? Infinity : -Infinity;
  for (var pi = 0; pi < hand.players.length; pi++) {
    if (foldedSet.has(pi)) continue;
    var visible = [];
    for (var si = 0; si <= maxVisibleStreet; si++) {
      if (pi === heroIdx) {
        var hCards = parseCardNotation(hand.streets[si] && hand.streets[si].cards.hero || "");
        if (si === 0 && hCards.length >= 3) visible.push(hCards[2]);
        if (si > 0) hCards.forEach(function(c) {
          if (c.suit !== "x") visible.push(c);
        });
      } else {
        var oppSlot = pi < heroIdx ? pi : pi - 1;
        var oCards = parseCardNotation((hand.streets[si] && hand.streets[si].cards.opponents || [])[oppSlot] || "");
        oCards.forEach(function(c) {
          if (c.suit !== "x") visible.push(c);
        });
      }
    }
    var score = scoreStudBoard(visible);
    if (isLowGame ? score < bestScore : score > bestScore) {
      bestIdx = pi;
      bestScore = score;
    }
  }
  return bestIdx;
}
__name(findStudBestBoard, "findStudBestBoard");
function studHasOpenPairOn4th(hand) {
  if (!hand.streets || !hand.streets[0] || !hand.streets[1]) return false;
  var heroIdx = hand.heroIdx != null ? hand.heroIdx : 0;
  var numPlayers = hand.players.length;
  for (var pi = 0; pi < numPlayers; pi++) {
    var doorCard = null;
    var fourthCard = null;
    if (pi === heroIdx) {
      var s0Cards = parseCardNotation(hand.streets[0] && hand.streets[0].cards.hero || "");
      var s1Cards = parseCardNotation(hand.streets[1] && hand.streets[1].cards.hero || "");
      doorCard = s0Cards.length >= 3 ? s0Cards[2] : null;
      fourthCard = s1Cards.length >= 1 ? s1Cards[0] : null;
    } else {
      var oppSlot = pi < heroIdx ? pi : pi - 1;
      var s0Opp = parseCardNotation((hand.streets[0] && hand.streets[0].cards.opponents || [])[oppSlot] || "");
      var s1Opp = parseCardNotation((hand.streets[1] && hand.streets[1].cards.opponents || [])[oppSlot] || "");
      doorCard = s0Opp.length >= 1 ? s0Opp[0] : null;
      fourthCard = s1Opp.length >= 1 ? s1Opp[0] : null;
    }
    if (doorCard && fourthCard && doorCard.suit !== "x" && fourthCard.suit !== "x" && doorCard.rank === fourthCard.rank) {
      return true;
    }
  }
  return false;
}
__name(studHasOpenPairOn4th, "studHasOpenPairOn4th");
function formatChipAmount(val) {
  if (!val && val !== 0) return "";
  const n = Number(val);
  if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1) + "k";
  return String(n);
}
__name(formatChipAmount, "formatChipAmount");
var CHIP_DENOMS = [
  { value: 25e3, color: "#14b8a6" },
  { value: 5e3, color: "#f97316" },
  { value: 1e3, color: "#eab308" },
  { value: 500, color: "#7c3aed" },
  { value: 100, color: "#1a1a2e" },
  { value: 25, color: "#22c55e" }
];
function getChipBreakdown(amount) {
  var chips = [];
  var remaining = Math.abs(Number(amount) || 0);
  for (var i = 0; i < CHIP_DENOMS.length && chips.length < 5; i++) {
    var d = CHIP_DENOMS[i];
    while (remaining >= d.value && chips.length < 5) {
      chips.push(d.color);
      remaining -= d.value;
    }
  }
  if (chips.length === 0) chips.push("#22c55e");
  return chips;
}
__name(getChipBreakdown, "getChipBreakdown");
function ChipStack({ amount }) {
  var chips = getChipBreakdown(amount);
  return React.createElement("div", {
    className: "chip-stack-visual",
    style: { display: "inline-flex", flexDirection: "column-reverse", alignItems: "center", marginRight: "3px", verticalAlign: "middle" }
  }, chips.map(function(color, i) {
    return React.createElement("div", {
      key: i,
      className: "chip-disc",
      style: {
        width: "12px",
        height: "4px",
        borderRadius: "50%",
        background: color,
        border: "0.5px solid rgba(255,255,255,0.35)",
        marginTop: i === 0 ? 0 : "-2px",
        boxShadow: "0 1px 1px rgba(0,0,0,0.3)",
        position: "relative",
        zIndex: chips.length - i
      }
    });
  }));
}
__name(ChipStack, "ChipStack");
var DEFAULT_OPP_NAMES = ["Jason Blodgett", "Keith McCormack", "Alex Charron", "Kevin DiPasquale", "Cristian Gutierrez", "Derek Nold", "Anthony Hall", "Aidan Long"];
function getTableScanNames() {
  try {
    var raw = localStorage.getItem("tableScanPlayers");
    if (!raw) return null;
    var players = JSON.parse(raw);
    if (!Array.isArray(players) || players.length === 0) return null;
    return players;
  } catch (e) {
    return null;
  }
}
__name(getTableScanNames, "getTableScanNames");
function getSeatName(idx, heroIdx, heroName) {
  var scan = getTableScanNames();
  if (scan && scan.length > 0) {
    var heroScanIdx = scan.findIndex(function(p) {
      return p.isHero;
    });
    if (heroScanIdx < 0) heroScanIdx = 0;
    var offset = (idx - heroIdx + scan.length) % scan.length;
    var scanIdx = (heroScanIdx + offset) % scan.length;
    if (scan[scanIdx] && scan[scanIdx].name) {
      if (idx === heroIdx) return heroName || scan[scanIdx].name;
      return scan[scanIdx].name;
    }
  }
  if (idx === 0) return heroName || "Hero";
  return DEFAULT_OPP_NAMES[idx - 1] || "Opp " + idx;
}
__name(getSeatName, "getSeatName");
function getStudPositionLabels(numPlayers) {
  return Array.from({ length: numPlayers }, function(_, i) {
    return "Seat " + (i + 1);
  });
}
__name(getStudPositionLabels, "getStudPositionLabels");
function createEmptyHand(gameType, heroName) {
  const streetDef = getStreetDef(gameType);
  const gameCfg = HAND_CONFIG[gameType] || HAND_CONFIG_DEFAULT;
  var scan = getTableScanNames();
  if (gameType === "OFC") {
    const numPlayers2 = 2;
    return {
      gameType,
      players: Array.from({ length: numPlayers2 }, function(_, i) {
        return { name: getSeatName(i, 0, heroName), position: i === 0 ? "BTN" : "BB", startingStack: 0 };
      }),
      blinds: { sb: 0, bb: 0, ante: 0 },
      streets: streetDef.streets.map((name, i) => ({
        name,
        cards: { hero: "", opponents: [""], board: "" },
        actions: [],
        draws: []
      })),
      ofcRows: {
        0: { top: "", middle: "", bottom: "" },
        1: { top: "", middle: "", bottom: "" }
      },
      heroIdx: 0,
      result: null
    };
  }
  var defaultNum = gameCfg.isStud ? 8 : 6;
  const numPlayers = scan ? Math.max(2, Math.min(10, scan.length)) : defaultNum;
  const positions = gameCfg.isStud ? getStudPositionLabels(numPlayers) : getPositionLabels(numPlayers);
  const defaultAnte = gameCfg.hasBoard && !gameCfg.isStud ? 200 : 0;
  return {
    gameType,
    players: Array.from({ length: numPlayers }, function(_, i) {
      return { name: getSeatName(i, 0, heroName), position: positions[i] || "", startingStack: 5e4 };
    }),
    blinds: { sb: 100, bb: 200, ante: defaultAnte },
    streets: streetDef.streets.map((name, i) => ({
      name,
      cards: {
        hero: "",
        opponents: Array.from({ length: numPlayers - 1 }, function() {
          return "";
        }),
        board: ""
      },
      actions: [],
      draws: []
    })),
    heroIdx: 0,
    result: null
  };
}
__name(createEmptyHand, "createEmptyHand");
function calcPotsAndStacks(hand, upToStreet, upToAction) {
  const blinds = hand.blinds || { sb: 0, bb: 0, ante: 0 };
  const stacks = hand.players.map((p) => p.startingStack);
  const category = getGameCategory(hand.gameType);
  const isBBante = category !== "stud" && (blinds.ante || 0) > 0;
  if (!isBBante) {
    stacks.forEach((_, i) => {
      stacks[i] -= blinds.ante || 0;
    });
  }
  let pot = isBBante ? 0 : hand.players.length * (blinds.ante || 0);
  if (hand.streets.length > 0 && hand.streets[0].actions) {
    if (category !== "stud") {
      const sbIdx = hand.players.findIndex((p) => p.position === "SB" || p.position === "BTN/SB");
      const bbIdx = hand.players.findIndex((p) => p.position === "BB");
      if (sbIdx >= 0) {
        stacks[sbIdx] -= blinds.sb || 0;
        pot += blinds.sb || 0;
      }
      if (bbIdx >= 0) {
        stacks[bbIdx] -= blinds.bb || 0;
        pot += blinds.bb || 0;
        if (isBBante) {
          stacks[bbIdx] -= blinds.ante || 0;
          pot += blinds.ante || 0;
        }
      }
    }
  }
  const folded = /* @__PURE__ */ new Set();
  for (let si = 0; si <= upToStreet && si < hand.streets.length; si++) {
    const street = hand.streets[si];
    const maxAction = si === upToStreet ? upToAction : street.actions ? street.actions.length - 1 : -1;
    for (let ai = 0; ai <= maxAction && street.actions && ai < street.actions.length; ai++) {
      const act = street.actions[ai];
      if (act.action === "fold") {
        folded.add(act.player);
        continue;
      }
      if (act.amount && act.amount > 0) {
        stacks[act.player] -= act.amount;
        pot += act.amount;
      }
    }
  }
  return { stacks, pot, folded };
}
__name(calcPotsAndStacks, "calcPotsAndStacks");
function HandReplayerEntry({ hand, setHand, onDone, onCancel }) {
  const [currentStreetIdx, setCurrentStreetIdx] = useState(0);
  const [actionAmount, setActionAmount] = useState("");
  const gameCfg = HAND_CONFIG[hand.gameType] || HAND_CONFIG_DEFAULT;
  const streetDef = getStreetDef(hand.gameType);
  const category = getGameCategory(hand.gameType);
  const currentStreet = hand.streets[currentStreetIdx] || hand.streets[0];
  const updateStreet = /* @__PURE__ */ __name((streetIdx, updater) => {
    setHand((prev) => {
      const next = __spreadProps(__spreadValues({}, prev), { streets: prev.streets.map((s, i) => i === streetIdx ? updater(__spreadValues({}, s)) : s) });
      return next;
    });
  }, "updateStreet");
  const bettingContext = useMemo(() => {
    const street = hand.streets[currentStreetIdx];
    const actions = street ? street.actions || [] : [];
    const betting = gameCfg.betting || "nl";
    const blinds = hand.blinds || {};
    const sb = blinds.sb || 0;
    const bb = blinds.bb || 0;
    const ante = blinds.ante || 0;
    const isSmallBetStreet = (gameCfg.flSmallStreets || []).includes(currentStreetIdx);
    const stud4thOpenPair = gameCfg.isStud && currentStreetIdx === 1 && studHasOpenPairOn4th(hand);
    const fixedBet = betting === "fl" ? isSmallBetStreet && !stud4thOpenPair ? bb || 100 : (bb || 100) * 2 : 0;
    const raiseCap = gameCfg.raiseCap || 4;
    var maxBet = 0;
    var raiseCount = 0;
    var isBBanteCtx = category !== "stud" && ante > 0;
    var totalPot = isBBanteCtx ? 0 : ante * hand.players.length;
    var playerContrib = {};
    if (currentStreetIdx === 0 && (gameCfg.hasBoard || !gameCfg.isStud)) {
      var sbIdx = hand.players.findIndex(function(p) {
        return p.position === "SB" || p.position === "BTN/SB";
      });
      var bbIdx = hand.players.findIndex(function(p) {
        return p.position === "BB";
      });
      if (sbIdx >= 0) playerContrib[sbIdx] = sb;
      if (bbIdx >= 0) playerContrib[bbIdx] = bb;
      maxBet = bb;
      totalPot += sb + bb;
      if (isBBanteCtx) totalPot += ante;
      raiseCount = 0;
    }
    for (var i = 0; i < actions.length; i++) {
      var act = actions[i];
      var prevContrib = playerContrib[act.player] || 0;
      if (act.action === "fold") continue;
      if (act.action === "bet" || act.action === "raise" || act.action === "call" || act.action === "all-in") {
        playerContrib[act.player] = prevContrib + (act.amount || 0);
        totalPot += act.amount || 0;
        if (playerContrib[act.player] > maxBet) {
          maxBet = playerContrib[act.player];
        }
        if (act.action === "bet") raiseCount = 1;
        else if (act.action === "raise") raiseCount++;
        else if (act.action === "all-in" && playerContrib[act.player] > maxBet) raiseCount++;
      } else if (act.action === "bring-in") {
        playerContrib[act.player] = act.amount || 0;
        totalPot += act.amount || 0;
        if (playerContrib[act.player] > maxBet) maxBet = playerContrib[act.player];
      }
    }
    const foldedPlayers = new Set(actions.filter((a) => a.action === "fold").map((a) => a.player));
    const activePlayers = hand.players.map((_, i2) => i2).filter((i2) => !foldedPlayers.has(i2));
    const nextPlayer = activePlayers[actions.length % activePlayers.length] || 0;
    const nextPlayerInvested = playerContrib[nextPlayer] || 0;
    const facingBet = maxBet > nextPlayerInvested;
    const callAmount = Math.max(maxBet - nextPlayerInvested, 0);
    var raiseToAmount = 0;
    var betAmount = 0;
    var potRaiseAmount = 0;
    var potRaiseIncrement = 0;
    var canRaise = true;
    if (betting === "fl") {
      betAmount = fixedBet;
      raiseToAmount = maxBet + fixedBet;
      canRaise = raiseCount < raiseCap;
    } else if (betting === "pl") {
      var potAfterCall = totalPot + callAmount;
      potRaiseAmount = maxBet + potAfterCall;
      potRaiseIncrement = potRaiseAmount - nextPlayerInvested;
      betAmount = totalPot;
      raiseToAmount = potRaiseAmount;
    } else {
      betAmount = 0;
      raiseToAmount = 0;
    }
    return {
      betting,
      facingBet,
      currentBet: maxBet,
      callAmount,
      raiseCount,
      raiseCap,
      fixedBet,
      betAmount,
      raiseToAmount,
      potRaiseAmount,
      potRaiseIncrement,
      canRaise,
      nextPlayer,
      totalPot,
      nextPlayerInvested
    };
  }, [hand, currentStreetIdx, gameCfg]);
  const addAction = /* @__PURE__ */ __name((action) => {
    var ctx = bettingContext;
    var amount = 0;
    if (action === "bet") {
      var rawBet = ctx.betting === "fl" ? ctx.fixedBet : Number(actionAmount) || 0;
      if (ctx.betting === "pl") rawBet = Math.min(rawBet, ctx.betAmount);
      amount = rawBet;
    } else if (action === "raise") {
      if (ctx.betting === "fl") {
        amount = ctx.raiseToAmount - ctx.nextPlayerInvested;
      } else {
        var typedTotal = Number(actionAmount) || 0;
        if (ctx.betting === "pl") typedTotal = Math.min(typedTotal, ctx.potRaiseAmount);
        amount = typedTotal - ctx.nextPlayerInvested;
      }
    } else if (action === "call") {
      amount = ctx.callAmount;
    }
    if (amount < 0) amount = 0;
    updateStreet(currentStreetIdx, (s) => {
      const actions = [...s.actions || [], { player: ctx.nextPlayer, action, amount }];
      return __spreadProps(__spreadValues({}, s), { actions });
    });
    setActionAmount("");
  }, "addAction");
  const removeLastAction = /* @__PURE__ */ __name(() => {
    updateStreet(currentStreetIdx, (s) => {
      const actions = [...s.actions || []];
      actions.pop();
      return __spreadProps(__spreadValues({}, s), { actions });
    });
  }, "removeLastAction");
  const updatePlayerField = /* @__PURE__ */ __name((idx, field, value) => {
    setHand((prev) => {
      const players = prev.players.map((p, i) => i === idx ? __spreadProps(__spreadValues({}, p), { [field]: field === "startingStack" ? Number(value) || 0 : value }) : p);
      return __spreadProps(__spreadValues({}, prev), { players });
    });
  }, "updatePlayerField");
  const setNumPlayers = /* @__PURE__ */ __name((n) => {
    setHand((prev) => {
      const positions = getPositionLabels(n);
      const players = Array.from({ length: n }, (_, i) => {
        var _a;
        if (prev.players[i]) return __spreadProps(__spreadValues({}, prev.players[i]), { position: positions[i] || "" });
        return { name: i === 0 ? "Hero" : "Opp " + i, position: positions[i] || "", startingStack: ((_a = prev.players[0]) == null ? void 0 : _a.startingStack) || 5e4 };
      });
      const streets = prev.streets.map((s) => __spreadProps(__spreadValues({}, s), {
        cards: __spreadProps(__spreadValues({}, s.cards), { opponents: Array.from({ length: n - 1 }, (_, j) => s.cards.opponents[j] || "") })
      }));
      return __spreadProps(__spreadValues({}, prev), { players, streets });
    });
  }, "setNumPlayers");
  const updateHeroCards = /* @__PURE__ */ __name((streetIdx, val) => {
    updateStreet(streetIdx, (s) => __spreadProps(__spreadValues({}, s), { cards: __spreadProps(__spreadValues({}, s.cards), { hero: val }) }));
  }, "updateHeroCards");
  const updateBoardCards = /* @__PURE__ */ __name((streetIdx, val) => {
    updateStreet(streetIdx, (s) => __spreadProps(__spreadValues({}, s), { cards: __spreadProps(__spreadValues({}, s.cards), { board: val }) }));
  }, "updateBoardCards");
  const updateOpponentCards = /* @__PURE__ */ __name((streetIdx, oppIdx, val) => {
    updateStreet(streetIdx, (s) => {
      const opponents = [...s.cards.opponents];
      opponents[oppIdx] = val;
      return __spreadProps(__spreadValues({}, s), { cards: __spreadProps(__spreadValues({}, s.cards), { opponents }) });
    });
  }, "updateOpponentCards");
  const updateDrawDiscard = /* @__PURE__ */ __name((streetIdx, playerIdx, val) => {
    updateStreet(streetIdx, (s) => {
      const draws = [...s.draws || []];
      const existing = draws.findIndex((d) => d.player === playerIdx);
      if (existing >= 0) draws[existing] = __spreadProps(__spreadValues({}, draws[existing]), { discarded: Number(val) || 0 });
      else draws.push({ player: playerIdx, discarded: Number(val) || 0, discardedCards: "", newCards: "" });
      return __spreadProps(__spreadValues({}, s), { draws });
    });
  }, "updateDrawDiscard");
  const updateDrawField = /* @__PURE__ */ __name((streetIdx, playerIdx, field, val) => {
    updateStreet(streetIdx, (s) => {
      const draws = [...s.draws || []];
      const existing = draws.findIndex((d) => d.player === playerIdx);
      if (existing >= 0) draws[existing] = __spreadProps(__spreadValues({}, draws[existing]), { [field]: val });
      else {
        var entry = { player: playerIdx, discarded: 0, discardedCards: "", newCards: "" };
        entry[field] = val;
        draws.push(entry);
      }
      return __spreadProps(__spreadValues({}, s), { draws });
    });
  }, "updateDrawField");
  const { pot: currentPot } = calcPotsAndStacks(hand, currentStreetIdx, (currentStreet.actions || []).length - 1);
  return /* @__PURE__ */ React.createElement("div", { className: "replayer-entry" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section-title" }, "Players & Blinds"), /* @__PURE__ */ React.createElement("div", { className: "replayer-row", style: { marginBottom: "8px" } }, /* @__PURE__ */ React.createElement("div", { className: "replayer-field", style: { flex: "0 0 70px" } }, /* @__PURE__ */ React.createElement("label", null, "Players"), /* @__PURE__ */ React.createElement("select", { value: hand.players.length, onChange: (e) => setNumPlayers(Number(e.target.value)) }, [2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => /* @__PURE__ */ React.createElement("option", { key: n, value: n }, n)))), /* @__PURE__ */ React.createElement("div", { className: "replayer-field" }, /* @__PURE__ */ React.createElement("label", null, "SB"), /* @__PURE__ */ React.createElement("input", { type: "text", inputMode: "decimal", value: (hand.blinds || {}).sb || "", onChange: (e) => setHand((prev) => __spreadProps(__spreadValues({}, prev), { blinds: __spreadProps(__spreadValues({}, prev.blinds || {}), { sb: Number(e.target.value) || 0 }) })) })), /* @__PURE__ */ React.createElement("div", { className: "replayer-field" }, /* @__PURE__ */ React.createElement("label", null, "BB"), /* @__PURE__ */ React.createElement("input", { type: "text", inputMode: "decimal", value: (hand.blinds || {}).bb || "", onChange: (e) => setHand((prev) => __spreadProps(__spreadValues({}, prev), { blinds: __spreadProps(__spreadValues({}, prev.blinds || {}), { bb: Number(e.target.value) || 0 }) })) })), /* @__PURE__ */ React.createElement("div", { className: "replayer-field" }, /* @__PURE__ */ React.createElement("label", null, category === "stud" ? "Ante" : "BB Ante"), /* @__PURE__ */ React.createElement("input", { type: "text", inputMode: "decimal", value: (hand.blinds || {}).ante || "", onChange: (e) => setHand((prev) => __spreadProps(__spreadValues({}, prev), { blinds: __spreadProps(__spreadValues({}, prev.blinds || {}), { ante: Number(e.target.value) || 0 }) })) }))), hand.players.map((p, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "replayer-player-row" }, /* @__PURE__ */ React.createElement("span", { className: "replayer-player-pos" }, p.position), /* @__PURE__ */ React.createElement("div", { className: "replayer-field", style: { flex: "0 0 80px" } }, /* @__PURE__ */ React.createElement("input", { type: "text", value: p.name, onChange: (e) => updatePlayerField(i, "name", e.target.value), placeholder: "Name" })), /* @__PURE__ */ React.createElement("div", { className: "replayer-field", style: { flex: "0 0 80px" } }, /* @__PURE__ */ React.createElement("input", { type: "text", inputMode: "decimal", value: p.startingStack, onChange: (e) => updatePlayerField(i, "startingStack", e.target.value), placeholder: "Stack" }))))), /* @__PURE__ */ React.createElement("div", { className: "live-update-tabs" }, hand.streets.map((s, i) => /* @__PURE__ */ React.createElement("button", { key: i, className: currentStreetIdx === i ? "active" : "", onClick: () => setCurrentStreetIdx(i) }, s.name))), /* @__PURE__ */ React.createElement("div", { className: "replayer-street" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-street-header" }, /* @__PURE__ */ React.createElement("span", { className: "replayer-street-name" }, currentStreet.name), /* @__PURE__ */ React.createElement("span", { className: "replayer-street-pot" }, "Pot: ", formatChipAmount(currentPot))), /* @__PURE__ */ React.createElement("div", { className: "replayer-field", style: { marginBottom: "6px" } }, /* @__PURE__ */ React.createElement("label", null, "Hero Cards"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      placeholder: gameCfg.heroPlaceholder ? dualPlaceholder(gameCfg.heroPlaceholder) : "AhKd",
      value: currentStreet.cards.hero,
      onChange: (e) => updateHeroCards(currentStreetIdx, e.target.value)
    }
  ), /* @__PURE__ */ React.createElement(CardRow, { text: currentStreet.cards.hero, stud: gameCfg.isStud, max: gameCfg.heroCards })), category === "community" && currentStreetIdx > 0 && /* @__PURE__ */ React.createElement("div", { className: "replayer-field", style: { marginBottom: "6px" } }, /* @__PURE__ */ React.createElement("label", null, "Board (", currentStreet.name, ")"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      placeholder: gameCfg.boardPlaceholder || "Qh7d2c",
      value: currentStreet.cards.board,
      onChange: (e) => updateBoardCards(currentStreetIdx, e.target.value)
    }
  ), /* @__PURE__ */ React.createElement(CardRow, { text: currentStreet.cards.board, max: streetDef.boardCards[currentStreetIdx] })), hand.players.slice(1).map((p, oi) => /* @__PURE__ */ React.createElement("div", { key: oi, className: "replayer-field", style: { marginBottom: "4px" } }, /* @__PURE__ */ React.createElement("label", null, p.name, " Cards"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      placeholder: gameCfg.heroPlaceholder ? dualPlaceholder(gameCfg.heroPlaceholder) : "XxXx",
      value: (currentStreet.cards.opponents || [])[oi] || "",
      onChange: (e) => updateOpponentCards(currentStreetIdx, oi, e.target.value)
    }
  ), /* @__PURE__ */ React.createElement(
    CardRow,
    {
      text: (currentStreet.cards.opponents || [])[oi] || "",
      stud: gameCfg.isStud,
      max: gameCfg.heroCards,
      placeholderCount: !(currentStreet.cards.opponents || [])[oi] ? gameCfg.heroCards : 0
    }
  ))), (category === "draw_triple" || category === "draw_single") && currentStreetIdx > 0 && /* @__PURE__ */ React.createElement("div", { className: "replayer-draw-section" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-draw-label" }, currentStreet.name || "Draw", " -- Discards & Draws"), hand.players.map((p, pi) => {
    const draw = (currentStreet.draws || []).find((d) => d.player === pi);
    const discardCount = draw ? draw.discarded : 0;
    const isPatText = discardCount === 0 && draw ? " (Stand Pat)" : "";
    return /* @__PURE__ */ React.createElement("div", { key: pi, className: "replayer-draw-player-block", style: { marginBottom: "6px", padding: "4px 0", borderBottom: "1px solid var(--border)" } }, /* @__PURE__ */ React.createElement("div", { className: "replayer-row", style: { marginBottom: "2px", alignItems: "center" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.65rem", color: "var(--text-muted)", minWidth: "55px", fontWeight: 600 } }, p.name, isPatText), /* @__PURE__ */ React.createElement("div", { className: "replayer-field", style: { flex: "0 0 45px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.55rem" } }, "Discard"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        min: "0",
        max: gameCfg.heroCards || 5,
        value: draw ? draw.discarded : "",
        onChange: (e) => updateDrawDiscard(currentStreetIdx, pi, e.target.value),
        placeholder: "0"
      }
    ))), discardCount > 0 && /* @__PURE__ */ React.createElement("div", { className: "replayer-row", style: { marginTop: "2px", gap: "4px" } }, /* @__PURE__ */ React.createElement("div", { className: "replayer-field", style: { flex: 1 } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.55rem" } }, "Discarded Cards"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        placeholder: "e.g. 7h3c" + (discardCount > 2 ? "9d" : ""),
        value: draw && draw.discardedCards || "",
        onChange: (e) => updateDrawField(currentStreetIdx, pi, "discardedCards", e.target.value)
      }
    ), draw && draw.discardedCards && /* @__PURE__ */ React.createElement(CardRow, { text: draw.discardedCards, max: discardCount })), /* @__PURE__ */ React.createElement("div", { className: "replayer-field", style: { flex: 1 } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.55rem" } }, "New Cards"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        placeholder: "e.g. Ah5s" + (discardCount > 2 ? "Kd" : ""),
        value: draw && draw.newCards || "",
        onChange: (e) => updateDrawField(currentStreetIdx, pi, "newCards", e.target.value)
      }
    ), draw && draw.newCards && /* @__PURE__ */ React.createElement(CardRow, { text: draw.newCards, max: discardCount }))));
  })), /* @__PURE__ */ React.createElement("div", { className: "replayer-action-list" }, (currentStreet.actions || []).map((act, ai) => {
    var _a;
    return /* @__PURE__ */ React.createElement("div", { key: ai, className: "replayer-action-item" }, /* @__PURE__ */ React.createElement("span", { className: "replayer-action-player" }, ((_a = hand.players[act.player]) == null ? void 0 : _a.name) || "?"), /* @__PURE__ */ React.createElement("span", { className: `replayer-action-type ${act.action}` }, act.action), act.amount > 0 && /* @__PURE__ */ React.createElement("span", { className: "replayer-action-amount" }, formatChipAmount(act.amount)), /* @__PURE__ */ React.createElement("span", { className: "replayer-action-remove", onClick: () => {
      if (ai === (currentStreet.actions || []).length - 1) removeLastAction();
    } }, "×"));
  })), bettingContext.betting !== "fl" && /* @__PURE__ */ React.createElement("div", { className: "replayer-row", style: { marginTop: "6px", gap: "4px" } }, /* @__PURE__ */ React.createElement("div", { className: "replayer-field", style: { flex: "0 0 80px" } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      inputMode: "decimal",
      placeholder: bettingContext.betting === "pl" ? bettingContext.facingBet ? "Raise to (max " + formatChipAmount(bettingContext.potRaiseAmount) + ")" : "Bet (max " + formatChipAmount(bettingContext.betAmount) + ")" : "Amount",
      value: actionAmount,
      onChange: (e) => setActionAmount(e.target.value)
    }
  )), bettingContext.betting === "pl" && /* @__PURE__ */ React.createElement(
    "button",
    {
      style: { fontSize: "0.6rem", padding: "2px 6px", borderRadius: "4px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", cursor: "pointer" },
      onClick: () => setActionAmount(String(bettingContext.facingBet ? bettingContext.potRaiseAmount : bettingContext.betAmount))
    },
    bettingContext.facingBet ? "Pot Raise" : "Pot Bet"
  )), /* @__PURE__ */ React.createElement("div", { className: "replayer-action-btns" }, bettingContext.facingBet ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "action-fold", onClick: () => addAction("fold") }, "Fold"), /* @__PURE__ */ React.createElement("button", { className: "action-call", onClick: () => addAction("call") }, "Call ", formatChipAmount(bettingContext.callAmount)), bettingContext.canRaise && /* @__PURE__ */ React.createElement("button", { className: "action-raise", onClick: () => addAction("raise") }, bettingContext.betting === "fl" ? "Raise to " + formatChipAmount(bettingContext.raiseToAmount) : "Raise")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { onClick: () => addAction("check") }, "Check"), /* @__PURE__ */ React.createElement("button", { className: "action-bet", onClick: () => addAction("bet") }, bettingContext.betting === "fl" ? "Bet " + formatChipAmount(bettingContext.fixedBet) : "Bet")))), /* @__PURE__ */ React.createElement("div", { className: "replayer-section" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section-title" }, "Result (optional)"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" } }, hand.players.map((p, pi) => {
    var _a;
    const winners = ((_a = hand.result) == null ? void 0 : _a.winners) || [];
    const isWinner = winners.some((w) => w.playerIdx === pi && !w.split);
    const isSplit = winners.some((w) => w.playerIdx === pi && w.split);
    return /* @__PURE__ */ React.createElement("button", { key: pi, style: {
      padding: "4px 10px",
      borderRadius: "6px",
      border: "1px solid",
      cursor: "pointer",
      fontFamily: "'Univers Condensed','Univers',sans-serif",
      fontSize: "0.68rem",
      transition: "all 0.15s",
      background: isWinner ? "rgba(74,222,128,0.15)" : isSplit ? "rgba(250,204,21,0.15)" : "transparent",
      borderColor: isWinner ? "#4ade80" : isSplit ? "#facc15" : "var(--border)",
      color: isWinner ? "#4ade80" : isSplit ? "#facc15" : "var(--text-muted)"
    }, onClick: () => {
      setHand((prev) => {
        var _a2;
        const prevWinners = ((_a2 = prev.result) == null ? void 0 : _a2.winners) || [];
        const existing = prevWinners.find((w) => w.playerIdx === pi);
        let newWinners;
        if (!existing) {
          newWinners = [...prevWinners, { playerIdx: pi, split: false, label: "" }];
        } else if (!existing.split) {
          newWinners = prevWinners.map((w) => w.playerIdx === pi ? __spreadProps(__spreadValues({}, w), { split: true }) : w);
        } else {
          newWinners = prevWinners.filter((w) => w.playerIdx !== pi);
        }
        return __spreadProps(__spreadValues({}, prev), { result: __spreadProps(__spreadValues({}, prev.result), { winners: newWinners }) });
      });
    } }, p.name, " ", isWinner ? "(Win)" : isSplit ? "(Split)" : "");
  })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.55rem", color: "var(--text-muted)", marginTop: "4px", fontFamily: "'Univers Condensed','Univers',sans-serif" } }, "Tap to cycle: none → win → split → none")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", justifyContent: "flex-end" } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: onCancel }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary btn-sm", onClick: () => onDone(hand) }, "Save & Replay")));
}
__name(HandReplayerEntry, "HandReplayerEntry");
var REPLAYER_THEMES = [
  { id: "default", label: "Default" },
  { id: "casino-royale", label: "Casino Royale" },
  { id: "neon-vegas", label: "Neon Vegas" },
  { id: "vintage", label: "Vintage" },
  { id: "minimalist", label: "Minimalist" },
  { id: "high-stakes", label: "High Stakes" }
];
var REPLAYER_CARD_BACKS = [
  { id: "default", label: "Default" },
  { id: "classic", label: "Classic Blue" },
  { id: "casino-red", label: "Casino Red" },
  { id: "black-diamond", label: "Black Diamond" },
  { id: "bicycle", label: "Bicycle" },
  { id: "custom", label: "Custom Color" }
];
var REPLAYER_TABLE_SHAPES = [
  { id: "oval", label: "Oval" },
  { id: "round", label: "Round" },
  { id: "octagon", label: "Octagon" }
];
function useReplayerSetting(key, defaultVal) {
  var fullKey = "replayer" + key;
  var _s = useState(function() {
    var stored = localStorage.getItem(fullKey);
    if (stored === null) return defaultVal;
    if (defaultVal === true || defaultVal === false) return stored === "true";
    return stored;
  });
  var val = _s[0], setVal = _s[1];
  var update = useCallback(function(v) {
    setVal(v);
    localStorage.setItem(fullKey, String(v));
  }, [fullKey]);
  return [val, update];
}
__name(useReplayerSetting, "useReplayerSetting");
function computePlayerContrib(hand, streetIdx, actions, upToIdx, playerIdx) {
  var total = 0;
  var category = getGameCategory(hand.gameType);
  if (streetIdx === 0 && category !== "stud") {
    var pos = hand.players[playerIdx] && hand.players[playerIdx].position;
    if (pos === "SB" || pos === "BTN/SB") total = (hand.blinds || {}).sb || 0;
    else if (pos === "BB") total = (hand.blinds || {}).bb || 0;
  }
  for (var i = 0; i <= upToIdx && i < actions.length; i++) {
    if (actions[i].player === playerIdx) {
      if (actions[i].action === "bring-in") total = actions[i].amount || 0;
      else if (actions[i].action !== "fold") total += actions[i].amount || 0;
    }
  }
  return total;
}
__name(computePlayerContrib, "computePlayerContrib");
function generateCommentary(hand, streetIdx, actionIdx, pot, stacks) {
  var street = hand.streets[streetIdx];
  if (!street) return "The hand begins...";
  var streetName = street.name || "Preflop";
  var category = getGameCategory(hand.gameType);
  var isDrawStreet = (category === "draw_triple" || category === "draw_single") && streetIdx > 0;
  if (actionIdx < 0) {
    if (category === "stud") {
      var _ante = (hand.blinds || {}).ante || 0;
      if (streetIdx === 0) {
        var doorInfo = "";
        var _isRazz = hand.gameType === "Razz" || hand.gameType === "2-7 Razz";
        var _biIdx = findStudBringIn(hand, _isRazz);
        if (_biIdx >= 0 && hand.players[_biIdx]) {
          var biPlayer = hand.players[_biIdx];
          var _hi = hand.heroIdx != null ? hand.heroIdx : 0;
          var _dc = "";
          if (_biIdx === _hi) {
            var _hc = parseCardNotation(hand.streets[0] && hand.streets[0].cards.hero || "");
            if (_hc.length >= 3) _dc = _hc[2].rank + _hc[2].suit;
          } else {
            var _os = _biIdx < _hi ? _biIdx : _biIdx - 1;
            var _oc = parseCardNotation((hand.streets[0] && hand.streets[0].cards.opponents || [])[_os] || "");
            if (_oc.length >= 1) _dc = _oc[0].rank + _oc[0].suit;
          }
          var _SW = { h: "hearts", d: "diamonds", c: "clubs", s: "spades" };
          var _RW = { "A": "Ace", "K": "King", "Q": "Queen", "J": "Jack", "T": "Ten", "9": "Nine", "8": "Eight", "7": "Seven", "6": "Six", "5": "Five", "4": "Four", "3": "Three", "2": "Two" };
          if (_dc && _dc.length >= 2) {
            doorInfo = " " + biPlayer.name + " shows the " + (_RW[_dc[0]] || _dc[0]) + " of " + (_SW[_dc[1]] || _dc[1]) + " as the door card and has the bring-in.";
          } else {
            doorInfo = " " + biPlayer.name + " has the bring-in.";
          }
        }
        return hand.players.length + " players ante " + formatChipAmount(_ante) + ". Cards are dealt — two down, one up." + doorInfo;
      }
      if (streetIdx === 4) return "7th Street: a final card is dealt face down to each remaining player. The pot stands at " + formatChipAmount(pot) + ".";
      return streetName + ": a card is dealt face up to each remaining player. The pot stands at " + formatChipAmount(pot) + ".";
    }
    if (streetIdx === 0) return "Cards are dealt. " + hand.players.length + " players at the table. Blinds are " + formatChipAmount((hand.blinds || {}).sb || 0) + "/" + formatChipAmount((hand.blinds || {}).bb || 0) + ".";
    if (isDrawStreet && street.draws && street.draws.length > 0) {
      var drawParts = street.draws.map(function(d) {
        var pName = hand.players[d.player] ? hand.players[d.player].name : "?";
        if (d.discarded === 0) return pName + " stands pat";
        return pName + " discards " + d.discarded;
      });
      return streetName + ". " + drawParts.join(". ") + ". The pot is " + formatChipAmount(pot) + ".";
    }
    return streetName + " is dealt. The pot stands at " + formatChipAmount(pot) + ".";
  }
  var actions = street.actions || [];
  if (actionIdx >= actions.length) return "";
  var act = actions[actionIdx];
  var player = hand.players[act.player];
  var name = player ? player.name : "Unknown";
  var pos = player ? player.position : "";
  var posStr = pos ? " from the " + pos : "";
  switch (act.action) {
    case "fold":
      return name + posStr + " releases their hand into the muck.";
    case "check":
      return name + posStr + " taps the table. Check.";
    case "call":
      return name + posStr + " makes the call for " + formatChipAmount(act.amount) + ".";
    case "bet":
      if (category === "stud" && streetIdx === 0) {
        var _hasBringIn = actions.slice(0, actionIdx).some(function(a) {
          return a.action === "bring-in";
        });
        var _priorBets = actions.slice(0, actionIdx).filter(function(a) {
          return a.action === "bet" || a.action === "raise";
        }).length;
        if (_hasBringIn && _priorBets === 0) {
          return name + posStr + " completes to " + formatChipAmount(act.amount) + ".";
        }
      }
      return name + posStr + " leads out with a bet of " + formatChipAmount(act.amount) + " into a " + formatChipAmount(pot - act.amount) + " pot.";
    case "raise":
      return name + posStr + " fires a raise to " + formatChipAmount(computePlayerContrib(hand, streetIdx, actions, actionIdx, act.player)) + "! The pot swells to " + formatChipAmount(pot) + ".";
    case "all-in":
      return name + posStr + " moves ALL IN for " + formatChipAmount(act.amount) + "! A pivotal moment at the table.";
    case "bring-in":
      return name + posStr + " posts the bring-in of " + formatChipAmount(act.amount) + ".";
    default:
      return name + " acts (" + act.action + ").";
  }
}
__name(generateCommentary, "generateCommentary");
function calcHandStrength(heroCards, boardCards, gameType) {
  if (!heroCards || heroCards.length < 2) return null;
  var gameCfg = HAND_CONFIG[gameType] || HAND_CONFIG_DEFAULT;
  var gameEval = GAME_EVAL[gameType];
  if (!gameEval) return null;
  var hCards = parseCardNotation(heroCards).filter(function(c) {
    return c.suit !== "x";
  });
  var bCards = boardCards ? parseCardNotation(boardCards).filter(function(c) {
    return c.suit !== "x";
  }) : [];
  if (hCards.length < 2) return null;
  if (bCards.length === 0) {
    var r1 = "23456789TJQKA".indexOf(hCards[0].rank);
    var r2 = hCards.length > 1 ? "23456789TJQKA".indexOf(hCards[1].rank) : 0;
    var suited = hCards.length > 1 && hCards[0].suit === hCards[1].suit;
    var paired = hCards.length > 1 && hCards[0].rank === hCards[1].rank;
    var base = (r1 + r2) / 24 * 60;
    if (paired) base = 50 + r1 / 12 * 50;
    if (suited) base += 8;
    if (Math.abs(r1 - r2) <= 2 && !paired) base += 5;
    return Math.min(100, Math.max(5, Math.round(base)));
  }
  try {
    var allCards = hCards.concat(bCards);
    var ev;
    if (gameEval.method === "omaha") {
      ev = bestOmahaHigh(hCards, bCards);
    } else {
      ev = bestHighHand(allCards);
    }
    if (!ev) return 30;
    var rankMap = {
      "High Card": 15,
      "Pair": 30,
      "Two Pair": 45,
      "Three of a Kind": 55,
      "Straight": 65,
      "Flush": 75,
      "Full House": 82,
      "Four of a Kind": 92,
      "Straight Flush": 97,
      "Royal Flush": 100
    };
    var baseStr = 30;
    for (var k in rankMap) {
      if (ev.name && ev.name.indexOf(k) >= 0) {
        baseStr = rankMap[k];
        break;
      }
    }
    var topRank = Math.max(r1 || 0, r2 || 0);
    baseStr += topRank / 12 * 5;
    return Math.min(100, Math.max(5, Math.round(baseStr)));
  } catch (e) {
    return 30;
  }
}
__name(calcHandStrength, "calcHandStrength");
function getStrengthColor(pct) {
  if (pct >= 75) return "#4ade80";
  if (pct >= 50) return "#facc15";
  if (pct >= 25) return "#f59e0b";
  return "#ef4444";
}
__name(getStrengthColor, "getStrengthColor");
function calcSPR(hand, streetIdx) {
  if (streetIdx <= 0) return null;
  var prevStreet = hand.streets[streetIdx - 1];
  var prevActionCount = prevStreet && prevStreet.actions ? prevStreet.actions.length - 1 : -1;
  var result = calcPotsAndStacks(hand, streetIdx - 1, prevActionCount);
  if (result.pot <= 0) return null;
  var heroIdx = hand.heroIdx != null ? hand.heroIdx : 0;
  var heroStack = result.stacks[heroIdx];
  if (heroStack <= 0) return null;
  return (heroStack / result.pot).toFixed(1);
}
__name(calcSPR, "calcSPR");
function getBetSizingLabel(betAmount, potBeforeBet) {
  if (!betAmount || betAmount <= 0 || potBeforeBet <= 0) return null;
  var ratio = betAmount / potBeforeBet;
  if (ratio <= 0.28) return "min";
  if (ratio <= 0.38) return "1/3 pot";
  if (ratio <= 0.55) return "1/2 pot";
  if (ratio <= 0.7) return "2/3 pot";
  if (ratio <= 0.85) return "3/4 pot";
  if (ratio <= 1.15) return "pot";
  if (ratio <= 1.6) return "1.5x pot";
  if (ratio <= 2.2) return "2x pot";
  if (ratio <= 3.2) return "3x pot";
  return "overbet";
}
__name(getBetSizingLabel, "getBetSizingLabel");
function estimateRange(hand, playerIdx, upToStreet, upToAction) {
  var dominated = false;
  var hasRaise = false;
  var has3bet = false;
  var hasCall = false;
  var hasLimp = false;
  var raiseCount = 0;
  for (var si = 0; si <= upToStreet && si < hand.streets.length; si++) {
    var maxAi = si === upToStreet ? upToAction : (hand.streets[si].actions || []).length - 1;
    var streetRaiseCount = 0;
    for (var ai = 0; ai <= maxAi && ai < (hand.streets[si].actions || []).length; ai++) {
      var act = hand.streets[si].actions[ai];
      if (act.player !== playerIdx) {
        if (act.action === "raise" || act.action === "bet") streetRaiseCount++;
        continue;
      }
      if (act.action === "raise" || act.action === "all-in") {
        hasRaise = true;
        raiseCount++;
        if (streetRaiseCount >= 1) has3bet = true;
      }
      if (act.action === "call") {
        hasCall = true;
        if (si === 0 && streetRaiseCount === 0) hasLimp = true;
      }
      if (act.action === "fold") dominated = true;
    }
  }
  if (dominated) return null;
  if (has3bet || raiseCount >= 2) return { label: "Strong", cls: "replayer-range-strong" };
  if (hasRaise) return { label: "Medium+", cls: "replayer-range-medium" };
  if (hasLimp) return { label: "Speculative", cls: "replayer-range-speculative" };
  if (hasCall) return { label: "Medium", cls: "replayer-range-passive" };
  return null;
}
__name(estimateRange, "estimateRange");
function calcShowdownEquity(hand, heroCardsStr, opponentCardsArr, boardCardsStr, gameCfg, gameEval, folded, replayHeroIdx) {
  if (!gameEval) return null;
  var bCards = boardCardsStr ? parseCardNotation(boardCardsStr).filter(function(c) {
    return c.suit !== "x";
  }) : [];
  var getScore = /* @__PURE__ */ __name(function(holeStr) {
    try {
      var hole = parseCardNotation(holeStr).filter(function(c) {
        return c.suit !== "x";
      });
      if (hole.length < 2) return 0;
      var all = hole.concat(bCards);
      var ev;
      if (gameEval.type === "low") {
        ev = gameEval.lowType === "a5" ? bestLowA5Hand(all, false) : bestLow27Hand(all);
        return ev && ev.score < Infinity ? 1e9 - ev.score : 0;
      }
      if (gameEval.type === "hilo") {
        var hiEv = gameEval.method === "omaha" ? bestOmahaHigh(hole, bCards) : bestHighHand(all);
        var loEv = gameEval.method === "omaha" ? bestOmahaLow(hole, bCards) : bestLowA5Hand(all, true);
        var hiScore = hiEv && hiEv.score ? hiEv.score : 0;
        var loScore = loEv && loEv.qualified ? 1e9 - loEv.score : 0;
        return hiScore + loScore;
      }
      if (gameEval.method === "omaha") {
        ev = bestOmahaHigh(hole, bCards);
      } else {
        ev = bestHighHand(all);
      }
      return ev && ev.score ? ev.score : 0;
    } catch (e) {
      return 0;
    }
  }, "getScore");
  var activePlayers = [];
  hand.players.forEach(function(p, pi) {
    if (!folded.has(pi)) activePlayers.push(pi);
  });
  if (activePlayers.length < 2) return null;
  var scores = {};
  activePlayers.forEach(function(pi) {
    var cards = pi === replayHeroIdx ? heroCardsStr : opponentCardsArr[pi] || "";
    if (!cards || cards === "MUCK") {
      scores[pi] = 0;
      return;
    }
    scores[pi] = getScore(cards);
  });
  var totalScore = 0;
  activePlayers.forEach(function(pi) {
    totalScore += Math.max(scores[pi] || 0, 1);
  });
  var equities = {};
  activePlayers.forEach(function(pi) {
    equities[pi] = Math.round(Math.max(scores[pi] || 0, 1) / totalScore * 100);
  });
  return equities;
}
__name(calcShowdownEquity, "calcShowdownEquity");
function getStreetColorClass(streetName) {
  if (!streetName) return "street-preflop";
  var lower = streetName.toLowerCase();
  if (lower === "flop" || lower === "3rd street") return "street-flop";
  if (lower === "turn" || lower === "4th street") return "street-turn";
  if (lower === "river" || lower === "5th street" || lower === "6th street" || lower === "7th street") return "street-river";
  return "street-preflop";
}
__name(getStreetColorClass, "getStreetColorClass");
function calcPotBeforeAction(hand, streetIdx, actionIdx) {
  if (actionIdx < 0) return calcPotsAndStacks(hand, streetIdx, -1).pot;
  return calcPotsAndStacks(hand, streetIdx, actionIdx - 1).pot;
}
__name(calcPotBeforeAction, "calcPotBeforeAction");
function PotChipVisual({ amount }) {
  var chips = getChipBreakdown(amount);
  var stacks = [];
  var current = null;
  chips.forEach(function(color) {
    if (current && current.color === color) {
      current.count++;
    } else {
      current = { color, count: 1 };
      stacks.push(current);
    }
  });
  return React.createElement(
    "div",
    { className: "replayer-pot-chips" },
    stacks.slice(0, 5).map(function(stack, i) {
      return React.createElement(
        "div",
        { key: i, className: "replayer-pot-chip-stack" },
        Array.from({ length: Math.min(stack.count, 6) }, function(_, j) {
          return React.createElement("div", {
            key: j,
            className: "replayer-pot-chip-disc",
            style: { background: stack.color }
          });
        })
      );
    })
  );
}
__name(PotChipVisual, "PotChipVisual");
var PLAYER_STATS_DATA = {};
function getPlayerStats(name) {
  if (PLAYER_STATS_DATA[name]) return PLAYER_STATS_DATA[name];
  var hash = 0;
  for (var i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
  hash = Math.abs(hash);
  var vpip = 15 + hash % 35;
  var pfr = Math.max(5, vpip - 5 - hash % 15);
  var ag = 1 + hash % 30 / 10;
  PLAYER_STATS_DATA[name] = { vpip, pfr, ag: ag.toFixed(1) };
  return PLAYER_STATS_DATA[name];
}
__name(getPlayerStats, "getPlayerStats");
function ReplayerSettingsPanel({ onClose, settings, onUpdate }) {
  return ReactDOM.createPortal(
    React.createElement(
      React.Fragment,
      null,
      React.createElement("div", { className: "replayer-settings-backdrop", onClick: onClose }),
      React.createElement(
        "div",
        { className: "replayer-settings-panel" },
        React.createElement(
          "div",
          { className: "replayer-settings-header" },
          React.createElement("span", null, "Replayer Settings"),
          React.createElement("button", { className: "replayer-settings-close", onClick: onClose }, "×")
        ),
        // TABLE section
        React.createElement(
          "div",
          { className: "replayer-settings-group" },
          React.createElement("div", { className: "replayer-settings-group-title" }, "Table"),
          React.createElement(
            "div",
            { className: "replayer-settings-row", style: { flexDirection: "column", alignItems: "flex-start", gap: "6px" } },
            React.createElement("div", { className: "replayer-settings-label" }, "Theme"),
            React.createElement(
              "div",
              { className: "replayer-settings-pills" },
              REPLAYER_THEMES.map(function(t) {
                return React.createElement("button", {
                  key: t.id,
                  className: "replayer-settings-pill" + (settings.theme === t.id ? " active" : ""),
                  onClick: /* @__PURE__ */ __name(function() {
                    onUpdate("theme", t.id);
                  }, "onClick")
                }, t.label);
              })
            )
          ),
          React.createElement(
            "div",
            { className: "replayer-settings-row", style: { flexDirection: "column", alignItems: "flex-start", gap: "6px", marginTop: "8px" } },
            React.createElement("div", { className: "replayer-settings-label" }, "Table Shape"),
            React.createElement(
              "div",
              { className: "replayer-settings-pills" },
              REPLAYER_TABLE_SHAPES.map(function(s) {
                return React.createElement("button", {
                  key: s.id,
                  className: "replayer-settings-pill" + (settings.tableShape === s.id ? " active" : ""),
                  onClick: /* @__PURE__ */ __name(function() {
                    onUpdate("tableShape", s.id);
                  }, "onClick")
                }, s.label);
              })
            )
          ),
          settings.theme === "default" && React.createElement(
            "div",
            { className: "replayer-settings-row", style: { flexDirection: "column", alignItems: "flex-start", gap: "6px", marginTop: "8px" } },
            React.createElement("div", { className: "replayer-settings-label" }, "Felt Color"),
            React.createElement(
              "div",
              { style: { display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" } },
              [
                { name: "Lavender", color: "#6b5b8a" },
                { name: "Classic Green", color: "#2d5a27" },
                { name: "Blue", color: "#1a3a5c" },
                { name: "Red", color: "#5a1a1a" },
                { name: "Purple", color: "#3d1a5a" },
                { name: "Black", color: "#1a1a1a" }
              ].map(function(fc) {
                return React.createElement("button", {
                  key: fc.color,
                  className: "felt-color-swatch" + (settings.feltColor === fc.color ? " active" : ""),
                  style: { background: fc.color },
                  title: fc.name,
                  onClick: /* @__PURE__ */ __name(function() {
                    onUpdate("feltColor", fc.color);
                  }, "onClick")
                });
              }),
              React.createElement("input", {
                type: "color",
                value: settings.feltColor,
                onChange: /* @__PURE__ */ __name(function(e) {
                  onUpdate("feltColor", e.target.value);
                }, "onChange"),
                style: { width: "24px", height: "24px", border: "none", cursor: "pointer", borderRadius: "4px", marginLeft: "4px" },
                title: "Custom color"
              })
            )
          )
        ),
        // CARDS section
        React.createElement(
          "div",
          { className: "replayer-settings-group" },
          React.createElement("div", { className: "replayer-settings-group-title" }, "Cards"),
          React.createElement(
            "div",
            { className: "replayer-settings-row", style: { flexDirection: "column", alignItems: "flex-start", gap: "6px" } },
            React.createElement("div", { className: "replayer-settings-label" }, "Card Back Design"),
            React.createElement(
              "div",
              { className: "replayer-settings-pills" },
              REPLAYER_CARD_BACKS.map(function(cb) {
                return React.createElement("button", {
                  key: cb.id,
                  className: "replayer-settings-pill" + (settings.cardBack === cb.id ? " active" : ""),
                  onClick: /* @__PURE__ */ __name(function() {
                    onUpdate("cardBack", cb.id);
                  }, "onClick")
                }, cb.label);
              })
            )
          ),
          settings.cardBack === "custom" && React.createElement(
            "div",
            { className: "replayer-settings-row", style: { marginTop: "8px" } },
            React.createElement("div", { className: "replayer-settings-label" }, "Custom Card Back Color"),
            React.createElement("input", {
              type: "color",
              value: settings.cardBackColor,
              onChange: /* @__PURE__ */ __name(function(e) {
                onUpdate("cardBackColor", e.target.value);
              }, "onChange"),
              style: { width: "32px", height: "24px", border: "none", cursor: "pointer", borderRadius: "4px" }
            })
          ),
          React.createElement(
            "div",
            { className: "replayer-settings-row", style: { marginTop: "6px" } },
            React.createElement(
              "div",
              null,
              React.createElement("div", { className: "replayer-settings-label" }, "4-Color Deck"),
              React.createElement("div", { className: "replayer-settings-sublabel" }, "Diamonds=blue, Clubs=green")
            ),
            React.createElement("button", {
              className: "replayer-settings-toggle" + (settings.fourColorDeck ? " on" : ""),
              onClick: /* @__PURE__ */ __name(function() {
                onUpdate("fourColorDeck", !settings.fourColorDeck);
              }, "onClick")
            })
          ),
          React.createElement(
            "div",
            { className: "replayer-settings-row", style: { flexDirection: "column", alignItems: "flex-start", gap: "6px", marginTop: "8px" } },
            React.createElement("div", { className: "replayer-settings-label" }, "Card Front Style"),
            React.createElement(
              "div",
              { className: "replayer-settings-pills" },
              [{ id: "default", label: "Standard" }, { id: "classic", label: "Classic" }].map(function(ct) {
                return React.createElement("button", {
                  key: ct.id,
                  className: "replayer-settings-pill" + (settings.cardTheme === ct.id ? " active" : ""),
                  onClick: /* @__PURE__ */ __name(function() {
                    onUpdate("cardTheme", ct.id);
                  }, "onClick")
                }, ct.label);
              })
            )
          ),
          React.createElement(
            "div",
            { className: "replayer-settings-row", style: { marginTop: "8px" } },
            React.createElement("div", { className: "replayer-settings-label" }, "Splay Hole Cards"),
            React.createElement("button", {
              className: "replayer-settings-toggle" + (settings.cardSplay ? " on" : ""),
              onClick: /* @__PURE__ */ __name(function() {
                onUpdate("cardSplay", !settings.cardSplay);
              }, "onClick")
            })
          ),
          React.createElement(
            "div",
            { className: "replayer-settings-row", style: { marginTop: "8px" } },
            React.createElement("div", { className: "replayer-settings-label" }, "Rail Light Strip"),
            React.createElement("button", {
              className: "replayer-settings-toggle" + (settings.lightStrip ? " on" : ""),
              onClick: /* @__PURE__ */ __name(function() {
                onUpdate("lightStrip", !settings.lightStrip);
              }, "onClick")
            })
          )
        ),
        // DISPLAY section
        React.createElement(
          "div",
          { className: "replayer-settings-group" },
          React.createElement("div", { className: "replayer-settings-group-title" }, "Display"),
          [
            { key: "showChipStacks", label: "Pot Chip Stacks", sub: "Visual chip stacks in pot area" },
            { key: "showHandStrength", label: "Hand Strength Meter", sub: "Gauge showing relative hand strength" },
            { key: "showPotOdds", label: "Pot Odds", sub: "Show pot odds when facing a bet" },
            { key: "showCommentary", label: "Commentator Mode", sub: "Auto-generated play-by-play text" },
            { key: "showTimeline", label: "Action Timeline", sub: "Clickable dots showing all actions" },
            { key: "showPlayerStats", label: "Player Stats", sub: "VPIP/PFR overlay on seats" },
            { key: "showNutsHighlight", label: "Highlight the Nuts", sub: "Glow when holding the best hand" }
          ].map(function(opt) {
            return React.createElement(
              "div",
              { key: opt.key, className: "replayer-settings-row" },
              React.createElement(
                "div",
                null,
                React.createElement("div", { className: "replayer-settings-label" }, opt.label),
                React.createElement("div", { className: "replayer-settings-sublabel" }, opt.sub)
              ),
              React.createElement("button", {
                className: "replayer-settings-toggle" + (settings[opt.key] ? " on" : ""),
                onClick: /* @__PURE__ */ __name(function() {
                  onUpdate(opt.key, !settings[opt.key]);
                }, "onClick")
              })
            );
          })
        ),
        // ANIMATION section
        React.createElement(
          "div",
          { className: "replayer-settings-group" },
          React.createElement("div", { className: "replayer-settings-group-title" }, "Animation"),
          [
            { key: "animateDeal", label: "Deal Animation", sub: "Cards slide in when dealt" },
            { key: "animateChips", label: "Chip Animation", sub: "Chips slide from player to pot" },
            { key: "animateBoard", label: "Board Flip", sub: "Board cards flip face-up" },
            { key: "animateWinner", label: "Winner Effects", sub: "Bounce and glow on winning hand" }
          ].map(function(opt) {
            return React.createElement(
              "div",
              { key: opt.key, className: "replayer-settings-row" },
              React.createElement(
                "div",
                null,
                React.createElement("div", { className: "replayer-settings-label" }, opt.label),
                React.createElement("div", { className: "replayer-settings-sublabel" }, opt.sub)
              ),
              React.createElement("button", {
                className: "replayer-settings-toggle" + (settings[opt.key] ? " on" : ""),
                onClick: /* @__PURE__ */ __name(function() {
                  onUpdate(opt.key, !settings[opt.key]);
                }, "onClick")
              })
            );
          })
        ),
        // SOUND section
        React.createElement(
          "div",
          { className: "replayer-settings-group" },
          React.createElement("div", { className: "replayer-settings-group-title" }, "Sound (Coming Soon)"),
          [
            { key: "soundDeal", label: "Card Deal Sound" },
            { key: "soundChips", label: "Chip Sound" },
            { key: "soundFold", label: "Fold Sound" },
            { key: "soundAllIn", label: "All-In Sound" }
          ].map(function(opt) {
            return React.createElement(
              "div",
              { key: opt.key, className: "replayer-settings-row", style: { opacity: 0.4 } },
              React.createElement("div", { className: "replayer-settings-label" }, opt.label),
              React.createElement("button", { className: "replayer-settings-toggle", disabled: true })
            );
          })
        )
      )
    ),
    document.body
  );
}
__name(ReplayerSettingsPanel, "ReplayerSettingsPanel");
function HandReplayerReplay({ hand, onEdit, onBack, cardSplay }) {
  const [streetIdx, setStreetIdx] = useState(0);
  const [actionIdx, setActionIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1e3);
  const [showResult, setShowResult] = useState(false);
  const [hiloAnimate, setHiloAnimate] = useState(false);
  const [isLandscape, setIsLandscape] = useState(() => window.matchMedia("(orientation: landscape)").matches);
  useEffect(function() {
    var mql = window.matchMedia("(orientation: landscape)");
    var handler = /* @__PURE__ */ __name(function(e) {
      setIsLandscape(e.matches);
    }, "handler");
    mql.addEventListener("change", handler);
    return function() {
      mql.removeEventListener("change", handler);
    };
  }, []);
  const [feltColor, setFeltColor] = useState(() => localStorage.getItem("replayerFeltColor") || "#6b5b8a");
  const [cardTheme, setCardTheme] = useState(() => localStorage.getItem("replayerCardTheme") || "default");
  const playTimerRef = useRef(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showFeltPicker, setShowFeltPicker] = useState(false);
  const prevStreetRef = useRef(0);
  var _theme = useReplayerSetting("Theme", "default");
  var _tableShape = useReplayerSetting("TableShape", "oval");
  var _cardBack = useReplayerSetting("CardBack", "default");
  var _cardBackColor = useReplayerSetting("CardBackColor", "#1a3a6e");
  var _fourColor = useReplayerSetting("FourColorDeck", false);
  var _showChipStacks = useReplayerSetting("ShowChipStacks", false);
  var _showHandStrength = useReplayerSetting("ShowHandStrength", false);
  var _showPotOdds = useReplayerSetting("ShowPotOdds", false);
  var _showCommentary = useReplayerSetting("ShowCommentary", false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const copyShareLink = useCallback(() => {
    if (!window.encodeHand) return;
    try {
      var shorthand = window.encodeHand(hand);
      if (!shorthand) return;
      var url = window.location.origin + "/#h/" + encodeURIComponent(shorthand);
      navigator.clipboard.writeText(url).then(() => {
        setShareLinkCopied(true);
        setTimeout(() => setShareLinkCopied(false), 2e3);
      });
    } catch (e) {
      console.error("Failed to generate share link:", e);
    }
  }, [hand]);
  var _showTimeline = useReplayerSetting("ShowTimeline", true);
  var _showPlayerStats = useReplayerSetting("ShowPlayerStats", false);
  var _showNuts = useReplayerSetting("ShowNutsHighlight", false);
  var _showSPR = useReplayerSetting("ShowSPR", false);
  var _showBetSizing = useReplayerSetting("ShowBetSizing", false);
  var _showRanges = useReplayerSetting("ShowRanges", false);
  var _showChipDelta = useReplayerSetting("ShowChipDelta", false);
  var _showEquity = useReplayerSetting("ShowEquity", false);
  var _cardSplay = useReplayerSetting("CardSplay", true);
  var _lightStrip = useReplayerSetting("LightStrip", false);
  var _animDeal = useReplayerSetting("AnimateDeal", true);
  var _animChips = useReplayerSetting("AnimateChips", true);
  var _animBoard = useReplayerSetting("AnimateBoard", true);
  var _animWinner = useReplayerSetting("AnimateWinner", true);
  var rSettings = {
    theme: _theme[0],
    tableShape: _tableShape[0],
    feltColor,
    cardBack: _cardBack[0],
    cardBackColor: _cardBackColor[0],
    fourColorDeck: _fourColor[0],
    showChipStacks: _showChipStacks[0],
    showHandStrength: _showHandStrength[0],
    showPotOdds: _showPotOdds[0],
    showCommentary: _showCommentary[0],
    showTimeline: _showTimeline[0],
    showPlayerStats: _showPlayerStats[0],
    showNutsHighlight: _showNuts[0],
    showSPR: _showSPR[0],
    showBetSizing: _showBetSizing[0],
    showRanges: _showRanges[0],
    showChipDelta: _showChipDelta[0],
    showEquity: _showEquity[0],
    animateDeal: _animDeal[0],
    animateChips: _animChips[0],
    animateBoard: _animBoard[0],
    animateWinner: _animWinner[0],
    cardTheme,
    cardSplay: _cardSplay[0],
    lightStrip: _lightStrip[0]
  };
  var rSetters = {
    theme: _theme[1],
    tableShape: _tableShape[1],
    feltColor: /* @__PURE__ */ __name(function(v) {
      setFeltColor(v);
      localStorage.setItem("replayerFeltColor", v);
    }, "feltColor"),
    cardBack: _cardBack[1],
    cardBackColor: _cardBackColor[1],
    fourColorDeck: _fourColor[1],
    showChipStacks: _showChipStacks[1],
    showHandStrength: _showHandStrength[1],
    showPotOdds: _showPotOdds[1],
    showCommentary: _showCommentary[1],
    showTimeline: _showTimeline[1],
    showPlayerStats: _showPlayerStats[1],
    showNutsHighlight: _showNuts[1],
    showSPR: _showSPR[1],
    showBetSizing: _showBetSizing[1],
    showRanges: _showRanges[1],
    showChipDelta: _showChipDelta[1],
    showEquity: _showEquity[1],
    animateDeal: _animDeal[1],
    animateChips: _animChips[1],
    animateBoard: _animBoard[1],
    animateWinner: _animWinner[1],
    cardTheme: /* @__PURE__ */ __name(function(v) {
      setCardTheme(v);
      localStorage.setItem("replayerCardTheme", v);
    }, "cardTheme"),
    cardSplay: _cardSplay[1],
    lightStrip: _lightStrip[1]
  };
  var handleSettingsUpdate = /* @__PURE__ */ __name(function(key, val) {
    if (rSetters[key]) rSetters[key](val);
  }, "handleSettingsUpdate");
  const [animFolded, setAnimFolded] = useState(/* @__PURE__ */ new Set());
  const [animStreetTransition, setAnimStreetTransition] = useState(false);
  const [animStreetLabel, setAnimStreetLabel] = useState(false);
  const [animShowdown, setAnimShowdown] = useState(false);
  const [flyingChips, setFlyingChips] = useState([]);
  const [animPotCollect, setAnimPotCollect] = useState(false);
  const prevActionIdxRef = useRef(-1);
  const prevShowResultRef = useRef(false);
  const tableRef = useRef(null);
  useEffect(function() {
    if (prevStreetRef.current !== streetIdx && streetIdx > 0) {
      setAnimStreetTransition(true);
      setAnimStreetLabel(true);
      var t1 = setTimeout(function() {
        setAnimStreetTransition(false);
      }, 500);
      var t2 = setTimeout(function() {
        setAnimStreetLabel(false);
      }, 450);
      return function() {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [streetIdx]);
  useEffect(function() {
    prevStreetRef.current = streetIdx;
  }, [streetIdx]);
  const [drawDiscardAnims, setDrawDiscardAnims] = useState([]);
  var spawnFlyingChips = useCallback(function(fromPct, toPct, count, toWinner) {
    if (!tableRef.current) return;
    var rect = tableRef.current.getBoundingClientRect();
    var chips = [];
    for (var i = 0; i < Math.min(count, 5); i++) {
      chips.push({
        id: Date.now() + "-" + i,
        x0: fromPct[0] / 100 * rect.width,
        y0: fromPct[1] / 100 * rect.height,
        x1: toPct[0] / 100 * rect.width,
        y1: toPct[1] / 100 * rect.height,
        delay: i * 60,
        toWinner: !!toWinner
      });
    }
    setFlyingChips(function(prev) {
      return prev.concat(chips);
    });
    setTimeout(function() {
      setFlyingChips([]);
    }, 700);
  }, []);
  var getBoardAnimClass = /* @__PURE__ */ __name(function() {
    if (!rSettings.animateBoard || prevStreetRef.current === streetIdx) return "";
    var boardLen = 0;
    for (var si = 0; si <= streetIdx && si < hand.streets.length; si++) {
      if (hand.streets[si].cards.board) boardLen += parseCardNotation(hand.streets[si].cards.board).length;
    }
    if (boardLen <= 3 && streetIdx > 0) return " animate-board-flop";
    if (boardLen === 4) return " animate-board-turn";
    if (boardLen === 5) return " animate-board-river";
    return "";
  }, "getBoardAnimClass");
  const gameCfg = HAND_CONFIG[hand.gameType] || HAND_CONFIG_DEFAULT;
  const category = getGameCategory(hand.gameType);
  const streetDef = getStreetDef(hand.gameType);
  const gameEval = GAME_EVAL[hand.gameType];
  const isHiLo = gameEval && (gameEval.type === "hilo" || gameEval.type === "split-badugi");
  const totalStreets = hand.streets.length;
  const currentStreet = hand.streets[streetIdx];
  const currentActions = (currentStreet == null ? void 0 : currentStreet.actions) || [];
  useEffect(function() {
    if (actionIdx < 0) {
      prevActionIdxRef.current = actionIdx;
      return;
    }
    var actions = currentActions;
    if (actionIdx >= 0 && actionIdx < actions.length) {
      var act = actions[actionIdx];
      if (act && act.action === "fold" && rSettings.animateDeal) {
        setAnimFolded(function(prev) {
          var n = new Set(prev);
          n.add(act.player);
          return n;
        });
        setTimeout(function() {
          setAnimFolded(function(prev) {
            var n = new Set(prev);
            n.delete(act.player);
            return n;
          });
        }, 450);
      }
    }
    prevActionIdxRef.current = actionIdx;
  }, [actionIdx, currentActions, rSettings.animateDeal]);
  useEffect(function() {
    setAnimFolded(/* @__PURE__ */ new Set());
  }, [streetIdx]);
  useEffect(function() {
    if (showResult && !prevShowResultRef.current && rSettings.animateDeal) {
      setAnimShowdown(true);
      setTimeout(function() {
        setAnimShowdown(false);
      }, 600);
    }
    prevShowResultRef.current = showResult;
  }, [showResult, rSettings.animateDeal]);
  const boardCards = useMemo(() => {
    if (category !== "community") return "";
    let board = "";
    for (let si = 0; si <= streetIdx && si < hand.streets.length; si++) {
      if (hand.streets[si].cards.board) board += hand.streets[si].cards.board;
    }
    return board;
  }, [hand, streetIdx, category]);
  const isDrawGame = category === "draw_triple" || category === "draw_single";
  const replayHeroIdx = hand.heroIdx != null ? hand.heroIdx : 0;
  const heroCards = useMemo(() => {
    var _a, _b, _c;
    if (category === "stud") {
      let cards = "";
      for (let si = 0; si <= streetIdx; si++) {
        if ((_a = hand.streets[si]) == null ? void 0 : _a.cards.hero) cards += hand.streets[si].cards.hero;
      }
      return cards;
    }
    if (isDrawGame) {
      var base = ((_b = hand.streets[0]) == null ? void 0 : _b.cards.hero) || "";
      var heroDraws = getPlayerDrawsByStreet(hand, replayHeroIdx);
      return computeDrawHand(base, heroDraws, streetIdx - 1);
    }
    return ((_c = hand.streets[0]) == null ? void 0 : _c.cards.hero) || "";
  }, [hand, streetIdx, category, isDrawGame, replayHeroIdx]);
  const opponentCards = useMemo(() => {
    return hand.players.map((_, pi) => {
      var _a, _b, _c, _d, _e, _f;
      if (pi === replayHeroIdx) return null;
      var oppSlot = pi > replayHeroIdx ? pi - 1 : pi;
      if (category === "stud") {
        let cards = "";
        for (let si = 0; si <= streetIdx; si++) {
          if ((_b = (_a = hand.streets[si]) == null ? void 0 : _a.cards.opponents) == null ? void 0 : _b[oppSlot]) cards += hand.streets[si].cards.opponents[oppSlot];
        }
        return cards;
      }
      if (isDrawGame) {
        return ((_d = (_c = hand.streets[0]) == null ? void 0 : _c.cards.opponents) == null ? void 0 : _d[oppSlot]) || "";
      }
      return ((_f = (_e = hand.streets[0]) == null ? void 0 : _e.cards.opponents) == null ? void 0 : _f[oppSlot]) || "";
    });
  }, [hand, streetIdx, category, replayHeroIdx, isDrawGame]);
  const { stacks, pot, folded } = useMemo(() => {
    return calcPotsAndStacks(hand, streetIdx, actionIdx);
  }, [hand, streetIdx, actionIdx]);
  const displayPot = useMemo(() => {
    return calcPotsAndStacks(hand, streetIdx, -1).pot;
  }, [hand, streetIdx]);
  const playerLastAction = useMemo(() => {
    const result = {};
    for (let ai = 0; ai <= actionIdx && ai < currentActions.length; ai++) {
      const act = currentActions[ai];
      result[act.player] = act;
    }
    return result;
  }, [currentActions, actionIdx]);
  const evalResult = useMemo(() => {
    if (showResult && hand.result && hand.result.winners) {
      return hand.result.winners.map((w) => {
        var _a;
        var pName = w.playerIdx === replayHeroIdx ? "Hero" : ((_a = hand.players[w.playerIdx]) == null ? void 0 : _a.name) || "Player";
        var winHandName = "";
        var pCards = w.playerIdx === replayHeroIdx ? heroCards : opponentCards[w.playerIdx] || "";
        if (pCards && pCards !== "MUCK") {
          var cfg = GAME_EVAL[hand.gameType];
          if (cfg) {
            var parsed = parseCardNotation(pCards).filter(function(c) {
              return c.suit !== "x";
            });
            var board = category === "community" ? parseCardNotation(boardCards).filter(function(c) {
              return c.suit !== "x";
            }) : [];
            var ev = null;
            if (cfg.type === "high" || cfg.type === "hilo") {
              ev = cfg.method === "omaha" ? bestOmahaHigh(parsed, board) : bestHighHand(parsed.concat(board));
            } else if (cfg.type === "low") {
              ev = cfg.lowType === "a5" ? bestLowA5Hand(parsed.concat(board), false) : bestLow27Hand(parsed.concat(board));
            } else if (cfg.type === "badugi") {
              ev = bestBadugiHand(parsed);
            }
            if (ev) winHandName = ev.name;
          }
        }
        var label = w.label || pName + " wins" + (winHandName ? ", " + winHandName : "");
        return {
          index: w.playerIdx,
          result: {
            outcome: w.playerIdx === replayHeroIdx ? "hero" : w.split ? "split" : "opponent",
            text: label,
            color: w.split ? "yellow" : w.playerIdx === replayHeroIdx ? "green" : "red"
          }
        };
      });
    }
    if (!showResult || !gameEval) return null;
    const hCards = parseCardNotation(heroCards);
    const bCards = gameCfg.hasBoard ? parseCardNotation(boardCards) : [];
    if (gameCfg.hasBoard && bCards.length < 3) return null;
    if (hCards.length < (gameCfg.isStud ? 5 : gameCfg.heroCards)) return null;
    const boardSuits = new Set(bCards.map((c) => c.suit));
    const usedKeys = bCards.map((c) => c.rank + c.suit);
    let hEval;
    if (gameCfg.isStud) {
      hEval = hCards.filter((c) => c.suit !== "x");
    } else {
      hEval = assignNeutralSuits(hCards, usedKeys, boardSuits);
    }
    hEval.forEach((c) => {
      if (c.suit !== "x") usedKeys.push(c.rank + c.suit);
    });
    const results = [];
    for (let pi = 0; pi < opponentCards.length; pi++) {
      if (pi === replayHeroIdx) continue;
      if (folded.has(pi)) continue;
      if (!opponentCards[pi]) continue;
      const oRaw = parseCardNotation(opponentCards[pi]);
      if (oRaw.length < (gameCfg.isStud ? 5 : gameCfg.heroCards)) continue;
      let oEval;
      if (gameCfg.isStud) {
        oEval = oRaw.filter((c) => c.suit !== "x");
      } else {
        oEval = assignNeutralSuits(oRaw, usedKeys, boardSuits);
      }
      const ev = evaluateHand(hand.gameType, hEval, oEval, bCards);
      if (ev && ev.result) results.push(__spreadValues({ index: pi }, ev));
      oEval.forEach((c) => {
        if (c.suit !== "x") usedKeys.push(c.rank + c.suit);
      });
    }
    return results.length ? results : null;
  }, [showResult, hand, heroCards, opponentCards, boardCards, gameCfg, gameEval, folded]);
  const canGoForward = streetIdx < totalStreets - 1 || actionIdx < currentActions.length - 1 || !showResult;
  const canGoBack = streetIdx > 0 || actionIdx >= 0 || showResult;
  const stepForward = useCallback(() => {
    if (actionIdx < currentActions.length - 1) {
      setActionIdx((a) => a + 1);
    } else if (streetIdx < totalStreets - 1) {
      setStreetIdx((s) => s + 1);
      setActionIdx(-1);
    } else if (!showResult) {
      setShowResult(true);
      if (isHiLo) {
        setTimeout(() => setHiloAnimate(true), 100);
      }
    } else {
      setPlaying(false);
    }
  }, [actionIdx, currentActions.length, streetIdx, totalStreets, showResult, isHiLo]);
  const stepBack = useCallback(() => {
    var _a;
    if (showResult) {
      setShowResult(false);
      setHiloAnimate(false);
    } else if (actionIdx >= 0) {
      setActionIdx((a) => a - 1);
    } else if (streetIdx > 0) {
      const prevStreet = hand.streets[streetIdx - 1];
      setStreetIdx((s) => s - 1);
      setActionIdx((((_a = prevStreet == null ? void 0 : prevStreet.actions) == null ? void 0 : _a.length) || 0) - 1);
    }
  }, [actionIdx, streetIdx, showResult, hand]);
  const goToStart = /* @__PURE__ */ __name(() => {
    setStreetIdx(0);
    setActionIdx(-1);
    setShowResult(false);
    setHiloAnimate(false);
  }, "goToStart");
  const goToEnd = /* @__PURE__ */ __name(() => {
    var _a, _b;
    const lastStreet = hand.streets.length - 1;
    setStreetIdx(lastStreet);
    setActionIdx((((_b = (_a = hand.streets[lastStreet]) == null ? void 0 : _a.actions) == null ? void 0 : _b.length) || 0) - 1);
  }, "goToEnd");
  useEffect(() => {
    if (playing) {
      var animExtra = rSettings.animateDeal ? Math.max(200, speed * 0.3) : 0;
      var effectiveSpeed = speed + animExtra;
      playTimerRef.current = setInterval(() => {
        stepForward();
      }, effectiveSpeed);
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [playing, speed, stepForward, rSettings.animateDeal]);
  useEffect(() => {
    if (showResult && playing) setPlaying(false);
  }, [showResult, playing]);
  useEffect(function() {
    if (!isDrawGame || !rSettings.animateDeal) return;
    var st = hand.streets[streetIdx];
    if (!st || !st.draws || st.draws.length === 0) return;
    if (actionIdx !== -1) return;
    var anims = st.draws.map(function(d, i) {
      return { id: streetIdx + "-" + d.player + "-" + i, playerIdx: d.player, count: d.discarded, phase: "fly" };
    }).filter(function(a) {
      return a.count > 0;
    });
    if (anims.length === 0) return;
    setDrawDiscardAnims(anims);
    var t1 = setTimeout(function() {
      setDrawDiscardAnims(function(prev) {
        return prev.map(function(a) {
          return Object.assign({}, a, { phase: "fade" });
        });
      });
    }, 600);
    var t2 = setTimeout(function() {
      setDrawDiscardAnims([]);
    }, 1e3);
    return function() {
      clearTimeout(t1);
      clearTimeout(t2);
      setDrawDiscardAnims([]);
    };
  }, [streetIdx, actionIdx, isDrawGame, hand, rSettings.animateDeal]);
  useEffect(function() {
    var handler = /* @__PURE__ */ __name(function(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        stepForward();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepBack();
      } else if (e.key === " ") {
        e.preventDefault();
        setPlaying(function(p) {
          return !p;
        });
      } else if (e.key === "Home") {
        e.preventDefault();
        goToStart();
      } else if (e.key === "End") {
        e.preventDefault();
        goToEnd();
      }
    }, "handler");
    window.addEventListener("keydown", handler);
    return function() {
      window.removeEventListener("keydown", handler);
    };
  }, [stepForward, stepBack]);
  const getPlayerSeatClass = /* @__PURE__ */ __name((playerIdx) => {
    var _a;
    if (folded.has(playerIdx)) return "folded";
    if (showResult) {
      const manualWinners = (_a = hand.result) == null ? void 0 : _a.winners;
      if (manualWinners && manualWinners.length > 0) {
        const entry = manualWinners.find((w) => w.playerIdx === playerIdx);
        if (entry) return entry.split ? "split" : "winner";
        return manualWinners.length > 0 ? "loser" : "";
      }
      if (evalResult) {
        if (playerIdx === replayHeroIdx) {
          const heroWins = evalResult.some((r) => r.result.outcome === "hero");
          const heroLoses = evalResult.some((r) => r.result.outcome === "opponent");
          const heroSplits = evalResult.some((r) => r.result.outcome === "split");
          if (heroWins && !heroLoses) return "winner";
          if (heroLoses && !heroWins) return "loser";
          if (heroSplits) return "split";
        } else {
          const oppResult = evalResult.find((r) => r.index === playerIdx);
          if (oppResult) {
            if (oppResult.result.outcome === "opponent") return "winner";
            if (oppResult.result.outcome === "hero") return "loser";
            if (oppResult.result.outcome === "split") return "split";
          }
        }
      }
    }
    return "";
  }, "getPlayerSeatClass");
  const getPlayerHandName = /* @__PURE__ */ __name((playerIdx, useShort) => {
    if (!showResult) return null;
    if (folded.has(playerIdx)) return null;
    const pCards = playerIdx === replayHeroIdx ? heroCards : opponentCards[playerIdx] || "";
    if (!pCards) return null;
    const cfg = GAME_EVAL[hand.gameType];
    if (!cfg) return null;
    const parsed = parseCardNotation(pCards).filter((c) => c.suit !== "x");
    if (parsed.length < (gameCfg.heroCards || 2)) return null;
    const board = category === "community" ? parseCardNotation(boardCards).filter((c) => c.suit !== "x") : [];
    if (cfg.type === "hilo") {
      var hiEv = cfg.method === "omaha" ? bestOmahaHigh(parsed, board) : bestHighHand(parsed.concat(board));
      var loEv;
      if (cfg.method === "omaha") {
        loEv = bestOmahaLow(parsed, board);
      } else {
        loEv = bestLowA5Hand(parsed.concat(board), true);
      }
      var parts = [];
      if (hiEv) parts.push("Hi: " + (useShort ? hiEv.shortName || hiEv.name : hiEv.name));
      if (loEv && loEv.qualified !== false && loEv.name) {
        parts.push("Lo: " + loEv.name);
      }
      return parts.length ? parts.join("\n") : null;
    }
    let ev = null;
    if (cfg.type === "high") {
      ev = cfg.method === "omaha" ? bestOmahaHigh(parsed, board) : bestHighHand(parsed.concat(board));
    } else if (cfg.type === "low") {
      ev = cfg.lowType === "a5" ? bestLowA5Hand(parsed.concat(board), false) : bestLow27Hand(parsed.concat(board));
    } else if (cfg.type === "badugi") {
      ev = bestBadugiHand(parsed);
    }
    if (!ev) return null;
    return useShort ? ev.shortName || ev.name : ev.name;
  }, "getPlayerHandName");
  const shareReplayImage = /* @__PURE__ */ __name(async () => {
    var _a, _b;
    const allCardNotations = [heroCards, boardCards, ...opponentCards].filter(Boolean);
    const allCards = allCardNotations.flatMap((n) => parseCardNotation(n));
    try {
      const images = await loadCardImages(allCards);
      const outW = 1080, outH = 1080;
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      const grad = ctx.createLinearGradient(0, 0, 0, outH);
      grad.addColorStop(0, "#1a1a2e");
      grad.addColorStop(1, "#0f0f1a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, outW, outH);
      ctx.strokeStyle = "rgba(34,197,94,0.08)";
      ctx.lineWidth = 1;
      for (let y = 0; y < outH; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(outW, y);
        ctx.stroke();
      }
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 36px Univers Condensed, Univers, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(hand.gameType + " Hand", outW / 2, 60);
      ctx.font = "22px Univers Condensed, Univers, sans-serif";
      ctx.fillStyle = "#888888";
      var _bl = hand.blinds || {};
      ctx.fillText("Blinds " + formatChipAmount(_bl.sb || 0) + "/" + formatChipAmount(_bl.bb || 0) + (_bl.ante ? " (" + formatChipAmount(_bl.ante) + ")" : ""), outW / 2, 95);
      let yPos = 140;
      if (category === "community" && boardCards) {
        const bCards = parseCardNotation(boardCards);
        const cw2 = 70, ch2 = 98, gap = 8;
        const totalW = bCards.length * cw2 + (bCards.length - 1) * gap;
        let cx = (outW - totalW) / 2;
        ctx.font = "16px Univers Condensed, Univers, sans-serif";
        ctx.fillStyle = "#666666";
        ctx.fillText("BOARD", outW / 2, yPos);
        yPos += 14;
        for (const c of bCards) {
          const key = c.rank + c.suit;
          const img = images.get(key);
          if (img) {
            ctx.drawImage(img, cx, yPos, cw2, ch2);
          } else {
            ctx.fillStyle = "#333";
            ctx.fillRect(cx, yPos, cw2, ch2);
            ctx.fillStyle = "#666";
            ctx.font = "24px Univers Condensed";
            ctx.textAlign = "center";
            ctx.fillText("?", cx + cw2 / 2, yPos + ch2 / 2 + 8);
          }
          cx += cw2 + gap;
        }
        yPos += ch2 + 20;
      }
      ctx.textAlign = "center";
      ctx.font = "bold 28px Univers Condensed, Univers, sans-serif";
      ctx.fillStyle = "#facc15";
      ctx.fillText("POT: " + formatChipAmount(pot), outW / 2, yPos + 10);
      yPos += 50;
      const cw = 50, ch = 70;
      hand.players.forEach((p, pi) => {
        const cards = pi === replayHeroIdx ? heroCards : opponentCards[pi] || "";
        const parsed = parseCardNotation(cards);
        const isFolded = folded.has(pi);
        const seatClass = getPlayerSeatClass(pi);
        const handName = getPlayerHandName(pi);
        ctx.globalAlpha = isFolded ? 0.3 : 1;
        ctx.font = "bold 20px Univers Condensed, Univers, sans-serif";
        ctx.fillStyle = seatClass === "winner" ? "#4ade80" : seatClass === "loser" ? "#f87171" : "#ffffff";
        ctx.textAlign = "left";
        const px = 80;
        ctx.fillText(p.name + " (" + p.position + ")", px, yPos);
        ctx.font = "16px Univers Condensed, Univers, sans-serif";
        ctx.fillStyle = "#888888";
        ctx.fillText(formatChipAmount(stacks[pi]), px + 300, yPos);
        let cardX = px;
        yPos += 8;
        for (const c of parsed) {
          const key = c.rank + c.suit;
          const img = images.get(key);
          if (c.suit === "x") {
            ctx.fillStyle = "#444";
            ctx.fillRect(cardX, yPos, cw, ch);
            ctx.fillStyle = "#888";
            ctx.font = "20px Univers Condensed";
            ctx.textAlign = "center";
            ctx.fillText("?", cardX + cw / 2, yPos + ch / 2 + 6);
            ctx.textAlign = "left";
          } else if (img) {
            ctx.drawImage(img, cardX, yPos, cw, ch);
          }
          cardX += cw + 4;
        }
        if (handName) {
          ctx.font = "16px Univers Condensed, Univers, sans-serif";
          ctx.fillStyle = seatClass === "winner" ? "#4ade80" : "#f87171";
          ctx.textAlign = "left";
          ctx.fillText(handName, cardX + 12, yPos + ch / 2 + 4);
        }
        yPos += ch + 16;
        ctx.globalAlpha = 1;
      });
      if (showResult && evalResult) {
        ctx.font = "bold 24px Univers Condensed, Univers, sans-serif";
        ctx.textAlign = "center";
        const rText = evalResult.map((r) => r.result.text).join(" | ");
        const rColor = ((_a = evalResult[0]) == null ? void 0 : _a.result.color) === "green" ? "#4ade80" : ((_b = evalResult[0]) == null ? void 0 : _b.result.color) === "red" ? "#f87171" : "#facc15";
        ctx.fillStyle = rColor;
        ctx.fillText(rText, outW / 2, Math.min(yPos + 20, outH - 60));
      }
      ctx.font = "14px Univers Condensed, Univers, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.textAlign = "right";
      ctx.fillText("futurega.me", outW - 20, outH - 20);
      const dataUrl = canvas.toDataURL("image/png");
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "hand-replay.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "hand-replay.png";
        a.click();
      }
    } catch (e) {
      console.error("Share replay error:", e);
    }
  }, "shareReplayImage");
  var themeClass = rSettings.theme !== "default" ? " theme-" + rSettings.theme : "";
  var shapeClass = rSettings.tableShape !== "oval" ? " shape-" + rSettings.tableShape : "";
  var fourColorClass = rSettings.fourColorDeck ? " four-color-deck" : "";
  var boardAnimClass = getBoardAnimClass();
  if (hand.gameType === "OFC") {
    var ofcRows = hand.ofcRows || {};
    var ofcStreetDef = getStreetDef("OFC");
    var ofcStreetNames = ofcStreetDef.streets;
    var ofcCardsShownPerPlayer = /* @__PURE__ */ __name(function(pi) {
      var pr = ofcRows[pi] || { top: "", middle: "", bottom: "" };
      var topCards = parseCardNotation(pr.top || "").filter(function(c) {
        return c.suit !== "x";
      });
      var midCards = parseCardNotation(pr.middle || "").filter(function(c) {
        return c.suit !== "x";
      });
      var botCards = parseCardNotation(pr.bottom || "").filter(function(c) {
        return c.suit !== "x";
      });
      var totalCards = topCards.length + midCards.length + botCards.length;
      var cardsToShow = streetIdx === 0 ? Math.min(5, totalCards) : Math.min(5 + streetIdx, totalCards);
      var shown = { top: "", middle: "", bottom: "" };
      var remaining = cardsToShow;
      var botShow = Math.min(botCards.length, remaining);
      shown.bottom = botCards.slice(0, botShow).map(function(c) {
        return c.rank + c.suit;
      }).join("");
      remaining -= botShow;
      var midShow = Math.min(midCards.length, remaining);
      shown.middle = midCards.slice(0, midShow).map(function(c) {
        return c.rank + c.suit;
      }).join("");
      remaining -= midShow;
      var topShow = Math.min(topCards.length, remaining);
      shown.top = topCards.slice(0, topShow).map(function(c) {
        return c.rank + c.suit;
      }).join("");
      return shown;
    }, "ofcCardsShownPerPlayer");
    var ofcTotalStreets = ofcStreetNames.length;
    return /* @__PURE__ */ React.createElement("div", { className: "replayer-replay ofc-replay" }, showSettings && /* @__PURE__ */ React.createElement(ReplayerSettingsPanel, { onClose: function() {
      setShowSettings(false);
    }, settings: rSettings, onUpdate: handleSettingsUpdate }), /* @__PURE__ */ React.createElement("div", { className: "ofc-replay-board" }, hand.players.map(function(p, pi) {
      var shownCards = ofcCardsShownPerPlayer(pi);
      var pr = ofcRows[pi] || { top: "", middle: "", bottom: "" };
      var isHero = pi === (hand.heroIdx || 0);
      return /* @__PURE__ */ React.createElement("div", { key: pi, className: "ofc-replay-player" + (isHero ? " ofc-hero" : "") }, /* @__PURE__ */ React.createElement("div", { className: "ofc-replay-player-name" }, p.name), /* @__PURE__ */ React.createElement("div", { className: "ofc-replay-rows" }, /* @__PURE__ */ React.createElement("div", { className: "ofc-replay-row ofc-replay-row-top" }, /* @__PURE__ */ React.createElement("div", { className: "ofc-replay-row-label" }, "Top"), /* @__PURE__ */ React.createElement(CardRow, { text: showResult ? pr.top : shownCards.top, max: 3, placeholderCount: 3, cardTheme: rSettings.cardTheme })), /* @__PURE__ */ React.createElement("div", { className: "ofc-replay-row ofc-replay-row-middle" }, /* @__PURE__ */ React.createElement("div", { className: "ofc-replay-row-label" }, "Middle"), /* @__PURE__ */ React.createElement(CardRow, { text: showResult ? pr.middle : shownCards.middle, max: 5, placeholderCount: 5, cardTheme: rSettings.cardTheme })), /* @__PURE__ */ React.createElement("div", { className: "ofc-replay-row ofc-replay-row-bottom" }, /* @__PURE__ */ React.createElement("div", { className: "ofc-replay-row-label" }, "Bottom"), /* @__PURE__ */ React.createElement(CardRow, { text: showResult ? pr.bottom : shownCards.bottom, max: 5, placeholderCount: 5, cardTheme: rSettings.cardTheme }))));
    })), /* @__PURE__ */ React.createElement("div", { className: "ofc-street-indicator" }, /* @__PURE__ */ React.createElement("span", { className: "ofc-street-name" }, ofcStreetNames[streetIdx] || "Final"), /* @__PURE__ */ React.createElement("span", { className: "ofc-street-count" }, streetIdx + 1, " / ", ofcTotalStreets)), /* @__PURE__ */ React.createElement("div", { className: "replayer-controls", style: { marginTop: "8px" } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", disabled: streetIdx === 0 && !showResult, onClick: function() {
      if (showResult) {
        setShowResult(false);
      } else if (streetIdx > 0) {
        setStreetIdx(streetIdx - 1);
      }
    } }, "Prev"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", disabled: showResult, onClick: function() {
      if (streetIdx < ofcTotalStreets - 1) {
        setStreetIdx(streetIdx + 1);
      } else {
        setShowResult(true);
      }
    } }, "Next"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: function() {
      setShowResult(!showResult);
    } }, showResult ? "Hide All" : "Show All")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", justifyContent: "space-between", marginTop: "12px" } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: onBack }, "Back to List"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px" } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: copyShareLink, title: "Copy share link" }, shareLinkCopied ? "Copied!" : "Share Link"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: function() {
      setShowSettings(!showSettings);
    } }, "Settings"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary btn-sm", onClick: onEdit }, "Edit"))));
  }
  return /* @__PURE__ */ React.createElement("div", { className: "replayer-replay" + fourColorClass }, showSettings && /* @__PURE__ */ React.createElement(ReplayerSettingsPanel, { onClose: function() {
    setShowSettings(false);
  }, settings: rSettings, onUpdate: handleSettingsUpdate }), /* @__PURE__ */ React.createElement("div", { ref: tableRef, className: "replayer-table" + themeClass }, /* @__PURE__ */ React.createElement("div", { className: "replayer-table-rail", style: { "--rail-color": feltColor } }), rSettings.lightStrip && /* @__PURE__ */ React.createElement("div", { className: "replayer-light-strip", style: { "--strip-color": feltColor } }), /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "replayer-table-felt" + shapeClass,
      style: rSettings.theme === "default" ? {
        background: "radial-gradient(ellipse at 50% 50%, " + feltColor + " 0%, " + feltColor + "dd 60%, " + feltColor + "aa 100%)",
        borderColor: feltColor + "cc"
      } : {},
      onTouchStart: function(e) {
        var timer = setTimeout(function() {
          setShowFeltPicker(true);
        }, 600);
        e.currentTarget._lpTimer = timer;
      },
      onTouchEnd: function(e) {
        clearTimeout(e.currentTarget._lpTimer);
      },
      onTouchMove: function(e) {
        clearTimeout(e.currentTarget._lpTimer);
      },
      onMouseDown: function(e) {
        var timer = setTimeout(function() {
          setShowFeltPicker(true);
        }, 600);
        e.currentTarget._lpTimer = timer;
      },
      onMouseUp: function(e) {
        clearTimeout(e.currentTarget._lpTimer);
      },
      onMouseLeave: function(e) {
        clearTimeout(e.currentTarget._lpTimer);
      }
    }
  ), showFeltPicker && /* @__PURE__ */ React.createElement("div", { className: "felt-picker-overlay", onClick: function() {
    setShowFeltPicker(false);
  } }, /* @__PURE__ */ React.createElement("div", { className: "felt-picker-popup", onClick: function(e) {
    e.stopPropagation();
  } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", fontFamily: "'Univers Condensed','Univers',sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px", color: "var(--text-muted)" } }, "Felt Color"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" } }, [{ c: "#2d5a27", n: "Green" }, { c: "#1a3a5c", n: "Blue" }, { c: "#5a1a1a", n: "Red" }, { c: "#6b5b8a", n: "Purple" }, { c: "#1a1a2e", n: "Navy" }, { c: "#3d3d3d", n: "Charcoal" }].map(function(fc) {
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        key: fc.c,
        title: fc.n,
        onClick: function() {
          rSetters.feltColor(fc.c);
        },
        style: {
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: fc.c,
          cursor: "pointer",
          border: feltColor === fc.c ? "2px solid var(--accent)" : "2px solid rgba(255,255,255,0.2)",
          boxShadow: feltColor === fc.c ? "0 0 0 2px var(--accent)" : "none"
        }
      }
    );
  })), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "color",
      value: feltColor,
      onChange: function(e) {
        rSetters.feltColor(e.target.value);
      },
      style: { marginTop: "8px", width: "100%", height: "28px", border: "none", background: "transparent", cursor: "pointer" }
    }
  ))), (() => {
    var isSplitResult = showResult && hand.result && hand.result.winners && hand.result.winners.some(function(w) {
      return w.split;
    });
    var splitCount = isSplitResult ? hand.result.winners.filter(function(w) {
      return w.split;
    }).length : 0;
    if (isSplitResult && splitCount >= 2) {
      var splitAmt = Math.floor(pot / splitCount);
      var _isHiLo = isHiLo && hand.result.winners.some(function(w) {
        return w.label;
      });
      return /* @__PURE__ */ React.createElement("div", { className: "replayer-pot-display replayer-split-pot" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-pot-label" }, _isHiLo ? "Hi/Lo Split" : "Split Pot"), /* @__PURE__ */ React.createElement("div", { className: "replayer-split-circles" }, hand.result.winners.filter(function(w) {
        return w.split;
      }).slice(0, 3).map(function(w, i) {
        var pName = hand.players[w.playerIdx] ? hand.players[w.playerIdx].name : "?";
        var shortLabel = "";
        if (w.label) {
          var hiMatch = w.label.match(/Hi:\s*([^,]+)/);
          var loMatch = w.label.match(/Lo:\s*(.+)/);
          if (hiMatch) shortLabel = "Hi";
          if (loMatch) shortLabel = shortLabel ? "Hi+Lo" : "Lo";
        }
        return /* @__PURE__ */ React.createElement("div", { key: i, className: "replayer-split-circle", style: {
          marginLeft: i > 0 ? "-8px" : 0,
          zIndex: splitCount - i
        }, title: w.label || "" }, shortLabel ? /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.45rem", display: "block", lineHeight: 1 } }, shortLabel) : null, formatChipAmount(splitAmt));
      })));
    }
    return /* @__PURE__ */ React.createElement("div", { className: "replayer-pot-display" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-pot-label" }, "Pot"), rSettings.showChipStacks && displayPot > 0 && /* @__PURE__ */ React.createElement(PotChipVisual, { amount: displayPot }), formatChipAmount(displayPot));
  })(), category === "community" && /* @__PURE__ */ React.createElement("div", { className: "replayer-board-area" + boardAnimClass }, (() => {
    var parsed = parseCardNotation(boardCards);
    if (parsed.length === 0) return null;
    var renderCard = /* @__PURE__ */ __name(function(c, i) {
      if (c.suit === "x") return /* @__PURE__ */ React.createElement("div", { key: c.rank + c.suit + "_" + i, className: "card-unknown" });
      if (cardTheme === "classic") {
        var isRed = c.suit === "h" || c.suit === "d";
        var suitSymbol = { h: "♥", d: "♦", c: "♣", s: "♠" }[c.suit] || "";
        return /* @__PURE__ */ React.createElement("div", { key: c.rank + c.suit + "_" + i, className: "card-classic" + (isRed ? " card-classic-red" : " card-classic-dark") }, /* @__PURE__ */ React.createElement("span", { className: "card-classic-rank" }, c.rank.toUpperCase()), /* @__PURE__ */ React.createElement("span", { className: "card-classic-suit" }, suitSymbol));
      }
      var boardCardDir = "/cards/";
      return /* @__PURE__ */ React.createElement(
        "img",
        {
          key: c.rank + c.suit + "_" + i,
          className: "card-img",
          src: boardCardDir + "cards_gui_" + c.rank + c.suit + ".svg",
          alt: c.rank + c.suit,
          loading: "eager"
        }
      );
    }, "renderCard");
    return /* @__PURE__ */ React.createElement("div", { className: "card-row replayer-board-spaced" }, parsed.map(function(c, i) {
      return renderCard(c, i);
    }));
  })()), /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", left: "50%", top: "57%", transform: "translate(-50%,-50%)", zIndex: 1, opacity: 0.1, pointerEvents: "none", fontFamily: "'Libre Baskerville',Georgia,serif", fontWeight: 700, color: "#fff", letterSpacing: "-0.05em", whiteSpace: "nowrap", fontSize: "1.06rem" } }, "futurega.me"), (() => {
    const n = hand.players.length;
    const layouts = {
      2: [[50, 6], [50, 94]],
      3: [[35, 6], [50, 94], [65, 6]],
      4: [[50, 6], [82, 50], [50, 94], [18, 50]],
      5: [[35, 6], [82, 50], [50, 94], [18, 50], [65, 6]],
      6: [[50, 6], [82, 32], [82, 68], [50, 94], [18, 68], [18, 32]],
      7: [[35, 6], [82, 32], [82, 68], [50, 94], [18, 68], [18, 32], [65, 6]],
      8: [[50, 6], [82, 24], [82, 50], [82, 76], [50, 94], [18, 76], [18, 50], [18, 24]],
      9: [[35, 6], [82, 24], [82, 50], [82, 76], [50, 94], [18, 76], [18, 50], [18, 24], [65, 6]],
      10: [[30, 6], [50, 6], [82, 24], [82, 50], [82, 76], [50, 94], [18, 76], [18, 50], [18, 24], [70, 6]]
    };
    const rawSeats = layouts[Math.min(Math.max(n, 2), 10)] || layouts[6];
    const bottomIdx = Math.floor(n / 2);
    const rotation = (bottomIdx - replayHeroIdx + n) % n;
    const seats = rawSeats.map((_, i) => rawSeats[(i + rotation) % n]);
    const seatEls = hand.players.map((p, pi) => {
      const pos = seats[pi] || [50, 50];
      const rawCards = pi === replayHeroIdx ? heroCards : opponentCards[pi] || "";
      const cards = pi === replayHeroIdx || showResult ? rawCards === "MUCK" ? "" : rawCards : "";
      const seatClass = getPlayerSeatClass(pi);
      const isMucked = showResult && rawCards === "MUCK";
      const lastAct = playerLastAction[pi];
      const handName = getPlayerHandName(pi, true);
      const align = "";
      var dealAnimClass = "";
      var isHero = pi === replayHeroIdx;
      var heroClass = dealAnimClass && isHero ? " is-hero" : "";
      var foldAnimClass = animFolded.has(pi) ? " anim-fold" : "";
      var showdownClass = "";
      var dealStyle = {};
      if (dealAnimClass) {
        var btnI = hand.players.findIndex(function(pp) {
          return pp.position === "BTN" || pp.position === "D";
        });
        var btnP = btnI >= 0 && seats[btnI] ? seats[btnI] : [50, 50];
        var dx = (btnP[0] - pos[0]) * 2.5;
        var dy = (btnP[1] - pos[1]) * 2.5;
        dealStyle["--deal-dx"] = dx + "px";
        dealStyle["--deal-dy"] = dy + "px";
        dealStyle["--deal-seat-delay"] = pi * 100 + "ms";
      }
      var muckStyle = {};
      if (foldAnimClass) {
        var mdx = (50 - pos[0]) * 1.5;
        var mdy = (50 - pos[1]) * 0.8;
        var mrot = mdx > 0 ? -12 : 12;
        muckStyle["--muck-dx"] = mdx + "px";
        muckStyle["--muck-dy"] = mdy + "px";
        muckStyle["--muck-rot"] = mrot + "deg";
      }
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: pi,
          className: `replayer-seat ${seatClass}${isMucked ? " mucked" : ""}${align}${foldAnimClass}`,
          style: Object.assign({ left: pos[0] + "%", top: pos[1] + "%" }, muckStyle)
        },
        /* @__PURE__ */ React.createElement(
          "div",
          {
            className: `replayer-seat-cards${dealAnimClass}${heroClass}${showdownClass} ${isHiLo && showResult && !folded.has(pi) ? "replayer-hilo-high" + (hiloAnimate ? " animate" : "") : ""}`,
            style: dealStyle
          },
          /* @__PURE__ */ React.createElement(
            CardRow,
            {
              text: cards,
              stud: gameCfg.isStud,
              max: gameCfg.heroCards,
              placeholderCount: !cards && !folded.has(pi) ? gameCfg.heroCards : 0,
              splay: rSettings.cardSplay ? gameCfg.heroCards <= 2 ? 12.5 : gameCfg.heroCards <= 4 ? 15 : gameCfg.heroCards <= 5 ? 18 : 22 : 0,
              cardTheme
            }
          )
        ),
        /* @__PURE__ */ React.createElement("div", { className: "replayer-seat-info" }, rSettings.showPlayerStats && /* @__PURE__ */ React.createElement("div", { className: "replayer-player-stats" }, (() => {
          var st = getPlayerStats(p.name);
          return st.vpip + "/" + st.pfr + "/" + st.ag;
        })()), /* @__PURE__ */ React.createElement("div", { className: "replayer-seat-name" }, p.name), /* @__PURE__ */ React.createElement("div", { className: "replayer-seat-stack" }, formatChipAmount(stacks[pi]))),
        lastAct && (() => {
          var actText = lastAct.action;
          var badgeClass = "action-" + actText;
          if (actText === "raise" && lastAct.amount && lastAct.amount >= stacks[pi] + (lastAct.amount || 0)) badgeClass = "action-allin";
          if (!actText) return null;
          var label = actText;
          if (lastAct.amount) {
            if (actText === "raise") {
              label += " " + formatChipAmount(computePlayerContrib(hand, streetIdx, currentActions, actionIdx, pi));
            } else {
              label += " " + formatChipAmount(lastAct.amount);
            }
          }
          return /* @__PURE__ */ React.createElement("div", { className: "replayer-action-badge-outer " + badgeClass }, label);
        })(),
        handName && /* @__PURE__ */ React.createElement("div", { className: "replayer-seat-hand-name" }, handName),
        isDrawGame && currentStreet.draws && currentStreet.draws.length > 0 && (() => {
          var d = currentStreet.draws.find(function(dr) {
            return dr.player === pi;
          });
          if (!d) return null;
          return /* @__PURE__ */ React.createElement("div", { className: "replayer-seat-draw-badge" }, d.discarded === 0 ? "Pat" : "D" + d.discarded);
        })()
      );
    });
    const betChips = hand.players.map((p, pi) => {
      const lastAct = playerLastAction[pi];
      if (!lastAct || !lastAct.amount) return null;
      const pos = seats[pi] || [50, 50];
      const isBottom = pos[1] >= 70;
      const isTop = pos[1] <= 15;
      const isLeft = pos[0] <= 20;
      const isRight = pos[0] >= 80;
      var chipX, chipY;
      if (isBottom) {
        chipX = pos[0];
        chipY = pos[1] - 14;
      } else if (isTop) {
        chipX = pos[0];
        chipY = pos[1] + 10;
      } else if (isLeft) {
        chipX = pos[0] + 25;
        chipY = pos[1] - 7;
      } else if (isRight) {
        chipX = pos[0] - 25;
        chipY = pos[1] - 7;
      } else {
        chipX = pos[0] + (50 - pos[0]) * 0.35;
        chipY = pos[1] + (50 - pos[1]) * 0.35;
      }
      var chipStartDx = (pos[0] - chipX) * 3;
      var chipStartDy = (pos[1] - chipY) * 3;
      var chipStyle = { left: chipX + "%", top: chipY + "%" };
      if (rSettings.animateChips) {
        chipStyle["--chip-start-dx"] = chipStartDx + "px";
        chipStyle["--chip-start-dy"] = chipStartDy + "px";
      }
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: "bet-" + pi,
          className: "replayer-bet-chip" + (rSettings.animateChips ? " animate-chips" : ""),
          style: chipStyle
        },
        /* @__PURE__ */ React.createElement(ChipStack, { amount: lastAct.amount }),
        formatChipAmount(lastAct.amount)
      );
    }).filter(Boolean);
    const btnIdx = hand.players.findIndex((p) => p.position === "BTN" || p.position === "D");
    let dealerEl = null;
    if (btnIdx >= 0) {
      const btnPos = seats[btnIdx] || [50, 50];
      const isBottom = btnPos[1] >= 70;
      var dealerStyle;
      if (isBottom) {
        const dx = (50 - btnPos[0]) * 0.12;
        const dy = (50 - btnPos[1]) * 0.12;
        dealerStyle = { left: btnPos[0] + dx + "%", top: btnPos[1] + dy + "%", transform: "translate(-50%, -50%)" };
      } else {
        const isTop = btnPos[1] <= 15;
        const isLeft = btnPos[0] <= 20;
        const isRight = btnPos[0] >= 80;
        var ox = 0, oy = 0;
        if (isTop && btnPos[0] < 50) {
          ox = 4;
          oy = 5;
        } else if (isTop && btnPos[0] >= 50) {
          ox = -4;
          oy = 5;
        } else if (isLeft) {
          ox = 5;
          oy = 4;
        } else if (isRight) {
          ox = -5;
          oy = 4;
        } else {
          ox = btnPos[0] < 50 ? 4 : -4;
          oy = 4;
        }
        dealerStyle = { left: btnPos[0] + ox + "%", top: btnPos[1] + oy + "%", transform: "translate(-50%, -50%)" };
      }
      dealerEl = /* @__PURE__ */ React.createElement("div", { key: "dealer", className: "replayer-dealer-btn", style: dealerStyle }, "D");
    }
    var flyChipEls = flyingChips.map(function(fc) {
      return React.createElement("div", {
        key: fc.id,
        className: "replayer-flying-chip" + (fc.toWinner ? " to-winner" : ""),
        style: {
          "--fly-x0": fc.x0 + "px",
          "--fly-y0": fc.y0 + "px",
          "--fly-x1": fc.x1 + "px",
          "--fly-y1": fc.y1 + "px",
          "--fly-duration": "0.4s",
          animationDelay: fc.delay + "ms"
        }
      });
    });
    var drawDiscardEls = [];
    if (drawDiscardAnims.length > 0) {
      drawDiscardAnims.forEach(function(anim) {
        var seatPos = seats[anim.playerIdx] || [50, 50];
        for (var ci = 0; ci < Math.min(anim.count, 5); ci++) {
          var spread = (ci - (anim.count - 1) / 2) * 8;
          drawDiscardEls.push(React.createElement("div", {
            key: "dd-" + anim.id + "-" + ci,
            className: "replayer-draw-discard-card" + (anim.phase === "fade" ? " fade-out" : ""),
            style: {
              "--dd-x0": seatPos[0] + "%",
              "--dd-y0": seatPos[1] + "%",
              "--dd-spread": spread + "px",
              animationDelay: ci * 60 + "ms"
            }
          }));
        }
      });
    }
    return [...seatEls, ...betChips, dealerEl, ...flyChipEls, ...drawDiscardEls];
  })()), (category === "draw_triple" || category === "draw_single") && currentStreet.draws && currentStreet.draws.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "replayer-draw-info-bar" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-draw-info-label" }, currentStreet.name || "Draw"), /* @__PURE__ */ React.createElement("div", { className: "replayer-draw-info-players" }, currentStreet.draws.map((d) => {
    var _a;
    var pName = ((_a = hand.players[d.player]) == null ? void 0 : _a.name) || "?";
    var isPat = d.discarded === 0;
    return /* @__PURE__ */ React.createElement("div", { key: d.player, className: "replayer-draw-info-item" + (isPat ? " pat" : "") }, /* @__PURE__ */ React.createElement("span", { className: "replayer-draw-info-name" }, pName), isPat ? /* @__PURE__ */ React.createElement("span", { className: "replayer-draw-pat-badge" }, "Stand Pat") : /* @__PURE__ */ React.createElement("span", { className: "replayer-draw-count-badge" }, d.discarded === 1 ? "draws 1" : "draws " + d.discarded), d.discardedCards && !isPat && /* @__PURE__ */ React.createElement("span", { className: "replayer-draw-discarded-cards" }, /* @__PURE__ */ React.createElement(CardRow, { text: d.discardedCards, max: d.discarded })), d.newCards && !isPat && /* @__PURE__ */ React.createElement("span", { className: "replayer-draw-new-cards" }, /* @__PURE__ */ React.createElement(CardRow, { text: d.newCards, max: d.discarded })));
  }))), rSettings.showCommentary && /* @__PURE__ */ React.createElement("div", { className: "replayer-commentary" }, generateCommentary(hand, streetIdx, actionIdx, pot, stacks)), rSettings.showHandStrength && category === "community" && (() => {
    var replayHeroI = hand.heroIdx != null ? hand.heroIdx : 0;
    var hCards = replayHeroI === (hand.heroIdx != null ? hand.heroIdx : 0) ? heroCards : "";
    var strength = calcHandStrength(hCards, boardCards, hand.gameType);
    if (strength === null) return null;
    var col = getStrengthColor(strength);
    return /* @__PURE__ */ React.createElement("div", { className: "replayer-hand-strength" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-hand-strength-label" }, "Strength"), /* @__PURE__ */ React.createElement("div", { className: "replayer-hand-strength-bar" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-hand-strength-fill", style: { width: strength + "%", background: col } })), /* @__PURE__ */ React.createElement("div", { className: "replayer-hand-strength-pct", style: { color: col } }, strength, "%"));
  })(), rSettings.showPotOdds && actionIdx >= 0 && (() => {
    var actions = (currentStreet == null ? void 0 : currentStreet.actions) || [];
    var curAct = actions[actionIdx];
    if (!curAct || !curAct.amount || curAct.action === "fold") return null;
    var callAmt = curAct.amount;
    var potBefore = pot - callAmt;
    if (potBefore <= 0) return null;
    var odds = (callAmt / (potBefore + callAmt) * 100).toFixed(1);
    var ratio = (potBefore / callAmt).toFixed(1);
    return /* @__PURE__ */ React.createElement("div", { className: "replayer-pot-odds" }, /* @__PURE__ */ React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "8", x2: "12", y2: "12" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "12", x2: "16", y2: "12" })), "Pot Odds: ", ratio, ":1 (", odds, "% equity needed)");
  })(), /* @__PURE__ */ (() => {
    return /* @__PURE__ */ React.createElement("div", { className: "replayer-bottom-fixed" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-controls" }, /* @__PURE__ */ React.createElement("button", { onClick: goToStart, disabled: !canGoBack, title: "Start" }, /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("polyline", { points: "19 20 9 12 19 4" }), /* @__PURE__ */ React.createElement("line", { x1: "5", y1: "19", x2: "5", y2: "5" }))), /* @__PURE__ */ React.createElement("button", { onClick: stepBack, disabled: !canGoBack, title: "Back" }, /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("polyline", { points: "15 18 9 12 15 6" }))), /* @__PURE__ */ React.createElement("button", { onClick: () => setPlaying((p) => !p), title: playing ? "Pause" : "Play" }, playing ? /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("rect", { x: "6", y: "4", width: "4", height: "16" }), /* @__PURE__ */ React.createElement("rect", { x: "14", y: "4", width: "4", height: "16" })) : /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("polygon", { points: "5 3 19 12 5 21 5 3" }))), /* @__PURE__ */ React.createElement("button", { onClick: stepForward, disabled: !canGoForward, title: "Forward" }, /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("polyline", { points: "9 18 15 12 9 6" }))), /* @__PURE__ */ React.createElement("button", { onClick: goToEnd, title: "End" }, /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("polyline", { points: "5 4 15 12 5 20" }), /* @__PURE__ */ React.createElement("line", { x1: "19", y1: "5", x2: "19", y2: "19" }))), /* @__PURE__ */ React.createElement("select", { value: speed, onChange: (e) => setSpeed(Number(e.target.value)), style: {
      fontSize: "0.65rem",
      padding: "3px 6px",
      background: "var(--bg)",
      color: "var(--text)",
      border: "1px solid var(--border)",
      borderRadius: "4px",
      fontFamily: "'Univers Condensed','Univers',sans-serif"
    } }, /* @__PURE__ */ React.createElement("option", { value: 2e3 }, "0.5x"), /* @__PURE__ */ React.createElement("option", { value: 1e3 }, "1x"), /* @__PURE__ */ React.createElement("option", { value: 500 }, "2x"), /* @__PURE__ */ React.createElement("option", { value: 250 }, "4x"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", justifyContent: "center" } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: onBack }, "Back"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: onEdit }, "Edit"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: copyShareLink, title: "Copy share link" }, shareLinkCopied ? "Copied!" : "Link"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: shareReplayImage, title: "Share as image" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", style: { width: "14px", height: "14px" } }, /* @__PURE__ */ React.createElement("circle", { cx: "18", cy: "5", r: "3" }), /* @__PURE__ */ React.createElement("circle", { cx: "6", cy: "12", r: "3" }), /* @__PURE__ */ React.createElement("circle", { cx: "18", cy: "19", r: "3" }), /* @__PURE__ */ React.createElement("line", { x1: "8.59", y1: "13.51", x2: "15.42", y2: "17.49" }), /* @__PURE__ */ React.createElement("line", { x1: "15.41", y1: "6.51", x2: "8.59", y2: "10.49" }))), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn btn-ghost btn-sm",
        disabled: true,
        title: "Video export (coming soon)",
        style: { opacity: 0.3 }
      },
      /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", style: { width: "14px", height: "14px" } }, /* @__PURE__ */ React.createElement("rect", { x: "2", y: "2", width: "20", height: "20", rx: "2.18", ry: "2.18" }), /* @__PURE__ */ React.createElement("line", { x1: "7", y1: "2", x2: "7", y2: "22" }), /* @__PURE__ */ React.createElement("line", { x1: "17", y1: "2", x2: "17", y2: "22" }), /* @__PURE__ */ React.createElement("line", { x1: "2", y1: "12", x2: "22", y2: "12" }), /* @__PURE__ */ React.createElement("line", { x1: "2", y1: "7", x2: "7", y2: "7" }), /* @__PURE__ */ React.createElement("line", { x1: "2", y1: "17", x2: "7", y2: "17" }), /* @__PURE__ */ React.createElement("line", { x1: "17", y1: "17", x2: "22", y2: "17" }), /* @__PURE__ */ React.createElement("line", { x1: "17", y1: "7", x2: "22", y2: "7" }))
    ), /* @__PURE__ */ React.createElement("button", { className: "replayer-gear-btn", onClick: function() {
      setShowSettings(true);
    }, title: "Replayer Settings" }, /* @__PURE__ */ React.createElement("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "3" }), /* @__PURE__ */ React.createElement("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" })))));
  })());
}
__name(HandReplayerReplay, "HandReplayerReplay");
function GTOEntryView({ hand, setHand, onDone, onCancel, heroName }) {
  const [phase, setPhase] = useState("setup");
  const [currentStreetIdx, setCurrentStreetIdx] = useState(0);
  const [showRaiseInput, setShowRaiseInput] = useState(false);
  const [betAmount, setBetAmount] = useState("");
  const [showHeroCardPicker, setShowHeroCardPicker] = useState(false);
  var studDealTargetState = useState(0);
  const activeSeatRef = useRef(null);
  var gameCfg = HAND_CONFIG[hand.gameType] || HAND_CONFIG_DEFAULT;
  var streetDef = getStreetDef(hand.gameType);
  var category = getGameCategory(hand.gameType);
  var currentStreet = hand.streets[currentStreetIdx];
  var isPreflop = currentStreetIdx === 0;
  var potAndStacks = calcPotsAndStacks(hand, currentStreetIdx, (currentStreet.actions || []).length - 1);
  var currentPot = potAndStacks.pot;
  var currentStacks = potAndStacks.stacks;
  var foldedSet = useMemo(function() {
    var f = /* @__PURE__ */ new Set();
    for (var si = 0; si <= currentStreetIdx; si++) {
      for (var ai = 0; ai < (hand.streets[si].actions || []).length; ai++) {
        var act = hand.streets[si].actions[ai];
        if (act.action === "fold") f.add(act.player);
      }
    }
    return f;
  }, [hand.streets, currentStreetIdx]);
  var allInSet = useMemo(function() {
    var a = /* @__PURE__ */ new Set();
    currentStacks.forEach(function(s, i) {
      if (s <= 0 && !foldedSet.has(i)) a.add(i);
    });
    return a;
  }, [currentStacks, foldedSet]);
  var isRazz = hand.gameType === "Razz" || hand.gameType === "2-7 Razz";
  var isStudLow = isRazz;
  var priorStreetFoldedSet = useMemo(function() {
    var f = /* @__PURE__ */ new Set();
    for (var si = 0; si < currentStreetIdx; si++) {
      for (var ai = 0; ai < (hand.streets[si].actions || []).length; ai++) {
        var act = hand.streets[si].actions[ai];
        if (act.action === "fold") f.add(act.player);
      }
    }
    return f;
  }, [hand.streets, currentStreetIdx]);
  var studInfo = useMemo(function() {
    if (!gameCfg.isStud) return null;
    var is3rdStreet = currentStreetIdx === 0;
    var bringInIdx = is3rdStreet ? findStudBringIn(hand, isStudLow) : -1;
    var bestBoardIdx = !is3rdStreet ? findStudBestBoard(hand, currentStreetIdx, priorStreetFoldedSet, isStudLow) : -1;
    return { isStud: true, is3rdStreet, bringInIdx, bestBoardIdx };
  }, [gameCfg.isStud, currentStreetIdx, hand, isStudLow, priorStreetFoldedSet]);
  var seatOrder = useMemo(function() {
    return getActionOrder(hand.players, isPreflop, studInfo);
  }, [hand.players, isPreflop, studInfo]);
  var actionOrder = useMemo(function() {
    return seatOrder.filter(function(i) {
      return !foldedSet.has(i) && !allInSet.has(i);
    });
  }, [seatOrder, foldedSet, allInSet]);
  var bringInAmount = gameCfg.isStud ? Math.floor(((hand.blinds || {}).sb || (hand.blinds || {}).bb || 100) / 2) : 0;
  var streetBets = useMemo(function() {
    var contrib = new Array(hand.players.length).fill(0);
    var maxBet = 0;
    if (isPreflop && category !== "stud") {
      var sbIdx = hand.players.findIndex(function(p) {
        return p.position === "SB" || p.position === "BTN/SB";
      });
      var bbIdx = hand.players.findIndex(function(p) {
        return p.position === "BB";
      });
      if (sbIdx >= 0) contrib[sbIdx] = (hand.blinds || {}).sb || 0;
      if (bbIdx >= 0) contrib[bbIdx] = (hand.blinds || {}).bb || 0;
      maxBet = (hand.blinds || {}).bb || 0;
    }
    (currentStreet.actions || []).forEach(function(act) {
      if (act.action === "fold") return;
      if (act.action === "bring-in") {
        contrib[act.player] = act.amount || bringInAmount;
        if (contrib[act.player] > maxBet) maxBet = contrib[act.player];
        return;
      }
      if (act.amount > 0) {
        contrib[act.player] += act.amount;
        if (contrib[act.player] > maxBet) maxBet = contrib[act.player];
      }
    });
    return { contrib, maxBet };
  }, [currentStreet.actions, isPreflop, hand.players, hand.blinds, category]);
  var currentActor = useMemo(function() {
    var actions = currentStreet.actions || [];
    if (actionOrder.length === 0) return -1;
    var lastRaiseIdx = -1;
    var lastRaiserPlayer = -1;
    for (var i = actions.length - 1; i >= 0; i--) {
      if (actions[i].action === "raise" || actions[i].action === "bet") {
        lastRaiseIdx = i;
        lastRaiserPlayer = actions[i].player;
        break;
      }
    }
    var startOi = 0;
    if (lastRaiserPlayer >= 0) {
      var raiserPos = actionOrder.indexOf(lastRaiserPlayer);
      if (raiserPos >= 0) startOi = raiserPos + 1;
    }
    for (var count = 0; count < actionOrder.length; count++) {
      var oi = (startOi + count) % actionOrder.length;
      var pidx = actionOrder[oi];
      var lastActIdx = -1;
      for (var j = actions.length - 1; j >= 0; j--) {
        if (actions[j].player === pidx) {
          lastActIdx = j;
          break;
        }
      }
      if (lastActIdx < lastRaiseIdx) return pidx;
      if (lastActIdx === -1) return pidx;
    }
    return -1;
  }, [actionOrder, currentStreet.actions]);
  var isBettingComplete = currentActor === -1;
  var activePlayers = hand.players.filter(function(_, i) {
    return !foldedSet.has(i);
  });
  var handOver = activePlayers.length <= 1;
  useEffect(function() {
    if (phase !== "action") return;
    if (handOver) {
      setPhase("result");
      return;
    }
    if (!isBettingComplete) return;
    var nextStreet2 = currentStreetIdx + 1;
    if (nextStreet2 >= hand.streets.length) {
      setPhase("showdown");
      return;
    }
    if (category === "community") {
      setPhase("board_entry");
    } else if (category === "stud") {
      setPhase("stud_deal");
    } else if (category === "draw_triple" || category === "draw_single") {
      setPhase("draw_discard");
    } else {
      setCurrentStreetIdx(nextStreet2);
    }
  }, [isBettingComplete, phase, handOver]);
  useEffect(function() {
    if (phase === "board_entry" || phase === "stud_deal" || phase === "draw_discard" || phase === "draw_cards_entry" || phase === "showdown" || phase === "result") {
      var container = document.querySelector(".content-area");
      if (container) container.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [phase]);
  var scrollGenRef = useRef(0);
  useEffect(function() {
    if (phase !== "action" || currentActor < 0) return;
    var gen = ++scrollGenRef.current;
    var tid = setTimeout(function() {
      if (gen !== scrollGenRef.current) return;
      var el = activeSeatRef.current;
      if (!el) return;
      var container = el.closest(".content-area");
      if (!container) return;
      var caTop = container.getBoundingClientRect().top;
      var sticky = container.querySelector(".gto-sticky-header");
      var stickyH = sticky ? sticky.getBoundingClientRect().bottom - caTop : 0;
      var elAbsTop = el.getBoundingClientRect().top - caTop + container.scrollTop;
      var target = elAbsTop - stickyH - 8;
      if (Math.abs(container.scrollTop - target) > 2) {
        container.scrollTo({ top: target, behavior: "smooth" });
      }
    }, 180);
    return function() {
      clearTimeout(tid);
    };
  }, [currentActor, phase, currentStreetIdx]);
  var addAction = /* @__PURE__ */ __name(function(action, amount) {
    if (currentActor < 0) return;
    var playerIdx = currentActor;
    setHand(function(prev) {
      var streets = prev.streets.map(function(s, si) {
        if (si !== currentStreetIdx) return s;
        return Object.assign({}, s, { actions: (s.actions || []).concat([{ player: playerIdx, action, amount: amount || 0 }]) });
      });
      return Object.assign({}, prev, { streets });
    });
    setShowRaiseInput(false);
    setBetAmount("");
  }, "addAction");
  var undoToPlayer = /* @__PURE__ */ __name(function(playerIdx) {
    setHand(function(prev) {
      for (var si = currentStreetIdx; si >= 0; si--) {
        var acts = prev.streets[si].actions || [];
        var targetIdx = -1;
        for (var ai = 0; ai < acts.length; ai++) {
          if (acts[ai].player === playerIdx) {
            targetIdx = ai;
            break;
          }
        }
        if (targetIdx >= 0) {
          var streets = prev.streets.map(function(s, i) {
            if (i < si) return s;
            if (i === si) return Object.assign({}, s, { actions: acts.slice(0, targetIdx) });
            return Object.assign({}, s, { actions: [] });
          });
          if (si < currentStreetIdx) setCurrentStreetIdx(si);
          if (phase === "result" || phase === "showdown" || phase === "board_entry" || phase === "draw_discard" || phase === "draw_cards_entry") setPhase("action");
          return Object.assign({}, prev, { streets });
        }
      }
      return prev;
    });
    setShowRaiseInput(false);
    setBetAmount("");
  }, "undoToPlayer");
  var undoLastAction = /* @__PURE__ */ __name(function() {
    setHand(function(prev) {
      for (var si = currentStreetIdx; si >= 0; si--) {
        var acts = prev.streets[si].actions || [];
        if (acts.length > 0) {
          var streets = prev.streets.map(function(s, i) {
            if (i !== si) return s;
            return Object.assign({}, s, { actions: acts.slice(0, -1) });
          });
          if (si < currentStreetIdx) setCurrentStreetIdx(si);
          if (phase === "result" || phase === "showdown" || phase === "board_entry" || phase === "draw_discard" || phase === "draw_cards_entry") setPhase("action");
          return Object.assign({}, prev, { streets });
        }
      }
      return prev;
    });
  }, "undoLastAction");
  var updatePlayerField = /* @__PURE__ */ __name(function(idx, field, value) {
    setHand(function(prev) {
      return Object.assign({}, prev, {
        players: prev.players.map(function(p, i) {
          if (i !== idx) return p;
          var upd = {};
          upd[field] = field === "startingStack" ? Number(value) || 0 : value;
          return Object.assign({}, p, upd);
        })
      });
    });
  }, "updatePlayerField");
  var setNumPlayers = /* @__PURE__ */ __name(function(n) {
    setHand(function(prev) {
      var heroI = prev.players.findIndex(function(p) {
        return p.name === (heroName || "Hero");
      });
      if (heroI < 0) heroI = 0;
      var positions = getPositionLabels(n);
      var players = Array.from({ length: n }, function(_, i) {
        if (prev.players[i]) return Object.assign({}, prev.players[i], { position: positions[i] || "" });
        return { name: getSeatName(i, heroI, heroName), position: positions[i] || "", startingStack: prev.players[0] ? prev.players[0].startingStack : 5e4 };
      });
      var streets = prev.streets.map(function(s) {
        return Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: Array.from({ length: n - 1 }, function(_, j) {
          return s.cards.opponents && s.cards.opponents[j] || "";
        }) }) });
      });
      return Object.assign({}, prev, { players, streets });
    });
  }, "setNumPlayers");
  var heroIdx = hand.players.findIndex(function(p) {
    return p.name === (heroName || "Hero");
  });
  if (heroIdx < 0) heroIdx = 0;
  var setHeroSeat = /* @__PURE__ */ __name(function(newIdx) {
    if (newIdx === heroIdx) return;
    setHand(function(prev) {
      var n = prev.players.length;
      var shift = newIdx - heroIdx;
      var players = prev.players.map(function(p, i) {
        var srcIdx = ((i - shift) % n + n) % n;
        var src = prev.players[srcIdx];
        return Object.assign({}, p, { name: src.name, startingStack: src.startingStack });
      });
      return Object.assign({}, prev, { players, heroIdx: newIdx });
    });
  }, "setHeroSeat");
  var playerContrib = currentActor >= 0 ? streetBets.contrib[currentActor] : 0;
  var callAmount = currentActor >= 0 ? Math.min(streetBets.maxBet - playerContrib, currentStacks[currentActor]) : 0;
  var canCheck = callAmount === 0;
  var playerStack = currentActor >= 0 ? currentStacks[currentActor] : 0;
  var bettingType = gameCfg.betting || "nl";
  var isLimitGame = bettingType === "fl";
  var isPotLimit = bettingType === "pl";
  var flSmallStreets = gameCfg.flSmallStreets || [0, 1];
  var flRaiseCap = gameCfg.raiseCap || 4;
  var streetBetRaiseCount = 0;
  (currentStreet.actions || []).forEach(function(a) {
    if (a.action === "raise" || a.action === "bet") streetBetRaiseCount++;
  });
  var activePlayerCount = hand.players.filter(function(_, i) {
    return !foldedSet.has(i) && !allInSet.has(i);
  }).length;
  var isHeadsUp = activePlayerCount <= 2;
  var flIsSmall = flSmallStreets.includes(currentStreetIdx);
  var stud4thOpenPair = gameCfg.isStud && currentStreetIdx === 1 && studHasOpenPairOn4th(hand);
  var flBetSize = flIsSmall && !stud4thOpenPair ? (hand.blinds || {}).bb || 100 : ((hand.blinds || {}).bb || 100) * 2;
  var flRaiseToTotal = streetBets.maxBet + flBetSize;
  var flRaiseIncrement = flRaiseToTotal - playerContrib;
  var flCanRaise = isHeadsUp || streetBetRaiseCount < flRaiseCap;
  var plPotAfterCall = currentPot + callAmount;
  var plRaiseToTotal = streetBets.maxBet + plPotAfterCall;
  var plMaxRaiseIncrement = plRaiseToTotal - playerContrib;
  var plMaxBet = currentPot;
  var _prevMax = 0;
  var _lastRaiseSize = (hand.blinds || {}).bb || 0;
  var _runContrib = new Array(hand.players.length).fill(0);
  if (isPreflop && category !== "stud") {
    var _sbIdx = hand.players.findIndex(function(p) {
      return p.position === "SB" || p.position === "BTN/SB";
    });
    var _bbIdx = hand.players.findIndex(function(p) {
      return p.position === "BB";
    });
    if (_sbIdx >= 0) _runContrib[_sbIdx] = (hand.blinds || {}).sb || 0;
    if (_bbIdx >= 0) _runContrib[_bbIdx] = (hand.blinds || {}).bb || 0;
    _prevMax = (hand.blinds || {}).bb || 0;
  }
  (currentStreet.actions || []).forEach(function(a) {
    if (a.action === "fold") return;
    if (a.action === "bring-in") {
      _runContrib[a.player] = a.amount || bringInAmount;
      _prevMax = Math.max(_prevMax, _runContrib[a.player]);
      return;
    }
    if (a.amount > 0) _runContrib[a.player] += a.amount;
    if (a.action === "raise" || a.action === "bet") {
      var newMax = _runContrib[a.player];
      _lastRaiseSize = Math.max(newMax - _prevMax, (hand.blinds || {}).bb || 0);
      _prevMax = newMax;
    }
  });
  var minRaiseToTotal = streetBets.maxBet + _lastRaiseSize;
  var minRaiseIncrement = minRaiseToTotal - playerContrib;
  var cumulativeBoard = useMemo(function() {
    var b = "";
    for (var si = 0; si <= currentStreetIdx; si++) {
      b += hand.streets[si].cards.board || "";
    }
    return b;
  }, [hand.streets, currentStreetIdx]);
  var playerActions = useMemo(function() {
    var map = {};
    (currentStreet.actions || []).forEach(function(act) {
      map[act.player] = act;
    });
    return map;
  }, [currentStreet.actions]);
  if (phase === "setup") {
    var isOfc = category === "ofc";
    var setNumPlayersOfc = /* @__PURE__ */ __name(function(n) {
      setHand(function(prev) {
        var players = [];
        var newOfcRows = Object.assign({}, prev.ofcRows || {});
        for (var i = 0; i < n; i++) {
          if (prev.players[i]) {
            players.push(prev.players[i]);
          } else {
            players.push({ name: getSeatName(i, 0, heroName), position: "", startingStack: 0 });
          }
          if (!newOfcRows[i]) newOfcRows[i] = { top: "", middle: "", bottom: "" };
        }
        return Object.assign({}, prev, { players, ofcRows: newOfcRows });
      });
    }, "setNumPlayersOfc");
    return /* @__PURE__ */ React.createElement("div", { className: "gto-entry" }, /* @__PURE__ */ React.createElement("div", { className: "gto-phase-card" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section-title" }, isOfc ? "Players" : "Players & Blinds"), /* @__PURE__ */ React.createElement("div", { className: "replayer-row", style: { marginBottom: "8px" } }, /* @__PURE__ */ React.createElement("div", { className: "replayer-field", style: { flex: "0 0 70px" } }, /* @__PURE__ */ React.createElement("label", null, "Players"), isOfc ? /* @__PURE__ */ React.createElement("select", { value: hand.players.length, onChange: function(e) {
      setNumPlayersOfc(Number(e.target.value));
    } }, [2, 3].map(function(n) {
      return /* @__PURE__ */ React.createElement("option", { key: n, value: n }, n);
    })) : /* @__PURE__ */ React.createElement("select", { value: hand.players.length, onChange: function(e) {
      setNumPlayers(Number(e.target.value));
    } }, [2, 3, 4, 5, 6, 7, 8, 9, 10].map(function(n) {
      return /* @__PURE__ */ React.createElement("option", { key: n, value: n }, n);
    }))), !isOfc && /* @__PURE__ */ React.createElement("div", { className: "replayer-field" }, /* @__PURE__ */ React.createElement("label", null, "SB"), /* @__PURE__ */ React.createElement("input", { type: "text", inputMode: "decimal", value: (hand.blinds || {}).sb || "", onChange: function(e) {
      setHand(function(prev) {
        return Object.assign({}, prev, { blinds: Object.assign({}, prev.blinds || {}, { sb: Number(e.target.value) || 0 }) });
      });
    } })), !isOfc && /* @__PURE__ */ React.createElement("div", { className: "replayer-field" }, /* @__PURE__ */ React.createElement("label", null, "BB"), /* @__PURE__ */ React.createElement("input", { type: "text", inputMode: "decimal", value: (hand.blinds || {}).bb || "", onChange: function(e) {
      setHand(function(prev) {
        return Object.assign({}, prev, { blinds: Object.assign({}, prev.blinds || {}, { bb: Number(e.target.value) || 0 }) });
      });
    } })), !isOfc && /* @__PURE__ */ React.createElement("div", { className: "replayer-field" }, /* @__PURE__ */ React.createElement("label", null, category === "stud" ? "Ante" : "BB Ante"), /* @__PURE__ */ React.createElement("input", { type: "text", inputMode: "decimal", value: (hand.blinds || {}).ante || "", onChange: function(e) {
      setHand(function(prev) {
        return Object.assign({}, prev, { blinds: Object.assign({}, prev.blinds || {}, { ante: Number(e.target.value) || 0 }) });
      });
    } }))), !isOfc && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "4px", display: "flex" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.65rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", width: "32px", textAlign: "center" } }, "Hero")), hand.players.map(function(p, i) {
      var isHero = i === heroIdx;
      return /* @__PURE__ */ React.createElement("div", { key: i, className: "replayer-player-row" }, !isOfc && /* @__PURE__ */ React.createElement(
        "span",
        {
          className: "replayer-player-pos" + (isHero ? " hero" : ""),
          style: { cursor: "pointer" },
          onClick: function() {
            setHeroSeat(i);
          }
        },
        p.position
      ), /* @__PURE__ */ React.createElement("div", { className: "replayer-field", style: { flex: "1 1 80px" } }, /* @__PURE__ */ React.createElement("input", { type: "text", style: { textAlign: "left" }, value: p.name, onChange: function(e) {
        updatePlayerField(i, "name", e.target.value);
      }, placeholder: "Name" })), !isOfc && /* @__PURE__ */ React.createElement("div", { className: "replayer-field", style: { flex: "0 0 80px" } }, /* @__PURE__ */ React.createElement("input", { type: "text", inputMode: "decimal", style: { textAlign: "right" }, value: p.startingStack, onChange: function(e) {
        updatePlayerField(i, "startingStack", e.target.value);
      }, placeholder: "Stack" })));
    }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", justifyContent: "flex-end", padding: "10px 0" } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: onCancel }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary btn-sm", onClick: function() {
      setPhase(category === "ofc" ? "ofc_entry" : gameCfg.isStud ? "door_cards" : "action");
    } }, "Next")));
  }
  if (phase === "ofc_entry") {
    var ofcRows = hand.ofcRows || {};
    var updateOfcRow = /* @__PURE__ */ __name(function(playerIdx, row, value) {
      setHand(function(prev) {
        var newRows = Object.assign({}, prev.ofcRows || {});
        newRows[playerIdx] = Object.assign({}, newRows[playerIdx] || { top: "", middle: "", bottom: "" });
        newRows[playerIdx][row] = value;
        return Object.assign({}, prev, { ofcRows: newRows });
      });
    }, "updateOfcRow");
    var ofcRowLabels = [
      { key: "top", label: "Top (3 cards)", max: 3 },
      { key: "middle", label: "Middle (5 cards)", max: 5 },
      { key: "bottom", label: "Bottom (5 cards)", max: 5 }
    ];
    var allUsedOfc = /* @__PURE__ */ new Set();
    hand.players.forEach(function(_, pi) {
      var pr = ofcRows[pi] || {};
      ["top", "middle", "bottom"].forEach(function(r) {
        if (pr[r]) parseCardNotation(pr[r]).forEach(function(c) {
          if (c.suit !== "x") allUsedOfc.add(c.rank + c.suit);
        });
      });
    });
    var ofcAllRanks = "AKQJT98765432".split("");
    var ofcAllSuits = ["h", "d", "c", "s"];
    var ofcPickerTarget = useState(null);
    var ofcPickerState = ofcPickerTarget[0];
    var setOfcPickerState = ofcPickerTarget[1];
    var ofcToggleCard = /* @__PURE__ */ __name(function(rank, suit) {
      if (!ofcPickerState) return;
      var card = rank + suit;
      var pi = ofcPickerState.playerIdx;
      var row = ofcPickerState.row;
      var rowDef = ofcRowLabels.find(function(r) {
        return r.key === row;
      });
      var maxCards2 = rowDef ? rowDef.max : 5;
      var current = (ofcRows[pi] || {})[row] || "";
      var parsed = parseCardNotation(current).filter(function(c) {
        return c.suit !== "x";
      });
      var existing = parsed.map(function(c) {
        return c.rank + c.suit;
      });
      var idx = existing.indexOf(card);
      if (idx >= 0) {
        existing.splice(idx, 1);
      } else if (existing.length < maxCards2) {
        existing.push(card);
      }
      updateOfcRow(pi, row, existing.join(""));
    }, "ofcToggleCard");
    var ofcPickerSelectedSet = /* @__PURE__ */ new Set();
    if (ofcPickerState) {
      var _cr = (ofcRows[ofcPickerState.playerIdx] || {})[ofcPickerState.row] || "";
      parseCardNotation(_cr).forEach(function(c) {
        if (c.suit !== "x") ofcPickerSelectedSet.add(c.rank + c.suit);
      });
    }
    var ofcValid = true;
    var ofcValidMsg = "";
    hand.players.forEach(function(p, pi) {
      var pr = ofcRows[pi] || {};
      var topCount = parseCardNotation(pr.top || "").filter(function(c) {
        return c.suit !== "x";
      }).length;
      var midCount = parseCardNotation(pr.middle || "").filter(function(c) {
        return c.suit !== "x";
      }).length;
      var botCount = parseCardNotation(pr.bottom || "").filter(function(c) {
        return c.suit !== "x";
      }).length;
      var total = topCount + midCount + botCount;
      if (total > 0 && total < 13) {
        ofcValid = false;
        ofcValidMsg = p.name + " needs 13 cards total (" + total + " placed)";
      }
      if (topCount > 0 && topCount !== 3) {
        ofcValid = false;
        ofcValidMsg = p.name + " top row needs exactly 3 cards";
      }
      if (midCount > 0 && midCount !== 5) {
        ofcValid = false;
        ofcValidMsg = p.name + " middle row needs exactly 5 cards";
      }
      if (botCount > 0 && botCount !== 5) {
        ofcValid = false;
        ofcValidMsg = p.name + " bottom row needs exactly 5 cards";
      }
    });
    var heroRows = ofcRows[0] || {};
    var heroTotal = parseCardNotation(heroRows.top || "").filter(function(c) {
      return c.suit !== "x";
    }).length + parseCardNotation(heroRows.middle || "").filter(function(c) {
      return c.suit !== "x";
    }).length + parseCardNotation(heroRows.bottom || "").filter(function(c) {
      return c.suit !== "x";
    }).length;
    if (heroTotal === 0) {
      ofcValid = false;
      ofcValidMsg = "Place cards for at least Hero";
    }
    return /* @__PURE__ */ React.createElement("div", { className: "gto-entry" }, /* @__PURE__ */ React.createElement("div", { className: "gto-phase-card" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section-title" }, "OFC Card Placement"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: "10px" } }, "Place 13 cards per player into 3 rows: Top (3), Middle (5), Bottom (5). Tap a row to open the card picker."), hand.players.map(function(p, pi) {
      var pr = ofcRows[pi] || { top: "", middle: "", bottom: "" };
      return /* @__PURE__ */ React.createElement("div", { key: pi, className: "ofc-player-section" }, /* @__PURE__ */ React.createElement("div", { className: "ofc-player-name" }, p.name), /* @__PURE__ */ React.createElement("div", { className: "ofc-rows" }, ofcRowLabels.map(function(rowDef) {
        var isActive = ofcPickerState && ofcPickerState.playerIdx === pi && ofcPickerState.row === rowDef.key;
        return /* @__PURE__ */ React.createElement(
          "div",
          {
            key: rowDef.key,
            className: "ofc-row" + (isActive ? " ofc-row-active" : ""),
            onClick: function() {
              setOfcPickerState(isActive ? null : { playerIdx: pi, row: rowDef.key });
            }
          },
          /* @__PURE__ */ React.createElement("div", { className: "ofc-row-label" }, rowDef.label),
          /* @__PURE__ */ React.createElement("div", { className: "ofc-row-cards" }, /* @__PURE__ */ React.createElement(CardRow, { text: pr[rowDef.key] || "", max: rowDef.max, placeholderCount: rowDef.max }))
        );
      })), ofcPickerState && ofcPickerState.playerIdx === pi && /* @__PURE__ */ React.createElement("div", { className: "ofc-card-picker" }, ofcAllRanks.map(function(rank) {
        return /* @__PURE__ */ React.createElement("div", { key: rank, className: "ofc-picker-rank-row" }, ofcAllSuits.map(function(suit) {
          var card = rank + suit;
          var isUsed = allUsedOfc.has(card) && !ofcPickerSelectedSet.has(card);
          var isSelected = ofcPickerSelectedSet.has(card);
          var suitSymbols = { h: "♥", d: "♦", c: "♣", s: "♠" };
          var suitColors = { h: "#ef4444", d: "#3b82f6", c: "#22c55e", s: "#a78bfa" };
          return /* @__PURE__ */ React.createElement(
            "button",
            {
              key: card,
              className: "ofc-picker-card" + (isSelected ? " selected" : "") + (isUsed ? " used" : ""),
              disabled: isUsed,
              onClick: function(e) {
                e.stopPropagation();
                ofcToggleCard(rank, suit);
              },
              style: { color: isUsed ? "var(--text-muted)" : suitColors[suit] }
            },
            rank,
            suitSymbols[suit]
          );
        }));
      })));
    }))), ofcValidMsg && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", color: "#ef4444", padding: "4px 0" } }, ofcValidMsg), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", justifyContent: "flex-end", padding: "10px 0" } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: function() {
      setPhase("setup");
    } }, "Back"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary btn-sm", disabled: !ofcValid, onClick: function() {
      onDone(hand);
    } }, "Done")));
  }
  if (phase === "hero_cards") {
    var heroCards = hand.streets[0] && hand.streets[0].cards.hero || "";
    var heroMaxCards = gameCfg.heroCards || 2;
    var heroCurrentCards = parseCardNotation(heroCards).filter(function(c) {
      return c.suit !== "x";
    }).map(function(c) {
      return c.rank + c.suit;
    });
    var heroCurrentSet = new Set(heroCurrentCards);
    var heroAllRanks = "AKQJT98765432".split("");
    var heroAllSuits = [
      { key: "h", label: "♥", color: "#ef4444" },
      { key: "d", label: "♦", color: "#3b82f6" },
      { key: "c", label: "♣", color: "#22c55e" },
      { key: "s", label: "♠", color: "var(--text)" }
    ];
    var toggleHeroCard = /* @__PURE__ */ __name(function(card) {
      if (heroCurrentSet.has(card)) {
        var remaining = heroCurrentCards.filter(function(c) {
          return c !== card;
        });
        var newVal = remaining.join("");
        setHand(function(prev) {
          var streets = prev.streets.map(function(s, i) {
            return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { hero: newVal }) }) : s;
          });
          return Object.assign({}, prev, { streets });
        });
      } else {
        if (heroCurrentCards.length >= heroMaxCards) return;
        var newVal = heroCards + card;
        setHand(function(prev) {
          var streets = prev.streets.map(function(s, i) {
            return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { hero: newVal }) }) : s;
          });
          return Object.assign({}, prev, { streets });
        });
      }
    }, "toggleHeroCard");
    return /* @__PURE__ */ React.createElement("div", { className: "gto-entry" }, /* @__PURE__ */ React.createElement("div", { className: "gto-phase-card" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section-title" }, "Hero Cards"), /* @__PURE__ */ React.createElement("div", { className: "replayer-field" }, /* @__PURE__ */ React.createElement("label", null, "Your Cards"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        placeholder: gameCfg.heroPlaceholder || "AhKd",
        value: heroCards,
        onChange: function(e) {
          var val = e.target.value;
          setHand(function(prev) {
            var streets = prev.streets.map(function(s, i) {
              return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { hero: val }) }) : s;
            });
            return Object.assign({}, prev, { streets });
          });
        }
      }
    ), /* @__PURE__ */ React.createElement(CardRow, { text: heroCards, stud: gameCfg.isStud, max: heroMaxCards })), /* @__PURE__ */ React.createElement("div", { className: "card-picker-grid" }, heroAllSuits.map(function(suit) {
      return React.createElement(
        React.Fragment,
        { key: suit.key },
        heroAllRanks.map(function(rank) {
          var card = rank + suit.key;
          var isSelected = heroCurrentSet.has(card);
          var cls = "card-picker-btn" + (isSelected ? " selected" : "");
          return React.createElement("button", {
            key: card,
            className: cls,
            onClick: /* @__PURE__ */ __name(function() {
              toggleHeroCard(card);
            }, "onClick")
          }, React.createElement("img", {
            src: "/cards/cards_gui_" + rank + suit.key + ".svg",
            alt: card,
            loading: "eager"
          }));
        })
      );
    })))), /* @__PURE__ */ React.createElement("div", { className: "gto-street-card" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", justifyContent: "flex-end", padding: "10px 12px" } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: function() {
      setPhase("setup");
    } }, "Back"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary btn-sm", onClick: function() {
      setPhase(gameCfg.isStud ? "door_cards" : "action");
    } }, gameCfg.isStud ? "Enter Door Cards" : "Start Action"))));
  }
  if (phase === "door_cards") {
    var numOpps = hand.players.length - 1;
    var heroIdxDC = hand.heroIdx != null ? hand.heroIdx : 0;
    var usedCardsDC = /* @__PURE__ */ new Set();
    parseCardNotation(hand.streets[0] && hand.streets[0].cards.hero || "").forEach(function(c) {
      if (c.suit !== "x") usedCardsDC.add(c.rank + c.suit);
    });
    var oppCards0 = hand.streets[0] && hand.streets[0].cards.opponents || [];
    oppCards0.forEach(function(opp) {
      parseCardNotation(opp || "").forEach(function(c) {
        if (c.suit !== "x") usedCardsDC.add(c.rank + c.suit);
      });
    });
    var dcAllRanks = "AKQJT98765432".split("");
    var dcAllSuits = [
      { key: "h", label: "♥", color: "#ef4444" },
      { key: "d", label: "♦", color: "#3b82f6" },
      { key: "c", label: "♣", color: "#22c55e" },
      { key: "s", label: "♠", color: "var(--text)" }
    ];
    var setOppDoorCard = /* @__PURE__ */ __name(function(oppIdx2, card) {
      setHand(function(prev) {
        var streets = prev.streets.map(function(s, si) {
          if (si !== 0) return s;
          var opponents = [...s.cards.opponents || []];
          var current = opponents[oppIdx2] || "";
          if (current === card) {
            opponents[oppIdx2] = "";
          } else {
            opponents[oppIdx2] = card;
          }
          return Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents }) });
        });
        return Object.assign({}, prev, { streets });
      });
    }, "setOppDoorCard");
    return /* @__PURE__ */ React.createElement("div", { className: "gto-entry" }, /* @__PURE__ */ React.createElement("div", { className: "gto-phase-card" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section-title" }, "Opponent Door Cards"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "8px" } }, "Enter each opponent's face-up 3rd street card. Leave blank if unknown."), hand.players.map(function(p, pi) {
      if (pi === heroIdxDC) return null;
      var oppSlot2 = pi < heroIdxDC ? pi : pi - 1;
      var currentCard = oppCards0[oppSlot2] || "";
      var parsedCurrent = parseCardNotation(currentCard).filter(function(c) {
        return c.suit !== "x";
      });
      var selectedCard = parsedCurrent.length ? parsedCurrent[0].rank + parsedCurrent[0].suit : "";
      return /* @__PURE__ */ React.createElement("div", { key: pi, style: { marginBottom: "12px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, fontSize: "0.8rem" } }, p.name), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.7rem", color: "var(--text-muted)" } }, p.position), selectedCard && /* @__PURE__ */ React.createElement(CardRow, { text: selectedCard, max: 1 }), !selectedCard && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.7rem", color: "var(--text-muted)", fontStyle: "italic" } }, "? unknown")));
    }), /* @__PURE__ */ React.createElement("div", { className: "card-picker-grid" }, dcAllSuits.map(function(suit) {
      return React.createElement(
        React.Fragment,
        { key: suit.key },
        dcAllRanks.map(function(rank) {
          var card = rank + suit.key;
          var isUsed = usedCardsDC.has(card);
          var selectedForOpp = -1;
          oppCards0.forEach(function(opp, oi) {
            if (opp === card) selectedForOpp = oi;
          });
          var cls = "card-picker-btn" + (selectedForOpp >= 0 ? " selected" : "") + (isUsed && selectedForOpp < 0 ? " used" : "");
          return React.createElement("button", {
            key: card,
            className: cls,
            disabled: isUsed && selectedForOpp < 0,
            onClick: /* @__PURE__ */ __name(function() {
              if (selectedForOpp >= 0) {
                setOppDoorCard(selectedForOpp, "");
              } else {
                for (var oi = 0; oi < numOpps; oi++) {
                  if (!oppCards0[oi]) {
                    setOppDoorCard(oi, card);
                    return;
                  }
                }
              }
            }, "onClick")
          }, React.createElement("img", {
            src: "/cards/cards_gui_" + rank + suit.key + ".svg",
            alt: card,
            loading: "eager"
          }));
        })
      );
    })))), /* @__PURE__ */ React.createElement("div", { className: "gto-street-card" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", justifyContent: "flex-end", padding: "10px 12px" } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: function() {
      setPhase("setup");
    } }, "Back"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary btn-sm", onClick: function() {
      setPhase("action");
    } }, "Start Action"))));
  }
  if (phase === "draw_discard" || phase === "draw_cards_entry") {
    var nextDrawStreet = currentStreetIdx + 1;
    var drawStreetName = currentStreet.name || "Draw";
    var isBadugi = hand.gameType === "Badugi" || hand.gameType === "Badeucy" || hand.gameType === "Badacy";
    var maxDiscard = isBadugi ? 4 : 5;
    var drawActivePlayers = seatOrder.filter(function(i) {
      return !foldedSet.has(i);
    });
    var drawPlayerQueue = drawActivePlayers.filter(function(pi) {
      var existingDraw = (currentStreet.draws || []).find(function(d) {
        return d.player === pi;
      });
      return !existingDraw;
    });
    var currentDrawPlayer = drawPlayerQueue.length > 0 ? drawPlayerQueue[0] : -1;
    var allDrawsDeclared = drawPlayerQueue.length === 0;
    var addDraw = /* @__PURE__ */ __name(function(playerIdx, discardCount) {
      setHand(function(prev) {
        var streets = prev.streets.map(function(s, si) {
          if (si !== currentStreetIdx) return s;
          var draws = (s.draws || []).concat([{ player: playerIdx, discarded: discardCount, discardedCards: "", newCards: "" }]);
          return Object.assign({}, s, { draws });
        });
        return Object.assign({}, prev, { streets });
      });
    }, "addDraw");
    var undoLastDraw = /* @__PURE__ */ __name(function() {
      setHand(function(prev) {
        var streets = prev.streets.map(function(s, si) {
          if (si !== currentStreetIdx) return s;
          var draws = (s.draws || []).slice(0, -1);
          return Object.assign({}, s, { draws });
        });
        return Object.assign({}, prev, { streets });
      });
    }, "undoLastDraw");
    var updateDrawCardsFn = /* @__PURE__ */ __name(function(playerIdx, field, val) {
      setHand(function(prev) {
        var streets = prev.streets.map(function(s, si) {
          if (si !== currentStreetIdx) return s;
          var draws = (s.draws || []).map(function(d) {
            if (d.player !== playerIdx) return d;
            var upd = Object.assign({}, d);
            upd[field] = val;
            return upd;
          });
          return Object.assign({}, s, { draws });
        });
        return Object.assign({}, prev, { streets });
      });
    }, "updateDrawCardsFn");
    var getDrawPlayerHand = /* @__PURE__ */ __name(function(pi) {
      var _a, _b, _c;
      var dhi = hand.heroIdx != null ? hand.heroIdx : 0;
      var oppSlot2 = pi > dhi ? pi - 1 : pi;
      var base = pi === dhi ? ((_a = hand.streets[0]) == null ? void 0 : _a.cards.hero) || "" : ((_c = (_b = hand.streets[0]) == null ? void 0 : _b.cards.opponents) == null ? void 0 : _c[oppSlot2]) || "";
      return computeDrawHand(base, getPlayerDrawsByStreet(hand, pi), currentStreetIdx - 1);
    }, "getDrawPlayerHand");
    if (phase === "draw_cards_entry") {
      return /* @__PURE__ */ React.createElement("div", { className: "gto-entry" }, /* @__PURE__ */ React.createElement("div", { className: "gto-phase-card" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section-title" }, "Card Details -- ", drawStreetName), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "10px" } }, "Optionally specify which cards were discarded and drawn. Skip to continue."), drawActivePlayers.map(function(pi) {
        var p = hand.players[pi];
        var de = (currentStreet.draws || []).find(function(d) {
          return d.player === pi;
        });
        if (!de) return null;
        var isPat = de.discarded === 0;
        var isHero = pi === (hand.heroIdx != null ? hand.heroIdx : 0);
        var curHand = isHero ? getDrawPlayerHand(pi) : null;
        return /* @__PURE__ */ React.createElement("div", { key: pi, style: { marginBottom: "10px", padding: "8px 10px", background: "var(--surface2)", borderRadius: "6px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: isHero ? "6px" : "0" } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, fontSize: "0.78rem" } }, p.name), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.7rem", color: "var(--text-muted)" } }, p.position), isPat && /* @__PURE__ */ React.createElement("span", { className: "replayer-draw-pat-badge" }, "Stand Pat"), !isPat && /* @__PURE__ */ React.createElement("span", { className: "replayer-draw-count-badge" }, "Discards ", de.discarded)), isHero && curHand && (function() {
          var handCards = parseCardNotation(curHand);
          var discardedSet = new Set(parseCardNotation(de.discardedCards || "").map(function(c) {
            return c.rank + c.suit;
          }));
          var toggleDiscard = /* @__PURE__ */ __name(function(card) {
            if (isPat) return;
            var cardKey = card.rank + card.suit;
            var currentDiscarded = parseCardNotation(de.discardedCards || "");
            var currentSet = new Set(currentDiscarded.map(function(c) {
              return c.rank + c.suit;
            }));
            var newDiscarded;
            if (currentSet.has(cardKey)) {
              newDiscarded = currentDiscarded.filter(function(c) {
                return c.rank + c.suit !== cardKey;
              }).map(function(c) {
                return c.rank + c.suit;
              }).join("");
            } else {
              if (currentDiscarded.length >= de.discarded) return;
              newDiscarded = (de.discardedCards || "") + cardKey;
            }
            updateDrawCardsFn(pi, "discardedCards", newDiscarded);
          }, "toggleDiscard");
          return /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "4px" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.6rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" } }, isPat ? "Current Hand" : "Tap to select discards"), /* @__PURE__ */ React.createElement("div", { className: "card-row", style: { gap: "2px", flexWrap: "nowrap" } }, handCards.map(function(c, ci) {
            var isDiscarded = discardedSet.has(c.rank + c.suit);
            return React.createElement("img", {
              key: ci,
              className: "card-img draw-selectable" + (isDiscarded ? " draw-discarded" : ""),
              src: "/cards/cards_gui_" + c.rank + c.suit + ".svg",
              alt: c.rank + c.suit,
              loading: "eager",
              onClick: /* @__PURE__ */ __name(function() {
                toggleDiscard(c);
              }, "onClick"),
              style: { cursor: isPat ? "default" : "pointer" }
            });
          })));
        })(), isHero && !isPat && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" } }, /* @__PURE__ */ React.createElement("div", { className: "replayer-field", style: { flex: 1, minWidth: "80px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.55rem" } }, "Discarded"), /* @__PURE__ */ React.createElement("input", { type: "text", placeholder: "e.g. 7h3c", value: de.discardedCards || "", onChange: function(e) {
          updateDrawCardsFn(pi, "discardedCards", e.target.value);
        } })), /* @__PURE__ */ React.createElement("div", { className: "replayer-field", style: { flex: 1, minWidth: "80px" } }, /* @__PURE__ */ React.createElement("label", { style: { fontSize: "0.55rem" } }, "New Cards"), /* @__PURE__ */ React.createElement("input", { type: "text", placeholder: "e.g. Ah5s", value: de.newCards || "", onChange: function(e) {
          updateDrawCardsFn(pi, "newCards", e.target.value);
        } }), de.newCards && /* @__PURE__ */ React.createElement(CardRow, { text: de.newCards, max: de.discarded }))));
      }))), /* @__PURE__ */ React.createElement("div", { className: "gto-street-card" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", justifyContent: "flex-end", padding: "10px 12px" } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: function() {
        setPhase("draw_discard");
      } }, "Back"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary btn-sm", onClick: function() {
        setCurrentStreetIdx(nextDrawStreet);
        setPhase("action");
      } }, "Continue"))));
    }
    return /* @__PURE__ */ React.createElement("div", { className: "gto-entry" }, /* @__PURE__ */ React.createElement("div", { className: "gto-phase-card" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section-title" }, "Draw Round -- ", drawStreetName), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "10px" } }, "Each player declares how many cards to discard. Stand Pat = keep all cards."), drawActivePlayers.map(function(pi) {
      var p = hand.players[pi];
      var existingDraw = (currentStreet.draws || []).find(function(d) {
        return d.player === pi;
      });
      var isDeclared = !!existingDraw;
      var isCurrentTarget = pi === currentDrawPlayer;
      var curHand = getDrawPlayerHand(pi);
      var drawHistory = [];
      for (var si = 0; si < currentStreetIdx; si++) {
        var pastStreet = hand.streets[si];
        if (!pastStreet || !pastStreet.draws || !pastStreet.draws.length) continue;
        var pastDraw = pastStreet.draws.find(function(d) {
          return d.player === pi;
        });
        if (pastDraw) {
          drawHistory.push(pastDraw.discarded === 0 ? "Pat" : "D" + pastDraw.discarded);
        }
      }
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: pi,
          className: "gto-seat" + (isCurrentTarget ? " active" : "") + (isDeclared ? " gto-draw-declared" : ""),
          style: { marginBottom: "6px" }
        },
        /* @__PURE__ */ React.createElement("div", { className: "gto-seat-strip" }, p.position),
        /* @__PURE__ */ React.createElement("div", { className: "gto-seat-content" }, /* @__PURE__ */ React.createElement("div", { className: "gto-seat-bar" }, /* @__PURE__ */ React.createElement("div", { className: "gto-seat-row1" }, /* @__PURE__ */ React.createElement("span", { className: "gto-seat-pos" }, p.position), /* @__PURE__ */ React.createElement("span", { className: "gto-seat-stack" }, formatChipAmount(currentStacks[pi]))), /* @__PURE__ */ React.createElement("div", { className: "gto-seat-row2" }, /* @__PURE__ */ React.createElement("span", { className: "gto-seat-name" }, p.name), isDeclared && /* @__PURE__ */ React.createElement("span", { className: "gto-seat-result-badge check", style: { marginLeft: "auto" } }, existingDraw.discarded === 0 ? "Stand Pat" : "Drew " + existingDraw.discarded)), drawHistory.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "gto-seat-draw-history" }, drawHistory.join(" / "))), curHand && /* @__PURE__ */ React.createElement("div", { style: { padding: "4px 10px" } }, /* @__PURE__ */ React.createElement(CardRow, { text: curHand, max: gameCfg.heroCards || 5 })), isCurrentTarget && !isDeclared && /* @__PURE__ */ React.createElement("div", { className: "gto-draw-buttons" }, /* @__PURE__ */ React.createElement("button", { className: "gto-draw-btn pat", onClick: function() {
          addDraw(pi, 0);
        } }, "Stand Pat"), Array.from({ length: maxDiscard }, function(_, n) {
          return n + 1;
        }).map(function(count) {
          return /* @__PURE__ */ React.createElement("button", { key: count, className: "gto-draw-btn", onClick: function() {
            addDraw(pi, count);
          } }, count);
        })))
      );
    }))), /* @__PURE__ */ React.createElement("div", { className: "gto-street-card" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", justifyContent: "flex-end", padding: "10px 12px" } }, (currentStreet.draws || []).length > 0 && /* @__PURE__ */ React.createElement("button", { className: "gto-undo-btn", onClick: undoLastDraw }, "Undo"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: function() {
      setHand(function(prev) {
        for (var si = currentStreetIdx; si >= 0; si--) {
          var acts = prev.streets[si].actions || [];
          if (acts.length > 0) {
            var streets = prev.streets.map(function(s, i) {
              if (i < si) return s;
              if (i === si) {
                var updated = Object.assign({}, s, { actions: acts.slice(0, -1) });
                if (i === currentStreetIdx) updated.draws = [];
                return updated;
              }
              return Object.assign({}, s, { actions: [], draws: [] });
            });
            if (si < currentStreetIdx) setCurrentStreetIdx(si);
            return Object.assign({}, prev, { streets });
          }
        }
        return prev;
      });
      setPhase("action");
    } }, "Back"), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn btn-primary btn-sm",
        disabled: !allDrawsDeclared,
        onClick: function() {
          var heroIdx2 = hand.heroIdx != null ? hand.heroIdx : 0;
          var heroDraw = (currentStreet.draws || []).find(function(d) {
            return d.player === heroIdx2;
          });
          var heroIsPat = heroDraw && heroDraw.discarded === 0;
          if (heroIsPat) {
            setCurrentStreetIdx(nextDrawStreet);
            setPhase("action");
          } else {
            setPhase("draw_cards_entry");
          }
        }
      },
      (function() {
        var heroIdx2 = hand.heroIdx != null ? hand.heroIdx : 0;
        var heroDraw = (currentStreet.draws || []).find(function(d) {
          return d.player === heroIdx2;
        });
        return heroDraw && heroDraw.discarded === 0 ? "Continue" : "Enter Cards";
      })()
    ))));
  }
  if (phase === "stud_deal") {
    var nextStudStreet = currentStreetIdx + 1;
    var studStreetName = hand.streets[nextStudStreet] && hand.streets[nextStudStreet].name || "Next Street";
    var heroIdxSD = hand.heroIdx != null ? hand.heroIdx : 0;
    var isLastStudStreet = nextStudStreet === 4;
    var usedCardsSD = /* @__PURE__ */ new Set();
    hand.streets.forEach(function(s) {
      parseCardNotation(s.cards.hero || "").forEach(function(c) {
        if (c.suit !== "x") usedCardsSD.add(c.rank + c.suit);
      });
      (s.cards.opponents || []).forEach(function(opp) {
        parseCardNotation(opp || "").forEach(function(c) {
          if (c.suit !== "x") usedCardsSD.add(c.rank + c.suit);
        });
      });
    });
    var nextStreetData = hand.streets[nextStudStreet] || { cards: { hero: "", opponents: [] } };
    var heroNextCard = nextStreetData.cards.hero || "";
    var oppNextCards = nextStreetData.cards.opponents || [];
    var sdAllRanks = "AKQJT98765432".split("");
    var sdAllSuits = [
      { key: "h", label: "♥", color: "#ef4444" },
      { key: "d", label: "♦", color: "#3b82f6" },
      { key: "c", label: "♣", color: "#22c55e" },
      { key: "s", label: "♠", color: "var(--text)" }
    ];
    var activePlayers = hand.players.map(function(p, pi) {
      return pi;
    }).filter(function(pi) {
      return !foldedSet.has(pi);
    });
    var setStudCard = /* @__PURE__ */ __name(function(playerIdx, card) {
      setHand(function(prev) {
        var streets = prev.streets.map(function(s, si) {
          if (si !== nextStudStreet) return s;
          var newCards = Object.assign({}, s.cards);
          if (playerIdx === heroIdxSD) {
            newCards.hero = newCards.hero === card ? "" : card;
          } else {
            var oppSlot2 = playerIdx < heroIdxSD ? playerIdx : playerIdx - 1;
            var opponents = [...newCards.opponents || []];
            opponents[oppSlot2] = opponents[oppSlot2] === card ? "" : card;
            newCards.opponents = opponents;
          }
          return Object.assign({}, s, { cards: newCards });
        });
        return Object.assign({}, prev, { streets });
      });
    }, "setStudCard");
    var getStudCardForPlayer = /* @__PURE__ */ __name(function(pi) {
      if (pi === heroIdxSD) return heroNextCard;
      var oppSlot2 = pi < heroIdxSD ? pi : pi - 1;
      return oppNextCards[oppSlot2] || "";
    }, "getStudCardForPlayer");
    var enteredCount = activePlayers.filter(function(pi) {
      return getStudCardForPlayer(pi);
    }).length;
    return /* @__PURE__ */ React.createElement("div", { className: "gto-entry" }, /* @__PURE__ */ React.createElement("div", { className: "gto-phase-card" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section-title" }, "Deal ", studStreetName), /* @__PURE__ */ React.createElement("p", { style: { fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "8px" } }, isLastStudStreet ? "Enter each player's 7th street card (face down)." : "Enter each player's next card.", " Tap a player name to select them, then tap a card."), activePlayers.map(function(pi) {
      var p = hand.players[pi];
      var isHero = pi === heroIdxSD;
      var cardStr = getStudCardForPlayer(pi);
      var isTarget = studDealTargetState[0] === pi;
      return /* @__PURE__ */ React.createElement("div", { key: pi, style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: "6px",
        padding: "6px 8px",
        borderRadius: "6px",
        cursor: "pointer",
        background: isTarget ? "var(--accent-bg, rgba(34,197,94,0.1))" : "transparent",
        border: isTarget ? "1.5px solid var(--accent)" : "1.5px solid transparent"
      }, onClick: function() {
        studDealTargetState[1](pi);
      } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, fontSize: "0.8rem", minWidth: "100px" } }, p.name), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.7rem", color: "var(--text-muted)" } }, p.position), cardStr ? /* @__PURE__ */ React.createElement(CardRow, { text: cardStr, max: 1 }) : /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.7rem", color: "var(--text-muted)", fontStyle: "italic" } }, "—"));
    }), /* @__PURE__ */ React.createElement("div", { className: "card-picker-grid" }, sdAllSuits.map(function(suit) {
      return React.createElement(
        React.Fragment,
        { key: suit.key },
        sdAllRanks.map(function(rank) {
          var card = rank + suit.key;
          var isUsed = usedCardsSD.has(card);
          var selectedFor = -1;
          activePlayers.forEach(function(pi) {
            if (getStudCardForPlayer(pi) === card) selectedFor = pi;
          });
          var cls = "card-picker-btn" + (selectedFor >= 0 ? " selected" : "") + (isUsed && selectedFor < 0 ? " used" : "");
          return React.createElement("button", {
            key: card,
            className: cls,
            disabled: isUsed && selectedFor < 0,
            onClick: /* @__PURE__ */ __name(function() {
              if (selectedFor >= 0) {
                setStudCard(selectedFor, "");
              } else if (studDealTargetState[0] >= 0) {
                setStudCard(studDealTargetState[0], card);
                var nextTarget = activePlayers.find(function(pi) {
                  return pi !== studDealTargetState[0] && !getStudCardForPlayer(pi);
                });
                if (nextTarget !== void 0) studDealTargetState[1](nextTarget);
              }
            }, "onClick")
          }, React.createElement("img", {
            src: "/cards/cards_gui_" + rank + suit.key + ".svg",
            alt: card,
            loading: "eager"
          }));
        })
      );
    })))), /* @__PURE__ */ React.createElement("div", { className: "gto-street-card" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", justifyContent: "flex-end", padding: "10px 12px" } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: function() {
      setPhase("action");
    } }, "Back"), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn btn-primary btn-sm",
        disabled: enteredCount < activePlayers.length,
        onClick: function() {
          setCurrentStreetIdx(nextStudStreet);
          setPhase("action");
        }
      },
      "Continue"
    ))));
  }
  if (phase === "board_entry") {
    var nextStreet = currentStreetIdx + 1;
    var streetName = hand.streets[nextStreet] && hand.streets[nextStreet].name || "Next Street";
    var boardVal = hand.streets[nextStreet] && hand.streets[nextStreet].cards.board || "";
    var maxCards = streetDef.boardCards ? streetDef.boardCards[nextStreet] : 1;
    var usedCards = /* @__PURE__ */ new Set();
    hand.streets.forEach(function(s) {
      parseCardNotation(s.cards.hero || "").forEach(function(c) {
        if (c.suit !== "x") usedCards.add(c.rank + c.suit);
      });
      parseCardNotation(s.cards.board || "").forEach(function(c) {
        if (c.suit !== "x") usedCards.add(c.rank + c.suit);
      });
      (s.cards.opponents || []).forEach(function(opp) {
        parseCardNotation(opp || "").forEach(function(c) {
          if (c.suit !== "x") usedCards.add(c.rank + c.suit);
        });
      });
    });
    var currentBoardCards = parseCardNotation(boardVal).filter(function(c) {
      return c.suit !== "x";
    }).map(function(c) {
      return c.rank + c.suit;
    });
    var currentBoardSet = new Set(currentBoardCards);
    currentBoardCards.forEach(function(c) {
      usedCards.delete(c);
    });
    var allRanks = "AKQJT98765432".split("");
    var allSuits = [
      { key: "h", label: "♥", color: "#ef4444" },
      { key: "d", label: "♦", color: "#3b82f6" },
      { key: "c", label: "♣", color: "#22c55e" },
      { key: "s", label: "♠", color: "var(--text)" }
    ];
    var toggleCard = /* @__PURE__ */ __name(function(card) {
      if (currentBoardSet.has(card)) {
        var remaining = currentBoardCards.filter(function(c) {
          return c !== card;
        });
        var newVal = remaining.join("");
        setHand(function(prev) {
          var streets = prev.streets.map(function(s, i) {
            return i === nextStreet ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { board: newVal }) }) : s;
          });
          return Object.assign({}, prev, { streets });
        });
      } else {
        if (currentBoardCards.length >= maxCards) return;
        var newVal = boardVal + card;
        setHand(function(prev) {
          var streets = prev.streets.map(function(s, i) {
            return i === nextStreet ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { board: newVal }) }) : s;
          });
          return Object.assign({}, prev, { streets });
        });
      }
    }, "toggleCard");
    return /* @__PURE__ */ React.createElement("div", { className: "gto-entry" }, /* @__PURE__ */ React.createElement("div", { className: "gto-phase-card" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section", style: { textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { className: "gto-street-label" }, "Deal the ", streetName), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", margin: "8px 0" } }, cumulativeBoard && /* @__PURE__ */ React.createElement(CardRow, { text: cumulativeBoard, max: 5 }), boardVal && /* @__PURE__ */ React.createElement(CardRow, { text: boardVal, max: maxCards })), /* @__PURE__ */ React.createElement("div", { className: "replayer-field", style: { marginTop: "8px" } }, /* @__PURE__ */ React.createElement("label", null, streetName, " Cards"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        placeholder: nextStreet === 1 ? "Qh7d2c" : "Ts",
        value: boardVal,
        onChange: function(e) {
          var val = e.target.value;
          setHand(function(prev) {
            var streets = prev.streets.map(function(s, i) {
              return i === nextStreet ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { board: val }) }) : s;
            });
            return Object.assign({}, prev, { streets });
          });
        }
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "card-picker-grid" }, allSuits.map(function(suit) {
      return React.createElement(
        React.Fragment,
        { key: suit.key },
        allRanks.map(function(rank) {
          var card = rank + suit.key;
          var isUsed = usedCards.has(card);
          var isSelected = currentBoardSet.has(card);
          var cls = "card-picker-btn" + (isSelected ? " selected" : "") + (isUsed ? " used" : "");
          return React.createElement("button", {
            key: card,
            className: cls,
            onClick: /* @__PURE__ */ __name(function() {
              toggleCard(card);
            }, "onClick")
          }, React.createElement("img", {
            src: "/cards/cards_gui_" + rank + suit.key + ".svg",
            alt: card,
            loading: "eager"
          }));
        })
      );
    })))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", justifyContent: "flex-end", padding: "10px 0" } }, /* @__PURE__ */ React.createElement("button", { className: "gto-undo-btn", onClick: undoLastAction }, "Undo"), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn btn-primary btn-sm",
        disabled: parseCardNotation(boardVal).filter(function(c) {
          return c.suit !== "x";
        }).length < maxCards,
        onClick: function() {
          setCurrentStreetIdx(nextStreet);
          setPhase("action");
        }
      },
      "Continue"
    )));
  }
  if (phase === "showdown") {
    var sdUsedCards = /* @__PURE__ */ new Set();
    hand.streets.forEach(function(s) {
      parseCardNotation(s.cards.hero || "").forEach(function(c) {
        if (c.suit !== "x") sdUsedCards.add(c.rank + c.suit);
      });
      parseCardNotation(s.cards.board || "").forEach(function(c) {
        if (c.suit !== "x") sdUsedCards.add(c.rank + c.suit);
      });
      (s.cards.opponents || []).forEach(function(opp) {
        parseCardNotation(opp || "").forEach(function(c) {
          if (c.suit !== "x") sdUsedCards.add(c.rank + c.suit);
        });
      });
    });
    var showdownPlayers = hand.players.map(function(p, i) {
      return { player: p, idx: i };
    }).filter(function(o) {
      return o.idx !== heroIdx && !foldedSet.has(o.idx);
    });
    var sdAllRanks = "AKQJT98765432".split("");
    var sdAllSuits = [
      { key: "h", label: "♥" },
      { key: "d", label: "♦" },
      { key: "c", label: "♣" },
      { key: "s", label: "♠" }
    ];
    var sdMaxCards = gameCfg.heroCards || 2;
    var isStudShowdown = category === "stud";
    var getStudAllCards = /* @__PURE__ */ __name(function(oppSlot2) {
      var accumulated = "";
      hand.streets.forEach(function(s) {
        var oppC = (s.cards.opponents || [])[oppSlot2] || "";
        if (oppC && oppC !== "MUCK") accumulated += oppC;
      });
      return accumulated;
    }, "getStudAllCards");
    var getStudHeroAllCards = /* @__PURE__ */ __name(function() {
      var accumulated = "";
      hand.streets.forEach(function(s) {
        if (s.cards.hero) accumulated += s.cards.hero;
      });
      return accumulated;
    }, "getStudHeroAllCards");
    var getOppCardStr = /* @__PURE__ */ __name(function(oppSlot2) {
      if (isStudShowdown) return getStudAllCards(oppSlot2);
      return hand.streets[0].cards.opponents && hand.streets[0].cards.opponents[oppSlot2] || "";
    }, "getOppCardStr");
    var sdActiveIdx = -1;
    for (var sdi = 0; sdi < showdownPlayers.length; sdi++) {
      var oppIdx = showdownPlayers[sdi].idx;
      var oppSlot = oppIdx > heroIdx ? oppIdx - 1 : oppIdx;
      var oppCardStr = getOppCardStr(oppSlot);
      var oppCards = oppCardStr === "MUCK" ? [] : parseCardNotation(oppCardStr).filter(function(c) {
        return c.suit !== "x";
      });
      if (oppCardStr !== "MUCK" && oppCards.length < sdMaxCards) {
        sdActiveIdx = sdi;
        break;
      }
    }
    return /* @__PURE__ */ React.createElement("div", { className: "gto-entry" }, /* @__PURE__ */ React.createElement("div", { className: "gto-phase-card" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section", style: { textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { className: "gto-street-label" }, "Showdown"), cumulativeBoard && /* @__PURE__ */ React.createElement("div", { style: { margin: "8px 0" } }, /* @__PURE__ */ React.createElement(CardRow, { text: cumulativeBoard, max: 5 })))), showdownPlayers.map(function(o, si) {
      var oppSlot2 = o.idx > heroIdx ? o.idx - 1 : o.idx;
      var oppCardStr2 = getOppCardStr(oppSlot2);
      var isMucked = oppCardStr2 === "MUCK" || (hand.streets[0].cards.opponents && hand.streets[0].cards.opponents[oppSlot2]) === "MUCK";
      var oppParsed = isMucked ? [] : parseCardNotation(oppCardStr2).filter(function(c) {
        return c.suit !== "x";
      });
      var oppCardSet = new Set(oppParsed.map(function(c) {
        return c.rank + c.suit;
      }));
      var isComplete = isMucked || oppParsed.length >= sdMaxCards;
      var isActiveOpp = si === sdActiveIdx;
      var studKnownCount = 0;
      if (isStudShowdown && !isMucked) {
        for (var _si = 0; _si < hand.streets.length; _si++) {
          var _sc = (hand.streets[_si].cards.opponents || [])[oppSlot2] || "";
          parseCardNotation(_sc).filter(function(c) {
            return c.suit !== "x";
          }).forEach(function() {
            studKnownCount++;
          });
        }
      }
      var studMissingCount = isStudShowdown ? Math.max(0, sdMaxCards - oppParsed.length) : 0;
      var thisUsed = new Set(sdUsedCards);
      showdownPlayers.forEach(function(other) {
        if (other.idx === o.idx) return;
        var otherSlot = other.idx > heroIdx ? other.idx - 1 : other.idx;
        var otherStr = getOppCardStr(otherSlot);
        if (otherStr !== "MUCK") {
          parseCardNotation(otherStr).forEach(function(c) {
            if (c.suit !== "x") thisUsed.add(c.rank + c.suit);
          });
        }
      });
      oppParsed.forEach(function(c) {
        thisUsed.delete(c.rank + c.suit);
      });
      var toggleSdCard = /* @__PURE__ */ __name(function(card) {
        if (oppCardSet.has(card)) {
          if (isStudShowdown) {
            setHand(function(prev) {
              var streets = prev.streets.map(function(s) {
                var opps = (s.cards.opponents || []).slice();
                var curr = opps[oppSlot2] || "";
                if (curr.indexOf(card) >= 0) {
                  opps[oppSlot2] = curr.replace(card, "");
                  return Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: opps }) });
                }
                return s;
              });
              return Object.assign({}, prev, { streets });
            });
          } else {
            var remaining = oppParsed.map(function(c) {
              return c.rank + c.suit;
            }).filter(function(c) {
              return c !== card;
            });
            var newVal = remaining.join("");
            setHand(function(prev) {
              var opps = (prev.streets[0].cards.opponents || []).slice();
              opps[oppSlot2] = newVal;
              var streets = prev.streets.map(function(s, i) {
                return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: opps }) }) : s;
              });
              return Object.assign({}, prev, { streets });
            });
          }
        } else {
          if (oppParsed.length >= sdMaxCards) return;
          if (isStudShowdown) {
            setHand(function(prev) {
              var opps = (prev.streets[0].cards.opponents || []).slice();
              opps[oppSlot2] = card + (opps[oppSlot2] || "");
              var streets = prev.streets.map(function(s, i) {
                return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: opps }) }) : s;
              });
              return Object.assign({}, prev, { streets });
            });
          } else {
            var newVal = oppCardStr2 + card;
            setHand(function(prev) {
              var opps = (prev.streets[0].cards.opponents || []).slice();
              opps[oppSlot2] = newVal;
              var streets = prev.streets.map(function(s, i) {
                return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: opps }) }) : s;
              });
              return Object.assign({}, prev, { streets });
            });
          }
        }
      }, "toggleSdCard");
      var setMuck = /* @__PURE__ */ __name(function() {
        setHand(function(prev) {
          var opps = (prev.streets[0].cards.opponents || []).slice();
          opps[oppSlot2] = "MUCK";
          var streets = prev.streets.map(function(s, i) {
            return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: opps }) }) : s;
          });
          return Object.assign({}, prev, { streets });
        });
      }, "setMuck");
      var clearOppCards = /* @__PURE__ */ __name(function() {
        if (isStudShowdown) {
          setHand(function(prev) {
            var streets = prev.streets.map(function(s) {
              var opps = (s.cards.opponents || []).slice();
              opps[oppSlot2] = "";
              return Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: opps }) });
            });
            return Object.assign({}, prev, { streets });
          });
        } else {
          setHand(function(prev) {
            var opps = (prev.streets[0].cards.opponents || []).slice();
            opps[oppSlot2] = "";
            var streets = prev.streets.map(function(s, i) {
              return i === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { opponents: opps }) }) : s;
            });
            return Object.assign({}, prev, { streets });
          });
        }
      }, "clearOppCards");
      return /* @__PURE__ */ React.createElement("div", { key: o.idx, className: "gto-phase-card", style: { marginTop: "6px", opacity: isComplete && !isActiveOpp ? 0.6 : 1 } }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "replayer-player-pos", style: { marginRight: "6px" } }, o.player.position), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Univers Condensed','Univers',sans-serif", fontSize: "0.8rem", fontWeight: 600, color: "var(--text)" } }, o.player.name)), isMucked ? /* @__PURE__ */ React.createElement("button", { className: "gto-undo-btn", onClick: clearOppCards, style: { fontSize: "0.6rem" } }, "Undo Muck") : isComplete ? /* @__PURE__ */ React.createElement("button", { className: "gto-undo-btn", onClick: clearOppCards, style: { fontSize: "0.6rem" } }, "Clear") : /* @__PURE__ */ React.createElement("button", { className: "gto-undo-btn", onClick: setMuck, style: { fontSize: "0.6rem" } }, "Muck")), isMucked ? /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "8px 0", fontFamily: "'Univers Condensed','Univers',sans-serif", fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" } }, "Mucked") : /* @__PURE__ */ React.createElement(React.Fragment, null, oppParsed.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { margin: "4px 0" } }, /* @__PURE__ */ React.createElement(CardRow, { text: oppCardStr2, stud: isStudShowdown, max: sdMaxCards }), isStudShowdown && studMissingCount > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.6rem", color: "var(--text-muted)", marginTop: "2px" } }, studKnownCount, " known cards, ", studMissingCount, " hidden card", studMissingCount !== 1 ? "s" : "", " remaining")), !isComplete && /* @__PURE__ */ React.createElement("div", { className: "card-picker-grid" }, sdAllSuits.map(function(suit) {
        return React.createElement(
          React.Fragment,
          { key: suit.key },
          sdAllRanks.map(function(rank) {
            var card = rank + suit.key;
            var isUsedByOther = thisUsed.has(card);
            var isSelected = oppCardSet.has(card);
            var cls = "card-picker-btn" + (isSelected ? " selected" : "") + (isUsedByOther ? " used" : "");
            return React.createElement("button", {
              key: card,
              className: cls,
              onClick: /* @__PURE__ */ __name(function() {
                toggleSdCard(card);
              }, "onClick")
            }, React.createElement("img", {
              src: "/cards/cards_gui_" + rank + suit.key + ".svg",
              alt: card,
              loading: "eager"
            }));
          })
        );
      })))));
    }), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", justifyContent: "flex-end", padding: "10px 0" } }, /* @__PURE__ */ React.createElement("button", { className: "gto-undo-btn", onClick: undoLastAction }, "Undo"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary btn-sm", onClick: function() {
      var playerHands = [];
      var isDrawShowdown = category === "draw_triple" || category === "draw_single";
      var heroCardStr;
      if (isStudShowdown) {
        heroCardStr = getStudHeroAllCards();
      } else if (isDrawShowdown) {
        var heroBase = hand.streets[0].cards.hero || "";
        var heroDraws = getPlayerDrawsByStreet(hand, heroIdx);
        heroCardStr = computeDrawHand(heroBase, heroDraws, hand.streets.length - 1);
      } else {
        heroCardStr = hand.streets[0].cards.hero || "";
      }
      var heroParsed = parseCardNotation(heroCardStr).filter(function(c) {
        return c.suit !== "x";
      });
      if (heroParsed.length > 0) {
        playerHands.push({ idx: heroIdx, cards: heroParsed });
      }
      showdownPlayers.forEach(function(o) {
        var oppSlot2 = o.idx > heroIdx ? o.idx - 1 : o.idx;
        var oppStr = getOppCardStr(oppSlot2);
        if (oppStr === "MUCK" || !oppStr) return;
        var oppParsed = parseCardNotation(oppStr).filter(function(c) {
          return c.suit !== "x";
        });
        if (oppParsed.length > 0) {
          playerHands.push({ idx: o.idx, cards: oppParsed });
        }
      });
      var fullBoardStr = "";
      hand.streets.forEach(function(s) {
        if (s.cards.board) fullBoardStr += s.cards.board;
      });
      var boardParsed = parseCardNotation(fullBoardStr).filter(function(c) {
        return c.suit !== "x";
      });
      if (playerHands.length === 1) {
        setHand(function(prev) {
          return Object.assign({}, prev, { result: Object.assign({}, prev.result, { winners: [{ playerIdx: playerHands[0].idx, split: false }] }) });
        });
      } else if (playerHands.length > 1) {
        var winners = evaluateShowdown(hand.gameType, playerHands, boardParsed);
        var _ec = GAME_EVAL[hand.gameType];
        if (_ec && _ec.type === "hilo" && winners.some(function(w) {
          return w.split;
        })) {
          var _hs = {};
          var _ls = {};
          playerHands.forEach(function(ph) {
            var al = boardParsed.length ? ph.cards.concat(boardParsed) : ph.cards;
            _hs[ph.idx] = _ec.method === "omaha" ? bestOmahaHigh(ph.cards, boardParsed) : bestHighHand(al);
            var lo = _ec.method === "omaha" ? bestOmahaLow(ph.cards, boardParsed) : bestLowA5Hand(al, true);
            _ls[ph.idx] = lo && lo.qualified ? lo : null;
          });
          var _bh = -1;
          var _bl = Infinity;
          Object.keys(_hs).forEach(function(k) {
            if (_hs[k] && _hs[k].score > _bh) _bh = _hs[k].score;
          });
          Object.keys(_ls).forEach(function(k) {
            if (_ls[k] && _ls[k].score < _bl) _bl = _ls[k].score;
          });
          winners = winners.map(function(w) {
            var lb = [];
            if (_hs[w.playerIdx] && _hs[w.playerIdx].score === _bh) lb.push("Hi: " + (_hs[w.playerIdx].shortName || _hs[w.playerIdx].name));
            if (_ls[w.playerIdx] && _ls[w.playerIdx].score === _bl) lb.push("Lo: " + _ls[w.playerIdx].name);
            if (lb.length) return Object.assign({}, w, { label: hand.players[w.playerIdx].name + " wins " + lb.join(", ") });
            return w;
          });
        }
        if (winners.length > 0) {
          setHand(function(prev) {
            return Object.assign({}, prev, { result: Object.assign({}, prev.result, { winners }) });
          });
        }
      }
      setPhase("result");
    } }, "Continue to Result")));
  }
  if (phase === "result") {
    var autoWinner = handOver && activePlayers.length === 1 ? hand.players.indexOf(activePlayers[0]) : -1;
    return /* @__PURE__ */ React.createElement("div", { className: "gto-entry" }, /* @__PURE__ */ React.createElement("div", { className: "gto-phase-card" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section-title" }, "Result"), autoWinner >= 0 ? /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "12px", fontFamily: "'Univers Condensed','Univers',sans-serif" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.9rem", color: "#4ade80", fontWeight: 700 } }, hand.players[autoWinner].name, " wins"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "4px" } }, "All opponents folded")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" } }, hand.players.filter(function(_, i) {
      return !foldedSet.has(i);
    }).map(function(p) {
      var pi = hand.players.indexOf(p);
      var winners = hand.result && hand.result.winners || [];
      var isWinner = winners.some(function(w) {
        return w.playerIdx === pi && !w.split;
      });
      var isSplit = winners.some(function(w) {
        return w.playerIdx === pi && w.split;
      });
      return /* @__PURE__ */ React.createElement("button", { key: pi, style: {
        flex: "1 1 0",
        padding: "8px 14px",
        borderRadius: "6px",
        border: "1.5px solid",
        cursor: "pointer",
        fontFamily: "'Univers Condensed','Univers',sans-serif",
        fontSize: "0.75rem",
        fontWeight: 600,
        transition: "all 0.15s",
        background: isWinner ? "rgba(74,222,128,0.15)" : isSplit ? "rgba(250,204,21,0.15)" : "transparent",
        borderColor: isWinner ? "#4ade80" : isSplit ? "#facc15" : "var(--border)",
        color: isWinner ? "#4ade80" : isSplit ? "#facc15" : "var(--text-muted)"
      }, onClick: function() {
        setHand(function(prev) {
          var prevWinners = prev.result && prev.result.winners || [];
          var existing = prevWinners.find(function(w) {
            return w.playerIdx === pi;
          });
          var newWinners;
          if (!existing) newWinners = prevWinners.concat([{ playerIdx: pi, split: false, label: "" }]);
          else if (!existing.split) newWinners = prevWinners.map(function(w) {
            return w.playerIdx === pi ? Object.assign({}, w, { split: true }) : w;
          });
          else newWinners = prevWinners.filter(function(w) {
            return w.playerIdx !== pi;
          });
          return Object.assign({}, prev, { result: Object.assign({}, prev.result, { winners: newWinners }) });
        });
      } }, p.name, " ", isWinner ? "(Win)" : isSplit ? "(Split)" : "");
    })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.55rem", color: "var(--text-muted)", marginTop: "4px", fontFamily: "'Univers Condensed','Univers',sans-serif" } }, hand.result && hand.result.winners && hand.result.winners.length ? "Auto-evaluated • " : "", "Tap to cycle: none → win → split → none")))), /* @__PURE__ */ React.createElement("div", { className: "gto-street-card" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", justifyContent: "flex-end", padding: "10px 12px" } }, /* @__PURE__ */ React.createElement("button", { className: "gto-undo-btn", onClick: undoLastAction }, "Undo"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary btn-sm", onClick: function() {
      var savedHand = Object.assign({}, hand, { heroIdx });
      if (autoWinner >= 0 && !(hand.result && hand.result.winners && hand.result.winners.length)) {
        onDone(Object.assign(savedHand, { result: { winners: [{ playerIdx: autoWinner, split: false, label: "" }] } }));
      } else {
        onDone(savedHand);
      }
    } }, "Save & Replay"))));
  }
  var stickySlot = document.getElementById("gto-sticky-slot");
  var streetCardEl = React.createElement(
    "div",
    { className: "gto-street-card", style: { marginTop: "6px" } },
    React.createElement(
      "div",
      { className: "gto-street-bar" },
      React.createElement("span", { className: "gto-street-name" }, currentStreet.name),
      category === "community" && cumulativeBoard ? React.createElement(
        "span",
        { className: "gto-board-inline" },
        React.createElement(CardRow, { text: cumulativeBoard, max: 5 })
      ) : null,
      React.createElement("span", { className: "gto-pot-label" }, formatChipAmount(currentPot))
    )
  );
  return /* @__PURE__ */ React.createElement("div", { className: "gto-entry" }, stickySlot && ReactDOM.createPortal(streetCardEl, stickySlot), seatOrder.map(function(i) {
    var p = hand.players[i];
    var isActive = i === currentActor;
    var act = playerActions[i];
    var isFolded = foldedSet.has(i);
    var foldedOnPriorStreet = isFolded && !(currentStreet.actions || []).some(function(a) {
      return a.player === i && a.action === "fold";
    });
    if (foldedOnPriorStreet && !isPreflop && category !== "stud") return null;
    var seatClass = "gto-seat" + (isActive ? " active" : "") + (isFolded ? " folded" : act && !isActive ? " acted-" + act.action : "");
    var actionLabel = act ? act.action.charAt(0).toUpperCase() + act.action.slice(1) + (act.amount > 0 ? " " + formatChipAmount(act.amount) : "") : "";
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        key: i,
        ref: isActive ? activeSeatRef : null,
        className: seatClass,
        onClick: !isActive && act ? function() {
          undoToPlayer(i);
        } : void 0,
        style: !isActive && act ? { cursor: "pointer" } : void 0
      },
      /* @__PURE__ */ React.createElement("div", { className: "gto-seat-strip" }, p.position),
      /* @__PURE__ */ React.createElement("div", { className: "gto-seat-content" }, /* @__PURE__ */ React.createElement("div", { className: "gto-seat-bar" }, /* @__PURE__ */ React.createElement("div", { className: "gto-seat-row1" }, /* @__PURE__ */ React.createElement("span", { className: "gto-seat-pos" }, p.position), /* @__PURE__ */ React.createElement("span", { className: "gto-seat-stack" }, formatChipAmount(currentStacks[i]))), /* @__PURE__ */ React.createElement("div", { className: "gto-seat-row2" }, /* @__PURE__ */ React.createElement("span", { className: "gto-seat-name" }, p.name), category === "stud" ? (function() {
        var isHero = i === heroIdx;
        var oppSlot2 = i < heroIdx ? i : i - 1;
        var accumulated = "";
        for (var si = 0; si <= currentStreetIdx; si++) {
          var st = hand.streets[si];
          if (!st) break;
          if (isHero) {
            accumulated += st.cards.hero || "";
          } else {
            accumulated += (st.cards.opponents || [])[oppSlot2] || "";
          }
        }
        var dimStyle = isFolded ? { opacity: 0.4, filter: "grayscale(60%)" } : {};
        if (!isHero) {
          var oppVisible = parseCardNotation(accumulated).filter(function(c) {
            return c.suit !== "x";
          });
          if (isFolded) {
            if (oppVisible.length === 0) return null;
            return /* @__PURE__ */ React.createElement("span", { className: "gto-seat-hero-cards", style: dimStyle }, /* @__PURE__ */ React.createElement("div", { className: "card-row", style: { gap: "2px", flexWrap: "nowrap" } }, oppVisible.map(function(c, ci) {
              return /* @__PURE__ */ React.createElement("img", { key: ci, className: "card-img", src: "/cards/cards_gui_" + c.rank + c.suit + ".svg", alt: c.rank + c.suit, loading: "eager" });
            })));
          }
          var downAfter = currentStreetIdx >= 4 ? 1 : 0;
          return /* @__PURE__ */ React.createElement("span", { className: "gto-seat-hero-cards" }, /* @__PURE__ */ React.createElement("div", { className: "card-row", style: { gap: "2px", flexWrap: "nowrap" } }, /* @__PURE__ */ React.createElement("div", { className: "card-unknown", style: { marginTop: 8 } }), /* @__PURE__ */ React.createElement("div", { className: "card-unknown", style: { marginTop: 8 } }), oppVisible.map(function(c, ci) {
            return /* @__PURE__ */ React.createElement("img", { key: ci, className: "card-img", src: "/cards/cards_gui_" + c.rank + c.suit + ".svg", alt: c.rank + c.suit, loading: "eager" });
          }), downAfter > 0 && /* @__PURE__ */ React.createElement("div", { className: "card-unknown", style: { marginTop: 8 } })));
        }
        if (!accumulated) return null;
        return /* @__PURE__ */ React.createElement("span", { className: "gto-seat-hero-cards", style: dimStyle }, /* @__PURE__ */ React.createElement(CardRow, { text: accumulated, stud: true, max: 7 }));
      })() : (function() {
        if (i !== heroIdx) return null;
        var isDrawGame = category === "draw_triple" || category === "draw_single";
        var baseCards = "";
        if (hand.streets[0]) baseCards = hand.streets[0].cards.hero || "";
        if (!baseCards) return null;
        var displayCards = isDrawGame ? computeDrawHand(baseCards, getPlayerDrawsByStreet(hand, i), currentStreetIdx - 1) : baseCards;
        return /* @__PURE__ */ React.createElement("span", { className: "gto-seat-hero-cards" }, /* @__PURE__ */ React.createElement(CardRow, { text: displayCards, max: gameCfg.heroCards || 2 }));
      })(), (category === "draw_triple" || category === "draw_single") && (function() {
        var dh = [];
        for (var si = 0; si < currentStreetIdx; si++) {
          var ps = hand.streets[si];
          if (!ps || !ps.draws || !ps.draws.length) continue;
          var pd = ps.draws.find(function(d) {
            return d.player === i;
          });
          if (pd) dh.push(pd.discarded === 0 ? "Pat" : "D" + pd.discarded);
        }
        if (dh.length === 0) return null;
        return /* @__PURE__ */ React.createElement("span", { className: "gto-seat-draw-history" }, dh.join(" / "));
      })(), act && !isActive && /* @__PURE__ */ React.createElement("span", { className: "gto-seat-result-badge " + act.action }, actionLabel))), /* @__PURE__ */ React.createElement("div", { className: "gto-seat-detail-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "gto-seat-detail-inner" }, /* @__PURE__ */ React.createElement("div", { className: "gto-seat-detail" }, i === heroIdx && isActive && !gameCfg.isStud && (function() {
        var hcBase = hand.streets[0] && hand.streets[0].cards.hero || "";
        var isDrawGame = category === "draw_triple" || category === "draw_single";
        var hcDisplay = isDrawGame ? computeDrawHand(hcBase, getPlayerDrawsByStreet(hand, i), currentStreetIdx - 1) : hcBase;
        var hcParsed = parseCardNotation(hcDisplay);
        var hcSet = new Set(hcParsed.map(function(c) {
          return c.rank + c.suit;
        }));
        var hcMaxCards = gameCfg.heroCards || 2;
        var heroHasCards = hcParsed.length >= hcMaxCards;
        var pickerOpen = showHeroCardPicker || !heroHasCards;
        if (!pickerOpen) return null;
        var hcRanks = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
        var hcSuits = [
          { key: "h", color: "#ef4444" },
          { key: "d", color: "#3b82f6" },
          { key: "c", color: "#22c55e" },
          { key: "s", color: "var(--text)" }
        ];
        var toggleCard2 = /* @__PURE__ */ __name(function(card) {
          setHand(function(prev) {
            var base = prev.streets[0] && prev.streets[0].cards.hero || "";
            var curParsed = parseCardNotation(base);
            var curSet = new Set(curParsed.map(function(c) {
              return c.rank + c.suit;
            }));
            if (curSet.has(card)) {
              var newCards = curParsed.filter(function(c) {
                return c.rank + c.suit !== card;
              }).map(function(c) {
                return c.rank + c.suit;
              }).join("");
            } else {
              if (curParsed.length >= hcMaxCards) return prev;
              var newCards = base + card;
            }
            var streets = prev.streets.map(function(s, si) {
              return si === 0 ? Object.assign({}, s, { cards: Object.assign({}, s.cards, { hero: newCards }) }) : s;
            });
            return Object.assign({}, prev, { streets });
          });
        }, "toggleCard");
        return /* @__PURE__ */ React.createElement("div", { style: { padding: "6px 8px", borderBottom: heroHasCards ? "1px solid var(--border)" : "none" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.65rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "4px", fontFamily: "'Univers Condensed','Univers',sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" } }, heroHasCards ? "Edit Cards" : "Select Your Cards"), /* @__PURE__ */ React.createElement("div", { className: "card-picker-grid", style: { gap: "3px" } }, hcSuits.map(function(suit) {
          return React.createElement(
            React.Fragment,
            { key: suit.key },
            hcRanks.map(function(rank) {
              var card = rank + suit.key;
              var isSelected = hcSet.has(card);
              var cls = "card-picker-btn" + (isSelected ? " selected" : "");
              return React.createElement("button", {
                key: card,
                className: cls,
                onClick: /* @__PURE__ */ __name(function() {
                  toggleCard2(card);
                }, "onClick")
              }, React.createElement("img", {
                src: "/cards/cards_gui_" + rank + suit.key + ".svg",
                alt: card,
                loading: "eager"
              }));
            })
          );
        })));
      })(), gameCfg.isStud && currentStreetIdx === 0 && studInfo && studInfo.bringInIdx === currentActor && !(currentStreet.actions || []).length ? /* @__PURE__ */ React.createElement("div", { className: "gto-action-row" }, /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
        addAction("bring-in", bringInAmount);
      } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon call" }, "⬤"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "Bring In ", formatChipAmount(bringInAmount))), /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
        addAction("bet", Math.min(flBetSize, playerStack));
      } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon raise" }, "▲"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "Complete ", formatChipAmount(Math.min(flBetSize, playerStack))))) : gameCfg.isStud && currentStreetIdx === 0 && (currentStreet.actions || []).length > 0 && streetBets.maxBet <= bringInAmount && streetBetRaiseCount === 0 ? (
        /* ── Stud 3rd street after bring-in: anyone can "complete" to full small bet ── */
        /* Applies to all stud betting types (limit, pot-limit, no-limit) */
        /* @__PURE__ */ React.createElement("div", { className: "gto-action-row" }, /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          addAction("fold");
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon fold" }, "✕"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "Fold")), /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          addAction("call", Math.min(callAmount, playerStack));
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon call" }, "⬤"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "Call ", formatChipAmount(Math.min(callAmount, playerStack)))), /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          var completeAmt = Math.min(flBetSize - playerContrib, playerStack);
          addAction("bet", completeAmt);
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon raise" }, "▲"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "Complete ", formatChipAmount(Math.min(flBetSize, playerStack + playerContrib)))), !isLimitGame && playerStack > flBetSize - playerContrib && /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          setShowRaiseInput(true);
          setBetAmount(String(Math.min(flBetSize - playerContrib, playerStack)));
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon raise" }, "▲"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "Raise")))
      ) : isLimitGame ? (
        /* ── Fixed Limit: no amount input, fixed bet/raise sizes ── */
        /* @__PURE__ */ React.createElement("div", { className: "gto-action-row" }, !canCheck && /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          addAction("fold");
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon fold" }, "✕"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "Fold")), canCheck ? /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          addAction("check");
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon check" }, "✓"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "Check")) : /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          addAction("call", Math.min(callAmount, playerStack));
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon call" }, "⬤"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "Call ", formatChipAmount(Math.min(callAmount, playerStack)))), flCanRaise && playerStack > callAmount && (canCheck ? /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          addAction("bet", Math.min(flBetSize, playerStack));
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon raise" }, "▲"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "Bet ", formatChipAmount(Math.min(flBetSize, playerStack)))) : /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          addAction("raise", Math.min(flRaiseIncrement, playerStack));
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon raise" }, "▲"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "Raise to ", formatChipAmount(Math.min(flRaiseToTotal, playerStack + playerContrib))))))
      ) : isPotLimit ? (
        /* ── Pot Limit: sizing capped at pot ── */
        /* @__PURE__ */ React.createElement(React.Fragment, null, !showRaiseInput && /* @__PURE__ */ React.createElement("div", { className: "gto-action-row" }, !canCheck && /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          addAction("fold");
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon fold" }, "✕"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "Fold")), canCheck ? /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          addAction("check");
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon check" }, "✓"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "Check")) : /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          addAction("call", Math.min(callAmount, playerStack));
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon call" }, "⬤"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "Call ", formatChipAmount(Math.min(callAmount, playerStack)))), playerStack > callAmount && /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          var container = document.querySelector(".content-area");
          if (container) {
            var savedTop = container.scrollTop;
            var lock = /* @__PURE__ */ __name(function() {
              container.scrollTop = savedTop;
            }, "lock");
            container.addEventListener("scroll", lock);
            setTimeout(function() {
              container.removeEventListener("scroll", lock);
            }, 500);
          }
          setShowRaiseInput(true);
          var plMinBet = Math.min((hand.blinds || {}).bb || 0, playerStack);
          var plMinRaise = Math.min(minRaiseIncrement, playerStack);
          setBetAmount(String(canCheck ? plMinBet : plMinRaise));
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon raise" }, "▲"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, canCheck ? "Bet" : "Raise")), playerStack > callAmount && /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          var potIncrement = canCheck ? Math.min(plMaxBet, playerStack) : Math.min(plMaxRaiseIncrement, playerStack);
          addAction(canCheck ? "bet" : "raise", potIncrement);
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon raise" }, "▲"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "Pot ", formatChipAmount(Math.min(canCheck ? plMaxBet : plRaiseToTotal, playerStack + playerContrib))))), showRaiseInput && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "gto-sizing-row" }, [{ label: "Min", mult: 0 }, { label: "1/3", mult: 1 / 3 }, { label: "1/2", mult: 1 / 2 }, { label: "2/3", mult: 2 / 3 }, { label: "Pot", mult: 1 }].map(function(s) {
          var pillAmt;
          if (canCheck) {
            pillAmt = s.mult === 0 ? Math.min((hand.blinds || {}).bb || 0, playerStack) : Math.min(Math.round(plMaxBet * s.mult), playerStack);
          } else {
            if (s.mult === 0) {
              pillAmt = Math.min(minRaiseIncrement, playerStack);
            } else {
              var raiseSize = Math.round(plPotAfterCall * s.mult);
              var totalIncrement = callAmount + raiseSize;
              pillAmt = Math.max(Math.min(totalIncrement, plMaxRaiseIncrement, playerStack), Math.min(minRaiseIncrement, playerStack));
            }
          }
          return /* @__PURE__ */ React.createElement("button", { key: s.label, className: "gto-sizing-pill", onClick: function() {
            setBetAmount(String(pillAmt));
          } }, s.label);
        })), /* @__PURE__ */ React.createElement("div", { className: "gto-raise-slider-row" }, /* @__PURE__ */ React.createElement("input", { type: "range", className: "gto-raise-slider", min: canCheck ? Math.min((hand.blinds || {}).bb || 0, playerStack) : Math.min(minRaiseIncrement, playerStack), max: canCheck ? Math.min(plMaxBet, playerStack) : Math.min(plMaxRaiseIncrement, playerStack), step: 1, value: Number(betAmount) || 0, onChange: function(e) {
          setBetAmount(e.target.value);
        } })), /* @__PURE__ */ React.createElement("div", { className: "gto-raise-input-row" }, /* @__PURE__ */ React.createElement("input", { type: "text", inputMode: "decimal", value: betAmount, onChange: function(e) {
          setBetAmount(e.target.value);
        }, autoFocus: true }), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary btn-sm", onClick: function() {
          var inputAmt = Number(betAmount) || 0;
          var maxIncrement = canCheck ? Math.min(plMaxBet, playerStack) : Math.min(plMaxRaiseIncrement, playerStack);
          var amt = Math.min(inputAmt, maxIncrement);
          if (amt > 0) addAction(canCheck ? "bet" : "raise", amt);
        } }, "Confirm"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: function() {
          var container = document.querySelector(".content-area");
          if (container) {
            var savedTop = container.scrollTop;
            var lock = /* @__PURE__ */ __name(function() {
              container.scrollTop = savedTop;
            }, "lock");
            container.addEventListener("scroll", lock);
            setTimeout(function() {
              container.removeEventListener("scroll", lock);
            }, 500);
          }
          setShowRaiseInput(false);
        } }, "Cancel"))))
      ) : (
        /* ── No Limit: original behavior ── */
        /* @__PURE__ */ React.createElement(React.Fragment, null, !showRaiseInput && /* @__PURE__ */ React.createElement("div", { className: "gto-action-row" }, !canCheck && /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          addAction("fold");
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon fold" }, "✕"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "Fold")), canCheck ? /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          addAction("check");
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon check" }, "✓"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "Check")) : /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          addAction("call", Math.min(callAmount, playerStack));
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon call" }, "⬤"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "Call ", formatChipAmount(Math.min(callAmount, playerStack)))), /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          var container = document.querySelector(".content-area");
          if (container) {
            var savedTop = container.scrollTop;
            var lock = /* @__PURE__ */ __name(function() {
              container.scrollTop = savedTop;
            }, "lock");
            container.addEventListener("scroll", lock);
            setTimeout(function() {
              container.removeEventListener("scroll", lock);
            }, 500);
          }
          setShowRaiseInput(true);
          setBetAmount(String(canCheck ? (hand.blinds || {}).bb || 0 : Math.min(minRaiseIncrement, playerStack)));
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon raise" }, "▲"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, canCheck ? "Bet" : "Raise")), /* @__PURE__ */ React.createElement("button", { className: "gto-action-btn", onClick: function() {
          addAction(canCheck ? "bet" : "raise", playerStack);
        } }, /* @__PURE__ */ React.createElement("span", { className: "gto-action-icon allin" }, "★"), /* @__PURE__ */ React.createElement("span", { className: "gto-action-label" }, "All-in"))), showRaiseInput && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "gto-sizing-row" }, [{ label: "Min", mult: 0 }, { label: "1/3", mult: 1 / 3 }, { label: "1/2", mult: 1 / 2 }, { label: "2/3", mult: 2 / 3 }, { label: "Pot", mult: 1 }].map(function(s) {
          var pillAmt;
          if (canCheck) {
            pillAmt = s.mult === 0 ? Math.min((hand.blinds || {}).bb || 0, playerStack) : Math.min(Math.round(currentPot * s.mult), playerStack);
          } else {
            if (s.mult === 0) {
              pillAmt = Math.min(minRaiseIncrement, playerStack);
            } else {
              var potAfterCall = currentPot + callAmount;
              var raiseSize = Math.round(potAfterCall * s.mult);
              pillAmt = Math.min(callAmount + raiseSize, playerStack);
            }
          }
          return /* @__PURE__ */ React.createElement("button", { key: s.label, className: "gto-sizing-pill", onClick: function() {
            setBetAmount(String(pillAmt));
          } }, s.label);
        }), /* @__PURE__ */ React.createElement("button", { className: "gto-sizing-pill", onClick: function() {
          setBetAmount(String(playerStack));
        } }, "All-In")), /* @__PURE__ */ React.createElement("div", { className: "gto-raise-slider-row" }, /* @__PURE__ */ React.createElement("input", { type: "range", className: "gto-raise-slider", min: canCheck ? Math.min((hand.blinds || {}).bb || 0, playerStack) : Math.min(minRaiseIncrement, playerStack), max: playerStack, step: 1, value: Number(betAmount) || 0, onChange: function(e) {
          setBetAmount(e.target.value);
        } })), /* @__PURE__ */ React.createElement("div", { className: "gto-raise-input-row" }, /* @__PURE__ */ React.createElement("input", { type: "text", inputMode: "decimal", value: betAmount, onChange: function(e) {
          setBetAmount(e.target.value);
        }, autoFocus: true }), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary btn-sm", onClick: function() {
          var amt = Math.min(Number(betAmount) || 0, playerStack);
          if (amt > 0) addAction(canCheck ? "bet" : "raise", amt);
        } }, "Confirm"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: function() {
          var container = document.querySelector(".content-area");
          if (container) {
            var savedTop = container.scrollTop;
            var lock = /* @__PURE__ */ __name(function() {
              container.scrollTop = savedTop;
            }, "lock");
            container.addEventListener("scroll", lock);
            setTimeout(function() {
              container.removeEventListener("scroll", lock);
            }, 500);
          }
          setShowRaiseInput(false);
        } }, "Cancel"))))
      )))))
    );
  }), ReactDOM.createPortal(
    /* @__PURE__ */ React.createElement("div", { className: "gto-sticky-footer" }, /* @__PURE__ */ React.createElement("div", { className: "gto-street-card" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "6px", justifyContent: "space-between", alignItems: "center", padding: "10px 12px" } }, /* @__PURE__ */ React.createElement("button", { className: "gto-undo-btn", onClick: undoLastAction }, "Undo"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: onCancel }, "Cancel Hand")))),
    document.body
  ));
}
__name(GTOEntryView, "GTOEntryView");
function HandReplayerView({ token, heroName, cardSplay, initialHand, onClearInitialHand }) {
  const [mode, setMode] = useState(initialHand ? "replay" : "list");
  const [entryMode, setEntryMode] = useState("gto");
  const [savedHands, setSavedHands] = useState([]);
  const [currentHand, setCurrentHand] = useState(initialHand || null);
  const [currentHandId, setCurrentHandId] = useState(null);
  const [selectedGameType, setSelectedGameType] = useState("NLH");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customGameName, setCustomGameName] = useState("");
  const [customHeroCards, setCustomHeroCards] = useState(2);
  const [customCategory, setCustomCategory] = useState("community");
  const [customStreetNames, setCustomStreetNames] = useState("");
  const [bettingStructure, setBettingStructure] = useState("No Limit");
  const [selectedGame, setSelectedGame] = useState("Hold'em");
  const variantDisplayName = useMemo(() => {
    const overrides = {
      "Pot Limit|Omaha 8/b": "PLO8",
      "Pot Limit|Omaha": "Pot Limit Omaha",
      "Pot Limit|Big O": "Big O",
      "No Limit|Omaha": "No Limit Omaha",
      "No Limit|Omaha 8/b": "No Limit Omaha 8/b",
      "No Limit|Big O": "No Limit Big O",
      "Limit|Omaha": "Limit Omaha Hi",
      "Limit|Omaha 8/b": "O8",
      "Limit|Big O": "Limit Big O"
    };
    var key = bettingStructure + "|" + selectedGame;
    if (overrides[key]) return overrides[key];
    var typicallyLimit = ["Stud Hi", "Stud 8", "Razz", "2-7 Triple Draw", "A-5 Triple Draw", "Badugi", "Badeucy", "Badacey", "Archie", "Ari"];
    if (typicallyLimit.indexOf(selectedGame) >= 0 && bettingStructure === "Limit") return selectedGame;
    return bettingStructure + " " + selectedGame;
  }, [bettingStructure, selectedGame]);
  var _nlPlStudTypes = ["NL Stud Hi", "NL Stud 8", "NL Razz", "PL Stud Hi", "PL Stud 8", "PL Razz"];
  const gameTypes = Object.keys(HAND_CONFIG).filter((k) => k !== "OFC Pineapple" && k !== "OFC" && _nlPlStudTypes.indexOf(k) < 0);
  const fetchHands = /* @__PURE__ */ __name(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/hands`, {
        headers: { Authorization: "Bearer " + token }
      });
      if (res.ok) setSavedHands(await res.json());
    } catch (e) {
      console.error("Failed to load hands:", e);
    }
  }, "fetchHands");
  useEffect(() => {
    fetchHands();
  }, [token]);
  useEffect(() => {
    if (initialHand) {
      setCurrentHand(initialHand);
      setMode("replay");
      setTitle("");
      setNotes("");
      if (onClearInitialHand) onClearInitialHand();
    }
  }, [initialHand]);
  var structureGameMap = {
    "No Limit": { "Hold'em": "NLH", "Pineapple": "NLH", "Short Deck": "NLH", "Omaha": "PLO", "Omaha 8/b": "PLO8", "Big O": "Big O", "Stud Hi": "NL Stud Hi", "Stud 8": "NL Stud 8", "Razz": "NL Razz", "2-7 Triple Draw": "2-7 TD", "2-7 Single Draw": "NL 2-7 SD", "A-5 Triple Draw": "A-5 TD", "A-5 Single Draw": "A-5 TD", "Badugi": "Badugi", "Badeucy": "Badeucy", "Badacey": "Badacy", "Archie": "Badugi", "Ari": "Badugi", "5-Card Draw": "PL 5CD Hi", "OFC": "OFC" },
    "Pot Limit": { "Hold'em": "PLH", "Pineapple": "PLH", "Short Deck": "PLH", "Omaha": "PLO", "Omaha 8/b": "PLO8", "Big O": "Big O", "Stud Hi": "PL Stud Hi", "Stud 8": "PL Stud 8", "Razz": "PL Razz", "2-7 Triple Draw": "PL 2-7 TD", "2-7 Single Draw": "NL 2-7 SD", "A-5 Triple Draw": "A-5 TD", "A-5 Single Draw": "A-5 TD", "Badugi": "Badugi", "Badeucy": "Badeucy", "Badacey": "Badacy", "Archie": "Badugi", "Ari": "Badugi", "5-Card Draw": "PL 5CD Hi", "OFC": "OFC" },
    "Limit": { "Hold'em": "LHE", "Pineapple": "LHE", "Short Deck": "LHE", "Omaha": "O8", "Omaha 8/b": "O8", "Big O": "Big O", "Stud Hi": "Stud Hi", "Stud 8": "Stud 8", "Razz": "Razz", "2-7 Triple Draw": "2-7 TD", "2-7 Single Draw": "NL 2-7 SD", "A-5 Triple Draw": "A-5 TD", "A-5 Single Draw": "A-5 TD", "Badugi": "Badugi", "Badeucy": "Badeucy", "Badacey": "Badacy", "Archie": "Badugi", "Ari": "Badugi", "5-Card Draw": "PL 5CD Hi", "OFC": "OFC" }
  };
  var defaultStructure = {
    "Hold'em": "No Limit",
    "Pineapple": "No Limit",
    "Short Deck": "No Limit",
    "Omaha": "Pot Limit",
    "Omaha 8/b": "Pot Limit",
    "Big O": "Pot Limit",
    "Stud Hi": "Limit",
    "Stud 8": "Limit",
    "Razz": "Limit",
    "2-7 Triple Draw": "Limit",
    "2-7 Single Draw": "No Limit",
    "A-5 Triple Draw": "Limit",
    "A-5 Single Draw": "No Limit",
    "Badugi": "Limit",
    "Badeucy": "Limit",
    "Badacey": "Limit",
    "Archie": "Limit",
    "Ari": "Limit",
    "5-Card Draw": "No Limit",
    "OFC": "No Limit"
  };
  var handleGameSelect = /* @__PURE__ */ __name(function(game) {
    setSelectedGame(game);
    if (defaultStructure[game]) setBettingStructure(defaultStructure[game]);
    var map = structureGameMap[defaultStructure[game] || "No Limit"];
    if (map && map[game]) setSelectedGameType(map[game]);
  }, "handleGameSelect");
  var gameGroups = [
    { label: "Hold'em", games: ["Hold'em", "Pineapple", "Short Deck"] },
    { label: "Omaha", games: ["Omaha", "Omaha 8/b", "Big O"] },
    { label: "Stud", games: ["Stud Hi", "Stud 8", "Razz"] },
    { label: "Draw", games: ["2-7 Triple Draw", "2-7 Single Draw", "A-5 Triple Draw", "A-5 Single Draw", "Badugi", "Badeucy", "Badacey", "Archie", "Ari", "5-Card Draw"] },
    { label: "Chinese", games: ["OFC"] }
  ];
  var handleStructureChange = /* @__PURE__ */ __name(function(s) {
    setBettingStructure(s);
    var map = structureGameMap[s];
    if (map && map[selectedGame]) setSelectedGameType(map[selectedGame]);
  }, "handleStructureChange");
  const startNewHand = /* @__PURE__ */ __name(() => {
    if (selectedGameType === "Custom") {
      const gameName = customGameName.trim() || "Custom";
      const heroCards = Math.max(1, Math.min(13, customHeroCards));
      const cat = customCategory;
      const hasBoard = cat === "community";
      const isStud = cat === "stud";
      HAND_CONFIG[gameName] = { heroCards, hasBoard, boardMax: hasBoard ? 5 : 0, isStud, heroPlaceholder: "" };
      let streetNames;
      if (customStreetNames.trim()) {
        streetNames = customStreetNames.split(",").map((s) => s.trim()).filter(Boolean);
      } else {
        const def = STREET_DEFS[cat] || STREET_DEFS.community;
        streetNames = def.streets;
      }
      if (!STREET_DEFS["custom_" + gameName]) {
        const boardCards = streetNames.map((_, i) => {
          if (!hasBoard) return 0;
          if (i === 0) return 0;
          if (i === 1) return 3;
          return 1;
        });
        STREET_DEFS["custom_" + gameName] = { streets: streetNames, boardCards };
      }
      const origGetCat = getGameCategory;
      const origGetDef = getStreetDef;
      const customDef = STREET_DEFS["custom_" + gameName];
      const hand = {
        gameType: gameName,
        customConfig: { heroCards, category: cat, streetNames: customDef.streets, hasBoard, isStud },
        players: [
          { name: "Hero", position: "BTN", startingStack: 5e4 },
          { name: "Opp 1", position: "BB", startingStack: 5e4 }
        ],
        blinds: { sb: 100, bb: 200, ante: hasBoard && !isStud ? 200 : 0 },
        streets: customDef.streets.map((name) => ({
          name,
          cards: { hero: "", opponents: [""], board: "" },
          actions: [],
          draws: []
        })),
        result: null
      };
      setCurrentHand(hand);
    } else {
      setCurrentHand(createEmptyHand(selectedGameType, heroName));
    }
    setCurrentHandId(null);
    setTitle("");
    setNotes("");
    setIsPublic(false);
    setMode("entry");
  }, "startNewHand");
  const loadHand = /* @__PURE__ */ __name(async (handId) => {
    try {
      const res = await fetch(`${API_URL}/hands/${handId}`, {
        headers: { Authorization: "Bearer " + token }
      });
      if (res.ok) {
        const data = await res.json();
        const handData = typeof data.hand_data === "string" ? JSON.parse(data.hand_data) : data.hand_data;
        if (handData.gameType && !HAND_CONFIG[handData.gameType]) {
          const cc = handData.customConfig;
          if (cc) {
            HAND_CONFIG[handData.gameType] = {
              heroCards: cc.heroCards || 2,
              hasBoard: !!cc.hasBoard,
              boardMax: cc.hasBoard ? 5 : 0,
              isStud: !!cc.isStud,
              heroPlaceholder: ""
            };
            STREET_DEFS["custom_" + handData.gameType] = {
              streets: cc.streetNames || handData.streets.map((s) => s.name),
              boardCards: (cc.streetNames || handData.streets.map((s) => s.name)).map((_, i) => {
                if (!cc.hasBoard) return 0;
                if (i === 0) return 0;
                if (i === 1) return 3;
                return 1;
              })
            };
          } else {
            const streets = handData.streets || [];
            const hasBoard = streets.some((s) => {
              var _a;
              return (_a = s.cards) == null ? void 0 : _a.board;
            });
            HAND_CONFIG[handData.gameType] = { heroCards: 2, hasBoard, boardMax: hasBoard ? 5 : 0, isStud: false, heroPlaceholder: "" };
            STREET_DEFS["custom_" + handData.gameType] = {
              streets: streets.map((s) => s.name),
              boardCards: streets.map((_, i) => !hasBoard ? 0 : i === 0 ? 0 : i === 1 ? 3 : 1)
            };
          }
        }
        setCurrentHand(handData);
        setCurrentHandId(data.id);
        setTitle(data.title || "");
        setNotes(data.notes || "");
        setIsPublic(!!data.is_public);
        setMode("replay");
      }
    } catch (e) {
      console.error("Failed to load hand:", e);
    }
  }, "loadHand");
  const saveHand = /* @__PURE__ */ __name(async (hand) => {
    if (!token) return;
    setLoading(true);
    try {
      const payload = {
        handData: hand,
        gameType: hand.gameType,
        title: title || hand.gameType + " Hand",
        notes,
        isPublic
      };
      let res;
      if (currentHandId) {
        res = await fetch(`${API_URL}/hands/${currentHandId}`, {
          method: "PUT",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch(`${API_URL}/hands`, {
          method: "POST",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const data = await res.json();
          setCurrentHandId(data.id);
        }
      }
      fetchHands();
    } catch (e) {
      console.error("Failed to save hand:", e);
    }
    setLoading(false);
  }, "saveHand");
  const deleteHand = /* @__PURE__ */ __name(async (handId) => {
    if (!token) return;
    try {
      await fetch(`${API_URL}/hands/${handId}`, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token }
      });
      fetchHands();
    } catch (e) {
      console.error("Failed to delete hand:", e);
    }
  }, "deleteHand");
  const handleEntryDone = /* @__PURE__ */ __name((hand) => {
    setCurrentHand(hand);
    saveHand(hand);
    setMode("replay");
  }, "handleEntryDone");
  const renderGamePills = /* @__PURE__ */ __name(() => {
    const groups = [
      { label: "Community", games: ["NLH", "LHE", "PLH", "PLO", "PLO8", "O8", "Big O", "LO Hi"] },
      { label: "Draw", games: ["2-7 TD", "NL 2-7 SD", "PL 2-7 TD", "L 2-7 TD", "A-5 TD", "Badugi", "Badeucy", "Badacy", "PL 5CD Hi"] },
      { label: "Stud", games: ["Razz", "Stud Hi", "Stud 8", "Stud Hi-Lo", "2-7 Razz"] },
      { label: "Chinese", games: ["OFC"] }
    ];
    return React.createElement(
      React.Fragment,
      null,
      groups.map((g) => /* @__PURE__ */ React.createElement("div", { key: g.label, style: { marginBottom: "6px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.55rem", color: "var(--text-muted)", fontFamily: "'Univers Condensed','Univers',sans-serif", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "3px" } }, g.label), /* @__PURE__ */ React.createElement("div", { className: "hand-game-pill-row", style: { flexWrap: "wrap" } }, g.games.map((game) => /* @__PURE__ */ React.createElement("button", { key: game, className: selectedGameType === game ? "active" : "", onClick: () => setSelectedGameType(game) }, game))))),
      /* @__PURE__ */ React.createElement("div", { key: "custom", style: { marginBottom: "6px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.55rem", color: "var(--text-muted)", fontFamily: "'Univers Condensed','Univers',sans-serif", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "3px" } }, "Custom"), /* @__PURE__ */ React.createElement("div", { className: "hand-game-pill-row", style: { flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("button", { className: selectedGameType === "Custom" ? "active" : "", onClick: () => setSelectedGameType("Custom") }, "Custom Game")))
    );
  }, "renderGamePills");
  if (mode === "entry" && currentHand) {
    return /* @__PURE__ */ React.createElement("div", { className: "replayer-view" }, /* @__PURE__ */ React.createElement("div", { className: "gto-sticky-header", ref: (node) => {
      if (node) node._gtoStickyNode = node;
    } }, /* @__PURE__ */ React.createElement("div", { className: "replayer-header" }, /* @__PURE__ */ React.createElement("h2", null, "New Hand")), currentHand.gameType !== "OFC" && /* @__PURE__ */ React.createElement("div", { className: "live-update-tabs", style: { marginBottom: "8px" } }, /* @__PURE__ */ React.createElement("button", { className: entryMode === "gto" ? "active" : "", onClick: () => setEntryMode("gto") }, "GTO Style"), /* @__PURE__ */ React.createElement("button", { className: entryMode === "classic" ? "active" : "", onClick: () => setEntryMode("classic") }, "Classic")), /* @__PURE__ */ React.createElement("div", { className: "replayer-row", style: { marginBottom: "8px" } }, /* @__PURE__ */ React.createElement("div", { className: "replayer-field" }, /* @__PURE__ */ React.createElement("label", null, "Title"), /* @__PURE__ */ React.createElement("input", { type: "text", placeholder: "e.g. Huge pot with AA", value: title, onChange: (e) => setTitle(e.target.value) }))), /* @__PURE__ */ React.createElement("div", { id: "gto-sticky-slot" })), entryMode === "gto" || currentHand.gameType === "OFC" ? /* @__PURE__ */ React.createElement(
      GTOEntryView,
      {
        hand: currentHand,
        setHand: setCurrentHand,
        onDone: handleEntryDone,
        onCancel: () => setMode("list"),
        heroName
      }
    ) : /* @__PURE__ */ React.createElement(
      HandReplayerEntry,
      {
        hand: currentHand,
        setHand: setCurrentHand,
        onDone: handleEntryDone,
        onCancel: () => setMode("list")
      }
    ));
  }
  if (mode === "replay" && currentHand) {
    return /* @__PURE__ */ React.createElement("div", { className: "replayer-view" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-header" }, /* @__PURE__ */ React.createElement("h2", null, title || currentHand.gameType + " Hand"), /* @__PURE__ */ React.createElement("span", { className: "replayer-hand-card-game" }, currentHand.gameType + (currentHand.blinds ? " " + formatChipAmount(currentHand.blinds.sb) + "/" + formatChipAmount(currentHand.blinds.bb) + (currentHand.blinds.ante ? "/" + formatChipAmount(currentHand.blinds.ante) : "") : ""))), notes && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "8px" } }, notes), /* @__PURE__ */ React.createElement(
      HandReplayerReplay,
      {
        hand: currentHand,
        onEdit: () => setMode("entry"),
        onBack: () => {
          setMode("list");
          fetchHands();
        },
        cardSplay
      }
    ));
  }
  return /* @__PURE__ */ React.createElement("div", { className: "replayer-view" }, /* @__PURE__ */ React.createElement("div", { className: "replayer-header" }, /* @__PURE__ */ React.createElement("h2", null, "Hand Replayer")), /* @__PURE__ */ React.createElement("div", { className: "replayer-section", style: { marginBottom: "12px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" } }, /* @__PURE__ */ React.createElement("div", { className: "replayer-section-title" }, "New Hand"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "0.7rem", color: "var(--accent2)", fontFamily: "'Univers Condensed','Univers',sans-serif", fontWeight: 600 } }, variantDisplayName)), [
    [{ label: "NLH", struct: "No Limit", game: "Hold'em" }, { label: "LHE", struct: "Limit", game: "Hold'em" }],
    [{ label: "PLO", struct: "Pot Limit", game: "Omaha" }, { label: "O8", struct: "Limit", game: "Omaha 8/b" }, { label: "PLO8", struct: "Pot Limit", game: "Omaha 8/b" }, { label: "Big O", struct: "Pot Limit", game: "Big O" }],
    [{ label: "Stud Hi", struct: "Limit", game: "Stud Hi" }, { label: "Stud 8", struct: "Limit", game: "Stud 8" }, { label: "Razz", struct: "Limit", game: "Razz" }],
    [{ label: "2-7 TD", struct: "Limit", game: "2-7 Triple Draw" }, { label: "NL 2-7 SD", struct: "No Limit", game: "2-7 Single Draw" }, { label: "Badugi", struct: "Limit", game: "Badugi" }]
  ].map((row, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "hand-game-pill-row", style: { marginBottom: "4px" } }, row.map((q) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: q.label,
      className: selectedGame === q.game && bettingStructure === q.struct ? "active" : "",
      onClick: () => {
        setBettingStructure(q.struct);
        setSelectedGame(q.game);
        handleStructureChange(q.struct);
        setSelectedGame(q.game);
        var m = structureGameMap[q.struct];
        if (m && m[q.game]) setSelectedGameType(m[q.game]);
      }
    },
    q.label
  )))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" } }, gameGroups.map((g) => /* @__PURE__ */ React.createElement("div", { key: g.label }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.55rem", color: "var(--text-muted)", fontFamily: "'Univers Condensed','Univers',sans-serif", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" } }, g.label), /* @__PURE__ */ React.createElement("div", { className: "hand-game-pill-row", style: { flexWrap: "wrap" } }, g.games.map((game) => /* @__PURE__ */ React.createElement("button", { key: game, className: selectedGame === game ? "active" : "", onClick: () => handleGameSelect(game) }, game))))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "0.55rem", color: "var(--text-muted)", fontFamily: "'Univers Condensed','Univers',sans-serif", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" } }, "Betting Structure"), /* @__PURE__ */ React.createElement("div", { className: "hand-game-pill-row" }, ["No Limit", "Pot Limit", "Limit"].map((s) => /* @__PURE__ */ React.createElement("button", { key: s, className: bettingStructure === s ? "active" : "", onClick: () => handleStructureChange(s) }, s))))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", marginTop: "10px" } }, /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary btn-sm", onClick: startNewHand }, "Create ", variantDisplayName, " Hand"))), /* @__PURE__ */ React.createElement("div", { className: "replayer-section-title", style: { marginBottom: "6px" } }, "Saved Hands"), savedHands.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "replayer-empty" }, "No saved hands yet. Create one above.") : /* @__PURE__ */ React.createElement("div", { className: "replayer-hand-list" }, savedHands.map((h) => /* @__PURE__ */ React.createElement("div", { key: h.id, className: "replayer-hand-card", onClick: () => loadHand(h.id) }, /* @__PURE__ */ React.createElement("div", { className: "replayer-hand-card-top" }, /* @__PURE__ */ React.createElement("span", { className: "replayer-hand-card-title" }, h.title || "Untitled"), /* @__PURE__ */ React.createElement("span", { className: "replayer-hand-card-game" }, h.game_type)), h.notes && /* @__PURE__ */ React.createElement("div", { className: "replayer-hand-card-meta" }, h.notes), /* @__PURE__ */ React.createElement("div", { className: "replayer-hand-card-meta" }, new Date(h.created_at).toLocaleDateString(), h.is_public ? " · Public" : ""), /* @__PURE__ */ React.createElement("div", { className: "replayer-hand-card-actions", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "btn btn-ghost btn-sm",
      style: { padding: "3px 8px", fontSize: "0.65rem" },
      onClick: () => deleteHand(h.id)
    },
    "Delete"
  ))))));
}
__name(HandReplayerView, "HandReplayerView");
window.REPLAYER_CARD_BACKS = REPLAYER_CARD_BACKS;
window.REPLAYER_TABLE_SHAPES = REPLAYER_TABLE_SHAPES;
window.useReplayerSetting = useReplayerSetting;
window.generateCommentary = generateCommentary;
window.calcHandStrength = calcHandStrength;
window.getStrengthColor = getStrengthColor;
window.calcSPR = calcSPR;
window.getBetSizingLabel = getBetSizingLabel;
window.estimateRange = estimateRange;
window.calcShowdownEquity = calcShowdownEquity;
window.getStreetColorClass = getStreetColorClass;
window.calcPotBeforeAction = calcPotBeforeAction;
window.PotChipVisual = PotChipVisual;
window.PLAYER_STATS_DATA = PLAYER_STATS_DATA;
window.getPlayerStats = getPlayerStats;
window.ReplayerSettingsPanel = ReplayerSettingsPanel;
window.HandReplayerReplay = HandReplayerReplay;
window.GTOEntryView = GTOEntryView;
window.HandReplayerView = HandReplayerView;
window.CHIP_DENOMS = CHIP_DENOMS;
window.ChipStack = ChipStack;
window.DEFAULT_OPP_NAMES = DEFAULT_OPP_NAMES;
window.HandReplayerEntry = HandReplayerEntry;
window.REPLAYER_THEMES = REPLAYER_THEMES;
window.calcPotsAndStacks = calcPotsAndStacks;
window.createEmptyHand = createEmptyHand;
window.formatChipAmount = formatChipAmount;
window.getActionOrder = getActionOrder;
window.getChipBreakdown = getChipBreakdown;
window.getGameCategory = getGameCategory;
window.getPositionLabels = getPositionLabels;
window.getStreetDef = getStreetDef;
//# sourceMappingURL=replayer.js.map
