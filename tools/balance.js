/* Rapport d'équilibrage (outil de développement) :
   node test/balance.js [graines]  → matrice des taux de victoire en miroir. */
const E = require('../js/engine.js');

function rngFrom(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const seeds = parseInt(process.argv[2] || '6', 10);
const ids = E.BRANDS.map(function (b) { return b.id; });
const wins = {};
const rounds = {};
ids.forEach(function (id) { wins[id] = 0; rounds[id] = 0; });

const matrix = {};
ids.forEach(function (a) { matrix[a] = {}; });

for (let i = 0; i < ids.length; i++) {
  for (let j = 0; j < ids.length; j++) {
    if (i === j) continue;
    const a = ids[i], b = ids[j];
    let w = 0;
    let r = 0;
    for (let s = 1; s <= seeds; s++) {
      const battle = E.createBattle(a, b, { rng: rngFrom(s * 7919 + i * 131 + j * 17) });
      E.autoPlay(battle);
      r += battle.round;
      if (battle.winner === battle.a) w++;
    }
    matrix[a][b] = w / seeds;
    wins[a] += w;
    rounds[a] += r;
  }
}

console.log('\nTaux de victoire global (miroir gauche/droite, ' + seeds + ' graines) :');
ids.slice().sort(function (x, y) { return wins[y] - wins[x]; }).forEach(function (id) {
  const total = (ids.length - 1) * seeds;
  const pct = Math.round((wins[id] / total) * 100);
  const avg = (rounds[id] / total).toFixed(1);
  const bar = '█'.repeat(Math.round(pct / 4));
  console.log('  ' + id.padEnd(10) + String(pct).padStart(3) + '%  ' + avg.padStart(5) + ' r  ' + bar);
});

console.log('\nMatrice (ligne bat colonne, en %) :');
console.log('            ' + ids.map(function (i) { return i.slice(0, 4).padStart(5); }).join(''));
ids.forEach(function (a) {
  console.log('  ' + a.slice(0, 10).padEnd(10) + ids.map(function (b) {
    return a === b ? '    .' : String(Math.round(matrix[a][b] * 100)).padStart(5);
  }).join(''));
});
