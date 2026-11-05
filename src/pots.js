// Pots principaux et side pots.
// players : [{ id, total (mis sur la main), folded }]
// Retour : [{ amount, eligible: [ids] }]
function buildPots(players) {
  const levels = [...new Set(players.filter(p => !p.folded && p.total > 0).map(p => p.total))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of players) amount += Math.max(0, Math.min(p.total, level) - prev);
    const eligible = players.filter(p => !p.folded && p.total >= level).map(p => p.id);
    const last = pots[pots.length - 1];
    if (last && last.eligible.length === eligible.length) last.amount += amount; // même joueurs : on fusionne
    else pots.push({ amount, eligible });
    prev = level;
  }
  // Jetons des joueurs couchés au-delà du plus gros tapis restant : vont au dernier pot.
  const rest = players.reduce((s, p) => s + Math.max(0, p.total - prev), 0);
  if (rest && pots.length) pots[pots.length - 1].amount += rest;
  return pots;
}

// Distribue les pots. scores : { id: nombre } (plus grand = meilleur).
// order : ids dans l'ordre à partir de la gauche du bouton (pour les jetons impairs).
// Retour : { gains: { id: montant }, details: [{ amount, winners }] }
function distribute(pots, scores, order) {
  const gains = {};
  const details = [];
  for (const pot of pots) {
    const best = Math.max(...pot.eligible.map(id => scores[id]));
    const winners = order.filter(id => pot.eligible.includes(id) && scores[id] === best);
    const share = Math.floor(pot.amount / winners.length);
    let odd = pot.amount - share * winners.length;
    for (const id of winners) {
      gains[id] = (gains[id] || 0) + share + (odd > 0 ? 1 : 0);
      odd--;
    }
    details.push({ amount: pot.amount, winners });
  }
  return { gains, details };
}

module.exports = { buildPots, distribute };
