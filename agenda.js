/* Agenda : devoirs, contrôles et examens avec compte à rebours */
(() => {
  const K = Kurso, S = K.study, { h } = K;
  const $ = id => document.getElementById(id);
  let fiches = [];
  let showDone = false;

  const typeSel = $('t-type'), subjSel = $('t-subject'), ficheSel = $('t-fiche'), title = $('t-title'), date = $('t-date');
  typeSel.replaceChildren(...Object.entries(S.TASK_TYPES).map(([k, v]) => h('option', { value: k }, v)));
  subjSel.replaceChildren(h('option', { value: '' }, 'Sans matière'), ...K.subjects.list().map(s => h('option', { value: s.id }, s.name)));
  date.value = S.addDays(K.today(), 7);

  /* Pré-remplissage depuis une fiche de cours (?matiere=…&titre=…) */
  const p = K.params();
  if (p.get('titre')) { title.value = 'Contrôle : ' + p.get('titre'); typeSel.value = 'controle'; }
  if (p.get('matiere') && [...subjSel.options].some(o => o.value === p.get('matiere'))) subjSel.value = p.get('matiere');

  function fillFiches() {
    const sid = subjSel.value;
    const cur = ficheSel.value;
    const list = fiches.slice().sort((a, b) => (a.subjectId === sid ? 0 : 1) - (b.subjectId === sid ? 0 : 1) || a.title.localeCompare(b.title, 'fr'));
    ficheSel.replaceChildren(h('option', { value: '' }, 'Aucune'), ...list.map(f => h('option', { value: f.id }, f.title)));
    if ([...ficheSel.options].some(o => o.value === cur)) ficheSel.value = cur;
  }
  subjSel.addEventListener('change', fillFiches);

  $('task-form').addEventListener('submit', e => {
    e.preventDefault();
    const t = title.value.trim();
    if (!t || !date.value) return;
    S.Tasks.add({ title: t, type: typeSel.value, subjectId: subjSel.value, ficheId: ficheSel.value, date: date.value });
    title.value = '';
    K.toast('Ajouté à l’agenda.');
    render();
    title.focus();
  });
  $('show-done').addEventListener('change', e => { showDone = e.target.checked; render(); });

  const GROUPS = [
    ['late', 'En retard', t => S.Tasks.daysLeft(t) < 0],
    ['today', 'Aujourd’hui', t => S.Tasks.daysLeft(t) === 0],
    ['week', 'Cette semaine', t => { const d = S.Tasks.daysLeft(t); return d > 0 && d <= 7; }],
    ['later', 'Plus tard', t => S.Tasks.daysLeft(t) > 7]
  ];

  function taskRow(t) {
    const s = K.subjects.get(t.subjectId);
    const f = t.ficheId && fiches.find(x => x.id === t.ficheId);
    const d = S.Tasks.daysLeft(t);
    const check = h('input', { type: 'checkbox', checked: t.done, 'aria-label': 'Marquer comme terminé : ' + t.title });
    check.addEventListener('change', () => { S.Tasks.update(t.id, { done: check.checked, doneAt: check.checked ? Date.now() : null }); render(); });
    return h('div', { class: 'task' + (t.done ? ' is-done' : '') + (!t.done && d < 0 ? ' is-late' : '') },
      h('label', { class: 'task__check' }, check),
      h('div', { class: 'task__main' },
        h('span', { class: 'task__title' }, t.title),
        h('span', { class: 'row__sub' },
          h('span', { class: 'tag tag--type tag--' + t.type }, S.TASK_TYPES[t.type] || 'Autre'),
          K.dot(s), s.name,
          ' · ' + K.fmtDate(t.date),
          f ? h('a', { class: 'task__link', href: 'fiche.html?id=' + f.id }, 'Réviser : ' + f.title) : null)),
      h('span', { class: 'task__count' }, t.done ? 'Terminé' : S.Tasks.countdown(t)),
      h('button', {
        class: 'x', type: 'button', 'aria-label': 'Supprimer : ' + t.title,
        onclick: async () => { if (await K.confirmBox(`Supprimer « ${t.title} » de l’agenda ?`)) { S.Tasks.remove(t.id); render(); } }
      }, '×'));
  }

  function render() {
    const all = S.Tasks.all();
    const open = all.filter(t => !t.done).sort((a, b) => a.date.localeCompare(b.date));
    const done = all.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const out = [];
    GROUPS.forEach(([id, label, test]) => {
      const rows = open.filter(test);
      if (rows.length) out.push(h('section', { class: 'block' }, h('h2', { class: 'section-title' }, label), h('div', { class: 'list' }, rows.map(taskRow))));
    });
    if (showDone && done.length) out.push(h('section', { class: 'block' }, h('h2', { class: 'section-title' }, 'Terminées'), h('div', { class: 'list' }, done.map(taskRow))));
    if (!out.length) out.push(h('div', { class: 'empty' }, all.length && !showDone ? 'Tout est fait, bravo ! Les tâches terminées sont masquées.' : 'Ton agenda est vide. Ajoute ton prochain devoir ou contrôle ci-dessus.'));
    $('tasks').replaceChildren(...out);
  }

  (async () => {
    try { fiches = await K.db.all('fiches'); } catch (e) { /* ignoré */ }
    fillFiches();
    render();
  })();
})();
