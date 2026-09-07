/* Tests du Boss Rush : données des boss, difficultés, phases, passifs,
   ordre de passage (boss secret) et récompenses. */
const test = require('node:test');
const assert = require('node:assert');
const B = require('../js/bosses.js');
const E = require('../js/engine.js');
const P = require('../js/progression.js');
const Data = require('../js/brands.js');

const freshMeta = () => P.hydrate(P.emptyProgress());

test('les cinq boss demandés sont présents, avec leur PV exact', () => {
  const wanted = { megatech: 1200, overclock: 1500, quantum: 1800, corrupted: 2200, finalbrand: 3000 };
  Object.keys(wanted).forEach((id) => {
    const b = B.getBoss(id);
    assert.ok(b, 'boss manquant : ' + id);
    assert.strictEqual(b.stats.pv, wanted[id], 'PV incorrects pour ' + id);
    assert.ok(b.boss, id + ' doit être marqué comme boss');
    assert.ok(b.special && b.special.name, 'pouvoir spécial manquant : ' + id);
    assert.ok(b.ultimate && b.ultimate.name, 'ultime manquant : ' + id);
    assert.ok(b.passive, 'passif manquant : ' + id);
    assert.ok(b.phases && b.phases.length >= 1, 'phases manquantes : ' + id);
    assert.ok(b.music, 'musique de boss manquante : ' + id);
    assert.ok(b.intro, 'cinématique d’introduction manquante : ' + id);
    assert.ok(b.fx, 'effet visuel manquant : ' + id);
  });
});

test('les quatre difficultés existent, avec des seuils croissants', () => {
  assert.deepStrictEqual(B.DIFFICULTIES.map((d) => d.id), ['normal', 'difficile', 'extreme', 'impossible']);
  let lastXp = 0;
  B.DIFFICULTIES.forEach((d) => {
    assert.ok(d.icon && d.name && d.desc, 'difficulté incomplète : ' + d.id);
    assert.ok(d.xp > lastXp, 'les récompenses doivent croître avec la difficulté');
    lastXp = d.xp;
    assert.ok(d.boss.attaque >= 1 && d.player.pv > 1, 'multiplicateurs incohérents : ' + d.id);
  });
  assert.strictEqual(B.getDifficulty('inconnu').id, 'normal', 'difficulté inconnue → normal');
});

test('chaque boss change de phase sous les 50 % de PV', () => {
  B.BOSSES.forEach((boss) => {
    assert.strictEqual(boss.phases[0].at, 0.5, boss.id + ' : la première phase doit arriver à 50 %');
    assert.match(boss.phases[0].label, /PHASE 2/, boss.id + ' : le message « PHASE 2 ! » est attendu');
    boss.phases.forEach((p) => {
      assert.ok(p.name, 'nom de phase manquant : ' + boss.id);
      assert.ok(p.stats, 'statistiques de phase manquantes : ' + boss.id);
      assert.ok(p.colors, 'nouvelles couleurs manquantes : ' + boss.id);
    });
  });
  // le boss final a plusieurs phases
  assert.ok(B.getBoss('finalbrand').phases.length >= 2, 'le boss final doit avoir plusieurs phases');
});

test('le boss passe en phase 2 en combat : apparence, statistiques et attaques changent', () => {
  const boss = B.getBoss('megatech');
  const battle = E.createBattle('apple', boss, { left: { statMult: { attaque: 3 } } });
  const foe = battle.b;
  const atk0 = foe.base.attaque;
  const name0 = foe.name;
  const special0 = foe.brand.special.name;
  foe.hp = Math.floor(foe.maxHp * 0.4);          // passage sous les 50 %

  const events = [];
  E.checkPhases(battle, events);

  const ev = events.find((e) => e.t === 'bossPhase');
  assert.ok(ev, 'aucun événement de phase émis');
  assert.strictEqual(ev.phase, 1);
  assert.strictEqual(ev.label, 'PHASE 2 !');
  assert.notStrictEqual(foe.name, name0, 'le boss doit changer de nom');
  assert.notStrictEqual(foe.brand.special.name, special0, 'le boss doit changer de pouvoir');
  assert.ok(foe.base.attaque > atk0, 'les statistiques doivent évoluer');
  assert.strictEqual(foe.phase, 1);
  // les PV restent proportionnels : la phase ne soigne pas le boss
  assert.ok(foe.hp < foe.maxHp * 0.5, 'le boss ne doit pas être soigné par la phase');
});

test('CORRUPTED AI copie le pouvoir spécial et l’ultime du joueur', () => {
  const boss = B.getBoss('corrupted');
  const battle = E.createBattle('nintendo', boss, {});
  const foe = battle.b;
  const player = battle.a;
  foe.hp = Math.floor(foe.maxHp * 0.4);
  const events = [];
  E.checkPhases(battle, events);

  const ev = events.find((e) => e.t === 'bossPhase');
  assert.ok(ev && ev.copied, 'la phase 2 doit copier l’adversaire');
  assert.strictEqual(foe.brand.special.name, player.brand.special.name, 'pouvoir spécial non copié');
  assert.strictEqual(foe.brand.ultimate.name, player.brand.ultimate.name, 'ultime non copié');
  assert.strictEqual(foe.brand.copiedFrom, 'Nintendo');
});

test('les passifs de boss s’appliquent (surcharge, montée en puissance, esquive, soin, renvoi)', () => {
  const mk = (bossId) => E.createBattle('apple', B.getBoss(bossId), {}).b;

  // montée en puissance : l'attaque effective augmente à chaque tour
  const oc = mk('overclock');
  const battle = E.createBattle('apple', B.getBoss('overclock'), {});
  const foe = battle.b;
  const before = E.effStat(foe, 'attaque');
  const evs = [];
  E.applyPassive(battle, foe, evs);
  assert.ok(evs.some((e) => e.t === 'bossPassive' && e.kind === 'rampage'), 'passif « rampage » absent');
  assert.ok(E.effStat(foe, 'attaque') > before, 'l’attaque doit monter');

  // esquive : la vitesse (donc l'esquive) augmente
  const qb = E.createBattle('apple', B.getBoss('quantum'), {});
  const q = qb.b;
  const spd0 = E.effStat(q, 'vitesse');
  E.applyPassive(qb, q, []);
  assert.ok(E.effStat(q, 'vitesse') > spd0, 'la vitesse doit augmenter (esquives)');

  // surcharge : une frappe est forcée tous les N tours
  const mb = E.createBattle('apple', B.getBoss('megatech'), {});
  const m = mb.b;
  let forced = null;
  for (let i = 0; i < 3 && !forced; i++) forced = E.applyPassive(mb, m, []);
  assert.strictEqual(forced, 'overload', 'la surcharge doit être déclenchée');

  // soin passif
  const cb = E.createBattle('apple', B.getBoss('corrupted'), {});
  const c = cb.b;
  c.hp = Math.floor(c.maxHp * 0.5);
  const hp0 = c.hp;
  E.applyPassive(cb, c, []);
  assert.ok(c.hp > hp0, 'le boss doit se régénérer');

  // renvoi de dégâts
  const nb = E.createBattle('apple', B.getBoss('nullsector'), {});
  E.applyPassive(nb, nb.b, []);
  assert.ok(nb.b.mirror > 0, 'le boss doit renvoyer une part des dégâts');
});

test('un combat de boss se termine toujours par un vainqueur', () => {
  B.BOSSES.forEach((boss) => {
    for (let i = 0; i < 3; i++) {
      const d = B.getDifficulty('normal');
      const battle = E.createBattle('apple', boss, {
        left: { level: 60, statMult: B.playerBoost(d, boss) },
        right: { statMult: d.boss }
      });
      E.autoPlay(battle);
      assert.ok(!battle.active, boss.id + ' : le combat doit se terminer');
      assert.ok(battle.winner, boss.id + ' : un vainqueur est attendu');
      assert.ok(battle.round <= E.CFG.MAX_ROUNDS, boss.id + ' : trop de rounds');
    }
  });
});

test('ordre du Boss Rush : cinq boss, puis le boss secret une fois tous vaincus', () => {
  let order = B.rushOrder({}, true);
  assert.strictEqual(order.length, 5, 'le boss secret ne doit pas apparaître au début');
  assert.ok(order.every((b) => !b.secret));

  const four = { megatech: true, overclock: true, quantum: true, corrupted: true };
  assert.strictEqual(B.rushOrder(four, true).length, 5, 'le secret reste caché sans le boss final');

  const all = Object.assign({}, four, { finalbrand: true });
  order = B.rushOrder(all, true);
  assert.strictEqual(order.length, 6, 'le boss secret doit rejoindre la suite');
  assert.strictEqual(order[5].id, 'nullsector');
  assert.ok(B.allMainCleared(all));
  assert.ok(!B.allMainCleared(four));
});

test('récompenses : premier boss vaincu = XP, skin, titre, badge et trophée', () => {
  const meta = freshMeta();
  const r1 = P.grantBossRewards(meta, { bossId: 'megatech', difficulty: 'normal', won: true, damage: 1500, brand: 'apple' });
  assert.ok(r1.firstClear, 'première victoire détectée');
  assert.ok(r1.xp > 0, 'XP attribuée');
  assert.strictEqual(r1.skin.id, 'circuit');
  assert.strictEqual(r1.title.name, B.getBoss('megatech').reward.title);
  assert.ok(meta.boss.cleared.megatech, 'boss marqué comme vaincu');
  assert.ok(meta.boss.skins.includes('circuit'), 'skin débloqué');
  assert.ok(meta.boss.titles.length === 1, 'titre débloqué');
  assert.ok(r1.trophies.some((t) => t.id === 'bossFirst'), 'trophée « Premier boss » attendu');
  assert.strictEqual(meta.boss.totalDamage, 1500, 'dégâts cumulés');

  // revaincre le même boss : pas de doublon, XP réduite
  const r2 = P.grantBossRewards(meta, { bossId: 'megatech', difficulty: 'normal', won: true, damage: 1500, brand: 'apple' });
  assert.strictEqual(r2.firstClear, false);
  assert.ok(r2.xp < r1.xp, 'revaincre un boss rapporte moins');
  assert.strictEqual(meta.boss.skins.length, 1, 'aucun doublon de skin');
  assert.strictEqual(meta.boss.titles.length, 1, 'aucun doublon de titre');

  // une défaite ne débloque rien
  const before = JSON.stringify(meta.boss);
  const r3 = P.grantBossRewards(meta, { bossId: 'overclock', difficulty: 'normal', won: false, damage: 800, brand: 'apple' });
  assert.strictEqual(r3.xp, 0);
  assert.ok(!meta.boss.cleared.overclock);
  assert.notStrictEqual(JSON.stringify(meta.boss), before, 'les dégâts sont tout de même comptés');
});

test('récompenses : la difficulté majore l’XP', () => {
  const a = freshMeta();
  const b = freshMeta();
  const na = P.grantBossRewards(a, { bossId: 'megatech', difficulty: 'normal', won: true }).xp;
  const im = P.grantBossRewards(b, { bossId: 'megatech', difficulty: 'impossible', won: true }).xp;
  assert.ok(im > na * 2, 'l’Impossible doit rapporter bien plus que le Normal');
});

test('fin de Boss Rush : temps, dégâts, marque et difficulté enregistrés', () => {
  const meta = freshMeta();
  P.finishBossRush(meta, { won: true, timeMs: 240000, damage: 9000, brand: 'apple', difficulty: 'extreme', bosses: 5 });
  assert.strictEqual(meta.boss.runs, 1);
  assert.strictEqual(meta.boss.wins, 1);
  assert.strictEqual(meta.boss.bestTime, 240000);
  assert.strictEqual(meta.boss.bestDamage, 9000);
  assert.strictEqual(meta.boss.bestBrand, 'apple');
  assert.strictEqual(meta.boss.bestDifficulty, 'extreme');
  assert.strictEqual(meta.boss.byDifficulty.extreme, 1);
  assert.strictEqual(meta.boss.bestTimeByDiff.extreme, 240000);

  // un meilleur temps remplace le précédent, un moins bon ne l'écrase pas
  P.finishBossRush(meta, { won: true, timeMs: 300000, damage: 4000, brand: 'sony', difficulty: 'extreme', bosses: 5 });
  assert.strictEqual(meta.boss.bestTime, 240000, 'le record ne doit pas être écrasé');
  assert.strictEqual(meta.boss.bestDamage, 9000);
  assert.strictEqual(meta.boss.byDifficulty.extreme, 2);

  P.finishBossRush(meta, { won: false, timeMs: 60000, damage: 1000, brand: 'sony', difficulty: 'normal', bosses: 2 });
  assert.strictEqual(meta.boss.losses, 1);
  assert.strictEqual(meta.boss.wins, 2);
  assert.strictEqual(meta.boss.runs, 3);
});

test('les trophées et skins de boss rejoignent la progression générale', () => {
  const meta = freshMeta();
  B.BOSSES.forEach((b) => {
    P.grantBossRewards(meta, { bossId: b.id, difficulty: 'impossible', won: true, damage: 9000, brand: 'apple' });
  });
  P.finishBossRush(meta, { won: true, timeMs: 120000, damage: 40000, brand: 'apple', difficulty: 'impossible', bosses: 6 });

  const trophies = P.trophiesOf(meta);
  const bossTrophies = trophies.filter((t) => t.bossExclusive);
  assert.strictEqual(bossTrophies.length, B.BOSS_TROPHIES.length, 'trophées de boss absents du profil');
  assert.ok(bossTrophies.every((t) => t.earned), 'tous les trophées de boss doivent être débloqués');
  assert.strictEqual(meta.boss.skins.length, 6, 'six skins exclusifs attendus');
  assert.strictEqual(meta.boss.titles.length, 6, 'six titres attendus');
  assert.strictEqual(P.unlockedBossSkins(meta).length, 6);
  assert.ok(P.isBossSkin('crown'));
  assert.ok(!P.isBossSkin('neon'));
});

test('sauvegarde : une ancienne progression est complétée sans rien écraser', () => {
  const meta = P.hydrate({ wins: 7, boss: { cleared: { megatech: true }, skins: ['magma'] } });
  assert.strictEqual(meta.wins, 7, 'les anciennes statistiques doivent survivre');
  assert.ok(meta.boss, 'le bloc Boss Rush doit être créé');
  assert.ok(meta.boss.cleared.megatech, 'les boss vaincus doivent survivre');
  assert.deepStrictEqual(meta.boss.skins, ['magma']);
  assert.strictEqual(meta.boss.runs, 0);
  assert.strictEqual(meta.boss.bestTime, null);
  assert.ok(Array.isArray(meta.boss.titles));
  assert.ok(meta.boss.byDifficulty && typeof meta.boss.byDifficulty === 'object');

  const reset = P.hydrate(P.emptyProgress());
  reset.boss = B.emptyBossSave();
  assert.strictEqual(B.bossCount(reset.boss), 0);
  assert.strictEqual(reset.boss.trophies.length, 0);
});

test('les skins de boss sont portables par n’importe quelle marque', () => {
  const meta = freshMeta();
  meta.boss.skins = ['crown'];
  Data.BRANDS.forEach((b) => {
    const st = P.brandState(meta, b.id);
    assert.ok(P.isSkinUnlocked('crown', 1, meta), 'skin de boss refusé pour ' + b.id);
    assert.ok(!P.isSkinUnlocked('void', 1, meta), 'skin non débloqué accepté pour ' + b.id);
    assert.ok(P.skinById('crown').css === 'skin--crown');
    assert.ok(st.level >= 1);
  });
  assert.ok(P.unlockedSkins(1).every((s) => !P.isBossSkin(s.id)),
    'les skins de boss ne doivent pas être débloqués par le niveau');
});
