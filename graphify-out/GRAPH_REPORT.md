# Graph Report - StreetPoker  (2026-11-05)

## Corpus Check
- Corpus is ~6,692 words - fits in a single context window. You may not need a graph.

## Summary
- 123 nodes · 227 edges · 12 communities (7 shown, 5 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- IA et tests
- Serveur Socket.IO
- Config npm
- Client navigateur
- Table : état et timers
- Hébergement Render
- Présentation du jeu
- Écran de table
- Ajout de joueurs

## God Nodes (most connected - your core abstractions)
1. `Table` - 34 edges
2. `evaluate()` - 9 edges
3. `services` - 7 edges
4. `decide()` - 7 edges
5. `newDeck()` - 7 edges
6. `render()` - 4 edges
7. `createTable()` - 4 edges
8. `equity()` - 4 edges
9. `rankOf()` - 4 edges
10. `buildPots()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `createTable()` --calls--> `Table`  [EXTRACTED]
  server.js → src/table.js
- `deckFor()` --calls--> `newDeck()`  [EXTRACTED]
  test/poker.test.js → src/hand.js
- `makeTable()` --calls--> `Table`  [EXTRACTED]
  test/poker.test.js → src/table.js
- `Écran d'accueil` --implements--> `Mode entre amis (code de table)`  [INFERRED]
  public/index.html → README.md
- `Écran d'accueil` --implements--> `Mode solo contre IA (3 difficultés)`  [INFERRED]
  public/index.html → README.md

## Import Cycles
- None detected.

## Communities (12 total, 5 thin omitted)

### Community 0 - "IA et tests"
Cohesion: 0.17
Nodes (18): decide(), equity(), preflopStrength(), SETTINGS, eval5(), evaluate(), NAMES, newDeck() (+10 more)

### Community 1 - "Serveur Socket.IO"
Cohesion: 0.12
Nodes (14): BOT_NAMES, broadcast(), createTable(), enter(), fs, http, io, LEVELS (+6 more)

### Community 2 - "Config npm"
Cohesion: 0.12
Nodes (17): author, dependencies, socket.io@^4.8.4, description, directories, test, engines, node (+9 more)

### Community 3 - "Client navigateur"
Cohesion: 0.24
Nodes (8): cardHtml(), esc(), render(), socket, store, SUIT, updateRaiseLabel(), urlCode

### Community 5 - "Hébergement Render"
Cohesion: 0.25
Nodes (7): services, buildCommand, name, plan, runtime, startCommand, type

### Community 8 - "Présentation du jeu"
Cohesion: 0.40
Nodes (6): Écran d'accueil, Jetons fictifs, aucun argent réel, Mise en ligne gratuite sur Render, Mode entre amis (code de table), Mode solo contre IA (3 difficultés), Street Poker (README)

### Community 10 - "Écran de table"
Cohesion: 0.67
Nodes (3): Barre d'actions (coucher/suivre/relancer), Écran de table, Salle d'attente (lobby)

## Knowledge Gaps
- **4 isolated node(s):** `Jetons fictifs, aucun argent réel`, `Mise en ligne gratuite sur Render`, `Salle d'attente (lobby)`, `Barre d'actions (coucher/suivre/relancer)`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 52 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Table` connect `Table : état et timers` to `IA et tests`, `Serveur Socket.IO`, `Actions des joueurs`, `Tours d'enchères et abattage`, `Début de main et blinds`, `Ajout de joueurs`?**
  _High betweenness centrality (0.282) - this node is a cross-community bridge._
- **What connects `Jetons fictifs, aucun argent réel`, `Mise en ligne gratuite sur Render`, `Salle d'attente (lobby)` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Serveur Socket.IO` be split into smaller, more focused modules?**
  _Cohesion score 0.12280701754385964 - nodes in this community are weakly interconnected._
- **Why does `socket.io` connect `Config npm` to `Serveur Socket.IO`?**
  _High betweenness centrality (0.178) - this node is a cross-community bridge._
- **Should `Config npm` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._