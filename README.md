# Games App

Classement des quatre jeux LinkedIn — **Queens, Tango, Zip, Patches** — pour les six joueurs
du groupe, à partir des résultats partagés dans la conversation LinkedIn.

## Comment ça marche

Les résultats partagés par LinkedIn ont toujours la même forme :

```
Queens #876 | 0:08 sans erreur ni indice
Zip #555 | 0:11 🏁
```

Le parser lit le **jeu**, le **numéro de grille** et le **temps**, et ignore tout le reste
(commentaires, hashtags, blocs d'emoji, texte en français ou en anglais).

Le numéro de grille est la clé : il identifie la journée de façon fiable, donc un résultat
posté en retard ou dans un autre fuseau est rattaché à la bonne grille.

## Règles de classement

- **Temps brut uniquement.** Les mentions « sans erreur », « sans indice », « avec 2 retours en
  arrière », « 1 nouvelle chance » sont volontairement ignorées.
- **Égalité = même médaille**, et la place suivante est sautée (deux premiers à 0:17 → 🥇 🥇 🥉).
- **Les médailles ne sont attribuées qu'entre les joueurs ayant posté cette grille.** Ne pas
  poster ne coûte rien : on n'apparaît simplement pas sur le podium.
- **Le premier score enregistré est définitif.** Reposter la même grille avec un meilleur temps
  ne change rien.
- Un temps illisible est **écarté**, jamais compté comme zéro — un zéro donnerait une médaille
  d'or à quelqu'un par erreur.
- `Pinpoint`, `Crossclimb` et `Mini Sudoku` sont comptés puis ignorés (le rapport d'import
  indique combien).

## Mettre à jour le classement

```bash
npm run import   # raw/*.txt  ->  public/data/results.json
```

1. Sélectionner la conversation dans LinkedIn, copier.
2. Coller dans `raw/<date>.txt`.
3. `npm run import` — l'import fusionne, dédoublonne et signale toute ligne non comprise.
4. Commiter `public/data/results.json` et pousser. GitHub Pages republie tout seul.

Coller deux fois la même période est sans effet : la fusion se fait sur
`(joueur, jeu, grille)` et le score déjà enregistré gagne.

L'app contient aussi une zone **« Ajouter des résultats »** pour coller directement dans le
navigateur. C'est un **aperçu local** — pratique pour vérifier avant de commiter, mais les
autres ne le voient pas tant que `results.json` n'est pas poussé.

## Vie privée

- `raw/` est dans `.gitignore`. La conversation brute n'entre **jamais** dans le dépôt.
- Seul le dérivé est commité : prénom court, jeu, numéro de grille, temps. Pas de texte de
  message, pas d'URL de profil, pas de nom complet.
- Les noms complets n'apparaissent que dans `src/lib/players.js`, qui sert à faire
  correspondre les expéditeurs LinkedIn aux libellés affichés.

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run import` | `raw/*.txt` → `public/data/results.json` |
| `npm test` | Vérifie les règles de classement (égalités, podiums partiels, dédoublonnage) |
| `npm run report` | Affiche en console ce que le parser a lu, grille par grille |
| `npm run dev` | Serveur de dev |
| `npm run build` | Build de production dans `dist/` |

## Mise en ligne

Le workflow `deploy.yml` joue les tests, build, vérifie que le scoreboard n'est pas vide, puis
publie sur GitHub Pages à chaque push sur `main`.

Une étape est manuelle et ne peut pas être automatisée : activer Pages dans
**Settings → Pages → Source: GitHub Actions**.
