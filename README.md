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
| **Jauge Ultime 0 → 100 %** | jauge indépendante de l'énergie, visible sous chaque combattant |
| **11 ultimes uniques** | `js/brands.js` — Reality Distortion, Galaxy Storm, HyperCharge, Harmony Strike, Gemini Blast, Windows Overdrive, PlayStation Rage, Super Star, Ryzen Fury, RTX Overdrive, Core Boost |
| **Cinématique d'ultime** | plan plein écran : rayons, bandes, portrait de la marque, slam du nom de l'ultime, éclats lumineux, bandes letterbox (`#cine`) |
| **Écran qui tremble** | secousse douce de toute la page sur critique, secousse appuyée sur ultime et K.O. (`body.is-quake` / `.is-quake-hard`) |
| **Dégâts critiques** | ×1,8 dégâts, bannière « CRITIQUE ! », éclats dorés, ligne surlignée dans l'historique ; les ultimes frappent en critique garanti |
| **Cooldown d'ultime** | 2 tours de recharge : la jauge est vidée, verrouillée (rayures + compteur) et ne se remplit plus |
| **Historique détaillé** | chaque ligne est dépliable : impacts un par un, critiques, esquives, soin, PV restants des deux camps, jauge d'ultime, effets appliqués + récapitulatif chiffré et filtres (Ultimes / Critiques / Soins) |
| Animations de combat | charge, impact, onde de choc, slash, montée en puissance de l'ultime |
| Barre de vie | dégradée vert → orange → rouge, traînée fantôme, chiffres animés, pulsation sous 25 % |
| K.O. | ralenti, chute du perdant, slam « K.O. », confettis, panneau de résultat (avec compteur d'ultimes) |

### ⚡ Jauge Ultime

Indépendante de la jauge d'énergie, elle se remplit pendant le combat :

```
+14 % en frappant   ·   +9 % en encaissant   ·   +12 % en se défendant   ·   +4 % par round
```

À **100 %**, le bouton `✦ Ultime` (ou la touche <kbd>U</kbd>) déclenche l'attaque spéciale :
cinématique plein écran, secousse d'écran, dégâts critiques, effets propres à la marque.
Un ultime **ne peut être ni esquivé, ni réduit par la garde**.

Suit un **cooldown de 2 tours** : la jauge repart de 0 %, se raye de gris et affiche le compteur de recharge ;
elle ne recommence à monter qu'une fois la recharge terminée.

| Marque | Ultime | Effet |
| --- | --- | --- |
| Apple | Reality Distortion | Ignore 100 % de la défense, critique garanti, absorbe 35 % des dégâts, dissipe les buffs adverses |
| Samsung | Galaxy Storm | 5 météores puis −30 % de défense adverse pendant 2 tours |
| Xiaomi | HyperCharge | 3 décharges critiques puis +40 % attaque / +25 % critique (3 tours) |
| Huawei | Harmony Strike | Frappe perçante critique et adversaire paralysé 2 tours |
| Google | Gemini Blast | Rafale critique, critiques garantis 3 tours, +25 % vitesse |
| Microsoft | Windows Overdrive | Frappe, +28 % PV, +80 % attaque et +40 % défense (4 tours) |
| Sony | PlayStation Rage | 3 impacts critiques enchaînés |
| Nintendo | Super Star | Frappe critique, +12 % PV et invulnérable 2 tours |
| AMD | Ryzen Fury | Frappe critique dévastatrice, +60 % attaque / +35 % critique, 8 % de PV brûlés |
| NVIDIA | RTX Overdrive | Brise l'invulnérabilité, ignore 85 % de la défense, critique garanti |
| Intel | Core Boost | 4 cœurs frappent en critique puis +50 % défense (3 tours) |

### Modes de jeu

- **Duel** : choisissez votre marque puis votre adversaire.
- **Tournoi** : une marque contre les 10 autres, de la plus abordable à la plus redoutable, avec parcours affiché.
- **Combat auto** : deux marques aléatoires jouées par l'IA, pour regarder le spectacle.

### Commandes

`⚔️ Attaque` · `🛡️ Défense` · `⚡ Pouvoir spécial` · `✦ Ultime` · `🤖 Auto` · `⏩ ×1/×2/×3`
Raccourcis clavier : **A** attaquer, **D** défendre, **S** spécial, **U** ultime, **Espace** continuer, **M** son.

## ⚙️ Règles de calcul

```
dégâts   ≈ attaque × (0,85 → 1,15) × 0,9 × (1 − défense / (défense + 160))
critique : 5 % + vitesse × 0,1 % (+ bonus), plafond 75 %, multiplicateur ×1,8
esquive  : 3 % + (vitesse cible − vitesse attaquant) × 0,35 %, plafond 25 %
garde    : −55 % de dégâts encaissés, +3 % PV, +20 énergie, +12 % ultime
énergie  : +16 en frappant, +9 en encaissant, +20 en gardant, +4 par round
ultime   : +14 en frappant, +9 en encaissant, +12 en gardant, +4 par round
           → déclenchable à 100 %, puis 2 tours de recharge (jauge bloquée)
```

## 📁 Structure

```
index.html            Écrans (menu, règles, sélection, arène, palmarès) + cinématique d'ultime et overlays
css/style.css         Design, barres (PV / énergie / ultime), cinématique, secousses, responsive
js/brands.js          Données des 11 marques : stats, pouvoirs spéciaux et ultimes
js/engine.js          Moteur de combat pur (sans DOM) : dégâts, critiques, esquives, buffs, ultimes, cooldown, IA
js/audio.js           Effets sonores synthétisés en Web Audio (dont le thème d'ultime)
js/ui.js              Rendu, cinématique, secousses, historique détaillé, tournoi, palmarès (localStorage)
test/engine.test.js   20 tests du moteur (formules, ultimes, cooldown, K.O., équilibrage)
test/ui.test.js       5 tests d'intégration jsdom : duel complet, boutons joueur, réglages, ultime, tournoi
tools/balance.js      Rapport d'équilibrage (matrice des taux de victoire)
```

## ✅ Tests

```bash
npm install          # installe jsdom (tests d'interface uniquement)
npm test             # moteur + interface
npm run balance      # taux de victoire de chaque marque (miroir, 24 graines)
```

Équilibrage actuel : toutes les marques gagnent entre **44 % et 56 %** de leurs duels en miroir,
pour des combats de **6 à 13 rounds** en moyenne, avec **≈ 1,8 ultime déclenché par combat**.
