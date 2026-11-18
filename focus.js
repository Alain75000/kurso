/* Focus : minuteur Pomodoro relié aux matières */
(() => {
  const K = Kurso, S = K.study, { h } = K;
  const $ = id => document.getElementById(id);
  const KEY = 'kurso.focus';

  const MODES = {
    pomodoro: { label: 'Pomodoro (25 min + 5 min)', work: 25, brk: 5 },
    court: { label: 'Court (15 min + 3 min)', work: 15, brk: 3 },
    long: { label: 'Long (50 min + 10 min)', work: 50, brk: 10 },
    libre: { label: 'Durée libre', work: 30, brk: 5 }
  };

  const def = { mode: 'pomodoro', phase: 'work', status: 'idle', total: 0, endsAt: 0, remaining: 0, subjectId: '', cycles: 0, custom: 30, day: K.today() };
  let st = { ...def, ...S.ls.get(KEY, {}) };
  if (st.day !== K.today()) { st.cycles = 0; st.day = K.today(); }
  const save = () => S.ls.set(KEY, st);

  const workMin = () => (st.mode === 'libre' ? Math.max(1, Math.min(240, +st.custom || 30)) : MODES[st.mode].work);
  const phaseMs = () => (st.phase === 'work' ? workMin() : MODES[st.mode].brk) * 60000;
  const remainingMs = () => st.status === 'running' ? Math.max(0, st.endsAt - Date.now()) : st.status === 'paused' ? st.remaining : phaseMs();
  const totalMs = () => (st.status === 'idle' ? phaseMs() : st.total);

  /* ---------- Son de fin ---------- */
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.28, 0.56].forEach(t => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.25);
      });
      setTimeout(() => ctx.close(), 1500);
    } catch (e) { /* pas de son possible */ }
  }

  /* ---------- Actions ---------- */
  function start() {
    if (st.status === 'idle') { st.total = phaseMs(); st.endsAt = Date.now() + st.total; }
    else st.endsAt = Date.now() + st.remaining;
    st.status = 'running';
    save(); render();
  }
  function pause() { st.remaining = remainingMs(); st.status = 'paused'; save(); render(); }
  function reset() { st.status = 'idle'; st.phase = 'work'; save(); render(); }

  function complete() {
    if (st.phase === 'work') {
      S.Sessions.add(st.subjectId, Math.round(st.total / 60000));
      st.cycles++;
      st.phase = 'break';
      K.toast('Séance terminée ! Prends une pause.');
    } else {
      st.phase = 'work';
      K.toast('Pause terminée, on reprend.');
    }
    st.status = 'idle';
    save(); beep(); render(); renderStats();
  }

  function finishEarly() {
    const mins = Math.floor((totalMs() - remainingMs()) / 60000);
    if (mins >= 1) { S.Sessions.add(st.subjectId, mins); K.toast(`${mins} min enregistrée${mins > 1 ? 's' : ''}.`); }
    else K.toast('Moins d’une minute : rien d’enregistré.');
    st.status = 'idle'; st.phase = 'work';
    save(); render(); renderStats();
  }

  /* ---------- Affichage ---------- */
  const fmt = ms => { const s = Math.ceil(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

  function tick() {
    if (st.status === 'running' && remainingMs() <= 0) { complete(); return; }
    const rem = remainingMs();
    $('time').textContent = fmt(rem);
    $('bar').style.width = (100 - Math.round(100 * rem / (totalMs() || 1))) + '%';
    document.title = (st.status === 'running' ? fmt(rem) + ' · ' : '') + 'Kurso – Focus';
  }

  function render() {
    const running = st.status === 'running';
    $('phase').textContent = (st.phase === 'work' ? 'Travail' : 'Pause') + (st.status === 'paused' ? ' (en pause)' : '');
    $('phase').dataset.phase = st.phase;
    $('go').textContent = running ? 'Mettre en pause' : st.status === 'paused' ? 'Reprendre' : st.phase === 'work' ? 'Démarrer' : 'Démarrer la pause';
    $('finish').hidden = !(st.phase === 'work' && st.status !== 'idle');
    $('mode').disabled = st.status !== 'idle';
    $('custom').disabled = st.status !== 'idle';
    $('custom-wrap').hidden = st.mode !== 'libre';
    $('cycles').textContent = st.status !== 'idle' && st.phase === 'work' ? 'Séance en cours : reste concentré.' : st.cycles ? `Séances terminées aujourd’hui : ${st.cycles}` : 'Choisis une matière puis lance une séance.';
    tick();
  }

  /* ---------- Statistiques ---------- */
  function renderStats() {
    const today = S.Activity.day();
    const week = S.Activity.lastDays(7);
    const weekMin = week.reduce((a, d) => a + (d.minutes || 0), 0);
    const tile = (n, l) => h('div', { class: 'tile' }, h('p', { class: 'tile__n' }, n), h('p', { class: 'tile__l' }, l));
    $('f-tiles').replaceChildren(
      tile(S.fmtMinutes(today.minutes || 0), 'aujourd’hui'),
      tile(S.fmtMinutes(weekMin), 'sur 7 jours'),
      tile(K.plural(S.Activity.streak(), 'jour'), 'de série'),
      tile(String(S.Sessions.since(7).length), 'séances sur 7 jours'));

    $('f-chart').replaceChildren(S.barChart(week.map(d => ({ label: S.weekday(d.date), value: d.minutes || 0, title: `${K.fmtDate(d.date)} : ${S.fmtMinutes(d.minutes || 0)}`, today: d.date === K.today() })), 'min'));

    const by = new Map();
    S.Sessions.since(7).forEach(s => by.set(s.subjectId, (by.get(s.subjectId) || 0) + s.minutes));
    const rows = [...by.entries()].sort((a, b) => b[1] - a[1]);
    const max = rows.length ? rows[0][1] : 1;
    $('f-subjects').replaceChildren(rows.length
      ? h('div', { class: 'hbars' }, rows.map(([id, m]) => {
          const s = K.subjects.get(id);
          return h('div', { class: 'hbar' },
            h('span', { class: 'hbar__name' }, K.dot(s), s.name),
            h('span', { class: 'hbar__track' }, h('span', { style: `width:${Math.round(100 * m / max)}%;background:${s.color}` })),
            h('span', { class: 'hbar__val' }, S.fmtMinutes(m)));
        }))
      : h('p', { class: 'note' }, 'Aucune séance cette semaine.'));
  }

  /* ---------- Initialisation ---------- */
  $('mode').replaceChildren(...Object.entries(MODES).map(([k, m]) => h('option', { value: k, selected: k === st.mode }, m.label)));
  $('f-subject').replaceChildren(h('option', { value: '' }, 'Sans matière'), ...K.subjects.list().map(s => h('option', { value: s.id, selected: s.id === st.subjectId }, s.name)));
  $('custom').value = String(st.custom);

  $('mode').addEventListener('change', e => { st.mode = e.target.value; save(); render(); });
  $('f-subject').addEventListener('change', e => { st.subjectId = e.target.value; save(); });
  $('custom').addEventListener('input', e => { st.custom = Math.max(1, Math.min(240, +e.target.value || 30)); save(); render(); });
  $('go').addEventListener('click', () => (st.status === 'running' ? pause() : start()));
  $('reset').addEventListener('click', reset);
  $('finish').addEventListener('click', finishEarly);
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !e.target.closest('input, textarea, select, button, a')) { e.preventDefault(); $('go').click(); }
  });

  /* Si le minuteur est arrivé à zéro pendant que la page était fermée */
  if (st.status === 'running' && remainingMs() <= 0) complete(); else render();
  renderStats();
  setInterval(tick, 250);
})();
