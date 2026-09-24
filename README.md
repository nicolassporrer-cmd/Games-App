# Les Kings et les Queens du Queens - Leaderboard

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

## Coefficients

Pondération par difficulté dans le classement général : **Queens ×4, Tango ×3, Zip ×1,
Patches ×1**. Les coefficients sont définis dans `COEFFICIENTS` (`src/lib/ranking.js`),
affichés sous chaque en-tête de colonne, et la phrase d'explication au-dessus du tableau est
générée à partir d'eux — elle ne peut donc pas devenir fausse si on les change.

Le coefficient est appliqué **à chaque rang séparément** (or pondéré, puis argent pondéré,
puis bronze pondéré), ce qui conserve le départage olympique sans inventer une valeur en
points pour l'or, l'argent et le bronze.

Deux choses qu'il ne touche jamais :

- **Les colonnes par jeu restent en médailles brutes.** Un or au Tango vaut un or dans la
  colonne Tango ; le doubler y serait un faux compte rendu. Survoler un total pondéré affiche
  le nombre réel de médailles.
- **Les onglets d'un seul jeu affichent le brut.** Multiplier toutes les médailles par le même
  facteur ne change pas l'ordre — seuls les nombres seraient gonflés, donc inutilement
  trompeurs.

« Parties » compte des grilles, pas des médailles : jamais pondéré.

## Périodes et dates

Deux rangées d'onglets : le **jeu** (Tout, Queens, Tango, Zip, Patches) et la **période**
(Tout le temps, 30 derniers jours, 7 derniers jours). Les médailles sont **recalculées** dans
la période choisie — un podium n'a de sens qu'entre les joueurs présents sur cette période.

Les messages LinkedIn ne portent pas de date exploitable : l'interface affiche « lundi » ou
« Aujourd'hui », et un copier-coller ne capture que ça. Les dates sont donc **déduites** du
numéro de grille via l'ancre définie dans `src/lib/dates.js`.

Cette ancre a été vérifiée de quatre façons indépendantes : sur l'échantillon du 21 au
23 septembre 2026, Queens, Tango, Zip et Patches avancent chacun d'exactement 1 par jour, et
les séparateurs de jour du copier-coller (lundi / mardi / Aujourd'hui) correspondent bien aux
21 / 22 / 23 septembre.

Limite assumée : si LinkedIn interrompait un jeu une journée, toutes les dates **antérieures**
à cette pause décaleraient d'un jour. Cela pourrait faire entrer ou sortir une grille d'une
fenêtre de 30 jours, mais ne peut ni réordonner ni modifier un score — les médailles sont
toujours calculées à partir du numéro de grille, jamais de la date.

## Mettre à jour le classement

```bash
npm run import   # raw/*.txt + raw/*.xlsx|csv  ->  public/data/results.json
```

1. Sélectionner la conversation dans LinkedIn, copier.
2. Coller dans `raw/<date>.txt`.
3. `npm run import` — l'import fusionne, dédoublonne et signale toute ligne non comprise.
4. Commiter `public/data/results.json` et pousser. GitHub Pages republie tout seul.

Deux sources, un seul import :

- **`raw/*.txt`** — la conversation copiée-collée depuis le navigateur.
- **`raw/*.xlsx` ou `raw/*.csv`** — l'export LinkedIn (« obtenir une copie de vos données »),
  avec l'expéditeur en colonne `FROM` et le message en colonne `CONTENT`. Sert au rattrapage
  historique. L'export encode l'UTF-8 en CP1252 (« n° » devient « nÂ° ») ; `repairMojibake`
  inverse ce décodage, sinon ces lignes seraient illisibles.

Les deux alimentent le même dédoublonnage et peuvent donc se mélanger librement. Les exports
sont lus en premier, donc en cas de chevauchement c'est la valeur de l'export qui est retenue.

La colonne `DATE` de l'export n'est **pas** utilisée comme date du résultat : une grille
appartient à sa propre journée, pas au moment où quelqu'un a pensé à la poster (1,16 % de
l'historique a été posté le lendemain). Elle a servi à valider l'ancre de `dates.js` : sur
3 368 résultats, 98,84 % ont été postés exactement à la date déduite du numéro de grille, le
reste le lendemain, aucun avant. Sur les plus anciens — Zip #269, Tango #430, Queens #590 —
les trois compteurs donnent 2025-12-11, soit exactement le jour d'envoi.

« Grille par grille » n'affiche que les **32 grilles les plus récentes** : l'historique complet
en compte plus de 1 000, ce qui rendrait la page inutilisable sur téléphone. Le tableau des
médailles, lui, couvre bien toute la période.

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
