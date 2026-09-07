/* Tests du système de progression — exécutés par `node --test` */
const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/progression.js');
const B = require('../js/brands.js');

function freshMeta() {
  return P.hydrate({
    wins: 0, losses: 0, crits: 0, specials: 0, ultimates: 0,
    bestDamage: 0, streak: 0, bestStreak: 0, duels: []
  });
}

const battle = (over) => Object.assign({
  mode: 'duel', playerBrand: 'apple', foeBrand: 'intel',
  won: true, rounds: 8, crits: 3, specials: 2, ultimates: 1,
  maxDamage: 180, ko: true, koBy: 'apple', koOn: 'intel',
  ultimatesByBrand: { apple: 1, intel: 0 },
  maxDamageByBrand: { apple: 180, intel: 90 }
}, over || {});

test('courbe d’XP : coût croissant et niveau dérivé de l’XP cumulée', () => {
  assert.strictEqual(P.xpNeeded(1), 30);
  assert.strictEqual(P.xpNeeded(2), 32);
  assert.ok(P.xpNeeded(50) > P.xpNeeded(20), 'la courbe doit être croissante');

  const start = P.levelFromXp(0);
  assert.strictEqual(start.level, 1);
  assert.strictEqual(start.into, 0);
  assert.strictEqual(start.pct, 0);

  const lvl2 = P.levelFromXp(30);
  assert.strictEqual(lvl2.level, 2);
  assert.strictEqual(lvl2.into, 0);

  const mid = P.levelFromXp(29);
  assert.strictEqual(mid.level, 1);
  assert.strictEqual(mid.pct, Math.round((29 / 30) * 1000) / 10);

  // cumul cohérent avec la courbe
  assert.strictEqual(P.levelFromXp(P.xpToReach(10)).level, 10);
  assert.strictEqual(P.levelFromXp(P.xpToReach(10) - 1).level, 9);

  // plafond à 100
  const max = P.levelFromXp(999999);
  assert.strictEqual(max.level, P.LEVEL_MAX);
  assert.strictEqual(max.maxed, true);
  assert.strictEqual(max.pct, 100);
});

test('progression : les statistiques montent légèrement avec le niveau', () => {
  assert.strictEqual(P.statGrowth(1), 1);
  assert.strictEqual(Math.round(P.statGrowth(100) * 100) / 100, 1.2);
  const mid = P.statGrowth(50);
  assert.ok(mid > 1.05 && mid < 1.15, 'croissance intermédiaire attendue : ' + mid);
  // la progression est monotone
  for (let l = 2; l <= 100; l++) assert.ok(P.statGrowth(l) > P.statGrowth(l - 1));
});

test('raretés : chaque marque en possède une, toutes les raretés sont représentées', () => {
  const seen = {};
  for (const b of B.BRANDS) {
    assert.ok(b.rarity, b.id + ' : rareté manquante');
    const r = P.rarityOf(b.id);
    assert.ok(r && r.name && r.icon && r.color, b.id + ' : rareté invalide');
    seen[b.rarity] = (seen[b.rarity] || 0) + 1;
  }
  ['commun', 'rare', 'epique', 'legendaire', 'mythique'].forEach((k) => {
    assert.ok(seen[k] > 0, 'aucune marque de rareté ' + k);
  });
  assert.strictEqual(Object.keys(seen).length, 5);
});

test('skins : débloqués par niveau et jamais rétroactivement perdus', () => {
  assert.strictEqual(P.unlockedSkins(1).length, 1);
  assert.strictEqual(P.unlockedSkins(1)[0].id, 'base');
  assert.ok(P.unlockedSkins(30).length >= 4, 'le niveau 30 doit débloquer plusieurs skins');
  assert.strictEqual(P.unlockedSkins(100).length, P.SKINS.length);
  assert.strictEqual(P.nextSkin(1).level, 5);
  assert.strictEqual(P.nextSkin(100), null);
  assert.strictEqual(P.isSkinUnlocked('gold', 50), true);
  assert.strictEqual(P.isSkinUnlocked('gold', 49), false);
  assert.strictEqual(P.skinById('inconnu').id, 'base');
});

test('rangs : huit rangs, seuils croissants et barre de progression', () => {
  assert.deepStrictEqual(P.RANKS.map((r) => r.name),
    ['Bronze', 'Argent', 'Or', 'Platine', 'Diamant', 'Maître', 'Grand Maître', 'Champion']);
  for (let i = 1; i < P.RANKS.length; i++) {
    assert.ok(P.RANKS[i].level > P.RANKS[i - 1].level, 'seuils de rang croissants');
  }
  assert.strictEqual(P.rankFromLevel(1).rank.id, 'bronze');
  assert.strictEqual(P.rankFromLevel(5).rank.id, 'argent');
  assert.strictEqual(P.rankFromLevel(70).rank.id, 'champion');
  assert.strictEqual(P.rankFromLevel(999).rank.id, 'champion');
  assert.strictEqual(P.rankFromLevel(999).next, null);

  const r = P.rankFromLevel(12);           // entre Or (10) et Platine (18)
  assert.strictEqual(r.rank.id, 'or');
  assert.strictEqual(r.next.id, 'platine');
  assert.strictEqual(r.pct, 25);
  assert.strictEqual(r.remaining, 6);
});

test('XP de combat : une victoire rapporte plus qu’une défaite, avec détail', () => {
  const win = P.battleXp(battle({ won: true }));
  const loss = P.battleXp(battle({ won: false }));
  assert.ok(win.total > loss.total, 'une victoire doit rapporter plus');
  assert.ok(win.total >= 45, 'XP de victoire trop faible : ' + win.total);
  assert.ok(win.parts.length >= 3, 'le détail de l’XP doit être listé');
  assert.ok(win.parts.some((p) => /Victoire/.test(p.label)));
  assert.strictEqual(win.parts.reduce((s, p) => s + p.value, 0), win.total);

  const withUlt = P.battleXp(battle({ ultimates: 3 }));
  assert.ok(withUlt.total > win.total, 'les ultimes doivent rapporter de l’XP');
});

test('badges de maîtrise : débloqués selon les statistiques de la marque', () => {
  const none = P.badgesOf({ wins: 0, level: 1, ultimates: 0, bestDamage: 0 });
  assert.ok(none.length >= 6, 'chaque marque doit avoir plusieurs badges');
  assert.strictEqual(none.filter((b) => b.earned).length, 0);

  const pro = P.badgesOf({ wins: 60, level: 100, ultimates: 40, bestDamage: 260 });
  assert.strictEqual(pro.filter((b) => b.earned).length, pro.length, 'tout doit être débloqué');
  assert.ok(pro.every((b) => b.icon && b.name && b.desc));
});

test('trophées : aucun au départ, puis débloqués selon les statistiques globales', () => {
  const empty = P.trophiesOf(freshMeta());
  assert.strictEqual(empty.filter((t) => t.earned).length, 0);
  assert.ok(empty.length >= 10, 'au moins 10 trophées attendus');

  const rich = Object.assign(freshMeta(), {
    wins: 100, battles: 200, bestStreak: 12, ultimates: 80,
    crits: 200, bestDamage: 300, tournamentWin: true, playerXp: 999999
  });
  B.BRANDS.forEach((b) => { rich.brands[b.id].xp = 999999; });   // skins débloqués
  const full = P.trophiesOf(rich);
  assert.strictEqual(full.filter((t) => t.earned).length, full.length);
});

test('applyBattleResult : XP, montée de niveau, skins et trophées', () => {
  const meta = freshMeta();
  const before = meta.playerXp;
  const report = P.applyBattleResult(meta, battle());

  assert.strictEqual(report.xp, P.battleXp(battle()).total);
  assert.strictEqual(meta.playerXp, before + report.xp);
  assert.strictEqual(meta.battles, 1);
  assert.strictEqual(meta.wins, 1);
  assert.strictEqual(meta.streak, 1);
  assert.strictEqual(meta.brands.apple.xp, report.xp);
  assert.strictEqual(meta.brands.intel.xp, report.xp, 'les deux marques du combat progressent');
  assert.strictEqual(meta.brands.apple.wins, 1);
  assert.strictEqual(meta.brands.intel.losses, 1);
  assert.strictEqual(meta.bestKo.damage, 180);
  assert.strictEqual(meta.bestKo.brand, 'apple');

  // Une seule participation suffit à monter de niveau (30 PX pour le niveau 1)
  assert.ok(report.levelUps.length >= 1, 'une première montée de niveau est attendue');
  const brandUp = report.levelUps.find((l) => l.kind === 'brand');
  assert.ok(brandUp, 'la marque doit gagner un niveau');
  assert.strictEqual(brandUp.from, 1);
  assert.ok(brandUp.to > brandUp.from, 'le niveau doit augmenter');
  assert.ok(report.brands[0].after.pct >= 0, 'la barre d’XP doit être renseignée');

  // Trophée « première victoire » débloqué
  assert.ok(report.newTrophies.some((t) => t.id === 'firstWin'));
  // Le rang ne bouge pas dès le premier combat
  assert.strictEqual(report.rank.after.index, 0);
});

test('applyBattleResult : une défaite casse la série et n’ajoute pas de victoire', () => {
  const meta = Object.assign(freshMeta(), { streak: 4, bestStreak: 4 });
  P.applyBattleResult(meta, battle({ won: false, ko: false }));
  assert.strictEqual(meta.losses, 1);
  assert.strictEqual(meta.wins, 0);
  assert.strictEqual(meta.streak, 0);
  assert.strictEqual(meta.bestStreak, 4, 'la meilleure série reste mémorisée');
  assert.strictEqual(meta.brands.apple.losses, 1);
  assert.strictEqual(meta.brands.intel.wins, 1);
});

test('applyBattleResult : le mode auto ne compte ni victoire ni défaite', () => {
  const meta = freshMeta();
  P.applyBattleResult(meta, battle({ mode: 'auto', won: null }));
  assert.strictEqual(meta.battles, 1);
  assert.strictEqual(meta.wins, 0);
  assert.strictEqual(meta.losses, 0);
  assert.ok(meta.playerXp > 0, 'l’XP est tout de même attribuée');
});

test('applyBattleResult : cumuler les combats fait monter de niveau et de rang', () => {
  const meta = freshMeta();
  let last = null;
  for (let i = 0; i < 40; i++) last = P.applyBattleResult(meta, battle());
  const lvl = P.levelFromXp(meta.playerXp);
  assert.ok(lvl.level > 10, 'niveau attendu après 40 combats : ' + lvl.level);
  assert.ok(lvl.level < 60, 'progression trop rapide : ' + lvl.level);
  assert.ok(P.rankFromLevel(lvl.level).index >= 3, 'rang attendu : ' + P.rankFromLevel(lvl.level).rank.name);
  assert.ok(last, 'rapport de récompenses manquant');

  // skins et badges débloqués en cours de route
  assert.ok(P.brandState(meta, 'apple').level > 10);
  assert.ok(P.unlockedSkins(P.brandState(meta, 'apple').level).length >= 3);
  assert.ok(P.brandState(meta, 'apple').badgesEarned >= 2);

  // niveau 100 accessible sans dépasser le plafond
  const rich = freshMeta();
  for (let i = 0; i < 400; i++) P.applyBattleResult(rich, battle());
  assert.strictEqual(P.levelFromXp(rich.playerXp).level, 100);
  assert.strictEqual(P.levelFromXp(rich.playerXp).maxed, true);
});

test('hydrate : complète une ancienne sauvegarde sans rien écraser', () => {
  const old = { wins: 7, losses: 3, crits: 12, specials: 4, ultimates: 2, bestDamage: 210, streak: 2, bestStreak: 5, duels: [{ a: 1 }] };
  const meta = P.hydrate(old);
  assert.strictEqual(meta.wins, 7, 'les anciennes valeurs doivent être conservées');
  assert.strictEqual(meta.duels.length, 1);
  assert.strictEqual(meta.battles, 0, 'nouveau champ initialisé');
  assert.strictEqual(meta.playerXp, 0);
  assert.ok(meta.bestKo === null);
  B.BRANDS.forEach((b) => {
    assert.ok(meta.brands[b.id], 'fiche de marque manquante : ' + b.id);
    assert.strictEqual(meta.brands[b.id].xp, 0);
    assert.strictEqual(meta.brands[b.id].skin, 'base');
  });
});

test('niveaux : le moteur applique la croissance sans casser l’équilibrage', () => {
  const E = require('../js/engine.js');
  const plain = E.createBattle('apple', 'intel');
  const leveled = E.createBattle('apple', 'intel', { left: { level: 100 } });
  assert.strictEqual(plain.a.maxHp, B.getBrand('apple').stats.pv, 'sans niveau : stats d’origine');
  assert.strictEqual(leveled.b.maxHp, B.getBrand('intel').stats.pv, 'l’adversaire reste inchangé');
  assert.ok(leveled.a.maxHp > plain.a.maxHp, 'les statistiques doivent progresser');
  assert.ok(leveled.a.maxHp <= Math.round(plain.a.maxHp * 1.2), 'la progression reste légère');
  assert.strictEqual(leveled.a.level, 100);
  assert.strictEqual(plain.a.level, 1);
});
