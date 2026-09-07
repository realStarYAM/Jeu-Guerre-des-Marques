/* ============================================================
   GUERRE DES MARQUES — Interface, animations et enchaînement
   ============================================================ */
(function () {
  'use strict';

  const Engine = window.BattleEngine;
  const Data = window.BRANDS_DATA;
  const Progress = window.Progress;
  const Bosses = window.BOSSES_DATA;

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
    historyFilter: 'all',    // all | ult | crit | heal
    cinematics: true,        // cinématiques d'ultime longues (bouton 🎬)
    rewardToken: 0,          // évite d'afficher des récompenses périmées
    bossDifficulty: 'normal',// difficulté du Boss Rush
    bossRun: null            // { difficulty, order, index, startTs, damage, brand, cleared[] }
  };

  const META_KEY = 'guerreDesMarques.meta.v1';
  const PREFS_KEY = 'guerreDesMarques.prefs.v1';
  let meta = loadMeta();

  /* Préférences d'interface (indépendantes des statistiques de jeu) */
  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p.cinematics === 'boolean') state.cinematics = p.cinematics;
      }
    } catch (e) { /* stockage indisponible */ }
  }
  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ cinematics: state.cinematics })); } catch (e) { /* ignore */ }
  }

  function loadMeta() {
    let data = null;
    try {
      const raw = localStorage.getItem(META_KEY);
      if (raw) data = JSON.parse(raw);
    } catch (e) { /* stockage indisponible */ }
    if (!data || typeof data !== 'object') {
      data = { wins: 0, losses: 0, crits: 0, specials: 0, ultimates: 0, bestDamage: 0, streak: 0, bestStreak: 0, duels: [] };
    }
    return Progress.hydrate(data);      // complète les anciennes sauvegardes
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
    state.rewardToken++;          // annule un écran de récompenses en attente
    closeRewards();
    state.screen = screen;
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('is-active'); });
    const el = $('#screen-' + screen);
    if (el) el.classList.add('is-active');
    if (screen !== 'arena') SFX.stopBossMusic();
    if (screen === 'select') renderBrandGrid();
    if (screen === 'stats') renderStats();
    if (screen === 'profil') renderProfil();
    if (screen === 'menu') renderMenuProgress();
    if (screen === 'bossrush') renderBossRush();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ------------------------- Menu ------------------------- */
  function renderMenuRoster() {
    $('#menu-roster').innerHTML = Data.BRANDS.map(function (b) {
      return '<span class="roster-chip" title="' + esc(b.name) + ' — ' + esc(b.cat) +
        '" style="background:linear-gradient(135deg,' + b.colors[0] + ',' + b.colors[1] + ')">' +
        esc(b.mono) + '</span>';
    }).join('');
    renderMenuProgress();
  }

  /* Bandeau de progression de l'accueil : rang, niveau global et barre d'XP */
  function renderMenuProgress() {
    const strip = $('#menu-progress');
    if (!strip) return;
    const lv = Progress.levelFromXp(meta.playerXp || 0);
    const rank = Progress.rankFromLevel(lv.level);
    const earned = Progress.trophiesOf(meta).filter(function (t) { return t.earned; }).length;

    strip.style.setProperty('--rank-color', rank.rank.color);
    $('#menu-rank-icon').textContent = rank.rank.icon;
    $('#menu-rank-name').textContent = rank.rank.name;
    $('#menu-level').innerHTML = 'Nv <b>' + lv.level + '</b>';
    const fill = $('#menu-xp-fill');
    fill.style.width = '0%';
    setTimeout(function () { fill.style.width = (lv.maxed ? 100 : lv.pct) + '%'; }, 140);
    const bossDone = Bosses.bossCount(bossSave());
    $('#menu-progress-hint').textContent = (meta.battles || 0)
      ? (meta.battles + ' combat' + (meta.battles > 1 ? 's' : '') + ' · ' + (meta.playerXp || 0) + ' PX · ' +
         earned + ' trophée' + (earned > 1 ? 's' : '') + ' · 👑 ' + bossDone + ' boss' +
         (rank.next ? ' · prochain rang : ' + rank.next.name : ''))
      : 'Aucun combat disputé — lancez un duel !';
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

  /* ------------------------- Boss Rush : écran ------------------------- */

  function bossSave() { return Progress.bossSave(meta); }

  function renderBossRush() {
    const save = bossSave();
    const diff = Bosses.getDifficulty(state.bossDifficulty);

    // Sélecteur de difficulté
    $('#diff-picker').innerHTML = Bosses.DIFFICULTIES.map(function (d) {
      return '<button class="diff' + (d.id === state.bossDifficulty ? ' is-on' : '') +
        '" data-diff="' + d.id + '" style="--diff-color:' + d.color + '">' +
        '<span class="diff__top"><span class="diff__icon">' + d.icon + '</span>' + esc(d.name) + '</span>' +
        '<span class="diff__desc">' + esc(d.desc) + '</span>' +
        '<span class="diff__xp">×' + d.xp + ' XP et récompenses</span>' +
        '</button>';
    }).join('');

    // Statistiques du joueur
    const cleared = Bosses.bossCount(save);
    const bestTime = save.bestTime ? formatTime(save.bestTime) : '—';
    const bestBrand = save.bestBrand && Data.getBrand(save.bestBrand) ? Data.getBrand(save.bestBrand).name : '—';
    const bestDiff = save.bestDifficulty ? Bosses.getDifficulty(save.bestDifficulty).name : '—';
    $('#bossrush-count').textContent = cleared + ' / ' + Bosses.MAIN_BOSSES.length +
      (save.cleared.nullsector ? ' + 🕳️' : '');
    $('#bossrush-stats').innerHTML = [
      ['☠️', cleared, 'Boss vaincus'],
      ['⏱️', bestTime, 'Meilleur temps', bestDiff],
      ['💥', save.bestDamage || 0, 'Dégâts infligés (record)'],
      ['⭐', bestBrand, 'Marque du record'],
      ['🏁', save.runs || 0, 'Boss Rush lancés'],
      ['🏆', save.wins || 0, 'Boss Rush terminés'],
      ['🎖️', save.titles.length, 'Titres obtenus'],
      ['🎨', save.skins.length, 'Skins exclusifs'],
      ['🏅', save.badges.length, 'Badges de boss', save.badges.length
        ? Bosses.BOSSES.filter(function (b) { return save.cleared[b.id]; })
          .map(function (b) { return b.icon; }).join(' ')
        : 'aucun']
    ].map(function (c) {
      return '<div class="stat-card"><b>' + esc(c[1]) + '</b><span>' + c[0] + ' ' + esc(c[2]) + '</span>' +
        (c[3] ? '<small>' + esc(c[3]) + '</small>' : '') + '</div>';
    }).join('');

    // Les boss
    $('#boss-grid').innerHTML = Bosses.BOSSES.map(function (b) {
      const done = !!save.cleared[b.id];
      const locked = b.secret && !Bosses.allMainCleared(save.cleared);
      const tag = b.secret ? '<span class="bcard-boss__tag is-secret">Boss secret</span>'
        : (done ? '<span class="bcard-boss__tag is-done">✔ Vaincu</span>' : '');
      const name = locked ? '??? ?????' : b.name;
      const icon = locked ? '🔒' : b.icon;
      return '<article class="bcard-boss' + (done ? ' is-done' : '') + (locked ? ' is-locked' : '') +
        (b.secret && !locked ? ' is-secret' : '') +
        '" style="--boss-c1:' + b.colors[0] + ';--boss-c2:' + b.colors[1] + ';--boss-accent:' + b.accent + '">' +
        tag +
        '<div class="bcard-boss__head">' +
          '<span class="bcard-boss__icon">' + icon + '</span>' +
          '<span><h4 class="bcard-boss__name">' + esc(locked ? 'BOSS SECRET' : name) + '</h4>' +
          '<p class="bcard-boss__cat">' + esc(locked ? 'Vainquez les 5 boss' : b.cat) + '</p></span>' +
        '</div>' +
        '<span class="bcard-boss__pv">❤️ ' + (locked ? '????' : b.stats.pv) + ' PV · ⚔️ ' +
          (locked ? '??' : b.stats.attaque) + ' · 🛡️ ' + (locked ? '??' : b.stats.defense) +
          ' · 💨 ' + (locked ? '??' : b.stats.vitesse) + '</span>' +
        '<span class="bcard-boss__power"><strong>' + esc(locked ? 'Pouvoir inconnu' : b.power) + '</strong>' +
          '<span> — ' + esc(locked ? 'Le vide garde ses secrets.' : b.powerDesc) + '</span></span>' +
        '<div class="bcard-boss__reward">' +
          '<span>✦ ' + (locked ? '?' : b.ultimate.name) + '</span>' +
          '<span>🏅 ' + (locked ? '?' : b.reward.title) + '</span>' +
          '<span>🎨 ' + (locked ? '?' : Bosses.BOSS_SKINS.filter(function (x) { return x.boss === b.id; })[0].name) + '</span>' +
        '</div>' +
        '</article>';
    }).join('');

    // Trophées exclusifs
    const trophies = Bosses.BOSS_TROPHIES;
    const earned = trophies.filter(function (t) { return save.trophies.indexOf(t.id) !== -1; }).length;
    $('#boss-trophy-count').textContent = earned + ' / ' + trophies.length;
    $('#boss-trophy-grid').innerHTML = trophies.map(function (t) {
      const has = save.trophies.indexOf(t.id) !== -1;
      return '<div class="trophy' + (has ? ' is-earned' : '') + '" title="' + esc(t.desc) + '">' +
        '<span class="trophy__icon">' + t.icon + '</span>' +
        '<span><span class="trophy__name">' + esc(t.name) + '</span>' +
        '<span class="trophy__desc">' + esc(t.desc) + '</span></span></div>';
    }).join('');
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(total / 60);
    const sec = total % 60;
    return m + ' min ' + String(sec).padStart(2, '0') + ' s';
  }

  function startBossRush() {
    SFX.play('click');
    state.mode = 'boss';
    state.picking = 'player';
    state.tournament = null;
    state.bossRun = null;
    goto('select');
  }

  /* Le joueur a choisi sa marque : on construit la suite des boss */
  function beginBossRun(playerId) {
    const save = bossSave();
    const diff = Bosses.getDifficulty(state.bossDifficulty);
    const order = Bosses.rushOrder(save.cleared, true);
    state.bossRun = {
      difficulty: diff.id,
      order: order,
      index: 0,
      startTs: Date.now(),
      damage: 0,
      brand: playerId,
      cleared: []
    };
    startBossBattle(order[0]);
  }

  /* ------------------------- Sélection ------------------------- */
  function renderBrandGrid() {
    const isPlayerStep = state.picking === 'player';
    $('#select-title').textContent = isPlayerStep ? 'Choisissez votre marque' : 'Choisissez votre adversaire';
    $('#select-sub').textContent = isPlayerStep
      ? (state.mode === 'tournament'
        ? 'Vous affronterez les 10 autres marques, de la plus abordable à la plus redoutable.'
        : (state.mode === 'boss'
          ? 'Elle entrera en surrégime pour affronter la série de boss. Difficulté : ' +
            Bosses.getDifficulty(state.bossDifficulty).name + '.'
          : 'Elle occupera le coin gauche de l’arène.'))
      : 'Elle occupera le coin droit de l’arène.';
    $('#select-title').textContent = isPlayerStep
      ? (state.mode === 'boss' ? 'Choisissez votre marque — Boss Rush' : 'Choisissez votre marque')
      : 'Choisissez votre adversaire';
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
      if (state.mode === 'boss') {
        beginBossRun(id);
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
    state.rewardToken++;          // annule un écran de récompenses en attente
    closeRewards();
    const lvlA = Progress.brandState(meta, playerId).level;
    const lvlB = Progress.brandState(meta, foeId).level;
    const battle = Engine.createBattle(playerId, foeId, {
      mode: state.mode,
      left: { level: lvlA },
      right: { level: lvlB }
    });
    state.battle = battle;
    state.display.left = battle.a.hp;
    state.display.right = battle.b.hp;
    state.shownRows = new Set();

    $('#hud-mode').textContent = state.mode === 'tournament'
      ? 'Tournoi — combat ' + (state.tournament.index + 1) + '/' + state.tournament.order.length
      : (state.mode === 'auto' ? 'Combat auto' : 'Duel');

    // Visuel des combattants
    paintFighters(battle);
    resetArenaPanels();

    $('#special-name').textContent = battle.a.brand.special.name;
    $('#special-cost').textContent = battle.a.brand.special.cost;
    $('#ultimate-name').textContent = battle.a.brand.ultimate.name;
    $('#ultimate-cost').textContent = Engine.CFG.ULT_MAX;
    $('#bossbar').hidden = true;
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

  /* ------------------------- Boss Rush : combat ------------------------- */

  function startBossBattle(boss) {
    if (!boss) return;
    state.rewardToken++;
    closeRewards();
    const run = state.bossRun;
    const diff = Bosses.getDifficulty(run.difficulty);
    const brandLevel = Progress.brandState(meta, run.brand).level;

    const battle = Engine.createBattle(run.brand, boss, {
      mode: 'boss',
      left: { level: brandLevel, statMult: Bosses.playerBoost(diff, boss) },
      right: { statMult: diff.boss }
    });
    state.battle = battle;
    state.display.left = battle.a.hp;
    state.display.right = battle.b.hp;
    state.shownRows = new Set();
    state.foeBrandId = boss.id;

    $('#hud-mode').textContent = 'Boss Rush — ' + diff.name + ' · boss ' +
      (run.index + 1) + '/' + run.order.length;

    paintFighters(battle, { boss: true });
    resetArenaPanels();

    $('#special-name').textContent = battle.a.brand.special.name;
    $('#special-cost').textContent = battle.a.brand.special.cost;
    $('#ultimate-name').textContent = battle.a.brand.ultimate.name;
    $('#ultimate-cost').textContent = Engine.CFG.ULT_MAX;
    renderBracket();
    showBossBar(boss, diff);
    refreshAll();
    goto('arena');

    (async function () {
      state.busy = true;
      updateActions();
      await playBossIntro(boss, diff);
      SFX.startBossMusic(boss.music);
      await announce('ROUND 1', 'round');
      SFX.play('round');
      await announce('FIGHT !', 'fight');
      state.busy = false;
      updateActions();
      maybeAiTurn(700);
    })();
  }

  /* Peint les deux cartes de combattant (commun à tous les modes) */
  function paintFighters(battle, opts) {
    const isBoss = !!(opts && opts.boss);
    ['left', 'right'].forEach(function (side) {
      const f = battle.fighters[side];
      const b = f.brand;
      const card = $('#fighter-' + side);
      card.classList.remove('is-boss');
      clearClass(card, 'is-');        // avant tout : sinon « is-boss » serait effacé
      card.style.setProperty('--card-accent', b.accent);
      card.style.setProperty('--card-glow', b.glow);

      Progress.SKINS.forEach(function (sk) { card.classList.remove(sk.css); });
      Progress.BOSS_SKINS.forEach(function (sk) { card.classList.remove(sk.css); });

      if (!f.boss) {
        const bState = Progress.brandState(meta, b.id);
        card.classList.add(Progress.skinById(bState.skin).css);
      } else {
        card.classList.add('is-boss');
        card.style.setProperty('--boss-accent', b.accent);
        card.style.setProperty('--boss-glow', b.glow);
        card.style.setProperty('--boss-c1', b.colors[0]);
        card.style.setProperty('--boss-c2', b.colors[1]);
      }

      const oldTag = card.querySelector('.skin-tag');
      if (oldTag) oldTag.remove();
      if (!f.boss && Progress.isBossSkin(Progress.brandState(meta, b.id).skin)) {
        const tag = document.createElement('span');
        tag.className = 'skin-tag';
        tag.textContent = Progress.skinById(Progress.brandState(meta, b.id).skin).name;
        card.appendChild(tag);
      }

      const lvlBox = $('#lvl-' + side);
      if (lvlBox) {
        if (f.boss) {
          const phases = (f.baseBrand.phases || []).length + 1;
          lvlBox.innerHTML =
            '<span class="lvl">Phase <b id="phase-now-' + side + '">' + (f.phase + 1) + '</b>/' + phases + '</span>' +
            '<span class="rarity rarity--mythique">' + b.icon + ' BOSS</span>';
        } else {
          const rarity = Progress.rarityOf(b.id);
          lvlBox.innerHTML =
            '<span class="lvl">Nv <b>' + f.level + '</b></span>' +
            '<span class="rarity rarity--' + rarity.id + '">' + rarity.icon + ' ' + rarity.name + '</span>' +
            (isBoss ? '<span class="rarity rarity--legendaire">⚡ Surrégime</span>' : '');
        }
      }

      $('#badge-' + side).textContent = b.mono;
      $('#badge-' + side).style.background = 'linear-gradient(135deg,' + b.colors[0] + ',' + b.colors[1] + ')';
      const avatar = $('#avatar-' + side);
      avatar.textContent = b.mono;
      avatar.style.background = 'linear-gradient(135deg,' + b.colors[0] + ',' + b.colors[1] + ')';
      $('#name-' + side).textContent = b.name;
      $('#cat-' + side).textContent = b.cat;
      $('#hp-max-' + side).textContent = f.maxHp;
      $('#energy-mark-' + side).style.left = (b.special.cost / Engine.CFG.ENERGY_MAX * 100) + '%';
      $('#fx-' + side).innerHTML = '';
    });
  }

  function resetArenaPanels() {
    $('#history-list').className = 'history__list';
    $('#history-list').innerHTML = '<p class="history__empty">Aucune attaque pour l’instant.</p>';
    $('#history-count').textContent = '0 action';
    $('#history-recap').innerHTML = '';
    setHistoryFilter('all');
    $('#log-list').innerHTML = '';
    $('#ticker').textContent = 'Le combat commence…';
    $('#ticker').className = 'ticker';
    $('#announce').innerHTML = '';
    $('#ko-overlay').classList.remove('is-open');
    $('#cine').classList.remove('is-open');
    $('#cine').setAttribute('aria-hidden', 'true');
    $('#cine-fx').innerHTML = '';
    document.body.classList.remove('is-ult-focus');
    closeResult();
  }

  /* Barre de PV spéciale du boss, avec repères de phase */
  function showBossBar(boss, diff) {
    const bar = $('#bossbar');
    bar.hidden = false;
    bar.style.setProperty('--boss-accent', boss.accent);
    bar.style.setProperty('--boss-glow', boss.glow);
    bar.style.setProperty('--boss-c1', boss.colors[0]);
    bar.style.setProperty('--boss-c2', boss.colors[1]);
    $('#bossbar-icon').textContent = boss.icon;
    $('#bossbar-name').textContent = boss.name;
    $('#bossbar-power').textContent = '☠️ ' + boss.power + ' — ' + boss.powerDesc +
      '  ·  difficulté ' + diff.name;
    const phases = boss.phases || [];
    $('#bossbar-marks').innerHTML = phases.map(function (p) {
      return '<i class="bossbar__mark" style="left:' + (p.at * 100).toFixed(1) + '%" title="' +
        esc(p.label || 'Phase') + '"></i>';
    }).join('');
  }

  function paintBossBar() {
    const bar = $('#bossbar');
    if (!bar || bar.hidden || !state.battle) return;
    const f = state.battle.fighters.right;
    if (!f.boss) return;
    const pct = Math.max(0, Math.min(100, (state.display.right / f.maxHp) * 100));
    $('#bossbar-fill').style.width = pct + '%';
    $('#bossbar-ghost').style.width = pct + '%';
    $('#bossbar-now').textContent = Math.max(0, Math.round(state.display.right));
    $('#bossbar-max').textContent = f.maxHp;
    const phases = (f.baseBrand.phases || []).length + 1;
    $('#bossbar-phase').textContent = 'Phase ' + (f.phase + 1) + ' / ' + phases +
      (f.brand.copiedFrom ? ' — copie de ' + f.brand.copiedFrom : '');
    const pn = $('#phase-now-right');
    if (pn) pn.textContent = f.phase + 1;
  }

  /* Cinématique d'introduction du boss */
  function playBossIntro(boss, diff) {
    return new Promise(function (resolve) {
      const box = $('#boss-intro');
      const run = state.bossRun;
      box.style.setProperty('--boss-accent', boss.accent);
      box.style.setProperty('--boss-glow', boss.glow);
      box.style.setProperty('--boss-c1', boss.colors[0]);
      box.style.setProperty('--boss-c2', boss.colors[1]);
      $('#bossintro-kicker').textContent = boss.secret
        ? 'BOSS SECRET'
        : (boss.intro ? boss.intro.kicker : 'BOSS ' + (run.index + 1) + ' / ' + run.order.length);
      $('#bossintro-icon').textContent = boss.icon;
      $('#bossintro-name').textContent = boss.name;
      $('#bossintro-phrase').textContent = boss.intro ? boss.intro.phrase : boss.tagline;
      $('#bossintro-stats').innerHTML = [
        ['PV', boss.stats.pv], ['Attaque', boss.stats.attaque],
        ['Défense', boss.stats.defense], ['Vitesse', boss.stats.vitesse]
      ].map(function (x) {
        return '<span class="bossintro__stat"><span>' + x[0] + '</span>' + x[1] + '</span>';
      }).join('');
      $('#bossintro-power').textContent = '☠️ ' + boss.power + ' — ' + boss.powerDesc +
        '   ·   difficulté ' + diff.name;
      $('#bossintro-go').classList.remove('is-on');

      box.classList.add('is-open');
      box.setAttribute('aria-hidden', 'false');
      SFX.play('bossIntro');

      const life = state.cinematics ? 2600 : 1100;
      setTimeout(function () { $('#bossintro-go').classList.add('is-on'); SFX.play('round'); }, life * 0.72);
      setTimeout(function () {
        box.classList.remove('is-open');
        box.setAttribute('aria-hidden', 'true');
        resolve();
      }, life);
    });
  }

  /* Animation de K.O. du boss */
  function playBossKo() {
    return new Promise(function (resolve) {
      const box = $('#boss-ko');
      const f = state.battle.fighters.right;
      const brand = f.brand;
      box.style.setProperty('--boss-accent', brand.accent);
      $('#bossko-name').textContent = (f.baseBrand.name || brand.name) + ' est hors service';
      const host = $('#bossko-shards');
      host.innerHTML = '';
      for (let i = 0; i < 26; i++) {
        const el = document.createElement('i');
        el.className = 'shard';
        const angle = (Math.PI * 2 * i) / 26 + Math.random() * 0.4;
        const dist = 220 + Math.random() * 420;
        el.style.setProperty('--sx', Math.round(Math.cos(angle) * dist) + 'px');
        el.style.setProperty('--sy', Math.round(Math.sin(angle) * dist) + 'px');
        el.style.setProperty('--sr', Math.round(Math.random() * 720 - 360) + 'deg');
        el.style.animationDelay = (Math.random() * 0.35).toFixed(2) + 's';
        el.style.width = el.style.height = (8 + Math.random() * 16).toFixed(0) + 'px';
        host.appendChild(el);
      }
      SFX.play('bossKo');
      box.classList.remove('is-open');
      void box.offsetWidth;
      box.classList.add('is-open');
      setTimeout(resolve, state.cinematics ? 2400 : 1100);
    });
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
    if (side === 'right') paintBossBar();
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

  function paintCineBtn() {
    const btn = $('#btn-cine');
    if (!btn) return;
    btn.textContent = '🎬 Ciné : ' + (state.cinematics ? 'on' : 'off');
    btn.classList.toggle('is-off', !state.cinematics);
    btn.title = state.cinematics
      ? 'Cinématiques d’ultime longues (cliquer pour raccourcir)'
      : 'Cinématiques d’ultime courtes (cliquer pour les réactiver)';
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
  /* `banner` ajoute le style « slam » des bannières de résultat d'ultime */
  function announce(text, variant, life, banner) {
    return new Promise(function (resolve) {
      const box = $('#announce');
      const el = document.createElement('div');
      el.className = 'announce__text announce__text--' + (variant || 'round') +
        (banner ? ' announce__text--banner' : '');
      el.textContent = text;
      box.appendChild(el);
      const ms = (life || 850) / state.speed;
      setTimeout(function () { el.remove(); resolve(); }, ms);
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

  /* --------- Cinématique d'ultime ---------
     Signature visuelle de chaque marque : type de particules, couleurs et
     ampleur. Le gameplay (dégâts, statistiques) n'est jamais touché ici. */
  const ULT_FX = {
    distort:   { particle: 'shard',  count: 22 },
    storm:     { particle: 'meteor', count: 18 },
    charge:    { particle: 'bolt',   count: 14 },
    harmony:   { particle: 'wave',   count: 6 },
    gemini:    { particle: 'dot',    count: 28 },
    overdrive: { particle: 'tile',   count: 12 },
    rage:      { particle: 'glitch', count: 9 },
    star:      { particle: 'star',   count: 20 },
    fury:      { particle: 'ember',  count: 24 },
    rtx:       { particle: 'ray',    count: 16 },
    core:      { particle: 'hex',    count: 12 },
    /* Boss : signature visuelle de chaque boss */
    megatech:   { particle: 'bolt',   count: 26 },
    overclock:  { particle: 'ember',  count: 30 },
    quantum:    { particle: 'shard',  count: 24 },
    corrupt:    { particle: 'glitch', count: 14 },
    finalbrand: { particle: 'star',   count: 28 },
    nullsector: { particle: 'void',   count: 18 }
  };

  /* Particules projetées aux couleurs de la marque */
  function ultParticles(fxKey, colors) {
    const host = $('#cine-fx');
    host.innerHTML = '';
    const cfg = ULT_FX[fxKey] || ULT_FX.distort;
    for (let i = 0; i < cfg.count; i++) {
      const p = document.createElement('i');
      p.className = 'up up--' + cfg.particle;
      const angle = (Math.PI * 2 * i) / cfg.count + Math.random() * 0.35;
      const dist = 160 + Math.random() * 380;
      p.style.setProperty('--dx', Math.round(Math.cos(angle) * dist) + 'px');
      p.style.setProperty('--dy', Math.round(Math.sin(angle) * dist) + 'px');
      p.style.setProperty('--rot', Math.round(Math.random() * 540 - 270) + 'deg');
      p.style.setProperty('--x', (Math.random() * 100).toFixed(1) + 'vw');
      p.style.setProperty('--y', (Math.random() * 100).toFixed(1) + 'vh');
      p.style.setProperty('--d', (Math.random() * 0.45).toFixed(2) + 's');
      p.style.setProperty('--s', (0.6 + Math.random() * 0.9).toFixed(2));
      if (cfg.particle === 'wave') p.style.color = i % 2 ? colors[0] : (colors[1] || colors[0]);
      p.style.background = i % 3 === 1 ? (colors[1] || colors[0]) : colors[0];
      host.appendChild(p);
    }
  }

  /* Bannière de résultat affichée après les dégâts d'un ultime */
  const RESULT_BANNER = { ko: 'K.O. !', critical: 'CRITICAL !', block: 'BLOCK !', dodge: 'DODGE !' };

  function resultBanner(kind) {
    const text = RESULT_BANNER[kind];
    if (!text) return;
    announce(text, kind, 1250, true);
    if (kind === 'ko') SFX.play('ko');
    else if (kind === 'critical') SFX.play('crit');
    else SFX.play('block');
  }

  async function playCinematic(ev) {
    const long = state.cinematics !== false;
    const cine = $('#cine');
    const f = state.battle.fighters[ev.side];
    const colors = ev.colors || ['#6c8cff', '#b06cff'];

    /* --- Préparation du plan --- */
    cine.style.setProperty('--cine-a', colors[0]);
    cine.style.setProperty('--cine-b', colors[1]);
    cine.style.setProperty('--cine-x', ev.side === 'left' ? '24%' : '76%');
    cine.style.setProperty('--from-x', ev.side === 'left' ? '-32vw' : '32vw');
    cine.dataset.fx = ev.fx || 'distort';
    $('#cine-mono').textContent = f.brand.mono;
    $('#cine-brand').textContent = f.name;
    $('#cine-ult').textContent = ev.name;
    $('#cine-kicker').textContent = 'ULTIMATE !';
    $('#cine-phrase').textContent = ev.phrase || ev.desc || '';
    if (long) ultParticles(ev.fx || 'distort', colors);
    else $('#cine-fx').innerHTML = '';

    /* --- 1. L'arène s'assombrit et se zoome, la marque monte en puissance --- */
    document.body.classList.add('is-ult-focus');
    restartAnim($('#fighter-' + ev.side), 'is-charging');
    setTicker('✦ <b>' + esc(f.name) + '</b> déclenche son ULTIME : « ' + esc(ev.name) + ' » — ' + esc(ev.desc || ''));

    /* --- 2. Zoom sur la marque + ULTIMATE ! + nom du pouvoir --- */
    cine.classList.toggle('is-short', !long);
    cine.classList.remove('is-open');
    void cine.offsetWidth;                      // relance les animations
    cine.classList.add('is-open');
    cine.setAttribute('aria-hidden', 'false');
    SFX.play('ultimate');
    quakeScreen(true);
    sparks(ev.side, long ? 26 : 10, colors[1]);

    /* --- 3. On laisse la cinématique se jouer ; les dégâts sont appliqués
             ensuite, quand `playEvents` traitera l'événement `strike` --- */
    await wait(long ? 1780 : 430);

    cine.classList.remove('is-open');
    cine.setAttribute('aria-hidden', 'true');
    $('#cine-fx').innerHTML = '';
    document.body.classList.remove('is-ult-focus');
    if (!long) announce('ULTIMATE !', 'ult', 700);
    await wait(long ? 220 : 90);
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

      /* --- Boss : transformation de phase --- */
      case 'bossPhase': {
        const card = $('#fighter-' + ev.side);
        SFX.play('bossPhase');
        quakeScreen(true);
        flashArena();
        // nouvelle apparence
        card.style.setProperty('--card-accent', ev.accent);
        card.style.setProperty('--card-glow', ev.glow);
        card.style.setProperty('--boss-accent', ev.accent);
        card.style.setProperty('--boss-glow', ev.glow);
        card.style.setProperty('--boss-c1', ev.colors[0]);
        card.style.setProperty('--boss-c2', ev.colors[1]);
        $('#badge-' + ev.side).textContent = ev.mono;
        $('#badge-' + ev.side).style.background = 'linear-gradient(135deg,' + ev.colors[0] + ',' + ev.colors[1] + ')';
        const avatar = $('#avatar-' + ev.side);
        avatar.textContent = ev.mono;
        avatar.style.background = 'linear-gradient(135deg,' + ev.colors[0] + ',' + ev.colors[1] + ')';
        $('#name-' + ev.side).textContent = ev.name;
        $('#cat-' + ev.side).textContent = ev.copied ? 'Copie : ' + ev.copiedFrom : 'Boss — nouvelle phase';
        restartAnim(card, 'is-phase');
        restartAnim($('#bossbar'), 'is-phase');
        sparks(ev.side, 40, ev.accent);
        ring(ev.side, true);
        if (!$('#bossbar').hidden) {
          $('#bossbar-icon').textContent = ev.mono;
          $('#bossbar-name').textContent = ev.name;
        }
        refreshAll();
        await announce(ev.label, 'boss', 1500, true);
        if (ev.copied) {
          setTicker('🪞 <b>' + esc(ev.name) + '</b> a copié les capacités de ' + esc(ev.copiedFrom) + ' !');
          await announce('COPIE !', 'boss', 1200);
        } else {
          setTicker('☠️ <b>' + esc(ev.name) + '</b> passe en phase ' + (ev.phase + 1) + ' : nouvelles statistiques et nouvelles attaques !');
        }
        await wait(280);
        break;
      }

      /* --- Boss : passif de début de tour --- */
      case 'bossPassive': {
        if (ev.kind === 'rampage') {
          setTicker((ev.icon || '🔥') + ' <b>' + esc(battle.fighters[ev.side].name) + '</b> ' +
            esc(ev.label) + ' — attaque renforcée (' + ev.stacks + ').');
          sparks(ev.side, 10, '#ffd447');
        } else if (ev.kind === 'evade') {
          setTicker((ev.icon || '🌌') + ' <b>' + esc(battle.fighters[ev.side].name) + '</b> ' +
            esc(ev.label) + ' : ses esquives deviennent fréquentes.');
        } else if (ev.kind === 'siphon' && ev.heal > 0) {
          state.display[ev.side] = Math.min(battle.fighters[ev.side].maxHp, state.display[ev.side] + ev.heal);
          popDamage(ev.side, '+' + ev.heal, 'heal');
          paintHp(ev.side);
        } else if (ev.kind === 'mirror') {
          setTicker('🪞 <b>' + esc(battle.fighters[ev.side].name) + '</b> renvoie désormais ' +
            Math.round(ev.reflect * 100) + ' % des dégâts reçus.');
        }
        break;
      }

      /* --- Boss : frappe surchargée --- */
      case 'bossOverload':
        SFX.play('special');
        quakeScreen(false);
        setTicker((ev.icon || '⚡') + ' <b>' + esc(battle.fighters[ev.side].name) + '</b> libère « ' +
          esc(ev.name) + ' » !');
        break;

      case 'strike': {
        const attacker = $('#fighter-' + ev.side);
        const targetSide = ev.target;
        const critAny = ev.hits.some(function (h) { return h.crit; });
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
              // un ultime garde sa bannière de résultat pour la fin de la frappe
              if (!ev.ultimate) announce('CRITIQUE !', 'crit');
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
            if (hit.mirror) {
              state.display[ev.side] = Math.max(0, state.display[ev.side] - hit.mirror);
              popDamage(ev.side, '↩ ' + hit.mirror, 'crit');
              SFX.play('block');
              setTicker('🪞 <b>' + esc(battle.fighters[targetSide].name) + '</b> renvoie ' + hit.mirror + ' dégâts !');
              paintHp(ev.side);
              quakeScreen(false);
            }
            paintHp(targetSide);
            paintHp(ev.side);
          }
          if (ev.hits.length > 1 && i < ev.hits.length - 1) await wait(190);
          else await wait(150);
        }

        if (ev.target === 'right' && !$('#bossbar').hidden && ev.total > 0) {
          restartAnim($('#bossbar'), 'is-hit');
        }
        const row = nextHistoryRow(ev.side);
        if (row) renderHistoryRow(row);
        if (battle.logs.length) pushLog(battle.logs[battle.logs.length - 1]);
        refreshAll();

        // Bannière de résultat d'un ultime (les dégâts sont déjà appliqués)
        if (ev.ultimate) {
          if (ev.ko) resultBanner('ko');
          else if (ev.allBlocked) resultBanner('block');
          else if (ev.allDodged) resultBanner('dodge');
          else if (critAny) resultBanner('critical');
          await wait(260);
        }
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

    meta.duels.unshift({
      player: battle.a.name, foe: battle.b.name,
      winner: winner ? winner.name : 'égalité',
      rounds: battle.round, mode: state.mode, at: Date.now()
    });
    meta.duels = meta.duels.slice(0, 12);

    // Progression : XP, niveaux, skins, badges, trophées et rang
    const champion = state.mode === 'tournament' && playerWon && !!state.tournament &&
      state.tournament.index + 1 >= state.tournament.order.length;
    const reward = grantRewards(battle, champion);

    // Boss Rush : récompenses exclusives (XP, badge, skin, titre, trophées)
    let bossLoot = null;
    if (state.mode === 'boss' && state.bossRun) {
      const run = state.bossRun;
      const boss = run.order[run.index];
      const dealt = battle.stats.damage.left || 0;
      run.damage += dealt;
      bossLoot = Progress.grantBossRewards(meta, {
        bossId: boss.id, difficulty: run.difficulty, won: playerWon,
        damage: dealt, brand: run.brand
      });
      if (bossLoot.xp > 0) {
        meta.playerXp = (meta.playerXp || 0) + bossLoot.xp;
        reward.xp += bossLoot.xp;
        reward.xpParts = reward.xpParts.concat(bossLoot.xpParts);
      }
      if (playerWon) run.cleared.push(boss.id);
    }
    if (bossLoot) {
      if (bossLoot.skin) reward.newSkins.push(bossLoot.skin);
      if (bossLoot.title) reward.newBadges.push({
        id: bossLoot.title.id, name: bossLoot.title.name,
        icon: bossLoot.title.icon, brandName: 'Titre de profil'
      });
      if (bossLoot.badge) reward.newBadges.push({
        id: bossLoot.badge.id, name: bossLoot.badge.name,
        icon: bossLoot.badge.icon, brandName: 'Badge de boss'
      });
      reward.newTrophies = reward.newTrophies.concat(bossLoot.trophies || []);
    }
    saveMeta();
    SFX.stopBossMusic();

    // K.O. du boss : cinématique dédiée
    if (state.mode === 'boss' && playerWon && state.bossRun) {
      $('#ko-overlay').classList.remove('is-open');
      await playBossKo();
      $('#boss-ko').classList.remove('is-open');
    }

    if (playerWon) { SFX.play('win'); confetti(70); }
    else if (!isAuto && state.mode !== 'boss') SFX.play('lose');
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
      badge.textContent = state.mode === 'boss' ? '👑' : '🏆';
      title.textContent = state.mode === 'boss'
        ? 'BOSS VAINCU !'
        : (byPoints ? 'VICTOIRE AUX POINTS' : 'VICTOIRE');
      title.classList.add('is-win');
    } else {
      badge.textContent = '💀';
      title.textContent = state.mode === 'boss'
        ? 'K.O. — BOSS RUSH TERMINÉ'
        : (byPoints ? 'DÉFAITE AUX POINTS' : 'K.O. — DÉFAITE');
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

    if (state.mode === 'boss' && state.bossRun) {
      const run = state.bossRun;
      // Boss secret : il se révèle dès que les cinq boss principaux sont tombés,
      // y compris au cours du run qui vient de les achever.
      const hasSecret = run.order.some(function (b) { return b.secret; });
      const bossSaveNow = bossSave();
      if (playerWon && !hasSecret && Bosses.SECRET_BOSS &&
        Bosses.allMainCleared(bossSaveNow.cleared) && !bossSaveNow.cleared.nullsector) {
        run.order = run.order.concat([Bosses.SECRET_BOSS]);
        $('#result-sub').textContent = 'Les cinq boss sont à terre… mais un secteur inconnu vient de s’ouvrir.';
      }
      const last = run.index + 1 >= run.order.length;
      if (playerWon && last) {
        badge.textContent = '👑';
        title.textContent = 'BOSS RUSH TERMINÉ !';
        const time = formatTime(Date.now() - run.startTs);
        $('#result-sub').textContent = 'Les ' + run.order.length + ' boss sont à terre en ' + time +
          ' — ' + run.damage + ' dégâts infligés.';
      }
      if (playerWon && !last) {
        mk('Boss suivant →', 'btn--primary', function () {
          closeResult();
          run.index++;
          startBossBattle(run.order[run.index]);
        });
      } else if (playerWon && last) {
        mk('Voir le tableau', 'btn--primary', function () { closeResult(); endBossRunUi(true); });
      } else {
        mk('Réessayer ce boss', 'btn--primary', function () {
          closeResult();
          startBossBattle(run.order[run.index]);
        });
      }
      mk('Quitter le Boss Rush', 'btn--ghost', function () {
        closeResult();
        endBossRunUi(playerWon && last);
      });
    } else if (state.mode === 'tournament') {
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

    // Écran de récompenses : il se superpose au panneau de résultat
    const token = ++state.rewardToken;
    setTimeout(function () {
      if (token !== state.rewardToken || !state.battle || state.battle !== battle) return;
      showRewards(reward);
    }, 900 / state.speed);
  }

  /* Fin du Boss Rush : enregistre le temps, les dégâts et la difficulté */
  function endBossRunUi(won) {
    const run = state.bossRun;
    if (run) {
      Progress.finishBossRush(meta, {
        won: !!won,
        timeMs: Date.now() - run.startTs,
        damage: run.damage,
        brand: run.brand,
        difficulty: run.difficulty,
        bosses: run.cleared.length
      });
      saveMeta();
    }
    state.bossRun = null;
    state.mode = 'duel';
    $('#bossbar').hidden = true;
    goto('bossrush');
  }

  /* ------------------------- Progression : récompenses ------------------------- */

  /* Calcule et enregistre l'XP du combat (le panneau reste affiché derrière) */
  function grantRewards(battle, champion) {
    const a = battle.a, b = battle.b;
    const winner = battle.winner;
    const loser = winner === battle.a ? battle.b : battle.a;
    const isAuto = state.mode === 'auto';
    const playerWon = !!winner && winner.side === 'left';

    const payload = {
      mode: state.mode,
      playerBrand: a.brand.id,
      foeBrand: b.boss ? null : b.brand.id,   // un boss ne monte pas de niveau
      won: isAuto ? null : playerWon,
      rounds: battle.round,
      crits: battle.stats.crits,
      specials: battle.stats.specials,
      ultimates: battle.stats.ultimates,
      maxDamage: winner ? battle.stats.maxHit[winner.side] || battle.stats.maxDamage : battle.stats.maxDamage,
      ko: battle.endReason === 'ko',
      koBy: winner ? winner.brand.id : null,
      koOn: loser ? loser.brand.id : null,
      tournamentWin: !!champion,
      ultimatesByBrand: {},
      maxDamageByBrand: {}
    };
    payload.ultimatesByBrand[a.brand.id] = a.ultUsed || 0;
    payload.ultimatesByBrand[b.brand.id] = b.ultUsed || 0;
    payload.maxDamageByBrand[a.brand.id] = battle.stats.maxHit.left;
    payload.maxDamageByBrand[b.brand.id] = battle.stats.maxHit.right;

    return Progress.applyBattleResult(meta, payload);
  }

  /* Barre d'XP animée : remplissage, puis remise à zéro à chaque montée de niveau */
  function animateXpBar(fill, fromPct, toPct, levels) {
    fill.style.transition = 'none';
    fill.style.width = Math.max(0, Math.min(100, fromPct)) + '%';
    void fill.offsetWidth;
    fill.style.transition = '';
    let delay = 260 / state.speed;
    for (let i = 0; i < levels; i++) {
      setTimeout(function () { fill.style.width = '100%'; }, delay);
      delay += 520 / state.speed;
      setTimeout(function () {
        fill.style.transition = 'none';
        fill.style.width = '0%';
        void fill.offsetWidth;
        fill.style.transition = '';
      }, delay);
      delay += 140 / state.speed;
    }
    setTimeout(function () { fill.style.width = Math.max(0, Math.min(100, toPct)) + '%'; }, delay);
    return delay;
  }

  function xpRow(opts) {
    const before = opts.before, after = opts.after;
    const levels = Math.max(0, after.level - before.level);
    const row = document.createElement('div');
    row.className = 'xprow';
    const mono = opts.mono
      ? '<span class="xprow__mono" style="background:linear-gradient(135deg,' + opts.colors[0] + ',' + opts.colors[1] + ')">' +
        esc(opts.mono) + '</span>'
      : '<span class="xprow__mono" style="background:linear-gradient(135deg,#6c8cff,#b06cff)">✦</span>';
    row.innerHTML =
      '<div class="xprow__top"><b>' + mono + esc(opts.label) + '</b>' +
      '<span>Nv ' + before.level + (levels ? ' → ' + after.level : '') +
      ' · <span class="xprow__gain">+' + opts.gain + ' PX</span></span></div>' +
      '<div class="bar bar--xp"><div class="bar__fill" style="width:' + before.pct + '%"></div></div>';
    return { el: row, fill: row.querySelector('.bar__fill'), before: before, after: after, levels: levels };
  }

  function showRewards(report) {
    const overlay = $('#rewards-overlay');
    $('#rewards-xp').textContent = report.xp;

    $('#rewards-parts').innerHTML = report.xpParts.map(function (p) {
      return '<li><span>' + esc(p.label) + '</span><b>+' + p.value + '</b></li>';
    }).join('');

    /* --- Barres d'XP (joueur + marques du combat) --- */
    const bars = $('#rewards-bars');
    bars.innerHTML = '';
    const rows = [];

    const playerBeforeXp = Math.max(0, (meta.playerXp || 0) - report.xp);
    rows.push(xpRow({
      label: 'Niveau global', mono: null, colors: ['#6c8cff', '#b06cff'],
      before: Progress.levelFromXp(playerBeforeXp),
      after: Progress.levelFromXp(meta.playerXp || 0),
      gain: report.xp
    }));

    report.brands.forEach(function (b) {
      const brand = Data.getBrand(b.id);
      const beforeXp = Math.max(0, b.after.xp - report.xp);
      rows.push(xpRow({
        label: brand.name, mono: brand.mono, colors: brand.colors,
        before: Progress.levelFromXp(beforeXp),
        after: b.after,
        gain: report.xp
      }));
    });

    let maxDelay = 0;
    rows.forEach(function (r) {
      bars.appendChild(r.el);
      maxDelay = Math.max(maxDelay, animateXpBar(r.fill, r.before.pct, r.after.pct, r.levels));
    });

    /* --- « LEVEL UP ! » --- */
    // Le niveau global d'abord, puis les marques du combat
    const levelUps = report.levelUps.slice().sort(function (x, y) {
      return (x.kind === 'player' ? 0 : 1) - (y.kind === 'player' ? 0 : 1);
    });
    levelUps.forEach(function (up, i) {
      setTimeout(function () {
        const el = document.createElement('div');
        el.className = 'levelup';
        el.innerHTML = 'LEVEL UP !<small>' + esc(up.name) + ' — niveau ' + up.to + '</small>';
        $('#rewards-unlocks').appendChild(el);
        if (!state.cinematics) return;
        SFX.play('buff');
        announce('NIVEAU ' + up.to + ' !', 'ult');
      }, (maxDelay + 120 + i * 420) / state.speed);
    });

    /* --- Déblocages --- */
    const unlocks = $('#rewards-unlocks');
    unlocks.innerHTML = '';
    report.newSkins.forEach(function (sk) {
      const el = document.createElement('div');
      el.className = 'unlock';
      el.innerHTML = '<span class="unlock__icon">' + (sk.icon || '🎨') + '</span><span>' +
        '<span class="unlock__label">Nouveau skin · ' + esc(sk.brandName || 'Édition exclusive') + '</span><br>' +
        '<span class="unlock__name">' + esc(sk.name) + '</span></span>';
      unlocks.appendChild(el);
    });
    report.newBadges.forEach(function (bd) {
      const el = document.createElement('div');
      el.className = 'unlock';
      el.innerHTML = '<span class="unlock__icon">' + bd.icon + '</span><span><span class="unlock__label">Badge · ' +
        esc(bd.brandName) + '</span><br><span class="unlock__name">' + esc(bd.name) + '</span></span>';
      unlocks.appendChild(el);
    });
    report.newTrophies.forEach(function (t) {
      const el = document.createElement('div');
      el.className = 'unlock';
      el.innerHTML = '<span class="unlock__icon">' + t.icon + '</span><span><span class="unlock__label">Trophée</span><br>' +
        '<span class="unlock__name">' + esc(t.name) + '</span></span>';
      unlocks.appendChild(el);
    });

    /* --- Rang --- */
    const rank = report.rank;
    const rankBox = $('#rewards-rank');
    rankBox.innerHTML =
      '<div class="xprow__top"><b>' + rank.after.rank.icon + ' ' + esc(rank.after.rank.name) + '</b>' +
      '<span>' + (rank.after.next ? 'prochain : ' + esc(rank.after.next.name) : 'rang maximum') + '</span></div>' +
      '<div class="bar bar--rank" style="--rank-color:' + rank.after.rank.color + '">' +
      '<div class="bar__fill" id="rewards-rank-fill" style="width:0%"></div></div>';
    const rankFill = $('#rewards-rank-fill');
    setTimeout(function () { rankFill.style.width = rank.after.pct + '%'; }, 200 / state.speed);
    if (rank.up) {
      setTimeout(function () {
        const el = document.createElement('div');
        el.className = 'levelup';
        el.innerHTML = 'NOUVEAU RANG !<small>' + esc(rank.after.rank.name) + '</small>';
        unlocks.appendChild(el);
        SFX.play('win');
      }, 700 / state.speed);
    }

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeRewards() {
    const overlay = $('#rewards-overlay');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
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

  /* ------------------------- Écran Profil ------------------------- */

  function saveProgress() { return Progress.bossSave(meta); }

  /* Marque la plus jouée (victoires, puis utilisations) */
  function favoriteBrand() {
    let best = null, bestScore = -1;
    Progress.allBrandStates(meta).forEach(function (st) {
      const score = st.wins * 1000 + st.uses;
      if (st.uses > 0 && score > bestScore) { bestScore = score; best = st; }
    });
    return best;
  }

  function renderProfil() {
    const lv = Progress.levelFromXp(meta.playerXp || 0);
    const rank = Progress.rankFromLevel(lv.level);

    const card = $('#rank-card');
    card.style.setProperty('--rank-color', rank.rank.color);
    $('#rank-icon').textContent = rank.rank.icon;
    $('#rank-name').textContent = rank.rank.name;
    $('#rank-fill').style.width = rank.pct + '%';
    $('#rank-next').textContent = rank.next
      ? 'Prochain rang : ' + rank.next.name + ' au niveau ' + rank.next.level +
        ' (encore ' + rank.remaining + ' niveau' + (rank.remaining > 1 ? 'x' : '') + ')'
      : 'Rang maximum atteint — respect 🏆';

    $('#level-badge').textContent = 'Nv ' + lv.level;
    $('#level-xp-txt').textContent = lv.maxed ? 'MAX' : lv.into + ' / ' + lv.needed + ' PX';
    const fill = $('#level-xp-fill');
    fill.style.width = (lv.maxed ? 100 : 0) + '%';
    setTimeout(function () { fill.style.width = lv.pct + '%'; }, 120);
    $('#level-hint').textContent = lv.maxed
      ? 'Niveau maximum — légende absolue'
      : (Progress.xpToReach(lv.level + 1) - (meta.playerXp || 0)) + ' PX avant le niveau ' + (lv.level + 1);

    /* --- Statistiques --- */
    const total = meta.wins + meta.losses;
    const rate = total ? Math.round(meta.wins / total * 100) : 0;
    const fav = favoriteBrand();
    const favName = fav ? Data.getBrand(fav.id).name : '—';
    const favSub = fav ? fav.wins + 'V / ' + fav.losses + 'D · Nv ' + fav.level : 'aucun combat';
    const ko = meta.bestKo;
    const koName = (ko && ko.brand && Data.getBrand(ko.brand)) ? Data.getBrand(ko.brand).name : null;

    $('#profil-stats').innerHTML = [
      ['⚔️', meta.battles || 0, 'Combats'],
      ['🏆', meta.wins, 'Victoires'],
      ['💀', meta.losses, 'Défaites'],
      ['📈', rate + ' %', 'Taux de victoire'],
      ['⭐', favName, 'Marque favorite', favSub],
      ['💥', ko ? ko.damage : (meta.bestDamage || 0), 'Meilleur K.O.', koName ? 'par ' + koName : '—'],
      ['✦', meta.ultimates || 0, 'Ultimes lancés'],
      ['🔥', meta.streak || 0, 'Série en cours', 'record ' + (meta.bestStreak || 0)],
      ['👑', Bosses.bossCount(bossSave()), 'Boss vaincus', bossSave().bestTime ? 'record ' + formatTime(bossSave().bestTime) : 'aucun Boss Rush']
    ].map(function (s) {
      return '<div class="stat-card"><b>' + esc(s[1]) + '</b><span>' + s[0] + ' ' + esc(s[2]) + '</span>' +
        (s[3] ? '<small>' + esc(s[3]) + '</small>' : '') + '</div>';
    }).join('');

    /* --- Trophées --- */
    const trophies = Progress.trophiesOf(meta);
    const earned = trophies.filter(function (t) { return t.earned; }).length;
    $('#trophy-count').textContent = earned + ' / ' + trophies.length;
    $('#trophy-grid').innerHTML = trophies.map(function (t) {
      return '<div class="trophy' + (t.earned ? ' is-earned' : '') + '" title="' + esc(t.desc) + '">' +
        '<span class="trophy__icon">' + t.icon + '</span>' +
        '<span><span class="trophy__name">' + esc(t.name) + '</span>' +
        '<span class="trophy__desc">' + esc(t.desc) + '</span></span></div>';
    }).join('');

    /* --- Titres de boss --- */
    const titles = Bosses.BOSS_TITLES.map(function (t) {
      const boss = Bosses.getBoss(t.boss);
      const hidden = boss && boss.secret && !saveProgress().cleared[boss.id];
      const earned = saveProgress().titles.indexOf(t.id) !== -1;
      return { t: t, boss: boss, hidden: hidden, earned: earned };
    });
    const titlesWon = titles.filter(function (x) { return x.earned; }).length;
    $('#title-count').textContent = titlesWon + ' / ' + titles.length;
    $('#title-list').innerHTML = titles.map(function (x) {
      const name = x.hidden ? 'Titre secret' : x.t.name;
      const desc = x.hidden ? 'Battez le boss secret pour le révéler.' : ('Battre ' + (x.boss ? x.boss.name : ''));
      return '<div class="ptitle' + (x.earned ? ' is-earned' : '') + '">' +
        '<span class="ptitle__icon">' + (x.hidden ? '🔒' : x.t.icon) + '</span>' +
        '<span><span class="ptitle__name">' + esc(x.hidden ? '??? ???' : (x.earned ? name : '???')) + '</span>' +
        '<span class="ptitle__desc">' + esc(desc) + '</span></span></div>';
    }).join('');

    /* --- Écurie --- */
    const bossSkins = Progress.unlockedBossSkins(meta);
    $('#roster-list').innerHTML = Progress.allBrandStates(meta).map(function (st) {
      const b = Data.getBrand(st.id);
      const rarity = Progress.rarityOf(st.id);
      const nextSk = Progress.nextSkin(st.level);
      const chip = function (sk, unlocked, label) {
        const equipped = st.skin === sk.id;
        return '<span class="skin-chip' + (unlocked ? ' is-unlocked' : '') + (equipped ? ' is-equipped' : '') +
          '" data-brand="' + st.id + '" data-skin="' + sk.id + '" role="button" tabindex="' + (unlocked ? '0' : '-1') +
          '" title="' + esc(sk.name) + (unlocked ? ' — ' + esc(sk.desc) : ' — ' + label) + '">' +
          (unlocked ? esc(sk.name) : label) + '</span>';
      };
      const skins = Progress.SKINS.map(function (sk) {
        return chip(sk, st.level >= sk.level, '🔒 ' + sk.level);
      }).join('') + bossSkins.map(function (sk) {
        const boss = Bosses.getBoss(sk.boss);
        return chip(sk, true, boss ? boss.icon : '');
      }).join('');
      const badges = st.badges.map(function (bd) {
        return '<span class="mbadge' + (bd.earned ? ' is-earned' : '') + '" title="' + esc(bd.name) + ' — ' +
          esc(bd.desc) + '">' + bd.icon + '</span>';
      }).join('');
      return '<article class="rcard">' +
        '<div class="rcard__head">' +
          '<span class="rcard__mono" style="background:linear-gradient(135deg,' + b.colors[0] + ',' + b.colors[1] + ')">' +
            esc(b.mono) + '</span>' +
          '<span class="rcard__id">' +
            '<h4 class="rcard__name">' + esc(b.name) + '</h4>' +
            '<span class="rcard__meta">' +
              '<span class="lvl">Nv <b>' + st.level + '</b></span>' +
              '<span class="rarity rarity--' + rarity.id + '">' + rarity.icon + ' ' + rarity.name + '</span>' +
            '</span>' +
            '<span class="rcard__xp">' + st.wins + 'V / ' + st.losses + 'D · ' + st.uses + ' combats · ' +
              (st.maxed ? 'MAX' : st.into + '/' + st.needed + ' PX') + '</span>' +
          '</span>' +
        '</div>' +
        '<div class="bar bar--xp"><div class="bar__fill xprow__fill" style="width:' + st.pct + '%"></div></div>' +
        '<div class="skins">' + skins + '</div>' +
        '<div class="badges">' + badges + '</div>' +
        (nextSk ? '<span class="rcard__xp" style="margin-top:8px">Prochain skin : ' + esc(nextSk.name) +
          ' au niveau ' + nextSk.level + '</span>' : '') +
        '</article>';
    }).join('');
  }

  /* Équiper un skin (visuel uniquement, depuis la page Profil) */
  function equipSkin(brandId, skinId) {
    const st = Progress.brandState(meta, brandId);
    if (!Progress.isSkinUnlocked(skinId, st.level, meta)) { SFX.play('block'); return; }
    meta.brands = meta.brands || {};
    if (!meta.brands[brandId]) meta.brands[brandId] = { xp: 0, wins: 0, losses: 0, uses: 0, ultimates: 0, bestDamage: 0, skin: 'base' };
    meta.brands[brandId].skin = skinId;
    saveMeta();
    SFX.play('click');
    renderProfil();
  }

  /* Remise à zéro du Boss Rush uniquement */
  function resetBossRush() {
    if (!window.confirm('Réinitialiser la progression Boss Rush ?\n' +
      'Boss vaincus, titres, skins exclusifs et trophées seront perdus.')) return;
    meta.boss = Bosses.emptyBossSave();
    saveMeta();
    renderBossRush();
    announce('Boss Rush réinitialisé', 'round');
  }

  /* Remise à zéro de la progression (les palmarès « historique » sont conservés) */
  function resetProgress() {
    if (!window.confirm('Réinitialiser toute la progression ?\nNiveaux, XP, skins, badges et trophées seront perdus.')) return;
    const duels = meta.duels || [];
    meta = Progress.hydrate(Progress.emptyProgress());
    meta.boss = Bosses.emptyBossSave();
    meta.duels = duels;
    saveMeta();
    renderProfil();
    announce('Progression réinitialisée', 'round');
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

    // Cinématiques d'ultime longues / courtes
    $('#btn-cine').addEventListener('click', function () {
      state.cinematics = !state.cinematics;
      savePrefs();
      paintCineBtn();
      SFX.play('click');
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

    /* --- Boss Rush --- */
    const openBossScreen = function () { SFX.resume(); SFX.play('click'); goto('bossrush'); };
    $('#btn-boss').addEventListener('click', openBossScreen);
    $('#btn-start-boss').addEventListener('click', startBossRush);

    $('#diff-picker').addEventListener('click', function (e) {
      const btn = e.target.closest('.diff');
      if (!btn) return;
      SFX.play('click');
      state.bossDifficulty = btn.dataset.diff;
      renderBossRush();
    });

    $('#btn-reset-boss').addEventListener('click', resetBossRush);

    /* --- Progression --- */
    $('#btn-reset-progress').addEventListener('click', resetProgress);

    $('#roster-list').addEventListener('click', function (e) {
      const chip = e.target.closest('.skin-chip');
      if (chip && chip.dataset.brand) equipSkin(chip.dataset.brand, chip.dataset.skin);
    });
    $('#roster-list').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const chip = e.target.closest && e.target.closest('.skin-chip');
      if (!chip || !chip.dataset.brand) return;
      e.preventDefault();
      equipSkin(chip.dataset.brand, chip.dataset.skin);
    });

    $('#btn-rewards-continue').addEventListener('click', function () {
      SFX.resume(); SFX.play('click');
      closeRewards();
      if (state.screen === 'profil') renderProfil();
      else renderMenuRoster();
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
      else if (k === 'escape') closeRewards();
      else if (e.code === 'Space') {
        if ($('#rewards-overlay').classList.contains('is-open')) {
          e.preventDefault();
          $('#btn-rewards-continue').click();
          return;
        }
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
    loadPrefs();
    renderMenuRoster();
    bindUi();
    paintCineBtn();
    $('#btn-auto').classList.add('is-off');
  });
})();
