/* Mes cours : recherche, filtres, tri, popup d’informations */
(() => {
  const K = Kurso, { h } = K;
  const $ = id => document.getElementById(id);
  const startSubject = K.params().get('matiere');
  const state = { q: '', subject: startSubject === null ? 'all' : startSubject, ext: 'all', mastery: 'all', fav: false, sort: 'recent' };
  let courses = [];

  const sorters = {
    recent: (a, b) => b.addedAt - a.addedAt,
    date: (a, b) => (b.date || '').localeCompare(a.date || ''),
    title: (a, b) => a.title.localeCompare(b.title, 'fr'),
    subject: (a, b) => K.subjects.get(a.subjectId).name.localeCompare(K.subjects.get(b.subjectId).name, 'fr') || a.title.localeCompare(b.title, 'fr')
  };

  async function open(rec) {
    const r = await K.courseDialog({ record: rec });
    if (r.action === 'saved') K.toast('Modifications enregistrées.');
    if (r.action === 'deleted') K.toast('Cours supprimé.');
    if (r.action === 'saved' || r.action === 'deleted') load();
  }

  function render() {
    K.chips($('chips'), K.subjectItems(courses, state.subject), state.subject, id => { state.subject = id; render(); });
    const q = K.norm(state.q);
    const rows = courses
      .filter(c => K.matchSubject(c, state.subject)
        && (state.ext === 'all' || c.ext === state.ext)
        && (state.mastery === 'all' || (c.mastery || 'todo') === state.mastery)
        && (!state.fav || c.fav)
        && (!q || K.norm([c.title, c.chapter, c.description, c.name].join(' ')).includes(q)))
      .sort(sorters[state.sort]);

    $('count').textContent = K.plural(rows.length, 'cours', 'cours');
    if (rows.length) {
      $('list').replaceChildren(h('div', { class: 'list' }, rows.map(c => K.courseRow(c, open))));
    } else {
      $('list').replaceChildren(courses.length
        ? h('div', { class: 'empty' }, 'Aucun cours ne correspond à ces filtres.')
        : h('div', { class: 'empty' }, 'Ta bibliothèque est vide. ', h('a', { href: 'importer.html' }, 'Importe ton premier cours')));
    }
  }

  async function load() {
    try { courses = await K.db.all('courses'); }
    catch (e) { K.toast('Le stockage du navigateur est indisponible.'); }
    render();
  }

  $('search').addEventListener('input', e => { state.q = e.target.value; render(); });
  $('filter-ext').addEventListener('change', e => { state.ext = e.target.value; render(); });
  $('filter-mastery').addEventListener('change', e => { state.mastery = e.target.value; render(); });
  $('filter-fav').addEventListener('change', e => { state.fav = e.target.checked; render(); });
  $('sort').addEventListener('change', e => { state.sort = e.target.value; render(); });
  load();
})();
