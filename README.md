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
| **Cinématique d'ultime** | en 3 temps : l'arène s'assombrit et se zoome → zoom sur la marque (portrait + halo) → explosion de couleurs, `ULTIMATE !`, nom du pouvoir en énorme, flash, particules et vibration (`#cine`) |
| **Bannière de résultat** | après les dégâts : `CRITICAL !`, `BLOCK !`, `DODGE !` ou `K.O. !` selon le résultat de l'ultime |
| **Un style par marque** | 11 systèmes de particules (éclats de verre, météores, éclairs, ondes radar, pixels, tuiles, glitch, étoiles, braises, rayons, hexagones) + 11 zooms et habillages de texte distincts |
| **Animations longues / courtes** | bouton `🎬 Ciné` : coupe zoom, particules et bandes pour une version courte (~0,45 s), préférence mémorisée |
| **Écran qui tremble** | secousse douce de toute la page sur critique, secousse appuyée sur ultime et K.O. (`body.is-quake` / `.is-quake-hard`) |
| **Dégâts critiques** | ×1,8 dégâts, bannière « CRITIQUE ! », éclats dorés, ligne surlignée dans l'historique ; la plupart des ultimes frappent en critique garanti |
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

À **100 %**, le bouton `✦ Ultime` (ou la touche <kbd>U</kbd>) déclenche l'attaque spéciale.
Un ultime **ne peut être ni esquivé, ni réduit par la garde**.

Déroulé de la cinématique (≈ 2 s, ou ≈ 0,45 s en mode court) :

1. l'arène **s'assombrit** et se zoome légèrement, le combattant monte en puissance ;
2. **zoom sur la marque** : le portrait arrive du côté du combattant, halo et rayons ;
3. **« ULTIMATE ! »** claque, puis le **nom du pouvoir en énorme** au centre, avec flash,
   particules aux couleurs de la marque et vibration visuelle ;
4. la cinématique se referme, **les dégâts sont alors appliqués** ;
5. une **bannière de résultat** s'affiche : `CRITICAL !`, `BLOCK !`, `DODGE !` ou `K.O. !`.

Le bouton **`🎬 Ciné`** de la barre d'arène bascule entre animations longues et courtes
(le mode court garde l'assombrissement, le nom du pouvoir et la bannière, mais supprime
zoom, particules et bandes). Le choix est mémorisé dans le navigateur.

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
- **👑 Boss Rush** : votre marque entre en *surrégime* et enchaîne les boss (voir ci-dessous).

### 👑 Boss Rush

Cinq boss, puis un **boss secret** qui n'apparaît qu'après avoir vaincu les cinq autres.

| Boss | PV | Pouvoir |
| --- | --- | --- |
| 🤖 MEGA TECH | 1 200 | Surcharge technologique — décharge périodique qui perce la défense |
| 🔥 OVERCLOCK | 1 500 | Montée en température — son attaque grimpe à chaque tour |
| 🌌 QUANTUM CORE | 1 800 | Déphasage quantique — esquive une partie des attaques |
| ☠️ CORRUPTED AI | 2 200 | Copie des capacités — en phase 2, elle vole votre pouvoir et votre ultime |
| 👑 THE FINAL BRAND | 3 000 | Trois phases royales : 50 % puis 25 % de PV |
| 🕳️ NULL SECTOR | 4 200 | Boss secret — absorption du vide et copie intégrale |

Chaque boss possède une **barre de PV dédiée** (avec repères de phase), **plusieurs phases de
combat**, des **attaques et un ultime uniques**, un **passif** qui lui est propre, ses **effets
visuels**, sa **musique de boss** générée en Web Audio, une **cinématique d'introduction** et une
**animation de K.O.** Sous les 50 % de PV, le crie « **PHASE 2 !** » : il change de nom, de
couleurs, de statistiques et d'attaques.

Quatre difficultés — 🟢 Normal, 🟣 Difficile, 🔴 Extrême, ⚫ Impossible — majorent les
statistiques du boss et les récompenses (×1 à ×4 d'XP).

Récompenses à chaque boss tombé : **XP**, **badge**, **skin exclusif** (portable par toutes les
marques), **titre de profil** et **trophées exclusifs**. L'écran Boss Rush récapitule boss
vaincus, meilleur temps, dégâts infligés, marque utilisée, difficulté et récompenses obtenues.

### 📈 Progression

Chaque marque et le joueur gagnent de l'XP à chaque combat et montent du niveau 1 à 100
(les statistiques grimpent de +20 % au total). Au programme : raretés, skins débloqués par
niveau, badges de maîtrise, huit rangs du joueur (Bronze → Champion), douze trophées généraux
et huit trophées de boss, écran de récompenses après chaque combat et page **Profil**.
Tout est sauvegardé dans `localStorage` (`guerreDesMarques.meta.v1`).

### Commandes

`⚔️ Attaque` · `🛡️ Défense` · `⚡ Pouvoir spécial` · `✦ Ultime` · `🤖 Auto` · `🎬 Ciné` · `⏩ ×1/×2/×3`
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
index.html            Écrans (menu, règles, sélection, arène, Boss Rush, profil, palmarès) + cinématiques et overlays
css/style.css         Design, barres (PV / énergie / ultime), cinématique par marque, particules, boss, skins, responsive
js/brands.js          Données des 11 marques : stats, raretés, pouvoirs spéciaux et ultimes
js/bosses.js          Boss Rush : 6 boss (phases, passifs, musiques), 4 difficultés, récompenses
js/engine.js          Moteur de combat pur (sans DOM) : dégâts, critiques, esquives, buffs, ultimes, cooldown, IA, phases de boss
js/progression.js     XP, niveaux, raretés, skins, badges, rangs, trophées, récompenses de boss (localStorage)
js/audio.js           Effets sonores synthétisés en Web Audio (+ musiques de boss et bruitages de phase)
js/ui.js              Rendu, cinématiques d'ultime et de boss, historique détaillé, profil, palmarès (localStorage)
test/engine.test.js   20 tests du moteur (formules, ultimes, cooldown, K.O., équilibrage)
test/progression.test.js  14 tests de la progression (XP, niveaux, skins, rangs, trophées)
test/boss.test.js     14 tests du Boss Rush (phases, passifs, difficultés, récompenses, boss secret)
test/ui.test.js       14 tests d'intégration jsdom : duel, tournoi, ultime, profil, récompenses, Boss Rush
tools/balance.js      Rapport d'équilibrage (matrice des taux de victoire)
```

## ✅ Tests

```bash
npm install          # installe jsdom (tests d'interface uniquement)
npm test             # moteur + progression + boss + interface (62 tests)
npm run test:boss    # Boss Rush uniquement
npm run balance      # taux de victoire de chaque marque (miroir, 24 graines)
```

Équilibrage actuel : toutes les marques gagnent entre **44 % et 56 %** de leurs duels en miroir,
pour des combats de **6 à 13 rounds** en moyenne, avec **≈ 1,8 ultime déclenché par combat**.

La cinématique, les particules et les bannières sont **purement visuelles** : elles ne
modifient ni les dégâts, ni les statistiques, ni l'équilibrage.
