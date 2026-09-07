/* ============================================================
   GUERRE DES MARQUES — Progression (niveaux, XP, raretés,
   skins, badges, rangs et trophées)
   Logique pure : utilisable dans le navigateur (window.Progress)
   et dans Node (module.exports) pour les tests.
   ============================================================ */
(function (root, factory) {
  const data = (typeof module !== 'undefined' && module.exports) ? require('./brands.js') : root.BRANDS_DATA;
  const bossData = (typeof module !== 'undefined' && module.exports) ? require('./bosses.js') : root.BOSSES_DATA;
  const api = factory(data, bossData);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Progress = api;
})(typeof self !== 'undefined' ? self : this, function (DATA, BOSS) {
  'use strict';

  /* ---------------------- Courbe d'expérience ----------------------
     Monter de niveau n → n+1 coûte 30 + 2×(n−1) PX :
     les premiers niveaux tombent en un combat, le niveau 100 demande
     environ 12 700 PX (~140 combats). */
  const LEVEL_MAX = 100;
  const XP_BASE = 30;
  const XP_STEP = 2;

  function xpNeeded(level) {
    return XP_BASE + (Math.max(1, Math.min(LEVEL_MAX, level || 1)) - 1) * XP_STEP;
  }

  /* État d'une marque (ou du joueur) à partir de son XP cumulé */
  function levelFromXp(xp) {
    let level = 1;
    let rest = Math.max(0, xp || 0);
    while (level < LEVEL_MAX && rest >= xpNeeded(level)) {
      rest -= xpNeeded(level);
      level++;
    }
    const needed = xpNeeded(level);
    const maxed = level >= LEVEL_MAX;
    return {
      level: level,
      into: maxed ? needed : rest,
      needed: needed,
      pct: maxed ? 100 : Math.round((rest / needed) * 1000) / 10,
      maxed: maxed,
      total: xp || 0
    };
  }

  /* Total de PX nécessaire pour atteindre un niveau donné */
  function xpToReach(level) {
    let sum = 0;
    for (let l = 1; l < Math.min(LEVEL_MAX, level || 1); l++) sum += xpNeeded(l);
    return sum;
  }

  /* ---------------------- Croissance des statistiques ----------------------
     +20 % de statistiques entre le niveau 1 et le niveau 100
     (appliqué par le moteur, uniquement si un niveau est fourni). */
  const STAT_GROWTH = 0.2;
  function statGrowth(level) {
    const l = Math.max(1, Math.min(LEVEL_MAX, level || 1));
    return 1 + (STAT_GROWTH * (l - 1)) / (LEVEL_MAX - 1);
  }

  /* ---------------------- Raretés ---------------------- */
  const RARITIES = {
    commun:    { id: 'commun',    name: 'Commun',    icon: '⚪', color: '#9aa6c8' },
    rare:      { id: 'rare',      name: 'Rare',      icon: '🔵', color: '#4c8dff' },
    epique:    { id: 'epique',    name: 'Épique',    icon: '🟣', color: '#b06cff' },
    legendaire:{ id: 'legendaire',name: 'Légendaire',icon: '🟡', color: '#ffc93c' },
    mythique:  { id: 'mythique',  name: 'Mythique',  icon: '🔴', color: '#ff5fa2' }
  };

  function rarityOf(brandId) {
    const b = DATA.getBrand(brandId);
    return RARITIES[(b && b.rarity) || 'commun'] || RARITIES.commun;
  }

  /* ---------------------- Skins déblocables ---------------------- */
  const SKINS = [
    { id: 'base',   name: 'Standard',     level: 1,   css: 'skin--base',   desc: 'Livrée d’origine' },
    { id: 'neon',   name: 'Néon',         level: 5,   css: 'skin--neon',   desc: 'Contours lumineux' },
    { id: 'chrome', name: 'Chrome',       level: 15,  css: 'skin--chrome', desc: 'Reflets métal poli' },
    { id: 'prism',  name: 'Prisme',       level: 30,  css: 'skin--prism',  desc: 'Dégradé spectral' },
    { id: 'gold',   name: 'Édition Or',   level: 50,  css: 'skin--gold',   desc: 'Habits dorés' },
    { id: 'cosmos', name: 'Cosmos',       level: 75,  css: 'skin--cosmos', desc: 'Champ stellaire' },
    { id: 'myth',   name: 'Mythique',     level: 100, css: 'skin--myth',   desc: 'Aura légendaire' }
  ];

  /* Skins exclusifs au Boss Rush : débloqués en battant un boss, portables
     par n'importe quelle marque (contrairement aux skins de niveau). */
  const BOSS_SKINS = (BOSS && BOSS.BOSS_SKINS) || [];

  function skinById(id) {
    return SKINS.find(function (s) { return s.id === id; }) ||
      BOSS_SKINS.find(function (s) { return s.id === id; }) || SKINS[0];
  }
  function unlockedSkins(level) {
    const l = level || 1;
    return SKINS.filter(function (s) { return s.level <= l; });
  }
  function unlockedBossSkins(meta) {
    const owned = ((meta && meta.boss) || {}).skins || [];
    return BOSS_SKINS.filter(function (s) { return owned.indexOf(s.id) !== -1; });
  }
  function isBossSkin(id) {
    return BOSS_SKINS.some(function (s) { return s.id === id; });
  }
  function nextSkin(level) {
    const l = level || 1;
    return SKINS.find(function (s) { return s.level > l; }) || null;
  }
  function isSkinUnlocked(skinId, level, meta) {
    if (isBossSkin(skinId)) {
      const owned = ((meta && meta.boss) || {}).skins || [];
      return owned.indexOf(skinId) !== -1;
    }
    const s = skinById(skinId);
    return (level || 1) >= s.level;
  }

  /* ---------------------- Badges de maîtrise (par marque) ---------------------- */
  const BADGES = [
    { id: 'win1',   icon: '🩸', name: 'Premier sang',  desc: '1 victoire avec la marque',      test: function (b) { return b.wins >= 1; } },
    { id: 'win10',  icon: '🥉', name: 'Régulier',      desc: '10 victoires avec la marque',    test: function (b) { return b.wins >= 10; } },
    { id: 'win25',  icon: '🥈', name: 'Confirmé',      desc: '25 victoires avec la marque',    test: function (b) { return b.wins >= 25; } },
    { id: 'win50',  icon: '🥇', name: 'Vétéran',       desc: '50 victoires avec la marque',    test: function (b) { return b.wins >= 50; } },
    { id: 'lvl25',  icon: '⭐', name: 'Étoile montante', desc: 'Marque au niveau 25',          test: function (b) { return b.level >= 25; } },
    { id: 'lvl50',  icon: '💫', name: 'Demi-dieu',     desc: 'Marque au niveau 50',            test: function (b) { return b.level >= 50; } },
    { id: 'lvl100', icon: '👑', name: 'Maître',        desc: 'Marque au niveau 100',           test: function (b) { return b.level >= 100; } },
    { id: 'ult25',  icon: '✦',  name: 'Ultime puissance', desc: '25 ultimes avec la marque',  test: function (b) { return b.ultimates >= 25; } },
    { id: 'ko200',  icon: '💥', name: 'Frappe massive', desc: 'Un coup à 200+ avec la marque', test: function (b) { return b.bestDamage >= 200; } }
  ];

  function badgesOf(brandStats) {
    return BADGES.map(function (b) {
      let earned = false;
      try { earned = !!b.test(brandStats || {}); } catch (e) { earned = false; }
      return { id: b.id, icon: b.icon, name: b.name, desc: b.desc, earned: earned };
    });
  }

  /* ---------------------- Rangs du joueur ---------------------- */
  const RANKS = [
    { id: 'bronze',      name: 'Bronze',       icon: '🥉', level: 1,  color: '#cd7f32' },
    { id: 'argent',      name: 'Argent',       icon: '🥈', level: 5,  color: '#c8d2e8' },
    { id: 'or',          name: 'Or',           icon: '🥇', level: 10, color: '#ffd447' },
    { id: 'platine',     name: 'Platine',      icon: '💠', level: 18, color: '#b9f5ff' },
    { id: 'diamant',     name: 'Diamant',      icon: '💎', level: 28, color: '#7fd8ff' },
    { id: 'maitre',      name: 'Maître',       icon: '🔮', level: 40, color: '#b06cff' },
    { id: 'grandmaitre', name: 'Grand Maître', icon: '👁️', level: 55, color: '#ff5fa2' },
    { id: 'champion',    name: 'Champion',     icon: '🏆', level: 70, color: '#ffc93c' }
  ];

  function rankFromLevel(level) {
    const l = Math.max(1, level || 1);
    let index = 0;
    for (let i = 0; i < RANKS.length; i++) if (l >= RANKS[i].level) index = i;
    const rank = RANKS[index];
    const next = RANKS[index + 1] || null;
    let pct = 100;
    if (next) {
      const span = next.level - rank.level;
      pct = Math.max(0, Math.min(100, Math.round(((l - rank.level) / span) * 100)));
    }
    return {
      rank: rank, next: next, index: index,
      pct: pct,
      remaining: next ? Math.max(0, next.level - l) : 0
    };
  }

  function rankById(id) {
    return RANKS.find(function (r) { return r.id === id; }) || RANKS[0];
  }

  /* ---------------------- Trophées (globaux) ---------------------- */
  /* Nombre de skins « bonus » débloqués (la livrée standard ne compte pas) */
  function countUnlockedSkins(meta) {
    return DATA.BRANDS.reduce(function (sum, b) {
      const st = brandState(meta, b.id);
      return sum + Math.max(0, unlockedSkins(st.level).length - 1);
    }, 0);
  }

  const TROPHIES = [
    { id: 'firstWin',   icon: '🏆', name: 'Première victoire', desc: 'Remporter son premier combat',
      test: function (m) { return m.wins >= 1; } },
    { id: 'battles25',  icon: '⚔️', name: 'Habitué de l’arène', desc: '25 combats disputés',
      test: function (m) { return (m.battles || 0) >= 25; } },
    { id: 'battles100', icon: '🛡️', name: 'Vétéran', desc: '100 combats disputés',
      test: function (m) { return (m.battles || 0) >= 100; } },
    { id: 'wins25',     icon: '🎖️', name: 'Palmarès solide', desc: '25 victoires',
      test: function (m) { return m.wins >= 25; } },
    { id: 'streak5',    icon: '🔥', name: 'Enchaînement', desc: 'Série de 5 victoires',
      test: function (m) { return (m.bestStreak || 0) >= 5; } },
    { id: 'streak10',   icon: '💥', name: 'Irrésistible', desc: 'Série de 10 victoires',
      test: function (m) { return (m.bestStreak || 0) >= 10; } },
    { id: 'ult50',      icon: '✦',  name: 'Ultime puissance', desc: '50 ultimes lancés',
      test: function (m) { return (m.ultimates || 0) >= 50; } },
    { id: 'crit100',    icon: '💫', name: 'Chirurgien', desc: '100 coups critiques',
      test: function (m) { return (m.crits || 0) >= 100; } },
    { id: 'ko250',      icon: '☠️', name: 'K.O. massif', desc: 'Un coup à 250 dégâts ou plus',
      test: function (m) { return (m.bestKo && m.bestKo.damage >= 250) || (m.bestDamage || 0) >= 250; } },
    { id: 'champion',   icon: '👑', name: 'Champion', desc: 'Terminer un tournoi',
      test: function (m) { return !!m.tournamentWin; } },
    { id: 'collector',  icon: '🎨', name: 'Collectionneur', desc: 'Débloquer 10 skins',
      test: function (m) { return countUnlockedSkins(m) >= 10; } },
    { id: 'master100',  icon: '🌟', name: 'Maître absolu', desc: 'Atteindre le niveau global 100',
      test: function (m) { return levelFromXp(m.playerXp || 0).level >= LEVEL_MAX; } }
  ];

  /* Les trophées du Boss Rush rejoignent la grille du profil : ils lisent la
     sauvegarde Boss Rush (`meta.boss`) au lieu des statistiques globales. */
  const ALL_TROPHIES = TROPHIES.concat(((BOSS && BOSS.BOSS_TROPHIES) || []).map(function (t) {
    return {
      id: t.id, icon: t.icon, name: t.name, desc: t.desc, bossExclusive: true,
      test: function (m) { return t.test((m && m.boss) || {}); }
    };
  }));

  function trophiesOf(meta) {
    return ALL_TROPHIES.map(function (t) {
      let earned = false;
      try { earned = !!t.test(meta || {}); } catch (e) { earned = false; }
      return {
        id: t.id, icon: t.icon, name: t.name, desc: t.desc,
        earned: earned, bossExclusive: !!t.bossExclusive
      };
    });
  }

  /* ---------------------- État d'une marque ---------------------- */
  function brandState(meta, brandId) {
    const m = meta || {};
    const brands = m.brands || {};
    const raw = brands[brandId] || {};
    const prog = levelFromXp(raw.xp || 0);
    const state = {
      id: brandId,
      xp: raw.xp || 0,
      level: prog.level,
      into: prog.into,
      needed: prog.needed,
      pct: prog.pct,
      maxed: prog.maxed,
      wins: raw.wins || 0,
      losses: raw.losses || 0,
      uses: raw.uses || 0,
      ultimates: raw.ultimates || 0,
      bestDamage: raw.bestDamage || 0,
      skin: raw.skin && isSkinUnlocked(raw.skin, prog.level, m) ? raw.skin : 'base'
    };
    state.badges = badgesOf(state);
    state.badgesEarned = state.badges.filter(function (b) { return b.earned; }).length;
    return state;
  }

  function allBrandStates(meta) {
    return DATA.BRANDS.map(function (b) { return brandState(meta, b.id); });
  }

  /* ---------------------- XP d'un combat ---------------------- */
  function battleXp(info) {
    const parts = [];
    let total = 0;
    const add = function (label, value) {
      const v = Math.round(value);
      if (v > 0) { parts.push({ label: label, value: v }); total += v; }
    };
    add(info.won ? 'Victoire' : 'Participation', info.won ? 45 : 18);
    add('Rounds (' + (info.rounds || 1) + ')', Math.min(30, (info.rounds || 0) * 2));
    add('Critiques (' + (info.crits || 0) + ')', Math.min(15, (info.crits || 0) * 3));
    add('Ultimes (' + (info.ultimates || 0) + ')', (info.ultimates || 0) * 6);
    if (info.ko) add('K.O.', 12);
    if (info.tournament) add('Tournoi', 8);
    add('Meilleur coup', Math.min(20, Math.round((info.maxDamage || 0) / 12)));
    return { total: total, parts: parts };
  }

  /* ---------------------- Application d'un résultat ----------------------
     Met à jour `meta` (sauvegarde) et renvoie le rapport de récompenses. */
  function applyBattleResult(meta, payload) {
    const ids = [payload.playerBrand, payload.foeBrand].filter(function (id) {
      return !!id && !!DATA.getBrand(id);      // un boss n'a pas de fiche de marque
    });
    const xpReport = battleXp(payload);
    const xp = xpReport.total;

    const before = {};
    ids.forEach(function (id) { before[id] = brandState(meta, id).level; });
    const playerBefore = levelFromXp(meta.playerXp || 0).level;
    const trophiesBefore = trophiesOf(meta).filter(function (t) { return t.earned; })
      .map(function (t) { return t.id; });
    const badgesBefore = {};
    ids.forEach(function (id) {
      badgesBefore[id] = brandState(meta, id).badges.filter(function (b) { return b.earned; })
        .map(function (b) { return b.id; });
    });

    /* --- Cumuls globaux --- */
    meta.battles = (meta.battles || 0) + 1;
    meta.playerXp = (meta.playerXp || 0) + xp;
    meta.brands = meta.brands || {};

    const won = payload.won === true;
    const lost = payload.won === false;

    if (payload.mode !== 'auto') {
      if (won) { meta.wins = (meta.wins || 0) + 1; meta.streak = (meta.streak || 0) + 1; }
      else if (lost) { meta.losses = (meta.losses || 0) + 1; meta.streak = 0; }
      meta.bestStreak = Math.max(meta.bestStreak || 0, meta.streak || 0);
    }
    meta.crits = (meta.crits || 0) + (payload.crits || 0);
    meta.specials = (meta.specials || 0) + (payload.specials || 0);
    meta.ultimates = (meta.ultimates || 0) + (payload.ultimates || 0);
    meta.bestDamage = Math.max(meta.bestDamage || 0, payload.maxDamage || 0);
    if (payload.ko && (!meta.bestKo || (payload.maxDamage || 0) > (meta.bestKo.damage || 0))) {
      meta.bestKo = {
        damage: payload.maxDamage || 0,
        brand: payload.koBy || null,
        foe: payload.koOn || null,
        at: Date.now()
      };
    }
    if (payload.tournamentWin) meta.tournamentWin = true;

    /* --- Cumuls par marque --- */
    const ensure = function (id) {
      if (!meta.brands[id]) meta.brands[id] = { xp: 0, wins: 0, losses: 0, uses: 0, ultimates: 0, bestDamage: 0, skin: 'base' };
      return meta.brands[id];
    };
    ids.forEach(function (id) {
      const st = ensure(id);
      st.xp = (st.xp || 0) + xp;
      st.uses = (st.uses || 0) + 1;
      st.ultimates = (st.ultimates || 0) + Math.round((payload.ultimatesByBrand && payload.ultimatesByBrand[id]) || 0);
      st.bestDamage = Math.max(st.bestDamage || 0, (payload.maxDamageByBrand && payload.maxDamageByBrand[id]) || 0);
      if (payload.mode !== 'auto') {
        if (id === payload.playerBrand) {
          if (won) st.wins = (st.wins || 0) + 1;
          else if (lost) st.losses = (st.losses || 0) + 1;
        } else if (won) st.losses = (st.losses || 0) + 1;
        else if (lost) st.wins = (st.wins || 0) + 1;
      }
    });

    /* --- Montées de niveau, skins, badges, trophées --- */
    const levelUps = [];
    const newSkins = [];
    ids.forEach(function (id) {
      const after = brandState(meta, id);
      if (after.level > before[id]) {
        levelUps.push({ kind: 'brand', id: id, name: DATA.getBrand(id).name, from: before[id], to: after.level });
      }
      unlockedSkins(after.level).forEach(function (s) {
        if (s.level > before[id]) newSkins.push({ id: s.id, name: s.name, css: s.css, brand: id, brandName: DATA.getBrand(id).name });
      });
    });

    const playerAfter = levelFromXp(meta.playerXp || 0);
    if (playerAfter.level > playerBefore) {
      levelUps.push({ kind: 'player', id: 'player', name: 'Niveau global', from: playerBefore, to: playerAfter.level });
    }

    const newBadges = [];
    ids.forEach(function (id) {
      brandState(meta, id).badges.forEach(function (b) {
        if (b.earned && badgesBefore[id].indexOf(b.id) === -1) {
          newBadges.push({ id: b.id, name: b.name, icon: b.icon, brand: id, brandName: DATA.getBrand(id).name });
        }
      });
    });

    const newTrophies = trophiesOf(meta).filter(function (t) {
      return t.earned && trophiesBefore.indexOf(t.id) === -1;
    });

    const rankBefore = rankFromLevel(playerBefore);
    const rankAfter = rankFromLevel(playerAfter.level);

    return {
      xp: xp,
      xpParts: xpReport.parts,
      levelUps: levelUps,
      newSkins: newSkins,
      newBadges: newBadges,
      newTrophies: newTrophies,
      player: {
        before: { level: playerBefore, pct: levelFromXp(meta.playerXp - xp).pct, into: levelFromXp(meta.playerXp - xp).into, needed: levelFromXp(meta.playerXp - xp).needed },
        after: playerAfter
      },
      brands: ids.map(function (id) {
        return {
          id: id,
          name: DATA.getBrand(id).name,
          before: before[id],
          after: brandState(meta, id)
        };
      }),
      rank: {
        before: rankBefore,
        after: rankAfter,
        up: rankAfter.index > rankBefore.index
      }
    };
  }

  /* ---------------------- Boss Rush ----------------------
     Récompenses d'un boss vaincu : XP, badge, skin exclusif, titre de profil
     et trophées. Tout est cumulé dans `meta.boss` (sauvegardé). */
  function bossSave(meta) {
    if (!BOSS) return null;
    meta.boss = BOSS.hydrateBossSave(meta.boss);
    return meta.boss;
  }

  function grantBossRewards(meta, payload) {
    const save = bossSave(meta);
    const out = {
      xp: 0, xpParts: [], skin: null, title: null, badge: null,
      trophies: [], firstClear: false, boss: null
    };
    if (!save || !BOSS) return out;

    const boss = BOSS.getBoss(payload.bossId);
    if (!boss) return out;
    const diff = BOSS.getDifficulty(payload.difficulty);
    out.boss = boss;

    save.totalDamage = (save.totalDamage || 0) + (payload.damage || 0);
    save.lastBrand = payload.brand || save.lastBrand;
    save.lastDifficulty = diff.id;

    if (!payload.won) return out;

    out.firstClear = !save.cleared[boss.id];
    save.cleared[boss.id] = true;
    if (boss.secret) save.secretSeen = true;

    const xp = Math.round((boss.reward.xp || 100) * (diff.xp || 1) * (out.firstClear ? 1 : 0.25));
    out.xp = xp;
    out.xpParts.push({
      label: (out.firstClear ? 'Boss vaincu · ' : 'Boss revaincu · ') + boss.name,
      value: xp
    });
    if (out.firstClear && diff.id !== 'normal') {
      const bonus = Math.round(xp * 0.5);
      out.xp += bonus;
      out.xpParts.push({ label: 'Prime ' + diff.name, value: bonus });
    }

    out.badge = { id: 'boss-' + boss.id, icon: boss.reward.badge, name: boss.name, desc: 'Boss vaincu' };
    if (save.badges.indexOf(out.badge.id) === -1) save.badges.push(out.badge.id);

    if (out.firstClear) {
      const skin = BOSS.BOSS_SKINS.find(function (s) { return s.boss === boss.id; });
      if (skin && save.skins.indexOf(skin.id) === -1) { save.skins.push(skin.id); out.skin = skin; }
      const title = BOSS.BOSS_TITLES.find(function (t) { return t.boss === boss.id; });
      if (title && save.titles.indexOf(title.id) === -1) { save.titles.push(title.id); out.title = title; }
    }

    // Trophées exclusifs : recalculés à chaque victoire
    BOSS.BOSS_TROPHIES.forEach(function (t) {
      if (t.test(save) && save.trophies.indexOf(t.id) === -1) {
        save.trophies.push(t.id);
        out.trophies.push(t);
      }
    });
    return out;
  }

  /* Fin d'un Boss Rush (victoire ou défaite) : temps, dégâts et statistiques */
  function finishBossRush(meta, payload) {
    const save = bossSave(meta);
    if (!save) return null;
    const diff = BOSS ? BOSS.getDifficulty(payload.difficulty) : null;
    const record = {
      time: payload.timeMs || 0,
      damage: payload.damage || 0,
      brand: payload.brand || null,
      difficulty: diff ? diff.id : 'normal',
      bosses: payload.bosses || 0,
      won: !!payload.won
    };
    save.runs = (save.runs || 0) + 1;
    if (payload.won) {
      save.wins = (save.wins || 0) + 1;
      save.byDifficulty[record.difficulty] = (save.byDifficulty[record.difficulty] || 0) + 1;
      if (!save.bestTime || record.time < save.bestTime) {
        save.bestTime = record.time;
        save.bestBrand = record.brand;
        save.bestDifficulty = record.difficulty;
      }
      const prev = save.bestTimeByDiff[record.difficulty];
      if (!prev || record.time < prev) save.bestTimeByDiff[record.difficulty] = record.time;
    } else {
      save.losses = (save.losses || 0) + 1;
    }
    if (record.damage > (save.bestDamage || 0)) save.bestDamage = record.damage;
    return record;
  }

  /* ---------------------- Sauvegarde vide ---------------------- */
  function emptyProgress() {
    const brands = {};
    DATA.BRANDS.forEach(function (b) {
      brands[b.id] = { xp: 0, wins: 0, losses: 0, uses: 0, ultimates: 0, bestDamage: 0, skin: 'base' };
    });
    return {
      battles: 0, wins: 0, losses: 0, crits: 0, specials: 0, ultimates: 0,
      bestDamage: 0, streak: 0, bestStreak: 0, duels: [], playerXp: 0,
      bestKo: null, tournamentWin: false, brands: brands,
      boss: BOSS ? BOSS.emptyBossSave() : null
    };
  }

  /* Complète une sauvegarde ancienne avec les nouveaux champs */
  function hydrate(meta) {
    const base = emptyProgress();
    Object.keys(base).forEach(function (k) {
      if (meta[k] === undefined) meta[k] = base[k];
    });
    if (!meta.brands || typeof meta.brands !== 'object') meta.brands = base.brands;
    DATA.BRANDS.forEach(function (b) {
      if (!meta.brands[b.id]) meta.brands[b.id] = { xp: 0, wins: 0, losses: 0, uses: 0, ultimates: 0, bestDamage: 0, skin: 'base' };
    });
    if (BOSS && BOSS.hydrateBossSave) meta.boss = BOSS.hydrateBossSave(meta.boss);
    return meta;
  }

  return {
    LEVEL_MAX: LEVEL_MAX,
    STAT_GROWTH: STAT_GROWTH,
    RARITIES: RARITIES,
    RANKS: RANKS,
    SKINS: SKINS,
    BADGES: BADGES,
    TROPHIES: TROPHIES,
    xpNeeded: xpNeeded,
    xpToReach: xpToReach,
    levelFromXp: levelFromXp,
    statGrowth: statGrowth,
    rarityOf: rarityOf,
    skinById: skinById,
    unlockedSkins: unlockedSkins,
    nextSkin: nextSkin,
    isSkinUnlocked: isSkinUnlocked,
    badgesOf: badgesOf,
    rankFromLevel: rankFromLevel,
    rankById: rankById,
    trophiesOf: trophiesOf,
    brandState: brandState,
    allBrandStates: allBrandStates,
    battleXp: battleXp,
    applyBattleResult: applyBattleResult,
    emptyProgress: emptyProgress,
    hydrate: hydrate,
    BOSS_SKINS: BOSS_SKINS,
    isBossSkin: isBossSkin,
    unlockedBossSkins: unlockedBossSkins,
    bossSave: bossSave,
    grantBossRewards: grantBossRewards,
    finishBossRush: finishBossRush
  };
});
