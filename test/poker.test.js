const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, newDeck } = require('../src/hand');
const { buildPots, distribute } = require('../src/pots');
const { Table } = require('../src/table');
const { decide } = require('../src/bot');

const ev = s => evaluate(s.split(' '));
const beats = (a, b) => assert.ok(ev(a).score > ev(b).score, `${a} doit battre ${b}`);

test('noms des catégories', () => {
  const cases = {
    'As Ks Qs Js Ts': 'Quinte flush', '9h 9d 9s 9c 2h': 'Carré', 'Kh Kd Ks 2c 2h': 'Full',
    'Ah 9h 7h 4h 2h': 'Couleur', '5d 6c 7h 8s 9d': 'Quinte', 'Ah 2d 3c 4s 5h': 'Quinte',
    'Qh Qd Qs 7c 2h': 'Brelan', 'Jh Jd 4s 4c Ah': 'Double paire', 'Th Td 8s 4c 2h': 'Paire', 'Ah Kd 8s 4c 2h': 'Carte haute',
  };
  for (const [h, n] of Object.entries(cases)) assert.equal(ev(h).name, n, h);
});

test('ordre des catégories', () => {
  const order = ['Ah Kd 8s 4c 2h', 'Th Td 8s 4c 2h', 'Jh Jd 4s 4c Ah', 'Qh Qd Qs 7c 2h', '5d 6c 7h 8s 9d',
    'Ah 9h 7h 4h 2h', 'Kh Kd Ks 2c 2h', '9h 9d 9s 9c 2h', '5s 6s 7s 8s 9s'];
  for (let i = 1; i < order.length; i++) beats(order[i], order[i - 1]);
});

test('départages et cas limites', () => {
  beats('2d 3c 4s 5h 6h', 'Ah 2d 3c 4s 5h'); // la roue est la plus petite quinte
  beats('Ah 2h 3h 4h 5h', 'Kd Kc Ks Kh Ah'); // quinte flush roue > carré
  beats('Ah Ad 9s 4c 3h', 'Ah Ad 8s 7c 6h'); // kicker
  beats('Kh Kd 3s 3c 2h', 'Qh Qd Js Jc Ah'); // double paire : la plus haute paire compte
  beats('Kh Kd 3s 3c 5h', 'Kh Kd 3s 3c 4h'); // kicker de double paire
  beats('3h 3d 3s Ac Ah', '2h 2d 2s Kc Kh'); // full : le brelan compte d'abord
  beats('Ah Jh 9h 4h 3h', 'Ah Jh 9h 4h 2h'); // couleur : 5e carte
  assert.equal(ev('Ah Kd 8s 4c 2h').score, ev('As Kc 8d 4h 2c').score); // égalité exacte
});

test('meilleure main de 5 parmi 7', () => {
  const r = ev('Ah Kh 2c 3d Qh Jh Th');
  assert.equal(r.name, 'Quinte flush');
  assert.deepEqual([...r.cards].sort(), ['Ah', 'Jh', 'Kh', 'Qh', 'Th']);
  assert.equal(ev('2c 2d 2h 3c 3d 3h 9s').name, 'Full');
  assert.equal(ev('Ac 2d 3h 4s 5c 9d Kh').name, 'Quinte');
  assert.equal(ev('7c 7d Kh Ks 2c 2d As').name, 'Double paire');
  // Le tableau joue : égalité entre deux joueurs
  const board = ['Ts', 'Js', 'Qs', 'Ks', 'As'];
  assert.equal(evaluate(['2c', '3d', ...board]).score, evaluate(['4h', '5h', ...board]).score);
});

test('side pots : trois tapis différents', () => {
  const pots = buildPots([
    { id: 'A', total: 100, folded: false },
    { id: 'B', total: 300, folded: false },
    { id: 'C', total: 500, folded: false },
    { id: 'D', total: 500, folded: false },
  ]);
  assert.deepEqual(pots, [
    { amount: 400, eligible: ['A', 'B', 'C', 'D'] },
    { amount: 600, eligible: ['B', 'C', 'D'] },
    { amount: 400, eligible: ['C', 'D'] },
  ]);
  // A a la meilleure main, puis B, puis C
  const { gains } = distribute(pots, { A: 4, B: 3, C: 2, D: 1 }, ['A', 'B', 'C', 'D']);
  assert.deepEqual(gains, { A: 400, B: 600, C: 400 });
});

test('side pots : mise des joueurs couchés et excédent non suivi', () => {
  const pots = buildPots([
    { id: 'A', total: 50, folded: false },
    { id: 'B', total: 200, folded: true },
    { id: 'C', total: 300, folded: false },
  ]);
  assert.deepEqual(pots, [{ amount: 150, eligible: ['A', 'C'] }, { amount: 400, eligible: ['C'] }]);
  const total = pots.reduce((s, p) => s + p.amount, 0);
  assert.equal(total, 550); // aucun jeton perdu
  const { gains } = distribute(pots, { A: 9, C: 1 }, ['A', 'C']);
  assert.deepEqual(gains, { A: 150, C: 400 });
});

test('partage et jeton impair', () => {
  const pots = buildPots([{ id: 'A', total: 25, folded: false }, { id: 'B', total: 25, folded: false }, { id: 'C', total: 25, folded: true }]);
  const { gains } = distribute(pots, { A: 5, B: 5 }, ['B', 'A']);
  assert.deepEqual(gains, { B: 38, A: 37 }); // le jeton impair va au premier après le bouton
});

// ---------- moteur de table ----------
function makeTable(stacks) {
  const t = new Table({ code: 'TEST', delays: { nextHand: 1e9, bot: 1e9, turn: 1e9, away: 1e9, runout: 1e9 } });
  stacks.forEach((c, i) => { t.addPlayer('p' + i, 'P' + i); t.seats[i].chips = c; });
  return t;
}
// Paquet piloté : les cartes sont tirées par la fin (pop).
function deckFor(holes, board) {
  const n = holes.length;
  const top = [];
  for (let r = 0; r < 2; r++) for (let i = 0; i < n; i++) top.push(holes[i][r]);
  top.push('x1', board[0], board[1], board[2], 'x2', board[3], 'x3', board[4]);
  const rest = newDeck().filter(c => !top.includes(c));
  return [...rest, ...top.reverse()];
}
const seatOf = (t, i) => t.seats[i];

test('tête-à-tête : le bouton paie la petite blind et parle en premier', () => {
  const t = makeTable([1000, 1000]);
  t.startHand();
  assert.equal(t.button, 0);
  assert.equal(seatOf(t, 0).bet, 10);
  assert.equal(seatOf(t, 1).bet, 20);
  assert.equal(t.toAct, 0);
  t.act('p0', 'call');
  assert.equal(t.toAct, 1); // option de la grosse blind
  t.act('p1', 'check');
  assert.equal(t.phase, 'flop');
  assert.equal(t.toAct, 1); // après le flop, la grosse blind parle en premier
  t.stop();
});

test('tapis à 3 joueurs : side pot réel et total des jetons conservé', () => {
  const t = makeTable([100, 300, 500]);
  // Bouton = siège 0 : on distribue à partir du siège 1. P0 a la meilleure main, P1 la deuxième.
  const holes = { 0: ['As', 'Ad'], 1: ['Ks', 'Kd'], 2: ['2c', '7h'] };
  t.startHand(deckFor([holes[1], holes[2], holes[0]], ['Ac', 'Kh', '9s', '4d', '3c']));
  assert.deepEqual(seatOf(t, 0).hole, holes[0]);
  assert.equal(t.toAct, 0);
  t.act('p0', 'allin');
  t.act('p1', 'allin');
  t.act('p2', 'call'); // suit 300 : il garde 200
  while (t.phase !== 'showdown') { clearTimeout(t.timer); t.nextStreet(); }
  t.stop();
  assert.deepEqual(t.result.pots.map(p => [p.amount, p.winners]), [[300, ['p0']], [400, ['p1']]]);
  assert.deepEqual(t.seats.slice(0, 3).map(p => p.chips), [300, 400, 200]);
});

test('relance incomplète à tapis : ne rouvre pas les enchères', () => {
  const t = makeTable([1000, 1000, 130]);
  t.startHand(); // bouton 0, SB 1, BB 2 (P2 a 110 derrière)
  t.act('p0', 'raise', 100); // relance à 100
  t.act('p1', 'call');
  t.act('p2', 'allin'); // tapis à 130 : relance de 30 < 80, incomplète
  assert.equal(t.currentBet, 130);
  assert.equal(t.toAct, 0);
  assert.equal(t.act('p0', 'raise', 400), false); // P0 ne peut pas relancer
  assert.equal(t.act('p0', 'call'), true);
  assert.equal(t.act('p1', 'call'), true);
  assert.equal(t.phase, 'flop');
  t.stop();
});

test('montant de relance invalide refusé, tour respecté', () => {
  const t = makeTable([1000, 1000, 1000]);
  t.startHand();
  assert.equal(t.act('p1', 'call'), false); // pas son tour
  assert.equal(t.act('p0', 'raise', 30), false); // relance min = 40
  assert.equal(t.act('p0', 'check'), false); // doit payer
  assert.equal(t.act('p0', 'raise', 40), true);
  t.stop();
});

test('tout le monde se couche : le dernier gagne sans abattage', () => {
  const t = makeTable([1000, 1000, 1000]);
  t.startHand();
  t.act('p0', 'fold');
  t.act('p1', 'fold');
  assert.equal(t.phase, 'showdown');
  assert.equal(seatOf(t, 2).chips, 1010);
  t.stop();
});

test('déconnexion pendant la main : il se couche, son argent reste dans le pot', () => {
  const t = makeTable([1000, 1000, 1000]);
  t.startHand();
  t.act('p0', 'call');
  t.removePlayer('p1'); // petite blind qui part
  t.act('p0', 'fold'); // pas son tour : refusé
  assert.equal(t.toAct, 2);
  t.act('p2', 'check');
  assert.equal(t.phase, 'flop');
  assert.equal(t.potTotal(), 50);
  t.stop();
});

test('vue client : on ne voit pas les cartes des autres', () => {
  const t = makeTable([1000, 1000]);
  t.startHand();
  const v = t.view('p0');
  assert.equal(v.seats[0].hole.length, 2);
  assert.notEqual(v.seats[0].hole[0], '??');
  assert.deepEqual(v.seats[1].hole, ['??', '??']);
  t.stop();
});

test('IA : décisions valides à toutes les difficultés', () => {
  for (const level of ['facile', 'moyen', 'difficile']) {
    const d = decide({ hole: ['As', 'Ad'], board: [], chips: 980, bet: 20, currentBet: 20, minRaise: 20, pot: 30, bigBlind: 20, opponents: 2, canRaise: true, phase: 'preflop' }, level);
    assert.ok(['check', 'raise', 'call'].includes(d.type), level);
    if (d.type === 'raise') assert.ok(d.amount >= 40 && d.amount <= 1000);
  }
});

test('partie complète entre IA sans perte de jetons', () => {
  const t = new Table({ code: 'SIM', delays: { nextHand: 1e9, bot: 1e9, turn: 1e9, away: 1e9, runout: 1e9 } });
  for (let i = 0; i < 4; i++) t.addPlayer('b' + i, 'B' + i, ['facile', 'moyen', 'difficile', 'moyen'][i]);
  t.addPlayer('h', 'Humain'); t.seats[4].chips = 0; // un humain éliminé : la partie continue entre IA
  const { decide: d } = require('../src/bot');
  for (let hand = 0; hand < 40; hand++) {
    t.startHand();
    if (t.phase === 'waiting') break;
    let guard = 0;
    while (t.phase !== 'showdown' && guard++ < 200) {
      clearTimeout(t.timer);
      if (t.toAct < 0) { t.nextStreet(); continue; }
      const p = t.seats[t.toAct];
      const x = d({ ...t.botView(p) }, 'facile');
      if (!t.act(p.id, x.type, x.amount)) t.act(p.id, t.currentBet > p.bet ? 'call' : 'check');
    }
    const total = t.players().reduce((s, p) => s + p.chips, 0);
    assert.equal(total, 4000, `main ${hand}`);
  }
  t.stop();
});
