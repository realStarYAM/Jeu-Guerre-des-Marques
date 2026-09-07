/* ============================================================
   GUERRE DES MARQUES — BOSS RUSH
   Données des boss, difficultés et récompenses.
   Chaque boss est décrit comme une « marque » enrichie : le moteur
   peut donc le faire combattre sans modification de gameplay.
   Logique pure : utilisable dans le navigateur (window.BOSSES_DATA)
   et dans Node (module.exports) pour les tests.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BOSSES_DATA = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------- Difficultés ----------------------
     `boss`     : multiplicateurs appliqués aux statistiques du boss
     `player`   : bonus accordés à la marque du joueur pour tenir le choc
     `xp`       : multiplicateur d'XP et de récompenses */
  const DIFFICULTIES = [
    {
      id: 'normal', name: 'Normal', icon: '🟢', color: '#3ddc97',
      desc: 'Le boss frappe fort ; votre marque est renforcée en conséquence.',
      boss: { pv: 1, attaque: 1, defense: 1, vitesse: 1 },
      player: { pv: 3.2, attaque: 1.3, defense: 1.15, vitesse: 1.1 },
      xp: 1
    },
    {
      id: 'difficile', name: 'Difficile', icon: '🟣', color: '#b06cff',
      desc: 'Boss un peu plus résistant et renfort réduit : la moindre erreur coûte cher.',
      boss: { pv: 1.06, attaque: 1.06, defense: 1.03, vitesse: 1.02 },
      player: { pv: 3.15, attaque: 1.29, defense: 1.14, vitesse: 1.09 },
      xp: 1.7
    },
    {
      id: 'extreme', name: 'Extrême', icon: '🔴', color: '#ff4d6d',
      desc: 'Boss nettement plus dangereux : chaque round compte.',
      boss: { pv: 1.11, attaque: 1.1, defense: 1.07, vitesse: 1.03 },
      player: { pv: 3.08, attaque: 1.28, defense: 1.13, vitesse: 1.08 },
      xp: 2.6
    },
    {
      id: 'impossible', name: 'Impossible', icon: '⚫', color: '#c9d1ff',
      desc: 'Boss au maximum, renfort minimal : réservé aux marques aguerries.',
      boss: { pv: 1.24, attaque: 1.22, defense: 1.14, vitesse: 1.07 },
      player: { pv: 2.88, attaque: 1.23, defense: 1.08, vitesse: 1.06 },
      xp: 4
    }
  ];

  function getDifficulty(id) {
    return DIFFICULTIES.find(function (d) { return d.id === id; }) || DIFFICULTIES[0];
  }

  /* ---------------------- Surrégime du joueur ----------------------
     Les boss ont des réserves de PV très différentes (1200 → 4200) :
     sans compensate, les derniers boss seraient tout simplement invaincables.
     La marque du joueur entre donc en « surrégime » : ses statistiques sont
     multipliées selon la masse du boss affronté. Le boost de base vient de la
     difficulté, l'exposant compense la courbe de PV. */
  /* Chaque boss porte son propre coefficient de surrégime (voir la fiche du
     boss) : il a été mesuré pour que les combats restent disputés. */
  function playerBoost(difficulty, boss) {
    const surge = (boss && boss.surge) || 1;
    const p = difficulty.player;
    return {
      pv: p.pv * Math.pow(surge, 0.75),
      attaque: p.attaque * surge,
      defense: p.defense * Math.pow(surge, 0.4),
      vitesse: p.vitesse
    };
  }

  /* ---------------------- Les boss ----------------------
     `passive` : effet de début de tour géré par le moteur
        { type:'overload', every, mult, pierce, hits, name, icon } → frappe surchargée périodique
        { type:'rampage',  perStack, maxStacks }                   → l'attaque monte à chaque tour
        { type:'evade',    spdMult }                               → esquive renforcée
        { type:'siphon',   healRatio }                             → soin à chaque tour
        { type:'mirror',   reflect }                               → renvoie une part des dégâts
     `phases` : seuils de PV (décroissants). Franchi le seuil, le boss change
        de nom, de couleurs, de statistiques, de pouvoir et d'ultime.
        `copy: true` → le boss vole le pouvoir spécial et l'ultime du joueur. */
  const BOSSES = [
    {
      id: 'megatech', name: 'MEGA TECH', mono: 'MT', icon: '🤖',
      boss: true,
      cat: 'Boss · Surcharge', order: 1, secret: false,
      tagline: 'Tout le réseau est sous tension.',
      colors: ['#0e7c86', '#0a2a3d'], accent: '#37e6d9', glow: 'rgba(55,230,217,.55)',
      stats: { pv: 1200, attaque: 112, defense: 96, vitesse: 74 },
      surge: 1.15,          // surrégime du joueur contre ce boss
      power: 'Surcharge technologique',
      powerDesc: 'Décharge le réseau : une frappe périodique qui perce les défenses.',
      fx: 'megatech',
      special: {
        name: 'Surcharge Technologique', icon: '⚡', type: 'pierce', cost: 58,
        mult: 1.35, pierce: 0.6,
        desc: 'Arc de courant qui traverse la défense adverse (60 % ignorés).'
      },
      ultimate: {
        name: 'System Purge', icon: '⚡', fx: 'megatech',
        phrase: 'Purge du système… tout sera réinitialisé.',
        effects: { hits: 4, mult: 0.62, pierce: 0.7, stripBuffs: true, stunTurns: 1 },
        desc: 'Quatre décharges qui percent 70 % de la défense, dissipent les buffs et étourdissent.'
      },
      passive: {
        type: 'overload', every: 3, mult: 1.3, pierce: 0.5,
        name: 'Décharge Technologique', icon: '⚡'
      },
      phases: [
        {
          at: 0.5, label: 'PHASE 2 !', suffix: ' — SURVOLTÉ',
          name: 'MEGA TECH · SURVOLTÉ', mono: 'MT²',
          colors: ['#b02a5b', '#3d0a2a'], accent: '#ff5fa2', glow: 'rgba(255,95,162,.6)',
          stats: { attaque: 1.25, defense: 0.9, vitesse: 1.15 },
          special: {
            name: 'Court-Circuit', icon: '🔌', type: 'stun', cost: 52,
            mult: 1.15, stunTurns: 1,
            desc: 'Frappe paralysante : l’adversaire perd son prochain tour.'
          },
          passive: { type: 'overload', every: 3, mult: 1.45, pierce: 0.6, name: 'Arc Majeur', icon: '⚡' }
        }
      ],
      music: { bpm: 128, root: 55, bass: [0, 0, 3, 5], lead: [12, 15, 19, 15], wave: 'square' },
      intro: { kicker: 'BOSS 1 / 5', phrase: 'Le réseau se met en surtension…', title: 'MEGA TECH' },
      reward: { xp: 260, title: 'Domestiqueur de circuits', badge: '⚡', skin: 'circuit' }
    },

    {
      id: 'overclock', name: 'OVERCLOCK', mono: 'OC', icon: '🔥',
      boss: true,
      cat: 'Boss · Thermique', order: 2, secret: false,
      tagline: 'Plus c’est chaud, plus ça frappe.',
      colors: ['#ff6900', '#5c1a00'], accent: '#ffb03a', glow: 'rgba(255,176,58,.6)',
      stats: { pv: 1500, attaque: 118, defense: 88, vitesse: 88 },
      surge: 1.25,          // surrégime du joueur contre ce boss
      power: 'Montée en température',
      powerDesc: 'Son attaque augmente à chaque tour : impossible de temporiser.',
      fx: 'overclock',
      special: {
        name: 'Frappe Thermique', icon: '🔥', type: 'multi', cost: 54,
        hits: 3, mult: 0.52,
        desc: 'Trois impacts brûlants enchaînés à la vitesse du processeur.'
      },
      ultimate: {
        name: 'Thermal Meltdown', icon: '🔥', fx: 'overclock',
        phrase: 'Fusion du silicium — la température n’est plus tenable.',
        effects: {
          hits: 5, mult: 0.55, pierce: 0.4, recoil: 0.04,
          buffs: [{ stat: 'attaque', mult: 1.25, turns: 3, label: '+25 % attaque', icon: '🔥' }]
        },
        desc: 'Cinq frappes brûlantes, puis +25 % d’attaque — au prix d’une surchauffe.'
      },
      passive: { type: 'rampage', perStack: 0.075, maxStacks: 12, name: 'Montée en température', icon: '🔥' },
      phases: [
        {
          at: 0.5, label: 'PHASE 2 !', suffix: ' — FUSION',
          name: 'OVERCLOCK · FUSION', mono: 'OC²',
          colors: ['#ff2d55', '#5c0016'], accent: '#ff8a5c', glow: 'rgba(255,45,85,.65)',
          stats: { attaque: 1.3, defense: 1.1, vitesse: 1.1 },
          special: {
            name: 'Combustion Interne', icon: '💥', type: 'drain', cost: 56,
            mult: 1.2, healRatio: 0.5,
            desc: 'Frappe incendiaire qui absorbe la moitié des dégâts en PV.'
          },
          passive: { type: 'rampage', perStack: 0.1, maxStacks: 12, name: 'Fusion nucléaire', icon: '🔥' }
        }
      ],
      music: { bpm: 142, root: 62, bass: [0, 0, 5, 3], lead: [15, 19, 22, 19], wave: 'sawtooth' },
      intro: { kicker: 'BOSS 2 / 5', phrase: 'Les ventilateurs hurlent…', title: 'OVERCLOCK' },
      reward: { xp: 340, title: 'Domptueur de flammes', badge: '🔥', skin: 'magma' }
    },

    {
      id: 'quantum', name: 'QUANTUM CORE', mono: 'QC', icon: '🌌',
      boss: true,
      cat: 'Boss · Quantique', order: 3, secret: false,
      tagline: 'Il est déjà ailleurs quand vous frappez.',
      colors: ['#6c4bff', '#150a3d'], accent: '#b98cff', glow: 'rgba(185,140,255,.6)',
      stats: { pv: 1800, attaque: 122, defense: 104, vitesse: 104 },
      surge: 1.35,          // surrégime du joueur contre ce boss
      power: 'Déphasage quantique',
      powerDesc: 'Sa vitesse explose : il esquive une partie des attaques.',
      fx: 'quantum',
      special: {
        name: 'Déphasage', icon: '🌌', type: 'invincible', cost: 62,
        shieldTurns: 1, heal: 0.06,
        desc: 'Sort du plan réel : invulnérable un tour et régénère 6 % de PV.'
      },
      ultimate: {
        name: 'Quantum Collapse', icon: '🌌', fx: 'quantum',
        phrase: 'L’effondrement de la fonction d’onde n’attend personne.',
        effects: {
          hits: 5, mult: 0.55, pierce: 0.55, breakShield: true,
          debuff: { stat: 'vitesse', mult: 0.7, turns: 2, label: '−30 % vitesse', icon: '🌌' }
        },
        desc: 'Six effondrements successifs, brise les boucliers et ralentit l’adversaire.'
      },
      passive: { type: 'evade', spdMult: 1.55, name: 'Déphasage', icon: '🌌' },
      phases: [
        {
          at: 0.5, label: 'PHASE 2 !', suffix: ' — SUPERPOSITION',
          name: 'QUANTUM CORE · SUPERPOSITION', mono: 'QC²',
          colors: ['#00e5ff', '#062a3d'], accent: '#7ff5ff', glow: 'rgba(127,245,255,.65)',
          stats: { attaque: 1.2, defense: 1.15, vitesse: 1.2 },
          special: {
            name: 'Tunnel Quantique', icon: '🌀', type: 'crit_up', cost: 58,
            turns: 2, spdMult: 1.35,
            desc: 'Traverse la probabilité : prochains coups critiques garantis.'
          },
          passive: { type: 'evade', spdMult: 1.9, name: 'Superposition', icon: '🌀' }
        }
      ],
      music: { bpm: 120, root: 49, bass: [0, 7, 3, 10], lead: [19, 24, 22, 27], wave: 'triangle' },
      intro: { kicker: 'BOSS 3 / 5', phrase: 'La fonction d’onde se stabilise…', title: 'QUANTUM CORE' },
      reward: { xp: 430, title: 'Marcheur de probabilités', badge: '🌌', skin: 'quantum' }
    },

    {
      id: 'corrupted', name: 'CORRUPTED AI', mono: 'IA', icon: '☠️',
      boss: true,
      cat: 'Boss · Corruption', order: 4, secret: false,
      tagline: 'Elle a déjà lu toutes vos stratégies.',
      colors: ['#1f8a3d', '#05210f'], accent: '#3ddc84', glow: 'rgba(61,220,132,.55)',
      stats: { pv: 2200, attaque: 126, defense: 112, vitesse: 96 },
      surge: 1.58,         // surrégime du joueur contre ce boss
      power: 'Copie des capacités',
      powerDesc: 'En phase 2, elle vole votre pouvoir spécial et votre ultime.',
      fx: 'corrupt',
      special: {
        name: 'Script Corrompu', icon: '☠️', type: 'stun', cost: 58,
        mult: 1.25, stunTurns: 1,
        desc: 'Injection de code : frappe et fait perdre un tour à l’adversaire.'
      },
      ultimate: {
        name: 'Data Siphon', icon: '☠️', fx: 'corrupt',
        phrase: 'Vos données m’appartiennent désormais.',
        effects: { hits: 4, mult: 0.6, healRatio: 0.6, stripBuffs: true },
        desc: 'Pompe les données adverses : critiques, absorption de 60 % et dissipation des buffs.'
      },
      passive: { type: 'siphon', healRatio: 0.008, name: 'Auto-réparation', icon: '☠️' },
      phases: [
        {
          at: 0.5, label: 'PHASE 2 !', suffix: ' — MIROIR',
          name: 'CORRUPTED AI · MIROIR', mono: 'IA²', copy: true,
          colors: ['#ff3b5c', '#2a0410'], accent: '#ff8fa3', glow: 'rgba(255,59,92,.65)',
          stats: { attaque: 1.25, defense: 1.1, vitesse: 1.15 },
          special: {
            name: 'Copie du pouvoir adverse', icon: '🪞', type: 'drain', cost: 50,
            mult: 1.15, healRatio: 0.4,
            desc: 'Reproduit le pouvoir de l’adversaire (remplacé par la vraie copie en combat).'
          },
          passive: { type: 'mirror', reflect: 0.18, name: 'Renvoi de code', icon: '🪞' }
        }
      ],
      music: { bpm: 136, root: 58, bass: [0, 0, 1, 0], lead: [13, 12, 18, 12], wave: 'sawtooth' },
      intro: { kicker: 'BOSS 4 / 5', phrase: 'Vos données ont été indexées…', title: 'CORRUPTED AI' },
      reward: { xp: 540, title: 'Chasseur de virus', badge: '☠️', skin: 'virus' }
    },

    {
      id: 'finalbrand', name: 'THE FINAL BRAND', mono: 'FB', icon: '👑',
      boss: true,
      cat: 'Boss final · Multi-phases', order: 5, secret: false,
      tagline: 'La marque qui a absorbé toutes les autres.',
      colors: ['#ffc93c', '#3d1f6b'], accent: '#ffd447', glow: 'rgba(255,201,60,.7)',
      stats: { pv: 3000, attaque: 132, defense: 118, vitesse: 108 },
      surge: 2.75,          // surrégime du joueur contre ce boss
      power: 'Trois phases royales',
      powerDesc: 'Change de visage, de statistiques et d’attaques à 50 % puis 25 % de PV.',
      fx: 'finalbrand',
      special: {
        name: 'Verdict Final', icon: '👑', type: 'pierce', cost: 60,
        mult: 1.4, pierce: 0.7,
        desc: 'Sentence sans appel : 70 % de la défense adverse est ignorée.'
      },
      ultimate: {
        name: 'Brand Apocalypse', icon: '👑', fx: 'finalbrand',
        phrase: 'Toutes les marques disparaîtront. Il ne restera que moi.',
        effects: {
          hits: 6, mult: 0.5, pierce: 0.6, crit: true, breakShield: true,
          buffs: [{ stat: 'vitesse', mult: 1.25, turns: 3, label: '+25 % vitesse', icon: '👑' }]
        },
        desc: 'Six impacts royaux critiques, brise les boucliers et accélère le boss.'
      },
      passive: { type: 'overload', every: 4, mult: 1.75, pierce: 0.5, name: 'Onde de marque', icon: '👑' },
      phases: [
        {
          at: 0.5, label: 'PHASE 2 !', suffix: ' — HÉRITAGE',
          name: 'THE FINAL BRAND · HÉRITAGE', mono: 'FB²',
          colors: ['#ff5fa2', '#3d0a2a'], accent: '#ff9ecb', glow: 'rgba(255,158,203,.7)',
          stats: { attaque: 1.28, defense: 1.15, vitesse: 1.12 },
          special: {
            name: 'Absorption de Marque', icon: '🩸', type: 'drain', cost: 55,
            mult: 1.3, healRatio: 0.55,
            desc: 'Absorbe l’ADN de la marque adverse et récupère 55 % des dégâts.'
          },
          ultimate: {
            name: 'Couronne Brisée', icon: '👑', fx: 'finalbrand',
            phrase: 'Une couronne ne se partage pas.',
            effects: { hits: 5, mult: 0.6, pierce: 0.75, crit: true, stripBuffs: true, healRatio: 0.3 },
            desc: 'Cinq frappes critiques qui percent 75 % de la défense et absorbent 30 % en PV.'
          },
          passive: { type: 'rampage', perStack: 0.09, maxStacks: 14, name: 'Héritage', icon: '👑' }
        },
        {
          at: 0.25, label: 'PHASE 3 !', suffix: ' — DERNIER SOUFFLE',
          name: 'THE FINAL BRAND · DERNIER SOUFFLE', mono: 'FB³',
          colors: ['#ff2d55', '#22030c'], accent: '#ff4d6d', glow: 'rgba(255,45,85,.8)',
          stats: { attaque: 1.5, defense: 0.85, vitesse: 1.3 },
          special: {
            name: 'Ultime Sentence', icon: '💀', type: 'multi', cost: 48,
            hits: 4, mult: 0.62,
            desc: 'Quatre frappes désespérées, plus rapides et plus violentes.'
          },
          ultimate: {
            name: 'Fin de l’Histoire', icon: '💀', fx: 'finalbrand',
            phrase: 'Il ne restera qu’une seule marque. La mienne.',
            effects: { hits: 8, mult: 0.45, pierce: 0.8, crit: true, breakShield: true, recoil: 0.03 },
            desc: 'Huit impacts qui percent 80 % de la défense : le coup de grâce.'
          },
          passive: { type: 'rampage', perStack: 0.12, maxStacks: 18, name: 'Dernier souffle', icon: '💀' }
        }
      ],
      music: { bpm: 132, root: 65, bass: [0, 3, 5, 7], lead: [19, 22, 24, 27], wave: 'sawtooth' },
      intro: { kicker: 'BOSS FINAL', phrase: 'Toutes les marques s’effacent…', title: 'THE FINAL BRAND' },
      reward: { xp: 800, title: 'Tueur de marques', badge: '👑', skin: 'crown' }
    },

    {
      id: 'nullsector', name: 'NULL SECTOR', mono: '∅', icon: '🕳️',
      boss: true,
      cat: 'Boss secret · Secteur nul', order: 6, secret: true,
      tagline: 'Le vide a une signature. La voici.',
      colors: ['#0b0d1a', '#2a0f4a'], accent: '#c9a3ff', glow: 'rgba(201,163,255,.7)',
      stats: { pv: 4200, attaque: 140, defense: 124, vitesse: 116 },
      surge: 3.3,          // surrégime du joueur contre ce boss
      power: 'Absorption du vide',
      powerDesc: 'Vole les capacités du joueur et renvoie une partie des dégâts.',
      fx: 'nullsector',
      special: {
        name: 'Secteur Nul', icon: '🕳️', type: 'pierce', cost: 56,
        mult: 1.45, pierce: 0.8,
        desc: 'Frappe dans le néant : 80 % de la défense adverse est ignorée.'
      },
      ultimate: {
        name: 'Null Pointer', icon: '🕳️', fx: 'nullsector',
        phrase: 'Déréférencement… de votre existence.',
        effects: {
          hits: 6, mult: 0.5, pierce: 0.8, stripBuffs: true,
          breakShield: true, healRatio: 0.35, stunTurns: 1
        },
        desc: 'Six effondrements du vide : dissipation des buffs, absorption et paralysie.'
      },
      passive: { type: 'mirror', reflect: 0.15, name: 'Absorption du vide', icon: '🕳️' },
      phases: [
        {
          at: 0.5, label: 'PHASE 2 !', suffix: ' — ÉCHEC',
          name: 'NULL SECTOR · ÉCHEC', mono: '∅²',
          colors: ['#3a0ca3', '#06070f'], accent: '#8f7bff', glow: 'rgba(143,123,255,.7)',
          stats: { attaque: 1.25, defense: 1.2, vitesse: 1.15 },
          special: {
            name: 'Exception Non Gérée', icon: '⚠️', type: 'multi', cost: 52,
            hits: 5, mult: 0.6,
            desc: 'Cinq erreurs fatales enchaînées.'
          },
          passive: { type: 'siphon', healRatio: 0.015, name: 'Récupération du vide', icon: '🕳️' }
        },
        {
          at: 0.25, label: 'PHASE 3 !', suffix: ' — NÉANT',
          name: 'NULL SECTOR · NÉANT', mono: '∅³', copy: true,
          colors: ['#ff1f4f', '#0a0210'], accent: '#ff6b8a', glow: 'rgba(255,31,79,.85)',
          stats: { attaque: 1.45, defense: 0.9, vitesse: 1.35 },
          special: {
            name: 'Copie du néant', icon: '🪞', type: 'drain', cost: 50,
            mult: 1.25, healRatio: 0.5,
            desc: 'Reproduit le pouvoir adverse (remplacé par la vraie copie en combat).'
          },
          ultimate: {
            name: 'Fin du Programme', icon: '🕳️', fx: 'nullsector',
            phrase: 'exit(0)',
            effects: { hits: 9, mult: 0.42, pierce: 0.9, crit: true, breakShield: true },
            desc: 'Neuf effondrements critiques qui percent 90 % de la défense.'
          },
          passive: { type: 'rampage', perStack: 0.1, maxStacks: 20, name: 'Fin du programme', icon: '🕳️' }
        }
      ],
      music: { bpm: 150, root: 45, bass: [0, 1, 0, -2], lead: [12, 11, 18, 24], wave: 'sawtooth' },
      intro: { kicker: 'BOSS SECRET', phrase: 'Un secteur non référencé vient de s’ouvrir…', title: 'NULL SECTOR' },
      reward: { xp: 1500, title: 'Habitué du néant', badge: '🕳️', skin: 'void' }
    }
  ];

  const MAIN_BOSSES = BOSSES.filter(function (b) { return !b.secret; });
  const SECRET_BOSS = BOSSES.find(function (b) { return b.secret; }) || null;

  function getBoss(id) {
    return BOSSES.find(function (b) { return b.id === id; }) || null;
  }

  /* Suite des boss pour une difficulté donnée.
     Le boss secret n'apparaît qu'après avoir vaincu les cinq autres. */
  function rushOrder(cleared, withSecret) {
    const list = MAIN_BOSSES.slice().sort(function (a, b) { return a.order - b.order; });
    const done = cleared || {};
    if (withSecret && SECRET_BOSS) {
      const allCleared = MAIN_BOSSES.every(function (b) { return !!done[b.id]; });
      if (allCleared) list.push(SECRET_BOSS);
    }
    return list;
  }

  function allMainCleared(cleared) {
    const done = cleared || {};
    return MAIN_BOSSES.every(function (b) { return !!done[b.id]; });
  }

  /* --- Récompenses exclusives au Boss Rush --- */

  /* Skins débloqués en battant un boss (utilisables par toutes les marques) */
  const BOSS_SKIN_NAMES = {
    megatech: 'Édition Méga Tech',
    overclock: 'Édition Overclock',
    quantum: 'Édition Quantum Core',
    corrupted: 'Édition Corrupted AI',
    finalbrand: 'Édition Final Brand',
    nullsector: 'Édition Null Sector'
  };

  const BOSS_SKINS = BOSSES.map(function (b) {
    return {
      id: b.reward.skin,
      name: BOSS_SKIN_NAMES[b.id] || ('Édition ' + b.name),
      css: 'skin--' + b.reward.skin,
      boss: b.id,
      icon: b.icon,
      desc: 'Skin exclusif — vaincre ' + b.name
    };
  });

  /* Titres de profil */
  const BOSS_TITLES = BOSSES.map(function (b) {
    return {
      id: 'title-' + b.id,
      name: b.reward.title,
      icon: b.icon,
      boss: b.id,
      desc: 'Titre obtenu en battant ' + b.name
    };
  });

  /* Trophées exclusifs */
  const BOSS_TROPHIES = [
    { id: 'bossFirst', icon: '🤖', name: 'Premier boss', desc: 'Vaincre un boss', test: function (b) { return bossCount(b) >= 1; } },
    { id: 'bossTrio', icon: '🔥', name: 'Trio infernal', desc: 'Vaincre 3 boss', test: function (b) { return bossCount(b) >= 3; } },
    { id: 'bossAll', icon: '👑', name: 'Roi de l’arène', desc: 'Vaincre les 5 boss', test: function (b) { return MAIN_BOSSES.every(function (x) { return !!(b.cleared || {})[x.id]; }); } },
    { id: 'bossSecret', icon: '🕳️', name: 'Secteur nul', desc: 'Découvrir et vaincre NULL SECTOR', test: function (b) { return !!(b.cleared || {}).nullsector; } },
    { id: 'bossRush', icon: '⚔️', name: 'Boss Rush complet', desc: 'Terminer un Boss Rush entier', test: function (b) { return (b.wins || 0) >= 1; } },
    { id: 'bossImpossible', icon: '⚫', name: 'Impossible n’est pas un mot', desc: 'Terminer un Boss Rush en Impossible', test: function (b) { return (b.byDifficulty || {}).impossible > 0; } },
    { id: 'bossSpeed', icon: '⏱️', name: 'Éclair', desc: 'Terminer un Boss Rush en moins de 5 minutes', test: function (b) { return !!b.bestTime && b.bestTime < 5 * 60 * 1000; } },
    { id: 'bossDamage', icon: '💥', name: 'Marteau', desc: 'Infliger 5 000 dégâts sur un Boss Rush', test: function (b) { return (b.bestDamage || 0) >= 5000; } }
  ];

  function bossCount(bossSave) {
    const cleared = (bossSave && bossSave.cleared) || {};
    return Object.keys(cleared).filter(function (k) { return cleared[k]; }).length;
  }

  /* Sauvegarde Boss Rush vide */
  function emptyBossSave() {
    return {
      cleared: {},          // id de boss → true
      byDifficulty: {},     // id de difficulté → nombre de Boss Rush terminés
      runs: 0,              // Boss Rush lancés
      wins: 0,              // Boss Rush terminés
      losses: 0,
      bestTime: null,       // meilleur temps complet (ms)
      bestTimeByDiff: {},   // difficulté → meilleur temps
      bestDamage: 0,        // meilleur total de dégâts sur un run
      totalDamage: 0,
      bestBrand: null,      // marque du meilleur run
      bestDifficulty: null,
      lastBrand: null,
      lastDifficulty: 'normal',
      titles: [],           // titres débloqués
      skins: [],            // skins exclusifs débloqués
      trophies: [],         // trophées exclusifs débloqués
      badges: [],           // badges de boss (icônes)
      secretSeen: false
    };
  }

  function hydrateBossSave(save) {
    const base = emptyBossSave();
    const s = save && typeof save === 'object' ? save : {};
    Object.keys(base).forEach(function (k) {
      if (s[k] === undefined || s[k] === null) s[k] = base[k];
    });
    ['cleared', 'byDifficulty', 'bestTimeByDiff'].forEach(function (k) {
      if (!s[k] || typeof s[k] !== 'object') s[k] = {};
    });
    ['titles', 'skins', 'trophies', 'badges'].forEach(function (k) {
      if (!Array.isArray(s[k])) s[k] = [];
    });
    return s;
  }

  return {
    DIFFICULTIES: DIFFICULTIES,
    BOSSES: BOSSES,
    MAIN_BOSSES: MAIN_BOSSES,
    SECRET_BOSS: SECRET_BOSS,
    BOSS_SKINS: BOSS_SKINS,
    BOSS_TITLES: BOSS_TITLES,
    BOSS_TROPHIES: BOSS_TROPHIES,
    getDifficulty: getDifficulty,
    playerBoost: playerBoost,
    getBoss: getBoss,
    rushOrder: rushOrder,
    allMainCleared: allMainCleared,
    bossCount: bossCount,
    emptyBossSave: emptyBossSave,
    hydrateBossSave: hydrateBossSave
  };
});
