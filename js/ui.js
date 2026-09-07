/* ============================================================
   GUERRE DES MARQUES — Interface, animations et enchaînement
   ============================================================ */
(function () {
  'use strict';

  const Engine = window.BattleEngine;
  const Data = window.BRANDS_DATA;

  /* ------------------------- État ------------------------- */
  const state = {
    screen: 'menu',
    mode: 'duel',            // 'duel' | 'tournament' | 'auto'
    picking: 'player',       // 'player' | 'foe'
    playerBrandId: null,
    foeBrandId: null,
    battle: null,
    display: { left: 0, right: 0 },   // PV affichés (animés)
    busy: false,
    auto: false,
    speed: 1,
    tournament: null,        // { order, index, wins }
    shownRows: new Set(),
    historyFilter: 'all'     // all | ult | crit | heal
  };

  const META_KEY = 'guerreDesMarques.meta.v1';
  let meta = loadMeta();

  function loadMeta() {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* stockage indisponible */ }
    return { wins: 0, losses: 0, crits: 0, specials: 0, ultimates: 0, bestDamage: 0, streak: 0, bestStreak: 0, duels: [] };
  }
  function saveMeta() {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* ignore */ }
  }

  /* ------------------------- Helpers DOM ------------------------- */
  const $ = function (sel) { return document.querySelector(sel); };
  const wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms / state.speed); }); };
  const esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function clearClass(el, prefix) {
    if (!el) return;
    Array.prototype.slice.call(el.classList).forEach(function (c) {
      if (c.indexOf(prefix) === 0) el.classList.remove(c);
    });
  }
  function restartAnim(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;      // force reflow pour relancer l'animation
    el.classList.add(cls);
  }

  /* ------------------------- Navigation ------------------------- */
  function goto(screen) {
    state.screen = screen;
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('is-active'); });
    const el = $('#screen-' + screen);
    if (el) el.classList.add('is-active');
    if (screen === 'select') renderBrandGrid();
    if (screen === 'stats') renderStats();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ------------------------- Menu ------------------------- */
  function renderMenuRoster() {
    $('#menu-roster').innerHTML = Data.BRANDS.map(function (b) {
      return '<span class="roster-chip" title="' + esc(b.name) + ' — ' + esc(b.cat) +
        '" style="background:linear-gradient(135deg,' + b.colors[0] + ',' + b.colors[1] + ')">' +
        esc(b.mono) + '</span>';
    }).join('');
  }

  function startMode(mode) {
    state.mode = mode;
    state.auto = mode === 'auto';
    $('#btn-auto').textContent = '🤖 Auto : ' + (state.auto ? 'on' : 'off');
    $('#btn-auto').classList.toggle('is-off', !state.auto);
    if (mode === 'auto') {
      // Duel aléatoire entre deux marques, joué entièrement par l'IA
      const pool = Data.BRANDS.slice();
      const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const b = pool[Math.floor(Math.random() * pool.length)];
      startBattle(a.id, b.id);
      return;
    }
    state.picking = 'player';
    goto('select');
  }

  /* ------------------------- Sélection ------------------------- */
  function renderBrandGrid() {
    const isPlayerStep = state.picking === 'player';
    $('#select-title').textContent = isPlayerStep ? 'Choisissez votre marque' : 'Choisissez votre adversaire';
    $('#select-sub').textContent = isPlayerStep
      ? (state.mode === 'tournament'
        ? 'Vous affronterez les 10 autres marques, de la plus abordable à la plus redoutable.'
        : 'Elle occupera le coin gauche de l’arène.')
      : 'Elle occupera le coin droit de l’arène.';
    $('#btn-random-foe').hidden = isPlayerStep;

    $('#brand-grid').innerHTML = Data.BRANDS.map(function (b) {
      const disabled = !isPlayerStep && b.id === state.playerBrandId;
      const maxStat = 100;
      const statRow = function (label, value, color) {
        return '<div class="stat"><span>' + label + '</span>' +
          '<span class="stat__bar"><span class="stat__fill" style="width:' + Math.min(100, value / maxStat * 100) + '%;background:' + color + '"></span></span>' +
          '<b>' + value + '</b></div>';
      };
      return '<button class="bcard" data-brand="' + b.id + '"' + (disabled ? ' disabled' : '') +
        ' style="--card-accent:' + b.accent + '">' +
        (disabled ? '<span class="bcard__flag">Votre marque</span>' : '') +
        '<div class="bcard__head">' +
        '<span class="bcard__badge" style="background:linear-gradient(135deg,' + b.colors[0] + ',' + b.colors[1] + ')">' + esc(b.mono) + '</span>' +
        '<div><h3 class="bcard__name">' + esc(b.name) + '</h3><p class="bcard__cat">' + esc(b.cat) + '</p></div>' +
        '</div>' +
        '<p class="bcard__tag">« ' + esc(b.tagline) + ' »</p>' +
        '<div class="bcard__stats">' +
        statRow('❤️ PV', b.stats.pv, 'linear-gradient(90deg,#ff4d6d,#ff8fa3)') +
        statRow('⚔️ Attaque', b.stats.attaque, 'linear-gradient(90deg,#ff8c3a,#ffc93c)') +
        statRow('🛡️ Défense', b.stats.defense, 'linear-gradient(90deg,#37c8ff,#6c8cff)') +
        statRow('💨 Vitesse', b.stats.vitesse, 'linear-gradient(90deg,#3ddc97,#a3e635)') +
        '</div>' +
        '<div class="bcard__special"><b>' + b.special.icon + ' ' + esc(b.special.name) + '</b>' +
        '<span>' + esc(b.special.desc) + '</span>' +
        '<span class="bcard__cost">Coût : ' + b.special.cost + ' ⚡</span></div>' +
        '<div class="bcard__ult"><b>✦ ' + esc(b.ultimate.name) + '</b>' +
        '<span>' + esc(b.ultimate.desc) + '</span>' +
        '<span class="bcard__cost">Ultime : 100 % de jauge</span></div>' +
        '</button>';
    }).join('');
  }

  function pickBrand(id) {
    SFX.play('click');
    if (state.picking === 'player') {
      state.playerBrandId = id;
      if (state.mode === 'tournament') {
        startTournament(id);
        return;
      }
      state.picking = 'foe';
      renderBrandGrid();
      return;
    }
    state.foeBrandId = id;
    startBattle(state.playerBrandId, state.foeBrandId);
  }

  function randomFoe() {
    const pool = Data.BRANDS.filter(function (b) { return b.id !== state.playerBrandId; });
    state.foeBrandId = pool[Math.floor(Math.random() * pool.length)].id;
    startBattle(state.playerBrandId, state.foeBrandId);
  }

  /* ------------------------- Tournoi ------------------------- */
  function startTournament(playerId) {
    const order = Data.tournamentOrder(playerId);
    state.tournament = { order: order, index: 0, wins: 0 };
    $('#bracket').hidden = false;
    startBattle(playerId, order[0].id);
  }

  function renderBracket() {
    if (!state.tournament) { $('#bracket').hidden = true; return; }
    $('#bracket').hidden = false;
    const t = state.tournament;
    $('#bracket-list').innerHTML = t.order.map(function (b, i) {
      let cls = 'bstep';
      if (i < t.index) cls += ' bstep--done';
      else if (i === t.index) cls += ' bstep--current';
      const mark = i < t.index ? '✔' : (i === t.index ? '▶' : '·');
      return '<li class="' + cls + '">' + mark + ' ' + esc(b.name) + ' <small>(' + Data.powerScore(b) + ')</small></li>';
    }).join('');
  }

  /* ------------------------- Démarrage d'un combat ------------------------- */
  function startBattle(playerId, foeId) {
    const battle = Engine.createBattle(playerId, foeId, { mode: state.mode });
    state.battle = battle;
    state.display.left = battle.a.hp;
    state.display.right = battle.b.hp;
    state.shownRows = new Set();

    $('#hud-mode').textContent = state.mode === 'tournament'
      ? 'Tournoi — combat ' + (state.tournament.index + 1) + '/' + state.tournament.order.length
      : (state.mode === 'auto' ? 'Combat auto' : 'Duel');

    // Visuel des combattants
    ['left', 'right'].forEach(function (side) {
      const f = battle.fighters[side];
      const b = f.brand;
      $('#fighter-' + side).style.setProperty('--card-accent', b.accent);
      $('#fighter-' + side).style.setProperty('--card-glow', b.glow);
      const badge = $('#badge-' + side);
      badge.textContent = b.mono;
      badge.style.background = 'linear-gradient(135deg,' + b.colors[0] + ',' + b.colors[1] + ')';
      const avatar = $('#avatar-' + side);
      avatar.textContent = b.mono;
      avatar.style.background = 'linear-gradient(135deg,' + b.colors[0] + ',' + b.colors[1] + ')';
      $('#name-' + side).textContent = b.name;
      $('#cat-' + side).textContent = b.cat;
      $('#hp-max-' + side).textContent = f.maxHp;
      $('#energy-mark-' + side).style.left = (b.special.cost / Engine.CFG.ENERGY_MAX * 100) + '%';
      clearClass($('#fighter-' + side), 'is-');
      $('#fx-' + side).innerHTML = '';
    });

    // Remise à zéro des panneaux
    $('#history-list').className = 'history__list';
    $('#history-list').innerHTML = '<p class="history__empty">Aucune attaque pour l’instant.</p>';
    $('#history-count').textContent = '0 action';
    $('#history-recap').innerHTML = '';
    setHistoryFilter('all');
    $('#log-list').innerHTML = '';
    $('#ticker').textContent = 'Le combat commence…';
    $('#ticker').className = 'ticker';
    $('#special-name').textContent = battle.a.brand.special.name;
    $('#special-cost').textContent = battle.a.brand.special.cost;
    $('#ultimate-name').textContent = battle.a.brand.ultimate.name;
    $('#ultimate-cost').textContent = Engine.CFG.ULT_MAX;
    $('#announce').innerHTML = '';
    $('#ko-overlay').classList.remove('is-open');
    closeResult();
    renderBracket();
    refreshAll();
    goto('arena');

    // Entrée en scène
    (async function () {
      state.busy = true;
      updateActions();
      await announce(battle.a.brand.name + '  vs  ' + battle.b.brand.name, 'round');
      await announce('ROUND 1', 'round');
      SFX.play('round');
      await announce('FIGHT !', 'fight');
      state.busy = false;
      updateActions();
      maybeAiTurn(700);
    })();
  }

  /* ------------------------- Rafraîchissement UI ------------------------- */
  function refreshAll() {
    ['left', 'right'].forEach(function (side) {
      const f = state.battle.fighters[side];
      paintHp(side);
      paintEnergy(side);
      paintUlt(side);
      paintChips(side);
      $('#fighter-' + side).classList.toggle('is-turn', !!Engine.currentActor(state.battle) && Engine.currentActor(state.battle).side === side && state.battle.active);
    });
    $('#hud-round').textContent = state.battle.round;
    const actor = Engine.currentActor(state.battle);
    const hudTurn = $('#hud-turn');
    hudTurn.classList.remove('is-you', 'is-foe');
    if (!state.battle.active) {
      hudTurn.textContent = 'Combat terminé';
    } else if (isPlayerTurn()) {
      hudTurn.textContent = 'À vous — ' + actor.name;
      hudTurn.classList.add('is-you');
    } else {
      hudTurn.textContent = 'Tour de ' + actor.name;
      hudTurn.classList.add('is-foe');
    }
  }

  function paintHp(side) {
    const f = state.battle.fighters[side];
    const hp = Math.max(0, state.display[side]);
    const pct = Math.max(0, Math.min(100, hp / f.maxHp * 100));
    const fill = $('#hp-fill-' + side);
    fill.style.width = pct + '%';
    $('#hp-ghost-' + side).style.width = pct + '%';
    fill.classList.toggle('is-mid', pct <= 55 && pct > 25);
    fill.classList.toggle('is-low', pct <= 25);
    $('#hp-now-' + side).textContent = Math.round(hp);
    fill.parentElement.classList.toggle('is-full', pct >= 100);
  }

  function paintEnergy(side) {
    const f = state.battle.fighters[side];
    const pct = f.energy / Engine.CFG.ENERGY_MAX * 100;
    $('#energy-fill-' + side).style.width = pct + '%';
    $('#energy-txt-' + side).textContent = Math.round(f.energy) + ' / ' + Engine.CFG.ENERGY_MAX;
  }

  function paintUlt(side) {
    const f = state.battle.fighters[side];
    const pct = Math.max(0, Math.min(100, f.ult / Engine.CFG.ULT_MAX * 100));
    const bar = $('#ult-fill-' + side).parentElement;
    const box = $('#ult-box-' + side);
    const locked = f.ultCooldown > 0;
    $('#ult-fill-' + side).style.width = pct + '%';
    bar.classList.toggle('is-locked', locked);
    bar.classList.toggle('is-full', pct >= 100 && !locked);
    box.classList.toggle('is-ready', pct >= 100 && !locked);
    const cdLabel = '⏳ ' + f.ultCooldown + ' tour' + (f.ultCooldown > 1 ? 's' : '');
    $('#ult-lock-txt-' + side).textContent = cdLabel;
    $('#ult-txt-' + side).textContent = locked ? cdLabel : Math.round(pct) + ' %';
  }

  function paintChips(side) {
    const f = state.battle.fighters[side];
    const chips = [];
    if (f.shield > 0) chips.push('<li class="chip chip--warn">⭐ Invulnérable ' + f.shield + '</li>');
    if (f.defending) chips.push('<li class="chip">🛡️ Garde</li>');
    if (f.critGuaranteed > 0) chips.push('<li class="chip chip--warn">🎯 Critique ×' + f.critGuaranteed + '</li>');
    if (f.stun > 0) chips.push('<li class="chip chip--bad">💫 Étourdi ' + f.stun + '</li>');
    if (f.ultCooldown > 0) chips.push('<li class="chip chip--bad">⏳ Recharge ultime ' + f.ultCooldown + '</li>');
    if (f.ult >= Engine.CFG.ULT_MAX && f.ultCooldown <= 0) chips.push('<li class="chip chip--ult">✦ Ultime prêt</li>');
    f.buffs.forEach(function (b) {
      const tone = b.stat === 'defense' ? 'chip--good' : 'chip--warn';
      chips.push('<li class="chip ' + tone + '">' + (b.icon || '✦') + ' ' + esc(b.label) + ' (' + b.turns + ')</li>');
    });
    const el = $('#chips-' + side);
    const html = chips.join('');
    if (el.innerHTML !== html) el.innerHTML = html;
    $('#fighter-' + side).classList.toggle('is-shielded', f.shield > 0);
  }

  function updateActions() {
    const playable = isPlayerTurn() && !state.busy && state.battle && state.battle.active;
    $('#btn-attack').disabled = !playable;
    $('#btn-defend').disabled = !playable;
    const specialReady = playable && Engine.canUseSpecial(state.battle.fighters.left);
    const btnSpecial = $('#btn-special');
    btnSpecial.disabled = !playable || !specialReady;
    btnSpecial.classList.toggle('is-ready', specialReady);

    const ultReady = playable && Engine.canUseUltimate(state.battle.fighters.left);
    const btnUlt = $('#btn-ultimate');
    btnUlt.disabled = !playable || !ultReady;
    btnUlt.classList.toggle('is-ready', ultReady);

    const f = state.battle ? state.battle.fighters.left : null;
    if (f) {
      $('#special-name').textContent = f.brand.special.name;
      $('#special-cost').textContent = f.brand.special.cost;
      $('#ultimate-name').textContent = f.brand.ultimate.name;
      $('#ultimate-cost').textContent = Engine.CFG.ULT_MAX;
    }
  }

  function isPlayerTurn() {
    if (!state.battle || !state.battle.active) return false;
    if (state.mode === 'auto' || state.auto) return false;
    const actor = Engine.currentActor(state.battle);
    return !!actor && actor.side === 'left';
  }

  /* ------------------------- Effets ------------------------- */
  function announce(text, variant) {
    return new Promise(function (resolve) {
      const box = $('#announce');
      const el = document.createElement('div');
      el.className = 'announce__text announce__text--' + (variant || 'round');
      el.textContent = text;
      box.appendChild(el);
      const life = 850 / state.speed;
      setTimeout(function () { el.remove(); resolve(); }, life);
    });
  }

  function popDamage(side, text, variant) {
    const layer = $('#fx-' + side);
    const el = document.createElement('div');
    el.className = 'dmg-pop' + (variant ? ' dmg-pop--' + variant : '');
    el.textContent = text;
    el.style.left = (38 + Math.random() * 24) + '%';
    layer.appendChild(el);
    setTimeout(function () { el.remove(); }, 1200 / state.speed);
  }

  function sparks(side, count, color) {
    const layer = $('#fx-' + side);
    for (let i = 0; i < count; i++) {
      const s = document.createElement('i');
      s.className = 'spark';
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 90;
      s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      s.style.background = color || '#fff';
      layer.appendChild(s);
      setTimeout(function () { s.remove(); }, 700 / state.speed);
    }
  }

  function ring(side, crit) {
    const layer = $('#fx-' + side);
    const el = document.createElement('i');
    el.className = 'ring' + (crit ? ' ring--crit' : '');
    layer.appendChild(el);
    setTimeout(function () { el.remove(); }, 650 / state.speed);
  }

  function slash(side) {
    const layer = $('#fx-' + side);
    const el = document.createElement('i');
    el.className = 'slash';
    el.style.transform = 'rotate(' + (side === 'left' ? -24 : 24) + 'deg)';
    layer.appendChild(el);
    setTimeout(function () { el.remove(); }, 500 / state.speed);
  }

  function shakeArena() { restartAnim($('#arena'), 'is-shaking'); }
  function flashArena() { restartAnim($('#arena'), 'is-flashing'); }

  /* Secousse légère de tout l'écran (hard = ultime / K.O.).
     Une seule secousse à la fois : on annule la précédente pour qu'une rafale
     d'impacts ne laisse pas un vieux minuteur éteindre la secousse en cours. */
  let quakeTimer = null;
  function quakeScreen(hard) {
    if (quakeTimer) clearTimeout(quakeTimer);
    document.body.classList.remove('is-quake', 'is-quake-hard');
    void document.body.offsetWidth;                 // relance l'animation
    document.body.classList.add(hard ? 'is-quake-hard' : 'is-quake');
    quakeTimer = setTimeout(function () {
      document.body.classList.remove('is-quake', 'is-quake-hard');
      quakeTimer = null;
    }, (hard ? 800 : 550) / state.speed);
  }

  /* --------- Cinématique d'ultime --------- */
  async function playCinematic(ev) {
    const cine = $('#cine');
    const f = state.battle.fighters[ev.side];
    const colors = ev.colors || ['#6c8cff', '#b06cff'];

    cine.style.setProperty('--cine-a', colors[0]);
    cine.style.setProperty('--cine-b', colors[1]);
    cine.style.setProperty('--cine-x', ev.side === 'left' ? '24%' : '76%');
    cine.dataset.fx = ev.fx || 'distort';
    $('#cine-mono').textContent = f.brand.mono;
    $('#cine-mono').style.color = 'transparent';
    $('#cine-brand').textContent = f.name;
    $('#cine-ult').textContent = ev.name;
    $('#cine-phrase').textContent = ev.phrase || ev.desc || '';

    // Éclats lumineux projetés depuis le centre
    const shards = $('#cine-shards');
    shards.innerHTML = '';
    for (let i = 0; i < 20; i++) {
      const s = document.createElement('i');
      const angle = (Math.PI * 2 * i) / 20 + Math.random() * 0.3;
      const dist = 220 + Math.random() * 420;
      s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      s.style.setProperty('--rot', (angle * 180 / Math.PI).toFixed(1) + 'deg');
      s.style.animationDelay = (Math.random() * 0.25).toFixed(2) + 's';
      shards.appendChild(s);
    }

    cine.classList.remove('is-open');
    void cine.offsetWidth;
    cine.classList.add('is-open');
    cine.setAttribute('aria-hidden', 'false');
    restartAnim($('#fighter-' + ev.side), 'is-charging');
    SFX.play('ultimate');
    quakeScreen(true);
    sparks(ev.side, 26, colors[1]);
    setTicker('✦ <b>' + esc(f.name) + '</b> déclenche son ULTIME : « ' + esc(ev.name) + ' » — ' + esc(ev.desc || ''));

    await wait(1550);
    cine.classList.remove('is-open');
    cine.setAttribute('aria-hidden', 'true');
    shards.innerHTML = '';
    announce('ULTIME !', 'ult');
    await wait(200);
  }

  function confetti(count) {
    const colors = ['#6c8cff', '#b06cff', '#ff5f9e', '#3ddc97', '#ffc93c', '#37c8ff'];
    const host = document.body;
    for (let i = 0; i < count; i++) {
      const c = document.createElement('i');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = (1.6 + Math.random() * 1.6) + 's';
      c.style.animationDelay = (Math.random() * 0.5) + 's';
      host.appendChild(c);
      setTimeout(function () { c.remove(); }, 3800);
    }
  }

  /* ------------------------- Historique ------------------------- */
  function nextHistoryRow(side) {
    const rows = state.battle.history;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].actorSide === side && !state.shownRows.has(i)) {
        state.shownRows.add(i);
        return rows[i];
      }
    }
    return null;
  }

  /* Bloc dépliable : impacts, PV restants, jauge d'ultime, effets */
  function historyDetailHtml(row) {
    const fighters = state.battle.fighters;
    const nameOf = function (side) { return fighters[side].name; };
    const lines = [];

    if (row.detail) lines.push(['Impacts', row.detail]);
    if (row.hits > 1 && row.critCount) lines.push(['Critiques', row.critCount + ' / ' + row.hits]);
    if (row.dodgeCount) lines.push(['Esquives', row.dodgeCount + ' / ' + row.hits]);
    if (row.heal > 0) lines.push(['Soin', '+' + row.heal + ' PV']);
    if (row.blocked) lines.push(['Résultat', 'Absorbé par le bouclier']);
    else if (row.dodged) lines.push(['Résultat', 'Esquive totale']);

    const hpMini = ['left', 'right'].map(function (side) {
      const hp = row.hpLeft ? row.hpLeft[side] : fighters[side].hp;
      const pct = row.hpPct ? row.hpPct[side] : Math.round(hp / fighters[side].maxHp * 100);
      return '<div class="hpmini hpmini--' + side + '">' +
        '<span class="hpmini__name">' + esc(nameOf(side)) + '</span>' +
        '<span class="hpmini__bar"><span class="hpmini__fill" style="width:' + Math.max(0, pct) + '%"></span></span>' +
        '<span class="hpmini__num">' + hp + ' (' + pct + ' %)</span></div>';
    }).join('');

    const ult = row.ultAfter
      ? '<div class="ultmini">Jauge ultime → <b>' + Math.round(row.ultAfter.left) + ' %</b> · <b>' +
        Math.round(row.ultAfter.right) + ' %</b></div>'
      : '';

    const effects = (row.effects && row.effects.length)
      ? '<div class="hrow__effects">' + row.effects.map(function (e) {
        return '<span class="eff">' + esc(e) + '</span>';
      }).join('') + '</div>'
      : '';

    return '<div class="hrow__detail">' +
      '<dl><dt>Action</dt><dd>Round ' + row.round + ' · action n°' + row.index + '</dd>' +
      lines.map(function (l) { return '<dt>' + esc(l[0]) + '</dt><dd>' + esc(l[1]) + '</dd>'; }).join('') +
      '</dl>' + hpMini + ult + effects +
      '</div>';
  }

  function renderHistoryRow(row) {
    const list = $('#history-list');
    const empty = list.querySelector('.history__empty');
    if (empty) empty.remove();

    const li = document.createElement('li');
    let cls = 'hrow hrow--' + row.actorSide;
    if (row.actionKind === 'ultimate') cls += ' hrow--ult';
    else if (row.crit) cls += ' hrow--crit';
    else if (row.heal > 0 && row.damage === 0) cls += ' hrow--heal';
    else if (row.actionKind === 'control' || row.actionKind === 'buff' || row.actionKind === 'support') cls += ' hrow--control';
    li.className = cls;

    const tags = [];
    if (row.actionKind === 'ultimate') tags.push('<span class="tag tag--ult">ULTIME</span>');
    if (row.crit) tags.push('<span class="tag tag--crit">CRITIQUE</span>');
    if (row.dodged) tags.push('<span class="tag tag--dodge">ESQUIVE</span>');
    if (row.blocked) tags.push('<span class="tag tag--block">BLOQUÉ</span>');
    if (row.actionKind === 'special') tags.push('<span class="tag tag--special">SPÉCIAL</span>');
    if (row.actionKind === 'control') tags.push('<span class="tag tag--stun">CONTRÔLE</span>');
    if (row.hits > 1) tags.push('<span class="tag">×' + row.hits + '</span>');

    let dmgHtml;
    if (row.heal > 0 && row.damage === 0) dmgHtml = '<span class="hrow__dmg is-heal">+' + row.heal + '</span>';
    else if (row.damage > 0) dmgHtml = '<span class="hrow__dmg' + (row.crit ? ' is-crit' : '') + '">' + row.damage + '</span>';
    else dmgHtml = '<span class="hrow__dmg is-zero">0</span>';

    li.innerHTML =
      '<span class="hrow__round">R' + row.round + '</span>' +
      '<span class="hrow__main"><b>' + esc(row.actor) + '</b> <span>→ ' + esc(row.action) +
      (row.target && row.target !== row.actor ? ' sur ' + esc(row.target) : '') + '</span></span>' +
      '<span class="hrow__tags">' + tags.join('') + dmgHtml +
      '<span class="hrow__caret" title="Voir le détail">▶</span></span>' +
      historyDetailHtml(row);

    list.insertBefore(li, list.firstChild);   // plus récent en haut
    const count = state.battle.history.length;
    $('#history-count').textContent = count + (count > 1 ? ' actions' : ' action');
    renderRecap();
  }

  /* Récapitulatif chiffré du combat, mis à jour à chaque action */
  function renderRecap() {
    const acc = { left: null, right: null };
    ['left', 'right'].forEach(function (side) {
      const f = state.battle.fighters[side];
      acc[side] = { name: f.name, dmg: 0, taken: 0, crits: 0, ults: 0, heal: 0 };
    });
    state.battle.history.forEach(function (r) {
      if (!acc[r.actorSide]) return;
      const a = acc[r.actorSide];
      a.dmg += r.damage || 0;
      a.crits += r.critCount || (r.crit ? 1 : 0);
      a.heal += r.heal || 0;
      if (r.actionKind === 'ultimate') a.ults++;
      const other = r.actorSide === 'left' ? 'right' : 'left';
      if (acc[other]) acc[other].taken += r.damage || 0;
    });
    $('#history-recap').innerHTML = ['left', 'right'].map(function (side) {
      const a = acc[side];
      return '<div class="recap recap--' + side + '">' +
        '<div class="recap__side"><span>' + esc(a.name) + '</span><b>' + a.dmg + '</b></div>' +
        '<div class="recap__meta">' + a.crits + ' critique' + (a.crits > 1 ? 's' : '') +
        ' · ' + a.ults + ' ultime' + (a.ults > 1 ? 's' : '') +
        ' · +' + a.heal + ' PV · subi ' + a.taken + '</div></div>';
    }).join('');
  }

  function setHistoryFilter(kind) {
    state.historyFilter = kind || 'all';
    const list = $('#history-list');
    list.className = 'history__list' + (state.historyFilter === 'all' ? '' : ' is-filter-' + state.historyFilter);
    document.querySelectorAll('#history-filters .filter-chip').forEach(function (b) {
      b.classList.toggle('is-on', b.dataset.filter === state.historyFilter);
    });
  }

  function pushLog(entry) {
    const list = $('#log-list');
    const li = document.createElement('li');
    li.className = 'logline logline--' + entry.cls;
    li.textContent = entry.text;
    list.insertBefore(li, list.firstChild);
    while (list.children.length > 60) list.removeChild(list.lastChild);
  }

  function setTicker(text, cls) {
    const t = $('#ticker');
    t.innerHTML = text;
    t.className = 'ticker' + (cls ? ' is-' + cls : '');
  }

  /* ------------------------- Lecture des événements ------------------------- */
  async function playEvents(events) {
    state.busy = true;
    updateActions();
    for (let i = 0; i < events.length; i++) {
      await playEvent(events[i]);
      if (!state.battle.active && events[i].t === 'end') break;
    }
    state.busy = false;
    refreshAll();
    updateActions();
    if (!state.battle.active) await finishBattle();
    else maybeAiTurn(620);
  }

  async function playEvent(ev) {
    const battle = state.battle;
    switch (ev.t) {

      case 'turn':
        refreshAll();
        break;

      case 'round':
        SFX.play('round');
        await announce('ROUND ' + ev.n, 'round');
        refreshAll();
        break;

      case 'strike': {
        const attacker = $('#fighter-' + ev.side);
        const targetSide = ev.target;
        restartAnim(attacker, 'is-attacking');
        SFX.play(ev.ultimate ? 'ultimate' : 'swing');
        if (ev.ultimate) quakeScreen(true);
        await wait(ev.ultimate ? 240 : 150);

        for (let i = 0; i < ev.hits.length; i++) {
          const hit = ev.hits[i];
          slash(targetSide);
          if (hit.dodged) {
            SFX.play('dodge');
            popDamage(targetSide, 'ESQUIVE', 'miss');
            setTicker('<b>' + esc(battle.fighters[ev.side].name) + '</b> frappe dans le vide : ' + esc(battle.fighters[targetSide].name) + ' esquive !');
          } else if (hit.blocked) {
            SFX.play('block');
            ring(targetSide, false);
            popDamage(targetSide, 'BLOQUÉ', 'block');
            sparks(targetSide, 8, '#7fd8ff');
            setTicker('Le bouclier de <b>' + esc(battle.fighters[targetSide].name) + '</b> absorbe tout.');
          } else {
            state.display[targetSide] = Math.max(0, state.display[targetSide] - hit.damage);
            restartAnim($('#fighter-' + targetSide), 'is-hit');
            if (hit.crit) {
              SFX.play('crit');
              ring(targetSide, true);
              if (ev.ultimate) {
                sparks(targetSide, 30, '#ff8ad0');
                popDamage(targetSide, hit.damage + ' !!', 'ult');
                setTicker('✦ ULTIME de <b>' + esc(battle.fighters[ev.side].name) + '</b> : ' + hit.damage + ' dégâts critiques !');
              } else {
                sparks(targetSide, 22, '#ffd447');
                popDamage(targetSide, hit.damage + ' !', 'crit');
                setTicker('💥 Coup critique de <b>' + esc(battle.fighters[ev.side].name) + '</b> : ' + hit.damage + ' dégâts !', 'crit');
              }
              flashArena();
              shakeArena();
              quakeScreen(!!ev.ultimate);
              announce(ev.ultimate ? 'ULTIME !' : 'CRITIQUE !', ev.ultimate ? 'ult' : 'crit');
            } else {
              SFX.play('hit');
              ring(targetSide, false);
              sparks(targetSide, 12, '#fff3c4');
              popDamage(targetSide, String(hit.damage), ev.ultimate ? 'ult' : '');
              setTicker('<b>' + esc(battle.fighters[ev.side].name) + '</b> touche ' + esc(battle.fighters[targetSide].name) + ' pour ' + hit.damage + ' dégâts.');
            }
            if (hit.heal) {
              state.display[ev.side] = Math.min(battle.fighters[ev.side].maxHp, state.display[ev.side] + hit.heal);
              popDamage(ev.side, '+' + hit.heal, 'heal');
              SFX.play('heal');
            }
            paintHp(targetSide);
            paintHp(ev.side);
          }
          if (ev.hits.length > 1 && i < ev.hits.length - 1) await wait(190);
          else await wait(150);
        }

        const row = nextHistoryRow(ev.side);
        if (row) renderHistoryRow(row);
        if (battle.logs.length) pushLog(battle.logs[battle.logs.length - 1]);
        refreshAll();
        break;
      }

      case 'specialCast':
        restartAnim($('#fighter-' + ev.side), 'is-casting');
        SFX.play('special');
        announce(ev.icon + ' ' + ev.name, 'special');
        setTicker('⚡ <b>' + esc(battle.fighters[ev.side].name) + '</b> déclenche « ' + esc(ev.name) + ' » — ' + esc(ev.desc));
        paintEnergy(ev.side);
        await wait(520);
        break;

      /* --------- Ultimes --------- */
      case 'ultimateCast':
        paintUlt(ev.side);
        await playCinematic(ev);
        paintUlt(ev.side);
        refreshAll();
        break;

      case 'ult':
        paintUlt(ev.side);
        break;

      case 'ultCooldown':
        paintUlt(ev.side);
        paintChips(ev.side);
        break;

      case 'ultReady':
        paintUlt(ev.side);
        paintChips(ev.side);
        SFX.play('ultReady');
        announce('✦ Ultime rechargé', 'special');
        setTicker('✦ La jauge ultime de <b>' + esc(battle.fighters[ev.side].name) + '</b> est de nouveau active.');
        await wait(220);
        break;

      case 'ultimateSupport':
        renderHistoryRow(ev.row);
        if (battle.logs.length) pushLog(battle.logs[battle.logs.length - 1]);
        refreshAll();
        await wait(260);
        break;

      case 'shieldBreak':
        SFX.play('block');
        ring(ev.target, true);
        sparks(ev.target, 20, '#ffd447');
        popDamage(ev.target, 'BOUCLIER BRISÉ', 'miss');
        setTicker('💥 Le bouclier de <b>' + esc(battle.fighters[ev.target].name) + '</b> vole en éclats !');
        refreshAll();
        await wait(320);
        break;

      case 'strip':
        SFX.play('buff');
        sparks(ev.target, 14, '#b06cff');
        popDamage(ev.target, 'DISSIPÉ', 'miss');
        setTicker('🌀 ' + ev.count + ' effet(s) dissipé(s) sur <b>' + esc(battle.fighters[ev.target].name) + '</b>.');
        refreshAll();
        await wait(300);
        break;

      case 'recoil':
        state.display[ev.side] = Math.max(0, state.display[ev.side] - ev.amount);
        paintHp(ev.side);
        popDamage(ev.side, '-' + ev.amount, 'recoil');
        restartAnim($('#fighter-' + ev.side), 'is-hit');
        SFX.play('hit');
        setTicker('🔥 Surchauffe : <b>' + esc(battle.fighters[ev.side].name) + '</b> perd ' + ev.amount + ' PV.');
        await wait(300);
        break;

      case 'defend':
        restartAnim($('#fighter-' + ev.side), 'is-defending');
        SFX.play('block');
        if (ev.regen) {
          state.display[ev.side] = Math.min(battle.fighters[ev.side].maxHp, state.display[ev.side] + ev.regen);
          popDamage(ev.side, '+' + ev.regen, 'heal');
          paintHp(ev.side);
        }
        setTicker('🛡️ <b>' + esc(battle.fighters[ev.side].name) + '</b> se met en garde.');
        {
          const row = nextHistoryRow(ev.side);
          if (row) renderHistoryRow(row);
        }
        if (battle.logs.length) pushLog(battle.logs[battle.logs.length - 1]);
        await wait(420);
        break;

      case 'heal':
        state.display[ev.side] = Math.min(battle.fighters[ev.side].maxHp, state.display[ev.side] + ev.amount);
        paintHp(ev.side);
        popDamage(ev.side, '+' + ev.amount, 'heal');
        restartAnim($('#fighter-' + ev.side), 'is-healing');
        SFX.play('heal');
        {
          const row = nextHistoryRow(ev.side);
          if (row) renderHistoryRow(row);
          if (battle.logs.length) pushLog(battle.logs[battle.logs.length - 1]);
        }
        setTicker('💚 <b>' + esc(battle.fighters[ev.side].name) + '</b> récupère ' + ev.amount + ' PV.');
        await wait(420);
        break;

      case 'buff':
      case 'shield':
      case 'critReady':
        SFX.play('buff');
        sparks(ev.side, 14, '#b06cff');
        refreshAll();
        await wait(300);
        break;

      case 'stunApplied':
        SFX.play('stun');
        popDamage(ev.target, 'ÉTOURDI', 'miss');
        restartAnim($('#fighter-' + ev.target), 'is-hit');
        {
          const row = nextHistoryRow(ev.side);
          if (row) renderHistoryRow(row);
          if (battle.logs.length) pushLog(battle.logs[battle.logs.length - 1]);
        }
        refreshAll();
        await wait(340);
        break;

      case 'stunned':
        SFX.play('stun');
        popDamage(ev.side, 'ÉTOURDI', 'miss');
        setTicker('💫 <b>' + esc(battle.fighters[ev.side].name) + '</b> est étourdi et perd son tour.');
        {
          const row = nextHistoryRow(ev.side);
          if (row) renderHistoryRow(row);
          if (battle.logs.length) pushLog(battle.logs[battle.logs.length - 1]);
        }
        refreshAll();
        await wait(520);
        break;

      case 'buffEnd':
      case 'critEnd':
      case 'shieldEnd':
        refreshAll();
        break;

      case 'energy':
        paintEnergy(ev.side);
        break;

      case 'ko': {
        const loser = $('#fighter-' + ev.side);
        const winnerSide = ev.side === 'left' ? 'right' : 'left';
        state.display[ev.side] = 0;
        paintHp(ev.side);
        $('#arena').classList.add('is-slowmo');
        loser.classList.add('is-ko');
        $('#fighter-' + winnerSide).classList.add('is-winner');
        const ko = $('#ko-overlay');
        ko.classList.add('is-open');
        SFX.play('ko');
        flashArena();
        shakeArena();
        quakeScreen(true);
        sparks(ev.side, 34, '#ff6b6b');
        setTicker('☠️ <b>' + esc(battle.fighters[ev.side].name) + '</b> est K.O. !', 'ko');
        if (battle.logs.length) pushLog(battle.logs[battle.logs.length - 1]);
        await wait(1500);
        ko.classList.remove('is-open');
        $('#arena').classList.remove('is-slowmo');
        break;
      }

      case 'end':
        break;

      default:
        break;
    }
  }

  /* ------------------------- Fin de combat ------------------------- */
  async function finishBattle() {
    const battle = state.battle;
    refreshAll();
    updateActions();

    const winner = battle.winner;
    const playerWon = !!winner && winner.side === 'left';
    const isAuto = state.mode === 'auto';

    meta.crits += battle.stats.crits;
    meta.specials += battle.stats.specials;
    meta.ultimates += battle.stats.ultimates;
    meta.bestDamage = Math.max(meta.bestDamage, battle.stats.maxDamage);
    if (!isAuto) {
      if (playerWon) {
        meta.wins++;
        meta.streak++;
        meta.bestStreak = Math.max(meta.bestStreak, meta.streak);
      } else {
        meta.losses++;
        meta.streak = 0;
      }
    }
    meta.duels.unshift({
      player: battle.a.name, foe: battle.b.name,
      winner: winner ? winner.name : 'égalité',
      rounds: battle.round, mode: state.mode, at: Date.now()
    });
    meta.duels = meta.duels.slice(0, 12);
    saveMeta();

    if (playerWon) { SFX.play('win'); confetti(70); }
    else if (!isAuto) SFX.play('lose');

    // Panneau de résultat
    const badge = $('#result-badge');
    const title = $('#result-title');
    const byPoints = battle.endReason === 'timeout';
    title.classList.remove('is-win', 'is-loss');
    if (isAuto) {
      badge.textContent = '🎬';
      title.textContent = winner ? winner.name + ' l’emporte' : 'Égalité';
    } else if (playerWon) {
      badge.textContent = '🏆';
      title.textContent = byPoints ? 'VICTOIRE AUX POINTS' : 'VICTOIRE';
      title.classList.add('is-win');
    } else {
      badge.textContent = '💀';
      title.textContent = byPoints ? 'DÉFAITE AUX POINTS' : 'K.O. — DÉFAITE';
      title.classList.add('is-loss');
    }
    $('#result-sub').textContent = winner
      ? winner.name + ' remporte le combat ' + (byPoints ? 'aux points' : 'par K.O.') +
        ' après ' + battle.round + ' round' + (battle.round > 1 ? 's' : '') + '.'
      : 'Les deux marques sont à égalité aux points.';

    $('#result-stats').innerHTML =
      '<div><dt>Rounds</dt><dd>' + battle.round + '</dd></div>' +
      '<div><dt>Critiques</dt><dd>' + battle.stats.crits + '</dd></div>' +
      '<div><dt>Esquives</dt><dd>' + battle.stats.dodges + '</dd></div>' +
      '<div><dt>Spéciaux</dt><dd>' + battle.stats.specials + '</dd></div>' +
      '<div><dt>Ultimes</dt><dd>' + battle.stats.ultimates + '</dd></div>' +
      '<div><dt>Dégâts totaux</dt><dd>' + (battle.stats.damage.left + battle.stats.damage.right) + '</dd></div>' +
      '<div><dt>Meilleur coup</dt><dd>' + battle.stats.maxDamage + '</dd></div>';

    // Actions proposées
    const actions = $('#result-actions');
    actions.innerHTML = '';
    const mk = function (label, cls, fn) {
      const b = document.createElement('button');
      b.className = 'btn ' + cls;
      b.textContent = label;
      b.addEventListener('click', function () { SFX.play('click'); fn(); });
      actions.appendChild(b);
    };

    if (state.mode === 'tournament') {
      if (playerWon) {
        state.tournament.index++;
        state.tournament.wins++;
        if (state.tournament.index < state.tournament.order.length) {
          mk('Combat suivant →', 'btn--primary', function () {
            closeResult();
            startBattle(state.playerBrandId, state.tournament.order[state.tournament.index].id);
          });
        } else {
          badge.textContent = '👑';
          title.textContent = 'CHAMPION !';
          $('#result-sub').textContent = state.playerBrandId
            ? Data.getBrand(state.playerBrandId).name + ' a battu les 10 autres marques.'
            : 'Parcours parfait.';
          mk('Voir le palmarès', 'btn--primary', function () { closeResult(); goto('stats'); });
          mk('Nouveau tournoi', 'btn--ghost', function () { closeResult(); state.picking = 'player'; goto('select'); });
        }
      } else {
        mk('Retenter ce combat', 'btn--primary', function () {
          closeResult();
          startBattle(state.playerBrandId, state.tournament.order[state.tournament.index].id);
        });
        mk('Recommencer le tournoi', 'btn--ghost', function () { closeResult(); state.picking = 'player'; goto('select'); });
      }
      mk('Menu', 'btn--ghost', function () { closeResult(); goto('menu'); });
    } else {
      mk('Revanche', 'btn--primary', function () { closeResult(); startBattle(state.playerBrandId, state.foeBrandId); });
      mk('Changer de marque', 'btn--ghost', function () { closeResult(); state.picking = 'player'; goto('select'); });
      mk('Menu', 'btn--ghost', function () { closeResult(); goto('menu'); });
    }

    $('#result-overlay').classList.add('is-open');
    $('#result-overlay').setAttribute('aria-hidden', 'false');
  }

  function closeResult() {
    $('#result-overlay').classList.remove('is-open');
    $('#result-overlay').setAttribute('aria-hidden', 'true');
  }

  /* ------------------------- IA & actions joueur ------------------------- */
  function maybeAiTurn(delay) {
    if (!state.battle || !state.battle.active) return;
    if (isPlayerTurn()) return;
    setTimeout(function () {
      if (!state.battle || !state.battle.active || state.busy) return;
      if (isPlayerTurn()) return;
      const actor = Engine.currentActor(state.battle);
      if (!actor) return;
      const action = Engine.aiChoose(state.battle, actor);
      playEvents(Engine.act(state.battle, action));
    }, (delay || 600) / state.speed);
  }

  function playerAction(action) {
    if (!isPlayerTurn() || state.busy) return;
    SFX.resume();
    playEvents(Engine.act(state.battle, action));
  }

  /* ------------------------- Palmarès ------------------------- */
  function renderStats() {
    const total = meta.wins + meta.losses;
    const rate = total ? Math.round(meta.wins / total * 100) : 0;
    $('#stat-grid').innerHTML = [
      ['🏆', meta.wins, 'Victoires'],
      ['💀', meta.losses, 'Défaites'],
      ['📈', rate + ' %', 'Réussite'],
      ['🔥', meta.bestStreak, 'Meilleure série'],
      ['💥', meta.crits, 'Coups critiques'],
      ['⚡', meta.specials, 'Pouvoirs lancés'],
      ['✦', meta.ultimates, 'Ultimes lancés'],
      ['🎯', meta.bestDamage, 'Meilleur coup']
    ].map(function (s) {
      return '<div class="stat-card"><b>' + s[1] + '</b><span>' + s[0] + ' ' + s[2] + '</span></div>';
    }).join('');

    const list = $('#duel-list');
    if (!meta.duels.length) {
      list.innerHTML = '<li class="empty-note">Aucun combat enregistré pour l’instant.</li>';
      return;
    }
    list.innerHTML = meta.duels.map(function (d) {
      const won = d.winner === d.player;
      return '<li><span class="' + (won ? 'win' : 'loss') + '">' + (won ? 'V' : 'D') + '</span>' +
        '<span>' + esc(d.player) + ' vs ' + esc(d.foe) + '</span>' +
        '<small>' + esc(d.winner) + ' · ' + d.rounds + 'R</small></li>';
    }).join('');
  }

  /* ------------------------- Événements UI ------------------------- */
  function bindUi() {
    document.querySelectorAll('[data-goto]').forEach(function (btn) {
      btn.addEventListener('click', function () { SFX.resume(); SFX.play('click'); goto(btn.dataset.goto); });
    });
    document.querySelectorAll('[data-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () { SFX.resume(); SFX.play('click'); startMode(btn.dataset.mode); });
    });

    $('#brand-grid').addEventListener('click', function (e) {
      const card = e.target.closest('.bcard');
      if (card && !card.disabled) pickBrand(card.dataset.brand);
    });
    $('#btn-random-foe').addEventListener('click', randomFoe);

    $('#btn-attack').addEventListener('click', function () { playerAction('attack'); });
    $('#btn-defend').addEventListener('click', function () { playerAction('defend'); });
    $('#btn-special').addEventListener('click', function () { playerAction('special'); });
    $('#btn-ultimate').addEventListener('click', function () { playerAction('ultimate'); });

    $('#btn-speed').addEventListener('click', function () {
      state.speed = state.speed === 1 ? 2 : (state.speed === 2 ? 3 : 1);
      this.textContent = '⏩ ×' + state.speed;
      document.documentElement.style.setProperty('--speed', String(state.speed));
      SFX.play('click');
    });

    $('#btn-auto').addEventListener('click', function () {
      state.auto = !state.auto;
      this.textContent = '🤖 Auto : ' + (state.auto ? 'on' : 'off');
      this.classList.toggle('is-off', !state.auto);
      SFX.play('click');
      updateActions();
      maybeAiTurn(300);
    });

    $('#btn-sound').addEventListener('click', function () {
      const on = SFX.toggle();
      this.textContent = on ? '🔊 Son' : '🔇 Muet';
      this.classList.toggle('is-off', !on);
      if (on) SFX.play('click');
    });

    $('#btn-clear-history').addEventListener('click', function () {
      const list = $('#history-list');
      list.innerHTML = '<p class="history__empty">Liste vidée.</p>';
      list.className = 'history__list' + (state.historyFilter === 'all' ? '' : ' is-filter-' + state.historyFilter);
      $('#history-count').textContent = '0 action';
      $('#history-recap').innerHTML = '';
    });

    // Filtres de l'historique
    $('#history-filters').addEventListener('click', function (e) {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      SFX.play('click');
      setHistoryFilter(chip.dataset.filter);
    });

    // Clic sur une ligne : déplie le détail de l'action
    $('#history-list').addEventListener('click', function (e) {
      const row = e.target.closest('.hrow');
      if (!row) return;
      row.classList.toggle('is-open');
    });

    $('#btn-reset-stats').addEventListener('click', function () {
      meta = { wins: 0, losses: 0, crits: 0, specials: 0, ultimates: 0, bestDamage: 0, streak: 0, bestStreak: 0, duels: [] };
      saveMeta();
      renderStats();
    });

    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'a') playerAction('attack');
      else if (k === 'd') playerAction('defend');
      else if (k === 's') playerAction('special');
      else if (k === 'u') playerAction('ultimate');
      else if (k === 'm') $('#btn-sound').click();
      else if (e.code === 'Space') {
        e.preventDefault();
        if ($('#result-overlay').classList.contains('is-open')) {
          const first = $('#result-actions .btn');
          if (first) first.click();
        }
      }
    });
  }

  /* ------------------------- Boot ------------------------- */
  document.addEventListener('DOMContentLoaded', function () {
    document.documentElement.style.setProperty('--speed', '1');
    renderMenuRoster();
    bindUi();
    $('#btn-auto').classList.add('is-off');
  });
})();
