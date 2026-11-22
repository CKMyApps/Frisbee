(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const all = (s) => [...document.querySelectorAll(s)];
  const F = window.Frisbee;
  if (!F) return;
  let view = 'menu', mode = 'solo', scoreKey = '', overlayPhase = '';
  let names = ['', '', '', ''];
  const count = $('count');
  const nameFields = $('player-fields');
  const resumeButton = document.querySelector('[data-action="resume"]');
  const nextButton = document.querySelector('[data-action="next"]');
  const controlButtons = all('[data-control]');
  const overlay = $('overlay');
  const scorecard = $('scorecard');
  const scoreToggle = $('score-toggle');
  const soundButton = $('sound');
  const prefersSound = () => { try { return localStorage.getItem('frisbee.sound.v1') !== 'off'; } catch { return true; } };
  const updateSound = (on) => {
    F.setSound(on);
    F.setMenuMusic?.(on && view === 'menu');
    soundButton.setAttribute('aria-checked', String(on));
    soundButton.textContent = on ? 'ON' : 'OFF';
  };
  updateSound(prefersSound());
  soundButton.addEventListener('click', () => {
    const on = soundButton.getAttribute('aria-checked') !== 'true';
    try { localStorage.setItem('frisbee.sound.v1', on ? 'on' : 'off'); } catch {}
    updateSound(on);
  });
  function show(target, focus = true) {
    view = target;
    F.setMenuMusic?.(target === 'menu' && soundButton.getAttribute('aria-checked') === 'true');
    all('[data-view]').forEach((p) => { p.hidden = p.dataset.view !== target; });
    resumeButton.disabled = !F.hasSave();
    $('replace-notice').hidden = !F.hasSave();
    if (focus) {
      window.scrollTo(0, 0);
      const panel = document.querySelector('[data-view="' + target + '"]');
      const node = target === 'game' ? $('course') : panel.querySelector('h1,h2,button');
      if (node && node.tagName.startsWith('H')) { node.tabIndex = -1; node.focus({preventScroll:true}); }
      else node?.focus({preventScroll:true});
    }
  }
  function fields() {
    const n = mode === 'local' ? Number(count.value) : 1;
    document.querySelector('.setup-local').hidden = mode !== 'local';
    nameFields.replaceChildren();
    for (let i = 0; i < n; i++) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      label.textContent = 'Player ' + (i + 1);
      input.type = 'text'; input.maxLength = 18; input.autocomplete = 'off';
      input.value = names[i]; input.placeholder = 'Player ' + (i + 1);
      input.addEventListener('input', () => { names[i] = input.value; });
      label.append(input); nameFields.append(label);
    }
  }
  all('[data-mode]').forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.mode;
    all('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    fields();
  }));
  count.addEventListener('change', fields);
  fields();
  all('[data-panel]').forEach((b) => b.addEventListener('click', () => {
    if (view === 'game') F.pause();
    show(b.dataset.panel);
  }));
  $('pause').addEventListener('click', () => { F.pause(); show('menu'); });
  $('start').addEventListener('click', () => {
    resetScorecard();
    show('game');
    F.start({ mode, names: names.slice(0, mode === 'local' ? Number(count.value) : 1).map((n,i) => n.trim() || 'Player ' + (i + 1)) });
    render(F.snapshot());
  });
  nextButton.addEventListener('click', () => F.next());
  resumeButton.addEventListener('click', () => {
    F.resume();
    const s = F.snapshot();
    if (s && s.phase !== 'menu' && s.phase !== 'paused') { resetScorecard(); show('game'); render(s); }
  });
  function resetScorecard() {
    scorecard.hidden = true;
    scoreToggle.setAttribute('aria-expanded', 'false');
    overlayPhase = ''; scoreKey = '';
  }
  scoreToggle.addEventListener('click', () => {
    scorecard.hidden = !scorecard.hidden;
    scoreToggle.setAttribute('aria-expanded', String(!scorecard.hidden));
  });
  function makeScore(s) {
    const tbl = document.createElement('table');
    tbl.setAttribute('aria-label', 'Round scorecard');
    const head = tbl.createTHead().insertRow();
    for (const value of ['PLAYER', ...Array.from({length:s.totalHoles}, (_,i) => String(i+1)), 'TOTAL']) {
      const th = document.createElement('th'); th.scope = 'col'; th.textContent = value; head.append(th);
    }
    const body = tbl.createTBody();
    for (const p of s.players) {
      const row = body.insertRow();
      for (const value of [p.name, ...Array.from({length:s.totalHoles}, (_,i) => p.holeScores?.[i] ?? '–'), p.total ?? 0]) {
        row.insertCell().textContent = String(value);
      }
    }
    return tbl;
  }
  const strWind = (w) => {
    if (!w) return 'CALM';
    if (typeof w === 'string') return w.toUpperCase();
    if (w.label) return String(w.label).toUpperCase();
    const x = Number(w.x ?? 0), y = Number(w.y ?? 0);
    return Math.hypot(x,y) > 0 ? ['E','SE','S','SW','W','NW','N','NE'][ (Math.round(Math.atan2(y,x)/(Math.PI/4))+8)%8 ] : 'CALM';
  };
  const put = (node, str) => { str = String(str); if (node.textContent !== str) node.textContent = str; };
  function render(s) {
    if (!s || !s.players?.length || view !== 'game') return;
    const active = s.players[s.activePlayer];
    put($('hud-hole'), String(s.hole).padStart(2,'0') + ' / ' + String(s.totalHoles).padStart(2,'0'));
    put($('hud-par'), s.par); put($('hud-throws'), active?.strokes ?? 0);
    put($('hud-wind'), strWind(s.wind));
    put($('course-label'), (s.course || 'Round in play').toUpperCase());
    put($('who'), active?.name ?? ''); put($('game-message'), s.message || '');
    const power = Math.round(s.power || 0);
    $('power-meter').value = power; put($('power-text'), power + '%');
    for (const button of controlButtons) button.disabled = s.phase !== 'aim';
    const key = JSON.stringify(s.players.map(p=>[p.name,p.holeScores,p.total]));
    if (key !== scoreKey) { scorecard.replaceChildren(makeScore(s)); scoreKey = key; }
    const modal = ['handoff','holeComplete','finished'].includes(s.phase);
    overlay.hidden = !modal;
    if (modal && overlayPhase !== s.phase) {
      const finish = s.phase === 'finished';
      const handoff = s.phase === 'handoff';
      const body = $('overlay-body');
      body.replaceChildren();
      put($('overlay-label'), finish ? 'FINAL SCORE' : handoff ? 'PASS & PLAY' : 'SCORECARD');
      let title = handoff ? (active?.name || 'Next Player') + '’s Turn' : 'Hole ' + s.hole + ' Complete';
      if (finish) {
        const low = Math.min(...s.players.map(p=>p.total));
        const win = s.players.filter(p=>p.total === low);
        title = s.players.length === 1 ? 'Round Complete' : (win.length > 1 ? 'Round Tied' : win[0].name + ' Wins');
      }
      put($('overlay-title'), title);
      if (handoff) {
        const desc = document.createElement('p'); desc.textContent = 'Pass the device to the next player.'; body.append(desc);
      } else {
        const table = document.createElement('div'); table.className = 'scorecard'; table.append(makeScore(s)); body.append(table);
      }
      nextButton.hidden = finish;
      put(nextButton, handoff ? 'READY TO THROW' : s.hole === s.totalHoles ? 'FINAL SCORE' : 'NEXT HOLE');
      $('finish-menu').hidden = !finish;
      (finish ? $('finish-menu') : nextButton).focus({preventScroll:true});
    }
    if (!modal && ['handoff','holeComplete'].includes(overlayPhase)) $('course').focus({preventScroll:true});
    overlayPhase = s.phase;
  }
  F.onChange(render);
  show('menu', false);
})();
