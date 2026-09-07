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
