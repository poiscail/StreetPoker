// Client Street Poker : affiche l'état envoyé par le serveur et envoie les actions.
const $ = id => document.getElementById(id);
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } },
};
// Jeton par onglet : un rechargement garde la place, deux onglets = deux joueurs.
let token = null;
try { token = sessionStorage.getItem('sp_token'); } catch { /* indisponible */ }
const reloaded = !!token;
if (!token) { token = Math.random().toString(36).slice(2) + Date.now().toString(36); try { sessionStorage.setItem('sp_token', token); } catch { /* indisponible */ } }
$('name').value = store.get('sp_name') || '';
const urlCode = new URLSearchParams(location.search).get('t');
if (urlCode) $('code').value = urlCode.toUpperCase();

const socket = io({ auth: { token } });
let code = reloaded && urlCode ? urlCode.toUpperCase() : null, state = null, timerStart = 0, timerTotal = 0;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nameVal = () => { const n = $('name').value.trim() || 'Joueur'; store.set('sp_name', n); return n; };
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 1800); }

// ---------- accueil ----------
$('btnCreate').onclick = () => socket.emit('create', { name: nameVal() });
$('btnSolo').onclick = () => socket.emit('create', { name: nameVal(), solo: true, bots: $('bots').value, level: $('level').value });
$('btnJoin').onclick = () => {
  const c = $('code').value.trim().toUpperCase();
  if (c.length !== 4) return ($('err').textContent = 'Entre le code à 4 lettres.');
  socket.emit('join', { code: c, name: nameVal() });
};
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoin').click(); });

socket.on('erreur', msg => { if (!state) code = null; $('err').textContent = msg; toast(msg); });
socket.on('connect', () => { if (code) socket.emit('join', { code, name: nameVal() }); }); // reconnexion : on reprend sa place
socket.on('state', s => {
  state = s;
  if (code !== s.code || $('game').classList.contains('hidden')) {
    code = s.code;
    history.replaceState(null, '', '?t=' + code);
    $('home').classList.add('hidden');
    $('game').classList.remove('hidden');
  }
  render();
});

// ---------- table ----------
$('btnLeave').onclick = () => {
  if (!confirm('Quitter la table ?')) return;
  socket.emit('leave');
  code = null; state = null;
  history.replaceState(null, '', location.pathname);
  $('game').classList.add('hidden');
  $('home').classList.remove('hidden');
};
$('btnShare').onclick = async () => {
  const link = `${location.origin}${location.pathname}?t=${code}`;
  if (navigator.share) { try { await navigator.share({ title: 'Street Poker', text: `Rejoins ma table de poker (code ${code})`, url: link }); return; } catch { /* annulé */ } }
  try { await navigator.clipboard.writeText(link); toast('Lien copié !'); } catch { prompt('Copie ce lien :', link); }
};
$('btnStart').onclick = () => socket.emit('start');
$('btnAddBot').onclick = () => socket.emit('addBot', $('botLevel').value);
$('btnRebuy').onclick = () => socket.emit('rebuy');
$('aFold').onclick = () => socket.emit('action', { type: 'fold' });
$('aCall').onclick = () => {
  const me = state.seats[state.me];
  socket.emit('action', { type: state.currentBet > me.bet ? 'call' : 'check' });
};
$('aRaise').onclick = () => socket.emit('action', { type: 'raise', amount: +$('slider').value });
$('slider').oninput = () => updateRaiseLabel();
document.querySelectorAll('.presets .btn').forEach(b => b.onclick = () => {
  const s = $('slider'), me = state.seats[state.me];
  const toCall = state.currentBet - me.bet;
  s.value = b.dataset.p === 'all' ? s.max : Math.round(state.currentBet + +b.dataset.p * (state.pot + toCall));
  updateRaiseLabel();
});

function updateRaiseLabel() {
  const v = +$('slider').value, me = state.seats[state.me];
  $('aRaise').textContent = v >= me.bet + me.chips ? `Tapis ${v}` : `${state.currentBet ? 'Relancer à' : 'Miser'} ${v}`;
}

const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
function cardHtml(c, best) {
  if (c === '??') return '<div class="card back"></div>';
  const r = c[0] === 'T' ? '10' : c[0];
  return `<div class="card${'hd'.includes(c[1]) ? ' r' : ''}${best ? ' best' : ''}">${r}<i>${SUIT[c[1]]}</i></div>`;
}

function render() {
  const s = state, me = s.seats[s.me];
  $('tcode').textContent = s.code;
  $('lcode').textContent = s.code;

  const winSeats = new Set((s.result ? s.result.pots : []).flatMap(p => p.winners));
  const winHand = s.result && s.result.pots.length && s.result.hands[s.result.pots[0].winners[0]];
  const bestCards = new Set(winHand ? winHand.cards : []);

  $('board').innerHTML = s.board.map(c => cardHtml(c, bestCards.has(c))).join('');
  $('pot').textContent = s.pot ? `Pot : ${s.pot}` : '';
  let info = '';
  if (s.phase === 'waiting') info = `${s.seats.filter(Boolean).length} joueur(s) · blinds ${s.sb}/${s.bb}`;
  else if (s.phase === 'showdown' && s.result) info = s.result.pots.map(p => `${p.winners.map(i => esc(s.seats[i] ? s.seats[i].name : '?')).join(' & ')} gagne ${p.amount}${s.result.hands[p.winners[0]] ? ' · ' + s.result.hands[p.winners[0]].name : ''}`).join('<br>');
  $('info').innerHTML = info;

  // Sièges : moi en bas, les autres autour de l'ovale.
  const mine = s.me >= 0 ? s.me : 0;
  $('seats').innerHTML = s.seats.map((p, i) => {
    if (!p) return '';
    const k = (i - mine + 8) % 8;
    const a = Math.PI / 2 + (k / 8) * Math.PI * 2;
    const x = 50 + 50 * Math.cos(a), y = 50 + 50 * Math.sin(a);
    const cls = ['seat', i === s.toAct && 'turn', p.folded && p.inHand && 'folded', !p.connected && 'away', winSeats.has(i) && s.phase === 'showdown' && 'win'].filter(Boolean).join(' ');
    const hand = s.result && s.result.hands[i];
    const act = hand && s.phase === 'showdown' ? hand.name : p.chips === 0 && !p.inHand ? 'Éliminé' : p.lastAction;
    return `<div class="${cls}" style="left:${x}%;top:${y}%">
      <div class="hole">${p.hole.map(c => cardHtml(c, winSeats.has(i) && bestCards.has(c))).join('')}</div>
      <div class="plate"><div class="nm">${esc(p.name)}${i === s.button && s.phase !== 'waiting' ? '<span class="dealer">D</span>' : ''}</div>
      <div class="ch">${p.chips}</div><div class="act">${esc(act || '')}</div></div>
      <div class="bet">${p.bet || ''}</div></div>`;
  }).join('');

  // Salle d'attente
  const waiting = s.phase === 'waiting';
  $('lobby').classList.toggle('hidden', !waiting);
  $('hostTools').classList.toggle('hidden', !s.isHost);
  $('waitHost').classList.toggle('hidden', s.isHost);
  $('btnStart').disabled = s.seats.filter(Boolean).length < 2;

  // Recave quand on n'a plus de jetons
  $('btnRebuy').classList.toggle('hidden', !(me && me.chips === 0 && !(me.inHand && !me.folded && s.phase !== 'waiting' && s.phase !== 'showdown')));

  // Actions
  const myTurn = me && s.toAct === s.me;
  $('actions').classList.toggle('off', !myTurn);
  $('actions').classList.toggle('hidden', waiting);
  if (myTurn) {
    const toCall = s.currentBet - me.bet, max = me.bet + me.chips;
    $('aCall').textContent = toCall > 0 ? (toCall >= me.chips ? `Tapis ${max}` : `Suivre ${toCall}`) : 'Parole';
    const canRaise = me.canRaise && max > s.currentBet && me.chips > toCall;
    $('raiseBox').classList.toggle('hidden', !canRaise);
    $('aRaise').classList.toggle('hidden', !canRaise);
    if (canRaise) {
      const sl = $('slider');
      sl.min = Math.min(max, s.currentBet + s.minRaise);
      sl.max = max;
      sl.step = 1;
      if (+sl.value < +sl.min || +sl.value > max || sl.dataset.hand !== `${s.handNo}-${s.phase}-${s.currentBet}`) sl.value = sl.min;
      sl.dataset.hand = `${s.handNo}-${s.phase}-${s.currentBet}`;
      updateRaiseLabel();
    }
    timerStart = Date.now(); timerTotal = s.turnLeft;
  }
  $('log').innerHTML = s.log.slice().reverse().map(l => `<li>${esc(l)}</li>`).join('');
}

// Barre du temps restant
setInterval(() => {
  if (!state || state.toAct !== state.me || !timerTotal) return;
  const left = Math.max(0, timerTotal - (Date.now() - timerStart));
  $('timer').firstElementChild.style.width = (left / 30000) * 100 + '%';
}, 200);
