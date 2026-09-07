/* ============================================================
   GUERRE DES MARQUES — Données des combattants
   Chaque marque possède : PV, Attaque, Défense, Vitesse,
   un pouvoir spécial (jauge d'énergie) et un ULTIME (jauge 0 → 100 %).
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BRANDS_DATA = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Types de pouvoirs spéciaux gérés par le moteur :
     drain        → frappe + vol de points de vie
     multi        → plusieurs frappes rapides
     pierce       → frappe qui ignore la défense
     stun         → frappe + l'adversaire perd son prochain tour
     stun_heal    → soin + étourdit l'adversaire
     atk_up       → boost d'attaque temporaire
     overclock    → boost d'attaque + bonus critique
     crit_up      → coups critiques garantis + vitesse
     def_up       → bouclier défensif + régénération
     invincible   → invulnérabilité temporaire + soin
  */

  /* ULTIMES — une seule mécanique générique pilotée par `effects` :
       hits        → nombre d'impacts
       mult        → puissance de chaque impact
       pierce      → part de la défense ignorée (0 → 1)
       crit        → critique garanti
       healRatio   → % des dégâts rendus en PV
       heal        → % des PV max rendus en PV
       stunTurns   → tours perdus par l'adversaire
       shieldTurns → tours d'invulnérabilité
       critTurns   → tours de critiques garantis
       buffs       → buffs posés sur soi  [{ stat, mult, turns, label, icon }]
       debuff      → affaiblissement posé sur l'adversaire
       stripBuffs  → dissipe les buffs adverses
       breakShield → brise l'invulnérabilité adverse
       recoil      → dégâts encaissés par le lanceur (% des PV max)
     `fx` choisit l'habillage de la cinématique (voir css/style.css).
  */

  const BRANDS = [
    {
      id: 'apple', name: 'Apple', mono: 'A', cat: 'Écosystème',
      tagline: 'La fermeture fait la force.',
      colors: ['#e8e8ed', '#8e8e93'], accent: '#f5f5f7', glow: 'rgba(230,230,235,.55)',
      stats: { pv: 405, attaque: 88, defense: 76, vitesse: 92 },
      special: {
        name: 'Écosystème Fermé', icon: '🌀', type: 'drain', cost: 65,
        mult: 1.1, healRatio: 0.35,
        desc: 'Aspire les données de l’adversaire : dégâts + récupère 35 % en PV.'
      },
      ultimate: {
        name: 'Reality Distortion', icon: '🌀', fx: 'distort',
        phrase: 'La réalité n’est qu’une option de configuration.',
        effects: { hits: 1, mult: 1.4, pierce: 1, crit: true, healRatio: 0.35, stripBuffs: true },
        desc: 'Ignore 100 % de la défense, critique garanti, absorbe 35 % des dégâts en PV et dissipe les buffs adverses.'
      }
    },
    {
      id: 'samsung', name: 'Samsung', mono: 'S', cat: 'Écrans & mobiles',
      tagline: 'Aucune fissure ne passe.',
      colors: ['#1428a0', '#0b1a6b'], accent: '#4c6ef5', glow: 'rgba(76,110,245,.55)',
      stats: { pv: 482, attaque: 88, defense: 88, vitesse: 70 },
      special: {
        name: 'Galaxy Shield', icon: '🛡️', type: 'def_up', cost: 55,
        defMult: 1.7, turns: 3, healRatio: 0.1,
        desc: 'Bouclier : +70 % de défense pendant 3 tours et régénération de 10 % des PV.'
      },
      ultimate: {
        name: 'Galaxy Storm', icon: '🌌', fx: 'storm',
        phrase: 'Un orage d’étoiles s’abat sur l’arène.',
        effects: {
          hits: 5, mult: 0.7, pierce: 0.25,
          debuff: { stat: 'defense', mult: 0.7, turns: 2, label: '−30 % défense', icon: '🌌' }
        },
        desc: 'Cinq météores s’écrasent sur l’adversaire, puis fissurent sa défense (−30 % pendant 2 tours).'
      }
    },
    {
      id: 'xiaomi', name: 'Xiaomi', mono: 'Mi', cat: 'Rapport qualité/prix',
      tagline: 'Trois coups pour le prix d’un.',
      colors: ['#ff6900', '#c2410c'], accent: '#ff8c3a', glow: 'rgba(255,140,58,.55)',
      stats: { pv: 420, attaque: 85, defense: 68, vitesse: 96 },
      special: {
        name: 'Prix Cassé', icon: '💸', type: 'multi', cost: 60,
        hits: 3, mult: 0.45,
        desc: 'Trois frappes ultra-rapides à 45 % de puissance chacune.'
      },
      ultimate: {
        name: 'HyperCharge', icon: '⚡', fx: 'charge',
        phrase: 'Charge 120 W : ça va piquer.',
        effects: {
          hits: 3, mult: 0.72, pierce: 0.2, crit: true,
          buffs: [
            { stat: 'attaque', mult: 1.4, turns: 3, label: '+40 % attaque', icon: '⚡' },
            { stat: 'crit', mult: 0.25, turns: 3, label: '+25 % critique', icon: '💢' }
          ]
        },
        desc: 'Trois décharges critiques, puis +40 % d’attaque et +25 % de critique pendant 3 tours.'
      }
    },
    {
      id: 'huawei', name: 'Huawei', mono: 'HW', cat: 'Télécoms',
      tagline: 'Le réseau ne tombe jamais.',
      colors: ['#e60012', '#8f0a13'], accent: '#ff4d5a', glow: 'rgba(255,77,90,.55)',
      stats: { pv: 445, attaque: 88, defense: 78, vitesse: 78 },
      special: {
        name: 'Réseau 5G', icon: '📡', type: 'stun', cost: 75,
        mult: 0.45, stunTurns: 1,
        desc: 'Sature la bande passante : dégâts + l’adversaire perd son prochain tour.'
      },
      ultimate: {
        name: 'Harmony Strike', icon: '📡', fx: 'harmony',
        phrase: 'Harmonie totale… mais pour lui seul.',
        effects: { hits: 1, mult: 0.85, pierce: 0.9, crit: true, stunTurns: 2 },
        desc: 'Frappe critique perçante (90 % de défense ignorée) et l’adversaire perd 2 tours.'
      }
    },
    {
      id: 'google', name: 'Google', mono: 'G', cat: 'Data & recherche',
      tagline: 'Il sait déjà où tu vas frapper.',
      colors: ['#4285f4', '#0f9d58'], accent: '#fbbc05', glow: 'rgba(66,133,244,.55)',
      stats: { pv: 430, attaque: 85, defense: 76, vitesse: 100 },
      special: {
        name: 'Algorithme', icon: '🔮', type: 'crit_up', cost: 50,
        turns: 3, spdMult: 1.3,
        desc: 'Prédit les failles : critiques garantis et +30 % de vitesse pendant 3 tours.'
      },
      ultimate: {
        name: 'Gemini Blast', icon: '🤖', fx: 'gemini',
        phrase: 'Gemini a déjà calculé ta défaite.',
        effects: {
          hits: 1, mult: 1.85, pierce: 0.6, crit: true, critTurns: 3,
          buffs: [{ stat: 'vitesse', mult: 1.25, turns: 3, label: '+25 % vitesse', icon: '🤖' }]
        },
        desc: 'Rafale de données critique (+60 % de défense ignorée), critiques garantis 3 tours et +25 % de vitesse.'
      }
    },
    {
      id: 'microsoft', name: 'Microsoft', mono: 'M', cat: 'Logiciels',
      tagline: 'Redémarrage dans 3… 2… 1…',
      colors: ['#00a4ef', '#7fba00'], accent: '#ffb900', glow: 'rgba(0,164,239,.55)',
      stats: { pv: 445, attaque: 82, defense: 82, vitesse: 66 },
      special: {
        name: 'Mise à Jour Forcée', icon: '🔄', type: 'stun_heal', cost: 80,
        heal: 0.12, stunTurns: 1,
        desc: 'Redémarre l’adversaire : il perd son tour, vous récupérez 12 % de vos PV.'
      },
      ultimate: {
        name: 'Windows Overdrive', icon: '🪟', fx: 'overdrive',
        phrase: 'Mise à jour critique : performances maximales.',
        effects: {
          hits: 1, mult: 1.0, pierce: 0.3, heal: 0.28,
          buffs: [
            { stat: 'attaque', mult: 1.8, turns: 4, label: '+80 % attaque', icon: '🪟' },
            { stat: 'defense', mult: 1.4, turns: 4, label: '+40 % défense', icon: '🛡️' }
          ]
        },
        desc: 'Frappe, récupère 28 % des PV et passe en surrégime : +80 % d’attaque et +40 % de défense pendant 4 tours.'
      }
    },
    {
      id: 'sony', name: 'Sony', mono: 'So', cat: 'Divertissement',
      tagline: 'Mode performance activé.',
      colors: ['#0070d1', '#003791'], accent: '#3ea6ff', glow: 'rgba(62,166,255,.55)',
      stats: { pv: 450, attaque: 92, defense: 78, vitesse: 88 },
      special: {
        name: 'Mode Performance', icon: '🎮', type: 'atk_up', cost: 55,
        atkMult: 1.7, turns: 3,
        desc: '120 fps : +70 % d’attaque pendant 3 tours.'
      },
      ultimate: {
        name: 'PlayStation Rage', icon: '🎮', fx: 'rage',
        phrase: 'Mode rage : 120 fps, zéro pitié.',
        effects: { hits: 3, mult: 0.45, pierce: 0.15, crit: true },
        desc: 'Trois impacts critiques enchaînés à la vitesse de l’éclair.'
      }
    },
    {
      id: 'nintendo', name: 'Nintendo', mono: 'N', cat: 'Jeux vidéo',
      tagline: 'La magie opère toujours.',
      colors: ['#e60012', '#8a0009'], accent: '#ff5566', glow: 'rgba(230,0,18,.5)',
      stats: { pv: 425, attaque: 80, defense: 76, vitesse: 90 },
      special: {
        name: 'Super Étoile', icon: '⭐', type: 'invincible', cost: 75,
        shieldTurns: 2, heal: 0,
        desc: 'Invulnérable pendant 2 tours : aucun dégât encaissé.'
      },
      ultimate: {
        name: 'Super Star', icon: '⭐', fx: 'star',
        phrase: 'Étincelant, invincible, intouchable.',
        effects: { hits: 1, mult: 0.9, pierce: 0.3, crit: true, heal: 0.12, shieldTurns: 2 },
        desc: 'Frappe critique, récupère 12 % des PV et devient invulnérable pendant 2 tours.'
      }
    },
    {
      id: 'amd', name: 'AMD', mono: 'AMD', cat: 'Processeurs',
      tagline: 'Overclock maximum, sécurité minimum.',
      colors: ['#ed1c24', '#7a0a10'], accent: '#ff6b6b', glow: 'rgba(237,28,36,.5)',
      stats: { pv: 445, attaque: 96, defense: 70, vitesse: 84 },
      special: {
        name: 'Overclock Ryzen', icon: '🔥', type: 'overclock', cost: 55,
        atkMult: 1.5, critBonus: 0.3, turns: 3,
        desc: '+50 % d’attaque et +30 % de chance de critique pendant 3 tours.'
      },
      ultimate: {
        name: 'Ryzen Fury', icon: '🔥', fx: 'fury',
        phrase: 'Overclock au-delà des limites thermiques.',
        effects: {
          hits: 1, mult: 1.45, pierce: 0.5, crit: true, recoil: 0.08,
          buffs: [
            { stat: 'attaque', mult: 1.6, turns: 3, label: '+60 % attaque', icon: '🔥' },
            { stat: 'crit', mult: 0.35, turns: 3, label: '+35 % critique', icon: '💢' }
          ]
        },
        desc: 'Frappe critique dévastatrice et surchauffe : +60 % d’attaque et +35 % de critique pendant 3 tours, mais 8 % des PV brûlés.'
      }
    },
    {
      id: 'nvidia', name: 'NVIDIA', mono: 'NV', cat: 'Cartes graphiques',
      tagline: 'Chaque rayon trouve sa cible.',
      colors: ['#76b900', '#3d6100'], accent: '#a3e635', glow: 'rgba(118,185,0,.5)',
      stats: { pv: 420, attaque: 90, defense: 64, vitesse: 86 },
      special: {
        name: 'Ray Tracing', icon: '✨', type: 'pierce', cost: 75,
        mult: 1.35, pierce: 0.8,
        desc: 'Ignore 80 % de la défense adverse et inflige 135 % de dégâts.'
      },
      ultimate: {
        name: 'RTX Overdrive', icon: '✨', fx: 'rtx',
        phrase: 'Chaque rayon calculé à la milliseconde.',
        effects: { hits: 1, mult: 1.75, pierce: 0.85, crit: true, breakShield: true },
        desc: 'Ray tracing total : brise l’invulnérabilité adverse, ignore 85 % de la défense et frappe en critique.'
      }
    },
    {
      id: 'intel', name: 'Intel', mono: 'in', cat: 'Silicium',
      tagline: 'Deux cœurs valent mieux qu’un.',
      colors: ['#0068b5', '#003c6c'], accent: '#38bdf8', glow: 'rgba(0,104,181,.55)',
      stats: { pv: 452, attaque: 86, defense: 82, vitesse: 74 },
      special: {
        name: 'Hyper-Threading', icon: '🧠', type: 'multi', cost: 60,
        hits: 2, mult: 0.75,
        desc: 'Deux threads frappent simultanément à 75 % de puissance.'
      },
      ultimate: {
        name: 'Core Boost', icon: '🧠', fx: 'core',
        phrase: 'Quatre cœurs, une seule cible.',
        effects: {
          hits: 4, mult: 0.5, pierce: 0.4, crit: true,
          buffs: [{ stat: 'defense', mult: 1.5, turns: 3, label: '+50 % défense', icon: '🧠' }]
        },
        desc: 'Quatre cœurs frappent en critique, puis +50 % de défense pendant 3 tours.'
      }
    }
  ];

  function getBrand(id) {
    return BRANDS.find(function (b) { return b.id === id; }) || null;
  }

  /* Score de puissance brut, utilisé pour classer les adversaires du tournoi */
  function powerScore(brand) {
    const s = brand.stats;
    return Math.round(s.pv / 4 + s.attaque * 1.1 + s.defense * 0.9 + s.vitesse * 0.7);
  }

  /* Ordre du tournoi : du plus abordable au plus redoutable */
  function tournamentOrder(excludeId) {
    return BRANDS
      .filter(function (b) { return b.id !== excludeId; })
      .slice()
      .sort(function (a, b) { return powerScore(a) - powerScore(b); });
  }

  return { BRANDS: BRANDS, getBrand: getBrand, powerScore: powerScore, tournamentOrder: tournamentOrder };
});
