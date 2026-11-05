// Évaluation des mains de poker. Cartes = "As", "Td", "9h"... (rang + couleur).
const RANKS = '23456789TJQKA';
const SUITS = 'shdc';
const NAMES = ['Carte haute', 'Paire', 'Double paire', 'Brelan', 'Quinte', 'Couleur', 'Full', 'Carré', 'Quinte flush'];

const rankOf = c => RANKS.indexOf(c[0]) + 2;

function newDeck() {
  const d = [];
  for (const r of RANKS) for (const s of SUITS) d.push(r + s);
  return d;
}

function shuffle(a, rnd = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Score d'une main de 5 cartes : [catégorie, départages...] encodé en un nombre comparable.
function eval5(cards) {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every(c => c[1] === cards[0][1]);
  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks[0] === 14 && ranks[1] === 5) straightHigh = 5; // roue A-2-3-4-5
  }
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts).map(([r, n]) => [n, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const byGroup = groups.map(g => g[1]);
  let score;
  if (straightHigh && flush) score = [8, straightHigh];
  else if (groups[0][0] === 4) score = [7, ...byGroup];
  else if (groups[0][0] === 3 && groups[1][0] === 2) score = [6, ...byGroup];
  else if (flush) score = [5, ...ranks];
  else if (straightHigh) score = [4, straightHigh];
  else if (groups[0][0] === 3) score = [3, ...byGroup];
  else if (groups[0][0] === 2 && groups[1][0] === 2) score = [2, ...byGroup];
  else if (groups[0][0] === 2) score = [1, ...byGroup];
  else score = [0, ...ranks];
  let n = 0;
  for (let i = 0; i < 6; i++) n = n * 15 + (score[i] || 0);
  return n;
}

// Meilleure main de 5 parmi 5 à 7 cartes.
function evaluate(cards) {
  let best = -1, bestCards = null;
  const pick = (start, chosen) => {
    if (chosen.length === 5) {
      const s = eval5(chosen);
      if (s > best) { best = s; bestCards = chosen; }
      return;
    }
    for (let i = start; i <= cards.length - (5 - chosen.length); i++) pick(i + 1, [...chosen, cards[i]]);
  };
  pick(0, []);
  return { score: best, cards: bestCards, name: NAMES[Math.floor(best / 15 ** 5)] };
}

module.exports = { newDeck, shuffle, eval5, evaluate, rankOf, NAMES };
