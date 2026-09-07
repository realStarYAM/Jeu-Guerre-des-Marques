/* Test d'intégration de l'interface (jsdom) :
   charge index.html, joue un combat complet et vérifie l'affichage. */
const test = require('node:test');
const assert = require('node:assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/* Le jeu est servi en HTTP, comme dans le navigateur de l'utilisateur
   (localStorage n'existe pas sur une origine file://). */
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
let server = null;
let base = '';

test.before(async () => {
  server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
    fs.readFile(file, (err, data) => {
      if (err || !file.startsWith(ROOT)) { res.writeHead(404); res.end('introuvable'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port + '/';
});

test.after(() => { if (server) server.close(); });

async function openGame(beforeParse, url) {
  const virtualConsole = new VirtualConsole();      // on ignore les "Not implemented" de jsdom
  return JSDOM.fromURL((url || base) + 'index.html', {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse: beforeParse
  });
}

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(dom, predicate, timeoutMs, label) {
  const limit = Date.now() + (timeoutMs || 30000);
  while (Date.now() < limit) {
    if (predicate(dom.window.document)) return true;
    await tick(60);
  }
  throw new Error('attente expirée : ' + label);
}

function click(doc, selector) {
  const el = doc.querySelector(selector);
  assert.ok(el, 'élément introuvable : ' + selector);
  el.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  return el;
}

test('chaque marque possède un style de cinématique et des particules dédiés', () => {
  const brands = fs.readFileSync(path.join(ROOT, 'js/brands.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
  const ui = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');

  const fxKeys = Array.from(brands.matchAll(/fx: '([a-z]+)'/g)).map((m) => m[1]);
  assert.strictEqual(fxKeys.length, 11, 'chaque marque doit annoncer son style d’ultime');
  assert.strictEqual(new Set(fxKeys).size, 11, 'chaque marque doit avoir son propre style');

  fxKeys.forEach((k) => {
    assert.ok(css.includes('.cine[data-fx="' + k + '"]'), 'style CSS manquant pour l’ultime : ' + k);
    assert.ok(new RegExp(k + ':\\s*\\{\\s*particle:').test(ui), 'particules manquantes pour : ' + k);
  });

  const fxBlock = ui.slice(ui.indexOf('const ULT_FX'), ui.indexOf('/* Particules projetées'));
  const brandParticles = Array.from(fxBlock.slice(0, fxBlock.indexOf('/* Boss :')).matchAll(/particle: '([a-z]+)'/g)).map((m) => m[1]);
  assert.strictEqual(brandParticles.length, 11, 'onze marques → onze types de particules');
  assert.strictEqual(new Set(brandParticles).size, 11, 'chaque marque doit avoir ses propres particules');

  // Chaque boss possède sa propre signature visuelle
  const bossBlock = ui.slice(fxBlock.indexOf('/* Boss :'));
  const bossData = fs.readFileSync(path.join(ROOT, 'js/bosses.js'), 'utf8');
  Array.from(bossData.matchAll(/fx: '([a-z]+)'/g)).map((m) => m[1]).forEach((k) => {
    assert.ok(new RegExp(k + ':\\s*\\{\\s*particle:').test(bossBlock), 'particules de boss manquantes : ' + k);
    assert.ok(css.includes('.cine[data-fx="' + k + '"]'), 'style d’ultime de boss manquant : ' + k);
  });

  Array.from(fxBlock.matchAll(/particle: '([a-z]+)'/g)).map((m) => m[1]).forEach((p) => {
    assert.ok(css.includes('.up--' + p), 'classe CSS manquante : .up--' + p);
  });

  // Bannières de résultat
  ['critical', 'block', 'dodge'].forEach((v) => {
    assert.ok(css.includes('.announce__text--' + v), 'style de bannière manquant : ' + v);
  });
  assert.ok(/RESULT_BANNER[\s\S]*CRITICAL/.test(ui), 'bannière CRITICAL absente');
});

test('interface : un duel complet anime barres, historique et K.O.', { timeout: 90000 }, async () => {
  const dom = await openGame();
  const doc = dom.window.document;

  await waitFor(dom, () => doc.querySelectorAll('.bcard, .roster-chip').length > 0, 10000, 'chargement des scripts');

  // Accélérer les animations pour le test
  click(doc, '#btn-speed');
  click(doc, '#btn-speed');
  assert.strictEqual(doc.querySelector('#btn-speed').textContent, '⏩ ×3');

  // Le menu liste les 11 marques
  assert.strictEqual(doc.querySelectorAll('#menu-roster .roster-chip').length, 11, 'roster du menu incomplet');

  // Lancer un duel et choisir les deux marques
  click(doc, '[data-mode="duel"]');
  await waitFor(dom, () => doc.querySelector('#screen-select').classList.contains('is-active'), 5000, 'écran de sélection');
  const cards = doc.querySelectorAll('#brand-grid .bcard');
  assert.strictEqual(cards.length, 11, 'grille de sélection incomplète');

  cards[0].dispatchEvent(new dom.window.Event('click', { bubbles: true }));   // joueur
  await waitFor(dom, () => doc.querySelector('#select-title').textContent.includes('adversaire'), 5000, 'étape adversaire');
  const cards2 = doc.querySelectorAll('#brand-grid .bcard');
  assert.ok(cards2[0].disabled, 'la marque du joueur doit être désactivée au choix de l’adversaire');
  cards2[3].dispatchEvent(new dom.window.Event('click', { bubbles: true }));   // adversaire

  await waitFor(dom, () => doc.querySelector('#screen-arena').classList.contains('is-active'), 5000, 'écran arène');
  assert.notStrictEqual(doc.querySelector('#name-left').textContent, '—', 'nom du combattant gauche absent');
  assert.notStrictEqual(doc.querySelector('#name-right').textContent, '—', 'nom du combattant droit absent');
  assert.strictEqual(doc.querySelector('#hp-now-left').textContent, doc.querySelector('#hp-max-left').textContent, 'PV initiaux != PV max');

  // Laisser l'IA jouer les deux camps
  click(doc, '#btn-auto');
  assert.match(doc.querySelector('#btn-auto').textContent, /on/);

  // Des attaques apparaissent dans l'historique et les PV descendent
  await waitFor(dom, () => doc.querySelectorAll('#history-list .hrow').length >= 3, 40000, 'historique des attaques');
  const rows = doc.querySelectorAll('#history-list .hrow');
  assert.match(rows[0].querySelector('.hrow__main').textContent, /→/, 'ligne d’historique malformée');

  // Fin de combat : K.O. puis panneau de résultat
  await waitFor(dom, () => doc.querySelector('#result-overlay').classList.contains('is-open'), 90000, 'panneau de résultat');
  assert.ok(doc.querySelector('.fighter.is-ko'), 'aucun combattant marqué K.O.');
  assert.ok(doc.querySelector('.fighter.is-winner'), 'aucun combattant marqué vainqueur');
  assert.match(doc.querySelector('#ticker').textContent, /K\.O\./, 'bandeau K.O. absent');
  assert.ok(parseInt(doc.querySelector('#hp-now-left').textContent, 10) === 0 ||
            parseInt(doc.querySelector('#hp-now-right').textContent, 10) === 0, 'les PV du perdant doivent être à 0');

  // Barre de vie réellement réduite côté perdant
  const koSide = doc.querySelector('.fighter.is-ko').dataset.side;
  assert.strictEqual(doc.querySelector('#hp-fill-' + koSide).style.width, '0%', 'barre de vie non vidée');

  // Statistiques persistées
  const meta = JSON.parse(dom.window.localStorage.getItem('guerreDesMarques.meta.v1'));
  assert.strictEqual(meta.duels.length, 1, 'combat non enregistré dans le palmarès');
  assert.ok(meta.wins + meta.losses === 1, 'bilan victoires/défaites incohérent');

  dom.window.close();
});

test('interface : les boutons du joueur déclenchent ses attaques', { timeout: 150000 }, async () => {
  const dom = await openGame();
  const doc = dom.window.document;
  await waitFor(dom, () => doc.querySelectorAll('.roster-chip').length > 0, 10000, 'chargement');

  click(doc, '#btn-speed');
  click(doc, '#btn-speed');
  click(doc, '[data-mode="duel"]');
  await waitFor(dom, () => doc.querySelector('#screen-select').classList.contains('is-active'), 5000, 'sélection');
  // Google (vitesse 100) à gauche pour agir en premier, Intel à droite
  const pick = (id) => {
    const card = Array.from(doc.querySelectorAll('#brand-grid .bcard')).find((c) => c.dataset.brand === id);
    assert.ok(card, 'carte manquante : ' + id);
    card.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  };
  pick('google');
  await waitFor(dom, () => doc.querySelector('#select-title').textContent.includes('adversaire'), 5000, 'étape 2');
  pick('intel');
  await waitFor(dom, () => doc.querySelector('#screen-arena').classList.contains('is-active'), 5000, 'arène');

  // Attendre la fin de l'intro puis la main au joueur
  await waitFor(dom, () => !doc.querySelector('#btn-attack').disabled, 30000, 'bouton attaque actif');

  click(doc, '#btn-attack');
  await waitFor(dom, () => doc.querySelectorAll('#history-list .hrow').length >= 1, 20000, 'attaque du joueur');
  const first = doc.querySelector('#history-list .hrow:last-child');
  assert.match(first.querySelector('.hrow__main').textContent, /Google/, 'la première action doit être celle du joueur');
  assert.ok(parseInt(doc.querySelector('#hp-now-right').textContent, 10) < 452, 'les PV de l’adversaire doivent baisser');

  // Défense
  await waitFor(dom, () => !doc.querySelector('#btn-defend').disabled, 40000, 'bouton défense actif');
  click(doc, '#btn-defend');
  await waitFor(dom, () => /Garde/.test(doc.querySelector('#chips-left').textContent), 20000, 'puce de garde');

  // Le pouvoir spécial est désactivé tant que l'énergie est insuffisante
  const special = doc.querySelector('#btn-special');
  assert.strictEqual(special.disabled, true, 'le spécial ne devrait pas être disponible à 0 d’énergie');
  assert.match(doc.querySelector('#special-name').textContent, /Algorithme/, 'nom du pouvoir spécial absent');

  // Passer en mode auto pour finir le combat, puis fermer une fenêtre au repos
  click(doc, '#btn-auto');
  await waitFor(dom, () => doc.querySelector('#result-overlay').classList.contains('is-open'), 100000, 'fin du combat');
  await tick(200);
  dom.window.close();
});

test('interface : raccourcis clavier et réglages (vitesse, son, palmarès)', { timeout: 120000 }, async () => {
  const dom = await openGame();
  const doc = dom.window.document;
  const win = dom.window;
  await waitFor(dom, () => doc.querySelectorAll('.roster-chip').length > 0, 10000, 'chargement');

  // Vitesse d'animation
  click(doc, '#btn-speed');
  assert.strictEqual(doc.querySelector('#btn-speed').textContent, '⏩ ×2');
  assert.strictEqual(doc.documentElement.style.getPropertyValue('--speed'), '2');

  // Son
  click(doc, '#btn-sound');
  assert.match(doc.querySelector('#btn-sound').textContent, /Muet/);

  // Palmarès
  click(doc, '[data-goto="stats"]');
  await waitFor(dom, () => doc.querySelector('#screen-stats').classList.contains('is-active'), 5000, 'écran palmarès');
  assert.strictEqual(doc.querySelectorAll('#stat-grid .stat-card').length, 8, 'cartes de statistiques manquantes');
  assert.match(doc.querySelector('#stat-grid').textContent, /Ultimes lancés/, 'compteur d’ultimes absent du palmarès');
  assert.match(doc.querySelector('#duel-list').textContent, /Aucun combat/, 'message d’attente absent');

  // Règles
  click(doc, '[data-goto="rules"]');
  await waitFor(dom, () => doc.querySelector('#screen-rules').classList.contains('is-active'), 5000, 'écran règles');
  assert.ok(doc.querySelectorAll('.rule').length >= 5, 'sections de règles manquantes');

  // Raccourci clavier hors combat : ne doit pas provoquer d'erreur
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'a', bubbles: true }));
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ', bubbles: true }));

  // Mode « combat auto » : deux marques tirées au sort, l'IA joue les deux camps
  click(doc, '[data-mode="auto"]');
  await waitFor(dom, () => doc.querySelector('#screen-arena').classList.contains('is-active'), 10000, 'arène auto');
  assert.match(doc.querySelector('#btn-auto').textContent, /on/, 'le mode auto doit être actif');
  assert.match(doc.querySelector('#hud-mode').textContent, /Combat auto/);
  const leftName = doc.querySelector('#name-left').textContent;
  const rightName = doc.querySelector('#name-right').textContent;
  assert.notStrictEqual(leftName, '—', 'combattant gauche absent en mode auto');
  assert.notStrictEqual(rightName, '—', 'combattant droit absent en mode auto');
  assert.notStrictEqual(leftName, rightName, 'les deux marques doivent être différentes');
  await waitFor(dom, () => doc.querySelectorAll('#history-list .hrow').length >= 2, 60000, 'attaques en mode auto');

  dom.window.close();
});

test('interface : la jauge ultime se charge, lance la cinématique puis passe en recharge', { timeout: 180000 }, async () => {
  const dom = await openGame();
  const doc = dom.window.document;
  await waitFor(dom, () => doc.querySelectorAll('.roster-chip').length > 0, 10000, 'chargement');

  // Vitesse maximale pour raccourcir les animations
  click(doc, '#btn-speed');
  click(doc, '#btn-speed');

  click(doc, '[data-mode="duel"]');
  await waitFor(dom, () => doc.querySelector('#screen-select').classList.contains('is-active'), 5000, 'sélection');
  const pick = (id) => {
    const card = Array.from(doc.querySelectorAll('#brand-grid .bcard')).find((c) => c.dataset.brand === id);
    assert.ok(card, 'carte manquante : ' + id);
    card.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  };
  // Apple agit en premier et son ultime met un critique garanti :
  // Microsoft, peu offensif, laisse le temps de charger la jauge.
  pick('apple');
  await waitFor(dom, () => doc.querySelector('#select-title').textContent.includes('adversaire'), 5000, 'étape 2');
  pick('microsoft');
  await waitFor(dom, () => doc.querySelector('#screen-arena').classList.contains('is-active'), 5000, 'arène');

  // Jauge d'ultime présente et vide au départ
  assert.strictEqual(doc.querySelector('#ult-txt-left').textContent, '0 %');
  const btnUlt = doc.querySelector('#btn-ultimate');
  assert.strictEqual(btnUlt.disabled, true, 'l’ultime ne doit pas être disponible à 0 %');
  assert.match(btnUlt.textContent, /Reality Distortion/, 'le nom de l’ultime doit être affiché');

  // Attaquer jusqu'à ce que la jauge affiche 100 % (≈ 4 rounds)
  let guard = 20;
  while (guard-- > 0) {
    await waitFor(dom, () => !doc.querySelector('#btn-attack').disabled ||
      doc.querySelector('#result-overlay').classList.contains('is-open'), 60000, 'tour du joueur');
    if (doc.querySelector('#result-overlay').classList.contains('is-open')) break;
    if (!btnUlt.disabled) break;             // jauge pleine et main au joueur
    click(doc, '#btn-attack');
    await tick(300);
  }
  assert.strictEqual(btnUlt.disabled, false, 'l’ultime devrait être disponible à 100 %');
  assert.strictEqual(doc.querySelector('#ult-txt-left').textContent, '100 %', 'jauge non remplie');
  assert.ok(doc.querySelector('#ult-box-left').classList.contains('is-ready'), 'jauge non marquée prête');
  assert.match(doc.querySelector('#chips-left').textContent, /Ultime prêt/, 'puce « Ultime prêt » absente');

  // Déclenchement → cinématique plein écran
  doc.querySelector('#announce').innerHTML = '';       // purge d'une éventuelle bannière précédente
  click(doc, '#btn-ultimate');
  await waitFor(dom, () => doc.querySelector('#cine').classList.contains('is-open'), 20000, 'cinématique d’ultime');
  const cine = doc.querySelector('#cine');
  assert.strictEqual(doc.querySelector('#cine-brand').textContent, 'Apple');
  assert.strictEqual(doc.querySelector('#cine-ult').textContent, 'Reality Distortion');
  assert.match(doc.querySelector('#cine-phrase').textContent, /\S/, 'phrase de l’ultime absente');
  assert.strictEqual(cine.dataset.fx, 'distort', 'style propre à la marque absent');
  assert.strictEqual(doc.querySelector('#cine-kicker').textContent, 'ULTIMATE !', 'bandeau ULTIMATE absent');
  assert.ok(doc.querySelector('#cine-mono').textContent.length > 0, 'portrait de la marque absent');
  assert.ok(doc.querySelector('#cine-portrait, .cine__portrait'), 'zoom sur la marque absent');
  assert.ok(doc.body.classList.contains('is-quake-hard'), 'l’écran doit trembler pendant l’ultime');
  assert.ok(doc.body.classList.contains('is-ult-focus'), 'l’arène doit être assombrie pendant l’ultime');
  assert.ok(doc.querySelectorAll('#cine-fx .up').length > 0, 'particules de l’ultime absentes');
  assert.ok(doc.querySelector('#cine-fx .up--shard'), 'particules propres à Apple absentes');
  assert.ok(!cine.classList.contains('is-short'), 'les animations longues doivent être actives par défaut');

  // Fin de la cinématique → jauge à 0 et recharge armée
  await waitFor(dom, () => !doc.querySelector('#cine').classList.contains('is-open'), 20000, 'fin de la cinématique');
  await waitFor(dom, () => /Recharge ultime/.test(doc.querySelector('#chips-left').textContent), 20000, 'puce de recharge');
  const bar = doc.querySelector('#ult-fill-left').parentElement;
  assert.ok(bar.classList.contains('is-locked'), 'la jauge doit être verrouillée pendant la recharge');
  assert.match(doc.querySelector('#ult-txt-left').textContent, /tour/, 'compteur de recharge absent');
  assert.strictEqual(doc.querySelector('#ult-fill-left').style.width, '0%', 'jauge non vidée');

  // Bannière de résultat, affichée après les dégâts
  await waitFor(dom, () => doc.querySelector('#announce .announce__text--banner'), 30000, 'bannière de résultat');
  const banner = doc.querySelector('#announce .announce__text--banner');
  assert.match(banner.textContent, /CRITICAL|K\.O\.|BLOCK|DODGE/, 'bannière de résultat inattendue');
  const damageShown = parseInt(doc.querySelector('#hp-now-right').textContent, 10);
  assert.ok(damageShown < 445, 'les dégâts doivent être appliqués après l’animation');

  // Ligne d'ultime dans l'historique détaillé (celle du joueur, à gauche)
  await waitFor(dom, () => doc.querySelector('#history-list .hrow--ult.hrow--left'), 30000, 'ligne d’ultime');
  const ultRow = doc.querySelector('#history-list .hrow--ult.hrow--left');
  assert.ok(ultRow, 'aucune ligne d’ultime du joueur dans l’historique');
  assert.match(ultRow.textContent, /Reality Distortion/);
  assert.match(ultRow.querySelector('.tag--ult').textContent, /ULTIME/);
  assert.match(doc.querySelector('#history-recap').textContent, /ultime/, 'récapitulatif absent');

  // Déplier le détail de la ligne
  ultRow.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  assert.ok(ultRow.classList.contains('is-open'), 'le détail ne se déplie pas');
  const detail = ultRow.querySelector('.hrow__detail').textContent;
  assert.match(detail, /Round/, 'le détail doit préciser le round');
  assert.match(detail, /Jauge ultime/, 'le détail doit préciser la jauge d’ultime');

  // Filtre « Ultimes » de l'historique
  const chipUlt = Array.from(doc.querySelectorAll('#history-filters .filter-chip')).find((c) => c.dataset.filter === 'ult');
  chipUlt.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  assert.match(doc.querySelector('#history-list').className, /is-filter-ult/, 'filtre non appliqué');
  assert.ok(chipUlt.classList.contains('is-on'), 'puce de filtre non activée');

  await tick(200);
  dom.window.close();
});

test('interface : le bouton 🎬 Ciné raccourcit la cinématique d’ultime', { timeout: 180000 }, async () => {
  const dom = await openGame();
  const doc = dom.window.document;
  await waitFor(dom, () => doc.querySelectorAll('.roster-chip').length > 0, 10000, 'chargement');

  click(doc, '#btn-speed');
  click(doc, '#btn-speed');

  // Cinématiques longues activées par défaut, puis coupées
  const btnCine = doc.querySelector('#btn-cine');
  assert.match(btnCine.textContent, /Ciné : on/, 'les cinématiques doivent être actives par défaut');
  click(doc, '#btn-cine');
  assert.match(btnCine.textContent, /Ciné : off/, 'le bouton doit indiquer l’état « off »');
  assert.ok(btnCine.classList.contains('is-off'), 'classe is-off absente');

  click(doc, '[data-mode="duel"]');
  await waitFor(dom, () => doc.querySelector('#screen-select').classList.contains('is-active'), 5000, 'sélection');
  const pick = (id) => {
    const card = Array.from(doc.querySelectorAll('#brand-grid .bcard')).find((c) => c.dataset.brand === id);
    assert.ok(card, 'carte manquante : ' + id);
    card.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  };
  pick('apple');
  await waitFor(dom, () => doc.querySelector('#select-title').textContent.includes('adversaire'), 5000, 'étape 2');
  pick('microsoft');
  await waitFor(dom, () => doc.querySelector('#screen-arena').classList.contains('is-active'), 5000, 'arène');

  // La préférence est conservée pour les écrans suivants
  assert.match(doc.querySelector('#btn-cine').textContent, /Ciné : off/, 'préférence non conservée');

  const btnUlt = doc.querySelector('#btn-ultimate');
  let guard = 20;
  while (guard-- > 0) {
    await waitFor(dom, () => !doc.querySelector('#btn-attack').disabled ||
      doc.querySelector('#result-overlay').classList.contains('is-open'), 60000, 'tour du joueur');
    if (doc.querySelector('#result-overlay').classList.contains('is-open')) break;
    if (!btnUlt.disabled) break;
    click(doc, '#btn-attack');
    await tick(300);
  }
  assert.strictEqual(btnUlt.disabled, false, 'l’ultime devrait être disponible à 100 %');

  doc.querySelector('#announce').innerHTML = '';
  click(doc, '#btn-ultimate');
  await waitFor(dom, () => doc.querySelector('#cine').classList.contains('is-open'), 20000, 'cinématique courte');

  const cine = doc.querySelector('#cine');
  assert.ok(cine.classList.contains('is-short'), 'la cinématique doit être en mode court');
  assert.strictEqual(doc.querySelectorAll('#cine-fx .up').length, 0, 'aucune particule en mode court');
  assert.strictEqual(doc.querySelector('#cine-kicker').textContent, 'ULTIMATE !', 'bandeau ULTIMATE absent');
  assert.strictEqual(doc.querySelector('#cine-ult').textContent, 'Reality Distortion');

  // Le mode court referme la cinématique bien plus vite que le mode long
  const started = Date.now();
  await waitFor(dom, () => !doc.querySelector('#cine').classList.contains('is-open'), 20000, 'fin de la cinématique courte');
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 1200, 'cinématique courte trop longue : ' + elapsed + ' ms');
  assert.ok(!doc.body.classList.contains('is-ult-focus'), 'l’arène ne doit plus être assombrie');

  // Les dégâts et la bannière arrivent malgré tout
  await waitFor(dom, () => doc.querySelector('#announce .announce__text--banner'), 30000, 'bannière en mode court');
  assert.match(doc.querySelector('#announce .announce__text--banner').textContent, /CRITICAL|K\.O\.|BLOCK|DODGE/);
  await waitFor(dom, () => doc.querySelector('#history-list .hrow--ult.hrow--left'), 30000, 'ligne d’ultime');
  assert.ok(parseInt(doc.querySelector('#hp-now-right').textContent, 10) < 445, 'dégâts non appliqués');

  await tick(200);
  dom.window.close();
});

test('interface : le tournoi enchaîne les combats et affiche le parcours', { timeout: 180000 }, async () => {
  const dom = await openGame();
  const doc = dom.window.document;
  await waitFor(dom, () => doc.querySelectorAll('.roster-chip').length > 0, 10000, 'chargement');

  click(doc, '#btn-speed');
  click(doc, '#btn-speed');
  click(doc, '[data-mode="tournament"]');
  await waitFor(dom, () => doc.querySelector('#screen-select').classList.contains('is-active'), 5000, 'sélection');
  assert.match(doc.querySelector('#select-sub').textContent, /10 autres marques/, 'consigne de tournoi absente');
  assert.ok(doc.querySelector('#btn-random-foe').hidden, 'le bouton adversaire aléatoire ne sert pas en tournoi');

  const card = Array.from(doc.querySelectorAll('#brand-grid .bcard')).find((c) => c.dataset.brand === 'nvidia');
  card.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

  await waitFor(dom, () => doc.querySelector('#screen-arena').classList.contains('is-active'), 5000, 'arène');
  assert.strictEqual(doc.querySelector('#bracket').hidden, false, 'parcours masqué en tournoi');
  assert.strictEqual(doc.querySelectorAll('#bracket-list .bstep').length, 10, 'le parcours doit lister 10 adversaires');
  assert.strictEqual(doc.querySelectorAll('#bracket-list .bstep--current').length, 1, 'un seul combat en cours');
  assert.match(doc.querySelector('#hud-mode').textContent, /combat 1\/10/, 'compteur de tournoi absent');

  // Laisser l'IA terminer le premier combat
  click(doc, '#btn-auto');
  await waitFor(dom, () => doc.querySelector('#result-overlay').classList.contains('is-open'), 120000, 'fin du combat 1');

  const next = Array.from(doc.querySelectorAll('#result-actions .btn')).find((b) => /Combat suivant|palmarès|Retenter/i.test(b.textContent));
  assert.ok(next, 'aucune action proposée après le combat');
  const won = /Combat suivant|palmarès/.test(next.textContent);
  next.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

  if (won) {
    await waitFor(dom, () => /combat 2\/10/.test(doc.querySelector('#hud-mode').textContent), 25000, 'combat 2');
    assert.strictEqual(doc.querySelectorAll('#bracket-list .bstep--done').length, 1, 'premier combat non validé dans le parcours');
  } else {
    // Défaite : le bouton « Retenter » relance le même combat
    await waitFor(dom, () => /combat 1\/10/.test(doc.querySelector('#hud-mode').textContent) &&
      !doc.querySelector('#result-overlay').classList.contains('is-open'), 25000, 'nouvelle tentative');
    assert.strictEqual(doc.querySelectorAll('#bracket-list .bstep--done').length, 0, 'le parcours ne doit pas avancer après une défaite');
  }
  assert.notStrictEqual(doc.querySelector('#hp-now-left').textContent, '0', 'les PV doivent être restaurés au combat suivant');

  dom.window.close();
});

/* ============================================================
   PROGRESSION — écran de récompenses et page Profil
   ============================================================ */

const BRAND_IDS = ['apple', 'samsung', 'xiaomi', 'huawei', 'google', 'microsoft', 'sony', 'nintendo', 'amd', 'nvidia', 'intel'];
const META_KEY = 'guerreDesMarques.meta.v1';

/* Sauvegarde de progression prête à l'emploi (avant exécution des scripts) */
function seedProgress(window, brand) {
  const brands = {};
  BRAND_IDS.forEach(function (id) {
    brands[id] = { xp: 0, wins: 0, losses: 0, uses: 0, ultimates: 0, bestDamage: 0, skin: 'base' };
  });
  brands[brand] = { xp: 3000, wins: 12, losses: 3, uses: 20, ultimates: 9, bestDamage: 180, skin: 'base' };
  window.localStorage.setItem(META_KEY, JSON.stringify({
    battles: 40, wins: 25, losses: 15, crits: 30, specials: 12, ultimates: 20,
    bestDamage: 210, streak: 3, bestStreak: 7, duels: [], playerXp: 3000,
    bestKo: { damage: 260, brand: brand, foe: 'intel', at: Date.now() },
    tournamentWin: true, brands: brands
  }));
}

test('progression : la page Profil affiche rang, niveau, trophées et écurie', { timeout: 60000 }, async () => {
  const dom = await openGame(function (w) { seedProgress(w, 'apple'); });
  const doc = dom.window.document;
  await waitFor(dom, () => doc.querySelectorAll('.roster-chip').length > 0, 10000, 'chargement');

  // Bandeau de progression de l'accueil
  assert.strictEqual(doc.querySelector('#menu-rank-name').textContent, 'Maître', 'bandeau de progression absent');
  assert.strictEqual(doc.querySelector('#menu-rank-icon').textContent, '🔮', 'icône de rang absente du bandeau');
  assert.match(doc.querySelector('#menu-level').textContent, /Nv 43/, 'niveau absent du bandeau');
  assert.match(doc.querySelector('#menu-progress-hint').textContent, /40 combats/, 'résumé du bandeau absent');

  click(doc, '#goto-profil');
  await waitFor(dom, () => doc.querySelector('#screen-profil').classList.contains('is-active'), 5000, 'écran profil');

  // Rang : 3000 PX → niveau 43 → Maître
  assert.strictEqual(doc.querySelector('#rank-name').textContent, 'Maître', 'rang incorrect');
  assert.strictEqual(doc.querySelector('#rank-icon').textContent, '🔮');
  assert.match(doc.querySelector('#rank-next').textContent, /Grand Maître/, 'prochain rang absent');
  assert.match(doc.querySelector('#rank-fill').style.width, /%$/, 'barre de rang non remplie');

  // Niveau global
  assert.strictEqual(doc.querySelector('#level-badge').textContent, 'Nv 43', 'niveau global incorrect');
  assert.match(doc.querySelector('#level-xp-txt').textContent, /PX/, 'compteur de PX absent');
  assert.match(doc.querySelector('#level-hint').textContent, /avant le niveau 44/, 'reste avant niveau supérieur absent');

  // Statistiques du joueur
  const stats = Array.from(doc.querySelectorAll('#profil-stats .stat-card')).map((c) => c.textContent);
  assert.strictEqual(stats.length, 9, 'cartes de statistiques du profil manquantes');
  assert.ok(stats.some((t) => /Combats/.test(t) && /40/.test(t)), 'nombre de combats absent');
  assert.ok(stats.some((t) => /Taux de victoire/.test(t) && /63 %/.test(t)), 'taux de victoire absent');
  assert.ok(stats.some((t) => /Marque favorite/.test(t) && /Apple/.test(t)), 'marque favorite absente');
  assert.ok(stats.some((t) => /Meilleur K\.O\./.test(t) && /260/.test(t)), 'meilleur K.O. absent');
  assert.ok(stats.some((t) => /Ultimes lancés/.test(t) && /20/.test(t)), 'ultimes lancés absents');
  assert.ok(stats.some((t) => /Série en cours/.test(t) && /record 7/.test(t)), 'série de victoires absente');

  // Trophées : 6 débloqués sur 20 (12 généraux + 8 du Boss Rush) avec cette sauvegarde
  assert.strictEqual(doc.querySelectorAll('#trophy-grid .trophy').length, 20, 'grille de trophées incomplète');
  assert.strictEqual(doc.querySelectorAll('#trophy-grid .trophy.is-earned').length, 6, 'trophées débloqués incorrects');
  assert.strictEqual(doc.querySelector('#trophy-count').textContent, '6 / 20', 'compteur de trophées incorrect');

  // Écurie : 11 marques, raretés, skins et badges de maîtrise
  assert.strictEqual(doc.querySelectorAll('#roster-list .rcard').length, 11, 'écurie incomplète');
  assert.strictEqual(doc.querySelectorAll('#roster-list .rarity').length, 11, 'raretés manquantes');
  assert.strictEqual(doc.querySelectorAll('#roster-list .mbadge').length, 99, 'badges de maîtrise manquants');
  const appleCard = doc.querySelector('#roster-list .rcard');
  assert.match(appleCard.textContent, /Apple/, 'première carte de l’écurie incorrecte');
  assert.match(appleCard.querySelector('.rcard__meta .lvl').textContent, /Nv 43/, 'niveau de la marque absent');
  assert.match(appleCard.querySelector('.rcard__xp').textContent, /12V \/ 3D/, 'bilan de la marque absent');
  assert.ok(appleCard.querySelectorAll('.mbadge.is-earned').length >= 3, 'badges gagnés avec Apple manquants');

  // Skins : 4 débloqués au niveau 43 (Standard, Néon, Chrome, Prisme), 3 verrouillés
  const chips = appleCard.querySelectorAll('.skin-chip');
  assert.strictEqual(chips.length, 7, 'liste de skins incomplète');
  assert.strictEqual(appleCard.querySelectorAll('.skin-chip.is-unlocked').length, 4, 'skins débloqués incorrects');
  assert.strictEqual(appleCard.querySelectorAll('.skin-chip.is-equipped').length, 1, 'skin équipé non marqué');

  dom.window.close();
});

test('progression : équiper un skin depuis le profil met à jour la sauvegarde', { timeout: 60000 }, async () => {
  const dom = await openGame(function (w) { seedProgress(w, 'apple'); });
  const doc = dom.window.document;
  await waitFor(dom, () => doc.querySelectorAll('.roster-chip').length > 0, 10000, 'chargement');

  click(doc, '#goto-profil');
  await waitFor(dom, () => doc.querySelectorAll('#roster-list .skin-chip').length > 0, 5000, 'écurie');

  const chip = Array.from(doc.querySelectorAll('#roster-list .skin-chip'))
    .find((c) => c.dataset.brand === 'apple' && c.dataset.skin === 'chrome');
  assert.ok(chip, 'skin Chrome introuvable');
  assert.ok(chip.classList.contains('is-unlocked'), 'skin Chrome devrait être débloqué');
  chip.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

  await waitFor(dom, () => {
    const raw = dom.window.localStorage.getItem(META_KEY);
    return raw && JSON.parse(raw).brands.apple.skin === 'chrome';
  }, 5000, 'sauvegarde du skin');

  const equipped = doc.querySelector('#roster-list .skin-chip.is-equipped[data-brand="apple"]');
  assert.strictEqual(equipped.dataset.skin, 'chrome', 'skin équipé non mis en évidence');

  // Un skin verrouillé ne peut pas être équipé
  const locked = Array.from(doc.querySelectorAll('#roster-list .skin-chip'))
    .find((c) => c.dataset.brand === 'apple' && c.dataset.skin === 'myth');
  assert.ok(locked && !locked.classList.contains('is-unlocked'), 'skin Mythique devrait être verrouillé');
  locked.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await tick(120);
  assert.strictEqual(JSON.parse(dom.window.localStorage.getItem(META_KEY)).brands.apple.skin, 'chrome',
    'un skin verrouillé ne doit pas être équipé');

  dom.window.close();
});

test('progression : réinitialiser la progression remet niveaux et trophées à zéro', { timeout: 60000 }, async () => {
  const dom = await openGame(function (w) { seedProgress(w, 'apple'); });
  const doc = dom.window.document;
  await waitFor(dom, () => doc.querySelectorAll('.roster-chip').length > 0, 10000, 'chargement');

  click(doc, '#goto-profil');
  await waitFor(dom, () => doc.querySelectorAll('#roster-list .rcard').length > 0, 5000, 'écurie');
  dom.window.confirm = () => true;

  click(doc, '#btn-reset-progress');
  await waitFor(dom, () => doc.querySelector('#level-badge').textContent === 'Nv 1', 5000, 'niveau réinitialisé');

  assert.strictEqual(doc.querySelector('#rank-name').textContent, 'Bronze', 'rang non réinitialisé');
  assert.strictEqual(doc.querySelector('#trophy-count').textContent, '0 / 20', 'trophées non réinitialisés');
  const saved = JSON.parse(dom.window.localStorage.getItem(META_KEY));
  assert.strictEqual(saved.playerXp, 0, 'PX non réinitialisés');
  assert.strictEqual(saved.brands.apple.xp, 0, 'PX de la marque non réinitialisés');

  dom.window.close();
});

test('interface : un combat ouvre l’écran de récompenses puis crédite l’XP', { timeout: 180000 }, async () => {
  const dom = await openGame();
  const doc = dom.window.document;
  await waitFor(dom, () => doc.querySelectorAll('.roster-chip').length > 0, 10000, 'chargement');

  click(doc, '#btn-speed');
  click(doc, '#btn-speed');                       // ×3 : les tests vont plus vite
  click(doc, '[data-mode="auto"]');
  await waitFor(dom, () => doc.querySelector('#screen-arena').classList.contains('is-active'), 10000, 'arène');

  // Niveau et rareté affichés sur les cartes de l'arène
  ['left', 'right'].forEach(function (side) {
    assert.match(doc.querySelector('#lvl-' + side).textContent, /Nv 1/, 'niveau absent sur la carte ' + side);
    assert.match(doc.querySelector('#lvl-' + side).textContent, /(Commun|Rare|Épique|Légendaire|Mythique)/,
      'rareté absente sur la carte ' + side);
  });

  await waitFor(dom, () => doc.querySelector('#result-overlay').classList.contains('is-open'), 120000, 'fin du combat');
  await waitFor(dom, () => doc.querySelector('#rewards-overlay').classList.contains('is-open'), 20000, 'écran de récompenses');

  // XP gagnée, détail des gains et barres animées
  assert.ok(parseInt(doc.querySelector('#rewards-xp').textContent, 10) > 0, 'aucune XP attribuée');
  assert.ok(doc.querySelectorAll('#rewards-parts li').length >= 2, 'détail des gains absent');
  assert.strictEqual(doc.querySelectorAll('#rewards-bars .xprow').length, 3,
    'l’écran doit afficher la barre du joueur et celle des deux marques');
  assert.match(doc.querySelector('#rewards-rank').textContent, /Bronze|Argent|Or/, 'rang absent de l’écran de récompenses');

  // Sauvegarde
  const saved = JSON.parse(dom.window.localStorage.getItem(META_KEY));
  assert.ok(saved.playerXp > 0, 'PX du joueur non sauvegardés');
  assert.strictEqual(typeof saved.battles, 'number', 'compteur de combats absent');
  const fought = Object.keys(saved.brands).filter((id) => saved.brands[id].xp > 0);
  assert.strictEqual(fought.length, 2, 'les deux marques du combat doivent gagner de l’XP');

  // Fermeture de l'écran
  click(doc, '#btn-rewards-continue');
  await waitFor(dom, () => !doc.querySelector('#rewards-overlay').classList.contains('is-open'), 5000, 'fermeture des récompenses');

  // Le profil reflète le combat joué
  click(doc, '[data-goto="menu"]');
  click(doc, '#goto-profil');
  await waitFor(dom, () => doc.querySelector('#screen-profil').classList.contains('is-active'), 5000, 'profil');
  const lvl = parseInt(doc.querySelector('#level-badge').textContent.replace('Nv ', ''), 10);
  assert.ok(lvl >= 2, 'le premier combat doit faire monter le joueur au moins au niveau 2 (lu : ' + lvl + ')');
  assert.match(doc.querySelector('#profil-stats').textContent, /Combats/, 'statistiques du profil vides');

  dom.window.close();
});

/* ============================================================
   BOSS RUSH — écran, lancement, combat de boss et récompenses
   ============================================================ */

/* Sauvegarde prête à l'emploi pour les tests du Boss Rush */
function bossSeed(over) {
  return Object.assign({
    battles: 40, wins: 25, losses: 15, crits: 40, specials: 10, ultimates: 30,
    bestDamage: 260, streak: 3, bestStreak: 7, duels: [], playerXp: 999999,
    bestKo: { damage: 260, brand: 'apple', foe: 'intel', at: Date.now() },
    tournamentWin: true, brands: {}
  }, over || {});
}

test('boss rush : l’écran affiche les difficultés, les boss et les trophées', { timeout: 60000 }, async () => {
  const dom = await openGame(function (w) { w.localStorage.setItem(META_KEY, JSON.stringify(bossSeed())); });
  const doc = dom.window.document;
  await waitFor(dom, () => doc.querySelectorAll('.roster-chip').length > 0, 10000, 'chargement');

  click(doc, '#btn-boss');
  await waitFor(dom, () => doc.querySelector('#screen-bossrush').classList.contains('is-active'), 5000, 'écran Boss Rush');

  // Bouton bien présent à côté des autres modes
  assert.ok(doc.querySelector('.hero__actions #btn-boss'), 'bouton Boss absent du menu');
  assert.strictEqual(doc.querySelectorAll('.hero__actions .btn').length, 4, 'quatre modes attendus au menu');

  // Quatre difficultés
  assert.strictEqual(doc.querySelectorAll('#diff-picker .diff').length, 4, 'quatre difficultés attendues');
  assert.ok(doc.querySelector('.diff.is-on'), 'une difficulté doit être sélectionnée');

  // Cinq boss + le boss secret verrouillé
  assert.strictEqual(doc.querySelectorAll('#boss-grid .bcard-boss').length, 6, 'six cartes de boss attendues');
  assert.strictEqual(doc.querySelectorAll('#boss-grid .bcard-boss.is-locked').length, 1, 'le boss secret doit être verrouillé');
  assert.match(doc.querySelector('#bossrush-count').textContent, /0 \/ 5/, 'compteur de boss incorrect');
  assert.match(doc.querySelector('#boss-grid').textContent, /MEGA TECH/, 'MEGA TECH absent');
  assert.match(doc.querySelector('#boss-grid').textContent, /THE FINAL BRAND/, 'le boss final est absent');

  // Changer de difficulté
  doc.querySelector('.diff[data-diff="impossible"]').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await waitFor(dom, () => doc.querySelector('.diff.is-on').dataset.diff === 'impossible', 3000, 'difficulté sélectionnée');
  assert.match(doc.querySelector('.diff.is-on').textContent, /Impossible/);

  // Trophées exclusifs
  assert.strictEqual(doc.querySelectorAll('#boss-trophy-grid .trophy').length, 8, 'huit trophées exclusifs attendus');
  assert.strictEqual(doc.querySelector('#boss-trophy-count').textContent, '0 / 8', 'compteur de trophées incorrect');

  // Statistiques : boss vaincus, meilleur temps, dégâts, marque, difficulté
  const stats = doc.querySelector('#bossrush-stats').textContent;
  ['Boss vaincus', 'Meilleur temps', 'Dégâts infligés', 'Marque du record', 'Boss Rush lancés', 'Boss Rush terminés']
    .forEach((label) => assert.match(stats, new RegExp(label), 'statistique absente : ' + label));

  dom.window.close();
});

test('boss rush : le boss secret se déverrouille après les cinq autres', { timeout: 60000 }, async () => {
  const dom = await openGame(function (w) {
    w.localStorage.setItem(META_KEY, JSON.stringify(bossSeed({
      boss: {
        cleared: { megatech: true, overclock: true, quantum: true, corrupted: true, finalbrand: true },
        skins: ['circuit'], titles: ['title-megatech'], trophies: ['bossFirst'],
        wins: 1, runs: 2, bestTime: 210000, bestDamage: 12000, bestBrand: 'apple', bestDifficulty: 'difficile'
      }
    })));
  });
  const doc = dom.window.document;
  await waitFor(dom, () => doc.querySelectorAll('.roster-chip').length > 0, 10000, 'chargement');

  click(doc, '#goto-bossrush');
  await waitFor(dom, () => doc.querySelectorAll('#boss-grid .bcard-boss').length > 0, 5000, 'cartes de boss');

  assert.strictEqual(doc.querySelectorAll('#boss-grid .bcard-boss.is-locked').length, 0, 'le secret doit être révélé');
  assert.match(doc.querySelector('#bossrush-count').textContent, /5 \/ 5/, 'compteur de boss incorrect');
  assert.match(doc.querySelector('#boss-grid').textContent, /NULL SECTOR/, 'NULL SECTOR doit être visible');
  assert.match(doc.querySelector('#bossrush-stats').textContent, /3 min 30 s/, 'meilleur temps absent');
  assert.match(doc.querySelector('#bossrush-stats').textContent, /12000/, 'dégâts record absents');
  assert.match(doc.querySelector('#bossrush-stats').textContent, /Apple/, 'marque du record absente');

  // Lancer le run : six boss au programme
  click(doc, '#btn-start-boss');
  await waitFor(dom, () => doc.querySelector('#screen-select').classList.contains('is-active'), 5000, 'sélection');
  assert.match(doc.querySelector('#select-title').textContent, /Boss Rush/, 'titre de sélection incorrect');
  doc.querySelector('#brand-grid .bcard').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await waitFor(dom, () => doc.querySelector('#screen-arena').classList.contains('is-active'), 8000, 'arène');
  assert.match(doc.querySelector('#hud-mode').textContent, /boss 1\/6/, 'le run doit comporter six boss');

  dom.window.close();
});

test('interface : un combat de boss affiche l’intro, la barre de PV et les phases', { timeout: 240000 }, async () => {
  const dom = await openGame(function (w) { w.localStorage.setItem(META_KEY, JSON.stringify(bossSeed())); });
  const doc = dom.window.document;
  await waitFor(dom, () => doc.querySelectorAll('.roster-chip').length > 0, 10000, 'chargement');

  click(doc, '#btn-speed');
  click(doc, '#btn-speed');                       // ×3
  click(doc, '#btn-boss');
  await waitFor(dom, () => doc.querySelector('#screen-bossrush').classList.contains('is-active'), 5000, 'écran Boss Rush');
  click(doc, '#btn-start-boss');
  await waitFor(dom, () => doc.querySelector('#screen-select').classList.contains('is-active'), 5000, 'sélection');
  doc.querySelector('#brand-grid .bcard').dispatchEvent(new dom.window.Event('click', { bubbles: true }));

  // Cinématique d'introduction
  await waitFor(dom, () => doc.querySelector('#boss-intro').classList.contains('is-open'), 8000, 'cinématique d’intro');
  assert.match(doc.querySelector('#bossintro-name').textContent, /MEGA TECH/, 'nom du boss absent de l’intro');
  assert.match(doc.querySelector('#bossintro-stats').textContent, /1200/, 'PV du boss absents de l’intro');
  assert.match(doc.querySelector('#bossintro-power').textContent, /Surcharge technologique/, 'pouvoir absent de l’intro');
  await waitFor(dom, () => !doc.querySelector('#boss-intro').classList.contains('is-open'), 15000, 'fin de l’intro');

  await waitFor(dom, () => doc.querySelector('#screen-arena').classList.contains('is-active'), 5000, 'arène');
  assert.match(doc.querySelector('#hud-mode').textContent, /Boss Rush/, 'mode absent du bandeau');

  // Barre de PV spéciale avec repères de phase
  assert.strictEqual(doc.querySelector('#bossbar').hidden, false, 'barre de boss masquée');
  assert.match(doc.querySelector('#bossbar-name').textContent, /MEGA TECH/);
  assert.strictEqual(parseInt(doc.querySelector('#bossbar-max').textContent, 10) >= 1200, true, 'PV du boss incorrects');
  assert.strictEqual(doc.querySelectorAll('#bossbar-marks .bossbar__mark').length, 1, 'repère de phase manquant');
  assert.match(doc.querySelector('#bossbar-phase').textContent, /Phase 1/, 'numéro de phase absent');
  assert.match(doc.querySelector('#bossbar-power').textContent, /Surcharge technologique/, 'pouvoir absent de la barre');

  // Le boss est identifié comme tel, le joueur est en surrégime
  assert.ok(doc.querySelector('#fighter-right').classList.contains('is-boss'), 'carte de boss non marquée');
  assert.match(doc.querySelector('#lvl-right').textContent, /BOSS/, 'étiquette BOSS absente');
  assert.match(doc.querySelector('#lvl-left').textContent, /Surrégime/, 'surrégime du joueur absent');

  // Laisser l'IA jouer le combat
  click(doc, '#btn-auto');
  await waitFor(dom, () => doc.querySelector('#result-overlay').classList.contains('is-open'), 180000, 'fin du combat de boss');

  // Le boss a dû passer en phase 2 au cours du combat
  assert.ok(doc.querySelectorAll('#bossbar-marks .bossbar__mark').length >= 1, 'repères de phase perdus');

  // Panneau de résultat et actions propres au Boss Rush
  const title = doc.querySelector('#result-title').textContent;
  assert.ok(/BOSS VAINCU|BOSS RUSH TERMINÉ/.test(title), 'titre de résultat inattendu : ' + title);
  const actions = Array.from(doc.querySelectorAll('#result-actions .btn')).map((b) => b.textContent);
  assert.ok(actions.some((a) => /Quitter le Boss Rush/.test(a)), 'action « Quitter » absente');
  assert.ok(actions.some((a) => /Boss suivant|Réessayer|Voir le tableau/.test(a)), 'action de suite absente');

  // Sauvegarde : les dégâts du combat sont comptés et la partie est enregistrée
  const saved = JSON.parse(dom.window.localStorage.getItem(META_KEY));
  assert.ok(saved.boss, 'bloc Boss Rush absent de la sauvegarde');
  assert.ok(saved.boss.totalDamage > 0, 'dégâts non comptés');
  const playerName = doc.querySelector('#name-left').textContent;
  assert.ok(saved.boss.lastBrand, 'marque du run non enregistrée');
  assert.match(playerName, new RegExp('^' + saved.boss.lastBrand + '$', 'i'),
    'la marque enregistrée ne correspond pas au combattant : ' + saved.boss.lastBrand + ' / ' + playerName);

  // Quitter le Boss Rush referme la partie
  const quit = Array.from(doc.querySelectorAll('#result-actions .btn')).find((b) => /Quitter/.test(b.textContent));
  quit.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await waitFor(dom, () => doc.querySelector('#screen-bossrush').classList.contains('is-active'), 8000, 'retour Boss Rush');
  const after = JSON.parse(dom.window.localStorage.getItem(META_KEY));
  assert.strictEqual(after.boss.runs, 1, 'le Boss Rush doit être comptabilisé');

  dom.window.close();
});
