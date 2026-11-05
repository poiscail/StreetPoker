// IA : estime ses chances (Monte-Carlo) puis décide selon la difficulté.
const { newDeck, evaluate, rankOf } = require('./hand');

function equity(hole, board, opponents, iterations) {
  const known = new Set([...hole, ...board]);
  const rest = newDeck().filter(c => !known.has(c));
  let score = 0;
  for (let it = 0; it < iterations; it++) {
    // Tirage partiel de Fisher-Yates : juste les cartes nécessaires.
    const need = 5 - board.length + opponents * 2;
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(Math.random() * (rest.length - i));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const full = [...board, ...rest.slice(0, 5 - board.length)];
    const mine = evaluate([...hole, ...full]).score;
    let best = 0, ties = 0, lost = false;
    for (let o = 0; o < opponents; o++) {
      const k = 5 - board.length + o * 2;
      const s = evaluate([rest[k], rest[k + 1], ...full]).score;
      if (s > mine) { lost = true; break; }
      if (s === mine) ties++;
      best = Math.max(best, s);
    }
    if (!lost) score += 1 / (ties + 1);
  }
  return score / iterations;
}

// Force simple de la main de départ (0..1), pour le mode Facile.
function preflopStrength([a, b]) {
  const r1 = rankOf(a), r2 = rankOf(b);
  let s = (Math.max(r1, r2) + Math.min(r1, r2) / 2) / 21;
  if (r1 === r2) s += 0.35;
  if (a[1] === b[1]) s += 0.06;
  if (Math.abs(r1 - r2) === 1) s += 0.04;
  return Math.min(1, s);
}

const SETTINGS = {
  facile: { sims: 0, bluff: 0.03, slack: 0.15 },
  moyen: { sims: 250, bluff: 0.07, slack: 0.05 },
  difficile: { sims: 700, bluff: 0.12, slack: 0 },
};

// v : vue du bot (voir Table.botView). Retour : { type, amount }
function decide(v, level = 'moyen') {
  const cfg = SETTINGS[level] || SETTINGS.moyen;
  const toCall = v.currentBet - v.bet;
  const maxBet = v.bet + v.chips;
  const opp = Math.max(1, v.opponents);
  const raiseTo = frac => {
    const target = Math.max(v.currentBet + v.minRaise, Math.round(v.currentBet + frac * (v.pot + toCall)));
    return { type: 'raise', amount: Math.min(maxBet, target) };
  };
  const passive = () => (toCall === 0 ? { type: 'check' } : { type: 'fold' });
  const r = Math.random();

  if (level === 'facile') {
    // Joue « au feeling » : suit beaucoup, relance rarement.
    let s = v.board.length ? (evaluate([...v.hole, ...v.board]).score / 15 ** 5) / 4 + 0.3 : preflopStrength(v.hole);
    s += (r - 0.5) * 0.3;
    if (v.canRaise && s > 0.8 && r < 0.4) return raiseTo(0.5);
    if (toCall === 0) return { type: 'check' };
    if (s > 0.35 || toCall <= v.bigBlind) return { type: 'call' };
    return { type: 'fold' };
  }

  const eq = equity(v.hole, v.board, opp, cfg.sims);
  const potOdds = toCall / (v.pot + toCall);
  const strong = 1 / (opp + 1) + 0.3; // nettement au-dessus de la part équitable

  if (v.canRaise && eq > strong + 0.15 && r < 0.75) return raiseTo(level === 'difficile' && eq > 0.85 ? 1 : 0.66);
  if (v.canRaise && eq > strong && r < 0.5) return raiseTo(0.5);
  // Bluff / semi-bluff, plutôt quand personne n'a misé.
  if (v.canRaise && r < cfg.bluff && (toCall === 0 || level === 'difficile')) return raiseTo(0.6);
  if (toCall === 0) return { type: 'check' };
  if (eq + cfg.slack >= potOdds) return { type: 'call' };
  return passive();
}

module.exports = { decide, equity, preflopStrength };
