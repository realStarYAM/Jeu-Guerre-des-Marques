/* ============================================================
   GUERRE DES MARQUES — Moteur de combat (logique pure, sans DOM)
   Utilisable dans le navigateur (window.BattleEngine) et dans Node
   (module.exports) pour les tests.
   ============================================================ */
(function (root, factory) {
  const data = (typeof module !== 'undefined' && module.exports)
    ? require('./brands.js')
    : root.BRANDS_DATA;
  const api = factory(data);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BattleEngine = api;
})(typeof self !== 'undefined' ? self : this, function (DATA) {
  'use strict';

  const BRANDS = DATA.BRANDS;
  const getBrand = DATA.getBrand;

  /* ------------------- Constantes d'équilibrage ------------------- */
  const CFG = {
    DMG_SCALE: 0.9,          // échelle globale des dégâts
    MITIGATION_K: 160,       // réduction = def / (def + K)
    CRIT_BASE: 0.05,
    CRIT_SPD: 0.001,         // bonus de critique par point de vitesse
    CRIT_MULT: 1.8,
    CRIT_MAX: 0.75,
    DODGE_BASE: 0.03,
    DODGE_SPD: 0.0035,       // écart de vitesse → esquive
    DODGE_MAX: 0.25,
    GUARD_MULT: 0.45,        // multiplicateur de dégâts quand la cible se défend
    ENERGY_MAX: 100,
    ENERGY_ATTACK: 16,       // énergie gagnée en attaquant
    ENERGY_HIT: 9,           // énergie gagnée en encaissant
    ENERGY_DEFEND: 20,       // énergie gagnée en se défendant
    ENERGY_ROUND: 4,         // énergie passive par round
    ULT_MAX: 100,            // jauge d'ultime (en %)
    ULT_ATTACK: 14,          // ultime gagné en attaquant
    ULT_HIT: 9,              // ultime gagné en encaissant
    ULT_DEFEND: 12,          // ultime gagné en se défendant
    ULT_ROUND: 4,            // ultime passif par round
    ULT_COOLDOWN: 2,         // tours de recharge après un ultime (jauge bloquée)
    MAX_ROUNDS: 40           // mort subite au-delà
  };

  const clamp = function (v, min, max) { return v < min ? min : (v > max ? max : v); };

  /* ------------------- Formules ------------------- */

  // Réduction de dégâts apportée par la défense (0 → 1)
  function mitigation(def, pierce) {
    const d = Math.max(0, def * (1 - (pierce || 0)));
    return d / (d + CFG.MITIGATION_K);
  }

  // Statistique effective (base × buffs)
  function effStat(f, stat) {
    let v = f.base[stat];
    for (let i = 0; i < f.buffs.length; i++) {
      const b = f.buffs[i];
      if (b.stat === stat) v *= b.mult;
    }
    return Math.round(v * 10) / 10;
  }

  function critBonus(f) {
    let v = 0;
    for (let i = 0; i < f.buffs.length; i++) {
      if (f.buffs[i].stat === 'crit') v += f.buffs[i].mult;
    }
    return v;
  }

  function critChance(attacker, defender, extra) {
    const c = CFG.CRIT_BASE
      + effStat(attacker, 'vitesse') * CFG.CRIT_SPD
      + critBonus(attacker)
      + (extra || 0);
    return clamp(c, 0, CFG.CRIT_MAX);
  }

  function dodgeChance(attacker, defender) {
    const d = CFG.DODGE_BASE + (effStat(defender, 'vitesse') - effStat(attacker, 'vitesse')) * CFG.DODGE_SPD;
    return clamp(d, 0, CFG.DODGE_MAX);
  }

  /* ------------------- Combattants ------------------- */

  function createFighter(brandOrId, side, opts) {
    const brand = typeof brandOrId === 'string' ? getBrand(brandOrId) : brandOrId;
    if (!brand) throw new Error('Marque inconnue : ' + brandOrId);
    opts = opts || {};
    const scale = opts.scale || 1;
    return {
      side: side,                                   // 'left' | 'right'
      brand: brand,
      name: brand.name,
      maxHp: Math.round(brand.stats.pv * scale),
      hp: Math.round(brand.stats.pv * scale),
      base: {
        attaque: Math.round(brand.stats.attaque * scale),
        defense: Math.round(brand.stats.defense * scale),
        vitesse: Math.round(brand.stats.vitesse * scale)
      },
      energy: 0,
      ult: 0,             // jauge d'ultime (0 → 100)
      ultCooldown: 0,     // tours de recharge restants
      ultUsed: 0,         // nombre d'ultimes déjà lancés
      buffs: [],          // { stat, mult, turns, label, icon }
      shield: 0,          // tours d'invulnérabilité
      stun: 0,            // tours d'étourdissement
      defending: false,
      critGuaranteed: 0,  // tours de critique garanti
      critBornTurn: -1,
      shieldBornTurn: -1
    };
  }

  function gainEnergy(f, amount, events) {
    const before = f.energy;
    f.energy = clamp(f.energy + amount, 0, CFG.ENERGY_MAX);
    if (f.energy !== before) events.push({ t: 'energy', side: f.side, delta: f.energy - before, total: f.energy });
  }

  /* Jauge d'ultime : bloquée pendant la recharge qui suit un ultime. */
  function gainUlt(f, amount, events) {
    if (amount <= 0 || f.ultCooldown > 0) return 0;
    const before = f.ult;
    f.ult = clamp(f.ult + amount, 0, CFG.ULT_MAX);
    if (f.ult !== before) events.push({ t: 'ult', side: f.side, delta: f.ult - before, total: f.ult });
    return f.ult - before;
  }

  function canUseSpecial(f) {
    return f.energy >= f.brand.special.cost && f.stun <= 0;
  }

  function canUseUltimate(f) {
    return !!f.brand.ultimate && f.ult >= CFG.ULT_MAX && f.stun <= 0 && f.ultCooldown <= 0;
  }

  function addBuff(f, battle, buff, events) {
    // un effet posé pendant ce tour ne commence à décompter qu'au tour suivant
    buff.bornTurn = battle ? battle.turnNumber : -1;
    // remplace un buff identique encore actif (on garde le plus frais)
    f.buffs = f.buffs.filter(function (b) { return !(b.stat === buff.stat && b.label === buff.label); });
    f.buffs.push(buff);
    events.push({ t: 'buff', side: f.side, label: buff.label, icon: buff.icon, turns: buff.turns, stat: buff.stat });
  }

  /* ------------------- Combat ------------------- */

  function createBattle(brandA, brandB, opts) {
    opts = opts || {};
    const battle = {
      id: opts.id || 'battle-' + Date.now(),
      mode: opts.mode || 'duel',
      round: 1,
      turnNumber: 0,
      active: true,
      winner: null,
      endReason: null,
      a: createFighter(brandA, 'left', opts.left),
      b: createFighter(brandB, 'right', opts.right),
      order: [],
      orderIndex: 0,
      history: [],   // historique détaillé des attaques
      logs: [],      // journal texte
      rng: opts.rng || Math.random,
      stats: { crits: 0, dodges: 0, specials: 0, ultimates: 0, maxDamage: 0, damage: { left: 0, right: 0 } }
    };
    battle.fighters = { left: battle.a, right: battle.b };
    newRound(battle, true);
    return battle;
  }

  function opponentOf(battle, f) { return f === battle.a ? battle.b : battle.a; }

  function newRound(battle, silent) {
    // NB : la garde n'est pas remise à zéro ici — elle tient jusqu'au prochain
    // tour du combattant qui l'a levée (voir act()).
    const fighters = [battle.a, battle.b];
    battle.order = fighters.slice().sort(function (x, y) {
      const diff = effStat(y, 'vitesse') - effStat(x, 'vitesse');
      if (diff !== 0) return diff;
      return battle.rng() < 0.5 ? -1 : 1;
    }).map(function (f) { return f.side; });
    battle.orderIndex = 0;
    if (!silent) battle.pendingRoundStart = true;
  }

  function currentActor(battle) {
    if (!battle.active) return null;
    if (battle.orderIndex >= battle.order.length) return null;
    return battle.fighters[battle.order[battle.orderIndex]];
  }

  function log(battle, text, cls) {
    const entry = { round: battle.round, text: text, cls: cls || 'info' };
    battle.logs.push(entry);
    return entry;
  }

  function recordHistory(battle, entry) {
    entry.round = battle.round;
    entry.index = battle.history.length + 1;
    if (!entry.effects) entry.effects = [];
    entry.hpLeft = { left: battle.a.hp, right: battle.b.hp };
    entry.hpPct = {
      left: Math.round(battle.a.hp / battle.a.maxHp * 100),
      right: Math.round(battle.b.hp / battle.b.maxHp * 100)
    };
    entry.ultAfter = { left: battle.a.ult, right: battle.b.ult };
    battle.history.push(entry);
    return entry;
  }

  /* Résumé lisible d'une série d'impacts : « 24 + 31 + 0 » */
  function hitDetail(hits) {
    if (!hits || hits.length <= 1) return '';
    return hits.map(function (h) {
      if (h.dodged) return 'esquivé';
      if (h.blocked) return 'bloqué';
      return String(h.damage);
    }).join(' + ');
  }

  /* --- Résolution d'une frappe (1 à N impacts) --- */
  function strike(battle, attacker, defender, params) {
    params = params || {};
    const hits = [];
    let total = 0;
    const count = params.hits || 1;
    const special = params.special || null;
    const ultimate = params.ultimate || null;
    const dodge = params.cannotDodge ? 0 : dodgeChance(attacker, defender);

    for (let i = 0; i < count; i++) {
      if (defender.hp <= 0) break;

      // Esquive (un ultime ne peut pas être esquivé)
      if (!params.cannotDodge && battle.rng() < dodge) {
        hits.push({ damage: 0, crit: false, dodged: true, blocked: false, lethal: false });
        battle.stats.dodges++;
        continue;
      }

      // Critique
      const guaranteed = attacker.critGuaranteed > 0 || !!params.guaranteedCrit;
      const isCrit = guaranteed || battle.rng() < critChance(attacker, defender);
      if (isCrit) battle.stats.crits++;

      // Dégâts
      const atk = effStat(attacker, 'attaque');
      const spread = 0.85 + battle.rng() * 0.3;
      let dmg = atk * spread * (params.mult || 1) * CFG.DMG_SCALE;
      dmg *= 1 - mitigation(effStat(defender, 'defense'), params.pierce || 0);
      if (isCrit) dmg *= CFG.CRIT_MULT;

      let blocked = false;
      if (defender.shield > 0) {
        dmg = 0;
        blocked = true;
      } else if (defender.defending) {
        dmg *= CFG.GUARD_MULT;
      }

      // un coup bloqué par un bouclier n'inflige rien ; sinon 1 dégât minimum
      dmg = blocked ? 0 : Math.max(1, Math.round(dmg));
      defender.hp = Math.max(0, defender.hp - dmg);
      total += dmg;

      const lethal = defender.hp <= 0;
      hits.push({ damage: dmg, crit: isCrit, dodged: false, blocked: blocked, lethal: lethal });

      if (params.healRatio) {
        const healed = applyHeal(battle, attacker, Math.round(dmg * params.healRatio));
        if (healed > 0) hits[hits.length - 1].heal = healed;
      }

      if (lethal) break;
    }

    if (total > battle.stats.maxDamage) battle.stats.maxDamage = total;
    battle.stats.damage[attacker.side] += total;
    if (special) battle.stats.specials++;

    // Énergie & jauge d'ultime : l'attaquant frappe, la défense encaisse
    gainEnergy(attacker, CFG.ENERGY_ATTACK, []);
    if (total > 0) gainEnergy(defender, CFG.ENERGY_HIT, []);
    gainUlt(attacker, CFG.ULT_ATTACK, []);
    if (total > 0) gainUlt(defender, CFG.ULT_HIT, []);

    const event = {
      t: 'strike',
      side: attacker.side,
      target: defender.side,
      special: special,
      ultimate: ultimate,
      hits: hits,
      total: total,
      allDodged: hits.length > 0 && hits.every(function (h) { return h.dodged; }),
      allBlocked: hits.length > 0 && hits.every(function (h) { return h.blocked; })
    };

    // Historique des attaques
    const critAny = hits.some(function (h) { return h.crit; });
    const critCount = hits.filter(function (h) { return h.crit; }).length;
    const dodgeCount = hits.filter(function (h) { return h.dodged; }).length;
    event.row = recordHistory(battle, {
      actor: attacker.name,
      actorSide: attacker.side,
      target: defender.name,
      action: ultimate ? ultimate.name : (special ? special.name : 'Attaque'),
      actionKind: ultimate ? 'ultimate' : (special ? 'special' : 'attack'),
      damage: total,
      hits: hits.length,
      crit: critAny,
      critCount: critCount,
      dodgeCount: dodgeCount,
      detail: hitDetail(hits),
      dodged: event.allDodged,
      blocked: event.allBlocked,
      heal: hits.reduce(function (s, h) { return s + (h.heal || 0); }, 0),
      effects: [],
      result: total === 0
        ? (event.allDodged ? 'Esquivé' : 'Bloqué')
        : (critAny ? 'CRITIQUE' : 'Touché')
    });

    // Journal
    const who = attacker.name;
    if (event.allDodged) {
      log(battle, who + ' attaque… ' + defender.name + ' esquive !', 'dodge');
    } else if (event.allBlocked) {
      log(battle, who + ' frappe le bouclier de ' + defender.name + ' — aucun dégât.', 'block');
    } else if (ultimate) {
      log(battle, '✦ ULTIME ! ' + who + ' lance « ' + ultimate.name + ' » → ' + total + ' dégâts', 'ultimate');
    } else if (special) {
      log(battle, '⚡ ' + who + ' lance « ' + special.name + ' » → ' + total + ' dégâts' + (critAny ? ' (CRITIQUE !)' : ''), 'special');
    } else if (critAny) {
      log(battle, '💥 ' + who + ' place un coup critique sur ' + defender.name + ' : ' + total + ' dégâts !', 'crit');
    } else {
      log(battle, who + ' attaque ' + defender.name + ' : ' + total + ' dégâts.', 'attack');
    }

    if (defender.hp <= 0) {
      battle.active = false;
      battle.winner = attacker;
      battle.endReason = 'ko';
      event.ko = defender.side;
      log(battle, '☠️ ' + defender.name + ' est K.O. !', 'ko');
    }
    return event;
  }

  function applyHeal(battle, f, amount) {
    const healed = Math.min(amount, f.maxHp - f.hp);
    f.hp += healed;
    return healed;
  }

  /* --- Actions --- */

  function doDefend(battle, f, events) {
    f.defending = true;
    gainEnergy(f, CFG.ENERGY_DEFEND, events);
    gainUlt(f, CFG.ULT_DEFEND, events);
    const regen = applyHeal(battle, f, Math.round(f.maxHp * 0.03));
    events.push({ t: 'defend', side: f.side, regen: regen });
    recordHistory(battle, {
      actor: f.name, actorSide: f.side, target: opponentOf(battle, f).name,
      action: 'Défense', actionKind: 'defend', damage: 0, hits: 0,
      crit: false, dodged: false, blocked: false, heal: regen, effects: [], result: 'Garde'
    });
    log(battle, '🛡️ ' + f.name + ' se met en garde (-55 % de dégâts encaissés)' + (regen ? ' et récupère ' + regen + ' PV.' : '.'), 'defend');
  }

  function doSpecial(battle, f, foe, events) {
    const sp = f.brand.special;
    f.energy -= sp.cost;
    events.push({ t: 'specialCast', side: f.side, name: sp.name, icon: sp.icon, desc: sp.desc, cost: sp.cost });

    switch (sp.type) {
      case 'drain': {
        const ev = strike(battle, f, foe, { mult: sp.mult, healRatio: sp.healRatio, special: sp });
        events.push(ev);
        break;
      }
      case 'multi': {
        const ev = strike(battle, f, foe, { mult: sp.mult, hits: sp.hits, special: sp });
        events.push(ev);
        break;
      }
      case 'pierce': {
        const ev = strike(battle, f, foe, { mult: sp.mult, pierce: sp.pierce, special: sp });
        events.push(ev);
        break;
      }
      case 'stun': {
        const ev = strike(battle, f, foe, { mult: sp.mult, special: sp });
        events.push(ev);
        if (battle.active) {
          foe.stun = Math.max(foe.stun, sp.stunTurns);
          events.push({ t: 'stunApplied', target: foe.side, turns: sp.stunTurns });
          recordHistory(battle, {
            actor: f.name, actorSide: f.side, target: foe.name, action: sp.name + ' (étourdissement)',
            actionKind: 'control', damage: 0, hits: 0, crit: false, dodged: false, blocked: false,
            heal: 0, result: 'Étourdi ' + sp.stunTurns + ' tour'
          });
          log(battle, '⚡ ' + foe.name + ' est étourdi et perd son prochain tour !', 'stun');
        }
        break;
      }
      case 'stun_heal': {
        const healed = applyHeal(battle, f, Math.round(f.maxHp * sp.heal));
        events.push({ t: 'heal', side: f.side, amount: healed, label: sp.name });
        recordHistory(battle, {
          actor: f.name, actorSide: f.side, target: f.name, action: sp.name, actionKind: 'support',
          damage: 0, hits: 0, crit: false, dodged: false, blocked: false, heal: healed, result: '+' + healed + ' PV'
        });
        log(battle, '🔄 ' + f.name + ' se réinstalle et récupère ' + healed + ' PV.', 'heal');
        if (battle.active) {
          foe.stun = Math.max(foe.stun, sp.stunTurns);
          events.push({ t: 'stunApplied', target: foe.side, turns: sp.stunTurns });
          recordHistory(battle, {
            actor: f.name, actorSide: f.side, target: foe.name, action: sp.name + ' (redémarrage)',
            actionKind: 'control', damage: 0, hits: 0, crit: false, dodged: false, blocked: false,
            heal: 0, result: 'Étourdi ' + sp.stunTurns + ' tour'
          });
          log(battle, '⚡ ' + foe.name + ' redémarre et perd son prochain tour !', 'stun');
        }
        break;
      }
      case 'atk_up': {
        addBuff(f, battle, { stat: 'attaque', mult: sp.atkMult, turns: sp.turns, label: '+' + Math.round((sp.atkMult - 1) * 100) + ' % attaque', icon: sp.icon }, events);
        recordHistory(battle, {
          actor: f.name, actorSide: f.side, target: f.name, action: sp.name, actionKind: 'buff',
          damage: 0, hits: 0, crit: false, dodged: false, blocked: false, heal: 0, result: sp.turns + ' tours de boost'
        });
        log(battle, '🎮 ' + f.name + ' active « ' + sp.name + ' » : attaque boostée ' + sp.turns + ' tours.', 'buff');
        break;
      }
      case 'overclock': {
        addBuff(f, battle, { stat: 'attaque', mult: sp.atkMult, turns: sp.turns, label: '+' + Math.round((sp.atkMult - 1) * 100) + ' % attaque', icon: '🔥' }, events);
        addBuff(f, battle, { stat: 'crit', mult: sp.critBonus, turns: sp.turns, label: '+' + Math.round(sp.critBonus * 100) + ' % critique', icon: '💢' }, events);
        recordHistory(battle, {
          actor: f.name, actorSide: f.side, target: f.name, action: sp.name, actionKind: 'buff',
          damage: 0, hits: 0, crit: false, dodged: false, blocked: false, heal: 0, result: sp.turns + ' tours d’overclock'
        });
        log(battle, '🔥 ' + f.name + ' s’overclocke : attaque et critique en hausse !', 'buff');
        break;
      }
      case 'crit_up': {
        f.critGuaranteed = Math.max(f.critGuaranteed, sp.turns);
        f.critBornTurn = battle.turnNumber;
        addBuff(f, battle, { stat: 'vitesse', mult: sp.spdMult, turns: sp.turns, label: '+' + Math.round((sp.spdMult - 1) * 100) + ' % vitesse', icon: '🔮' }, events);
        events.push({ t: 'critReady', side: f.side, turns: sp.turns });
        recordHistory(battle, {
          actor: f.name, actorSide: f.side, target: f.name, action: sp.name, actionKind: 'buff',
          damage: 0, hits: 0, crit: false, dodged: false, blocked: false, heal: 0, result: 'Critiques garantis'
        });
        log(battle, '🔮 ' + f.name + ' prédit la faille : prochains coups critiques garantis !', 'buff');
        break;
      }
      case 'def_up': {
        const healed = applyHeal(battle, f, Math.round(f.maxHp * sp.healRatio));
        addBuff(f, battle, { stat: 'defense', mult: sp.defMult, turns: sp.turns, label: '+' + Math.round((sp.defMult - 1) * 100) + ' % défense', icon: '🛡️' }, events);
        if (healed > 0) events.push({ t: 'heal', side: f.side, amount: healed, label: 'Régénération' });
        recordHistory(battle, {
          actor: f.name, actorSide: f.side, target: f.name, action: sp.name, actionKind: 'buff',
          damage: 0, hits: 0, crit: false, dodged: false, blocked: false, heal: healed,
          result: 'Bouclier ' + sp.turns + ' tours'
        });
        log(battle, '🛡️ ' + f.name + ' déploie « ' + sp.name + ' ».', 'buff');
        break;
      }
      case 'invincible': {
        f.shield = Math.max(f.shield, sp.shieldTurns);
        f.shieldBornTurn = battle.turnNumber;
        const healed = applyHeal(battle, f, Math.round(f.maxHp * sp.heal));
        events.push({ t: 'shield', side: f.side, turns: sp.shieldTurns });
        if (healed > 0) events.push({ t: 'heal', side: f.side, amount: healed, label: sp.name });
        recordHistory(battle, {
          actor: f.name, actorSide: f.side, target: f.name, action: sp.name, actionKind: 'buff',
          damage: 0, hits: 0, crit: false, dodged: false, blocked: false, heal: healed,
          result: 'Invulnérable ' + sp.shieldTurns + ' tours'
        });
        log(battle, '⭐ ' + f.name + ' devient invulnérable pendant ' + sp.shieldTurns + ' tours !', 'buff');
        break;
      }
      default: {
        const ev = strike(battle, f, foe, { mult: sp.mult || 1, special: sp });
        events.push(ev);
      }
    }
  }

  /* --- Ultime : cinématique + effet unique par marque --- */
  function doUltimate(battle, f, foe, events) {
    const ult = f.brand.ultimate;
    const fx = (ult && ult.effects) || {};
    const effects = [];

    f.ult = 0;
    f.ultCooldown = CFG.ULT_COOLDOWN;
    f.ultUsed++;
    battle.stats.ultimates++;

    events.push({
      t: 'ultimateCast', side: f.side, name: ult.name, icon: ult.icon,
      phrase: ult.phrase, desc: ult.desc, fx: ult.fx,
      colors: f.brand.colors, accent: f.brand.accent, glow: f.brand.glow
    });
    log(battle, '✦ ULTIME ! ' + f.name + ' déclenche « ' + ult.name + ' » !', 'ultimate');

    /* 1. Bris de bouclier & dissipation des buffs adverses */
    if (fx.breakShield && foe.shield > 0) {
      foe.shield = 0;
      events.push({ t: 'shieldBreak', target: foe.side });
      effects.push('Bouclier brisé');
      log(battle, '💥 L’invulnérabilité de ' + foe.name + ' vole en éclats !', 'ultimate');
    }
    if (fx.stripBuffs && (foe.buffs.length > 0 || foe.critGuaranteed > 0)) {
      const n = foe.buffs.length + (foe.critGuaranteed > 0 ? 1 : 0);
      foe.buffs = [];
      foe.critGuaranteed = 0;
      events.push({ t: 'strip', target: foe.side, count: n });
      effects.push(n + ' effet' + (n > 1 ? 's' : '') + ' dissipé' + (n > 1 ? 's' : ''));
      log(battle, '🌀 Les améliorations de ' + foe.name + ' sont dissipées.', 'ultimate');
    }

    /* 2. Frappe (un ultime ne peut être ni esquivé, ni atténué par la garde) */
    let ev = null;
    if (fx.mult) {
      foe.defending = false;
      ev = strike(battle, f, foe, {
        mult: fx.mult,
        hits: fx.hits || 1,
        pierce: fx.pierce || 0,
        guaranteedCrit: !!fx.crit,
        healRatio: fx.healRatio || 0,
        cannotDodge: true,
        ultimate: ult
      });
      events.push(ev);
    }

    /* 3. Contrôle : étourdissement */
    if (fx.stunTurns && battle.active) {
      foe.stun = Math.max(foe.stun, fx.stunTurns);
      events.push({ t: 'stunApplied', target: foe.side, turns: fx.stunTurns });
      effects.push('Étourdi ' + fx.stunTurns + ' tours');
      recordHistory(battle, {
        actor: f.name, actorSide: f.side, target: foe.name, action: ult.name + ' (contrôle)',
        actionKind: 'control', damage: 0, hits: 0, crit: false, dodged: false, blocked: false,
        heal: 0, result: 'Étourdi ' + fx.stunTurns + ' tours'
      });
      log(battle, '⚡ ' + foe.name + ' est paralysé ' + fx.stunTurns + ' tours !', 'ultimate');
    }

    /* 4. Soin & invulnérabilité */
    if (fx.heal) {
      const healed = applyHeal(battle, f, Math.round(f.maxHp * fx.heal));
      if (healed > 0) {
        events.push({ t: 'heal', side: f.side, amount: healed, label: ult.name });
        effects.push('+' + healed + ' PV');
        log(battle, '💚 ' + f.name + ' récupère ' + healed + ' PV.', 'heal');
      }
    }
    if (fx.shieldTurns) {
      f.shield = Math.max(f.shield, fx.shieldTurns);
      f.shieldBornTurn = battle.turnNumber;
      events.push({ t: 'shield', side: f.side, turns: fx.shieldTurns });
      effects.push('Invulnérable ' + fx.shieldTurns + ' tours');
      log(battle, '⭐ ' + f.name + ' devient invulnérable ' + fx.shieldTurns + ' tours !', 'buff');
    }

    /* 5. Buffs sur soi / affaiblissement de l'adversaire */
    (fx.buffs || []).forEach(function (b) {
      addBuff(f, battle, { stat: b.stat, mult: b.mult, turns: b.turns, label: b.label, icon: b.icon }, events);
      effects.push(b.label + ' · ' + b.turns + ' tours');
    });
    if (fx.critTurns) {
      f.critGuaranteed = Math.max(f.critGuaranteed, fx.critTurns);
      f.critBornTurn = battle.turnNumber;
      events.push({ t: 'critReady', side: f.side, turns: fx.critTurns });
      effects.push('Critiques garantis ' + fx.critTurns + ' tours');
    }
    if (fx.debuff && battle.active) {
      addBuff(foe, battle, {
        stat: fx.debuff.stat, mult: fx.debuff.mult, turns: fx.debuff.turns,
        label: fx.debuff.label, icon: fx.debuff.icon
      }, events);
      effects.push(fx.debuff.label + ' sur ' + foe.name);
    }

    /* 6. Contre-coup (surchauffe, surtension…) */
    if (fx.recoil && battle.active) {
      const dmg = Math.max(1, Math.round(f.maxHp * fx.recoil));
      f.hp = Math.max(0, f.hp - dmg);
      events.push({ t: 'recoil', side: f.side, amount: dmg });
      effects.push('−' + dmg + ' PV (surchauffe)');
      log(battle, '🔥 ' + f.name + ' encaisse ' + dmg + ' dégâts de surchauffe.', 'ultimate');
      if (f.hp <= 0) {
        battle.active = false;
        battle.winner = foe;
        battle.endReason = 'ko';
        events.push({ t: 'ko', side: f.side, name: f.name, winner: foe.side });
        log(battle, '☠️ ' + f.name + ' s’effondre sous la surchauffe !', 'ko');
      }
    }

    /* 7. Ligne d'historique principale, enrichie des effets */
    const row = (ev && ev.row) || recordHistory(battle, {
      actor: f.name, actorSide: f.side, target: foe.name, action: ult.name,
      actionKind: 'ultimate', damage: 0, hits: 0, crit: false, dodged: false,
      blocked: false, heal: 0, result: 'Ultime'
    });
    row.effects = effects;
    row.ult = true;
    row.ultName = ult.name;
    row.ultIcon = ult.icon;
    row.ultFx = ult.fx;
    // instantané final : les effets de l'ultime sont déjà appliqués
    row.hpLeft = { left: battle.a.hp, right: battle.b.hp };
    row.hpPct = {
      left: Math.round(battle.a.hp / battle.a.maxHp * 100),
      right: Math.round(battle.b.hp / battle.b.maxHp * 100)
    };
    row.ultAfter = { left: battle.a.ult, right: battle.b.ult };
    if (!ev) events.push({ t: 'ultimateSupport', side: f.side, row: row });
  }

  function tickBuffs(battle, f, events) {
    const fresh = f.critBornTurn === battle.turnNumber;
    if (f.critGuaranteed > 0 && !fresh) {
      f.critGuaranteed--;
      if (f.critGuaranteed === 0) events.push({ t: 'critEnd', side: f.side });
    }
    if (f.shield > 0 && f.shieldBornTurn !== battle.turnNumber) {
      f.shield--;
      if (f.shield === 0) {
        events.push({ t: 'shieldEnd', side: f.side });
        log(battle, 'Le bouclier de ' + f.name + ' se dissipe.', 'info');
      }
    }
    const remaining = [];
    for (let i = 0; i < f.buffs.length; i++) {
      const b = f.buffs[i];
      if (b.bornTurn === battle.turnNumber) { remaining.push(b); continue; }
      b.turns--;
      if (b.turns > 0) remaining.push(b);
      else {
        events.push({ t: 'buffEnd', side: f.side, label: b.label });
        log(battle, 'L’effet « ' + b.label + ' » de ' + f.name + ' prend fin.', 'info');
      }
    }
    f.buffs = remaining;
  }

  function endTurn(battle, events) {
    if (!battle.active) return;
    const actor = battle.fighters[battle.order[battle.orderIndex]];
    if (actor) tickBuffs(battle, actor, events);

    battle.orderIndex++;
    if (battle.orderIndex >= battle.order.length) {
      battle.round++;
      if (battle.round > CFG.MAX_ROUNDS) {
        // Mort subite : le plus haut pourcentage de PV l'emporte
        const pa = battle.a.hp / battle.a.maxHp;
        const pb = battle.b.hp / battle.b.maxHp;
        battle.active = false;
        battle.winner = pa === pb ? null : (pa > pb ? battle.a : battle.b);
        battle.endReason = 'timeout';
        events.push({ t: 'end', winner: battle.winner ? battle.winner.side : null, rounds: battle.round - 1, reason: 'timeout' });
        log(battle, '⏱️ Limite de rounds atteinte — victoire aux points.', 'ko');
        return;
      }
      newRound(battle, false);
      battle.a.energy = clamp(battle.a.energy + CFG.ENERGY_ROUND, 0, CFG.ENERGY_MAX);
      battle.b.energy = clamp(battle.b.energy + CFG.ENERGY_ROUND, 0, CFG.ENERGY_MAX);
      gainUlt(battle.a, CFG.ULT_ROUND, events);
      gainUlt(battle.b, CFG.ULT_ROUND, events);
      events.push({ t: 'round', n: battle.round, order: battle.order.slice() });
      log(battle, '— Round ' + battle.round + ' —', 'round');
    }
  }

  /* Action principale : 'attack' | 'defend' | 'special' */
  function act(battle, action) {
    const events = [];
    if (!battle.active) return events;
    const actor = currentActor(battle);
    if (!actor) return events;
    const foe = opponentOf(battle, actor);

    battle.turnNumber++;
    events.push({ t: 'turn', side: actor.side, name: actor.name, turn: battle.turnNumber, round: battle.round });

    // La garde tient jusqu'au prochain tour de son auteur : on la relâche ici.
    actor.defending = false;

    // Recharge de la jauge d'ultime (bloque le gain tant qu'elle n'est pas finie)
    if (actor.ultCooldown > 0) {
      actor.ultCooldown--;
      events.push({ t: 'ultCooldown', side: actor.side, turns: actor.ultCooldown });
      if (actor.ultCooldown === 0) {
        events.push({ t: 'ultReady', side: actor.side });
        log(battle, '✦ La jauge ultime de ' + actor.name + ' est de nouveau active.', 'ultimate');
      }
    }

    if (actor.stun > 0) {
      actor.stun--;
      events.push({ t: 'stunned', side: actor.side });
      recordHistory(battle, {
        actor: actor.name, actorSide: actor.side, target: foe.name, action: 'Étourdi',
        actionKind: 'control', damage: 0, hits: 0, crit: false, dodged: false, blocked: false,
        heal: 0, result: 'Tour perdu'
      });
      log(battle, '💫 ' + actor.name + ' est étourdi et perd son tour.', 'stun');
      endTurn(battle, events);
      return events;
    }

    if (action === 'defend') {
      doDefend(battle, actor, events);
    } else if (action === 'special' && canUseSpecial(actor)) {
      doSpecial(battle, actor, foe, events);
    } else if (action === 'ultimate' && canUseUltimate(actor)) {
      doUltimate(battle, actor, foe, events);
    } else {
      events.push(strike(battle, actor, foe, {}));
    }

    if (!battle.active) {
      if (battle.endReason === 'ko') {
        const loser = battle.a.hp <= 0 ? battle.a : battle.b;
        events.push({ t: 'ko', side: loser.side, name: loser.name, winner: battle.winner.side });
      }
      events.push({ t: 'end', winner: battle.winner ? battle.winner.side : null, rounds: battle.round, reason: battle.endReason });
    } else {
      endTurn(battle, events);
    }
    return events;
  }

  /* ------------------- IA ------------------- */
  function aiChoose(battle, f, rng) {
    rng = rng || battle.rng || Math.random;
    const foe = opponentOf(battle, f);
    const sp = f.brand.special;
    const canSpecial = canUseSpecial(f);
    const hpRatio = f.hp / f.maxHp;
    const foeRatio = foe.hp / foe.maxHp;

    const isDefensive = sp.type === 'def_up' || sp.type === 'invincible' || sp.type === 'stun_heal';
    const isFinisher = sp.type === 'pierce' || sp.type === 'multi' || sp.type === 'drain' || sp.type === 'stun';
    const isSetup = sp.type === 'atk_up' || sp.type === 'overclock' || sp.type === 'crit_up';

    // L'ultime est prêt : il ne se refuse pas (la jauge est pleine, autant frapper fort)
    if (canUseUltimate(f)) return 'ultimate';

    if (canSpecial) {
      if (isDefensive && hpRatio < 0.45) return 'special';
      if (isFinisher && (foeRatio < 0.4 || rng() < 0.45)) return 'special';
      if (isSetup && hpRatio > 0.4 && battle.round <= CFG.MAX_ROUNDS - 4 && rng() < 0.65) return 'special';
      if (rng() < 0.35) return 'special';
    }
    if (hpRatio < 0.28 && rng() < 0.4) return 'defend';
    return 'attack';
  }

  /* Boucle complète automatique (tests + mode spectateur) */
  function autoPlay(battle, maxTurns) {
    let guard = maxTurns || 400;
    while (battle.active && guard-- > 0) {
      const actor = currentActor(battle);
      if (!actor) break;
      act(battle, aiChoose(battle, actor, battle.rng));
    }
    return battle;
  }

  /* ------------------- API publique ------------------- */
  return {
    CFG: CFG,
    BRANDS: BRANDS,
    getBrand: getBrand,
    createBattle: createBattle,
    createFighter: createFighter,
    currentActor: currentActor,
    opponentOf: opponentOf,
    canUseSpecial: canUseSpecial,
    canUseUltimate: canUseUltimate,
    gainUlt: gainUlt,
    act: act,
    aiChoose: aiChoose,
    autoPlay: autoPlay,
    effStat: effStat,
    mitigation: mitigation,
    critChance: critChance,
    dodgeChance: dodgeChance,
    powerScore: DATA.powerScore,
    tournamentOrder: DATA.tournamentOrder
  };
});
