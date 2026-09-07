/* Tests du moteur de combat — exécutés par `node --test` */
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');

/* Générateur pseudo-aléatoire déterministe */
function rngFrom(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
/* rng constant : force tous les tirages au-dessus/en-dessous des seuils */
const always = (v) => () => v;

const REQUIRED = ['apple', 'samsung', 'xiaomi', 'huawei', 'google', 'microsoft', 'sony', 'nintendo', 'amd', 'nvidia', 'intel'];

/* Joue des attaques simples avec l'autre combattant jusqu'à ce que ce soit
   le tour de `side`, puis exécute l'action demandée. */
function actOnSide(battle, side, action) {
  let guard = 6;
  while (E.currentActor(battle) && E.currentActor(battle).side !== side && guard-- > 0) {
    E.act(battle, 'attack');
  }
  assert.strictEqual(E.currentActor(battle).side, side, 'impossible d’atteindre le tour de ' + side);
  return E.act(battle, action);
}

/* Dernière ligne d'historique produite par `side` */
function lastActionOf(battle, side, action) {
  const rows = battle.history.filter(function (h) {
    return h.actorSide === side && (!action || h.action === action);
  });
  return rows[rows.length - 1];
}

test('les 11 marques demandées sont présentes et complètes', () => {
  assert.strictEqual(E.BRANDS.length, 11);
  for (const id of REQUIRED) {
    const b = E.getBrand(id);
    assert.ok(b, 'marque manquante : ' + id);
    for (const stat of ['pv', 'attaque', 'defense', 'vitesse']) {
      assert.ok(typeof b.stats[stat] === 'number' && b.stats[stat] > 0, `${id}.${stat} invalide`);
    }
    assert.ok(b.special && b.special.name && b.special.desc && b.special.type, `${id}.special incomplet`);
    assert.ok(b.special.cost > 0, `${id}.special.cost invalide`);
  }
});

test('createBattle : PV pleins et ordre de jeu basé sur la vitesse', () => {
  const battle = E.createBattle('google', 'microsoft', { rng: always(0.5) });
  assert.strictEqual(battle.a.hp, battle.a.maxHp);
  assert.strictEqual(battle.a.hp, E.getBrand('google').stats.pv);
  assert.strictEqual(battle.b.hp, E.getBrand('microsoft').stats.pv);
  assert.deepStrictEqual(battle.order, ['left', 'right']); // 100 > 66 de vitesse
  assert.strictEqual(E.currentActor(battle).name, 'Google');
});

test('une attaque retire des PV et alimente l’historique', () => {
  const battle = E.createBattle('apple', 'intel', { rng: always(0.99) }); // ni critique ni esquive
  const before = battle.b.hp;
  const events = E.act(battle, 'attack');
  const strikeEv = events.find((e) => e.t === 'strike');
  assert.ok(strikeEv, 'événement strike absent');
  assert.strictEqual(strikeEv.hits.length, 1);
  assert.strictEqual(strikeEv.hits[0].crit, false);
  assert.ok(battle.b.hp < before, 'les PV de la cible n’ont pas baissé');
  assert.strictEqual(battle.b.hp, before - strikeEv.total);
  assert.strictEqual(battle.history.length, 1);
  assert.strictEqual(battle.history[0].actor, 'Apple');
  assert.strictEqual(battle.history[0].target, 'Intel');
  assert.strictEqual(battle.history[0].damage, strikeEv.total);
  assert.strictEqual(battle.a.energy, E.CFG.ENERGY_ATTACK);
});

test('dégâts cohérents avec la formule (mitigation de la défense)', () => {
  const battle = E.createBattle('nvidia', 'samsung', { rng: always(0.5) });
  const atk = E.effStat(battle.a, 'attaque');      // 99
  const def = E.effStat(battle.b, 'defense');      // 95
  const expected = Math.max(1, Math.round(atk * 1.0 * E.CFG.DMG_SCALE * (1 - E.mitigation(def))));
  E.act(battle, 'attack');
  assert.strictEqual(battle.history[0].damage, expected);
  assert.ok(Math.abs(E.mitigation(95) - 95 / (95 + E.CFG.MITIGATION_K)) < 1e-9);
});

test('coup critique : multiplicateur appliqué et signalé', () => {
  const plain = E.createBattle('amd', 'xiaomi', { rng: always(0.99) });
  E.act(plain, 'attack');
  const crit = E.createBattle('amd', 'xiaomi', { rng: always(0.0) });  // tirage 0 → critique
  const events = E.act(crit, 'attack');
  const ev = events.find((e) => e.t === 'strike');
  assert.strictEqual(ev.hits[0].crit, true);
  assert.strictEqual(crit.history[0].crit, true);
  assert.strictEqual(crit.history[0].result, 'CRITIQUE');
  assert.ok(crit.history[0].damage > plain.history[0].damage * 1.3, 'le critique devrait frapper bien plus fort');
  assert.strictEqual(crit.stats.crits, 1);
});

test('esquive possible quand la cible est plus rapide', () => {
  const battle = E.createBattle('microsoft', 'google', { rng: always(0) }); // tirage 0 → esquive systématique
  const events = actOnSide(battle, 'left', 'attack');            // Microsoft (plus lent) attaque Google
  const ev = events.find((e) => e.t === 'strike');
  assert.strictEqual(ev.hits[0].dodged, true);
  assert.strictEqual(lastActionOf(battle, 'left').result, 'Esquivé');
  assert.strictEqual(lastActionOf(battle, 'left').damage, 0);
  assert.strictEqual(battle.b.hp, battle.b.maxHp);
  assert.ok(E.dodgeChance(battle.a, battle.b) > E.dodgeChance(battle.b, battle.a),
    'la cible la plus rapide doit esquiver davantage');
});

test('la défense réduit les dégâts encaissés', () => {
  const open = E.createBattle('sony', 'intel', { rng: always(0.99) });
  E.act(open, 'attack');              // Sony (vitesse 88) frappe en premier
  const openDamage = open.history[0].damage;

  const guarded = E.createBattle('sony', 'intel', { rng: always(0.99) });
  E.act(guarded, 'attack');           // même première frappe
  actOnSide(guarded, 'right', 'defend');
  assert.strictEqual(guarded.b.defending, true);
  actOnSide(guarded, 'left', 'attack');
  assert.strictEqual(guarded.b.defending, true, 'la garde doit tenir jusqu’au prochain tour d’Intel');
  const guardedDamage = lastActionOf(guarded, 'left').damage;
  assert.ok(guardedDamage < openDamage * 0.7, `garde inefficace (${guardedDamage} vs ${openDamage})`);

  // La garde retombe au tour suivant du défenseur
  actOnSide(guarded, 'right', 'attack');
  assert.strictEqual(guarded.b.defending, false, 'la garde devrait être relâchée');
});

test('pouvoir spécial : verrouillé sans énergie, puis consommé', () => {
  const battle = E.createBattle('nvidia', 'samsung', { rng: always(0.99) });
  assert.strictEqual(E.canUseSpecial(battle.a), false);
  const events = actOnSide(battle, 'left', 'special');   // retombe sur une attaque normale
  assert.strictEqual(events.find((e) => e.t === 'specialCast'), undefined);
  assert.strictEqual(lastActionOf(battle, 'left').action, 'Attaque');

  battle.a.energy = 100;
  const ev2 = actOnSide(battle, 'left', 'special');
  const cast = ev2.find((e) => e.t === 'specialCast');
  assert.ok(cast, 'le spécial n’a pas été déclenché');
  assert.strictEqual(cast.name, 'Ray Tracing');
  assert.strictEqual(battle.a.energy, 100 - battle.a.brand.special.cost + E.CFG.ENERGY_ATTACK);
  assert.strictEqual(battle.stats.specials, 1);
  assert.strictEqual(lastActionOf(battle, 'left').action, 'Ray Tracing');
});

test('Ray Tracing perce la défense là où une attaque normale bute', () => {
  const wall = E.createBattle('nvidia', 'samsung', { rng: always(0.99) });
  actOnSide(wall, 'left', 'attack');
  const normal = lastActionOf(wall, 'left').damage;
  wall.a.energy = 100;
  actOnSide(wall, 'left', 'special');
  const pierced = lastActionOf(wall, 'left').damage;
  assert.ok(pierced > normal, `pierce inefficace (${pierced} vs ${normal})`);
});

test('Réseau 5G étourdit : l’adversaire perd son tour', () => {
  const battle = E.createBattle('huawei', 'microsoft', { rng: always(0.99) });
  battle.a.energy = 100;
  actOnSide(battle, 'left', 'special');
  assert.strictEqual(battle.b.stun, 1);
  const events = actOnSide(battle, 'right', 'attack');   // tour de Microsoft
  assert.ok(events.some((e) => e.t === 'stunned'), 'tour étourdi non signalé');
  assert.ok(lastActionOf(battle, 'right', 'Étourdi'), 'ligne « Étourdi » absente de l’historique');
  assert.strictEqual(battle.b.stun, 0);
  assert.strictEqual(battle.a.hp, battle.a.maxHp, 'Microsoft ne doit pas avoir pu frapper');
});

test('Super Étoile rend invulnérable : dégâts bloqués', () => {
  const battle = E.createBattle('nintendo', 'amd', { rng: always(0.99) });
  battle.a.energy = 100;
  actOnSide(battle, 'left', 'special');
  assert.strictEqual(battle.a.shield, 2);
  const events = actOnSide(battle, 'right', 'attack');   // AMD frappe le bouclier
  assert.strictEqual(events.find((e) => e.t === 'strike').hits[0].blocked, true);
  const row = lastActionOf(battle, 'right');
  assert.strictEqual(row.damage, 0);
  assert.strictEqual(row.result, 'Bloqué');
  assert.strictEqual(battle.a.hp, battle.a.maxHp);
});

test('K.O. : le combat s’arrête et désigne un vainqueur', () => {
  const battle = E.createBattle('apple', 'intel', { rng: always(0.99) });
  battle.b.hp = 1;
  const events = E.act(battle, 'attack');
  assert.strictEqual(battle.active, false);
  assert.strictEqual(battle.winner, battle.a);
  assert.strictEqual(battle.endReason, 'ko');
  assert.ok(events.some((e) => e.t === 'end' && e.winner === 'left'));
  const koEv = events.find((e) => e.t === 'ko');
  assert.ok(koEv, 'événement K.O. manquant');
  assert.strictEqual(koEv.side, 'right', 'le K.O. doit viser le perdant');
  assert.strictEqual(koEv.winner, 'left');
  const strikeEv = events.find((e) => e.t === 'strike');
  assert.strictEqual(strikeEv.ko, 'right');
  assert.strictEqual(battle.b.hp, 0);
  // plus aucune action possible après le K.O.
  assert.deepStrictEqual(E.act(battle, 'attack'), []);
});

test('chaque marque possède un ultime complet et unique', () => {
  const names = new Set();
  for (const b of E.BRANDS) {
    const u = b.ultimate;
    assert.ok(u, b.id + ' : ultime manquant');
    assert.ok(u.name && u.icon && u.phrase && u.fx, b.id + ' : ultime incomplet');
    assert.ok(u.desc && u.desc.length > 10, b.id + ' : description d’ultime manquante');
    assert.ok(!names.has(u.name), 'ultime en double : ' + u.name);
    names.add(u.name);
    const fx = u.effects;
    assert.ok(fx && typeof fx === 'object', b.id + ' : effets d’ultime absents');
    const hasEffect = ['mult', 'heal', 'shieldTurns', 'stunTurns', 'buffs', 'debuff', 'stripBuffs', 'breakShield']
      .some((k) => fx[k] !== undefined);
    assert.ok(hasEffect, b.id + ' : l’ultime n’a aucun effet');
  }
  assert.strictEqual(names.size, E.BRANDS.length);
});

test('jauge d’ultime : remplissage, déclenchement puis recharge bloquée', () => {
  const battle = E.createBattle('apple', 'intel', { rng: always(0.99) });
  assert.strictEqual(battle.a.ult, 0);
  assert.strictEqual(E.canUseUltimate(battle.a), false);

  actOnSide(battle, 'left', 'attack');
  assert.strictEqual(battle.a.ult, E.CFG.ULT_ATTACK);
  assert.strictEqual(battle.b.ult, E.CFG.ULT_HIT);

  // Jauge pleine → l'ultime devient disponible
  battle.a.ult = 100;
  assert.strictEqual(E.canUseUltimate(battle.a), true);

  const events = actOnSide(battle, 'left', 'ultimate');
  const cast = events.find((e) => e.t === 'ultimateCast');
  assert.ok(cast, 'événement ultimateCast absent');
  assert.strictEqual(cast.name, 'Reality Distortion');
  assert.strictEqual(battle.a.ult, 0, 'la jauge doit être vidée');
  assert.strictEqual(battle.a.ultCooldown, E.CFG.ULT_COOLDOWN, 'recharge non armée');
  assert.strictEqual(battle.stats.ultimates, 1);
  assert.strictEqual(battle.a.ultUsed, 1);

  // Pendant la recharge, la jauge ne monte plus et l'ultime est verrouillé
  const hpBefore = battle.b.hp;
  actOnSide(battle, 'right', 'attack');      // Apple encaisse → gain bloqué
  assert.strictEqual(battle.a.ult, 0, 'la jauge ne doit pas monter pendant la recharge');
  assert.strictEqual(E.canUseUltimate(battle.a), false);
  assert.ok(battle.b.hp <= hpBefore);

  // Tour suivant : la recharge tombe à 1
  actOnSide(battle, 'left', 'attack');
  assert.strictEqual(battle.a.ultCooldown, E.CFG.ULT_COOLDOWN - 1);
  assert.strictEqual(battle.a.ult, 0);

  // Encore un tour : la jauge est de nouveau active
  actOnSide(battle, 'left', 'attack');
  assert.strictEqual(battle.a.ultCooldown, 0);
  assert.strictEqual(battle.a.ult, E.CFG.ULT_ATTACK);
});

test('l’ultime ne peut être ni esquivé ni réduit par la garde', () => {
  // Microsoft est plus lent que Google : ses attaques de base se font esquiver (tirage 0)
  const plain = E.createBattle('microsoft', 'google', { rng: always(0) });
  actOnSide(plain, 'left', 'attack');
  assert.strictEqual(lastActionOf(plain, 'left').result, 'Esquivé', 'l’attaque de base doit être esquivée');

  // Référence : ultime lancé sur une cible qui ne se protège pas
  const open = E.createBattle('microsoft', 'google', { rng: always(0.99) });
  open.a.ult = 100;
  actOnSide(open, 'left', 'ultimate');
  const refDamage = lastActionOf(open, 'left').damage;
  assert.ok(refDamage > 0, 'l’ultime doit infliger des dégâts');

  // Même ultime, mais la cible avait levé sa garde
  const guarded = E.createBattle('microsoft', 'google', { rng: always(0.99) });
  actOnSide(guarded, 'right', 'defend');
  assert.strictEqual(guarded.b.defending, true, 'la garde devrait être levée');
  guarded.a.ult = 100;
  const events = actOnSide(guarded, 'left', 'ultimate');
  const strikeEv = events.find((e) => e.t === 'strike');
  assert.ok(strikeEv, 'frappe d’ultime absente');
  assert.strictEqual(strikeEv.hits[0].dodged, false, 'un ultime ne peut pas être esquivé');
  assert.strictEqual(guarded.b.defending, false, 'la garde doit céder face à un ultime');
  assert.strictEqual(lastActionOf(guarded, 'left').damage, refDamage, 'la garde ne réduit pas un ultime');
  assert.ok(guarded.b.hp < guarded.b.maxHp);
});

test('chaque ultime se déclenche, frappe et remplit l’historique détaillé', () => {
  for (const brand of E.BRANDS) {
    const battle = E.createBattle(brand.id, 'intel', { rng: rngFrom(21) });
    battle.a.ult = 100;
    const events = actOnSide(battle, 'left', 'ultimate');
    const cast = events.find((e) => e.t === 'ultimateCast');
    assert.ok(cast, brand.id + ' : ultime non déclenché');

    const row = battle.history.find((h) => h.actionKind === 'ultimate' && h.actorSide === 'left');
    assert.ok(row, brand.id + ' : ligne d’ultime absente de l’historique');
    assert.strictEqual(row.action, brand.ultimate.name);
    assert.strictEqual(row.ult, true);
    assert.strictEqual(row.round, 1);
    assert.ok(row.hpLeft && typeof row.hpLeft.right === 'number', brand.id + ' : PV restants absents');
    assert.ok(row.hpPct && typeof row.hpPct.right === 'number', brand.id + ' : pourcentage de PV absent');
    assert.ok(row.ultAfter && row.ultAfter.left === 0, brand.id + ' : jauge d’ultime non renseignée');
    assert.ok(Array.isArray(row.effects), brand.id + ' : effets non listés');
    assert.ok(row.index >= 1, brand.id + ' : numéro d’action absent');
  }
});

test('les effets d’ultime s’appliquent (étourdissement, soin, buffs, dissipation)', () => {
  // Harmony Strike : étourdissement de 2 tours
  const stun = E.createBattle('huawei', 'microsoft', { rng: always(0.99) });
  stun.a.ult = 100;
  actOnSide(stun, 'left', 'ultimate');
  assert.strictEqual(stun.b.stun, 2);
  assert.ok(stun.history.find((h) => h.result.indexOf('Étourdi 2 tours') === 0), 'ligne de contrôle absente');

  // Super Star : soin + invulnérabilité
  const star = E.createBattle('nintendo', 'amd', { rng: always(0.99) });
  star.a.hp = 100;
  star.a.ult = 100;
  actOnSide(star, 'left', 'ultimate');
  assert.strictEqual(star.a.shield, 2, 'invulnérabilité non posée');
  assert.ok(star.a.hp > 100, 'soin d’ultime non appliqué');

  // Ryzen Fury : buffs + contre-coup
  const amd = E.createBattle('amd', 'intel', { rng: always(0.99) });
  amd.a.ult = 100;
  const hpBefore = amd.a.hp;
  actOnSide(amd, 'left', 'ultimate');
  assert.ok(amd.a.hp < hpBefore, 'le contre-coup de Ryzen Fury est absent');
  assert.ok(amd.a.buffs.length >= 2, 'les buffs d’ultime ne sont pas posés');

  // RTX Overdrive brise l'invulnérabilité, Reality Distortion dissipe les buffs
  const rtx = E.createBattle('nvidia', 'nintendo', { rng: always(0.99) });
  rtx.b.shield = 3;
  rtx.b.buffs = [{ stat: 'defense', mult: 1.5, turns: 3, label: '+50 % défense', icon: '🛡️' }];
  rtx.a.ult = 100;
  actOnSide(rtx, 'left', 'ultimate');
  const nvidiaRow = rtx.history.find((h) => h.actionKind === 'ultimate');
  assert.ok(rtx.b.hp < rtx.b.maxHp, 'RTX Overdrive doit traverser le bouclier');

  const apple = E.createBattle('apple', 'nintendo', { rng: always(0.99) });
  apple.b.buffs = [{ stat: 'defense', mult: 1.5, turns: 3, label: '+50 % défense', icon: '🛡️' }];
  apple.a.ult = 100;
  actOnSide(apple, 'left', 'ultimate');
  assert.strictEqual(apple.b.buffs.length, 0, 'Reality Distortion doit dissiper les buffs');
  assert.ok(apple.history.find((h) => h.effects.some((e) => /dissipé/.test(e))), 'effet non tracé');
  assert.ok(nvidiaRow);
});

test('chaque pouvoir spécial se déclenche sans erreur', () => {
  for (const brand of E.BRANDS) {
    const battle = E.createBattle(brand.id, 'intel', { rng: rngFrom(7) });
    battle.a.energy = 100;
    const events = actOnSide(battle, 'left', 'special');
    assert.ok(events.find((e) => e.t === 'specialCast'), brand.id + ' : spécial non déclenché');
    assert.ok(battle.history.length >= 1, brand.id + ' : historique vide');
  }
});

test('autoPlay termine tous les duels par un vainqueur', () => {
  let battles = 0;
  for (const a of E.BRANDS) {
    for (const b of E.BRANDS) {
      if (a.id === b.id) continue;
      const battle = E.createBattle(a.id, b.id, { rng: rngFrom(battles + 11) });
      E.autoPlay(battle);
      assert.strictEqual(battle.active, false, `${a.id} vs ${b.id} : combat non terminé`);
      assert.ok(battle.winner, `${a.id} vs ${b.id} : aucun vainqueur`);
      assert.ok(battle.round <= E.CFG.MAX_ROUNDS + 1, `${a.id} vs ${b.id} : ${battle.round} rounds`);
      assert.ok(battle.history.length >= 2, `${a.id} vs ${b.id} : historique trop court`);
      battles++;
    }
  }
  assert.strictEqual(battles, 110);
});

test('équilibre : aucune marque ne gagne tout ni ne perd tout', () => {
  const results = {};
  for (const a of E.BRANDS) {
    results[a.id] = { wins: 0, total: 0, rounds: 0 };
    for (const b of E.BRANDS) {
      if (a.id === b.id) continue;
      for (let seed = 1; seed <= 4; seed++) {
        const battle = E.createBattle(a.id, b.id, { rng: rngFrom(seed * 977 + b.id.length * 31) });
        E.autoPlay(battle);
        results[a.id].total++;
        results[a.id].rounds += battle.round;
        if (battle.winner === battle.a) results[a.id].wins++;
      }
    }
  }
  const report = Object.entries(results)
    .map(([id, r]) => `${id}:${Math.round((r.wins / r.total) * 100)}%(${Math.round(r.rounds / r.total)}r)`)
    .join(' ');
  console.log('      taux de victoire → ' + report);
  for (const [id, r] of Object.entries(results)) {
    const rate = r.wins / r.total;
    assert.ok(rate > 0.15, `${id} trop faible : ${(rate * 100).toFixed(0)} %`);
    assert.ok(rate < 0.85, `${id} trop fort : ${(rate * 100).toFixed(0)} %`);
    const avgRounds = r.rounds / r.total;
    assert.ok(avgRounds >= 4, `${id} : combats trop courts (${avgRounds.toFixed(1)} rounds)`);
    assert.ok(avgRounds <= 22, `${id} : combats trop longs (${avgRounds.toFixed(1)} rounds)`);
  }
});
