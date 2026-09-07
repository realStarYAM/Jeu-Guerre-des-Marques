# ⚔️ Guerre des Marques

Jeu de combat en **HTML / CSS / JavaScript pur** (aucune dépendance au runtime, fonctionne hors-ligne).
Onze marques technologiques s'affrontent dans une arène : **Apple, Samsung, Xiaomi, Huawei, Google, Microsoft, Sony, Nintendo, AMD, NVIDIA, Intel**.

## 🚀 Lancer le jeu

```bash
npm start          # sert le jeu sur http://localhost:8000
# ou, sans npm :
python3 -m http.server 8000 --bind 0.0.0.0
```

Il suffit ensuite d'ouvrir `index.html` dans un navigateur (le serveur n'est nécessaire que pour un hébergement classique).

## 🎮 Ce que fait le jeu

| Demande | Implémentation |
| --- | --- |
| Marques avec PV, attaque, défense, vitesse, pouvoir spécial | `js/brands.js` — 11 fiches complètes + 11 pouvoirs uniques |
| Animations de combat | charge, impact, secousse, flash, éclats, onde de choc, slash (`css/style.css` + `js/ui.js`) |
| Barre de vie | barre dégradée vert → orange → rouge, traînée fantôme, chiffres animés, pulsation sous 25 % |
| Effets critiques | ×1,8 dégâts, bannière « CRITIQUE ! », secousse d'écran, éclats dorés, ligne surlignée dans l'historique |
| K.O. | ralenti, chute du perdant en niveaux de gris, slam « K.O. », confettis pour le vainqueur, panneau de résultat |
| Historique des attaques | panneau dédié (round, auteur, action, dégâts, tags CRITIQUE / ESQUIVE / BLOQUÉ / SPÉCIAL / ×N) + fil du combat |

### Modes de jeu

- **Duel** : choisissez votre marque puis votre adversaire.
- **Tournoi** : une marque contre les 10 autres, de la plus abordable à la plus redoutable, avec parcours affiché.
- **Combat auto** : deux marques aléatoires jouées par l'IA, pour regarder le spectacle.

### Commandes

`⚔️ Attaque` · `🛡️ Défense` · `⚡ Pouvoir spécial` (jauge d'énergie) · `🤖 Auto` · `⏩ ×1/×2/×3`
Raccourcis clavier : **A** attaquer, **D** défendre, **S** spécial, **Espace** continuer, **M** son.

## ⚙️ Règles de calcul

```
dégâts ≈ attaque × (0,85 → 1,15) × 0,9 × (1 − défense / (défense + 160))
critique : 5 % + vitesse × 0,1 % (+ bonus), plafond 75 %, multiplicateur ×1,8
esquive  : 3 % + (vitesse cible − vitesse attaquant) × 0,35 %, plafond 25 %
garde    : −55 % de dégâts encaissés, +3 % PV, +20 énergie
énergie  : +16 en frappant, +9 en encaissant, +20 en gardant, +4 par round
```

## 📁 Structure

```
index.html            Écrans (menu, règles, sélection, arène, palmarès) + overlays K.O./résultat
css/style.css         Design, barres, animations de combat, effets, responsive
js/brands.js          Données des 11 marques (stats + pouvoirs spéciaux)
js/engine.js          Moteur de combat pur (sans DOM) : dégâts, critiques, esquives, buffs, K.O., IA
js/audio.js           Effets sonores synthétisés en Web Audio (aucun fichier externe)
js/ui.js              Rendu, animations, historique, tournoi, palmarès (localStorage)
test/engine.test.js   15 tests du moteur (formules, critiques, esquive, garde, buffs, K.O., équilibrage)
test/ui.test.js       4 tests d'intégration jsdom : duel complet, boutons joueur, réglages, tournoi
tools/balance.js      Rapport d'équilibrage (matrice des taux de victoire)
```

## ✅ Tests

```bash
npm install          # installe jsdom (tests d'interface uniquement)
npm test             # moteur + interface
npm run balance      # taux de victoire de chaque marque (miroir, 24 graines)
```

Équilibrage actuel : toutes les marques gagnent entre **41 % et 60 %** de leurs duels en miroir,
pour des combats de **8 à 19 rounds** en moyenne.
