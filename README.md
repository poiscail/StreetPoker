# Street Poker

Texas Hold'em entre amis dans le navigateur (téléphone ou PC). **Jetons fictifs uniquement, aucun argent réel.**

- Entre amis : crée une table, partage le code (ou le lien), 2 à 8 joueurs. Tu peux ajouter des IA.
- Solo : contre 1 à 7 IA (Facile, Moyen, Difficile).
- Règles complètes : blinds 10/20, relances, tapis, side pots, abattage. Un joueur déconnecté passe ou se couche automatiquement et retrouve sa place s'il recharge la page.
- Le serveur garde les cartes : chacun ne reçoit que les siennes.

## Lancer en local

```bash
npm install
npm start
```

Puis ouvrir http://localhost:3000.

## Tests

```bash
npm test
```

## Mettre en ligne (gratuit, Render)

1. Va sur https://render.com, clique **Get Started** et connecte-toi avec GitHub.
2. **New → Blueprint**, choisis le dépôt `StreetPoker`, puis **Apply** (le fichier `render.yaml` règle tout, offre Free).
3. Après 2-3 minutes, l'adresse du jeu s'affiche (ex. `https://street-poker-xxxx.onrender.com`). Partage-la.

En offre gratuite, le serveur s'endort après 15 min sans joueur : la première ouverture prend environ 1 minute.
