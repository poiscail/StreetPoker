// Serveur Street Poker : fichiers statiques + Socket.IO. Jetons fictifs uniquement.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const { Table, MAX_SEATS } = require('./src/table');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const BOT_NAMES = ['Tonio', 'Rita', 'Bigs', 'Kenza', 'Zed', 'Lulu', 'Mojo', 'Nina'];
const LEVELS = ['facile', 'moyen', 'difficile'];

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(PUBLIC, url === '/' ? 'index.html' : url);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Introuvable'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
const io = new Server(server);
const tables = new Map(); // code -> { table, emptySince }

function newCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do c = Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join(''); while (tables.has(c));
  return c;
}

function broadcast(code) {
  const entry = tables.get(code);
  if (!entry) return;
  for (const s of io.sockets.adapter.rooms.get(code) || []) {
    const sock = io.sockets.sockets.get(s);
    if (sock) sock.emit('state', entry.table.view(sock.data.id));
  }
}

function createTable() {
  const code = newCode();
  const table = new Table({ code, onUpdate: () => broadcast(code) });
  tables.set(code, { table, emptySince: Date.now() });
  return table;
}

function addBot(table, level) {
  const used = new Set(table.players().map(p => p.name));
  const name = (BOT_NAMES.find(n => !used.has(`${n} (IA)`)) || 'Bot') + ' (IA)';
  const lvl = LEVELS.includes(level) ? level : 'moyen';
  return table.addPlayer('bot-' + Math.random().toString(36).slice(2), name, lvl);
}

io.on('connection', socket => {
  const clean = v => String(v || '').trim().slice(0, 16);
  const id = clean(socket.handshake.auth && socket.handshake.auth.token).length >= 8
    ? String(socket.handshake.auth.token).slice(0, 64) : 'p-' + Math.random().toString(36).slice(2);
  socket.data.id = id;
  const current = () => tables.get(socket.data.code);

  function enter(table, name) {
    if (table.addPlayer(id, clean(name) || 'Joueur') < 0) return socket.emit('erreur', 'Table pleine (8 joueurs max).');
    socket.join(table.code);
    socket.data.code = table.code;
    tables.get(table.code).emptySince = 0;
    broadcast(table.code);
  }

  socket.on('create', ({ name, solo, bots, level } = {}) => {
    const table = createTable();
    enter(table, name);
    if (solo) {
      const n = Math.min(MAX_SEATS - 1, Math.max(1, Number(bots) || 3));
      for (let k = 0; k < n; k++) addBot(table, level);
      table.startHand();
    }
  });

  socket.on('join', ({ code, name } = {}) => {
    const entry = tables.get(String(code || '').toUpperCase().trim());
    if (!entry) return socket.emit('erreur', 'Table introuvable. Vérifie le code.');
    enter(entry.table, name);
  });

  socket.on('action', ({ type, amount } = {}) => { const e = current(); if (e) e.table.act(id, String(type), amount); });
  socket.on('rebuy', () => { const e = current(); if (e) e.table.rebuy(id); });

  socket.on('start', () => {
    const e = current();
    if (e && e.table.hostId === id && e.table.phase === 'waiting') e.table.maybeStart();
  });
  socket.on('addBot', level => {
    const e = current();
    if (e && e.table.hostId === id) { addBot(e.table, level); broadcast(e.table.code); }
  });

  socket.on('leave', () => {
    const e = current();
    if (!e) return;
    socket.leave(e.table.code);
    socket.data.code = null;
    e.table.removePlayer(id);
  });

  socket.on('disconnect', () => {
    const e = current();
    if (e) e.table.setConnected(id, false);
  });
});

// Ménage : supprime les tables sans humain connecté depuis 10 min.
setInterval(() => {
  for (const [code, e] of tables) {
    const humans = e.table.players().some(p => !p.bot && p.connected);
    if (humans) e.emptySince = 0;
    else if (!e.emptySince) e.emptySince = Date.now();
    else if (Date.now() - e.emptySince > 10 * 60 * 1000) { e.table.stop(); tables.delete(code); }
  }
}, 30 * 1000).unref();

server.listen(PORT, () => console.log(`Street Poker sur http://localhost:${PORT}`));
