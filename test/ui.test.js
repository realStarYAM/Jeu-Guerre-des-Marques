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

async function openGame() {
  const virtualConsole = new VirtualConsole();      // on ignore les "Not implemented" de jsdom
  return JSDOM.fromURL(base + 'index.html', {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole
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

  const particles = Array.from(ui.matchAll(/particle: '([a-z]+)'/g)).map((m) => m[1]);
  assert.strictEqual(new Set(particles).size, 11, 'chaque marque doit avoir ses propres particules');
  particles.forEach((p) => assert.ok(css.includes('.up--' + p), 'classe CSS manquante : .up--' + p));

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
