// Moteur d'une table de Texas Hold'em. Le serveur fait autorité : view(id) ne montre que les cartes du joueur.
const { newDeck, shuffle, evaluate } = require('./hand');
const { buildPots, distribute } = require('./pots');
const { decide } = require('./bot');

const MAX_SEATS = 8;
const DELAYS = { nextHand: 6000, bot: 1100, turn: 30000, away: 4000, runout: 1200 };

class Table {
  constructor({ code, smallBlind = 10, bigBlind = 20, startChips = 1000, onUpdate = () => {}, delays = {} }) {
    Object.assign(this, { code, smallBlind, bigBlind, startChips, onUpdate });
    this.delays = { ...DELAYS, ...delays };
    this.seats = Array(MAX_SEATS).fill(null);
    this.phase = 'waiting'; // waiting | preflop | flop | turn | river | showdown
    this.board = [];
    this.button = -1;
    this.toAct = -1;
    this.handNo = 0;
    this.result = null;
    this.log = [];
    this.timer = null;
    this.turnDeadline = 0;
    this.hostId = null;
  }

  // ---------- joueurs ----------
  players() { return this.seats.filter(Boolean); }
  find(id) { return this.seats.findIndex(p => p && p.id === id); }

  addPlayer(id, name, bot = null) {
    const existing = this.find(id);
    if (existing >= 0) { Object.assign(this.seats[existing], { connected: true, leaving: false, awaySince: 0 });
      if (this.phase === 'waiting' && this.handNo > 0) this.maybeStart();
      return existing;
    }
    const seat = this.seats.findIndex(s => !s);
    if (seat < 0) return -1;
    this.seats[seat] = {
      id, name: String(name || 'Joueur').slice(0, 16), bot, chips: this.startChips, connected: true,
      hole: [], folded: true, allIn: false, bet: 0, total: 0, acted: false, seenRaise: 0, inHand: false, lastAction: '',
    };
    if (!this.hostId && !bot) this.hostId = id;
    this.say(`${this.seats[seat].name} s'assoit.`);
    if (this.phase === 'waiting' && this.handNo > 0) this.maybeStart();
    return seat;
  }

  removePlayer(id) {
    const i = this.find(id);
    if (i < 0) return;
    const p = this.seats[i];
    if (p.inHand && (this.isBetting() || this.phase === 'showdown')) {
      // Sa mise reste dans le pot : on garde le siège jusqu'à la fin de la main.
      p.connected = false;
      p.leaving = true;
      if (!p.folded && this.isBetting()) {
        if (this.toAct === i) this.act(id, 'fold');
        else { p.folded = true; p.lastAction = 'Couché'; if (this.players().filter(o => o.inHand && !o.folded).length === 1) this.finish(); }
      }
    } else this.seats[i] = null;
    if (this.hostId === id) this.pickHost();
    this.say(`${p.name} quitte la table.`);
    this.onUpdate();
  }

  setConnected(id, on) {
    const i = this.find(id);
    if (i < 0) return;
    Object.assign(this.seats[i], { connected: on, awaySince: on ? 0 : Date.now() });
    if (!on && this.hostId === id) this.pickHost();
    if (!on && this.toAct === i) this.armTimer();
    this.onUpdate();
  }

  pickHost() {
    const h = this.players().find(p => !p.bot && !p.leaving && p.connected) || this.players().find(p => !p.bot && !p.leaving);
    this.hostId = h ? h.id : null;
  }

  rebuy(id) {
    const p = this.seats[this.find(id)];
    if (p && p.chips === 0 && !(p.inHand && !p.folded && this.isBetting())) {
      p.chips = this.startChips;
      this.say(`${p.name} recave ${this.startChips}.`);
      if (this.phase === 'waiting' && this.handNo > 0) this.maybeStart();
      this.onUpdate();
    }
  }

  say(msg) { this.log.push(msg); if (this.log.length > 30) this.log.shift(); }
  isBetting() { return ['preflop', 'flop', 'turn', 'river'].includes(this.phase); }

  // ---------- déroulement d'une main ----------
  canDeal(p) { return p && p.chips > 0 && (p.connected || p.bot); }

  maybeStart() {
    const dealt = this.players().filter(p => this.canDeal(p));
    if (dealt.length >= 2 && dealt.some(p => !p.bot)) this.startHand(); // pas de partie entre IA seules
    else { this.phase = 'waiting'; this.onUpdate(); }
  }

  nextSeat(from, pred) {
    for (let k = 1; k <= MAX_SEATS; k++) {
      const i = (from + k) % MAX_SEATS;
      if (pred(this.seats[i], i)) return i;
    }
    return -1;
  }

  startHand(deck) {
    clearTimeout(this.timer);
    // Libère les sièges des partants et des absents depuis plus de 2 min.
    this.seats = this.seats.map(p => (p && (p.leaving || (p.awaySince && Date.now() - p.awaySince > 120000)) ? null : p));
    for (const p of this.players()) {
      Object.assign(p, { hole: [], folded: true, allIn: false, bet: 0, total: 0, acted: false, seenRaise: 0, inHand: false, lastAction: '' });
      if (this.canDeal(p)) Object.assign(p, { inHand: true, folded: false });
    }
    const inHand = this.players().filter(p => p.inHand);
    if (inHand.length < 2) { this.phase = 'waiting'; this.onUpdate(); return; }
    this.handNo++;
    this.result = null;
    this.board = [];
    this.deck = deck ? [...deck] : shuffle(newDeck());
    this.button = this.nextSeat(this.button, p => p && p.inHand);
    const live = p => p && p.inHand;
    // En tête-à-tête, le bouton est petite blind.
    const sb = inHand.length === 2 ? this.button : this.nextSeat(this.button, live);
    const bb = this.nextSeat(sb, live);
    for (let r = 0; r < 2; r++) for (let k = 1; k <= MAX_SEATS; k++) {
      const p = this.seats[(this.button + k) % MAX_SEATS];
      if (live(p)) p.hole.push(this.deck.pop());
    }
    this.phase = 'preflop';
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.raiseCount = 0;
    this.post(sb, this.smallBlind, 'Petite blind');
    this.post(bb, this.bigBlind, 'Grosse blind');
    this.currentBet = this.bigBlind;
    this.sbSeat = sb; this.bbSeat = bb;
    this.say(`— Main n°${this.handNo} —`);
    this.toAct = bb;
    this.advanceTurn();
  }

  post(i, amount, label) {
    const p = this.seats[i];
    const a = Math.min(amount, p.chips);
    p.chips -= a; p.bet += a; p.total += a;
    if (p.chips === 0) p.allIn = true;
    p.lastAction = label;
  }

  needsToAct(p) {
    return p && p.inHand && !p.folded && !p.allIn && (!p.acted || p.bet < this.currentBet);
  }

  // Passe au joueur suivant, ou à la rue suivante si le tour d'enchères est fini.
  advanceTurn() {
    const contenders = this.players().filter(p => p.inHand && !p.folded);
    if (contenders.length === 1) return this.finish();
    const next = this.nextSeat(this.toAct, p => this.needsToAct(p));
    if (next >= 0) {
      this.toAct = next;
      this.armTimer();
      this.onUpdate();
      return;
    }
    this.toAct = -1;
    this.nextStreet();
  }

  nextStreet() {
    for (const p of this.players()) { p.bet = 0; p.acted = false; p.seenRaise = 0; if (!p.folded && !p.allIn) p.lastAction = ''; }
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.raiseCount = 0;
    if (this.phase === 'river') return this.finish();
    const order = { preflop: ['flop', 3], flop: ['turn', 1], turn: ['river', 1] }[this.phase];
    this.phase = order[0];
    this.deck.pop(); // carte brûlée
    for (let k = 0; k < order[1]; k++) this.board.push(this.deck.pop());
    const canBet = this.players().filter(p => p.inHand && !p.folded && !p.allIn);
    if (canBet.length < 2) {
      // Tout le monde (sauf au plus un) est à tapis : on déroule le tableau.
      this.toAct = -1;
      this.onUpdate();
      this.timer = setTimeout(() => this.nextStreet(), this.delays.runout);
      return;
    }
    this.toAct = this.button;
    this.advanceTurn();
  }

  // Actions : fold, check, call, raise (amount = mise totale sur la rue), allin.
  act(id, type, amount = 0) {
    const i = this.find(id);
    if (i < 0 || i !== this.toAct || !this.isBetting()) return false;
    const p = this.seats[i];
    const toCall = this.currentBet - p.bet;
    const maxBet = p.bet + p.chips;
    if (type === 'allin') { type = 'raise'; amount = maxBet; }
    if (type === 'check' && toCall > 0) return false;
    if (type === 'call' && toCall === 0) type = 'check';
    if (type === 'raise') {
      amount = Math.floor(Number(amount) || 0);
      if (amount >= maxBet) amount = maxBet;
      if (amount <= this.currentBet) type = toCall > 0 ? 'call' : 'check'; // tapis qui ne couvre pas : simple suivi
      else if (amount < this.currentBet + this.minRaise && amount < maxBet) return false;
      else if (!this.canRaise(p)) return false;
    }
    if (type === 'fold') { p.folded = true; p.lastAction = 'Couché'; }
    else if (type === 'check') { p.lastAction = 'Parole'; }
    else if (type === 'call') { this.put(p, Math.min(toCall, p.chips)); p.lastAction = p.allIn ? 'Tapis' : 'Suit'; }
    else if (type === 'raise') {
      const raise = amount - this.currentBet;
      if (raise >= this.minRaise) { this.minRaise = raise; this.raiseCount++; } // relance complète : rouvre les enchères
      p.lastAction = this.currentBet === 0 ? 'Mise' : 'Relance';
      this.currentBet = amount;
      this.put(p, amount - p.bet);
      if (p.allIn) p.lastAction = 'Tapis';
    } else return false;
    p.acted = true;
    p.seenRaise = this.raiseCount;
    this.say(`${p.name} : ${p.lastAction}${['Suit', 'Mise', 'Relance', 'Tapis'].includes(p.lastAction) ? ' ' + p.bet : ''}`);
    this.afterAction();
    return true;
  }

  canRaise(p) { return !p.acted || p.seenRaise < this.raiseCount; }

  put(p, a) { p.chips -= a; p.bet += a; p.total += a; if (p.chips === 0) p.allIn = true; }

  afterAction() { clearTimeout(this.timer); this.advanceTurn(); }

  finish() {
    clearTimeout(this.timer);
    this.toAct = -1;
    const contenders = this.players().filter(p => p.inHand && !p.folded);
    const all = this.players().filter(p => p.inHand || p.total > 0);
    const potTotal = all.reduce((s, p) => s + p.total, 0);
    let result;
    if (contenders.length === 1) {
      contenders[0].chips += potTotal;
      result = { pots: [{ amount: potTotal, winners: [contenders[0].id] }], hands: {}, shown: false };
      this.say(`${contenders[0].name} remporte ${potTotal}.`);
    } else {
      const scores = {}, hands = {};
      for (const p of contenders) { const e = evaluate([...p.hole, ...this.board]); scores[p.id] = e.score; hands[p.id] = { name: e.name, cards: e.cards }; }
      const order = [];
      for (let k = 1; k <= MAX_SEATS; k++) { const p = this.seats[(this.button + k) % MAX_SEATS]; if (p) order.push(p.id); }
      const pots = buildPots(all.map(p => ({ id: p.id, total: p.total, folded: p.folded })));
      const { gains, details } = distribute(pots, scores, order);
      for (const id in gains) this.seats[this.find(id)].chips += gains[id];
      result = { pots: details, hands, shown: true };
      for (const d of details) this.say(`${d.winners.map(id => this.nameOf(id)).join(' & ')} remporte ${d.amount} (${hands[d.winners[0]].name}).`);
    }
    this.result = result;
    this.phase = 'showdown';
    this.onUpdate();
    this.timer = setTimeout(() => this.maybeStart(), this.delays.nextHand);
  }

  nameOf(id) { const i = this.find(id); return i >= 0 ? this.seats[i].name : '?'; }

  // ---------- minuteries & IA ----------
  armTimer() {
    clearTimeout(this.timer);
    const p = this.seats[this.toAct];
    if (!p) return;
    const ms = p.bot ? this.delays.bot : p.connected ? this.delays.turn : this.delays.away;
    this.turnDeadline = p.bot ? 0 : Date.now() + ms;
    const hand = this.handNo, seat = this.toAct;
    this.timer = setTimeout(() => {
      if (this.handNo !== hand || this.toAct !== seat) return;
      if (p.bot) {
        const d = decide(this.botView(p), p.bot);
        if (!this.act(p.id, d.type, d.amount)) this.act(p.id, this.currentBet > p.bet ? 'call' : 'check');
      } else this.act(p.id, this.currentBet > p.bet ? 'fold' : 'check'); // temps écoulé
    }, ms);
  }

  botView(p) {
    const opponents = this.players().filter(o => o !== p && o.inHand && !o.folded).length;
    return {
      hole: p.hole, board: this.board, chips: p.chips, bet: p.bet, currentBet: this.currentBet,
      minRaise: this.minRaise, pot: this.potTotal(), bigBlind: this.bigBlind, opponents,
      canRaise: this.canRaise(p), phase: this.phase,
    };
  }

  potTotal() { return this.players().reduce((s, p) => s + p.total, 0); }

  stop() { clearTimeout(this.timer); }

  // ---------- vue envoyée à un joueur ----------
  view(forId) {
    const me = this.find(forId);
    const showdown = this.phase === 'showdown' && this.result && this.result.shown;
    return {
      code: this.code, phase: this.phase, board: this.board, button: this.button, toAct: this.toAct,
      sb: this.smallBlind, bb: this.bigBlind, me, isHost: this.hostId === forId, handNo: this.handNo,
      currentBet: this.currentBet || 0, minRaise: this.minRaise || this.bigBlind, pot: this.potTotal(),
      turnLeft: this.turnDeadline ? Math.max(0, this.turnDeadline - Date.now()) : 0,
      log: this.log.slice(-8),
      result: this.result && { pots: this.result.pots.map(d => ({ amount: d.amount, winners: d.winners.map(id => this.find(id)) })), hands: Object.fromEntries(Object.entries(this.result.hands).map(([id, h]) => [this.find(id), h])) },
      seats: this.seats.map((p, i) => p && {
        name: p.name, chips: p.chips, bet: p.bet, folded: p.folded, allIn: p.allIn, inHand: p.inHand,
        bot: p.bot, connected: p.connected || !!p.bot, lastAction: p.lastAction, canRaise: this.canRaise(p),
        hole: i === me || (showdown && p.inHand && !p.folded) ? p.hole : p.inHand && !p.folded ? ['??', '??'] : [],
      }),
    };
  }
}

module.exports = { Table, MAX_SEATS };
