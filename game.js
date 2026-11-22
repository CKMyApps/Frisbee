/* FRISBEE — original arcade disc golf, simulation + canvas + local controller. */
(() => {
  'use strict';
  const W = 640, H = 420, STEP = 1 / 90, TAU = Math.PI * 2, STROKE_LIMIT = 12;
  const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
  const pt = (x, y) => ({x, y});
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const norm = a => ((a % TAU) + TAU) % TAU;
  const copy = obj => JSON.parse(JSON.stringify(obj));
  const COURSES = [
    {
      name: 'Pine Glade', par: 3, tee: pt(87, 350), pin: pt(546, 91), wind: {x: 10, y: -7, label: 'NE'},
      centerline: [[0, 406], [90, 345], [240, 266], [365, 184], [495, 103], [635, 66]], width: 122,
      palette: ['#122c22', '#265032', '#54873b', '#669840', '#7ca748', '#9db957'],
      ponds: [[473, 318, 66, 31], [510, 295, 40, 25]],
      trees: [[237, 195, 14], [343, 324, 14], [427, 144, 15], [542, 242, 14], [171, 357, 12]]
    },
    {
      name: 'Willow Bend', par: 4, tee: pt(91, 340), pin: pt(548, 103), wind: {x: -17, y: 10, label: 'SW'},
      centerline: [[0, 375], [106, 334], [233, 315], [392, 269], [481, 194], [549, 107], [625, 72]], width: 104,
      palette: ['#0d3028', '#25543b', '#4c8a50', '#5b9b59', '#7fad66', '#a0c178'],
      ponds: [[265, 179, 67, 45], [337, 166, 58, 59], [386, 200, 46, 30], [551, 307, 54, 39]],
      trees: [[144, 213, 15], [355, 304, 13], [418, 135, 15], [480, 263, 14], [584, 192, 13]]
    },
    {
      name: 'Copper Ridge', par: 4, tee: pt(94, 342), pin: pt(527, 72), wind: {x: 22, y: 0, label: 'E'},
      centerline: [[0, 380], [94, 343], [205, 272], [277, 161], [385, 108], [533, 73], [640, 57]], width: 102,
      palette: ['#252b24', '#49432b', '#65783c', '#7e8e45', '#9da952', '#c1b866'],
      ponds: [[440, 302, 70, 32], [499, 282, 36, 28]],
      trees: [[190, 311, 15], [248, 220, 17], [335, 179, 15], [414, 110, 17], [476, 170, 15], [113, 229, 13], [351, 283, 15]]
    }
  ];
  function courseFor(state) { return COURSES[state.hole - 1]; }
  function withinBounds(x, y) { return x >= 15 && x <= W - 15 && y >= 16 && y <= H - 18; }
  function pondAt(course, x, y, margin = 0) {
    return course.ponds.some(([cx, cy, rx, ry]) => ((x - cx) / (rx + margin)) ** 2 + ((y - cy) / (ry + margin)) ** 2 <= 1);
  }
  function newFlight(lie, aim, power) {
    const p = clamp(power, 0, 1), speed = 55 + 275 * p;
    return {x: lie.x, y: lie.y, origin: {...lie}, vx: Math.cos(aim) * speed, vy: Math.sin(aim) * speed, time: 0, ttl: .39 + 1.12 * p, height: 0, power: p};
  }
  function throwStep(course, f, dt = STEP) {
    const wind = course.wind;
    f.time += dt;
    const progress = clamp(f.time / f.ttl, 0, 1), decay = 1 - .30 * dt;
    f.vx = f.vx * decay + wind.x * 2.0 * dt;
    f.vy = f.vy * decay + wind.y * 2.0 * dt;
    f.x += f.vx * dt; f.y += f.vy * dt;
    f.height = Math.sin(Math.PI * progress) * (6 + f.power * 50);
    if (!withinBounds(f.x, f.y)) return {kind: 'bounds', lie: f.origin, penalty: 1};
    if (dist(f, course.pin) <= 13 && (f.height <= 26 || progress > .74)) {
      return {kind: 'basket', lie: {...course.pin}, penalty: 0};
    }
    for (const [x, y, r] of course.trees) {
      if (f.time > .050 && Math.hypot(f.x - x, f.y - y) <= r && f.height <= 36 + r) {
        const gap = Math.hypot(f.x - x, f.y - y) || 1;
        const lie = pt(x + (f.x - x) * (r + 4) / gap, y + (f.y - y) * (r + 4) / gap);
        return {kind: 'tree', lie: withinBounds(lie.x, lie.y) && !pondAt(course, lie.x, lie.y) ? lie : f.origin, penalty: 0};
      }
    }
    if (progress >= 1) {
      if (pondAt(course, f.x, f.y)) return {kind: 'water', lie: f.origin, penalty: 1};
      return {kind: 'fairway', lie: pt(f.x, f.y), penalty: 0};
    }
    return null;
  }
  function simulate(course, lie, aim, power) {
    const f = newFlight(lie, aim, power);
    for (let i = 0; i < 200; i++) {
      const end = throwStep(course, f);
      if (end) return end;
    }
    return {kind: 'fairway', lie: pt(f.x, f.y), penalty: 0};
  }
  function chooseCPU(course, p) {
    const direct = angle(p.lie, course.pin), d = dist(p.lie, course.pin);
    let best = {aim: direct, power: .8, cost: Infinity};
    for (const off of [0, -.035, .035, -.07, .07, -.12, .12, -.20, .20, -.32, .32, -.49, .49, -.67, .67, -.92, .92, -1.15, 1.15]) {
      for (let n = 0; n <= 25; n++) {
        const power = n / 25;
        const aim = direct + off;
        const r = simulate(course, p.lie, aim, power);
        if (r.kind === 'basket' && (d < 200 || (p.strokes > 0 && d < 390))) {
          const cost = -50 + Math.abs(off) * 3 + power * 3;
          if (cost < best.cost) best = {aim, power, cost};
        } else {
          const left = dist(r.lie, course.pin);
          const cost = Math.abs(left - (d >= 200 && p.strokes === 0 ? 70 : 0)) + r.penalty * 240 + (r.kind === 'tree' ? 40 : 0) + (r.kind === 'basket' ? 180 : 0);
          if (cost < best.cost) best = {aim, power, cost};
        }
      }
    }
    return best;
  }
  function chooseOpponent(course, p) {
    // CPU has steady, safe club selection, but not tournament-perfect aim/power.
    const best=chooseCPU(course,p), distance=dist(p.lie,course.pin), edge=course.wind.x<0?-.045:.045;
    const attempt={aim:best.aim + (distance>35?edge:0),power:best.power*(distance>45?.88:.98)};
    const end=simulate(course,p.lie,attempt.aim,attempt.power);
    return ['fairway','basket'].includes(end.kind) ? attempt : best;
  }
  const played = p => p.holeScores.reduce((sum, score) => sum + score, 0);
  function newGame({mode = 'solo', names = []} = {}) {
    if (!Array.isArray(names)) names = [];
    const safeMode = ['solo', 'cpu', 'local'].includes(mode) ? mode : 'solo';
    const count = safeMode === 'local' ? clamp(names.length || 2, 2, 4) : safeMode === 'cpu' ? 2 : 1;
    const players = Array.from({length: count}, (_, i) => {
      const supplied = typeof names[i] === 'string' ? names[i].trim().slice(0, 22) : '';
      return {name: safeMode === 'cpu' && i === 1 ? 'CPU' : supplied || (count === 1 ? 'Player' : 'Player ' + (i + 1)), cpu: safeMode === 'cpu' && i === 1,
        strokes: 0, holeScores: [], lie: {...COURSES[0].tee}};
    });
    return {version: 1, mode: safeMode, hole: 1, phase: 'aim', activePlayer: 0, players, aim: angle(COURSES[0].tee, COURSES[0].pin), flight: null, message: players[0].name + ' on the tee.'};
  }
  function prepareTurn(state, index, handoff = false) {
    state.activePlayer = index;
    const p = state.players[index];
    state.aim = angle(p.lie, courseFor(state).pin);
    state.phase = p.cpu ? 'cpuTurn' : handoff && state.mode === 'local' ? 'handoff' : 'aim';
  }
  function launch(state, power, aim = state.aim) {
    if (!['aim', 'cpuTurn'].includes(state.phase) || !Number.isFinite(aim) || !Number.isFinite(power)) return false;
    const player = state.players[state.activePlayer];
    if (player.holeScores.length >= state.hole) return false;
    state.aim = norm(aim);
    state.flight = newFlight(player.lie, state.aim, power);
    player.strokes += 1;
    state.phase = 'flight';
    state.message = player.name + ' sends it.';
    return true;
  }
  function settle(state, result) {
    const course = courseFor(state), p = state.players[state.activePlayer];
    p.strokes = Math.min(STROKE_LIMIT, p.strokes + result.penalty);
    p.lie = {...result.lie};
    state.flight = null;
    if (result.kind === 'basket') {
      const rel = p.strokes - course.par;
      const grade = p.strokes === 1 ? 'Hole in one!' : rel <= -2 ? 'Eagle!' : rel === -1 ? 'Birdie!' : rel === 0 ? 'Par!' : rel === 1 ? 'Bogey.' : (rel > 0 ? '+' + rel + '.' : 'In the chains!');
      state.message = p.name + ' · ' + grade;
    } else if (result.kind === 'water') state.message = 'Water hazard. +1 stroke; throw again from the previous lie.';
    else if (result.kind === 'bounds') state.message = 'Out of bounds. +1 stroke; throw again from the previous lie.';
    else if (result.kind === 'tree') state.message = 'Tree hit. Play from where the disc stopped.';
    else state.message = 'On the fairway.';
    if (result.kind === 'basket' || p.strokes >= STROKE_LIMIT) {
      p.holeScores.push(p.strokes);
      if (result.kind !== 'basket') state.message = p.name + ' · 12-stroke limit.';
    }
    if (state.players.every(x => x.holeScores.length === state.hole)) {
      state.phase = state.hole === COURSES.length ? 'finished' : 'holeComplete';
      return;
    }
    const n = state.players.length;
    for (let k = 1; k <= n; k++) {
      const index = (state.activePlayer + k) % n;
      if (state.players[index].holeScores.length < state.hole) {
        prepareTurn(state, index, index !== state.activePlayer);
        return;
      }
    }
  }
  function advance(state) {
    if (state.phase === 'handoff') {
      state.phase = 'aim';
      state.message = state.players[state.activePlayer].name + ' ready to throw.';
      return true;
    }
    if (state.phase !== 'holeComplete' || state.hole >= COURSES.length) return false;
    state.hole++;
    for (const p of state.players) {p.strokes = 0; p.lie = {...courseFor(state).tee};}
    prepareTurn(state, (state.hole - 1) % state.players.length);
    state.message = courseFor(state).name + ' · ' + state.players[state.activePlayer].name + ' on the tee.';
    return true;
  }
  function tickFlight(state, dt = STEP) {
    if (state.phase !== 'flight' || !state.flight) return null;
    const hit = throwStep(courseFor(state), state.flight, dt);
    if (hit) settle(state, hit);
    return hit;
  }
  function validSave(s) {
    const xy = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
    const pvalid = p => p && typeof p.name === 'string' && p.name.length <= 22 && typeof p.cpu === 'boolean' &&
      Number.isInteger(p.strokes) && p.strokes >= 0 && p.strokes <= STROKE_LIMIT && xy(p.lie) && withinBounds(p.lie.x, p.lie.y) &&
      Array.isArray(p.holeScores) && p.holeScores.length >= s.hole - 1 && p.holeScores.length <= s.hole &&
      p.holeScores.every(k => Number.isInteger(k) && k >= 1 && k <= STROKE_LIMIT);
    const phases = ['aim', 'cpuTurn', 'flight', 'handoff', 'holeComplete'];
    if (!s || s.version !== 1 || !phases.includes(s.phase) || !['solo','cpu','local'].includes(s.mode) ||
        !Number.isInteger(s.hole) || s.hole < 1 || s.hole > COURSES.length || !Array.isArray(s.players) ||
        !Number.isInteger(s.activePlayer) || !s.players[s.activePlayer] || s.players.length < 1 || s.players.length > 4 ||
        !s.players.every(pvalid) || !Number.isFinite(s.aim) ||
        typeof s.message !== 'string' || s.message.length > 150) return false;
    const cpus = s.players.filter(p => p.cpu).length;
    if ((s.mode === 'solo' && (s.players.length !== 1 || cpus)) ||
        (s.mode === 'cpu' && (s.players.length !== 2 || s.players[0].cpu || !s.players[1].cpu)) ||
        (s.mode === 'local' && (s.players.length < 2 || cpus))) return false;
    const allFinished = s.players.every(p => p.holeScores.length === s.hole);
    if ((s.phase === 'holeComplete') !== allFinished || (allFinished && s.hole === COURSES.length) ||
        (!allFinished && s.players[s.activePlayer].holeScores.length === s.hole)) return false;
    if (s.phase === 'cpuTurn' && !s.players[s.activePlayer].cpu) return false;
    if (s.phase === 'flight') {
      const f = s.flight;
      return !!(xy(f) && xy(f.origin) && ['vx','vy','height','time','ttl','power'].every(k => Number.isFinite(f[k])) &&
        f.ttl >= .38 && f.ttl <= 1.52 && f.time >= 0 && f.time < f.ttl && withinBounds(f.x, f.y));
    }
    return s.flight === null;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {COURSES, STEP, newGame, launch, advance, tickFlight, simulate, validSave, chooseCPU, chooseOpponent, played};
  }
  if (typeof document === 'undefined') return;

  const SAVE_KEY = 'ckmyapps.frisbee.save.v1', SOUND_KEY = 'ckmyapps.frisbee.sound';
  const canvas = document.getElementById('course');
  const context = canvas?.getContext('2d');
  const back = document.createElement('canvas');
  back.width = W; back.height = H;
  const paint = back.getContext('2d');
  let drawnCourse = 0, state = null, suspended = false, charge = null, lastTime = 0, accumulator = 0;
  let cpuAt = 0, statusAt = 0, clock = 0, messageOverride = '', touchAim = null;
  let enabled = true;
  try { enabled = localStorage.getItem(SOUND_KEY) !== 'off'; } catch {}
  let audio = null, menuMusic = false, nextNote = 0, noteIndex = 0;
  const held = new Map(), listeners = new Set();
  const readSave = () => {
    try {const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return validSave(s) ? s : null;} catch {return null;}
  };
  function save() {
    try {
      if (!state) return;
      if (state.phase === 'finished') localStorage.removeItem(SAVE_KEY);
      else localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch { /* Private mode still permits local play. */ }
  }
  function tone(freq, at, duration, vol = .06, style = 'triangle') {
    if (!enabled || !audio || audio.state !== 'running') return;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = style; o.frequency.value = freq;
    g.gain.setValueAtTime(.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + .015);
    g.gain.exponentialRampToValueAtTime(.0001, at + duration);
    o.connect(g); g.connect(audio.destination); o.start(at); o.stop(at + duration + .015);
  }
  function unlockAudio() {
    if (!enabled) return;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    try { if (!audio || audio.state === 'closed') audio = new C(); if (audio.state === 'suspended') audio.resume().catch(() => {}); } catch {}
  }
  function cue(name) {
    if (!enabled || !audio) return;
    const a = audio.currentTime;
    if (name === 'throw') {tone(330,a,.09,.04,'square');tone(490,a+.045,.09,.035,'triangle');}
    else if (name === 'basket') [523,659,784,1047].forEach((n,i)=>tone(n,a+i*.055,.16,.042));
    else if (name === 'water' || name === 'bounds') [280,160,105].forEach((n,i)=>tone(n,a+i*.055,.12,.032));
    else if (name === 'tree') tone(123,a,.13,.07,'triangle');
    else if (name === 'fairway') tone(220,a,.08,.036,'triangle');
    else if (name === 'finish') [392,494,587,784,988].forEach((n,i)=>tone(n,a+i*.10,.20,.042));
  }
  // Original four-bar menu loop; user gesture unlocks browser audio.
  const melody = [392,0,494,587,523,0,494,440,349,0,440,523,494,0,440,392,330,0,392,494,440,0,392,349,294,0,349,440,392,0,330,349];
  const bass = [130.81,146.83,110,98];
  function playMusic() {
    if (!menuMusic || !enabled || !audio || audio.state !== 'running' || document.hidden) return;
    const now = audio.currentTime;
    if (nextNote < now - .3 || nextNote > now + .75) {nextNote = now + .04; noteIndex = 0;}
    while (nextNote < now + .18) {
      const n = melody[noteIndex % melody.length];
      if (n) tone(n, nextNote, .18, .017);
      if (noteIndex % 4 === 0) tone(bass[Math.floor(noteIndex / 8) % bass.length], nextNote, .40, .018);
      nextNote += .23; noteIndex++;
    }
  }
  function powerNow() {
    if (charge === null) return 0;
    return clamp((clock - charge) / 1150, 0, 1);
  }
  function snapshot() {
    const s = state, h = courseFor(s || {hole: 1});
    const wind = {x: h.wind.x, y: h.wind.y, direction: h.wind.label, label: h.wind.label, strength: Math.round(Math.hypot(h.wind.x, h.wind.y))};
    const players = s ? s.players.map(p => ({name: p.name, cpu: p.cpu, strokes: p.strokes, holeScores: p.holeScores.slice(), total: played(p), lie: {...p.lie}})) : [];
    const low = players.length ? Math.min(...players.map(p => p.total)) : 0;
    return {phase: !s ? 'menu' : suspended ? 'paused' : s.phase, mode: s?.mode || 'solo', hole: s?.hole || 1, totalHoles: COURSES.length,
      course: h.name, courseName: h.name, par: h.par, totalPar: COURSES.reduce((sum, c) => sum + c.par, 0), wind: wind.label, windInfo: wind,
      windLabel: wind.label, power: Math.round(powerNow() * 100), charging: charge !== null, players, activePlayer: s?.activePlayer || 0,
      aim: s?.aim ?? angle(h.tee, h.pin), message: messageOverride || s?.message || 'Three holes. Lowest score wins.',
      winners: s?.phase === 'finished' ? players.filter(p => p.total === low).map(p => p.name) : [], sound: enabled};
  }
  function emit() {
    const info = snapshot();
    for (const cb of listeners) cb(info);
    window.dispatchEvent(new CustomEvent('frisbee:state', {detail: info}));
  }
  function cancelControls() {held.clear(); charge = null; touchAim = null;}
  function resetTiming() {accumulator = 0; cpuAt = 0; lastTime = 0;}
  function start(options) {
    unlockAudio(); menuMusic = false; state = newGame(options); suspended = false; messageOverride = ''; cancelControls(); resetTiming(); save(); emit(); return snapshot();
  }
  function resume() {
    unlockAudio(); if (!suspended || !state || state.phase === 'finished') state = readSave();
    if (!state) return false;
    menuMusic = false; suspended = false; messageOverride = ''; cancelControls(); resetTiming(); emit(); return true;
  }
  function pause() {
    if (!state || suspended) return false;
    cancelControls(); suspended = true; save(); emit(); return true;
  }
  function setSound(value) {
    enabled = !!value;
    try {localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');} catch {}
    if (enabled) unlockAudio();
    if (!enabled && audio && audio.state === 'running') audio.suspend().catch(() => {});
    if (!enabled) nextNote = 0;
    emit();
  }
  function setMenuMusic(value) {
    menuMusic = !!value;
    if (value) unlockAudio();
    else nextNote = 0;
  }
  function next() {
    if (!suspended && state && advance(state)) { cpuAt = 0; save(); emit(); return true;}
    return false;
  }
  const aiming = () => !!state && !suspended && state.phase === 'aim';
  function down(action, token) {
    if (!aiming() || held.has(token)) return false;
    unlockAudio();
    held.set(token, action);
    if (action === 'throw' && charge === null) {clock = performance.now(); charge = clock; emit();}
    if (action === 'left' || action === 'right') {state.aim = norm(state.aim + (action === 'left' ? -.033 : .033));}
    return true;
  }
  function up(token, cancel = false) {
    const action = held.get(token);
    held.delete(token);
    if (action === 'throw' && charge !== null && ![...held.values()].includes('throw')) {
      clock = performance.now();
      const power = Math.max(.025, powerNow()); charge = null;
      if (!cancel && aiming() && launch(state, power)) {accumulator = 0; cue('throw'); save();}
      emit();
    }
  }
  function aimAt(event) {
    if (!aiming() || !canvas) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const pos = pt((event.clientX - r.left) * W / r.width, (event.clientY - r.top) * H / r.height);
    const player = state.players[state.activePlayer];
    if (dist(pos, player.lie) > 4) {state.aim = norm(angle(player.lie, pos)); save(); emit();}
  }

  const pixel = (g, color, x, y, w, h) => {
    g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  function polygon(g, color, vertices) {
    g.fillStyle = color; g.beginPath();
    vertices.forEach(([x,y], i) => i ? g.lineTo(Math.round(x), Math.round(y)) : g.moveTo(Math.round(x), Math.round(y)));
    g.closePath(); g.fill();
  }
  function seeded(n) {
    let i = n >>> 0;
    return () => {i = (Math.imul(1664525, i) + 1013904223) >>> 0; return i / 4294967296;};
  }
  function fairDistance(course, x, y) {
    let gap = Infinity;
    for (let i = 1; i < course.centerline.length; i++) {
      const [ax,ay] = course.centerline[i-1], [bx,by] = course.centerline[i], dx=bx-ax, dy=by-ay;
      const t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy),0,1);
      gap=Math.min(gap,Math.hypot(x-ax-t*dx,y-ay-t*dy));
    }
    return gap;
  }
  function pine(g, x, y, s, toneId = 0) {
    const R = (c,a,b,w,h) => pixel(g,c,x+a*s,y+b*s,w*s,h*s);
    const c = [
      ['#102d23','#1d4c2c','#32713b','#5b9846','#8aaf51'],
      ['#152d23','#255535','#3e7842','#689a46','#a1b659'],
      ['#202b22','#364a2d','#566437','#7b8644','#b1a758']
    ][toneId % 3];
    R('#172e22',-15,-2,31,4); R('#162d21',-11,1,22,3);
    R('#432c1f',-3,-20,7,21); R('#9b6d3c',-1,-18,3,18); R('#d39953',0,-15,2,11);
    for (const y0 of [-17,-23,-29,-35,-41]) {
      const spread = 4 + (y0+43)*.42;
      const shape = (color,w,v) => polygon(g,color,[[x-w*s,y+(y0+5)*s],[x-w*s,y+(y0+2)*s],[x-(w-4)*s,y+(y0+2)*s],[x-(w-4)*s,y+(y0-2)*s],[x-3*s,y+(y0-6)*s],[x-2*s,y+(y0-10-v)*s],[x+3*s,y+(y0-10-v)*s],[x+6*s,y+(y0-5)*s],[x+(w-4)*s,y+(y0-2)*s],[x+(w-4)*s,y+(y0+2)*s],[x+w*s,y+(y0+2)*s],[x+w*s,y+(y0+5)*s]]);
      shape(c[0],spread+3,1); shape(c[1],spread,0);
      R(c[2],-spread+1,y0,spread+1,3); R(c[3],-spread+4,y0-4,spread-1,3);
      if (toneId !== 2 || y0 < -23) R(c[4],-3,y0-6,3,2);
    }
  }
  function rock(g, x, y, s) {
    polygon(g,'#293b25',[[x-13*s,y+2],[x-11*s,y-3*s],[x-7*s,y-6*s],[x-1*s,y-10*s],[x+7*s,y-9*s],[x+13*s,y-4*s],[x+15*s,y+2]]);
    polygon(g,'#a7a38a',[[x-10*s,y],[x-7*s,y-4*s],[x-2*s,y-8*s],[x+6*s,y-7*s],[x+12*s,y-2*s],[x+10*s,y]]);
    pixel(g,'#d2c6a1',x-6*s,y-5*s,9*s,2*s); pixel(g,'#6c795e',x,y-1*s,12*s,2*s);
  }
  function landscape(course, hole) {
    if (!paint) return;
    const p = course.palette, r = seeded(0x2a31 + hole * 81), g = paint;
    pixel(g,p[0],0,0,W,H);
    for (let y = 0; y < H; y += 4) {
      for (let x = 0; x < W; x += 4) {
        const d = fairDistance(course,x+2,y+2), sway = 5*Math.sin(x*.026)+6*Math.cos(y*.041);
        if (d <= course.width*.5+sway) {
          const stripes = Math.floor((x*.39 + y*.65) / 29) % 2;
          const shade = d > course.width*.42+sway ? p[2] : stripes ? p[3] : p[4];
          pixel(g,shade,x,y,4,4);
        } else if (d <= course.width*.5+20+sway) pixel(g,p[1],x,y,4,4);
        else if (r()<.20) pixel(g,p[1],x,y,4,3);
      }
    }
    for (let i=0;i<2000;i++) {
      const x=Math.floor(r()*W), y=Math.floor(r()*H);
      if(fairDistance(course,x,y)>course.width*.6 || pondAt(course,x,y,3)) continue;
      g.globalAlpha=.15+r()*.38;
      pixel(g,r()<.45?p[1]:p[5],x,y,i%5?2:5,1+(i%3===0));
      if(i%21===0){pixel(g,p[5],x,y-3,2,5);pixel(g,p[5],x+3,y-5,1,4);pixel(g,p[1],x-2,y,7,1);}
      g.globalAlpha=1;
    }
    for (let y=0;y<H;y+=3) for(let x=0;x<W;x+=3) {
      if(pondAt(course,x,y,3)) {
        const deep=pondAt(course,x,y,-4), wet=pondAt(course,x,y,-1);
        pixel(g,deep?'#186264':wet?'#327d75':'#9e7b48',x,y,3,3);
      }
    }
    for(let i=0;i<88;i++){
      const x=r()*W,y=r()*H;
      if(pondAt(course,x,y,-8)){pixel(g,i%3?'#458c82':'#8cb8a1',x,y,4+r()*12,1+(i%2));}
    }
    for(const [x,y,s] of [[225,349,.75],[436,225,.85],[499,74,.70],[374,327,.66],[124,155,.73]]) if(fairDistance(course,x,y)>33&&!pondAt(course,x,y,4)) rock(g,x,y,s);
    const forest=[];
    for(let y=23;y<H+34;y+=29) for(let x=-6;x<W+21;x+=27){
      const px=x+(r()-.5)*19, py=y+(r()-.5)*15, d=fairDistance(course,px,py);
      const teeGap=Math.hypot(px-course.tee.x,py-course.tee.y), pinGap=Math.hypot(px-course.pin.x,py-course.pin.y);
      if (d<course.width*.63 || teeGap<44 || pinGap<49 || pondAt(course,px,py,10) || course.trees.some(([tx,ty])=>Math.hypot(px-tx,py-ty)<24) || r()<.12) continue;
      forest.push([px,py,.42+r()*.46,hole===3 && r()<.74 ? 2 : r()<.5 ? 0 : 1]);
    }
    forest.sort((a,b)=>a[1]-b[1]).forEach(v=>pine(g,...v));
    for(const t of [...course.trees].sort((a,b)=>a[1]-b[1])) pine(g,t[0],t[1],t[2]/14,hole===3?2:hole-1);
    const {x,y}=course.tee;
    polygon(g,'#1b3021',[[x-32,y+13],[x-19,y-15],[x+22,y-15],[x+15,y+17],[x-32,y+17]]);
    polygon(g,'#c9bb84',[[x-29,y+13],[x-17,y-12],[x+19,y-12],[x+12,y+14]]);
    for(let i=0;i<60;i++){
      const dx=r()*33-16,dy=r()*19-9;
      pixel(g,i%2?'#a78653':'#e6cc9a',x+dx,y+dy,1+(i%3===0),1);
    }
    pixel(g,'#dbc17e',x-25,y+15,38,2);
    const bx=course.pin.x,by=course.pin.y;
    for(let row=-5;row<=5;row++) {
      const half=Math.round(26*Math.sqrt(1-(row/5.3)**2));
      pixel(g,row%2?'#8da742':'#94ad48',bx-half,by+row*3,half*2,3);
    }
    pixel(g,'#20372b',bx-22,by+4,45,4);
    drawnCourse = hole;
  }
  function basket(g, x, y, hole, t) {
    const f = (c,tx,ty,w,h)=>pixel(g,c,x+tx,y+ty,w,h);
    const dark='#15231e', steel='#849a8d', cream='#e6e2b3', bright='#fff0bb', flag='#e5a231';
    f(dark,-5,-62,9,67);f(steel,-3,-63,3,63);f(bright,-2,-63,2,62);
    f(dark,-13,-49,26,8);f('#a37b36',-11,-48,22,5);f('#facb55',-10,-48,20,2);
    for(const [xx,j] of [[-9,0],[-5,1],[0,2],[5,3],[9,4]]) {
      for(let k=0;k<18;k+=2) f(k%4===0?cream:steel,xx-xx*k*.043,-41+k,1+(j===2),2);
    }
    f(dark,-14,-28,28,5);f(dark,-12,-23,24,8);f(steel,-12,-27,24,4);f(cream,-11,-27,23,2);
    f(cream,-10,-17,20,2);for(let i=-10;i<=10;i+=5)f(steel,i,-24,2,7);
    const sway=Math.floor((t/280)%3);
    polygon(g,dark,[[x,y-68],[x+22+sway,y-60],[x,y-52]]);
    polygon(g,flag,[[x+2,y-66],[x+18+sway,y-60],[x+2,y-55]]);
    f('#ffd373',2,-65,5,3);
    f(dark,-10,-14,20,8);f('#cbb678',-8,-14,16,6);
    g.font='bold 7px monospace';g.fillStyle=dark;g.textAlign='center';g.fillText(String(hole),Math.round(x),Math.round(y-8));
  }
  function golfer(g,x,y,t,scale=1) {
    const R=(c,xo,yo,w,h)=>pixel(g,c,x+xo*scale,y+yo*scale,w*scale,h*scale);
    const ink='#152922', shirt='#e4d791';
    R('#284b26',-12,-1,24,4);R(ink,-6,-14,13,11);R('#cfb765',-5,-8,3,8);R('#eee0ac',3,-8,3,8);
    R(ink,-8,-30,16,17);R(shirt,-6,-28,12,12);R('#b5b777',-5,-18,10,3);
    R(ink,-7,-42,15,12);R('#c18152',-5,-38,10,8);R('#efb879',-3,-38,7,6);
    R(ink,-7,-43,20,5);R('#f1df99',-5,-42,16,3);
    R(ink,5,-26,13,5);R('#edc684',6,-25,11,2);
    if (!t) {R('#261e1c',-7,-2,7,3);R('#261e1c',2,-2,7,3);}
  }
  const disc = (g,x,y,z,inFlight) => {
    const cy=y-z*.64;
    if(z>2){pixel(g,'rgba(15,34,27,.48)',x-6,y,12,2);pixel(g,'rgba(15,34,27,.30)',x-3,y-1,6,4);}
    pixel(g,'#2a2218',x-7,cy-3,14,7);
    pixel(g,'#2a2218',x-5,cy-5,10,10);
    pixel(g,'#e96c27',x-6,cy-2,12,5);
    pixel(g,'#ffb442',x-5,cy-3,10,4);
    pixel(g,'#ffe298',x-3,cy-3,inFlight?5:4,2);
    pixel(g,'#f7db89',x-6,cy,12,1);
  };
  function directionGuide(g, course, p, aim, power) {
    const sim = newFlight(p.lie, aim, power);
    let last=sim.origin;
    for(let i=0; i<128; i++){
      const end=throwStep(course,sim);
      if (i%4===1) {
        g.globalAlpha=.86;
        pixel(g,'#ffd070',sim.x-1.5,sim.y-sim.height*.35-1.5,3,3);
        last=pt(sim.x,sim.y-sim.height*.35);
      }
      if(end || dist(sim,p.lie)>150) break;
    }
    g.globalAlpha=1;
    const d=12, back=-6;
    polygon(g,'#f0be60',[[last.x+Math.cos(aim)*d,last.y+Math.sin(aim)*d],[last.x+Math.cos(aim)*back-Math.sin(aim)*5,last.y+Math.sin(aim)*back+Math.cos(aim)*5],[last.x+Math.cos(aim)*back+Math.sin(aim)*5,last.y+Math.sin(aim)*back-Math.cos(aim)*5]]);
  }
  function render(t) {
    if (!context || !paint || !canvas || !canvas.getClientRects().length) return;
    const h=state?.hole || 1, course=COURSES[h-1];
    if (drawnCourse!==h) landscape(course,h);
    const g=context;
    g.imageSmoothingEnabled=false;g.drawImage(back,0,0,canvas.width,canvas.height);
    const p=state?.players[state.activePlayer], lie=p?.lie || course.tee;
    if (aiming() || !state) directionGuide(g,course,{lie},state?.aim ?? angle(lie,course.pin),charge!==null?Math.max(.2,powerNow()):.68);
    if (lie.y <= course.pin.y) {
      if (state?.phase !== 'finished' && state?.phase !== 'holeComplete') golfer(g,lie.x-15,lie.y+5,false,.92);
      basket(g,course.pin.x,course.pin.y,h,t);
    } else {
      basket(g,course.pin.x,course.pin.y,h,t);
      if (state?.phase !== 'finished' && state?.phase !== 'holeComplete') golfer(g,lie.x-15,lie.y+5,false,.92);
    }
    if(state?.flight) disc(g,state.flight.x,state.flight.y,state.flight.height,true);
    else if(state?.phase !== 'finished' && state?.phase !== 'holeComplete') disc(g,lie.x,lie.y-18,0,false);
    for(let i=0;i<5;i++) {
      const color=i===h-1?'#f3c068':'#263b31';
      if(i<COURSES.length)pixel(g,color,21+i*10,19,7,3);
    }
    g.font='bold 11px monospace';g.textAlign='left';
    const subtitle=course.name.toUpperCase();
    pixel(g,'rgba(10,28,22,.78)',18,26,Math.max(83, subtitle.length*7+10),17);
    g.fillStyle='#f0d599';g.fillText(subtitle,23,38);
  }

  function raf(t) {
    clock=t;
    const delta=lastTime?Math.min(.072,(t-lastTime)/1000):0;
    lastTime=t;
    if(state && !suspended && !document.hidden) {
      if(aiming()) {
        const v=[...held.values()], steer=Number(v.includes('right'))-Number(v.includes('left'));
        if(steer) state.aim=norm(state.aim+steer*1.45*delta);
        if(charge!==null && t-statusAt>55) {statusAt=t;emit();}
      }
      if (state.phase==='cpuTurn') {
        if(!cpuAt)cpuAt=t+550;
        if(t>=cpuAt){
          const pick=chooseOpponent(courseFor(state),state.players[state.activePlayer]);
          cpuAt=0; launch(state,pick.power,pick.aim); accumulator=0; cue('throw'); save(); emit();
        }
      }
      if(state.phase==='flight') {
        accumulator+=delta;
        while(accumulator>=STEP) {
          accumulator-=STEP;
          const hit=tickFlight(state);
          if(hit){
            accumulator=0;cue(hit.kind);
            if(state.phase==='finished')cue('finish');
            save();emit();break;
          }
        }
      }
    }
    render(t);playMusic();requestAnimationFrame(raf);
  }
  const keyActions = {ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right', Space:'throw'};
  function editable(node) {return !!(node && (node.matches?.('input,textarea,select,[contenteditable="true"]') || node.isContentEditable));}
  document.addEventListener('keydown', e=>{
    const action=keyActions[e.code];
    if(!action || editable(e.target) || e.metaKey || e.ctrlKey || e.altKey || !aiming())return;
    e.preventDefault();if(!e.repeat)down(action,'key:'+e.code);
  });
  document.addEventListener('keyup', e=>{
    if(held.has('key:'+e.code)){e.preventDefault();up('key:'+e.code);}
  });
  window.addEventListener('blur',()=>{const cancelled=charge!==null;cancelControls();if(cancelled)emit();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){const cancelled=charge!==null;cancelControls();if(cancelled)emit();}lastTime=0;});
  for(const button of document.querySelectorAll('[data-control]')){
    const action=button.dataset.control;
    if(!['left','right','throw'].includes(action))continue;
    button.addEventListener('pointerdown',e=>{
      if(e.button!==0 || !down(action,'p:'+e.pointerId))return;
      e.preventDefault();try{button.setPointerCapture(e.pointerId);}catch{}
    });
    button.addEventListener('pointerup',e=>up('p:'+e.pointerId));
    button.addEventListener('pointercancel',e=>up('p:'+e.pointerId,true));
    button.addEventListener('lostpointercapture',e=>{if(held.has('p:'+e.pointerId))up('p:'+e.pointerId,true);});
    button.addEventListener('click',e=>{
      if(e.detail!==0 || !aiming())return;
      // Assistive activation/Enter produces a controlled mid-power throw.
      if(action==='throw'){unlockAudio();if(launch(state,.48)){accumulator=0;cue('throw');save();emit();}}
      else {down(action,'accessible');up('accessible');}
    });
  }
  canvas?.addEventListener('pointerdown', e=>{
    if(e.button!==0 || !aiming())return;
    e.preventDefault(); unlockAudio(); touchAim=e.pointerId; aimAt(e);
    try{canvas.setPointerCapture(e.pointerId);}catch{}
  });
  canvas?.addEventListener('pointermove', e=>{if(touchAim===e.pointerId)aimAt(e);});
  for(const type of ['pointerup','pointercancel','lostpointercapture']) canvas?.addEventListener(type,e=>{if(touchAim===e.pointerId)touchAim=null;});

  window.Frisbee = {
    start, resume, pause, next, snapshot, setSound, setMenuMusic, hasSave:()=>!!readSave(),
    onChange(cb) {listeners.add(cb);cb(snapshot());return ()=>listeners.delete(cb);}
  };
  requestAnimationFrame(raf);
})();
