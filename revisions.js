/* Révisions : liste des fiches et création d’une nouvelle fiche */
(() => {
  const K = Kurso, { h } = K;
  const $ = id => document.getElementById(id);
  let fiches = [], courses = [], active = 'all', query = '';
  const text = f => K.norm([f.title, ...f.points, ...f.defs.flatMap(d => [d.t, d.d]), ...f.qas.flatMap(q => [q.q, q.a])].join(' '));

  async function load() {
    try { [fiches, courses] = await Promise.all([K.db.all('fiches'), K.db.all('courses')]); }
    catch (e) { K.toast('Le stockage du navigateur est indisponible.'); }
    render();
  }

  function render() {
    K.chips($('chips'), K.subjectItems(fiches, active), active, id => { active = id; render(); });
    const q = K.norm(query).trim();
    const rows = fiches.filter(f => K.matchSubject(f, active) && (!q || text(f).includes(q))).sort((a, b) => b.updatedAt - a.updatedAt);
    if (!rows.length) {
      $('fiches').replaceChildren(h('div', { class: 'empty' },
        fiches.length ? 'Aucune fiche ne correspond.' : 'Aucune fiche pour l’instant. Utilise « Nouvelle fiche » pour commencer.'));
      return;
    }
    $('fiches').replaceChildren(h('div', { class: 'grid' }, rows.map(f => {
      const s = K.subjects.get(f.subjectId);
      return h('a', { class: 'fiche', href: 'fiche.html?id=' + f.id },
        h('span', { class: 'fiche__subject' }, K.dot(s), s.name),
        h('span', { class: 'fiche__title' }, f.title),
        h('span', { class: 'fiche__stats' },
          `${K.plural(f.points.length, 'point clé', 'points clés')}, ${K.plural(f.defs.length, 'définition')}, ${K.plural(f.qas.length, 'question')}`),
        K.study.ficheStats(f).due ? h('span', { class: 'fiche__stats fiche__due', style: 'margin-top:0' }, K.plural(K.study.ficheStats(f).due, 'carte') + ' à réviser') : null,
        h('span', { class: 'fiche__stats', style: 'margin-top:0' }, 'Modifiée le ' + K.fmtDate(f.updatedAt)));
    })));
  }

  function openNew(preCourse) {
    const { dlg, body } = K.makeDialog({ title: 'Nouvelle fiche de révision', size: 'md' });
    const byDate = courses.slice().sort((a, b) => b.addedAt - a.addedAt);

    const title = h('input', { class: 'input', type: 'text', maxlength: '120', autocomplete: 'off', placeholder: 'Ex. Les fonctions affines' });
    const subject = h('select', { class: 'select' },
      h('option', { value: '' }, 'Sans matière'),
      K.subjects.list().map(s => h('option', { value: s.id }, s.name)));
    const course = h('select', { class: 'select' },
      h('option', { value: '' }, 'Aucun, fiche vierge'),
      byDate.map(c => h('option', { value: c.id }, `${c.title} (${c.ext.toUpperCase()})`)));
    const auto = h('input', { type: 'checkbox', checked: true });
    const autoRow = h('label', { class: 'check', hidden: true }, auto, h('span', {}, 'Pré-remplir la fiche avec le texte de ce cours'));
    const hint = h('p', { class: 'note note--block' }, 'Un cours PDF ou PNG reste consultable depuis la fiche. Seul un fichier texte (.txt) peut pré-remplir la fiche automatiquement.');
    const error = h('p', { class: 'msg--error', role: 'alert', hidden: true });
    const create = h('button', { class: 'btn btn--sm', type: 'submit' }, 'Créer la fiche');

    const current = () => byDate.find(c => c.id === course.value);
    course.addEventListener('change', () => {
      const c = current();
      if (c) subject.value = [...subject.options].some(o => o.value === c.subjectId) ? c.subjectId : '';
      autoRow.hidden = !(c && c.ext === 'txt');
      title.placeholder = c ? c.title : 'Ex. Les fonctions affines';
    });
    if (preCourse) { course.value = preCourse.id; course.dispatchEvent(new Event('change')); }

    const form = h('form', { class: 'dlg__form' },
      K.field('Cours à réviser', course),
      autoRow,
      K.field('Titre de la fiche', title),
      K.field('Matière', subject),
      hint, error,
      h('div', { class: 'dlg__actions' },
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => dlg.close() }, 'Annuler'),
        create));

    form.addEventListener('submit', async e => {
      e.preventDefault();
      create.disabled = true;
      const c = current();
      let content = { points: [], defs: [], qas: [] };
      try {
        if (c && c.ext === 'txt' && auto.checked) content = K.extractFiche(await c.blob.text());
        const now = Date.now();
        const f = {
          id: K.uid(), title: title.value.trim() || (c ? c.title : 'Nouvelle fiche'),
          subjectId: subject.value, courseId: c ? c.id : '', createdAt: now, updatedAt: now, ...content
        };
        await K.db.put('fiches', f);
        location.href = 'fiche.html?id=' + f.id;
      } catch (err) {
        create.disabled = false;
        error.textContent = 'Création impossible : le stockage du navigateur ne répond pas.';
        error.hidden = false;
      }
    });

    body.append(form);
    K.showDialog(dlg);
    course.focus();
  }

  $('search').addEventListener('input', e => { query = e.target.value; render(); });
  $('new-fiche').addEventListener('click', () => openNew(null));
  load().then(() => {
    const id = K.params().get('cours');
    const c = id && courses.find(x => x.id === id);
    if (c) openNew(c);
  });
})();
